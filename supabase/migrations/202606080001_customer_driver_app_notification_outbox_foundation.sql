-- Customer/driver in-app notification outbox foundation.
-- Created for review only; do not apply without explicit approval.
-- This migration prepares safe in-app notification storage for customer and
-- driver app surfaces only. It does not send Telegram, WhatsApp, SMS, email,
-- push, invoice, PDF, payment, payout, live-location, proof/photo, parser, or
-- customer/driver auth behavior.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.customer_driver_app_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  notification_status text not null default 'queued',
  priority text not null default 'normal',
  delivery_surface text not null,
  event_key text,
  booking_reference text,
  driver_job_link_id uuid references public.driver_job_links(id) on delete set null,
  workflow_area text,
  safe_title text not null,
  safe_message text not null,
  safe_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_driver_app_notification_type_check check (
    notification_type in (
      'booking_status',
      'driver_status',
      'trip_update',
      'system_notice'
    )
  ),
  constraint customer_driver_app_notification_status_check check (
    notification_status in ('queued', 'read', 'dismissed', 'archived', 'blocked')
  ),
  constraint customer_driver_app_notification_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  constraint customer_driver_app_notification_delivery_surface_check check (
    delivery_surface in ('customer_app', 'driver_app')
  ),
  constraint customer_driver_app_notification_source_surface_check check (
    source_surface in ('admin_api', 'customer_api', 'driver_api', 'migration', 'system')
  ),
  constraint customer_driver_app_notification_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'customer', 'driver', 'system')
  ),
  constraint customer_driver_app_notification_title_not_blank check (
    length(btrim(safe_title)) > 0 and length(safe_title) <= 160
  ),
  constraint customer_driver_app_notification_message_not_blank check (
    length(btrim(safe_message)) > 0 and length(safe_message) <= 1000
  ),
  constraint customer_driver_app_notification_event_key_length check (
    event_key is null or length(event_key) <= 180
  ),
  constraint customer_driver_app_notification_reference_length check (
    booking_reference is null or length(booking_reference) <= 120
  ),
  constraint customer_driver_app_notification_workflow_area_length check (
    workflow_area is null or length(workflow_area) <= 80
  ),
  constraint customer_driver_app_notification_safe_context_object check (
    jsonb_typeof(safe_context) = 'object'
  ),
  constraint customer_driver_app_notification_driver_scope_check check (
    delivery_surface <> 'driver_app'
    or driver_job_link_id is not null
    or booking_reference is not null
  )
);

comment on table public.customer_driver_app_notification_outbox is
  'Customer/driver in-app notification outbox foundation. RLS is enabled; browser access requires later approved server API and auth/token gates.';

comment on column public.customer_driver_app_notification_outbox.safe_title is
  'Safe customer/driver-facing notification title only. Do not store prices, payouts, payment details, invoice data, PDF links, external delivery payloads, auth tokens, parser/debug internals, proof/photo data, internal notes, or finance notes.';

comment on column public.customer_driver_app_notification_outbox.safe_context is
  'Safe display context for in-app notification display only. This does not send messages or activate external delivery channels.';

alter table public.customer_driver_app_notification_outbox
  add column if not exists notification_type text,
  add column if not exists notification_status text not null default 'queued',
  add column if not exists priority text not null default 'normal',
  add column if not exists delivery_surface text,
  add column if not exists event_key text,
  add column if not exists booking_reference text,
  add column if not exists driver_job_link_id uuid references public.driver_job_links(id) on delete set null,
  add column if not exists workflow_area text,
  add column if not exists safe_title text,
  add column if not exists safe_message text,
  add column if not exists safe_context jsonb not null default '{}'::jsonb,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists customer_driver_app_notification_outbox_event_key_key
  on public.customer_driver_app_notification_outbox (event_key)
  where event_key is not null;

create index if not exists customer_driver_app_notification_outbox_surface_status_idx
  on public.customer_driver_app_notification_outbox (delivery_surface, notification_status);

create index if not exists customer_driver_app_notification_outbox_booking_reference_idx
  on public.customer_driver_app_notification_outbox (booking_reference);

create index if not exists customer_driver_app_notification_outbox_driver_job_link_idx
  on public.customer_driver_app_notification_outbox (driver_job_link_id);

create index if not exists customer_driver_app_notification_outbox_created_at_idx
  on public.customer_driver_app_notification_outbox (created_at);

alter table public.customer_driver_app_notification_outbox enable row level security;

-- RLS is intentionally enabled without public, anonymous, broad authenticated,
-- customer, or driver policies. Customer access must wait for customer auth.
-- Driver access must go through the server-only hashed-token API.
