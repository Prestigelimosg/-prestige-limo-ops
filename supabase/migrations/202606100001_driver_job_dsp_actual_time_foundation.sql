-- Driver job DSP actual time foundation.
-- Created for review only in this stage; do not apply without explicit approval.
-- This migration prepares server-only DSP start/end timing evidence for future
-- admin billing review. It does not create customer charges, invoices, PDFs,
-- payments, payouts, notifications, live-location, proof/photo upload, auth
-- activation, parser-learning, or finance data.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.driver_job_dsp_actual_time_events (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null,
  driver_job_link_id uuid references public.driver_job_links(id) on delete set null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  safe_event_note text,
  safe_event_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'driver_job_api',
  actor_role text not null default 'driver',
  actor_label text,
  created_at timestamptz not null default now(),
  constraint driver_job_dsp_actual_time_events_reference_not_blank check (
    length(btrim(booking_reference)) > 0
  ),
  constraint driver_job_dsp_actual_time_events_event_type_check check (
    event_type in ('dsp_start', 'dsp_end')
  ),
  constraint driver_job_dsp_actual_time_events_context_object check (
    jsonb_typeof(safe_event_context) = 'object'
  ),
  constraint driver_job_dsp_actual_time_events_note_length check (
    safe_event_note is null or length(safe_event_note) <= 1000
  ),
  constraint driver_job_dsp_actual_time_events_source_surface_check check (
    source_surface in ('driver_job_api', 'admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint driver_job_dsp_actual_time_events_actor_role_check check (
    actor_role in ('driver', 'admin', 'dispatcher', 'system')
  )
);

comment on table public.driver_job_dsp_actual_time_events is
  'Server-only append-only DSP start/end timing evidence for future admin billing review. RLS is enabled; customer and driver broad runtime access is not approved here.';

comment on column public.driver_job_dsp_actual_time_events.booking_reference is
  'Safe booking reference used to connect DSP actual timing evidence to the job without coupling to historical bookings.id type differences.';

comment on column public.driver_job_dsp_actual_time_events.driver_job_link_id is
  'Optional server-side link to the hashed driver job token row. Raw driver job tokens must never be stored or returned.';

comment on column public.driver_job_dsp_actual_time_events.event_type is
  'Operational DSP timing marker only: dsp_start or dsp_end.';

comment on column public.driver_job_dsp_actual_time_events.safe_event_context is
  'Safe operational timing context only. Do not store prices, rates, payouts, PayNow payout details, payment details, invoice data, PDF links, notification payloads, auth links, parser/debug internals, proof/photo data, live-location data, or internal finance notes.';

alter table public.driver_job_dsp_actual_time_events
  add column if not exists booking_reference text,
  add column if not exists driver_job_link_id uuid references public.driver_job_links(id) on delete set null,
  add column if not exists event_type text,
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists safe_event_note text,
  add column if not exists safe_event_context jsonb not null default '{}'::jsonb,
  add column if not exists source_surface text not null default 'driver_job_api',
  add column if not exists actor_role text not null default 'driver',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists driver_job_dsp_actual_time_events_booking_reference_idx
  on public.driver_job_dsp_actual_time_events (booking_reference);

create index if not exists driver_job_dsp_actual_time_events_driver_job_link_id_idx
  on public.driver_job_dsp_actual_time_events (driver_job_link_id);

create index if not exists driver_job_dsp_actual_time_events_event_type_idx
  on public.driver_job_dsp_actual_time_events (event_type);

create index if not exists driver_job_dsp_actual_time_events_occurred_at_idx
  on public.driver_job_dsp_actual_time_events (occurred_at);

create unique index if not exists driver_job_dsp_actual_time_events_one_start_per_link
  on public.driver_job_dsp_actual_time_events (driver_job_link_id)
  where event_type = 'dsp_start' and driver_job_link_id is not null;

create unique index if not exists driver_job_dsp_actual_time_events_one_end_per_link
  on public.driver_job_dsp_actual_time_events (driver_job_link_id)
  where event_type = 'dsp_end' and driver_job_link_id is not null;

create or replace view public.driver_job_dsp_actual_time_summaries as
select
  booking_reference,
  driver_job_link_id,
  min(occurred_at) filter (where event_type = 'dsp_start') as dsp_started_at,
  max(occurred_at) filter (where event_type = 'dsp_end') as dsp_ended_at,
  case
    when
      min(occurred_at) filter (where event_type = 'dsp_start') is not null
      and max(occurred_at) filter (where event_type = 'dsp_end') is not null
      and max(occurred_at) filter (where event_type = 'dsp_end')
        >= min(occurred_at) filter (where event_type = 'dsp_start')
    then floor(
      extract(epoch from (
        max(occurred_at) filter (where event_type = 'dsp_end')
        - min(occurred_at) filter (where event_type = 'dsp_start')
      )) / 60
    )::integer
    else null
  end as total_minutes,
  case
    when
      min(occurred_at) filter (where event_type = 'dsp_start') is not null
      and max(occurred_at) filter (where event_type = 'dsp_end') is not null
      and max(occurred_at) filter (where event_type = 'dsp_end')
        >= min(occurred_at) filter (where event_type = 'dsp_start')
    then 'complete'
    when min(occurred_at) filter (where event_type = 'dsp_start') is not null
    then 'started'
    else 'not_started'
  end as actual_time_status
from public.driver_job_dsp_actual_time_events
group by booking_reference, driver_job_link_id;

comment on view public.driver_job_dsp_actual_time_summaries is
  'Server-only computed DSP actual timing summary for future admin review. This view calculates total_minutes from saved timing evidence and does not create customer charges, invoices, payments, payouts, or PDFs.';

alter table public.driver_job_dsp_actual_time_events enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved server API/RLS stage must
-- define the exact token-verified DSP timing write/read path before runtime
-- production driver use is enabled.
