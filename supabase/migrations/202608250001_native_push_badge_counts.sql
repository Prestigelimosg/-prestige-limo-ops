-- Per-device unseen native alert counts for the three established Apple apps.
-- Apply only after explicit Production approval for this schema checkpoint.

alter table if exists public.admin_device_push_subscriptions
  add column if not exists badge_count integer not null default 0;

alter table if exists public.customer_device_push_subscriptions
  add column if not exists badge_count integer not null default 0;

alter table if exists public.driver_device_push_subscriptions
  add column if not exists badge_count integer not null default 0;

alter table if exists public.admin_device_push_subscriptions
  drop constraint if exists admin_device_push_subscriptions_badge_count_check,
  add constraint admin_device_push_subscriptions_badge_count_check
    check (badge_count between 0 and 99);

alter table if exists public.customer_device_push_subscriptions
  drop constraint if exists customer_device_push_subscriptions_badge_count_check,
  add constraint customer_device_push_subscriptions_badge_count_check
    check (badge_count between 0 and 99);

alter table if exists public.driver_device_push_subscriptions
  drop constraint if exists driver_device_push_subscriptions_badge_count_check,
  add constraint driver_device_push_subscriptions_badge_count_check
    check (badge_count between 0 and 99);

comment on column public.admin_device_push_subscriptions.badge_count is
  'Bounded unseen native alerts for this exact Admin Apple push subscription.';
comment on column public.customer_device_push_subscriptions.badge_count is
  'Bounded unseen native alerts for this exact Customer Apple push subscription.';
comment on column public.driver_device_push_subscriptions.badge_count is
  'Bounded unseen native alerts for this exact Driver Apple push subscription.';
