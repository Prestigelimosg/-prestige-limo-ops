-- Link only the eleven owner-approved, evidence-backed Company + Booker
-- identities to their already-existing Customer profiles. Passenger/Traveller
-- remains booking-only. Every assertion is intentionally fail-closed so any
-- Production drift aborts the whole transaction before a relationship changes.

begin;

set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temporary table company_booker_existing_account_backfill (
  booker_id bigint primary key,
  company_id bigint not null,
  customer_id bigint not null unique,
  expected_booking_ids bigint[] not null,
  expected_invoice_ids uuid[] not null
) on commit drop;

insert into company_booker_existing_account_backfill (
  booker_id,
  company_id,
  customer_id,
  expected_booking_ids,
  expected_invoice_ids
)
values
  (14, 39, 173, array[190]::bigint[], '{}'::uuid[]),
  (16, 38, 171, array[188, 215]::bigint[], array['c1201d51-4b18-40ad-8350-a6a125d05bba']::uuid[]),
  (17, 33, 165, array[181, 182]::bigint[], array['8b496aa0-8133-4ac2-8308-d407322d3965', '979ea1d0-dad9-4d87-a0a3-5e7ef4edae60']::uuid[]),
  (18, 36, 169, array[186]::bigint[], '{}'::uuid[]),
  (21, 47, 184, array[207]::bigint[], '{}'::uuid[]),
  (22, 48, 185, array[208, 209, 210]::bigint[], '{}'::uuid[]),
  (23, 50, 188, array[214]::bigint[], '{}'::uuid[]),
  (24, 31, 163, array[220]::bigint[], '{}'::uuid[]),
  (27, 40, 196, array[232, 233]::bigint[], '{}'::uuid[]),
  (28, 56, 197, array[235, 236]::bigint[], '{}'::uuid[]),
  (29, 30, 167, array[237]::bigint[], '{}'::uuid[]);

do $migration$
declare
  affected_rows integer;
begin
  if (select count(*) from company_booker_existing_account_backfill) <> 11 then
    raise exception 'company_booker_backfill_mapping_count_mismatch';
  end if;

  if (select count(*) from public.customers) <> 31
    or (select count(*) from public.companies) <> 24
    or (select count(*) from public.bookers) <> 15
    or (select count(*) from public.bookings) <> 55
    or (select count(*) from public.customer_invoice_records) <> 3 then
    raise exception 'company_booker_backfill_global_count_drift';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bookers'
      and column_name = 'customer_id'
      and data_type = 'bigint'
      and is_nullable = 'YES'
  ) then
    raise exception 'company_booker_backfill_customer_id_foundation_missing';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookers_customer_id_fkey'
      and conrelid = 'public.bookers'::regclass
      and confrelid = 'public.customers'::regclass
      and contype = 'f'
      and convalidated
      and confupdtype = 'r'
      and confdeltype = 'r'
  ) then
    raise exception 'company_booker_backfill_foreign_key_guard_missing';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    where i.indrelid = 'public.bookers'::regclass
      and idx.relname = 'bookers_customer_id_unique_idx'
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and i.indpred is not null
  ) then
    raise exception 'company_booker_backfill_unique_index_guard_missing';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.bookers'::regclass
      and relrowsecurity
  ) or exists (
    select 1
    from pg_policy
    where polrelid = 'public.bookers'::regclass
  ) then
    raise exception 'company_booker_backfill_rls_boundary_drift';
  end if;

  if (select count(*) from public.bookers where customer_id is not null) <> 2
    or exists (
      select 1
      from public.bookers
      where customer_id is not null
        and not (
          (id = 19 and company_id = 37 and customer_id = 170)
          or (id = 26 and company_id = 53 and customer_id = 192)
        )
    ) then
    raise exception 'company_booker_backfill_existing_link_drift';
  end if;

  if exists (
    select 1
    from company_booker_existing_account_backfill m
    left join public.bookers b
      on b.id = m.booker_id
     and b.company_id = m.company_id
    where b.id is null
       or b.customer_id is not null
       or b.customer_rates <> '{}'::jsonb
  ) then
    raise exception 'company_booker_backfill_booker_precondition_failed';
  end if;

  if exists (
    select 1
    from company_booker_existing_account_backfill m
    left join public.companies c on c.id = m.company_id
    where c.id is null
       or c.customer_rates <> '{}'::jsonb
  ) then
    raise exception 'company_booker_backfill_company_rate_precondition_failed';
  end if;

  if exists (
    select 1
    from company_booker_existing_account_backfill m
    left join public.customers c on c.id = m.customer_id
    where c.id is null
       or c.account_status <> 'active'
       or c.status <> 'active'
  ) then
    raise exception 'company_booker_backfill_customer_precondition_failed';
  end if;

  if exists (
    select 1
    from company_booker_existing_account_backfill m
    left join lateral (
      select coalesce(array_agg(b.id order by b.id), '{}'::bigint[]) as booking_ids
      from public.bookings b
      where b.company_id = m.company_id
        and b.booker_id = m.booker_id
    ) evidence on true
    where evidence.booking_ids <> m.expected_booking_ids
  ) or exists (
    select 1
    from company_booker_existing_account_backfill m
    join public.bookings b on b.booker_id = m.booker_id
    where b.company_id is distinct from m.company_id
       or b.customer_id is distinct from m.customer_id
  ) then
    raise exception 'company_booker_backfill_booking_evidence_drift';
  end if;

  if exists (
    select 1
    from company_booker_existing_account_backfill m
    join public.customer_access_accounts a
      on a.account_status = 'active'
     and (
       (a.company_id = m.company_id and a.booker_id = m.booker_id)
       or a.customer_account_reference = m.customer_id::text
     )
  ) then
    raise exception 'company_booker_backfill_access_account_conflict';
  end if;

  if exists (
    select 1
    from company_booker_existing_account_backfill m
    join public.bookers b on b.customer_id = m.customer_id
  ) then
    raise exception 'company_booker_backfill_target_already_linked';
  end if;

  if exists (
    select 1
    from company_booker_existing_account_backfill m
    left join lateral (
      select coalesce(array_agg(i.id order by i.id), '{}'::uuid[]) as invoice_ids
      from public.customer_invoice_records i
      where i.booker_id = m.booker_id
         or i.customer_id = m.customer_id::text
    ) evidence on true
    where evidence.invoice_ids <> m.expected_invoice_ids
  ) or exists (
    select 1
    from company_booker_existing_account_backfill m
    join public.customer_invoice_records i
      on i.booker_id = m.booker_id
      or i.customer_id = m.customer_id::text
    where i.booker_id is distinct from m.booker_id
       or i.customer_id is distinct from m.customer_id::text
  ) then
    raise exception 'company_booker_backfill_invoice_evidence_drift';
  end if;

  if exists (
    select 1
    from company_booker_existing_account_backfill m
    join public.travelers t on t.booker_id = m.booker_id
    where t.customer_rates <> '{}'::jsonb
  ) then
    raise exception 'company_booker_backfill_legacy_rate_precedence_conflict';
  end if;

  if not exists (
    select 1 from public.bookers
    where id = 15 and company_id = 41 and customer_id is null and customer_rates = '{}'::jsonb
  ) or not exists (
    select 1 from public.bookers
    where id = 20 and company_id = 45 and customer_id is null and customer_rates = '{}'::jsonb
  ) or not exists (
    select 1 from public.bookers
    where id = 19 and company_id = 37 and customer_id = 170
      and customer_rates = '{"DEP":{"AVF":75},"MNG":{"AVF":85}}'::jsonb
  ) or not exists (
    select 1 from public.bookers
    where id = 26 and company_id = 53 and customer_id = 192 and customer_rates = '{}'::jsonb
  ) or not exists (
    select 1 from public.travelers
    where booker_id = 20 and customer_rates <> '{}'::jsonb
  ) then
    raise exception 'company_booker_backfill_protected_identity_drift';
  end if;

  if exists (
    select 1
    from public.bookers
    where customer_id in (160, 161, 162, 164, 166, 168, 175, 178, 180, 183, 186, 187, 189, 190, 193, 194)
  ) then
    raise exception 'company_booker_backfill_legacy_customer_inference_detected';
  end if;

  update public.bookers b
  set customer_id = m.customer_id
  from company_booker_existing_account_backfill m
  where b.id = m.booker_id
    and b.company_id = m.company_id
    and b.customer_id is null;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 11 then
    raise exception 'company_booker_backfill_affected_row_count_mismatch';
  end if;

  if exists (
    select 1
    from company_booker_existing_account_backfill m
    left join public.bookers b
      on b.id = m.booker_id
     and b.company_id = m.company_id
     and b.customer_id = m.customer_id
    where b.id is null
  ) or (select count(*) from public.bookers where customer_id is not null) <> 13
    or (select count(*) from public.bookers where customer_id is null) <> 2
    or exists (
      select 1
      from public.bookers
      where customer_id is null
        and id not in (15, 20)
    ) then
    raise exception 'company_booker_backfill_postcondition_failed';
  end if;

  if exists (
    select 1
    from public.bookers
    where customer_id in (160, 161, 162, 164, 166, 168, 175, 178, 180, 183, 186, 187, 189, 190, 193, 194)
  ) then
    raise exception 'company_booker_backfill_legacy_customer_postcondition_failed';
  end if;
end
$migration$;

commit;
