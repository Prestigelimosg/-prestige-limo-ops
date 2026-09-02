-- Emergency-only CAS rollback for the exact eight-booking cancellation repair.
-- Do not run automatically. It aborts if any approved field, protected booking
-- field or repair timestamp moved after the forward transaction.

begin;

set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $rollback$
declare
  affected_rows integer := 0;
  exact_repair_state boolean;
begin
  perform 1 from public.bookings where id in (183,185,191,198,202,203,211,219) order by id for update;

  select count(*)=8 and bool_and(
    b.public_booking_reference=t.public_ref
    and b.status='cancelled' and b.admin_internal_status='cancelled'
    and b.customer_facing_status='cancelled' and b.cancellation_review_status='cancelled'
    and b.request_review_status='pending_review' and b.change_review_status is null
    and b.updated_at='2026-09-02T02:10:00Z'::timestamptz
    and md5((to_jsonb(b)-'status'-'admin_internal_status'-'customer_facing_status'-'cancellation_review_status'-'updated_at')::text)=t.protected_hash
  ) into exact_repair_state
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

  if not exact_repair_state then raise exception 'monthly_billing_eight_cancelled_rollback_precondition_drift'; end if;

  update public.bookings b set
    status='completed', admin_internal_status='completed', customer_facing_status='completed',
    cancellation_review_status=null, updated_at=t.original_updated_at
  from (values
    (183,'2026-08-03T12:25:01.55Z'::timestamptz),(185,'2026-08-02T12:59:32.123Z'::timestamptz),
    (191,'2026-08-05T00:35:34.356Z'::timestamptz),(198,'2026-08-19T10:20:56.973Z'::timestamptz),
    (202,'2026-08-19T10:20:33.101Z'::timestamptz),(203,'2026-08-19T10:21:06.023Z'::timestamptz),
    (211,'2026-08-16T02:46:27.37Z'::timestamptz),(219,'2026-08-28T15:17:42.633Z'::timestamptz)
  ) t(id,original_updated_at)
  where b.id=t.id and b.updated_at='2026-09-02T02:10:00Z'::timestamptz;
  get diagnostics affected_rows = row_count;

  if affected_rows<>8 then raise exception 'monthly_billing_eight_cancelled_rollback_affected_row_count_mismatch'; end if;

  if (select count(*) from public.bookings b join (values
      (183,'fb6836feeb9924b7a074a0a00cdf513a'),(185,'b19de16f19c226ed9b930eb4b684562e'),
      (191,'2f5b96fb94eaac550bef046ff81cd617'),(198,'1b9d81f67a9c877bab4e76b01940ada9'),
      (202,'b5960d0ec2f99e8934c7f7cb20b78fc5'),(203,'8c09409ef772283289b9d37c6acde525'),
      (211,'ac63833588006f104dac83258bbdd5ba'),(219,'0602a3822280b8fd39f797c577b4fafb')
    ) t(id,full_hash) on b.id=t.id and md5(to_jsonb(b)::text)=t.full_hash)<>8
  then raise exception 'monthly_billing_eight_cancelled_rollback_postcondition_failed'; end if;
end;
$rollback$;

commit;
