-- Repair exactly nine August Monthly Billing bookings to their already-proven
-- Customer + Company + Booker profiles. Traveller remains null. No profile,
-- pricing, invoice, monthly, access, Driver, notification or provider row moves.

begin;

set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
  affected_rows integer;
  before_bookings_protected_hash text;
  before_customers_hash text;
  before_companies_hash text;
  before_bookers_hash text;
  before_contacts_hash text;
  before_invoice_hash text;
  before_monthly_plan_hash text;
  before_monthly_invoice_hash text;
  before_access_hash text;
  before_links_hash text;
  before_statuses_hash text;
  before_closeout_hash text;
  before_dsp_time_hash text;
  before_admin_notifications_hash text;
  before_customer_driver_notifications_hash text;
  pre_repair_state boolean;
  exact_post_repair_state boolean;
begin
  perform 1 from public.customers where id in (160, 161, 163, 164, 167, 180, 190) order by id for update;
  perform 1 from public.companies where id in (30, 31, 32, 42, 46, 51, 60) order by id for update;
  perform 1 from public.bookers where id in (24, 29, 31, 34, 35, 36, 38) order by id for update;
  perform 1 from public.bookings where id in (175, 179, 180, 184, 194, 199, 200, 212, 218) order by id for update;
  perform 1 from public.customer_contacts where customer_id in ('160', '161', '163', '164', '167', '180', '190') order by id for update;
  perform 1 from public.customer_invoice_records where customer_id in ('160', '161', '163', '164', '167', '180', '190') or booker_id in (24, 29, 31, 34, 35, 36, 38) order by id for update;
  perform 1 from public.monthly_billing_draft_plans where customer_id in ('160', '161', '163', '164', '167', '180', '190') or booker_id in (24, 29, 31, 34, 35, 36, 38) order by id for update;
  perform 1 from public.monthly_invoice_drafts where customer_id in ('160', '161', '163', '164', '167', '180', '190') or booker_id in (24, 29, 31, 34, 35, 36, 38) order by id for update;
  perform 1 from public.customer_access_accounts where customer_account_reference in ('160', '161', '163', '164', '167', '180', '190') or company_id in (30, 31, 32, 42, 46, 51, 60) or booker_id in (24, 29, 31, 34, 35, 36, 38) order by id for update;
  perform 1 from public.driver_job_links where booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526') order by id for update;
  perform 1 from public.driver_job_status_events where booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526') order by id for update;
  perform 1 from public.completed_booking_closeouts where booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526') order by id for update;
  perform 1 from public.driver_job_dsp_actual_time_events where booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526') order by id for update;
  perform 1 from public.admin_app_notification_outbox where booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526') order by id for update;
  perform 1 from public.customer_driver_app_notification_outbox where booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526') order by id for update;

  select md5(jsonb_agg((to_jsonb(b) - 'company_id' - 'booker_id') order by b.id)::text)
  into before_bookings_protected_hash from public.bookings b where b.id in (175, 179, 180, 184, 194, 199, 200, 212, 218);
  select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into before_customers_hash from public.customers c where c.id in (160, 161, 163, 164, 167, 180, 190);
  select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into before_companies_hash from public.companies c where c.id in (30, 31, 32, 42, 46, 51, 60);
  select md5(jsonb_agg(to_jsonb(b) order by b.id)::text) into before_bookers_hash from public.bookers b where b.id in (24, 29, 31, 34, 35, 36, 38);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_contacts_hash from public.customer_contacts x where x.customer_id in ('160', '161', '163', '164', '167', '180', '190');
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_invoice_hash from public.customer_invoice_records x where x.customer_id in ('160', '161', '163', '164', '167', '180', '190') or x.booker_id in (24, 29, 31, 34, 35, 36, 38);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_monthly_plan_hash from public.monthly_billing_draft_plans x where x.customer_id in ('160', '161', '163', '164', '167', '180', '190') or x.booker_id in (24, 29, 31, 34, 35, 36, 38);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_monthly_invoice_hash from public.monthly_invoice_drafts x where x.customer_id in ('160', '161', '163', '164', '167', '180', '190') or x.booker_id in (24, 29, 31, 34, 35, 36, 38);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_access_hash from public.customer_access_accounts x where x.customer_account_reference in ('160', '161', '163', '164', '167', '180', '190') or x.company_id in (30, 31, 32, 42, 46, 51, 60) or x.booker_id in (24, 29, 31, 34, 35, 36, 38);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_links_hash from public.driver_job_links x where x.booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526');
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_statuses_hash from public.driver_job_status_events x where x.booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526');
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_closeout_hash from public.completed_booking_closeouts x where x.booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526');
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_dsp_time_hash from public.driver_job_dsp_actual_time_events x where x.booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526');
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_admin_notifications_hash from public.admin_app_notification_outbox x where x.booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526');
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) into before_customer_driver_notifications_hash from public.customer_driver_app_notification_outbox x where x.booking_reference in ('ADM-20260801124129', 'ADM-20260802004935', 'ADM-20260802005743', 'ADM-20260802085532', 'ADM-20260805004012', 'ADM-20260808023039-OUT', 'ADM-20260808023039-RET', 'ADM-20260815035252', 'ADM-20260820083526');

  select count(*) = 9 and bool_and(
    b.public_booking_reference = t.public_ref and b.customer_id = t.customer_id
    and b.company_id is not distinct from t.current_company and b.booker_id is null and b.traveler_id is null
    and b.updated_at = t.updated_at and md5(to_jsonb(b)::text) = t.full_hash
    and md5((to_jsonb(b) - 'company_id' - 'booker_id')::text) = t.protected_hash
  ) into pre_repair_state
  from public.bookings b
  join (values
    (175, '10853', 'ADM-20260801124129', 160, null::bigint, 32, 36, '2026-08-01T13:08:00.375+00:00'::timestamptz, '2f0a84c767a32c8cac224a24f5a8bef9', 'e6ae44c22dd96fec9798b0fb65e6daa8'),
    (179, '10857', 'ADM-20260802004935', 163, null::bigint, 31, 24, '2026-08-02T00:49:57.836+00:00'::timestamptz, '474fcd5b1a46e486a6b473ab95d815d7', '908b3de7d82b2f835bb922a795aebb57'),
    (180, '10858', 'ADM-20260802005743', 164, null::bigint, 60, 38, '2026-08-02T00:58:03.96+00:00'::timestamptz, '0332a9724e81b5afb588d8d769298d19', 'efe162c451fdd4c65223df9e1ba66a80'),
    (184, '10862', 'ADM-20260802085532', 167, 30::bigint, 30, 29, '2026-08-03T00:51:38.155+00:00'::timestamptz, '55ac2b511b043763b31d754248ad5eda', 'a5effdeb93f9542362759f02b32a71a0'),
    (194, '10872', 'ADM-20260805004012', 161, 42::bigint, 42, 35, '2026-08-06T06:31:30.436+00:00'::timestamptz, '6ea6a1cfb0638b99be99b85a497f2a7f', '271692cd47499d84484b488946437fec'),
    (199, '10877', 'ADM-20260808023039-OUT', 180, 46::bigint, 46, 31, '2026-09-02T00:10:32.747+00:00'::timestamptz, '8c8b92eafec7b0c5b0b4aff7fe962839', '53c79a0bec6545f4015b0715f00f84c0'),
    (200, '10878', 'ADM-20260808023039-RET', 180, 46::bigint, 46, 31, '2026-08-16T02:46:43.147+00:00'::timestamptz, 'bb6568f2a4e8ea7c11ee65a2b8b2245a', 'c5ce69307992a96e20bc6d881797c4aa'),
    (212, '10890', 'ADM-20260815035252', 161, 42::bigint, 42, 35, '2026-08-16T02:53:01.407+00:00'::timestamptz, '5bbc55b7a3f8a1c49333f1204a051c53', 'bf83a134c1d8547b5ef46e841cc3b25e'),
    (218, '10896', 'ADM-20260820083526', 190, 51::bigint, 51, 34, '2026-08-22T00:54:53.222+00:00'::timestamptz, 'bfbacfbb00c4f8a0059427c16fbb37b1', '83cf2d84e6bb1666ec764961b5a732ad')
  ) t(id, public_ref, booking_ref, customer_id, current_company, target_company, target_booker, updated_at, full_hash, protected_hash) on b.id = t.id and b.booking_reference = t.booking_ref;

  select count(*) = 9 and bool_and(
    b.public_booking_reference = t.public_ref and b.customer_id = t.customer_id
    and b.company_id = t.target_company and b.booker_id = t.target_booker and b.traveler_id is null
    and b.updated_at = t.updated_at and md5((to_jsonb(b) - 'company_id' - 'booker_id')::text) = t.protected_hash
  ) into exact_post_repair_state
  from public.bookings b
  join (values
    (175, '10853', 'ADM-20260801124129', 160, 32, 36, '2026-08-01T13:08:00.375+00:00'::timestamptz, 'e6ae44c22dd96fec9798b0fb65e6daa8'),
    (179, '10857', 'ADM-20260802004935', 163, 31, 24, '2026-08-02T00:49:57.836+00:00'::timestamptz, '908b3de7d82b2f835bb922a795aebb57'),
    (180, '10858', 'ADM-20260802005743', 164, 60, 38, '2026-08-02T00:58:03.96+00:00'::timestamptz, 'efe162c451fdd4c65223df9e1ba66a80'),
    (184, '10862', 'ADM-20260802085532', 167, 30, 29, '2026-08-03T00:51:38.155+00:00'::timestamptz, 'a5effdeb93f9542362759f02b32a71a0'),
    (194, '10872', 'ADM-20260805004012', 161, 42, 35, '2026-08-06T06:31:30.436+00:00'::timestamptz, '271692cd47499d84484b488946437fec'),
    (199, '10877', 'ADM-20260808023039-OUT', 180, 46, 31, '2026-09-02T00:10:32.747+00:00'::timestamptz, '53c79a0bec6545f4015b0715f00f84c0'),
    (200, '10878', 'ADM-20260808023039-RET', 180, 46, 31, '2026-08-16T02:46:43.147+00:00'::timestamptz, 'c5ce69307992a96e20bc6d881797c4aa'),
    (212, '10890', 'ADM-20260815035252', 161, 42, 35, '2026-08-16T02:53:01.407+00:00'::timestamptz, 'bf83a134c1d8547b5ef46e841cc3b25e'),
    (218, '10896', 'ADM-20260820083526', 190, 51, 34, '2026-08-22T00:54:53.222+00:00'::timestamptz, '83cf2d84e6bb1666ec764961b5a732ad')
  ) t(id, public_ref, booking_ref, customer_id, target_company, target_booker, updated_at, protected_hash) on b.id = t.id and b.booking_reference = t.booking_ref;

  if not (pre_repair_state or exact_post_repair_state) then raise exception 'monthly_billing_nine_precondition_drift'; end if;

  if (select count(*) from public.customers where id in (160, 161, 163, 164, 167, 180, 190)) <> 7
    or (select count(*) from public.companies where id in (30, 31, 32, 42, 46, 51, 60) and customer_rates = '{}'::jsonb) <> 7
    or (select count(*) from public.bookers where (id, company_id, customer_id) in ((24,31,163),(29,30,167),(31,46,180),(34,51,190),(35,42,161),(36,32,160),(38,60,164)) and customer_rates = '{}'::jsonb) <> 7
    or exists (select 1 from public.bookers where customer_id in (160,161,163,164,167,180,190) and id not in (24,29,31,34,35,36,38))
    or before_contacts_hash <> '3ba7dd84fcc24300b8a0e744fe1266cf'
    or before_invoice_hash <> 'd751713988987e9331980363e24189ce'
    or before_monthly_plan_hash <> 'd751713988987e9331980363e24189ce'
    or before_monthly_invoice_hash <> 'd751713988987e9331980363e24189ce'
    or before_access_hash <> 'd751713988987e9331980363e24189ce'
    or before_links_hash <> '5990f4359b692bb77433150ed7550041'
    or before_statuses_hash <> '4e33f0aabf36726a673b6879bab5c02d'
    or before_closeout_hash <> 'd751713988987e9331980363e24189ce'
    or before_dsp_time_hash <> 'b834634a9b551fc8cfd5193431a847d6'
    or before_admin_notifications_hash <> 'd751713988987e9331980363e24189ce'
    or before_customer_driver_notifications_hash <> '5fe1edebea5630f67e2866d93a67c036'
  then raise exception 'monthly_billing_nine_dependency_drift'; end if;

  if pre_repair_state then
    update public.bookings b set company_id = t.target_company, booker_id = t.target_booker
    from (values
      (175,32,36),(179,31,24),(180,60,38),(184,30,29),(194,42,35),
      (199,46,31),(200,46,31),(212,42,35),(218,51,34)
    ) t(id, target_company, target_booker)
    where b.id = t.id and b.booker_id is null and b.traveler_id is null;
    get diagnostics affected_rows = row_count;
  else
    affected_rows := 0;
  end if;

  if (pre_repair_state and affected_rows <> 9) or (exact_post_repair_state and affected_rows <> 0)
  then raise exception 'monthly_billing_nine_affected_row_count_mismatch'; end if;

  if (select md5(jsonb_agg((to_jsonb(b) - 'company_id' - 'booker_id') order by b.id)::text) from public.bookings b where b.id in (175,179,180,184,194,199,200,212,218)) <> before_bookings_protected_hash
    or (select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) from public.customers c where c.id in (160,161,163,164,167,180,190)) <> before_customers_hash
    or (select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) from public.companies c where c.id in (30,31,32,42,46,51,60)) <> before_companies_hash
    or (select md5(jsonb_agg(to_jsonb(b) order by b.id)::text) from public.bookers b where b.id in (24,29,31,34,35,36,38)) <> before_bookers_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.customer_contacts x where x.customer_id in ('160','161','163','164','167','180','190')) <> before_contacts_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.customer_invoice_records x where x.customer_id in ('160','161','163','164','167','180','190') or x.booker_id in (24,29,31,34,35,36,38)) <> before_invoice_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.monthly_billing_draft_plans x where x.customer_id in ('160','161','163','164','167','180','190') or x.booker_id in (24,29,31,34,35,36,38)) <> before_monthly_plan_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.monthly_invoice_drafts x where x.customer_id in ('160','161','163','164','167','180','190') or x.booker_id in (24,29,31,34,35,36,38)) <> before_monthly_invoice_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.customer_access_accounts x where x.customer_account_reference in ('160','161','163','164','167','180','190') or x.company_id in (30,31,32,42,46,51,60) or x.booker_id in (24,29,31,34,35,36,38)) <> before_access_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.driver_job_links x where x.booking_reference in ('ADM-20260801124129','ADM-20260802004935','ADM-20260802005743','ADM-20260802085532','ADM-20260805004012','ADM-20260808023039-OUT','ADM-20260808023039-RET','ADM-20260815035252','ADM-20260820083526')) <> before_links_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.driver_job_status_events x where x.booking_reference in ('ADM-20260801124129','ADM-20260802004935','ADM-20260802005743','ADM-20260802085532','ADM-20260805004012','ADM-20260808023039-OUT','ADM-20260808023039-RET','ADM-20260815035252','ADM-20260820083526')) <> before_statuses_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.completed_booking_closeouts x where x.booking_reference in ('ADM-20260801124129','ADM-20260802004935','ADM-20260802005743','ADM-20260802085532','ADM-20260805004012','ADM-20260808023039-OUT','ADM-20260808023039-RET','ADM-20260815035252','ADM-20260820083526')) <> before_closeout_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.driver_job_dsp_actual_time_events x where x.booking_reference in ('ADM-20260801124129','ADM-20260802004935','ADM-20260802005743','ADM-20260802085532','ADM-20260805004012','ADM-20260808023039-OUT','ADM-20260808023039-RET','ADM-20260815035252','ADM-20260820083526')) <> before_dsp_time_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.admin_app_notification_outbox x where x.booking_reference in ('ADM-20260801124129','ADM-20260802004935','ADM-20260802005743','ADM-20260802085532','ADM-20260805004012','ADM-20260808023039-OUT','ADM-20260808023039-RET','ADM-20260815035252','ADM-20260820083526')) <> before_admin_notifications_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.customer_driver_app_notification_outbox x where x.booking_reference in ('ADM-20260801124129','ADM-20260802004935','ADM-20260802005743','ADM-20260802085532','ADM-20260805004012','ADM-20260808023039-OUT','ADM-20260808023039-RET','ADM-20260815035252','ADM-20260820083526')) <> before_customer_driver_notifications_hash
  then raise exception 'monthly_billing_nine_protected_row_drift'; end if;

  if (select count(*) from public.bookings b
    join (values (175,32,36),(179,31,24),(180,60,38),(184,30,29),(194,42,35),(199,46,31),(200,46,31),(212,42,35),(218,51,34)) t(id,company_id,booker_id)
      on b.id=t.id and b.company_id=t.company_id and b.booker_id=t.booker_id
    where b.traveler_id is null) <> 9
  then raise exception 'monthly_billing_nine_postcondition_failed'; end if;
end;
$migration$;

commit;
