-- Driver device push subscriptions for acknowledged private Driver Job links.
-- Apply only after explicit Production approval for the driver device-alert lane.

create extension if not exists pgcrypto;

create table if not exists public.driver_device_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  driver_id bigint not null references public.drivers(id) on delete cascade,
  last_driver_job_link_id uuid references public.driver_job_links(id) on delete set null,
  subscription_status text not null default 'active',
  source_surface text not null default 'driver_job_acknowledgement',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_device_push_subscriptions_status_check
    check (subscription_status in ('active', 'revoked')),
  constraint driver_device_push_subscriptions_endpoint_not_blank
    check (length(btrim(endpoint)) > 0),
  constraint driver_device_push_subscriptions_p256dh_not_blank
    check (length(btrim(p256dh)) > 0),
  constraint driver_device_push_subscriptions_auth_not_blank
    check (length(btrim(auth)) > 0)
);

create index if not exists driver_device_push_subscriptions_driver_active_idx
  on public.driver_device_push_subscriptions (driver_id, subscription_status);

alter table public.driver_device_push_subscriptions enable row level security;

revoke all on public.driver_device_push_subscriptions from anon;
revoke all on public.driver_device_push_subscriptions from authenticated;
grant select, insert, update, delete on public.driver_device_push_subscriptions to service_role;

comment on table public.driver_device_push_subscriptions is
  'Server-only device push subscriptions bound to verified drivers after exact private-link acknowledgement.';
