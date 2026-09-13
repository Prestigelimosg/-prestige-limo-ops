-- Additive same-account, same-installation PIN recovery. No account or binding backfill.
alter table public.driver_access_accounts
  add column pin_reset_state text check (pin_reset_state in ('ready','claimed','complete')),
  add column pin_reset_claim_id uuid,
  add column pin_reset_device_hash text,
  add column pin_reset_expires_at timestamptz,
  add column pin_reset_authorized_by text,
  add column pin_reset_authorized_at timestamptz,
  add column pin_reset_completed_at timestamptz,
  add column pin_session_not_before timestamptz;

create function public.authorize_driver_pin_reset(p_driver_id bigint,p_actor_role text,p_actor_label text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.driver_access_accounts%rowtype;
begin
  if p_actor_role is distinct from 'admin' or nullif(btrim(p_actor_label),'') is null
    or length(p_actor_label)>160 then raise exception 'Verified Admin required'; end if;
  perform id from public.drivers where id=p_driver_id for update;
  if not found then raise exception 'Driver unavailable'; end if;
  select * into a from public.driver_access_accounts where driver_reference=p_driver_id::text for update;
  if not found or a.account_status <> 'active' or a.auth_user_id is null
    or a.active_device_id_hash is null then raise exception 'Registered active phone required'; end if;
  if a.pin_reset_state='claimed' then raise exception 'PIN reset in progress; review required'; end if;
  -- Concurrent Admin taps reuse the current permission instead of extending it.
  if a.pin_reset_state='ready' and a.pin_reset_expires_at>clock_timestamp()
    and a.pin_reset_device_hash=a.active_device_id_hash then
    return jsonb_build_object('ok',true,'expires_at',a.pin_reset_expires_at);
  end if;
  update public.driver_access_accounts set pin_reset_state='ready',pin_reset_claim_id=null,
    pin_reset_device_hash=active_device_id_hash,pin_reset_expires_at=clock_timestamp()+interval '15 minutes',
    pin_reset_authorized_by=p_actor_label,pin_reset_authorized_at=clock_timestamp(),pin_reset_completed_at=null
    where id=a.id returning * into a;
  return jsonb_build_object('ok',true,'expires_at',a.pin_reset_expires_at);
end; $$;

create function public.claim_driver_pin_reset(p_device_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.driver_access_accounts%rowtype;
begin
  if p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into a from public.driver_access_accounts where active_device_id_hash=p_device_hash for update;
  if not found or a.account_status <> 'active' or a.auth_user_id is null
    or a.pin_reset_state is distinct from 'ready' or a.pin_reset_device_hash is distinct from p_device_hash
    or a.pin_reset_expires_at is null or a.pin_reset_expires_at<=clock_timestamp() then return null; end if;
  update public.driver_access_accounts set pin_reset_state='claimed',pin_reset_claim_id=gen_random_uuid(),
    pin_session_not_before=date_trunc('milliseconds',clock_timestamp()) where id=a.id returning * into a;
  return jsonb_build_object('account_id',a.id,'auth_user_id',a.auth_user_id,'claim_id',a.pin_reset_claim_id);
end; $$;

create function public.finish_driver_pin_reset(p_account_id uuid,p_claim_id uuid,p_device_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  update public.driver_access_accounts set pin_reset_state='complete',pin_reset_completed_at=clock_timestamp()
  where id=p_account_id and account_status='active' and pin_reset_state='claimed'
    and pin_reset_claim_id=p_claim_id and active_device_id_hash=p_device_hash and pin_reset_device_hash=p_device_hash;
  if not found then raise exception 'PIN reset changed; review required'; end if;
  return true;
end; $$;

revoke all on function public.authorize_driver_pin_reset(bigint,text,text),
  public.claim_driver_pin_reset(text),public.finish_driver_pin_reset(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_driver_pin_reset(bigint,text,text),
  public.claim_driver_pin_reset(text),public.finish_driver_pin_reset(uuid,uuid,text) to service_role;
