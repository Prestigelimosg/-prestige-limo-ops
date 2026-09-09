-- Reject a second public verification SMS while its verified phone has a saved pending request.
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

  -- Share the exact phone lock with public admission and Admin booking decisions.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_phone_hash, 1703)
  );

  -- Saved pending bookings remain blocking after the original OTP expires.
  -- Resolve only the verified admission binding, never editable contact text.
  if exists (
    select from public.customer_booking_phone_otp_challenges as challenge
    where challenge.phone_hash = p_phone_hash
      and challenge.booking_group_reference is not null
      and exists (
        select from public.bookings as booking
        where booking.booking_reference = any(challenge.booking_leg_references)
          and public.customer_public_booking_pending(booking.status, booking.request_review_status)
      )
  ) then
    return query select false, 'public_request_pending'::text, null::integer;
    return;
  end if;

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

