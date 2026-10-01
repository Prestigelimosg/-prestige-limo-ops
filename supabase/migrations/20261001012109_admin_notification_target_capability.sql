-- Existing server-only registration; no new table, grants, identity or subscription.
-- Apply before releasing the updated sender/registration code.
alter table public.admin_device_push_subscriptions
  add column supports_alert_target boolean not null default false;
comment on column public.admin_device_push_subscriptions.supports_alert_target is
  'Exact-alert navigation capability declared by the installed Admin wrapper through its existing authenticated registration. Legacy registrations remain false.';
