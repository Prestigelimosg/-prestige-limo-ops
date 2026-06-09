-- Driver portal bidding foundation.
-- Created for review only in this stage; do not apply without explicit approval.
-- This migration prepares a closed backend schema for drivers to bid on advance
-- jobs, while keeping assignment/day-of acknowledgement in the existing guarded
-- driver job link and status-event flow.
-- No customer/driver auth activation, invoice, PDF, payment, payout, notification
-- sending, live-location, proof/photo, parser-learning, or finance behavior is
-- activated here.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.driver_job_bid_offers (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null,
  offer_status text not null default 'open',
  pickup_at timestamptz not null,
  safe_pickup_area text not null,
  safe_dropoff_area text not null,
  safe_vehicle_label text,
  safe_trip_summary text,
  safe_offer_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  opened_at timestamptz not null default now(),
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_job_bid_offers_reference_not_blank check (
    length(btrim(booking_reference)) > 0
    and length(booking_reference) <= 120
  ),
  constraint driver_job_bid_offers_status_check check (
    offer_status in ('draft', 'open', 'closed', 'assigned', 'cancelled', 'expired')
  ),
  constraint driver_job_bid_offers_pickup_area_not_blank check (
    length(btrim(safe_pickup_area)) > 0
    and length(safe_pickup_area) <= 160
  ),
  constraint driver_job_bid_offers_dropoff_area_not_blank check (
    length(btrim(safe_dropoff_area)) > 0
    and length(safe_dropoff_area) <= 160
  ),
  constraint driver_job_bid_offers_vehicle_label_length check (
    safe_vehicle_label is null or length(safe_vehicle_label) <= 120
  ),
  constraint driver_job_bid_offers_trip_summary_length check (
    safe_trip_summary is null or length(safe_trip_summary) <= 1000
  ),
  constraint driver_job_bid_offers_context_object check (
    jsonb_typeof(safe_offer_context) = 'object'
  ),
  constraint driver_job_bid_offers_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint driver_job_bid_offers_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  )
);

comment on table public.driver_job_bid_offers is
  'Closed server-side foundation for future driver portal advance job offers. RLS is enabled; runtime driver/customer access is not activated here.';

comment on column public.driver_job_bid_offers.booking_reference is
  'Safe booking reference for the offered job without coupling to historical bookings.id type differences.';

comment on column public.driver_job_bid_offers.safe_offer_context is
  'Safe operational offer context only. Do not store customer prices, billing, invoice/payment details, payout details, PayNow payout details, parser/debug internals, proof/photo data, live-location data, internal notes, or finance notes.';

create index if not exists driver_job_bid_offers_booking_reference_idx
  on public.driver_job_bid_offers (booking_reference);

create index if not exists driver_job_bid_offers_status_pickup_idx
  on public.driver_job_bid_offers (offer_status, pickup_at);

create index if not exists driver_job_bid_offers_pickup_at_idx
  on public.driver_job_bid_offers (pickup_at);

create table if not exists public.driver_job_bids (
  id uuid primary key default gen_random_uuid(),
  driver_job_bid_offer_id uuid not null references public.driver_job_bid_offers(id) on delete cascade,
  booking_reference text not null,
  driver_reference text not null,
  bid_status text not null default 'pending',
  bid_source text not null default 'driver_portal_api',
  safe_driver_label text,
  safe_bid_note text,
  safe_bid_context jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  decided_at timestamptz,
  decision_actor_role text,
  decision_actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_job_bids_reference_not_blank check (
    length(btrim(booking_reference)) > 0
    and length(booking_reference) <= 120
  ),
  constraint driver_job_bids_driver_reference_not_blank check (
    length(btrim(driver_reference)) > 0
    and length(driver_reference) <= 120
  ),
  constraint driver_job_bids_status_check check (
    bid_status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')
  ),
  constraint driver_job_bids_source_check check (
    bid_source in ('driver_portal_api', 'admin_api', 'migration', 'system')
  ),
  constraint driver_job_bids_driver_label_length check (
    safe_driver_label is null or length(safe_driver_label) <= 160
  ),
  constraint driver_job_bids_note_length check (
    safe_bid_note is null or length(safe_bid_note) <= 1000
  ),
  constraint driver_job_bids_context_object check (
    jsonb_typeof(safe_bid_context) = 'object'
  ),
  constraint driver_job_bids_decision_actor_role_check check (
    decision_actor_role is null
    or decision_actor_role in ('admin', 'dispatcher', 'system')
  )
);

comment on table public.driver_job_bids is
  'Closed server-side foundation for future driver advance-job bids. A bid is not a day-of acknowledgement; acknowledgement and OTW/OTS/POB/JC evidence remain in driver_job_status_events.';

comment on column public.driver_job_bids.driver_reference is
  'Safe driver reference for a future driver portal. This does not activate driver auth or expose token internals.';

comment on column public.driver_job_bids.safe_bid_context is
  'Safe operational bid context only. Do not store customer prices, billing, invoice/payment details, payout details, PayNow payout details, parser/debug internals, proof/photo data, live-location data, internal notes, or finance notes.';

create unique index if not exists driver_job_bids_offer_driver_key
  on public.driver_job_bids (driver_job_bid_offer_id, driver_reference);

create unique index if not exists driver_job_bids_one_accepted_bid_per_offer_key
  on public.driver_job_bids (driver_job_bid_offer_id)
  where bid_status = 'accepted';

create index if not exists driver_job_bids_booking_reference_idx
  on public.driver_job_bids (booking_reference);

create index if not exists driver_job_bids_driver_reference_submitted_idx
  on public.driver_job_bids (driver_reference, submitted_at desc);

create index if not exists driver_job_bids_status_submitted_idx
  on public.driver_job_bids (bid_status, submitted_at desc);

comment on table public.driver_job_status_events is
  'Server-only driver job status event persistence for assigned-job evidence. Status history is retained until a separately approved cleanup or retention policy is created.';

alter table public.driver_job_bid_offers enable row level security;
alter table public.driver_job_bids enable row level security;

-- RLS is intentionally enabled without public, anonymous, broad authenticated,
-- customer, or driver policies. Later approved API/RLS stages must define exact
-- admin publishing, driver bidding, driver ownership, and assignment paths
-- before runtime production bidding reads or writes are enabled.
