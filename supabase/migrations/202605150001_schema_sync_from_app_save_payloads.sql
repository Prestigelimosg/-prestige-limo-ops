-- Sync Supabase schema with the current app save payloads.
-- The app's Rates UI persists to public.rate_settings.

create table if not exists public.companies (
  id bigserial primary key,
  company_name text not null,
  domain text,
  customer_rates jsonb not null default '{}'::jsonb,
  driver_payout_rules jsonb not null default '{}'::jsonb,
  aliases text[] not null default '{}'::text[],
  special_rules text,
  transzend_excel_privacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.companies
  add column if not exists company_name text,
  add column if not exists domain text,
  add column if not exists customer_rates jsonb not null default '{}'::jsonb,
  add column if not exists driver_payout_rules jsonb not null default '{}'::jsonb,
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists special_rules text,
  add column if not exists transzend_excel_privacy boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.companies
set
  customer_rates = coalesce(customer_rates, '{}'::jsonb),
  driver_payout_rules = coalesce(driver_payout_rules, '{}'::jsonb),
  aliases = coalesce(aliases, '{}'::text[]),
  transzend_excel_privacy = coalesce(transzend_excel_privacy, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where customer_rates is null
   or driver_payout_rules is null
   or aliases is null
   or transzend_excel_privacy is null
   or created_at is null
   or updated_at is null;

alter table public.companies
  alter column customer_rates set default '{}'::jsonb,
  alter column customer_rates set not null,
  alter column driver_payout_rules set default '{}'::jsonb,
  alter column driver_payout_rules set not null,
  alter column aliases set default '{}'::text[],
  alter column aliases set not null,
  alter column transzend_excel_privacy set default false,
  alter column transzend_excel_privacy set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create unique index if not exists companies_company_name_key
  on public.companies (lower(company_name))
  where company_name is not null;

create unique index if not exists companies_domain_key
  on public.companies (lower(domain))
  where domain is not null;

create table if not exists public.bookers (
  id bigserial primary key,
  company_id bigint references public.companies(id) on delete cascade,
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

update public.bookers
set
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where created_at is null
   or updated_at is null;

alter table public.bookers
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

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
  company_id bigint references public.companies(id) on delete cascade,
  traveler_name text not null,
  preferred_vehicle text,
  default_address text,
  default_pickup_address text,
  default_dropoff_address text,
  booker_id bigint references public.bookers(id) on delete set null,
  booker_name text,
  booker_contact text,
  booker_email text,
  customer_rates jsonb not null default '{}'::jsonb,
  driver_payout_rules jsonb not null default '{}'::jsonb,
  special_rules text,
  allow_excel_name boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.travelers
  add column if not exists company_id bigint references public.companies(id) on delete cascade,
  add column if not exists traveler_name text,
  add column if not exists preferred_vehicle text,
  add column if not exists default_address text,
  add column if not exists default_pickup_address text,
  add column if not exists default_dropoff_address text,
  add column if not exists booker_id bigint references public.bookers(id) on delete set null,
  add column if not exists booker_name text,
  add column if not exists booker_contact text,
  add column if not exists booker_email text,
  add column if not exists customer_rates jsonb not null default '{}'::jsonb,
  add column if not exists driver_payout_rules jsonb not null default '{}'::jsonb,
  add column if not exists special_rules text,
  add column if not exists allow_excel_name boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.travelers
set
  customer_rates = coalesce(customer_rates, '{}'::jsonb),
  driver_payout_rules = coalesce(driver_payout_rules, '{}'::jsonb),
  allow_excel_name = coalesce(allow_excel_name, true),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where customer_rates is null
   or driver_payout_rules is null
   or allow_excel_name is null
   or created_at is null
   or updated_at is null;

alter table public.travelers
  alter column customer_rates set default '{}'::jsonb,
  alter column customer_rates set not null,
  alter column driver_payout_rules set default '{}'::jsonb,
  alter column driver_payout_rules set not null,
  alter column allow_excel_name set default true,
  alter column allow_excel_name set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists travelers_name_idx
  on public.travelers (lower(traveler_name));

create unique index if not exists travelers_company_name_key
  on public.travelers (company_id, lower(traveler_name))
  where traveler_name is not null;

create table if not exists public.drivers (
  id bigserial primary key,
  driver_name text not null,
  contact_number text,
  vehicle_type text,
  plate_number text,
  payout_preferences text,
  driver_payout_rules jsonb not null default '{}'::jsonb,
  availability_status text not null default 'available',
  notes text,
  preferred_areas text,
  airport_permit_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drivers
  add column if not exists driver_name text,
  add column if not exists contact_number text,
  add column if not exists vehicle_type text,
  add column if not exists plate_number text,
  add column if not exists payout_preferences text,
  add column if not exists driver_payout_rules jsonb not null default '{}'::jsonb,
  add column if not exists availability_status text not null default 'available',
  add column if not exists notes text,
  add column if not exists preferred_areas text,
  add column if not exists airport_permit_notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.drivers
set
  driver_payout_rules = coalesce(driver_payout_rules, '{}'::jsonb),
  availability_status = coalesce(availability_status, 'available'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where driver_payout_rules is null
   or availability_status is null
   or created_at is null
   or updated_at is null;

alter table public.drivers
  alter column driver_payout_rules set default '{}'::jsonb,
  alter column driver_payout_rules set not null,
  alter column availability_status set default 'available',
  alter column availability_status set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create unique index if not exists drivers_driver_name_key
  on public.drivers (lower(driver_name))
  where driver_name is not null;

create table if not exists public.rate_settings (
  id text primary key default 'default',
  customer_rates jsonb not null default '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb,
  driver_payout_rules jsonb not null default '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb,
  midnight_surcharge numeric not null default 15,
  extra_stop_surcharge numeric not null default 0,
  midnight_payout numeric not null default 10,
  extra_stop_payout numeric not null default 10,
  child_seat_customer_surcharge numeric not null default 15,
  child_seat_driver_payout numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rate_settings
  add column if not exists id text default 'default',
  add column if not exists customer_rates jsonb not null default '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb,
  add column if not exists driver_payout_rules jsonb not null default '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb,
  add column if not exists midnight_surcharge numeric not null default 15,
  add column if not exists extra_stop_surcharge numeric not null default 0,
  add column if not exists midnight_payout numeric not null default 10,
  add column if not exists extra_stop_payout numeric not null default 10,
  add column if not exists child_seat_customer_surcharge numeric not null default 15,
  add column if not exists child_seat_driver_payout numeric not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.rate_settings
set
  id = coalesce(id, 'default'),
  customer_rates = coalesce(customer_rates, '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb),
  driver_payout_rules = coalesce(driver_payout_rules, '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb),
  midnight_surcharge = coalesce(midnight_surcharge, 15),
  extra_stop_surcharge = coalesce(extra_stop_surcharge, 0),
  midnight_payout = coalesce(midnight_payout, 10),
  extra_stop_payout = coalesce(extra_stop_payout, 10),
  child_seat_customer_surcharge = coalesce(child_seat_customer_surcharge, 15),
  child_seat_driver_payout = coalesce(child_seat_driver_payout, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where id is null
   or customer_rates is null
   or driver_payout_rules is null
   or midnight_surcharge is null
   or extra_stop_surcharge is null
   or midnight_payout is null
   or extra_stop_payout is null
   or child_seat_customer_surcharge is null
   or child_seat_driver_payout is null
   or created_at is null
   or updated_at is null;

alter table public.rate_settings
  alter column id set default 'default',
  alter column id set not null,
  alter column customer_rates set default '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb,
  alter column customer_rates set not null,
  alter column driver_payout_rules set default '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb,
  alter column driver_payout_rules set not null,
  alter column midnight_surcharge set default 15,
  alter column midnight_surcharge set not null,
  alter column extra_stop_surcharge set default 0,
  alter column extra_stop_surcharge set not null,
  alter column midnight_payout set default 10,
  alter column midnight_payout set not null,
  alter column extra_stop_payout set default 10,
  alter column extra_stop_payout set not null,
  alter column child_seat_customer_surcharge set default 15,
  alter column child_seat_customer_surcharge set not null,
  alter column child_seat_driver_payout set default 0,
  alter column child_seat_driver_payout set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

insert into public.rate_settings (
  id,
  customer_rates,
  driver_payout_rules,
  midnight_surcharge,
  extra_stop_surcharge,
  midnight_payout,
  extra_stop_payout,
  child_seat_customer_surcharge,
  child_seat_driver_payout
)
values (
  'default',
  '{"MNG":85,"DEP":75,"TRF":55,"DSP":65}'::jsonb,
  '{"MNG":{"min":65,"max":75},"DEP":{"min":55,"max":65},"TRF":{"min":45,"max":70},"DSP":{"amount":50,"perHour":true}}'::jsonb,
  15,
  0,
  10,
  10,
  15,
  0
)
on conflict (id) do update
set
  customer_rates = coalesce(public.rate_settings.customer_rates, excluded.customer_rates),
  driver_payout_rules = coalesce(public.rate_settings.driver_payout_rules, excluded.driver_payout_rules),
  midnight_surcharge = coalesce(public.rate_settings.midnight_surcharge, excluded.midnight_surcharge),
  extra_stop_surcharge = coalesce(public.rate_settings.extra_stop_surcharge, excluded.extra_stop_surcharge),
  midnight_payout = coalesce(public.rate_settings.midnight_payout, excluded.midnight_payout),
  extra_stop_payout = coalesce(public.rate_settings.extra_stop_payout, excluded.extra_stop_payout),
  child_seat_customer_surcharge = coalesce(public.rate_settings.child_seat_customer_surcharge, excluded.child_seat_customer_surcharge),
  child_seat_driver_payout = coalesce(public.rate_settings.child_seat_driver_payout, excluded.child_seat_driver_payout),
  updated_at = coalesce(public.rate_settings.updated_at, now());

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
  driver_id bigint references public.drivers(id) on delete set null,
  driver_name text,
  driver_contact text,
  driver_plate_number text,
  customer_rate numeric,
  customer_rate_unit text,
  customer_price_amount numeric,
  customer_rate_override numeric,
  customer_price_override_reason text,
  driver_payout_min numeric,
  driver_payout_max numeric,
  driver_payout_amount numeric,
  driver_payout_override numeric,
  driver_payout_reason text,
  driver_payout_unit text,
  driver_notes text,
  driver_dispatch_include_payout boolean not null default false,
  midnight_surcharge numeric not null default 0,
  midnight_payout numeric not null default 0,
  extra_stop_count integer not null default 0,
  extra_stop_surcharge numeric not null default 0,
  extra_stop_payout numeric not null default 10,
  child_seat_required boolean not null default false,
  child_seat_count integer not null default 0,
  child_seat_type text,
  child_seat_customer_surcharge numeric not null default 0,
  child_seat_driver_payout numeric not null default 0,
  pricing_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists company_id bigint references public.companies(id) on delete set null,
  add column if not exists booker_id bigint references public.bookers(id) on delete set null,
  add column if not exists traveler_id bigint references public.travelers(id) on delete set null,
  add column if not exists booking_type text,
  add column if not exists vehicle text,
  add column if not exists pickup_time text,
  add column if not exists pickup_address text,
  add column if not exists dropoff_address text,
  add column if not exists flight_no text,
  add column if not exists route text,
  add column if not exists pax integer,
  add column if not exists job_card text,
  add column if not exists status text,
  add column if not exists driver_id bigint references public.drivers(id) on delete set null,
  add column if not exists driver_name text,
  add column if not exists driver_contact text,
  add column if not exists driver_plate_number text,
  add column if not exists customer_rate numeric,
  add column if not exists customer_rate_unit text,
  add column if not exists customer_price_amount numeric,
  add column if not exists customer_rate_override numeric,
  add column if not exists customer_price_override_reason text,
  add column if not exists driver_payout_min numeric,
  add column if not exists driver_payout_max numeric,
  add column if not exists driver_payout_amount numeric,
  add column if not exists driver_payout_override numeric,
  add column if not exists driver_payout_reason text,
  add column if not exists driver_payout_unit text,
  add column if not exists driver_notes text,
  add column if not exists driver_dispatch_include_payout boolean not null default false,
  add column if not exists midnight_surcharge numeric not null default 0,
  add column if not exists midnight_payout numeric not null default 0,
  add column if not exists extra_stop_count integer not null default 0,
  add column if not exists extra_stop_surcharge numeric not null default 0,
  add column if not exists extra_stop_payout numeric not null default 10,
  add column if not exists child_seat_required boolean not null default false,
  add column if not exists child_seat_count integer not null default 0,
  add column if not exists child_seat_type text,
  add column if not exists child_seat_customer_surcharge numeric not null default 0,
  add column if not exists child_seat_driver_payout numeric not null default 0,
  add column if not exists pricing_source text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.bookings
set
  driver_dispatch_include_payout = coalesce(driver_dispatch_include_payout, false),
  midnight_surcharge = coalesce(midnight_surcharge, 0),
  midnight_payout = coalesce(midnight_payout, 0),
  extra_stop_count = coalesce(extra_stop_count, 0),
  extra_stop_surcharge = coalesce(extra_stop_surcharge, 0),
  extra_stop_payout = coalesce(extra_stop_payout, 10),
  child_seat_required = coalesce(child_seat_required, false),
  child_seat_count = coalesce(child_seat_count, 0),
  child_seat_customer_surcharge = coalesce(child_seat_customer_surcharge, 0),
  child_seat_driver_payout = coalesce(child_seat_driver_payout, 0),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where driver_dispatch_include_payout is null
   or midnight_surcharge is null
   or midnight_payout is null
   or extra_stop_count is null
   or extra_stop_surcharge is null
   or extra_stop_payout is null
   or child_seat_required is null
   or child_seat_count is null
   or child_seat_customer_surcharge is null
   or child_seat_driver_payout is null
   or created_at is null
   or updated_at is null;

alter table public.bookings
  alter column driver_dispatch_include_payout set default false,
  alter column driver_dispatch_include_payout set not null,
  alter column midnight_surcharge set default 0,
  alter column midnight_surcharge set not null,
  alter column midnight_payout set default 0,
  alter column midnight_payout set not null,
  alter column extra_stop_count set default 0,
  alter column extra_stop_count set not null,
  alter column extra_stop_surcharge set default 0,
  alter column extra_stop_surcharge set not null,
  alter column extra_stop_payout set default 10,
  alter column extra_stop_payout set not null,
  alter column child_seat_required set default false,
  alter column child_seat_required set not null,
  alter column child_seat_count set default 0,
  alter column child_seat_count set not null,
  alter column child_seat_customer_surcharge set default 0,
  alter column child_seat_customer_surcharge set not null,
  alter column child_seat_driver_payout set default 0,
  alter column child_seat_driver_payout set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists bookings_driver_id_idx
  on public.bookings (driver_id, pickup_time);

create index if not exists bookings_pickup_time_idx
  on public.bookings (pickup_time);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bookers'::regclass
      and confrelid = 'public.companies'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.bookers'::regclass and attname = 'company_id')
      ]::smallint[]
  ) then
    alter table public.bookers
      add constraint bookers_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.travelers'::regclass
      and confrelid = 'public.companies'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.travelers'::regclass and attname = 'company_id')
      ]::smallint[]
  ) then
    alter table public.travelers
      add constraint travelers_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete cascade not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.travelers'::regclass
      and confrelid = 'public.bookers'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.travelers'::regclass and attname = 'booker_id')
      ]::smallint[]
  ) then
    alter table public.travelers
      add constraint travelers_booker_id_fkey
      foreign key (booker_id) references public.bookers(id) on delete set null not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and confrelid = 'public.companies'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.bookings'::regclass and attname = 'company_id')
      ]::smallint[]
  ) then
    alter table public.bookings
      add constraint bookings_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete set null not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and confrelid = 'public.bookers'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.bookings'::regclass and attname = 'booker_id')
      ]::smallint[]
  ) then
    alter table public.bookings
      add constraint bookings_booker_id_fkey
      foreign key (booker_id) references public.bookers(id) on delete set null not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and confrelid = 'public.travelers'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.bookings'::regclass and attname = 'traveler_id')
      ]::smallint[]
  ) then
    alter table public.bookings
      add constraint bookings_traveler_id_fkey
      foreign key (traveler_id) references public.travelers(id) on delete set null not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and confrelid = 'public.drivers'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.bookings'::regclass and attname = 'driver_id')
      ]::smallint[]
  ) then
    alter table public.bookings
      add constraint bookings_driver_id_fkey
      foreign key (driver_id) references public.drivers(id) on delete set null not valid;
  end if;
end $$;
