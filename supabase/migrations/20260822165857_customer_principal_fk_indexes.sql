-- Workload-driven support for the established Customer principal/native alert
-- foreign-key and runtime filters. No auth, RLS, grant, policy, or data change.

create index if not exists customer_access_devices_principal_status_idx
  on public.customer_access_devices (principal_id, device_status);

create index if not exists customer_access_email_challenges_principal_purpose_created_idx
  on public.customer_access_email_challenges
  (principal_id, challenge_purpose, created_at desc);

create index if not exists customer_device_push_subscriptions_device_principal_idx
  on public.customer_device_push_subscriptions (device_id, principal_id);
