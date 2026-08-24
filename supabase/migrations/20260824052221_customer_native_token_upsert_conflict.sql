-- The established Customer native writer uses
-- ON CONFLICT (native_expo_token). PostgreSQL cannot infer that conflict
-- target from the earlier partial unique index. A normal unique index still
-- allows every legacy web-push row to keep a null native token while making
-- the exact non-null Expo token conflict target inferable.
drop index if exists public.customer_device_push_subscriptions_native_token_key;

create unique index customer_device_push_subscriptions_native_token_key
  on public.customer_device_push_subscriptions (native_expo_token);
