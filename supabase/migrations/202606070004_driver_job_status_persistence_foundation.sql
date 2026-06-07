-- Driver job status persistence foundation.
-- Created for review only in this stage; do not apply without explicit approval.
-- This migration prepares server-only driver job token verification and status
-- event storage for future production driver API persistence.
-- No customer auth activation, invoice, PDF, payment, payout, notification
-- sending, live-location, proof/photo, parser-learning, or finance data is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.driver_job_links (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null,
  token_hash text not null,
  link_status text not null default 'active',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  safe_link_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_job_links_reference_not_blank check (length(btrim(booking_reference)) > 0),
  constraint driver_job_links_token_hash_not_blank check (length(btrim(token_hash)) >= 32),
  constraint driver_job_links_status_check check (
    link_status in ('active', 'expired', 'revoked')
  ),
  constraint driver_job_links_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint driver_job_links_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint driver_job_links_safe_context_object check (
    jsonb_typeof(safe_link_context) = 'object'
  )
);

comment on table public.driver_job_links is
  'Server-only driver job token hash foundation for future production driver job access. RLS is enabled; raw tokens and broad customer/driver runtime access are not approved here.';

comment on column public.driver_job_links.booking_reference is
  'Safe booking reference used as the stable link to a driver job without coupling to historical bookings.id type differences.';

comment on column public.driver_job_links.token_hash is
  'Server-only hash of the driver job token. Raw tokens must never be stored or returned.';

comment on column public.driver_job_links.safe_link_context is
  'Safe operational link context only. Do not store raw tokens, prices, payouts, payment details, notification payloads, auth links, parser/debug internals, proof/photo data, live-location data, or internal finance notes.';

alter table public.driver_job_links
  add column if not exists booking_reference text,
  add column if not exists token_hash text,
  add column if not exists link_status text not null default 'active',
  add column if not exists issued_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists safe_link_context jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists driver_job_links_token_hash_key
  on public.driver_job_links (token_hash);

create index if not exists driver_job_links_booking_reference_idx
  on public.driver_job_links (booking_reference);

create index if not exists driver_job_links_link_status_idx
  on public.driver_job_links (link_status);

create index if not exists driver_job_links_expires_at_idx
  on public.driver_job_links (expires_at);

create index if not exists driver_job_links_updated_at_idx
  on public.driver_job_links (updated_at);

create table if not exists public.driver_job_status_events (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null,
  driver_job_link_id uuid,
  status_value text not null,
  status_source text not null default 'driver_job_api',
  safe_status_note text,
  safe_status_context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  source_surface text not null default 'driver_job_api',
  actor_role text not null default 'driver',
  actor_label text,
  created_at timestamptz not null default now(),
  constraint driver_job_status_events_reference_not_blank check (length(btrim(booking_reference)) > 0),
  constraint driver_job_status_events_status_value_check check (
    status_value in (
      'acknowledged',
      'driver_otw',
      'ots',
      'pob',
      'completed',
      'needs_call'
    )
  ),
  constraint driver_job_status_events_status_source_check check (
    status_source in ('driver_job_api', 'admin_api', 'system')
  ),
  constraint driver_job_status_events_source_surface_check check (
    source_surface in ('driver_job_api', 'admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint driver_job_status_events_actor_role_check check (
    actor_role in ('driver', 'admin', 'dispatcher', 'system')
  ),
  constraint driver_job_status_events_safe_context_object check (
    jsonb_typeof(safe_status_context) = 'object'
  ),
  constraint driver_job_status_events_safe_note_length check (
    safe_status_note is null or length(safe_status_note) <= 1000
  )
);

comment on table public.driver_job_status_events is
  'Server-only driver job status event persistence foundation for future production driver workflow. RLS is enabled; public/customer/driver runtime access is not approved here.';

comment on column public.driver_job_status_events.driver_job_link_id is
  'Optional server-side link to the hashed driver job token row after the approved migration/API stage is applied.';

comment on column public.driver_job_status_events.safe_status_context is
  'Safe operational status context only. Do not store prices, payouts, payment details, notification payloads, auth links, parser/debug internals, proof/photo data, live-location data, or internal finance notes.';

alter table public.driver_job_status_events
  add column if not exists booking_reference text,
  add column if not exists driver_job_link_id uuid,
  add column if not exists status_value text,
  add column if not exists status_source text not null default 'driver_job_api',
  add column if not exists safe_status_note text,
  add column if not exists safe_status_context jsonb not null default '{}'::jsonb,
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists source_surface text not null default 'driver_job_api',
  add column if not exists actor_role text not null default 'driver',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists driver_job_status_events_booking_reference_idx
  on public.driver_job_status_events (booking_reference);

create index if not exists driver_job_status_events_driver_job_link_id_idx
  on public.driver_job_status_events (driver_job_link_id);

create index if not exists driver_job_status_events_status_value_idx
  on public.driver_job_status_events (status_value);

create index if not exists driver_job_status_events_occurred_at_idx
  on public.driver_job_status_events (occurred_at);

alter table public.driver_job_links enable row level security;
alter table public.driver_job_status_events enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved server API/RLS stage must
-- define the token verification and exact-row status persistence path before
-- runtime production driver reads or writes are enabled.
