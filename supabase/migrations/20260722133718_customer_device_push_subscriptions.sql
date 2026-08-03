-- Customer Home Screen web-app push subscriptions.
-- Apply only after explicit production approval for the Customer App alert lane.

create extension if not exists pgcrypto;

create table if not exists public.customer_device_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_account_reference text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  subscription_status text not null default 'active',
  source_surface text not null default 'customer_portal',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_device_push_subscriptions_status_check
    check (subscription_status in ('active', 'revoked')),
  constraint customer_device_push_subscriptions_account_not_blank
    check (length(btrim(customer_account_reference)) > 0),
  constraint customer_device_push_subscriptions_endpoint_not_blank
    check (length(btrim(endpoint)) > 0),
  constraint customer_device_push_subscriptions_p256dh_not_blank
    check (length(btrim(p256dh)) > 0),
  constraint customer_device_push_subscriptions_auth_not_blank
    check (length(btrim(auth)) > 0)
);

create index if not exists customer_device_push_subscriptions_active_account_idx
  on public.customer_device_push_subscriptions (customer_account_reference, subscription_status);

alter table public.customer_device_push_subscriptions enable row level security;

revoke all on public.customer_device_push_subscriptions from anon;
revoke all on public.customer_device_push_subscriptions from authenticated;
grant select, insert, update, delete on public.customer_device_push_subscriptions to service_role;

comment on table public.customer_device_push_subscriptions is
  'Server-only customer Home Screen web-app push subscriptions. No public policies.';
