-- Stage 4A-311: admin-only booking persistence foundation.
-- This migration prepares operational booking storage only.
-- No public, customer, driver, or finance access policy is approved here.
-- Billing, payment, payout, notification, live-location, proof/photo,
-- customer auth, and parser-learning data are intentionally excluded.

create table if not exists public.customers (
  id bigserial primary key,
  display_name text not null,
  customer_type text,
  account_status text not null default 'active',
  primary_phone text,
  primary_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers
  add column if not exists display_name text,
  add column if not exists customer_type text,
  add column if not exists account_status text not null default 'active',
  add column if not exists primary_phone text,
  add column if not exists primary_email text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists customers_display_name_idx
  on public.customers (lower(display_name));

create index if not exists customers_primary_email_idx
  on public.customers (lower(primary_email))
  where primary_email is not null;

comment on table public.customers is
  'Admin-only operational customer references for future booking persistence; no billing, auth, payment, or finance fields.';

create table if not exists public.customer_contacts (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  contact_name text not null,
  phone text,
  email text,
  contact_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_contacts
  add column if not exists customer_id bigint references public.customers(id) on delete cascade,
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists contact_type text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists customer_contacts_customer_id_idx
  on public.customer_contacts (customer_id);

create index if not exists customer_contacts_email_idx
  on public.customer_contacts (lower(email))
  where email is not null;

comment on table public.customer_contacts is
  'Admin-only operational contact separation for future booking persistence; no billing, payment, or auth fields.';

create table if not exists public.bookings (
  id bigserial primary key,
  booking_reference text,
  customer_id bigint references public.customers(id) on delete set null,
  source_channel text,
  pickup_datetime timestamptz,
  pickup_location text,
  dropoff_location text,
  route_type text,
  customer_display_name text,
  contact_phone text,
  contact_email text,
  pax_count integer,
  luggage_count integer,
  vehicle_type_or_category text,
  customer_facing_status text,
  admin_internal_status text,
  short_notice_review_status text,
  parser_source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists booking_reference text,
  add column if not exists customer_id bigint references public.customers(id) on delete set null,
  add column if not exists source_channel text,
  add column if not exists pickup_datetime timestamptz,
  add column if not exists pickup_location text,
  add column if not exists dropoff_location text,
  add column if not exists route_type text,
  add column if not exists customer_display_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists pax_count integer,
  add column if not exists luggage_count integer,
  add column if not exists vehicle_type_or_category text,
  add column if not exists customer_facing_status text,
  add column if not exists admin_internal_status text,
  add column if not exists short_notice_review_status text,
  add column if not exists parser_source_reference text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists bookings_booking_reference_key
  on public.bookings (booking_reference)
  where booking_reference is not null;

create index if not exists bookings_customer_id_idx
  on public.bookings (customer_id);

create index if not exists bookings_pickup_datetime_idx
  on public.bookings (pickup_datetime);

comment on table public.bookings is
  'Admin-only operational booking persistence foundation; pricing, billing, payout, notification, live-location, proof/photo, customer auth, and parser-learning fields are excluded.';

comment on column public.bookings.short_notice_review_status is
  'Future support field for short-notice Admin Review Required handling; no app rule is implemented by this migration.';

create table if not exists public.booking_route_points (
  id bigserial primary key,
  booking_id bigint not null references public.bookings(id) on delete cascade,
  point_type text not null check (point_type in ('pickup', 'dropoff', 'stop', 'waypoint')),
  sequence_number integer not null,
  location_text text not null,
  timing_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_route_points_booking_order_idx
  on public.booking_route_points (booking_id, sequence_number);

comment on table public.booking_route_points is
  'Admin-only operational route points; no maps, geocoding, live-location, proof/photo, pricing, billing, or payout data.';

create table if not exists public.booking_service_items (
  id bigserial primary key,
  booking_id bigint not null references public.bookings(id) on delete cascade,
  service_item_type text not null check (
    service_item_type in ('child_seat', 'extra_stop', 'waiting_time', 'midnight_charge')
  ),
  quantity integer,
  blocks_count integer,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_service_items_booking_id_idx
  on public.booking_service_items (booking_id);

create index if not exists booking_service_items_type_idx
  on public.booking_service_items (service_item_type);

comment on table public.booking_service_items is
  'Admin-only operational service items kept distinct from pricing, billing, invoice, payout, and payment data.';

create table if not exists public.audit_logs (
  id bigserial primary key,
  entity_type text not null,
  entity_id bigint,
  action text not null,
  source_route text,
  actor_label text,
  change_summary text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at);

comment on table public.audit_logs is
  'Internal-only audit foundation for admin booking persistence; not for customer or driver route exposure.';

alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_route_points enable row level security;
alter table public.booking_service_items enable row level security;
alter table public.audit_logs enable row level security;

-- RLS is intentionally enabled without broad public, customer, driver, or
-- finance policies. A later approved API/auth stage must define the access
-- path before this data is exposed to any runtime route.
