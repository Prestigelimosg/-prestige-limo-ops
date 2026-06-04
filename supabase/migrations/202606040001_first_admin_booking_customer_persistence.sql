-- Stage 4A-373: first admin-only booking/customer persistence migration file.
-- Created for review only in this stage; do not apply without explicit approval.
-- Access remains closed by RLS until a later approved server-side API/role stage.
-- Service-role credentials must stay server-only and must never be exposed to browsers.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  account_code text,
  customer_type text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint customers_status_check check (status in ('active', 'inactive', 'archived')),
  constraint customers_customer_type_check check (
    customer_type is null
    or customer_type in ('corporate', 'hotel', 'individual', 'vip', 'partner', 'other')
  )
);

comment on table public.customers is
  'Admin-only customer/account persistence foundation. RLS is enabled; no public access policies are created.';

alter table public.customers
  add column if not exists account_code text,
  add column if not exists customer_type text,
  add column if not exists status text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  display_name text,
  phone text,
  email text,
  role_label text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contacts_display_name_not_blank check (
    display_name is null or length(btrim(display_name)) > 0
  ),
  constraint customer_contacts_contact_present check (
    phone is not null or email is not null or display_name is not null
  )
);

comment on table public.customer_contacts is
  'Admin-only safe customer contact details for operational booking coordination.';

alter table public.customer_contacts
  add column if not exists display_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists role_label text,
  add column if not exists is_primary boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_display_name text not null,
  contact_display_name text,
  contact_phone text,
  contact_email text,
  service_type text not null,
  pickup_at timestamptz not null,
  pickup_location text not null,
  dropoff_location text not null,
  route_summary text,
  passenger_name text,
  passenger_phone text,
  admin_internal_status text not null default 'draft',
  customer_facing_status text not null default 'pending_review',
  short_notice_review_status text,
  request_review_status text,
  change_review_status text,
  cancellation_review_status text,
  source_surface text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_reference_not_blank check (length(btrim(booking_reference)) > 0),
  constraint bookings_customer_display_name_not_blank check (length(btrim(customer_display_name)) > 0),
  constraint bookings_service_type_check check (
    service_type in (
      'MNG',
      'DEP',
      'TRF',
      'DSP',
      'arrival',
      'departure',
      'transfer',
      'hourly',
      'standby',
      'event',
      'seaport_transfer',
      'point_to_point',
      'other'
    )
  ),
  constraint bookings_pickup_location_not_blank check (length(btrim(pickup_location)) > 0),
  constraint bookings_dropoff_location_not_blank check (length(btrim(dropoff_location)) > 0),
  constraint bookings_admin_internal_status_check check (
    admin_internal_status in (
      'draft',
      'needs_review',
      'admin_review_required',
      'approved_internal',
      'declined_internal',
      'confirmed',
      'driver_pending',
      'driver_assigned',
      'in_progress',
      'completed',
      'cancelled',
      'archived'
    )
  ),
  constraint bookings_customer_facing_status_check check (
    customer_facing_status in (
      'pending_review',
      'received',
      'not_confirmed',
      'confirmed',
      'driver_pending',
      'driver_assigned',
      'completed',
      'cancelled',
      'declined'
    )
  ),
  constraint bookings_short_notice_review_status_check check (
    short_notice_review_status is null
    or short_notice_review_status in ('not_required', 'admin_review_required', 'needs_review', 'reviewed')
  ),
  constraint bookings_request_review_status_check check (
    request_review_status is null
    or request_review_status in ('requested', 'pending_review', 'needs_review', 'approved', 'declined')
  ),
  constraint bookings_change_review_status_check check (
    change_review_status is null
    or change_review_status in ('requested', 'pending_review', 'needs_review', 'approved', 'declined', 'completed')
  ),
  constraint bookings_cancellation_review_status_check check (
    cancellation_review_status is null
    or cancellation_review_status in ('requested', 'pending_review', 'needs_review', 'approved', 'declined', 'cancelled')
  ),
  constraint bookings_source_surface_check check (
    source_surface is null
    or source_surface in (
      'admin_dashboard',
      'admin_api',
      'customer_booking_request',
      'customer_portal',
      'driver_job',
      'migration',
      'system'
    )
  )
);

comment on table public.bookings is
  'Admin-only safe operational booking persistence foundation. RLS is enabled; customer/driver read contracts are later phases.';

comment on column public.bookings.short_notice_review_status is
  'Safe review status for short-notice bookings; this migration does not auto-confirm or notify customers.';

alter table public.bookings
  add column if not exists booking_reference text,
  add column if not exists customer_display_name text,
  add column if not exists contact_display_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text,
  add column if not exists service_type text,
  add column if not exists pickup_at timestamptz,
  add column if not exists pickup_location text,
  add column if not exists dropoff_location text,
  add column if not exists route_summary text,
  add column if not exists passenger_name text,
  add column if not exists passenger_phone text,
  add column if not exists admin_internal_status text not null default 'draft',
  add column if not exists customer_facing_status text not null default 'pending_review',
  add column if not exists short_notice_review_status text,
  add column if not exists request_review_status text,
  add column if not exists change_review_status text,
  add column if not exists cancellation_review_status text,
  add column if not exists source_surface text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.booking_route_points (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  sequence integer not null,
  point_type text not null,
  location text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint booking_route_points_sequence_positive check (sequence > 0),
  constraint booking_route_points_point_type_check check (
    point_type in ('pickup', 'dropoff', 'stop', 'waypoint', 'extra_stop')
  ),
  constraint booking_route_points_location_not_blank check (length(btrim(location)) > 0)
);

comment on table public.booking_route_points is
  'Safe route point details for admin-only operational booking review.';

alter table public.booking_route_points
  add column if not exists sequence integer,
  add column if not exists point_type text,
  add column if not exists location text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.booking_service_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  item_type text not null,
  quantity integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  constraint booking_service_items_item_type_check check (
    item_type in ('child_seat', 'extra_stop', 'waiting_time', 'midnight', 'luggage', 'vehicle_request', 'other')
  ),
  constraint booking_service_items_quantity_positive check (quantity > 0)
);

comment on table public.booking_service_items is
  'Safe service item details only; financial calculations and billing behavior are intentionally outside this table.';

alter table public.booking_service_items
  add column if not exists item_type text,
  add column if not exists quantity integer not null default 1,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  actor_role text not null,
  action_type text not null,
  booking_reference text,
  source_surface text,
  reason text,
  safe_before jsonb,
  safe_after jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_role_check check (actor_role in ('admin', 'dispatcher', 'system')),
  constraint audit_logs_action_type_check check (
    action_type in (
      'booking_created',
      'booking_updated',
      'booking_amended',
      'booking_cancelled',
      'customer_amend_request_reviewed',
      'customer_cancellation_request_reviewed',
      'driver_assigned',
      'driver_status_updated',
      'admin_dispatcher_override',
      'rollback_reviewed'
    )
  ),
  constraint audit_logs_source_surface_check check (
    source_surface is null
    or source_surface in ('admin_dashboard', 'admin_api', 'migration', 'system')
  )
);

comment on table public.audit_logs is
  'Internal audit foundation with safe operational snapshots only. Raw audit rows are not for customer or driver routes.';

alter table public.audit_logs
  add column if not exists booking_id bigint references public.bookings(id) on delete set null,
  add column if not exists customer_id bigint references public.customers(id) on delete set null,
  add column if not exists actor_role text,
  add column if not exists action_type text,
  add column if not exists booking_reference text,
  add column if not exists source_surface text,
  add column if not exists reason text,
  add column if not exists safe_before jsonb,
  add column if not exists safe_after jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists customers_display_name_idx
  on public.customers (lower(display_name));

create index if not exists customers_account_code_idx
  on public.customers (lower(account_code))
  where account_code is not null;

create index if not exists customers_status_idx
  on public.customers (status);

create index if not exists customer_contacts_customer_id_idx
  on public.customer_contacts (customer_id);

create index if not exists customer_contacts_email_idx
  on public.customer_contacts (lower(email))
  where email is not null;

create index if not exists bookings_booking_reference_idx
  on public.bookings (booking_reference);

create index if not exists bookings_customer_id_idx
  on public.bookings (customer_id);

create index if not exists bookings_pickup_at_idx
  on public.bookings (pickup_at);

create index if not exists bookings_customer_facing_status_idx
  on public.bookings (customer_facing_status);

create index if not exists bookings_admin_internal_status_idx
  on public.bookings (admin_internal_status);

create index if not exists booking_route_points_booking_sequence_idx
  on public.booking_route_points (booking_id, sequence);

create index if not exists booking_service_items_booking_id_idx
  on public.booking_service_items (booking_id);

create index if not exists audit_logs_booking_id_idx
  on public.audit_logs (booking_id);

create index if not exists audit_logs_customer_id_idx
  on public.audit_logs (customer_id);

create index if not exists audit_logs_action_type_idx
  on public.audit_logs (action_type);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at);

alter table public.customers enable row level security;
alter table public.customer_contacts enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_route_points enable row level security;
alter table public.booking_service_items enable row level security;
alter table public.audit_logs enable row level security;

-- RLS is intentionally enabled without public anonymous policies.
-- A later approved server-side API stage must define verified admin/dispatcher
-- role access before these tables are used by production runtime paths.
