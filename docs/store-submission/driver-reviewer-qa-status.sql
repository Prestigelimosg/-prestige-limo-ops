-- LOCAL REVIEW CANDIDATE ONLY. Not applied to the hosted database.
-- Same existing status-event table; no booking/link/provider/notification mutation.
-- Booking-first serialization is shared with reassignment and Pool/combo writers.
begin;
create function public.record_driver_reviewer_qa_status(
  p_expected_booking jsonb, p_link_id uuid, p_expected_revision text, p_status text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  b public.bookings%rowtype;
  l public.driver_job_links%rowtype;
  e public.driver_job_status_events%rowtype;
  history text[];
  sequence text[] := array['driver_otw','ots','pob','completed'];
  n integer;
begin
  if jsonb_typeof(p_expected_booking) is distinct from 'object' or p_link_id is null
    or p_status is null or not (p_status = any(sequence))
    or p_expected_revision is null or p_expected_revision !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid QA status request' using errcode='22023';
  end if;
  select * into b from public.bookings
    where id=(p_expected_booking->>'bookingId')::bigint
      and booking_reference=p_expected_booking->>'bookingReference' for update;
  if not found or p_expected_booking is distinct from jsonb_build_object(
    'bookingId',b.id,'bookingReference',b.booking_reference,'companyId',b.company_id,
    'bookerId',b.booker_id,'customerId',b.customer_id,'travelerId',b.traveler_id,'driverId',b.driver_id)
    or b.company_id is null or b.booker_id is null or b.customer_id is null or b.traveler_id is null or b.driver_id is null
    or b.source_surface is distinct from 'admin_dashboard' or b.status is not null
    or b.admin_internal_status is distinct from 'draft' or b.customer_facing_status is distinct from 'received'
    or b.request_review_status is distinct from 'pending_review' or b.short_notice_review_status is distinct from 'not_required'
    or coalesce(b.change_review_status,'') <> '' or coalesce(b.cancellation_review_status,'') <> ''
    or b.customer_request_trip_group is not null then
    raise exception 'QA ownership or lifecycle changed' using errcode='42501';
  end if;
  if exists(select 1 from public.driver_job_bid_offers where booking_reference=b.booking_reference)
    or exists(select 1 from public.driver_job_combo_members where booking_reference=b.booking_reference) then
    raise exception 'QA status cannot affect Pool or combo jobs' using errcode='42501';
  end if;
  perform id from public.driver_job_links where booking_reference=b.booking_reference order by id for update;
  select * into l from public.driver_job_links where id=p_link_id and booking_reference=b.booking_reference;
  if not found or (select count(*) from public.driver_job_links where booking_reference=b.booking_reference) <> 1
    or l.driver_id is distinct from b.driver_id or l.link_status is distinct from 'active'
    or l.revoked_at is not null or l.expires_at is null or l.expires_at <= clock_timestamp()
    or l.safe_link_context->>'link_purpose' is distinct from 'store_review_qa'
    or l.safe_link_context->'store_review_booking' is distinct from p_expected_booking
    or l.safe_link_context ?| array['native_handoff_ciphertext','combo_id','combo_revision','combo_link_batch','assignment_cancelled_at']
    or coalesce(l.safe_link_context->>'driver_ack_required_revision',l.safe_link_context->>'job_card_revision') is distinct from p_expected_revision
    or l.safe_link_context->>'driver_acknowledged_revision' is distinct from p_expected_revision
    or coalesce(l.safe_link_context->>'driver_acknowledged_at','') = ''
    or coalesce(l.safe_link_context->>'driver_amendment_ack_pending','false') <> 'false' then
    raise exception 'QA link or acknowledgement changed' using errcode='42501';
  end if;
  if exists(select 1 from public.driver_job_status_events where booking_reference=b.booking_reference and
    (driver_job_link_id is distinct from l.id or safe_status_context is distinct from jsonb_build_object('store_review_booking',p_expected_booking)
      or actor_label is distinct from 'store_review_qa' or actor_role is distinct from 'driver'
      or status_source is distinct from 'driver_job_api' or source_surface is distinct from 'driver_job_api')) then
    raise exception 'Unrecognized QA history' using errcode='42501';
  end if;
  select coalesce(array_agg(status_value order by occurred_at,id),array[]::text[]) into history
    from public.driver_job_status_events where booking_reference=b.booking_reference;
  n := cardinality(history);
  if n > 4 or (n > 0 and history is distinct from sequence[1:n]) then
    raise exception 'Invalid QA history' using errcode='42501';
  end if;
  -- An identical retry reuses the last event, without creating a second timestamp.
  if n > 0 and history[n]=p_status then
    select * into e from public.driver_job_status_events where booking_reference=b.booking_reference
      order by occurred_at desc,id desc limit 1;
  else
    if n=4 or p_status is distinct from sequence[n+1] then
      raise exception 'QA status must follow OTW, OTS, POB, Completed' using errcode='22023';
    end if;
    insert into public.driver_job_status_events(booking_reference,driver_job_link_id,status_value,
      status_source,source_surface,actor_role,actor_label,safe_status_context,occurred_at)
      values(b.booking_reference,l.id,p_status,'driver_job_api','driver_job_api','driver','store_review_qa',
        jsonb_build_object('store_review_booking',p_expected_booking),clock_timestamp()) returning * into e;
  end if;
  return to_jsonb(e);
end;
$$;
revoke all on function public.record_driver_reviewer_qa_status(jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_driver_reviewer_qa_status(jsonb,uuid,text,text) to service_role;
commit;
