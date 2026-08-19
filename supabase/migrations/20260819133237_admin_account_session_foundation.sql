-- Closed Admin account authorization mapping for the existing Ops surface.
-- Source-only until the owner separately approves the exact Production
-- migration and one exact Supabase Auth/Admin account activation.
-- No public signup, browser-direct table access, native app, provider send,
-- booking, customer, driver, Calendar, invoice, payment, payout, PayNow, GPS,
-- or external-message behavior is added here.

set search_path = public, extensions;

create table if not exists public.admin_access_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  auth_email text not null,
  account_role text not null,
  account_status text not null default 'active',
  safe_display_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_access_accounts_role_check check (
    account_role in ('admin', 'dispatcher')
  ),
  constraint admin_access_accounts_status_check check (
    account_status in ('active', 'suspended', 'revoked')
  ),
  constraint admin_access_accounts_safe_label_check check (
    length(btrim(safe_display_label)) between 1 and 160
  ),
  constraint admin_access_accounts_auth_email_check check (
    auth_email = lower(btrim(auth_email)) and
    length(auth_email) between 3 and 254 and
    auth_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

create unique index if not exists admin_access_accounts_auth_user_id_key
  on public.admin_access_accounts (auth_user_id);

create unique index if not exists admin_access_accounts_auth_email_key
  on public.admin_access_accounts (auth_email);

create index if not exists admin_access_accounts_status_idx
  on public.admin_access_accounts (account_status, account_role);

comment on table public.admin_access_accounts is
  'Server-only mapping from one verified Supabase Auth user to an active Admin or Dispatcher role. It stores no password, token, cookie, session, customer, driver, booking, invoice, payment, payout, PayNow, GPS, parser/debug, or internal-note content.';

alter table public.admin_access_accounts enable row level security;

revoke all on table public.admin_access_accounts from anon, authenticated;
grant select on table public.admin_access_accounts to service_role;
