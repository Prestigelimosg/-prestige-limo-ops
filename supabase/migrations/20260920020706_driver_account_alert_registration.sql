-- Account-session callers may omit a current job; active account and bound-phone proof remain mandatory.
-- Execute remains service-role only. Legacy non-null links retain their ACK/expiry checks.
-- No account or device binding changes. Only the proven current installation may replace native tokens.
create or replace function public.register_driver_native_push_installation(
  p_driver_id bigint, p_link_id uuid, p_device_id_hash text, p_endpoint text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.driver_access_accounts%rowtype;
begin
  if p_driver_id is null or p_driver_id <= 0 or p_device_id_hash is null
    or p_device_id_hash !~ '^[0-9a-f]{64}$' or p_endpoint is null
    or p_endpoint !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then
    return jsonb_build_object('registered',false);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('driver-native-registration:'||p_driver_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('driver-native-endpoint:'||p_endpoint,0));
  select * into a from public.driver_access_accounts
    where driver_reference=p_driver_id::text and account_status='active' for update;
  if not found or a.active_device_id_hash is distinct from p_device_id_hash then
    return jsonb_build_object('registered',false);
  end if;
  if p_link_id is not null and not exists (select 1 from public.driver_job_links where id=p_link_id and driver_id=p_driver_id
      and link_status='active' and revoked_at is null and expires_at>now()
      and nullif(safe_link_context->>'driver_acknowledged_at','') is not null) then
    return jsonb_build_object('registered',false);
  end if;
  if exists (select 1 from public.driver_device_push_subscriptions where endpoint=p_endpoint
      and (driver_id is distinct from p_driver_id or source_surface <> 'driver_native_ios')) then
    return jsonb_build_object('registered',false);
  end if;
  insert into public.driver_device_push_subscriptions
    (driver_id,endpoint,p256dh,auth,last_driver_job_link_id,revoked_at,source_surface,subscription_status,updated_at)
  values (p_driver_id,p_endpoint,'native_expo_push_token','native_expo_push_token',p_link_id,null,'driver_native_ios','active',now())
  on conflict(endpoint) do update set last_driver_job_link_id=coalesce(excluded.last_driver_job_link_id, public.driver_device_push_subscriptions.last_driver_job_link_id),
    revoked_at=null,subscription_status='active',updated_at=now()
    where public.driver_device_push_subscriptions.driver_id=excluded.driver_id
      and public.driver_device_push_subscriptions.source_surface='driver_native_ios';
  if not found then raise exception 'Native registration ownership changed'; end if;
  update public.driver_device_push_subscriptions set subscription_status='revoked',revoked_at=now(),updated_at=now()
    where driver_id=p_driver_id and source_surface='driver_native_ios'
      and endpoint<>p_endpoint and subscription_status='active' and revoked_at is null;
  return jsonb_build_object('registered',true);
end;
$$;
revoke all on function public.register_driver_native_push_installation(bigint,uuid,text,text) from public,anon,authenticated;
grant execute on function public.register_driver_native_push_installation(bigint,uuid,text,text) to service_role;
