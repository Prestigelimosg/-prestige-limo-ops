create table if not exists public.companies (
  id bigserial primary key,
  company_name text not null,
  domain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.companies
  add column if not exists company_name text,
  add column if not exists domain text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists companies_company_name_key
  on public.companies (lower(company_name))
  where company_name is not null;

create unique index if not exists companies_domain_key
  on public.companies (lower(domain))
  where domain is not null;

create table if not exists public.bookers (
  id bigserial primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  booker_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookers
  add column if not exists company_id bigint references public.companies(id) on delete cascade,
  add column if not exists booker_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists bookers_company_name_idx
  on public.bookers (company_id, lower(booker_name));

create index if not exists bookers_company_email_idx
  on public.bookers (company_id, lower(email))
  where email is not null;

create index if not exists bookers_company_phone_idx
  on public.bookers (company_id, phone)
  where phone is not null;

create table if not exists public.travelers (
  id bigserial primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  traveler_name text not null,
  preferred_vehicle text,
  default_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.travelers
  add column if not exists company_id bigint references public.companies(id) on delete cascade,
  add column if not exists traveler_name text,
  add column if not exists preferred_vehicle text,
  add column if not exists default_address text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists travelers_name_idx
  on public.travelers (lower(traveler_name));

create unique index if not exists travelers_company_name_key
  on public.travelers (company_id, lower(traveler_name))
  where traveler_name is not null;

create table if not exists public.saved_addresses (
  id bigserial primary key,
  company_id bigint references public.companies(id) on delete cascade,
  traveler_id bigint references public.travelers(id) on delete cascade,
  booker_id bigint references public.bookers(id) on delete set null,
  label text not null default 'Default',
  address text not null,
  address_role text not null default 'traveler_default',
  is_default boolean not null default true,
  use_count integer not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_addresses
  add column if not exists company_id bigint references public.companies(id) on delete cascade,
  add column if not exists traveler_id bigint references public.travelers(id) on delete cascade,
  add column if not exists booker_id bigint references public.bookers(id) on delete set null,
  add column if not exists label text not null default 'Default',
  add column if not exists address text,
  add column if not exists address_role text not null default 'traveler_default',
  add column if not exists is_default boolean not null default true,
  add column if not exists use_count integer not null default 1,
  add column if not exists last_used_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists saved_addresses_traveler_default_idx
  on public.saved_addresses (traveler_id, is_default desc, use_count desc, last_used_at desc);

create unique index if not exists saved_addresses_traveler_address_key
  on public.saved_addresses (traveler_id, lower(address))
  where traveler_id is not null and address is not null;

create table if not exists public.bookings (
  id bigserial primary key,
  company_id bigint references public.companies(id) on delete set null,
  booker_id bigint references public.bookers(id) on delete set null,
  traveler_id bigint references public.travelers(id) on delete set null,
  booking_type text,
  vehicle text,
  pickup_time text,
  pickup_address text,
  dropoff_address text,
  flight_no text,
  route text,
  pax integer,
  job_card text,
  status text,
  driver_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.companies (company_name)
values ('BNY'), ('Apollo'), ('Shiseido')
on conflict do nothing;

insert into public.companies (company_name)
values ('UOB')
on conflict do nothing;

insert into public.travelers (company_id, traveler_name, default_address)
select companies.id, 'Lim Yeow Beng', '2C Anamalai Ave'
from public.companies
where lower(companies.company_name) = lower('UOB')
on conflict do nothing;

insert into public.saved_addresses (company_id, traveler_id, label, address, address_role, is_default)
select travelers.company_id, travelers.id, 'Default', '2C Anamalai Ave', 'traveler_default', true
from public.travelers
where lower(travelers.traveler_name) = lower('Lim Yeow Beng')
on conflict do nothing;

insert into public.travelers (company_id, traveler_name)
select companies.id, 'Nicole Yap'
from public.companies
where lower(companies.company_name) = lower('BNY')
on conflict do nothing;

insert into public.travelers (company_id, traveler_name)
select companies.id, 'Polly Wong'
from public.companies
where lower(companies.company_name) = lower('Apollo')
on conflict do nothing;

insert into public.travelers (company_id, traveler_name)
select companies.id, 'Sharron'
from public.companies
where lower(companies.company_name) = lower('Shiseido')
on conflict do nothing;
