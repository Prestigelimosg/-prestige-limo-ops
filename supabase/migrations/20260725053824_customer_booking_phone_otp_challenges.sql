create table if not exists public.customer_booking_phone_otp_challenges (
  challenge_id text primary key,
  phone_hash text not null,
  ip_hash text not null,
  status text not null default 'pending',
  verification_attempts integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  verified_at timestamptz,
  constraint customer_booking_phone_otp_challenge_id_format
    check (challenge_id ~ '^[a-f0-9]{32}$'),
  constraint customer_booking_phone_otp_phone_hash_format
    check (phone_hash ~ '^[a-f0-9]{64}$'),
  constraint customer_booking_phone_otp_ip_hash_format
    check (ip_hash ~ '^[a-f0-9]{64}$'),
  constraint customer_booking_phone_otp_status_allowed
    check (
      status in (
        'pending',
        'verified',
        'provider_failed',
        'expired',
        'attempt_limit',
        'superseded'
      )
    ),
  constraint customer_booking_phone_otp_attempts_range
    check (verification_attempts between 0 and 5),
  constraint customer_booking_phone_otp_expiry_after_create
    check (expires_at > created_at),
  constraint customer_booking_phone_otp_verified_state
    check (
      (status = 'verified' and verified_at is not null)
      or
      (status <> 'verified')
    )
);

create index if not exists customer_booking_phone_otp_phone_created_idx
  on public.customer_booking_phone_otp_challenges (phone_hash, created_at desc);

create index if not exists customer_booking_phone_otp_ip_created_idx
  on public.customer_booking_phone_otp_challenges (ip_hash, created_at desc);

alter table public.customer_booking_phone_otp_challenges
  enable row level security;

revoke all on table public.customer_booking_phone_otp_challenges
  from public, anon, authenticated;

grant select, insert, update
  on table public.customer_booking_phone_otp_challenges
  to service_role;

create or replace function public.reserve_customer_booking_phone_otp_send(
  p_challenge_id text,
  p_phone_hash text,
  p_ip_hash text
)
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_last_phone_send timestamptz;
  v_phone_ten_minute_count integer;
  v_ip_thirty_minute_count integer;
  v_ip_day_count integer;
  v_ip_day_distinct_phones integer;
begin
  if p_challenge_id !~ '^[a-f0-9]{32}$'
    or p_phone_hash !~ '^[a-f0-9]{64}$'
    or p_ip_hash !~ '^[a-f0-9]{64}$'
  then
    return query select false, 'invalid'::text, 60;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_phone_hash, 1701)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_ip_hash, 1702)
  );

  select max(challenge.created_at)
    into v_last_phone_send
  from public.customer_booking_phone_otp_challenges as challenge
  where challenge.phone_hash = p_phone_hash;

  if v_last_phone_send is not null
    and v_last_phone_send > v_now - interval '60 seconds'
  then
    return query
      select
        false,
        'cooldown'::text,
        greatest(
          1,
          ceil(
            extract(
              epoch from (
                v_last_phone_send + interval '60 seconds' - v_now
              )
            )
          )::integer
        );
    return;
  end if;

  select count(*)::integer
    into v_phone_ten_minute_count
  from public.customer_booking_phone_otp_challenges as challenge
  where challenge.phone_hash = p_phone_hash
    and challenge.created_at >= v_now - interval '10 minutes';

  if v_phone_ten_minute_count >= 3 then
    return query select false, 'phone_limit'::text, 600;
    return;
  end if;

  select count(*)::integer
    into v_ip_thirty_minute_count
  from public.customer_booking_phone_otp_challenges as challenge
  where challenge.ip_hash = p_ip_hash
    and challenge.created_at >= v_now - interval '30 minutes';

  if v_ip_thirty_minute_count >= 5 then
    return query select false, 'ip_short_limit'::text, 1800;
    return;
  end if;

  select
    count(*)::integer,
    count(distinct challenge.phone_hash)::integer
    into v_ip_day_count, v_ip_day_distinct_phones
  from public.customer_booking_phone_otp_challenges as challenge
  where challenge.ip_hash = p_ip_hash
    and challenge.created_at >= v_now - interval '24 hours';

  if v_ip_day_count >= 10 or v_ip_day_distinct_phones >= 5 then
    return query select false, 'ip_day_limit'::text, 86400;
    return;
  end if;

  update public.customer_booking_phone_otp_challenges
  set status = 'superseded'
  where phone_hash = p_phone_hash
    and status = 'pending'
    and expires_at > v_now;

  insert into public.customer_booking_phone_otp_challenges (
    challenge_id,
    phone_hash,
    ip_hash,
    status,
    verification_attempts,
    created_at,
    expires_at
  )
  values (
    p_challenge_id,
    p_phone_hash,
    p_ip_hash,
    'pending',
    0,
    v_now,
    v_now + interval '10 minutes'
  );

  return query select true, 'reserved'::text, 60;
end;
$$;

revoke all on function public.reserve_customer_booking_phone_otp_send(
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.reserve_customer_booking_phone_otp_send(
  text,
  text,
  text
) to service_role;

create or replace function public.reserve_customer_booking_phone_otp_check(
  p_challenge_id text,
  p_phone_hash text
)
returns table (
  allowed boolean,
  reason text,
  retry_after_seconds integer,
  verification_attempts integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_expires_at timestamptz;
  v_attempts integer;
begin
  if p_challenge_id !~ '^[a-f0-9]{32}$'
    or p_phone_hash !~ '^[a-f0-9]{64}$'
  then
    return query select false, 'invalid'::text, 60, 0;
    return;
  end if;

  select
    challenge.status,
    challenge.expires_at,
    challenge.verification_attempts
    into v_status, v_expires_at, v_attempts
  from public.customer_booking_phone_otp_challenges as challenge
  where challenge.challenge_id = p_challenge_id
    and challenge.phone_hash = p_phone_hash
  for update;

  if not found or v_status <> 'pending' then
    return query select false, 'invalid'::text, 60, coalesce(v_attempts, 0);
    return;
  end if;

  if v_expires_at <= v_now then
    update public.customer_booking_phone_otp_challenges
    set status = 'expired'
    where challenge_id = p_challenge_id;

    return query select false, 'expired'::text, 60, v_attempts;
    return;
  end if;

  if v_attempts >= 5 then
    update public.customer_booking_phone_otp_challenges
    set status = 'attempt_limit'
    where challenge_id = p_challenge_id;

    return query select false, 'attempt_limit'::text, 600, v_attempts;
    return;
  end if;

  update public.customer_booking_phone_otp_challenges as challenge
  set verification_attempts = challenge.verification_attempts + 1
  where challenge.challenge_id = p_challenge_id
  returning challenge.verification_attempts into v_attempts;

  return query select true, 'reserved'::text, 1, v_attempts;
end;
$$;

revoke all on function public.reserve_customer_booking_phone_otp_check(
  text,
  text
) from public, anon, authenticated;

grant execute on function public.reserve_customer_booking_phone_otp_check(
  text,
  text
) to service_role;

comment on table public.customer_booking_phone_otp_challenges is
  'Server-only hashed anti-abuse state for first public customer booking phone verification. Stores no raw phone, IP address, OTP code, or Twilio credential.';

comment on function public.reserve_customer_booking_phone_otp_send(
  text,
  text,
  text
) is
  'Atomically reserves one rate-limited OTP send for the server-only customer booking verification route.';

comment on function public.reserve_customer_booking_phone_otp_check(
  text,
  text
) is
  'Atomically reserves one bounded OTP check attempt for the exact hashed phone challenge.';
