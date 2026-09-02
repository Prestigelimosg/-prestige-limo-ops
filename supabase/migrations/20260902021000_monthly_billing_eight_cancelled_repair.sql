-- Mark exactly eight owner-confirmed historic Monthly Billing bookings
-- Cancelled. Preserve every operational, billing, access, notification,
-- Driver, GPS, photo, Calendar-link and provider evidence row.

begin;

set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
  affected_rows integer := 0;
  before_bookings_protected_hash text;
  before_dependencies_hash text;
  after_dependencies_hash text;
  pre_repair_state boolean;
  exact_post_repair_state boolean;
  repair_timestamp constant timestamptz := '2026-09-02T02:10:00Z';
begin
  perform 1 from public.bookings where id in (183,185,191,198,202,203,211,219) order by id for update;
  perform 1 from public.customers where id in (166,168,174,186) order by id for update;
  perform 1 from public.companies where id in (34,35,41,49) order by id for update;
  perform 1 from public.customer_contacts where customer_id in (166,168,174,186) order by id for update;
  perform 1 from public.drivers where id in (12,15,17) order by id for update;
  perform 1 from public.customer_invoice_records where customer_id::bigint in (166,168,174,186) order by id for update;
  perform 1 from public.monthly_billing_draft_plans where customer_id::bigint in (166,168,174,186) order by id for update;
  perform 1 from public.monthly_invoice_drafts where customer_id::bigint in (166,168,174,186) order by id for update;
  perform 1 from public.customer_access_accounts where customer_account_reference::bigint in (166,168,174,186) or company_id in (34,35,41,49) order by id for update;
  perform 1 from public.admin_app_notification_outbox where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.audit_logs where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.booking_workflow_statuses where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.completed_booking_closeouts where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.customer_driver_app_notification_outbox where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.driver_job_bid_offers where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.driver_job_bids where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.driver_job_dsp_actual_time_events where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.driver_job_links where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.driver_job_status_events where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.driver_live_location_audit_events where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.driver_live_location_latest_positions where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.driver_ots_photo_proofs where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.monthly_invoice_billable_item_price_reviews where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.monthly_invoice_draft_item_reviews where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;
  perform 1 from public.monthly_invoice_draft_trip_links where booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132']) order by id for update;

  select md5(jsonb_agg(to_jsonb(b)-'status'-'admin_internal_status'-'customer_facing_status'-'cancellation_review_status'-'updated_at' order by b.id)::text)
    into before_bookings_protected_hash from public.bookings b where b.id in (183,185,191,198,202,203,211,219);

  with deps(scope,row_key,row_value) as (
    select 'customers',x.id::text,to_jsonb(x) from public.customers x where x.id in (166,168,174,186)
    union all select 'companies',x.id::text,to_jsonb(x) from public.companies x where x.id in (34,35,41,49)
    union all select 'customer_contacts',x.id::text,to_jsonb(x) from public.customer_contacts x where x.customer_id in (166,168,174,186)
    union all select 'drivers',x.id::text,to_jsonb(x) from public.drivers x where x.id in (12,15,17)
    union all select 'customer_invoice_records',x.id::text,to_jsonb(x) from public.customer_invoice_records x where x.customer_id::bigint in (166,168,174,186)
    union all select 'monthly_billing_draft_plans',x.id::text,to_jsonb(x) from public.monthly_billing_draft_plans x where x.customer_id::bigint in (166,168,174,186)
    union all select 'monthly_invoice_drafts',x.id::text,to_jsonb(x) from public.monthly_invoice_drafts x where x.customer_id::bigint in (166,168,174,186)
    union all select 'customer_access_accounts',x.id::text,to_jsonb(x) from public.customer_access_accounts x where x.customer_account_reference::bigint in (166,168,174,186) or x.company_id in (34,35,41,49)
    union all select 'admin_app_notification_outbox',x.id::text,to_jsonb(x) from public.admin_app_notification_outbox x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'audit_logs',x.id::text,to_jsonb(x) from public.audit_logs x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'booking_workflow_statuses',x.id::text,to_jsonb(x) from public.booking_workflow_statuses x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'completed_booking_closeouts',x.id::text,to_jsonb(x) from public.completed_booking_closeouts x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'customer_driver_app_notification_outbox',x.id::text,to_jsonb(x) from public.customer_driver_app_notification_outbox x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_bid_offers',x.id::text,to_jsonb(x) from public.driver_job_bid_offers x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_bids',x.id::text,to_jsonb(x) from public.driver_job_bids x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_dsp_actual_time_events',x.id::text,to_jsonb(x) from public.driver_job_dsp_actual_time_events x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_dsp_actual_time_summaries',x.booking_reference,to_jsonb(x) from public.driver_job_dsp_actual_time_summaries x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_links',x.id::text,to_jsonb(x) from public.driver_job_links x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_status_events',x.id::text,to_jsonb(x) from public.driver_job_status_events x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_live_location_audit_events',x.id::text,to_jsonb(x) from public.driver_live_location_audit_events x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_live_location_latest_positions',x.id::text,to_jsonb(x) from public.driver_live_location_latest_positions x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_ots_photo_proofs',x.id::text,to_jsonb(x) from public.driver_ots_photo_proofs x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'monthly_invoice_billable_item_price_reviews',x.id::text,to_jsonb(x) from public.monthly_invoice_billable_item_price_reviews x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'monthly_invoice_draft_item_reviews',x.id::text,to_jsonb(x) from public.monthly_invoice_draft_item_reviews x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'monthly_invoice_draft_trip_links',x.id::text,to_jsonb(x) from public.monthly_invoice_draft_trip_links x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
  )
  select md5(coalesce(jsonb_agg(jsonb_build_object('scope',scope,'key',row_key,'row',row_value) order by scope,row_key),'[]'::jsonb)::text)
    into before_dependencies_hash from deps;

  select count(*) = 8 and bool_and(
    b.public_booking_reference=t.public_ref and b.status='completed'
    and b.admin_internal_status='completed' and b.customer_facing_status='completed'
    and b.cancellation_review_status is null and b.request_review_status='pending_review'
    and b.change_review_status is null and b.updated_at=t.original_updated_at
    and md5(to_jsonb(b)::text)=t.full_hash
    and md5((to_jsonb(b)-'status'-'admin_internal_status'-'customer_facing_status'-'cancellation_review_status'-'updated_at')::text)=t.protected_hash
  ) into pre_repair_state
  from public.bookings b join (values
    (183,'10861','ADM-20260802030237','2026-08-03T12:25:01.55Z'::timestamptz,'fb6836feeb9924b7a074a0a00cdf513a','c9db7ededf78c7148a73bf59de80c8c0'),
    (185,'10863','ADM-20260802090431','2026-08-02T12:59:32.123Z'::timestamptz,'b19de16f19c226ed9b930eb4b684562e','b2838819a0dff9a6059fa8333fcf7c42'),
    (191,'10869','ADM-20260804041103','2026-08-05T00:35:34.356Z'::timestamptz,'2f5b96fb94eaac550bef046ff81cd617','a67b720544aefc19bf29407c58aaaee7'),
    (198,'10876','ADM-20260807103534','2026-08-19T10:20:56.973Z'::timestamptz,'1b9d81f67a9c877bab4e76b01940ada9','cd965ea143f09ab231055ce77e860e76'),
    (202,'10880','ADM-20260809014748','2026-08-19T10:20:33.101Z'::timestamptz,'b5960d0ec2f99e8934c7f7cb20b78fc5','70e19faf246a00ea1e0e4779f4a14a0a'),
    (203,'10881','ADM-20260809014847','2026-08-19T10:21:06.023Z'::timestamptz,'8c09409ef772283289b9d37c6acde525','c1ed8df26dfc1fa18d1316e3be5088ac'),
    (211,'10889','ADM-20260815011440','2026-08-16T02:46:27.37Z'::timestamptz,'ac63833588006f104dac83258bbdd5ba','f9d8f3d877cb00824d73e0dd6d4a73bb'),
    (219,'10897','ADM-20260821154132','2026-08-28T15:17:42.633Z'::timestamptz,'0602a3822280b8fd39f797c577b4fafb','50669836c56bce6d252193a5a86d61a9')
  ) t(id,public_ref,booking_ref,original_updated_at,full_hash,protected_hash)
    on b.id=t.id and b.booking_reference=t.booking_ref;

  select count(*) = 8 and bool_and(
    b.public_booking_reference=t.public_ref and b.status='cancelled'
    and b.admin_internal_status='cancelled' and b.customer_facing_status='cancelled'
    and b.cancellation_review_status='cancelled' and b.request_review_status='pending_review'
    and b.change_review_status is null and b.updated_at=repair_timestamp
    and md5((to_jsonb(b)-'status'-'admin_internal_status'-'customer_facing_status'-'cancellation_review_status'-'updated_at')::text)=t.protected_hash
  ) into exact_post_repair_state
  from public.bookings b join (values
    (183,'10861','ADM-20260802030237','c9db7ededf78c7148a73bf59de80c8c0'),
    (185,'10863','ADM-20260802090431','b2838819a0dff9a6059fa8333fcf7c42'),
    (191,'10869','ADM-20260804041103','a67b720544aefc19bf29407c58aaaee7'),
    (198,'10876','ADM-20260807103534','cd965ea143f09ab231055ce77e860e76'),
    (202,'10880','ADM-20260809014748','70e19faf246a00ea1e0e4779f4a14a0a'),
    (203,'10881','ADM-20260809014847','c1ed8df26dfc1fa18d1316e3be5088ac'),
    (211,'10889','ADM-20260815011440','f9d8f3d877cb00824d73e0dd6d4a73bb'),
    (219,'10897','ADM-20260821154132','50669836c56bce6d252193a5a86d61a9')
  ) t(id,public_ref,booking_ref,protected_hash)
    on b.id=t.id and b.booking_reference=t.booking_ref;

  if not (pre_repair_state or exact_post_repair_state) then raise exception 'monthly_billing_eight_cancelled_precondition_drift'; end if;
  if before_bookings_protected_hash <> 'b76180ef9dbf9b5c9e26cacb5093c6c9' or before_dependencies_hash <> '70cfb10dd464f5fe6a2cf5eb6f465d79'
  then raise exception 'monthly_billing_eight_cancelled_dependency_drift'; end if;

  if pre_repair_state then
    update public.bookings b set
      status='cancelled', admin_internal_status='cancelled', customer_facing_status='cancelled',
      cancellation_review_status='cancelled', updated_at=repair_timestamp
    where b.id in (183,185,191,198,202,203,211,219)
      and b.status='completed' and b.admin_internal_status='completed'
      and b.customer_facing_status='completed' and b.cancellation_review_status is null;
    get diagnostics affected_rows = row_count;
  end if;

  if (pre_repair_state and affected_rows<>8) or (exact_post_repair_state and affected_rows<>0)
  then raise exception 'monthly_billing_eight_cancelled_affected_row_count_mismatch'; end if;

  if (select md5(jsonb_agg(to_jsonb(b)-'status'-'admin_internal_status'-'customer_facing_status'-'cancellation_review_status'-'updated_at' order by b.id)::text) from public.bookings b where b.id in (183,185,191,198,202,203,211,219)) <> before_bookings_protected_hash
  then raise exception 'monthly_billing_eight_cancelled_protected_booking_drift'; end if;

  if (select count(*) from public.bookings b where b.id in (183,185,191,198,202,203,211,219)
      and b.status='cancelled' and b.admin_internal_status='cancelled'
      and b.customer_facing_status='cancelled' and b.cancellation_review_status='cancelled'
      and b.request_review_status='pending_review' and b.change_review_status is null
      and b.updated_at=repair_timestamp) <> 8
  then raise exception 'monthly_billing_eight_cancelled_postcondition_failed'; end if;

  with deps(scope,row_key,row_value) as (
    select 'customers',x.id::text,to_jsonb(x) from public.customers x where x.id in (166,168,174,186)
    union all select 'companies',x.id::text,to_jsonb(x) from public.companies x where x.id in (34,35,41,49)
    union all select 'customer_contacts',x.id::text,to_jsonb(x) from public.customer_contacts x where x.customer_id in (166,168,174,186)
    union all select 'drivers',x.id::text,to_jsonb(x) from public.drivers x where x.id in (12,15,17)
    union all select 'customer_invoice_records',x.id::text,to_jsonb(x) from public.customer_invoice_records x where x.customer_id::bigint in (166,168,174,186)
    union all select 'monthly_billing_draft_plans',x.id::text,to_jsonb(x) from public.monthly_billing_draft_plans x where x.customer_id::bigint in (166,168,174,186)
    union all select 'monthly_invoice_drafts',x.id::text,to_jsonb(x) from public.monthly_invoice_drafts x where x.customer_id::bigint in (166,168,174,186)
    union all select 'customer_access_accounts',x.id::text,to_jsonb(x) from public.customer_access_accounts x where x.customer_account_reference::bigint in (166,168,174,186) or x.company_id in (34,35,41,49)
    union all select 'admin_app_notification_outbox',x.id::text,to_jsonb(x) from public.admin_app_notification_outbox x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'audit_logs',x.id::text,to_jsonb(x) from public.audit_logs x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'booking_workflow_statuses',x.id::text,to_jsonb(x) from public.booking_workflow_statuses x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'completed_booking_closeouts',x.id::text,to_jsonb(x) from public.completed_booking_closeouts x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'customer_driver_app_notification_outbox',x.id::text,to_jsonb(x) from public.customer_driver_app_notification_outbox x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_bid_offers',x.id::text,to_jsonb(x) from public.driver_job_bid_offers x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_bids',x.id::text,to_jsonb(x) from public.driver_job_bids x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_dsp_actual_time_events',x.id::text,to_jsonb(x) from public.driver_job_dsp_actual_time_events x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_dsp_actual_time_summaries',x.booking_reference,to_jsonb(x) from public.driver_job_dsp_actual_time_summaries x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_links',x.id::text,to_jsonb(x) from public.driver_job_links x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_job_status_events',x.id::text,to_jsonb(x) from public.driver_job_status_events x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_live_location_audit_events',x.id::text,to_jsonb(x) from public.driver_live_location_audit_events x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_live_location_latest_positions',x.id::text,to_jsonb(x) from public.driver_live_location_latest_positions x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'driver_ots_photo_proofs',x.id::text,to_jsonb(x) from public.driver_ots_photo_proofs x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'monthly_invoice_billable_item_price_reviews',x.id::text,to_jsonb(x) from public.monthly_invoice_billable_item_price_reviews x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'monthly_invoice_draft_item_reviews',x.id::text,to_jsonb(x) from public.monthly_invoice_draft_item_reviews x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
    union all select 'monthly_invoice_draft_trip_links',x.id::text,to_jsonb(x) from public.monthly_invoice_draft_trip_links x where x.booking_reference = any(array['ADM-20260802030237','ADM-20260802090431','ADM-20260804041103','ADM-20260807103534','ADM-20260809014748','ADM-20260809014847','ADM-20260815011440','ADM-20260821154132'])
  )
  select md5(coalesce(jsonb_agg(jsonb_build_object('scope',scope,'key',row_key,'row',row_value) order by scope,row_key),'[]'::jsonb)::text)
    into after_dependencies_hash from deps;

  if after_dependencies_hash <> before_dependencies_hash
  then raise exception 'monthly_billing_eight_cancelled_protected_dependency_drift'; end if;
end;
$migration$;

commit;
