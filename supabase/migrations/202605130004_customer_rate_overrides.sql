alter table public.bookings
  add column if not exists customer_price_amount numeric,
  add column if not exists customer_rate_override numeric,
  add column if not exists customer_price_override_reason text;

update public.companies
set customer_rates = customer_rates || '{"MNG":75,"DEP":65}'::jsonb
where lower(company_name) = lower('Tiger Global');

insert into public.companies (company_name, customer_rates, driver_payout_rules)
values ('Tiger Global', '{"MNG":75,"DEP":65}'::jsonb, '{}'::jsonb)
on conflict do nothing;

insert into public.companies (company_name, customer_rates, driver_payout_rules, transzend_excel_privacy, special_rules)
values (
  'Transzend',
  '{}'::jsonb,
  '{}'::jsonb,
  true,
  'Custom account rules allowed. Do not save traveler/passenger contact/name in Excel-style records; name may appear on job card when needed.'
)
on conflict do nothing;

insert into public.companies (company_name, customer_rates, driver_payout_rules)
values ('Internal Account', '{}'::jsonb, '{}'::jsonb)
on conflict do nothing;

insert into public.travelers (company_id, traveler_name, customer_rates)
select companies.id, 'Su Ling', '{"DSP":60}'::jsonb
from public.companies
where lower(companies.company_name) = lower('Internal Account')
on conflict do nothing;

insert into public.travelers (company_id, traveler_name, customer_rates)
select companies.id, traveler_name, '{"MNG":75,"DEP":65}'::jsonb
from public.companies
cross join (values ('Mr Deep'), ('Mr Stanley')) as bosses(traveler_name)
where lower(companies.company_name) = lower('Tiger Global')
on conflict do nothing;
