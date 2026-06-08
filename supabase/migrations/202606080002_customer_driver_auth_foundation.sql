-- Customer/driver auth foundation.
-- Created for review only in this stage; do not apply without explicit approval.
-- This migration prepares closed customer and driver access-account records for
-- a later approved Supabase Auth/RLS activation stage.
-- No customer login, driver login, broad authenticated policy, invoice, PDF,
-- payment, payout, notification sending, live-location, proof/photo,
-- parser-learning, or finance behavior is activated here.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.customer_access_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  customer_account_reference text not null,
  account_status text not null default 'pending_setup',
  auth_provider text not null default 'supabase_auth',
  safe_display_label text not null,
  source_surface text not null default 'admin_api',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_access_accounts_reference_not_blank check (
    length(btrim(customer_account_reference)) > 0
    and length(customer_account_reference) <= 120
  ),
  constraint customer_access_accounts_safe_label_not_blank check (
    length(btrim(safe_display_label)) > 0
    and length(safe_display_label) <= 160
  ),
  constraint customer_access_accounts_status_check check (
    account_status in ('pending_setup', 'active', 'suspended', 'revoked')
  ),
  constraint customer_access_accounts_provider_check check (
    auth_provider in ('supabase_auth')
  ),
  constraint customer_access_accounts_source_surface_check check (
    source_surface in ('admin_api', 'migration', 'system')
  )
);

comment on table public.customer_access_accounts is
  'Closed customer access-account foundation for later approved Supabase Auth/RLS activation. RLS is enabled; no public, customer, driver, anonymous, or broad authenticated policies are created here.';

comment on column public.customer_access_accounts.auth_user_id is
  'Supabase Auth user id mapping for a later approved activation stage. This is not a raw token, password, magic link, refresh token, JWT, session token, or secret.';

comment on column public.customer_access_accounts.customer_account_reference is
  'Safe customer/account reference used without coupling to historical customers.id type differences.';

comment on column public.customer_access_accounts.safe_display_label is
  'Safe display label for customer access review only. Do not store prices, payouts, payment details, invoice data, PDF links, notification payloads, parser/debug internals, proof/photo data, internal notes, or finance notes.';

create unique index if not exists customer_access_accounts_auth_user_id_key
  on public.customer_access_accounts (auth_user_id);

create unique index if not exists customer_access_accounts_reference_key
  on public.customer_access_accounts (customer_account_reference);

create index if not exists customer_access_accounts_status_idx
  on public.customer_access_accounts (account_status);

create index if not exists customer_access_accounts_updated_at_idx
  on public.customer_access_accounts (updated_at);

create table if not exists public.driver_access_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  driver_reference text not null,
  account_status text not null default 'pending_setup',
  auth_provider text not null default 'supabase_auth',
  safe_display_label text not null,
  source_surface text not null default 'admin_api',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_access_accounts_reference_not_blank check (
    length(btrim(driver_reference)) > 0
    and length(driver_reference) <= 120
  ),
  constraint driver_access_accounts_safe_label_not_blank check (
    length(btrim(safe_display_label)) > 0
    and length(safe_display_label) <= 160
  ),
  constraint driver_access_accounts_status_check check (
    account_status in ('pending_setup', 'active', 'suspended', 'revoked')
  ),
  constraint driver_access_accounts_provider_check check (
    auth_provider in ('supabase_auth')
  ),
  constraint driver_access_accounts_source_surface_check check (
    source_surface in ('admin_api', 'migration', 'system')
  )
);

comment on table public.driver_access_accounts is
  'Closed driver access-account foundation for later approved Supabase Auth/RLS activation. RLS is enabled; no public, customer, driver, anonymous, or broad authenticated policies are created here.';

comment on column public.driver_access_accounts.auth_user_id is
  'Supabase Auth user id mapping for a later approved activation stage. This is not a raw token, password, magic link, refresh token, JWT, session token, or secret.';

comment on column public.driver_access_accounts.driver_reference is
  'Safe driver reference used without coupling to historical drivers.id type differences.';

comment on column public.driver_access_accounts.safe_display_label is
  'Safe display label for driver access review only. Do not store customer prices, billing, invoice/payment details, payouts, PayNow payout details, parser/debug internals, proof/photo data, internal notes, or finance notes.';

create unique index if not exists driver_access_accounts_auth_user_id_key
  on public.driver_access_accounts (auth_user_id);

create unique index if not exists driver_access_accounts_reference_key
  on public.driver_access_accounts (driver_reference);

create index if not exists driver_access_accounts_status_idx
  on public.driver_access_accounts (account_status);

create index if not exists driver_access_accounts_updated_at_idx
  on public.driver_access_accounts (updated_at);

create table if not exists public.customer_driver_access_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_surface text not null,
  account_reference text not null,
  auth_user_id uuid,
  event_type text not null,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  safe_event_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint customer_driver_access_audit_surface_check check (
    account_surface in ('customer', 'driver')
  ),
  constraint customer_driver_access_audit_reference_not_blank check (
    length(btrim(account_reference)) > 0
    and length(account_reference) <= 120
  ),
  constraint customer_driver_access_audit_event_type_check check (
    event_type in (
      'account_provisioned',
      'account_reviewed',
      'account_activated',
      'account_suspended',
      'account_revoked',
      'session_started',
      'session_blocked',
      'session_ended'
    )
  ),
  constraint customer_driver_access_audit_source_surface_check check (
    source_surface in ('admin_api', 'customer_api', 'driver_api', 'migration', 'system')
  ),
  constraint customer_driver_access_audit_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'customer', 'driver', 'system')
  ),
  constraint customer_driver_access_audit_context_object check (
    jsonb_typeof(safe_event_context) = 'object'
  )
);

comment on table public.customer_driver_access_audit_events is
  'Safe customer/driver access audit foundation only. This does not store raw tokens, JWTs, passwords, magic links, refresh tokens, session secrets, finance data, payout data, or notification delivery payloads.';

comment on column public.customer_driver_access_audit_events.safe_event_context is
  'Safe access context only. Do not store raw tokens, claims, cookies, passwords, contact payloads, prices, payouts, invoice/payment data, notification payloads, parser/debug internals, or internal finance notes.';

create index if not exists customer_driver_access_audit_surface_reference_idx
  on public.customer_driver_access_audit_events (account_surface, account_reference);

create index if not exists customer_driver_access_audit_auth_user_id_idx
  on public.customer_driver_access_audit_events (auth_user_id)
  where auth_user_id is not null;

create index if not exists customer_driver_access_audit_event_type_idx
  on public.customer_driver_access_audit_events (event_type);

create index if not exists customer_driver_access_audit_created_at_idx
  on public.customer_driver_access_audit_events (created_at);

alter table public.customer_access_accounts enable row level security;
alter table public.driver_access_accounts enable row level security;
alter table public.customer_driver_access_audit_events enable row level security;

-- RLS is intentionally enabled without public, anonymous, broad authenticated,
-- customer, or driver policies. A later approved auth/RLS stage must define
-- exact Supabase Auth claims, exact customer/driver row policies, and safe
-- server API access before any customer or driver auth runtime is activated.
