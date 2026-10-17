-- Reviewer-only detail save. Replace the existing signature atomically,
-- retaining old nine-argument calls through the optional details parameter.
-- Only server-owned exact QA identity proofs may invoke this function.
create function public.save_admin_reviewer_qa_bags(
  p_booking_id bigint, p_booking_reference text,
  p_company_id bigint, p_booker_id bigint, p_customer_id bigint,
  p_traveler_id bigint, p_driver_id bigint,
  p_expected_updated_at timestamptz, p_luggage_count integer, p_details jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  saved_at timestamptz;
  before_snapshot jsonb;
  after_snapshot jsonb;
  current_details jsonb;
begin
  if p_booking_id is null or p_booking_id <= 0 or p_company_id is null or p_company_id <= 0 or
     p_booker_id is null or p_booker_id <= 0 or p_customer_id is null or p_customer_id <= 0 or
     p_traveler_id is null or p_traveler_id <= 0 or p_driver_id is null or p_driver_id <= 0 or
     p_booking_reference is null or p_booking_reference !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$' or
     p_expected_updated_at is null or not isfinite(p_expected_updated_at) or
     p_luggage_count is null or p_luggage_count < 0 or p_luggage_count > 100 or
     (p_details is null and p_luggage_count is distinct from 2) then
    raise exception 'QA save unavailable.' using errcode='22023';
  end if;
  if p_details is not null then
    if jsonb_typeof(p_details) is distinct from 'object' then
      raise exception 'QA details unavailable.' using errcode='22023';
    end if;
    if (select array_agg(k order by k) from jsonb_object_keys(p_details) k) is distinct from
       array['flight_no','passenger_name','pax_count','vehicle_type_or_category'] or
       jsonb_typeof(p_details->'flight_no') is distinct from 'string' or length(p_details->>'flight_no') > 80 or
       jsonb_typeof(p_details->'passenger_name') is distinct from 'string' or
       length(btrim(p_details->>'passenger_name'))=0 or length(p_details->>'passenger_name') > 160 or
       jsonb_typeof(p_details->'vehicle_type_or_category') is distinct from 'string' or
       length(btrim(p_details->>'vehicle_type_or_category'))=0 or length(p_details->>'vehicle_type_or_category') > 80 or
       jsonb_typeof(p_details->'pax_count') is distinct from 'number' or
       (p_details->>'pax_count') !~ '^[1-9][0-9]{0,2}$' then
      raise exception 'QA details unavailable.' using errcode='22023';
    end if;
    if (p_details->>'pax_count')::integer > 100 then
      raise exception 'QA details unavailable.' using errcode='22023';
    end if;
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
     b.luggage_count is null or b.luggage_count < 0 or b.luggage_count > 100 then
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
  current_details := jsonb_build_object('flight_no',coalesce(b.flight_no,''),
    'passenger_name',b.passenger_name,'pax_count',b.pax_count,'vehicle_type_or_category',b.vehicle_type_or_category);
  if b.luggage_count=p_luggage_count and (p_details is null or current_details=p_details) then
    return jsonb_build_object('booking_reference',b.booking_reference,'luggage_count',b.luggage_count,
      'updated_at',b.updated_at,'noop',true) || case when p_details is null then '{}'::jsonb else jsonb_build_object('details',current_details) end;
  end if;
  before_snapshot := jsonb_build_object('booking_reference',b.booking_reference,'luggage_count',b.luggage_count)
    || case when p_details is null then '{}'::jsonb else jsonb_build_object('details',current_details) end;
  after_snapshot := jsonb_build_object('booking_reference',b.booking_reference,'luggage_count',p_luggage_count)
    || case when p_details is null then '{}'::jsonb else jsonb_build_object('details',p_details) end;
  update public.bookings set luggage_count=p_luggage_count,updated_at=clock_timestamp(),
    flight_no=case when p_details is null then b.flight_no else p_details->>'flight_no' end,
    passenger_name=case when p_details is null then b.passenger_name else p_details->>'passenger_name' end,
    pax_count=case when p_details is null then b.pax_count else (p_details->>'pax_count')::integer end,
    vehicle_type_or_category=case when p_details is null then b.vehicle_type_or_category else p_details->>'vehicle_type_or_category' end
  where id=p_booking_id and booking_reference=p_booking_reference and company_id=p_company_id and
    booker_id=p_booker_id and customer_id=p_customer_id and traveler_id=p_traveler_id and driver_id=p_driver_id and
    updated_at=p_expected_updated_at
  returning updated_at into saved_at;
  if not found then raise exception 'Reload the QA booking.' using errcode='40001'; end if;
  insert into public.audit_logs(entity_type,entity_id,action,source_route,actor_label,change_summary,
    booking_id,customer_id,actor_role,action_type,booking_reference,source_surface,reason,safe_before,safe_after)
  values('booking',p_booking_id,'booking_updated','/api/admin-bookings','Server acting for QA reviewer',
    case when p_details is null then 'QA reviewer saved Number of bags.' else 'QA reviewer saved test booking details.' end,p_booking_id,p_customer_id,'system','booking_updated',
    p_booking_reference,'system','QA save requested by the authenticated Admin reviewer.',
    before_snapshot,after_snapshot);
  return after_snapshot || jsonb_build_object('updated_at',saved_at,'noop',false);
end;
$$;
revoke all on function public.save_admin_reviewer_qa_bags(bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,integer,jsonb) from public,anon,authenticated;
grant execute on function public.save_admin_reviewer_qa_bags(bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,integer,jsonb) to service_role;
