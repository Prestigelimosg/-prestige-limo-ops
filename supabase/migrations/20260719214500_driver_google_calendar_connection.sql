-- Server-only Google Calendar connection for the existing Driver Job lane.
-- This migration is source-only until the owner separately approves applying it.

set search_path = public, extensions;

alter table public.driver_job_links
  add column if not exists driver_id bigint references public.drivers(id) on delete set null,
  add column if not exists google_calendar_event_id text,
  add column if not exists google_calendar_revision text,
  add column if not exists google_calendar_saved_at timestamptz;

create index if not exists driver_job_links_driver_id_idx
  on public.driver_job_links (driver_id);

-- Preserve existing private links only when the exact saved booking already has
-- a verified Driver Database foreign key. Names, phone numbers and plates are
-- deliberately excluded from this identity backfill.
update public.driver_job_links as link
set driver_id = booking.driver_id
from public.bookings as booking
where link.driver_id is null
  and booking.booking_reference = link.booking_reference
  and booking.driver_id is not null;

comment on column public.driver_job_links.driver_id is
  'Verified Driver Database identity bound server-side when the private Driver Job link is issued. Never derive from a name, phone number, plate, or token payload.';

comment on column public.driver_job_links.google_calendar_event_id is
  'Deterministic Google event ID for this existing private Driver Job link; contains no OAuth credential.';

create table if not exists public.driver_google_calendar_connections (
  driver_id bigint primary key references public.drivers(id) on delete cascade,
  provider text not null default 'google_calendar',
  encrypted_refresh_token text not null,
  scope text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_google_calendar_connections_provider_check check (
    provider = 'google_calendar'
  ),
  constraint driver_google_calendar_connections_token_not_blank check (
    length(btrim(encrypted_refresh_token)) >= 80
  ),
  constraint driver_google_calendar_connections_scope_check check (
    scope = 'https://www.googleapis.com/auth/calendar.events'
  )
);

comment on table public.driver_google_calendar_connections is
  'Server-only encrypted Google OAuth refresh-token connection keyed only by verified drivers.id. Never expose this table to driver, customer, anonymous, or authenticated browser clients.';

alter table public.driver_google_calendar_connections enable row level security;

revoke all on table public.driver_google_calendar_connections from anon, authenticated;
grant select, insert, update, delete on table public.driver_google_calendar_connections to service_role;
