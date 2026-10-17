-- Local preparation only. NOT APPLIED to the hosted database.
-- Compatible with the read-only 2026-10-16 catalog receipt. No existing objects changed.
-- A separately approved migration/deployment is required before online use.
create function public.save_admin_reviewer_qa_bags(
  p_booking_id bigint, p_booking_reference text,
  p_company_id bigint, p_booker_id bigint, p_customer_id bigint,
  p_traveler_id bigint, p_driver_id bigint,
  p_expected_updated_at timestamptz, p_luggage_count integer
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  saved_at timestamptz;
  before_snapshot jsonb;
begin
  if p_booking_id is null or p_booking_id <= 0 or p_company_id is null or p_company_id <= 0 or
     p_booker_id is null or p_booker_id <= 0 or p_customer_id is null or p_customer_id <= 0 or
     p_traveler_id is null or p_traveler_id <= 0 or p_driver_id is null or p_driver_id <= 0 or
     p_booking_reference is null or p_booking_reference !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$' or
     p_expected_updated_at is null or not isfinite(p_expected_updated_at) or p_luggage_count is distinct from 2 then
    raise exception 'QA save unavailable.' using errcode='22023';
  end if;
  select * into b from public.bookings where id=p_booking_id for update;
  if not found or b.booking_reference is distinct from p_booking_reference or
     b.company_id is distinct from p_company_id or b.booker_id is distinct from p_booker_id or
     b.customer_id is distinct from p_customer_id or b.traveler_id is distinct from p_traveler_id or
     b.driver_id is distinct from p_driver_id or b.updated_at is distinct from p_expected_updated_at then
    raise exception 'Reload the QA booking.' using errcode='40001';
  end if;
  -- Positive eligibility for two exact Admin draft representations only.
  -- Normal Save + CRM uses NULL legacy status plus admin_dashboard/pending_review/
  -- not_required. That Admin-origin bookkeeping value is not customer acceptance.
  -- Keep the previously supported admin_api draft shape separate; deny hybrids.
  if b.admin_internal_status is distinct from 'draft' or
     b.customer_facing_status is distinct from 'received' or
     not (
       (b.status is not distinct from 'draft' and b.source_surface is not distinct from 'admin_api' and
        coalesce(b.request_review_status,'') in ('','approved') and
        coalesce(b.short_notice_review_status,'') = '') or
       (b.status is null and b.source_surface is not distinct from 'admin_dashboard' and
        b.request_review_status is not distinct from 'pending_review' and
        b.short_notice_review_status is not distinct from 'not_required')
     ) or
     coalesce(b.change_review_status,'') <> '' or coalesce(b.cancellation_review_status,'') <> '' or
     b.customer_request_trip_group is not null or
     b.luggage_count is null or b.luggage_count not in (1,2) then
    raise exception 'QA booking is not eligible.' using errcode='22023';
  end if;
  -- Fresh reads AFTER the booking lock, matching the established writer order.
  -- Historical participation also blocks; do not delete history to qualify a job.
  if exists(select 1 from public.driver_job_bid_offers where booking_reference=p_booking_reference) or
     exists(select 1 from public.driver_job_combo_members where booking_reference=p_booking_reference) or
     exists(select 1 from public.driver_job_links where booking_reference=p_booking_reference) or
     exists(select 1 from public.driver_job_status_events where booking_reference=p_booking_reference) then
    raise exception 'QA booking is not standalone.' using errcode='22023';
  end if;
  if b.luggage_count=2 then
    return jsonb_build_object('booking_reference',b.booking_reference,'luggage_count',2,'updated_at',b.updated_at,'noop',true);
  end if;
  before_snapshot := jsonb_build_object('booking_reference',b.booking_reference,'luggage_count',b.luggage_count);
  update public.bookings set luggage_count=2,updated_at=clock_timestamp()
  where id=p_booking_id and booking_reference=p_booking_reference and company_id=p_company_id and
    booker_id=p_booker_id and customer_id=p_customer_id and traveler_id=p_traveler_id and driver_id=p_driver_id and
    updated_at=p_expected_updated_at
  returning updated_at into saved_at;
  if not found then raise exception 'Reload the QA booking.' using errcode='40001'; end if;
  insert into public.audit_logs(entity_type,entity_id,action,source_route,actor_label,change_summary,
    booking_id,customer_id,actor_role,action_type,booking_reference,source_surface,reason,safe_before,safe_after)
  values('booking',p_booking_id,'booking_updated','/api/admin-bookings','Server acting for QA reviewer',
    'QA reviewer changed Number of bags from 1 to 2.',p_booking_id,p_customer_id,'system','booking_updated',
    p_booking_reference,'system','QA bags-only save requested by the authenticated Admin reviewer.',
    before_snapshot,jsonb_build_object('booking_reference',p_booking_reference,'luggage_count',2));
  return jsonb_build_object('booking_reference',p_booking_reference,'luggage_count',2,'updated_at',saved_at,'noop',false);
end;
$$;
revoke all on function public.save_admin_reviewer_qa_bags(bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.save_admin_reviewer_qa_bags(bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,integer) to service_role;
