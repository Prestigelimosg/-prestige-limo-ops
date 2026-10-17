DO $migration$
BEGIN
 IF to_regprocedure('public.update_admin_reviewer_qa_notification(bigint,text,bigint,bigint,bigint,bigint,bigint,uuid,text)') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.admin_app_notification_outbox'::regclass AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'QA notification metadata drift; no change applied';
 END IF;
 EXECUTE $ddl$-- Existing Admin request close/read controls; no booking or downstream writes.
create function public.update_admin_reviewer_qa_notification(
 p_booking_id bigint,p_booking_reference text,p_company_id bigint,p_booker_id bigint,
 p_customer_id bigint,p_traveler_id bigint,p_driver_id bigint,p_notification_id uuid,p_status text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 n public.admin_app_notification_outbox%rowtype;
begin
 if p_booking_id is null or p_booking_id<=0 or p_booking_reference is null or p_booking_reference not like 'QA-%' or
    p_company_id is null or p_company_id<=0 or p_booker_id is null or p_booker_id<=0 or
    p_customer_id is null or p_customer_id<=0 or p_traveler_id is null or p_traveler_id<=0 or
    p_driver_id is null or p_driver_id<=0 or p_notification_id is null or
    p_status is null or p_status not in ('archived','dismissed','read') then
   raise exception 'QA notification unavailable.' using errcode='22023';
 end if;
 -- Same booking-first order as request intake; ownership cannot change during this decision.
 perform 1 from public.bookings where id=p_booking_id and booking_reference=p_booking_reference
   and company_id=p_company_id and booker_id=p_booker_id and customer_id=p_customer_id
   and traveler_id=p_traveler_id and driver_id=p_driver_id for update;
 if not found then raise exception 'Reload the QA request.' using errcode='40001'; end if;
 select * into n from public.admin_app_notification_outbox where id=p_notification_id
   and booking_reference=p_booking_reference and actor_label='store-review-customer-request'
   and notification_type='booking_workflow' and workflow_area='customer_booking_change_request'
   and safe_context->>'review_booking_id'=p_booking_id::text
   and safe_context->>'review_company_id'=p_company_id::text
   and safe_context->>'review_booker_id'=p_booker_id::text
   and safe_context->>'review_customer_id'=p_customer_id::text
   and safe_context->>'review_traveler_id'=p_traveler_id::text
   and safe_context->>'review_driver_id'=p_driver_id::text for update;
 if not found then raise exception 'Reload the QA request.' using errcode='40001'; end if;
 -- Exact retry is harmless; never reopen or replace another final decision.
 if n.notification_status=p_status then return to_jsonb(n); end if;
 if n.notification_status not in ('queued','read') then
   raise exception 'QA request was already closed.' using errcode='40001';
 end if;
 update public.admin_app_notification_outbox set notification_status=p_status,updated_at=clock_timestamp()
   where id=n.id returning * into n;
 -- Retain the durable QA actor/scope markers so normal owner queues stay isolated.
 return to_jsonb(n);
end;
$$;
revoke all on function public.update_admin_reviewer_qa_notification(bigint,text,bigint,bigint,bigint,bigint,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.update_admin_reviewer_qa_notification(bigint,text,bigint,bigint,bigint,bigint,bigint,uuid,text) to service_role;
$ddl$;
END
$migration$;
