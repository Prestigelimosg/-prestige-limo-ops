-- Apply the owner's exact 10857 DSP billing-time correction through the
-- established append-only event shape, then mark the same completed booking
-- Billing ready. The saved pickup, scheduled drop-off and Driver evidence stay
-- immutable; no price, invoice, payment, Calendar or provider action runs.

begin;

set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
  booking_ref constant text := 'ADM-20260802004935';
  correction_id constant uuid := '206d5866-e808-4155-abad-edf1d016daad';
  closeout_id constant uuid := '70853358-525b-489b-93fc-e5236d9e257d';
  correction_reason constant text := 'Owner instructed saved pickup plus exactly two hours for Monthly Billing review.';
  repair_timestamp timestamptz := clock_timestamp();
  correction_affected integer := 0;
  closeout_affected integer := 0;
  booking_exact boolean := false;
  pre_repair_state boolean := false;
  exact_post_repair_state boolean := false;
  before_booking_hash text;
  before_status_hash text;
  before_links_hash text;
  before_invoice_hash text;
  before_monthly_plan_hash text;
  before_monthly_draft_hash text;
  before_access_hash text;
  before_notification_hash text;
begin
  perform 1 from public.bookings where id=179 for update;
  perform 1 from public.driver_job_dsp_actual_time_events where booking_reference=booking_ref order by id for update;
  perform 1 from public.completed_booking_closeouts where booking_reference=booking_ref order by id for update;
  perform 1 from public.driver_job_status_events where booking_reference=booking_ref order by id for update;
  perform 1 from public.driver_job_links where booking_reference=booking_ref order by id for update;
  perform 1 from public.customer_invoice_records where customer_id='163' or booker_id=24 order by id for update;
  perform 1 from public.monthly_billing_draft_plans where customer_id='163' or booker_id=24 order by id for update;
  perform 1 from public.monthly_invoice_drafts where customer_id='163' or booker_id=24 order by id for update;
  perform 1 from public.customer_access_accounts where customer_account_reference='163' or company_id=31 or booker_id=24 order by id for update;
  perform 1 from public.admin_app_notification_outbox where booking_reference=booking_ref order by id for update;
  perform 1 from public.customer_driver_app_notification_outbox where booking_reference=booking_ref order by id for update;

  select md5(to_jsonb(b)::text) into before_booking_hash from public.bookings b where b.id=179;
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) into before_status_hash from public.driver_job_status_events x where x.booking_reference=booking_ref;
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) into before_links_hash from public.driver_job_links x where x.booking_reference=booking_ref;
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) into before_invoice_hash from public.customer_invoice_records x where x.customer_id='163' or x.booker_id=24;
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) into before_monthly_plan_hash from public.monthly_billing_draft_plans x where x.customer_id='163' or x.booker_id=24;
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) into before_monthly_draft_hash from public.monthly_invoice_drafts x where x.customer_id='163' or x.booker_id=24;
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) into before_access_hash from public.customer_access_accounts x where x.customer_account_reference='163' or x.company_id=31 or x.booker_id=24;
  select md5(jsonb_build_object(
    'admin',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.admin_app_notification_outbox x where x.booking_reference=booking_ref),'[]'::jsonb),
    'customer_driver',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.customer_driver_app_notification_outbox x where x.booking_reference=booking_ref),'[]'::jsonb)
  )::text) into before_notification_hash;

  select count(*)=1 and bool_and(
    b.public_booking_reference='10857'
    and b.booking_reference=booking_ref
    and b.customer_id=163 and b.company_id=31 and b.booker_id=24 and b.traveler_id is null
    and b.service_type='DSP' and b.admin_internal_status='completed' and b.status='completed'
    and b.pickup_at='2026-08-01T04:00:00.000Z'::timestamptz
    and b.dropoff_datetime='2026-08-01T12:16:00.000Z'::timestamptz
    and b.updated_at='2026-08-02T00:49:57.836Z'::timestamptz
    and md5(to_jsonb(b)::text)='c48a974a7603bf52511187e99575d001'
  ) into booking_exact from public.bookings b where b.id=179;

  select
    (select count(*) from public.driver_job_dsp_actual_time_events where booking_reference=booking_ref)=0
    and (select count(*) from public.completed_booking_closeouts where booking_reference=booking_ref)=0
    and before_status_hash=md5('[]')
    and before_invoice_hash=md5('[]')
    and before_monthly_plan_hash=md5('[]')
    and before_monthly_draft_hash=md5('[]')
  into pre_repair_state;

  select
    (select count(*) from public.driver_job_dsp_actual_time_events e
      where e.booking_reference=booking_ref and e.id=correction_id
        and e.driver_job_link_id is null and e.event_type='dsp_end'
        and e.occurred_at='2026-08-01T06:00:00.000Z'::timestamptz
        and e.safe_event_note=correction_reason
        and e.safe_event_context=jsonb_build_object(
          'actual_time_policy','admin_billing_time_correction',
          'billing_started_at','2026-08-01T04:00:00.000Z'
        )
        and e.source_surface='admin_api' and e.actor_role='admin' and e.actor_label='Owner Admin')=1
    and (select count(*) from public.driver_job_dsp_actual_time_events where booking_reference=booking_ref)=1
    and (select count(*) from public.completed_booking_closeouts c
      where c.booking_reference=booking_ref and c.id=closeout_id
        and c.closeout_status='ready_for_billing_prep' and c.completed_job_status='completed'
        and c.dsp_actual_hours_readiness='ready' and c.extra_charges_readiness='ready'
        and c.billing_prep_readiness='ready'
        and c.safe_closeout_note='Admin marked completed job billing ready from Completed / History.'
        and c.safe_closeout_context=jsonb_build_object(
          'closeout_summary','Ready Locally from the existing Completed Trip Closeout Review control.',
          'next_action','Continue customer billing preparation review after closeout.'
        )
        and c.source_surface='admin_api' and c.actor_role='admin' and c.actor_label='Owner Admin')=1
    and (select count(*) from public.completed_booking_closeouts where booking_reference=booking_ref)=1
  into exact_post_repair_state;

  if not booking_exact then raise exception 'monthly_billing_10857_booking_precondition_drift'; end if;
  if not (pre_repair_state or exact_post_repair_state) then raise exception 'monthly_billing_10857_evidence_precondition_drift'; end if;

  if pre_repair_state then
    insert into public.driver_job_dsp_actual_time_events (
      id,booking_reference,driver_job_link_id,event_type,occurred_at,safe_event_note,
      safe_event_context,source_surface,actor_role,actor_label,created_at
    ) values (
      correction_id,booking_ref,null,'dsp_end','2026-08-01T06:00:00.000Z'::timestamptz,
      correction_reason,jsonb_build_object(
        'actual_time_policy','admin_billing_time_correction',
        'billing_started_at','2026-08-01T04:00:00.000Z'
      ),'admin_api','admin','Owner Admin',repair_timestamp
    );
    get diagnostics correction_affected=row_count;

    insert into public.completed_booking_closeouts (
      id,booking_reference,closeout_status,completed_job_status,dsp_actual_hours_readiness,
      extra_charges_readiness,billing_prep_readiness,safe_closeout_note,
      safe_closeout_context,source_surface,actor_role,actor_label,created_at,updated_at
    ) values (
      closeout_id,booking_ref,'ready_for_billing_prep','completed','ready','ready','ready',
      'Admin marked completed job billing ready from Completed / History.',
      jsonb_build_object(
        'closeout_summary','Ready Locally from the existing Completed Trip Closeout Review control.',
        'next_action','Continue customer billing preparation review after closeout.'
      ),'admin_api','admin','Owner Admin',repair_timestamp,repair_timestamp
    );
    get diagnostics closeout_affected=row_count;
  end if;

  if (pre_repair_state and (correction_affected<>1 or closeout_affected<>1))
    or (exact_post_repair_state and (correction_affected<>0 or closeout_affected<>0))
  then raise exception 'monthly_billing_10857_affected_row_count_mismatch'; end if;

  if (select md5(to_jsonb(b)::text) from public.bookings b where b.id=179)<>before_booking_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) from public.driver_job_status_events x where x.booking_reference=booking_ref)<>before_status_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) from public.driver_job_links x where x.booking_reference=booking_ref)<>before_links_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) from public.customer_invoice_records x where x.customer_id='163' or x.booker_id=24)<>before_invoice_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) from public.monthly_billing_draft_plans x where x.customer_id='163' or x.booker_id=24)<>before_monthly_plan_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) from public.monthly_invoice_drafts x where x.customer_id='163' or x.booker_id=24)<>before_monthly_draft_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text) from public.customer_access_accounts x where x.customer_account_reference='163' or x.company_id=31 or x.booker_id=24)<>before_access_hash
    or (select md5(jsonb_build_object(
      'admin',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.admin_app_notification_outbox x where x.booking_reference=booking_ref),'[]'::jsonb),
      'customer_driver',coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from public.customer_driver_app_notification_outbox x where x.booking_reference=booking_ref),'[]'::jsonb)
    )::text))<>before_notification_hash
  then raise exception 'monthly_billing_10857_protected_row_drift'; end if;

  if (select count(*) from public.driver_job_dsp_actual_time_events e
      where e.id=correction_id and e.booking_reference=booking_ref
        and e.occurred_at='2026-08-01T06:00:00.000Z'::timestamptz
        and e.safe_event_context->>'billing_started_at'='2026-08-01T04:00:00.000Z'
        and e.safe_event_context->>'actual_time_policy'='admin_billing_time_correction')<>1
    or (select count(*) from public.completed_booking_closeouts c
      where c.id=closeout_id and c.booking_reference=booking_ref
        and c.billing_prep_readiness='ready')<>1
  then raise exception 'monthly_billing_10857_postcondition_failed'; end if;
end;
$migration$;

commit;
