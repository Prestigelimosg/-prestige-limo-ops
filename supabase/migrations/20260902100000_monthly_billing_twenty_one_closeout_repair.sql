-- Mark exactly 21 completed August Monthly Billing jobs Billing ready through
-- the established completed_booking_closeouts record contract. This data
-- repair does not change any saved booking, invoice, monthly draft, Customer,
-- Driver, Calendar, notification, payment or provider row.

begin;

set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
  target_refs constant text[] := array[
    'ADM-20260801124129','ADM-20260802005743','ADM-20260802085532',
    'ADM-20260802100539','ADM-20260802124426','ADM-20260804050652-OUT',
    'ADM-20260804050652-RET','ADM-20260805004012','ADM-20260805140858',
    'ADM-20260808023039-OUT','ADM-20260808023039-RET','ADM-20260809051726',
    'ADM-20260810024005','ADM-20260811112554','ADM-20260815035252',
    'ADM-20260820083526','ADM-20260826031005','ADM-20260828055053',
    'ADM-20260828060134-OUT','ADM-20260829032714','ADM-20260830124434-OUT'
  ];
  target_customer_ids constant bigint[] := array[160,161,164,167,169,170,174,177,180,184,185,190,194,197];
  target_company_ids constant bigint[] := array[30,32,36,37,41,42,45,46,47,48,51,55,56,60];
  target_booker_ids constant bigint[] := array[15,18,19,20,21,22,28,29,31,32,34,35,36,38];
  affected_rows integer := 0;
  booking_state_exact boolean := false;
  pre_repair_state boolean := false;
  exact_post_repair_state boolean := false;
  repair_timestamp timestamptz := clock_timestamp();
  before_bookings_hash text;
  before_links_hash text;
  before_statuses_hash text;
  before_dsp_time_hash text;
  before_invoices_hash text;
  before_monthly_plans_hash text;
  before_monthly_drafts_hash text;
  before_access_hash text;
  before_admin_notifications_hash text;
  before_customer_driver_notifications_hash text;
begin
  perform 1 from public.bookings where booking_reference = any(target_refs) order by id for update;
  perform 1 from public.completed_booking_closeouts where booking_reference = any(target_refs) order by id for update;
  perform 1 from public.driver_job_links where booking_reference = any(target_refs) order by id for update;
  perform 1 from public.driver_job_status_events where booking_reference = any(target_refs) order by id for update;
  perform 1 from public.driver_job_dsp_actual_time_events where booking_reference = any(target_refs) order by id for update;
  perform 1 from public.customer_invoice_records where customer_id::bigint = any(target_customer_ids) or booker_id = any(target_booker_ids) order by id for update;
  perform 1 from public.monthly_billing_draft_plans where customer_id::bigint = any(target_customer_ids) or booker_id = any(target_booker_ids) order by id for update;
  perform 1 from public.monthly_invoice_drafts where customer_id::bigint = any(target_customer_ids) or booker_id = any(target_booker_ids) order by id for update;
  perform 1 from public.customer_access_accounts where customer_account_reference::bigint = any(target_customer_ids) or company_id = any(target_company_ids) or booker_id = any(target_booker_ids) order by id for update;
  perform 1 from public.admin_app_notification_outbox where booking_reference = any(target_refs) order by id for update;
  perform 1 from public.customer_driver_app_notification_outbox where booking_reference = any(target_refs) order by id for update;

  select md5(jsonb_agg(to_jsonb(x) order by x.id)::text)
    into before_bookings_hash from public.bookings x where x.booking_reference = any(target_refs);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text)
    into before_links_hash from public.driver_job_links x where x.booking_reference = any(target_refs);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text)
    into before_statuses_hash from public.driver_job_status_events x where x.booking_reference = any(target_refs);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text)
    into before_dsp_time_hash from public.driver_job_dsp_actual_time_events x where x.booking_reference = any(target_refs);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text)
    into before_invoices_hash from public.customer_invoice_records x where x.customer_id::bigint = any(target_customer_ids) or x.booker_id = any(target_booker_ids);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text)
    into before_monthly_plans_hash from public.monthly_billing_draft_plans x where x.customer_id::bigint = any(target_customer_ids) or x.booker_id = any(target_booker_ids);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text)
    into before_monthly_drafts_hash from public.monthly_invoice_drafts x where x.customer_id::bigint = any(target_customer_ids) or x.booker_id = any(target_booker_ids);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text)
    into before_access_hash from public.customer_access_accounts x where x.customer_account_reference::bigint = any(target_customer_ids) or x.company_id = any(target_company_ids) or x.booker_id = any(target_booker_ids);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text)
    into before_admin_notifications_hash from public.admin_app_notification_outbox x where x.booking_reference = any(target_refs);
  select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text)
    into before_customer_driver_notifications_hash from public.customer_driver_app_notification_outbox x where x.booking_reference = any(target_refs);

  select count(*) = 21 and bool_and(
    b.public_booking_reference = t.public_ref
    and b.customer_id = t.customer_id
    and b.company_id = t.company_id
    and b.booker_id = t.booker_id
    and b.traveler_id is not distinct from t.traveler_id
    and b.admin_internal_status = 'completed'
    and b.status = 'completed'
    and b.updated_at = t.updated_at
    and md5(to_jsonb(b)::text) = t.full_hash
  ) into booking_state_exact
  from public.bookings b
  join (values
    (175,'10853','ADM-20260801124129',160,32,36,null::bigint,'2026-08-01T13:08:00.375Z'::timestamptz,'0a5bc6fcf2836c7d13f231b395bce75b'),
    (180,'10858','ADM-20260802005743',164,60,38,null::bigint,'2026-08-02T00:58:03.96Z'::timestamptz,'bd0d49c6003d5013246f4eec7b683fc3'),
    (184,'10862','ADM-20260802085532',167,30,29,null::bigint,'2026-08-03T00:51:38.155Z'::timestamptz,'918c28e664ad312eda42c83b8c59d791'),
    (186,'10864','ADM-20260802100539',169,36,18,31::bigint,'2026-08-05T10:02:38.118Z'::timestamptz,'931801462964ab2a4f64c91b46d7a9f9'),
    (187,'10865','ADM-20260802124426',170,37,19,32::bigint,'2026-08-05T11:08:13.153Z'::timestamptz,'d317463d904f99b8fc4df138c7f401b6'),
    (192,'10870','ADM-20260804050652-OUT',197,56,28,44::bigint,'2026-08-31T16:50:05.600701Z'::timestamptz,'b47a4410e3c3484ce8d580de8693118c'),
    (193,'10871','ADM-20260804050652-RET',197,56,28,44::bigint,'2026-08-31T16:50:05.617867Z'::timestamptz,'3fa5c57cb18782b511857421bd5192d3'),
    (194,'10872','ADM-20260805004012',161,42,35,null::bigint,'2026-08-06T06:31:30.436Z'::timestamptz,'d3be22006ec5e4b83786d6d225cb396f'),
    (195,'10873','ADM-20260805140858',177,45,20,33::bigint,'2026-08-06T13:35:52.461Z'::timestamptz,'501bcc169e8a1e3f87e548c0178bf214'),
    (199,'10877','ADM-20260808023039-OUT',180,46,31,null::bigint,'2026-09-02T01:06:59.252Z'::timestamptz,'6a0d644410e6e0c511a4d5bc97edb20c'),
    (200,'10878','ADM-20260808023039-RET',180,46,31,null::bigint,'2026-08-16T02:46:43.147Z'::timestamptz,'f1589b3b1c5a86413abe47bca0e46e39'),
    (205,'10883','ADM-20260809051726',174,41,15,28::bigint,'2026-08-23T11:45:03.707Z'::timestamptz,'75d95ea66c3740c289dedd9ca586b43c'),
    (207,'10885','ADM-20260810024005',184,47,21,35::bigint,'2026-08-11T11:25:41.157Z'::timestamptz,'21688817878cdce6ead21662d86ff784'),
    (210,'10888','ADM-20260811112554',185,48,22,36::bigint,'2026-08-11T11:26:08.727Z'::timestamptz,'2a92594c837d0f4c780474d574b933c7'),
    (212,'10890','ADM-20260815035252',161,42,35,null::bigint,'2026-08-16T02:53:01.407Z'::timestamptz,'03a163f2ba7fd2c9eb537554657a846f'),
    (218,'10896','ADM-20260820083526',190,51,34,null::bigint,'2026-08-22T00:54:53.222Z'::timestamptz,'f84425c100750befd8c6e6fd4094ed2c'),
    (225,'10903','ADM-20260826031005',194,55,32,null::bigint,'2026-09-01T12:16:50.4782Z'::timestamptz,'fb935dc783e108d05719ea6c44ad0213'),
    (234,'10911','ADM-20260828055053',194,55,32,null::bigint,'2026-09-01T12:16:50.4782Z'::timestamptz,'8407e8e54c972d0c11dd589a116202a4'),
    (235,'10912','ADM-20260828060134-OUT',197,56,28,42::bigint,'2026-08-31T11:38:53.465Z'::timestamptz,'e6241c0b025d68fdb6358512a792a223'),
    (237,'10914','ADM-20260829032714',167,30,29,43::bigint,'2026-08-31T13:06:29.176Z'::timestamptz,'93053ece6d5bba92e782e3ed984cbced'),
    (241,'10918','ADM-20260830124434-OUT',170,37,19,null::bigint,'2026-08-31T13:04:23.139Z'::timestamptz,'12fef866d21e7be7d5a08f1e5718bd43')
  ) t(id,public_ref,booking_ref,customer_id,company_id,booker_id,traveler_id,updated_at,full_hash)
    on b.id=t.id and b.booking_reference=t.booking_ref;

  select count(*) = 0 into pre_repair_state
    from public.completed_booking_closeouts where booking_reference = any(target_refs);

  select count(*) = 21 and bool_and(
    c.id = t.closeout_id
    and c.closeout_status = 'ready_for_billing_prep'
    and c.completed_job_status = 'completed'
    and c.dsp_actual_hours_readiness = 'ready'
    and c.extra_charges_readiness = 'ready'
    and c.billing_prep_readiness = 'ready'
    and c.safe_closeout_note = 'Admin marked completed job billing ready from Completed / History.'
    and c.safe_closeout_context = jsonb_build_object(
      'closeout_summary','Ready Locally from the existing Completed Trip Closeout Review control.',
      'next_action','Continue customer billing preparation review after closeout.'
    )
    and c.source_surface = 'admin_api'
    and c.actor_role = 'admin'
    and c.actor_label = 'Owner Admin'
  ) into exact_post_repair_state
  from public.completed_booking_closeouts c
  join (values
    ('cc0d3b40-e274-42fb-bb28-7cf3d93a5f50'::uuid,'ADM-20260801124129'),
    ('22bb05e3-51ba-4220-b4e5-b5733199cd75'::uuid,'ADM-20260802005743'),
    ('5e4cc8d9-02c5-4555-a489-b08cda61f01b'::uuid,'ADM-20260802085532'),
    ('36369409-8c2f-4027-9f22-5e9e76a4edf7'::uuid,'ADM-20260802100539'),
    ('1914c691-2571-4219-a500-c5456ac8a043'::uuid,'ADM-20260802124426'),
    ('8f76e2b4-b720-44ba-89d6-0448e9a73b06'::uuid,'ADM-20260804050652-OUT'),
    ('34747c93-abf5-440d-b1fb-04df975b9c73'::uuid,'ADM-20260804050652-RET'),
    ('24cd16c8-55b4-4c9d-a1a4-cb6cc4cd2427'::uuid,'ADM-20260805004012'),
    ('2ea50f0f-c9ab-4bb1-86f2-e94da3c83cbb'::uuid,'ADM-20260805140858'),
    ('6fc466e0-5683-4f14-91c6-60d9d7b837a0'::uuid,'ADM-20260808023039-OUT'),
    ('40561ec3-edab-4c42-a599-a9e2582790aa'::uuid,'ADM-20260808023039-RET'),
    ('9221f2e4-c474-4d16-ac40-a7e73027c769'::uuid,'ADM-20260809051726'),
    ('1be29805-f040-426d-821a-9614c129dea8'::uuid,'ADM-20260810024005'),
    ('4a562cac-0938-451e-b56e-00841bb0b983'::uuid,'ADM-20260811112554'),
    ('c68cb257-e954-4f6f-95df-2c3c7e12ec02'::uuid,'ADM-20260815035252'),
    ('e32c7416-2bdb-4463-b184-e8086647e597'::uuid,'ADM-20260820083526'),
    ('a0b9cfd1-b68d-4579-b9c8-bcd18758f1af'::uuid,'ADM-20260826031005'),
    ('15b0c25c-df13-4521-b8cb-4bcb9c68ab2f'::uuid,'ADM-20260828055053'),
    ('b19a0c27-e184-44ef-be73-690417607a36'::uuid,'ADM-20260828060134-OUT'),
    ('d7dfad57-354c-4702-83b9-1e3d5b1cb577'::uuid,'ADM-20260829032714'),
    ('990be1d2-4d85-42e0-bd33-0305eb05828f'::uuid,'ADM-20260830124434-OUT')
  ) t(closeout_id,booking_ref) on c.booking_reference=t.booking_ref;

  if not booking_state_exact then raise exception 'monthly_billing_closeout_booking_precondition_drift'; end if;
  if not (pre_repair_state or exact_post_repair_state) then raise exception 'monthly_billing_closeout_record_precondition_drift'; end if;

  if pre_repair_state then
    insert into public.completed_booking_closeouts (
      id,booking_reference,closeout_status,completed_job_status,
      dsp_actual_hours_readiness,extra_charges_readiness,billing_prep_readiness,
      safe_closeout_note,safe_closeout_context,source_surface,actor_role,actor_label,
      created_at,updated_at
    )
    select
      t.closeout_id,t.booking_ref,'ready_for_billing_prep','completed','ready','ready','ready',
      'Admin marked completed job billing ready from Completed / History.',
      jsonb_build_object(
        'closeout_summary','Ready Locally from the existing Completed Trip Closeout Review control.',
        'next_action','Continue customer billing preparation review after closeout.'
      ),
      'admin_api','admin','Owner Admin',repair_timestamp,repair_timestamp
    from (values
      ('cc0d3b40-e274-42fb-bb28-7cf3d93a5f50'::uuid,'ADM-20260801124129'),
      ('22bb05e3-51ba-4220-b4e5-b5733199cd75'::uuid,'ADM-20260802005743'),
      ('5e4cc8d9-02c5-4555-a489-b08cda61f01b'::uuid,'ADM-20260802085532'),
      ('36369409-8c2f-4027-9f22-5e9e76a4edf7'::uuid,'ADM-20260802100539'),
      ('1914c691-2571-4219-a500-c5456ac8a043'::uuid,'ADM-20260802124426'),
      ('8f76e2b4-b720-44ba-89d6-0448e9a73b06'::uuid,'ADM-20260804050652-OUT'),
      ('34747c93-abf5-440d-b1fb-04df975b9c73'::uuid,'ADM-20260804050652-RET'),
      ('24cd16c8-55b4-4c9d-a1a4-cb6cc4cd2427'::uuid,'ADM-20260805004012'),
      ('2ea50f0f-c9ab-4bb1-86f2-e94da3c83cbb'::uuid,'ADM-20260805140858'),
      ('6fc466e0-5683-4f14-91c6-60d9d7b837a0'::uuid,'ADM-20260808023039-OUT'),
      ('40561ec3-edab-4c42-a599-a9e2582790aa'::uuid,'ADM-20260808023039-RET'),
      ('9221f2e4-c474-4d16-ac40-a7e73027c769'::uuid,'ADM-20260809051726'),
      ('1be29805-f040-426d-821a-9614c129dea8'::uuid,'ADM-20260810024005'),
      ('4a562cac-0938-451e-b56e-00841bb0b983'::uuid,'ADM-20260811112554'),
      ('c68cb257-e954-4f6f-95df-2c3c7e12ec02'::uuid,'ADM-20260815035252'),
      ('e32c7416-2bdb-4463-b184-e8086647e597'::uuid,'ADM-20260820083526'),
      ('a0b9cfd1-b68d-4579-b9c8-bcd18758f1af'::uuid,'ADM-20260826031005'),
      ('15b0c25c-df13-4521-b8cb-4bcb9c68ab2f'::uuid,'ADM-20260828055053'),
      ('b19a0c27-e184-44ef-be73-690417607a36'::uuid,'ADM-20260828060134-OUT'),
      ('d7dfad57-354c-4702-83b9-1e3d5b1cb577'::uuid,'ADM-20260829032714'),
      ('990be1d2-4d85-42e0-bd33-0305eb05828f'::uuid,'ADM-20260830124434-OUT')
    ) t(closeout_id,booking_ref);
    get diagnostics affected_rows = row_count;
  end if;

  if (pre_repair_state and affected_rows <> 21) or (exact_post_repair_state and affected_rows <> 0)
  then raise exception 'monthly_billing_closeout_affected_row_count_mismatch'; end if;

  if (select md5(jsonb_agg(to_jsonb(x) order by x.id)::text) from public.bookings x where x.booking_reference = any(target_refs)) <> before_bookings_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.driver_job_links x where x.booking_reference = any(target_refs)) <> before_links_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.driver_job_status_events x where x.booking_reference = any(target_refs)) <> before_statuses_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.driver_job_dsp_actual_time_events x where x.booking_reference = any(target_refs)) <> before_dsp_time_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.customer_invoice_records x where x.customer_id::bigint = any(target_customer_ids) or x.booker_id = any(target_booker_ids)) <> before_invoices_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.monthly_billing_draft_plans x where x.customer_id::bigint = any(target_customer_ids) or x.booker_id = any(target_booker_ids)) <> before_monthly_plans_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.monthly_invoice_drafts x where x.customer_id::bigint = any(target_customer_ids) or x.booker_id = any(target_booker_ids)) <> before_monthly_drafts_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.customer_access_accounts x where x.customer_account_reference::bigint = any(target_customer_ids) or x.company_id = any(target_company_ids) or x.booker_id = any(target_booker_ids)) <> before_access_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.admin_app_notification_outbox x where x.booking_reference = any(target_refs)) <> before_admin_notifications_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)::text) from public.customer_driver_app_notification_outbox x where x.booking_reference = any(target_refs)) <> before_customer_driver_notifications_hash
  then raise exception 'monthly_billing_closeout_protected_row_drift'; end if;

  if (select count(*) from public.completed_booking_closeouts c
      where c.booking_reference = any(target_refs)
        and c.closeout_status='ready_for_billing_prep'
        and c.completed_job_status='completed'
        and c.dsp_actual_hours_readiness='ready'
        and c.extra_charges_readiness='ready'
        and c.billing_prep_readiness='ready'
        and c.source_surface='admin_api'
        and c.actor_role='admin'
        and c.actor_label='Owner Admin') <> 21
  then raise exception 'monthly_billing_closeout_postcondition_failed'; end if;
end;
$migration$;

commit;
