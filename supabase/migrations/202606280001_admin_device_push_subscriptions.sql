-- Admin browser/device push subscriptions.
-- Apply only after explicit production approval for the admin device push lane.

create extension if not exists pgcrypto;

create table if not exists public.admin_device_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  subscription_status text not null default 'active',
  source_surface text not null default 'admin_dashboard',
  actor_label text,
  failure_count integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_device_push_subscriptions_status_check
    check (subscription_status in ('active', 'revoked')),
  constraint admin_device_push_subscriptions_endpoint_not_blank
    check (length(btrim(endpoint)) > 0),
  constraint admin_device_push_subscriptions_p256dh_not_blank
    check (length(btrim(p256dh)) > 0),
  constraint admin_device_push_subscriptions_auth_not_blank
    check (length(btrim(auth)) > 0)
);

alter table public.admin_device_push_subscriptions enable row level security;

revoke all on public.admin_device_push_subscriptions from anon;
revoke all on public.admin_device_push_subscriptions from authenticated;
grant select, insert, update, delete on public.admin_device_push_subscriptions to service_role;

comment on table public.admin_device_push_subscriptions is
  'Admin-only browser push subscriptions for internal booking alerts. No public policies.';
