alter table public.customer_access_email_challenges
  add column if not exists request_ip_hash text;

do $$
begin
  if exists (
    select 1
    from public.customer_access_email_challenges
    where request_ip_hash is null
  ) then
    raise exception 'customer_access_email_challenges must be empty before enabling IP-bound OTP reservations';
  end if;
end;
$$;

alter table public.customer_access_email_challenges
  add constraint customer_access_email_challenges_request_ip_hash_check
    check (request_ip_hash ~ '^[0-9a-f]{64}$'),
  alter column request_ip_hash set not null;

create index if not exists customer_access_email_challenges_request_ip_created_idx
  on public.customer_access_email_challenges (request_ip_hash, created_at desc);

create or replace function public.reserve_customer_principal_email_challenge(
  p_principal_id uuid,
  p_challenge_purpose text,
  p_challenge_hash text,
  p_request_ip_hash text
)
returns table (
  allowed boolean,
  challenge_id uuid,
  reason text,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_principal_purpose_count integer;
  v_ip_count integer;
  v_challenge_id uuid;
begin
  if p_principal_id is null
    or p_challenge_purpose is null
    or p_challenge_purpose not in ('activation', 'new_device', 'forgot_pin')
    or p_challenge_hash is null
    or p_challenge_hash !~ '^[0-9a-f]{64}$'
    or p_request_ip_hash is null
    or p_request_ip_hash !~ '^[0-9a-f]{64}$'
  then
    return query select false, null::uuid, 'invalid'::text, 900;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_principal_id::text || ':' || p_challenge_purpose,
      2211
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_ip_hash, 2212)
  );

  select count(*)::integer
    into v_principal_purpose_count
  from public.customer_access_email_challenges as challenge
  where challenge.principal_id = p_principal_id
    and challenge.challenge_purpose = p_challenge_purpose
    and challenge.created_at >= v_now - interval '15 minutes'
    and challenge.used_at is null;

  if v_principal_purpose_count >= 5 then
    return query select false, null::uuid, 'principal_purpose_limit'::text, 900;
    return;
  end if;

  select count(*)::integer
    into v_ip_count
  from public.customer_access_email_challenges as challenge
  where challenge.request_ip_hash = p_request_ip_hash
    and challenge.created_at >= v_now - interval '15 minutes';

  if v_ip_count >= 20 then
    return query select false, null::uuid, 'ip_limit'::text, 900;
    return;
  end if;

  insert into public.customer_access_email_challenges (
    challenge_hash,
    challenge_purpose,
    created_at,
    expires_at,
    principal_id,
    request_ip_hash
  )
  values (
    p_challenge_hash,
    p_challenge_purpose,
    v_now,
    v_now + interval '10 minutes',
    p_principal_id,
    p_request_ip_hash
  )
  returning id into v_challenge_id;

  return query select true, v_challenge_id, 'reserved'::text, 0;
end;
$$;

revoke all on function public.reserve_customer_principal_email_challenge(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.reserve_customer_principal_email_challenge(
  uuid,
  text,
  text,
  text
) to service_role;

comment on function public.reserve_customer_principal_email_challenge(
  uuid,
  text,
  text,
  text
) is 'Atomically reserves one Customer principal email OTP challenge with exact principal-purpose and hashed-IP limits.';
