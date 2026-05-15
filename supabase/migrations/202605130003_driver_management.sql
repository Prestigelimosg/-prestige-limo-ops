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

create unique index if not exists drivers_driver_name_key
  on public.drivers (lower(driver_name))
  where driver_name is not null;

alter table public.bookings
  add column if not exists driver_id bigint references public.drivers(id) on delete set null,
  add column if not exists driver_contact text,
  add column if not exists driver_plate_number text,
  add column if not exists driver_payout_amount numeric,
  add column if not exists driver_payout_override numeric,
  add column if not exists driver_payout_reason text,
  add column if not exists driver_notes text,
  add column if not exists driver_dispatch_include_payout boolean not null default false;

create index if not exists bookings_driver_id_idx
  on public.bookings (driver_id, pickup_time);
