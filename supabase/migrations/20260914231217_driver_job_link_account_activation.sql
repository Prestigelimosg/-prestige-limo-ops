-- Local candidate only. Existing ACK, account, Calendar and reporting writers are unchanged.
alter table public.driver_account_enrollments
  alter column driver_id drop not null,
  add column activation_device_hash text,
  add column activation_setup_hash text,
  add column activation_driver_id bigint,
  add constraint driver_account_enrollments_activation_check check (
    (activation_device_hash is null and activation_setup_hash is null and driver_id is not null)
    or (activation_device_hash is not null and activation_setup_hash is not null
      and activation_device_hash ~ '^[a-f0-9]{64}$' and activation_setup_hash ~ '^[a-f0-9]{64}$')
  );
create unique index driver_account_enrollments_activation_device_key
  on public.driver_account_enrollments(activation_device_hash) where activation_device_hash is not null;

create function public.driver_job_account_activation(
  p_action text, p_token_hash text, p_device_hash text, p_setup_hash text,
  p_email text default null, p_auth_user_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  l public.driver_job_links; b public.bookings; e public.driver_account_enrollments;
  d public.drivers; a public.driver_access_accounts; ref text; terminal text;
begin
  if coalesce(p_action,'') not in ('claim','record_auth','resume')
    or coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_device_hash,'') !~ '^[a-f0-9]{64}$'
    or coalesce(p_setup_hash,'') !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('ok',false,'reason','invalid_input');
  end if;
  select booking_reference into ref from public.driver_job_links where token_hash=p_token_hash;
  select * into b from public.bookings where booking_reference=ref for update;
  if not found then return jsonb_build_object('ok',false,'reason','invalid_link'); end if;
  select * into l from public.driver_job_links where token_hash=p_token_hash for update;
  if not found or l.link_status<>'active' or l.revoked_at is not null
    or l.expires_at is null or l.expires_at<=clock_timestamp() or l.expires_at>clock_timestamp()+interval '96 hours' then
    return jsonb_build_object('ok',false,'reason','invalid_link');
  end if;
  foreach terminal in array array[to_jsonb(b)->>'status',to_jsonb(b)->>'admin_internal_status',to_jsonb(b)->>'customer_facing_status'] loop
    if lower(coalesce(terminal,'')) in ('archived','cancelled','canceled','complete','completed','declined','declined_internal','history','job completed','job_completed') then
      return jsonb_build_object('ok',false,'reason','invalid_link');
    end if;
  end loop;
  -- Never infer identity from email, name, contact, plate or an unrelated link.
  if l.driver_id is not null and l.driver_id is distinct from b.driver_id then
    return jsonb_build_object('ok',false,'reason','assignment_changed');
  end if;
  if l.driver_id is not null then
    select * into d from public.drivers where id=l.driver_id for update;
    if not found or lower(coalesce(d.availability_status,'')) in ('inactive','suspended') then
      return jsonb_build_object('ok',false,'reason','assignment_changed');
    end if;
  end if;
  select * into e from public.driver_account_enrollments where driver_job_link_id=l.id for update;
  if p_action='claim' and e.id is null then
    if p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254
      or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      return jsonb_build_object('ok',false,'reason','invalid_input');
    end if;
    if exists(select 1 from public.driver_access_accounts where active_device_id_hash=p_device_hash
      or (l.driver_id is not null and driver_reference=l.driver_id::text)) then
      return jsonb_build_object('ok',false,'reason','account_exists');
    end if;
    begin
      insert into public.driver_account_enrollments(driver_job_link_id,driver_id,email_normalized,enrollment_status,
        activation_device_hash,activation_setup_hash,activation_driver_id)
      values(l.id,l.driver_id,p_email,'reserved',p_device_hash,p_setup_hash,l.driver_id) returning * into e;
    exception when unique_violation then
      return jsonb_build_object('ok',false,'reason','account_exists');
    end;
    return jsonb_build_object('ok',true,'create_auth',true,'enrollment_id',e.id,'email',e.email_normalized);
  end if;
  if e.id is null or e.activation_device_hash is distinct from p_device_hash
    or e.activation_setup_hash is distinct from p_setup_hash then
    return jsonb_build_object('ok',false,'reason','activation_unavailable');
  end if;
  if e.enrollment_status not in ('reserved','consumed') then
    return jsonb_build_object('ok',false,'reason','activation_unavailable');
  end if;
  if e.activation_driver_id is not null and e.activation_driver_id is distinct from l.driver_id then
    return jsonb_build_object('ok',false,'reason','assignment_changed');
  end if;
  if p_action='record_auth' then
    if p_auth_user_id is null or e.enrollment_status<>'reserved' or e.auth_user_id is not null then
      return jsonb_build_object('ok',false,'reason','review_required');
    end if;
    update public.driver_account_enrollments set auth_user_id=p_auth_user_id,updated_at=clock_timestamp()
      where id=e.id returning * into e;
  end if;
  if e.auth_user_id is null then
    -- An uncertain provider attempt is never repeated automatically.
    return jsonb_build_object('ok',false,'reason','review_required');
  end if;
  if l.driver_id is null then
    return jsonb_build_object('ok',true,'activated',true,'scope','this_job');
  end if;
  select * into a from public.driver_access_accounts where auth_user_id=e.auth_user_id for update;
  if e.enrollment_status='consumed' then
    if a.id is null or a.account_status<>'active' or a.driver_reference<>l.driver_id::text
      or a.active_device_id_hash is distinct from p_device_hash then
      return jsonb_build_object('ok',false,'reason','activation_unavailable');
    end if;
  else
    if exists(select 1 from public.driver_access_accounts where driver_reference=l.driver_id::text
      or active_device_id_hash=p_device_hash or auth_user_id=e.auth_user_id) then
      return jsonb_build_object('ok',false,'reason','account_exists');
    end if;
    begin
      insert into public.driver_access_accounts(auth_user_id,driver_reference,account_status,auth_provider,
        safe_display_label,source_surface,source_driver_job_link_id,active_device_id_hash,device_bound_at)
      values(e.auth_user_id,l.driver_id::text,'active','supabase_auth',coalesce(nullif(left(d.driver_name,160),''),'Driver'),
        'system',l.id,p_device_hash,clock_timestamp()) returning * into a;
      update public.driver_account_enrollments set driver_id=l.driver_id,enrollment_status='consumed',
        consumed_at=clock_timestamp(),updated_at=clock_timestamp() where id=e.id;
    exception when unique_violation then
      return jsonb_build_object('ok',false,'reason','account_exists');
    end;
  end if;
  return jsonb_build_object('ok',true,'activated',true,'scope','account','account_id',a.id,'driver_id',l.driver_id);
end $$;
revoke all on function public.driver_job_account_activation(text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.driver_job_account_activation(text,text,text,text,text,uuid) to service_role;
