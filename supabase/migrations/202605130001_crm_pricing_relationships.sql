alter table public.companies
  add column if not exists customer_rates jsonb not null default '{}'::jsonb,
  add column if not exists driver_payout_rules jsonb not null default '{}'::jsonb,
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists special_rules text,
  add column if not exists transzend_excel_privacy boolean not null default false;

alter table public.travelers
  add column if not exists booker_id bigint references public.bookers(id) on delete set null,
  add column if not exists booker_name text,
  add column if not exists booker_contact text,
  add column if not exists booker_email text,
  add column if not exists default_pickup_address text,
  add column if not exists default_dropoff_address text,
  add column if not exists customer_rates jsonb not null default '{}'::jsonb,
  add column if not exists driver_payout_rules jsonb not null default '{}'::jsonb,
  add column if not exists special_rules text,
  add column if not exists allow_excel_name boolean not null default true;

alter table public.bookings
  add column if not exists customer_rate numeric,
  add column if not exists customer_rate_unit text,
  add column if not exists driver_payout_min numeric,
  add column if not exists driver_payout_max numeric,
  add column if not exists driver_payout_unit text,
  add column if not exists midnight_surcharge numeric not null default 0,
  add column if not exists midnight_payout numeric not null default 0,
  add column if not exists extra_stop_payout numeric not null default 10,
  add column if not exists pricing_source text;

update public.companies
set
  customer_rates = customer_rates || '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb,
  driver_payout_rules = driver_payout_rules || '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb
where customer_rates = '{}'::jsonb
   or driver_payout_rules = '{}'::jsonb;

insert into public.companies (company_name, customer_rates, driver_payout_rules)
values
  ('Internal Account', '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb, '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb),
  ('Tiger Global', '{"MNG":75,"DEP":65}'::jsonb, '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb),
  ('Transzend', '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb, '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb)
on conflict do nothing;

update public.companies
set transzend_excel_privacy = true,
    special_rules = 'Do not save traveler/passenger contact/name in Excel-style records; name may appear on job card when needed.'
where lower(company_name) = lower('Transzend');

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

insert into public.bookers (company_id, booker_name)
select companies.id, 'June Aw'
from public.companies
where lower(companies.company_name) = lower('Tiger Global')
on conflict do nothing;

insert into public.bookers (company_id, booker_name)
select companies.id, 'Nicole Yap'
from public.companies
where lower(companies.company_name) = lower('BNY')
on conflict do nothing;

insert into public.travelers (company_id, traveler_name)
select companies.id, 'Mr Rohan Singh'
from public.companies
where lower(companies.company_name) = lower('BNY')
on conflict do nothing;

insert into public.bookers (company_id, booker_name)
select companies.id, 'Sharron'
from public.companies
where lower(companies.company_name) = lower('Shiseido')
on conflict do nothing;

insert into public.bookers (company_id, booker_name)
select companies.id, 'Polly Wong'
from public.companies
where lower(companies.company_name) = lower('Apollo')
on conflict do nothing;
