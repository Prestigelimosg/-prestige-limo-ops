-- Repair exactly Bridge Data Centres Customer177 by binding its proven
-- Company45 + Booker20 identity and copying the exact current Traveller33
-- customer-rate map onto that authoritative account. No other row may change.

begin;

set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $migration$
declare
  affected_rows integer;
  before_customer_hash text;
  before_company_hash text;
  before_booker_protected_hash text;
  before_traveler_33_hash text;
  before_traveler_34_hash text;
  before_booking_195_hash text;
  before_contacts_177_hash text;
  before_invoice_hash text;
  before_monthly_billing_hash text;
  before_monthly_invoice_hash text;
  before_access_hash text;
  pre_repair_state boolean;
  exact_post_repair_state boolean;
begin
  perform 1 from public.customers where id = 177 for update;
  perform 1 from public.companies where id = 45 for update;
  perform 1 from public.bookers where id = 20 for update;
  perform 1 from public.travelers where id in (33, 34) order by id for update;
  perform 1 from public.bookings where id = 195 for update;
  perform 1 from public.customer_contacts where customer_id = '177' order by id for update;

  select md5(to_jsonb(c)::text)
  into before_customer_hash
  from public.customers c
  where c.id = 177;

  select md5(to_jsonb(c)::text)
  into before_company_hash
  from public.companies c
  where c.id = 45;

  select md5((to_jsonb(b) - 'customer_id' - 'customer_rates')::text)
  into before_booker_protected_hash
  from public.bookers b
  where b.id = 20;

  select md5(to_jsonb(t)::text)
  into before_traveler_33_hash
  from public.travelers t
  where t.id = 33;

  select md5(to_jsonb(t)::text)
  into before_traveler_34_hash
  from public.travelers t
  where t.id = 34;

  select md5(to_jsonb(b)::text)
  into before_booking_195_hash
  from public.bookings b
  where b.id = 195;

  select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)::text)
  into before_contacts_177_hash
  from public.customer_contacts c
  where c.customer_id = '177';

  select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)::text)
  into before_invoice_hash
  from public.customer_invoice_records i
  where i.customer_id = '177' or i.booker_id = 20;

  select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)::text)
  into before_monthly_billing_hash
  from public.monthly_billing_draft_plans d
  where d.customer_id = '177' or d.booker_id = 20;

  select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)::text)
  into before_monthly_invoice_hash
  from public.monthly_invoice_drafts d
  where d.customer_id = '177' or d.booker_id = 20;

  select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb)::text)
  into before_access_hash
  from public.customer_access_accounts a
  where a.customer_account_reference = '177'
     or a.company_id = 45
     or a.booker_id = 20;

  select exists (
    select 1
    from public.bookers b
    where b.id = 20
      and b.company_id = 45
      and b.customer_id is null
      and b.booker_name = 'Laurel Wong'
      and b.email = 'laurel.wong@bridgedatacentres.com'
      and b.phone = '98590343'
      and b.customer_rates = '{}'::jsonb
      and md5(to_jsonb(b)::text) = 'b893c5a4c08d13c030c429aa814c6ab1'
  ) into pre_repair_state;

  select exists (
    select 1
    from public.bookers b
    where b.id = 20
      and b.company_id = 45
      and b.customer_id = 177
      and b.booker_name = 'Laurel Wong'
      and b.email = 'laurel.wong@bridgedatacentres.com'
      and b.phone = '98590343'
      and b.customer_rates = '{"DEP":{"S":170},"DSP":{"S":160},"MNG":{"S":180},"TRF":{"S":150}}'::jsonb
      and md5(to_jsonb(b)::text) = '0496727d664a2166ecebbc8046ac68e0'
  ) into exact_post_repair_state;

  if before_customer_hash <> '7f4358e08d467eeb3c40d1a3b1769690'
    or before_company_hash <> 'dcc73fd7d74372c936b69baae191bcd1'
    or not (pre_repair_state or exact_post_repair_state)
    or not exists (
      select 1
      from public.travelers t
      where t.id = 33
        and t.company_id = 45
        and t.booker_id = 20
        and t.traveler_name = 'Drew Chen'
        and t.customer_rates = '{"DEP":{"S":170},"DSP":{"S":160},"MNG":{"S":180},"TRF":{"S":150}}'::jsonb
        and md5(to_jsonb(t)::text) = 'e5dfe1e551e29d3ce63e4cee9fbd5577'
    )
    or not exists (
      select 1
      from public.travelers t
      where t.id = 34
        and t.company_id = 45
        and t.booker_id is null
        and t.traveler_name = 'Drew'
        and t.customer_rates = '{"DEP":{"S":170},"DSP":{"S":160},"MNG":{"S":180},"TRF":{"S":150}}'::jsonb
        and md5(to_jsonb(t)::text) = 'a37e8bfbced4402cb19fc06f23ff9264'
    )
    or not exists (
      select 1
      from public.bookings b
      where b.id = 195
        and b.public_booking_reference = '10873'
        and b.booking_reference = 'ADM-20260805140858'
        and b.customer_id = 177
        and b.company_id = 45
        and b.booker_id = 20
        and b.traveler_id = 33
        and b.contact_display_name = 'Laurel Wong'
        and b.passenger_name = 'Drew Chen'
        and b.customer_price_amount = 1600
        and b.updated_at = '2026-08-06T13:35:52.461+00:00'::timestamptz
        and md5(to_jsonb(b)::text) = '501bcc169e8a1e3f87e548c0178bf214'
    )
  then
    raise exception 'bridge_customer_177_precondition_drift';
  end if;

  if (select count(*) from public.customers where id = 177) <> 1
    or (select count(*) from public.companies where id = 45) <> 1
    or (select count(*) from public.bookers where id = 20) <> 1
    or (select count(*) from public.travelers where id in (33, 34)) <> 2
    or (select count(*) from public.bookings where id = 195) <> 1
    or (select count(*) from public.bookings where customer_id = 177) <> 1
    or (select count(*) from public.customer_contacts where customer_id = '177') <> 1
    or exists (select 1 from public.bookers where customer_id = 177 and id <> 20)
    or exists (select 1 from public.travelers where booker_id = 20 and id <> 33)
    or exists (select 1 from public.bookings where booker_id = 20 and id <> 195)
    or exists (select 1 from public.customer_invoice_records where customer_id = '177' or booker_id = 20)
    or exists (select 1 from public.monthly_billing_draft_plans where customer_id = '177' or booker_id = 20)
    or exists (select 1 from public.monthly_invoice_drafts where customer_id = '177' or booker_id = 20)
    or exists (
      select 1
      from public.customer_access_accounts
      where customer_account_reference = '177'
         or company_id = 45
         or booker_id = 20
    )
  then
    raise exception 'bridge_customer_177_dependency_drift';
  end if;

  if pre_repair_state then
    update public.bookers b
    set customer_id = 177,
        customer_rates = t.customer_rates
    from public.travelers t
    where b.id = 20
      and b.company_id = 45
      and b.customer_id is null
      and b.customer_rates = '{}'::jsonb
      and t.id = 33
      and t.company_id = 45
      and t.booker_id = 20
      and t.customer_rates = '{"DEP":{"S":170},"DSP":{"S":160},"MNG":{"S":180},"TRF":{"S":150}}'::jsonb;

    get diagnostics affected_rows = row_count;
  else
    affected_rows := 0;
  end if;

  if (pre_repair_state and affected_rows <> 1)
    or (exact_post_repair_state and affected_rows <> 0)
  then
    raise exception 'bridge_customer_177_affected_row_count_mismatch';
  end if;

  if md5((select (to_jsonb(b) - 'customer_id' - 'customer_rates')::text from public.bookers b where b.id = 20)) <> before_booker_protected_hash
    or md5((select to_jsonb(c)::text from public.customers c where c.id = 177)) <> before_customer_hash
    or md5((select to_jsonb(c)::text from public.companies c where c.id = 45)) <> before_company_hash
    or md5((select to_jsonb(t)::text from public.travelers t where t.id = 33)) <> before_traveler_33_hash
    or md5((select to_jsonb(t)::text from public.travelers t where t.id = 34)) <> before_traveler_34_hash
    or md5((select to_jsonb(b)::text from public.bookings b where b.id = 195)) <> before_booking_195_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)::text) from public.customer_contacts c where c.customer_id = '177') <> before_contacts_177_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb)::text) from public.customer_invoice_records i where i.customer_id = '177' or i.booker_id = 20) <> before_invoice_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)::text) from public.monthly_billing_draft_plans d where d.customer_id = '177' or d.booker_id = 20) <> before_monthly_billing_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)::text) from public.monthly_invoice_drafts d where d.customer_id = '177' or d.booker_id = 20) <> before_monthly_invoice_hash
    or (select md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb)::text) from public.customer_access_accounts a where a.customer_account_reference = '177' or a.company_id = 45 or a.booker_id = 20) <> before_access_hash
  then
    raise exception 'bridge_customer_177_protected_row_drift';
  end if;

  if not exists (
    select 1
    from public.bookers b
    where b.id = 20
      and b.company_id = 45
      and b.customer_id = 177
      and b.booker_name = 'Laurel Wong'
      and b.email = 'laurel.wong@bridgedatacentres.com'
      and b.phone = '98590343'
      and b.customer_rates = '{"DEP":{"S":170},"DSP":{"S":160},"MNG":{"S":180},"TRF":{"S":150}}'::jsonb
      and b.customer_rates = (select t.customer_rates from public.travelers t where t.id = 33)
  )
  then
    raise exception 'bridge_customer_177_postcondition_failed';
  end if;
end;
$migration$;

commit;
