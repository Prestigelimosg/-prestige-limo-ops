-- Additive preparation only. The booking trigger starts DISABLED. Deploy the
-- compatible route, then enable it in the separately reviewed activation step.
-- The new route fails closed while the trigger is disabled or absent.
alter table public.customer_booking_phone_otp_challenges
  add column booking_group_reference text,
  add column booking_leg_references text[],
  add column booking_admission_until timestamptz,
  add constraint customer_public_booking_admission_shape check (
    (booking_group_reference is null and booking_leg_references is null and booking_admission_until is null)
    or (booking_group_reference is not null and booking_leg_references is not null and booking_admission_until is not null
      and booking_group_reference ~ '^CBOTP-[A-F0-9]{24}$'
      and (booking_leg_references = array[booking_group_reference]
        or booking_leg_references = array[booking_group_reference || '-OUT', booking_group_reference || '-RET']))
  );

create unique index customer_public_booking_admission_group_idx
  on public.customer_booking_phone_otp_challenges(booking_group_reference)
  where booking_group_reference is not null;
create index customer_public_booking_admission_phone_idx
  on public.customer_booking_phone_otp_challenges(phone_hash)
  where booking_group_reference is not null;

-- Review is authoritative. Notification dismissal and driver evidence are not.
create function public.customer_public_booking_pending(p_status text, p_review text)
returns boolean language sql immutable security invoker set search_path = ''
as $$
  select lower(trim(coalesce(p_status,''))) not in ('cancelled','canceled')
    and lower(trim(coalesce(p_review,''))) <> 'approved';
$$;

create function public.reserve_customer_public_booking_request(
  p_challenge_id text, p_phone_hash text, p_group_reference text, p_leg_references text[]
) returns table(allowed boolean, reason text)
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_challenge public.customer_booking_phone_otp_challenges%rowtype;
begin
  if not exists (select from pg_catalog.pg_trigger
    where tgrelid='public.bookings'::regclass and tgname='customer_public_pending_admission'
      and tgenabled in ('O','A')) then
    return query select false, 'unavailable'::text; return;
  end if;
  if p_challenge_id is null or p_phone_hash is null or p_group_reference is null or p_leg_references is null
    or p_challenge_id !~ '^[a-f0-9]{32}$' or p_phone_hash !~ '^[a-f0-9]{64}$'
    or p_group_reference !~ '^CBOTP-[A-F0-9]{24}$'
    or not (p_leg_references = array[p_group_reference]
      or p_leg_references = array[p_group_reference || '-OUT',p_group_reference || '-RET']) then
    return query select false, 'invalid'::text; return;
  end if;
  -- All admissions and exact-group booking mutations share this phone lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_phone_hash, 1703));
  select * into v_challenge from public.customer_booking_phone_otp_challenges
    where challenge_id=p_challenge_id and phone_hash=p_phone_hash;
  if not found or v_challenge.status <> 'verified' or v_challenge.verified_at is null
    or v_challenge.verified_at <= clock_timestamp()-interval '10 minutes' then
    return query select false, 'invalid'::text; return;
  end if;
  if exists (
    select from public.customer_booking_phone_otp_challenges c
    where c.phone_hash=p_phone_hash and c.booking_group_reference is not null
      and exists(select from public.bookings b where b.booking_reference=any(c.booking_leg_references)
              and public.customer_public_booking_pending(b.status,b.request_review_status))
  ) then
    return query select false, 'public_request_pending'::text; return;
  end if;
  if exists (
    select from public.customer_booking_phone_otp_challenges c
    where c.phone_hash=p_phone_hash and c.booking_group_reference is not null
        and (c.booking_admission_until>clock_timestamp()
          and (select count(*) from public.bookings b where b.booking_reference=any(c.booking_leg_references))
            < cardinality(c.booking_leg_references))
  ) then
    return query select false, 'public_request_in_progress'::text; return;
  end if;
  -- Never renew a consumed/expired reservation: an old worker must stay fenced.
  if v_challenge.booking_group_reference is not null then
    return query select false, 'used'::text; return;
  end if;
  update public.customer_booking_phone_otp_challenges
    set booking_group_reference=p_group_reference, booking_leg_references=p_leg_references,
      booking_admission_until=least(clock_timestamp()+interval '5 minutes', v_challenge.verified_at+interval '10 minutes')
    where challenge_id=p_challenge_id;
  return query select true, 'allowed'::text;
end;
$$;

create function public.enforce_customer_public_pending_admission()
returns trigger language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_group text;
  v_claim public.customer_booking_phone_otp_challenges%rowtype;
begin
  -- No effect on invitations, authenticated customer references, or Admin jobs.
  if tg_op='UPDATE' and old.booking_reference ~ '^CBOTP-[A-F0-9]{24}(-(OUT|RET))?$'
    and new.booking_reference is distinct from old.booking_reference then
    raise exception using errcode='PBL01', message='public_admission_invalid';
  end if;
  if new.booking_reference is null or new.booking_reference !~ '^CBOTP-[A-F0-9]{24}(-(OUT|RET))?$' then
    return new;
  end if;
  v_group := regexp_replace(new.booking_reference, '-(OUT|RET)$', '');
  select * into v_claim from public.customer_booking_phone_otp_challenges
    where booking_group_reference=v_group;
  if not found then
    -- Historic decided rows can retain ordinary Admin updates. No new or
    -- reopened public booking is allowed without an admission binding.
    if tg_op='UPDATE' and not public.customer_public_booking_pending(new.status,new.request_review_status) then
      return new;
    end if;
    raise exception using errcode='PBL01', message='public_admission_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_claim.phone_hash,1703));
  select * into v_claim from public.customer_booking_phone_otp_challenges
    where booking_group_reference=v_group;
  if not found or not (new.booking_reference=any(v_claim.booking_leg_references))
    or (tg_op='INSERT' and v_claim.booking_admission_until<=clock_timestamp()) then
    raise exception using errcode='PBL01', message='public_admission_invalid';
  end if;
  if public.customer_public_booking_pending(new.status,new.request_review_status) and exists (
    select from public.customer_booking_phone_otp_challenges c
    where c.phone_hash=v_claim.phone_hash and c.booking_group_reference<>v_group
      and (exists(select from public.bookings b where b.booking_reference=any(c.booking_leg_references)
            and public.customer_public_booking_pending(b.status,b.request_review_status))
        or (c.booking_admission_until>clock_timestamp()
          and (select count(*) from public.bookings b where b.booking_reference=any(c.booking_leg_references))
            < cardinality(c.booking_leg_references)))
  ) then
    raise exception using errcode='PBL02', message='public_request_pending';
  end if;
  return new;
end;
$$;

revoke all on function public.customer_public_booking_pending(text,text) from public,anon,authenticated;
revoke all on function public.reserve_customer_public_booking_request(text,text,text,text[]) from public,anon,authenticated;
revoke all on function public.enforce_customer_public_pending_admission() from public,anon,authenticated;
grant execute on function public.customer_public_booking_pending(text,text) to service_role;
grant execute on function public.reserve_customer_public_booking_request(text,text,text,text[]) to service_role;
grant execute on function public.enforce_customer_public_pending_admission() to service_role;

create trigger customer_public_pending_admission
  before insert or update of booking_reference,status,request_review_status on public.bookings
  for each row execute function public.enforce_customer_public_pending_admission();
alter table public.bookings disable trigger customer_public_pending_admission;
