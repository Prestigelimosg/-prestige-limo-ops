-- Display evidence only. Never use this table to authorize jobs or Pool recipients.
create table public.driver_account_activity (
  account_id uuid primary key references public.driver_access_accounts(id) on delete cascade,
  driver_id bigint not null check (driver_id > 0),
  device_id_hash text not null check (device_id_hash ~ '^[0-9a-f]{64}$'),
  session_issued_at timestamptz not null,
  session_expires_at timestamptz not null,
  last_active_at timestamptz,
  signed_out_at timestamptz
);
alter table public.driver_account_activity enable row level security;
revoke all on table public.driver_account_activity from public, anon, authenticated, service_role;
grant select, insert, update on table public.driver_account_activity to service_role;

create function public.record_driver_account_activity(
  p_account_id uuid, p_driver_id bigint, p_device_id_hash text,
  p_session_issued_at timestamptz, p_session_expires_at timestamptz, p_event text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := clock_timestamp();
begin
  if p_event is null or p_event not in ('active','signed_out')
    or p_session_issued_at is null or p_session_expires_at is null
    or p_session_issued_at > v_now or p_session_expires_at <= v_now
    or p_session_expires_at <= p_session_issued_at
    or p_session_expires_at > p_session_issued_at + interval '30 days'
    or p_device_id_hash is null or p_device_id_hash !~ '^[0-9a-f]{64}$' then return false; end if;

  -- Share lock prevents account reset/device replacement racing this small transaction.
  perform 1 from public.driver_access_accounts a where a.id=p_account_id
    and a.driver_reference=p_driver_id::text and a.account_status='active'
    and a.active_device_id_hash=p_device_id_hash
    and a.pin_reset_state is distinct from 'claimed'
    and (a.pin_session_not_before is null or p_session_issued_at>a.pin_session_not_before)
    for share;
  if not found then return false; end if;

  insert into public.driver_account_activity as current
    (account_id,driver_id,device_id_hash,session_issued_at,session_expires_at,last_active_at,signed_out_at)
  values (p_account_id,p_driver_id,p_device_id_hash,p_session_issued_at,p_session_expires_at,
    case when p_event='active' then v_now end,case when p_event='signed_out' then v_now end)
  on conflict (account_id) do update set
    driver_id=excluded.driver_id,device_id_hash=excluded.device_id_hash,
    session_issued_at=excluded.session_issued_at,session_expires_at=excluded.session_expires_at,
    last_active_at=case when p_event='active' then v_now else current.last_active_at end,
    signed_out_at=excluded.signed_out_at
  where excluded.session_issued_at>current.session_issued_at
    or (excluded.session_issued_at=current.session_issued_at and current.signed_out_at is null
      and (p_event='signed_out' or current.last_active_at is null or current.last_active_at<=v_now-interval '60 seconds'));
  return true;
end;
$$;

create function public.read_driver_pool_activity(p_driver_ids bigint[])
returns table(driver_id bigint,state text,last_active_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_driver_ids is null or cardinality(p_driver_ids)>200
    or exists(select 1 from unnest(p_driver_ids) i where i is null or i<=0)
    or cardinality(p_driver_ids)<>(select count(distinct i) from unnest(p_driver_ids) i)
    then raise exception 'Invalid activity batch'; end if;
  return query
  select requested.id,
    case when count(a.id)<>1 or count(s.account_id)<>1 then 'unknown'
      when bool_or(a.account_status<>'active' or a.active_device_id_hash is distinct from s.device_id_hash
        or a.pin_reset_state='claimed' or a.pin_session_not_before>=s.session_issued_at
        or s.session_expires_at<=now() or s.signed_out_at is not null) then 'signed_out'
      when max(s.last_active_at) between now()-interval '2 minutes' and now() then 'online'
      when max(s.last_active_at)<=now() then 'last_active'
      else 'unknown' end,
    case when count(a.id)=1 and count(s.account_id)=1 then max(s.last_active_at) end
  from unnest(p_driver_ids) with ordinality as requested(id,position)
  left join public.driver_access_accounts a on a.driver_reference=requested.id::text
  left join public.driver_account_activity s on s.account_id=a.id and s.driver_id=requested.id
  group by requested.id,requested.position order by requested.position;
end;
$$;
revoke all on function public.record_driver_account_activity(uuid,bigint,text,timestamptz,timestamptz,text) from public,anon,authenticated;
revoke all on function public.read_driver_pool_activity(bigint[]) from public,anon,authenticated;
grant execute on function public.record_driver_account_activity(uuid,bigint,text,timestamptz,timestamptz,text) to service_role;
grant execute on function public.read_driver_pool_activity(bigint[]) to service_role;
