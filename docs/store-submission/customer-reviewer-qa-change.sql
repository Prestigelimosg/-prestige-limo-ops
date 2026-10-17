-- Existing Customer amendment/cancellation intake, QA records only.
-- No booking mutation or Calendar, email, push, invoice or provider operation.
create function public.save_customer_reviewer_qa_change_request(
  p_booking_id bigint, p_booking_reference text,
  p_company_id bigint, p_booker_id bigint, p_customer_id bigint,
  p_traveler_id bigint, p_driver_id bigint,
  p_expected_updated_at timestamptz, p_context jsonb
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  n public.admin_app_notification_outbox%rowtype;
  context_value jsonb;
  event_value text;
begin
  if p_booking_id is null or p_booking_id <= 0 or p_company_id is null or p_company_id <= 0 or
     p_booker_id is null or p_booker_id <= 0 or p_customer_id is null or p_customer_id <= 0 or
     p_traveler_id is null or p_traveler_id <= 0 or p_driver_id is null or p_driver_id <= 0 or
     p_booking_reference is null or p_booking_reference not like 'QA-%' or
     p_expected_updated_at is null or not isfinite(p_expected_updated_at) then
    raise exception 'QA identity required.' using errcode='22023';
  end if;
  if p_context is null or jsonb_typeof(p_context) <> 'object' then
    raise exception 'QA request required.' using errcode='22023';
  end if;
  if length(p_context::text)>2000 or
     p_context->>'request_kind' is null or p_context->>'request_kind' not in ('amendment','cancellation') or
     p_context->>'surface' is distinct from 'customer_booking_change_request' or
     p_context->>'workflow_area' is distinct from 'customer_booking_change_request' or
     exists(select 1 from jsonb_each(p_context) e where jsonb_typeof(e.value)<>'string' or
       e.key not in ('current_dropoff_location','current_pickup_at','current_pickup_location','current_service_type',
         'passenger_name','request_kind','request_note','requested_dropoff_location','requested_pickup_date',
         'requested_pickup_location','requested_service_type','requested_pickup_time','surface','workflow_area')) then
    raise exception 'Invalid QA request.' using errcode='22023';
  end if;
  select * into b from public.bookings where id=p_booking_id and booking_reference=p_booking_reference
    and company_id=p_company_id and booker_id=p_booker_id and customer_id=p_customer_id
    and traveler_id=p_traveler_id and driver_id=p_driver_id for update;
  if not found or b.updated_at is distinct from p_expected_updated_at then
    raise exception 'Reload the QA booking.' using errcode='40001';
  end if;
  -- This designated standalone test booking stays out of operational delivery.
  if b.admin_internal_status is distinct from 'draft' or b.customer_facing_status is distinct from 'received' or
     exists(select 1 from public.driver_job_bid_offers where booking_reference=p_booking_reference) or
     exists(select 1 from public.driver_job_combo_members where booking_reference=p_booking_reference) or
     exists(select 1 from public.driver_job_links where booking_reference=p_booking_reference) or
     exists(select 1 from public.driver_job_status_events where booking_reference=p_booking_reference) then
    raise exception 'QA request target unavailable.' using errcode='22023';
  end if;
  context_value := p_context || jsonb_build_object('review_booking_id',p_booking_id::text,
    'review_company_id',p_company_id::text,'review_booker_id',p_booker_id::text,
    'review_customer_id',p_customer_id::text,'review_traveler_id',p_traveler_id::text,
    'review_driver_id',p_driver_id::text);
  if length(context_value::text)>2000 then
    raise exception 'QA request is too long.' using errcode='22023';
  end if;
  event_value := 'qa-customer-change-' || md5(jsonb_build_array(p_booking_id,p_booking_reference,p_expected_updated_at,context_value)::text);
  insert into public.admin_app_notification_outbox(notification_type,notification_status,priority,delivery_surface,
    event_key,booking_reference,workflow_area,safe_title,safe_message,safe_context,source_surface,actor_role,actor_label)
  values('booking_workflow','queued','normal','admin_app',event_value,p_booking_reference,'customer_booking_change_request',
    'QA customer booking change request','QA request received for review. No Calendar or real booking was changed.',
    context_value,'system','system','store-review-customer-request')
  on conflict(event_key) where event_key is not null do nothing returning * into n;
  if not found then
    select * into n from public.admin_app_notification_outbox where event_key=event_value
      and booking_reference=p_booking_reference and actor_label='store-review-customer-request' and safe_context=context_value;
    if not found then raise exception 'QA request identity conflict.' using errcode='40001'; end if;
  end if;
  return to_jsonb(n);
end;
$$;
revoke all on function public.save_customer_reviewer_qa_change_request(bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.save_customer_reviewer_qa_change_request(bigint,text,bigint,bigint,bigint,bigint,bigint,timestamptz,jsonb) to service_role;
