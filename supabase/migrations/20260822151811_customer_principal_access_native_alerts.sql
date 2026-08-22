-- Individual PA/Boss customer access, one-use activation, renewable device
-- sessions, and native Customer-app subscription binding. Source only until a
-- separately approved Production migration action.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.customer_access_principals (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null,
  principal_role text not null,
  principal_status text not null default 'invited',
  pin_hash text,
  email_verified_at timestamptz,
  pin_updated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_access_principals_email_key unique (normalized_email),
  constraint customer_access_principals_email_normalized_check check (
    normalized_email = lower(btrim(normalized_email))
    and normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint customer_access_principals_role_check
    check (principal_role in ('pa', 'boss')),
  constraint customer_access_principals_status_check
    check (principal_status in ('invited', 'active', 'suspended', 'revoked')),
  constraint customer_access_principals_active_pin_check check (
    principal_status <> 'active'
    or (pin_hash is not null and email_verified_at is not null)
  )
);

create table if not exists public.customer_access_memberships (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.customer_access_principals(id) on delete cascade,
  customer_account_reference text not null,
  company_id bigint not null references public.companies(id) on delete restrict,
  booker_id bigint not null references public.bookers(id) on delete restrict,
  traveler_id bigint not null references public.travelers(id) on delete restrict,
  membership_role text not null,
  membership_status text not null default 'active',
  verified_boss_name text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_access_memberships_role_check
    check (membership_role in ('managing_pa', 'boss')),
  constraint customer_access_memberships_status_check
    check (membership_status in ('active', 'revoked')),
  constraint customer_access_memberships_reference_check
    check (length(btrim(customer_account_reference)) between 1 and 120),
  constraint customer_access_memberships_boss_name_check
    check (length(btrim(verified_boss_name)) between 1 and 160),
  constraint customer_access_memberships_scope_key
    unique (principal_id, company_id, booker_id, traveler_id)
);

create index if not exists customer_access_memberships_booking_scope_idx
  on public.customer_access_memberships
  (company_id, booker_id, traveler_id, membership_status);

create table if not exists public.customer_access_invitations (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.customer_access_principals(id) on delete cascade,
  invitation_token_hash text not null unique,
  membership_scope jsonb not null,
  issued_by_admin_user_id uuid,
  issued_by_admin_actor_label text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint customer_access_invitations_token_hash_check
    check (invitation_token_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_access_invitations_membership_scope_check
    check (jsonb_typeof(membership_scope) = 'array' and jsonb_array_length(membership_scope) between 1 and 100),
  constraint customer_access_invitations_actor_label_check
    check (length(btrim(issued_by_admin_actor_label)) between 1 and 160),
  constraint customer_access_invitations_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '30 minutes')
);

create table if not exists public.customer_access_email_challenges (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.customer_access_principals(id) on delete cascade,
  device_id uuid,
  challenge_hash text not null unique,
  challenge_purpose text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint customer_access_email_challenges_hash_check
    check (challenge_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_access_email_challenges_purpose_check
    check (challenge_purpose in ('activation', 'new_device', 'forgot_pin')),
  constraint customer_access_email_challenges_attempt_check
    check (attempt_count between 0 and 5)
);

create table if not exists public.customer_access_devices (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.customer_access_principals(id) on delete cascade,
  installation_id_hash text not null unique,
  device_status text not null default 'active',
  platform text not null default 'ios',
  face_id_enrolled boolean not null default false,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_access_devices_installation_hash_check
    check (installation_id_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_access_devices_status_check
    check (device_status in ('active', 'revoked')),
  constraint customer_access_devices_platform_check
    check (platform = 'ios'),
  constraint customer_access_devices_id_principal_key
    unique (id, principal_id)
);

alter table public.customer_access_email_challenges
  drop constraint if exists customer_access_email_challenges_device_id_fkey;

alter table public.customer_access_email_challenges
  add constraint customer_access_email_challenges_device_id_fkey
  foreign key (device_id) references public.customer_access_devices(id) on delete cascade;

create table if not exists public.customer_access_device_sessions (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.customer_access_principals(id) on delete cascade,
  device_id uuid not null references public.customer_access_devices(id) on delete cascade,
  session_token_hash text not null unique,
  session_status text not null default 'active',
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_access_device_sessions_token_hash_check
    check (session_token_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_access_device_sessions_status_check
    check (session_status in ('active', 'revoked')),
  constraint customer_access_device_sessions_expiry_check
    check (expires_at > created_at)
);

create index if not exists customer_access_device_sessions_active_idx
  on public.customer_access_device_sessions
  (principal_id, device_id, session_status, expires_at);

create table if not exists public.customer_access_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references public.customer_access_principals(id) on delete cascade,
  device_id uuid references public.customer_access_devices(id) on delete cascade,
  installation_id_hash text not null,
  ip_hash text not null,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint customer_access_pin_attempts_ip_hash_check
    check (ip_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_access_pin_attempts_installation_hash_check
    check (installation_id_hash ~ '^[0-9a-f]{64}$'),
  constraint customer_access_pin_attempts_count_check
    check (failure_count between 0 and 100),
  constraint customer_access_pin_attempts_scope_key
    unique (principal_id, installation_id_hash, ip_hash)
);

-- Per-account cutover retires the permanent link only after an individual
-- principal activates successfully. Existing browser/PWA access remains valid
-- for accounts that have not cut over.
alter table if exists public.customer_access_accounts
  add column if not exists principal_cutover_at timestamptz,
  add column if not exists legacy_link_revoked_at timestamptz;

-- Private audit attribution stays in the established Customer/Driver outbox;
-- safe reads must continue omitting these columns from customer and driver JSON.
alter table if exists public.customer_driver_app_notification_outbox
  add column if not exists actual_sender_principal_id uuid
    references public.customer_access_principals(id) on delete set null,
  add column if not exists actual_sender_role text,
  add column if not exists customer_display_sender_name text,
  add column if not exists client_message_id uuid;

alter table if exists public.customer_driver_app_notification_outbox
  drop constraint if exists customer_driver_app_notification_outbox_actual_sender_role_check;

alter table if exists public.customer_driver_app_notification_outbox
  add constraint customer_driver_app_notification_outbox_actual_sender_role_check
  check (
    (actual_sender_principal_id is null and actual_sender_role is null)
    or
    (actual_sender_principal_id is not null and actual_sender_role in ('pa', 'boss'))
  );

create or replace function public.preserve_customer_message_sender_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.actual_sender_principal_id is distinct from new.actual_sender_principal_id
    or old.actual_sender_role is distinct from new.actual_sender_role
    or old.client_message_id is distinct from new.client_message_id then
    raise exception 'Customer message sender audit is immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_customer_message_sender_audit
  on public.customer_driver_app_notification_outbox;
create trigger preserve_customer_message_sender_audit
before update on public.customer_driver_app_notification_outbox
for each row execute function public.preserve_customer_message_sender_audit();

create unique index if not exists customer_driver_app_notification_outbox_client_message_key
  on public.customer_driver_app_notification_outbox
  (booking_reference, delivery_surface, actual_sender_principal_id, client_message_id)
  where client_message_id is not null;

-- Extend the existing Customer subscription lane in place. Legacy web/PWA rows
-- keep their endpoint/key fields; native iOS rows bind one Expo token to one
-- exact active principal device.
alter table if exists public.customer_device_push_subscriptions
  alter column endpoint drop not null,
  alter column p256dh drop not null,
  alter column auth drop not null,
  add column if not exists delivery_channel text not null default 'web_push',
  add column if not exists native_expo_token text,
  add column if not exists principal_id uuid
    references public.customer_access_principals(id) on delete cascade,
  add column if not exists device_id uuid
    references public.customer_access_devices(id) on delete cascade;

alter table if exists public.customer_device_push_subscriptions
  drop constraint if exists customer_device_push_subscriptions_endpoint_not_blank,
  drop constraint if exists customer_device_push_subscriptions_p256dh_not_blank,
  drop constraint if exists customer_device_push_subscriptions_auth_not_blank,
  drop constraint if exists customer_device_push_subscriptions_channel_check,
  drop constraint if exists customer_device_push_subscriptions_payload_check,
  drop constraint if exists customer_device_push_subscriptions_device_principal_fkey;

alter table if exists public.customer_device_push_subscriptions
  add constraint customer_device_push_subscriptions_channel_check
    check (delivery_channel in ('web_push', 'native_expo')),
  add constraint customer_device_push_subscriptions_payload_check check (
    (
      delivery_channel = 'web_push'
      and endpoint is not null and length(btrim(endpoint)) > 0
      and p256dh is not null and length(btrim(p256dh)) > 0
      and auth is not null and length(btrim(auth)) > 0
      and native_expo_token is null
    )
    or
    (
      delivery_channel = 'native_expo'
      and native_expo_token is not null and length(btrim(native_expo_token)) > 0
      and principal_id is not null and device_id is not null
      and endpoint is null and p256dh is null and auth is null
    )
  ),
  add constraint customer_device_push_subscriptions_device_principal_fkey
    foreign key (device_id, principal_id)
    references public.customer_access_devices(id, principal_id)
    on delete cascade;

create unique index if not exists customer_device_push_subscriptions_native_token_key
  on public.customer_device_push_subscriptions (native_expo_token)
  where native_expo_token is not null;

create index if not exists customer_device_push_subscriptions_native_audience_idx
  on public.customer_device_push_subscriptions
  (principal_id, device_id, subscription_status)
  where delivery_channel = 'native_expo';

-- All new auth and device tables are service-role only. No browser, anonymous,
-- or broad authenticated policy exists.
alter table public.customer_access_principals enable row level security;
alter table public.customer_access_memberships enable row level security;
alter table public.customer_access_invitations enable row level security;
alter table public.customer_access_email_challenges enable row level security;
alter table public.customer_access_devices enable row level security;
alter table public.customer_access_device_sessions enable row level security;
alter table public.customer_access_pin_attempts enable row level security;

revoke all on public.customer_access_principals from anon;
revoke all on public.customer_access_principals from authenticated;
grant select, insert, update, delete on public.customer_access_principals to service_role;

revoke all on public.customer_access_memberships from anon;
revoke all on public.customer_access_memberships from authenticated;
grant select, insert, update, delete on public.customer_access_memberships to service_role;

revoke all on public.customer_access_invitations from anon;
revoke all on public.customer_access_invitations from authenticated;
grant select, insert, update, delete on public.customer_access_invitations to service_role;

revoke all on public.customer_access_email_challenges from anon;
revoke all on public.customer_access_email_challenges from authenticated;
grant select, insert, update, delete on public.customer_access_email_challenges to service_role;

revoke all on public.customer_access_devices from anon;
revoke all on public.customer_access_devices from authenticated;
grant select, insert, update, delete on public.customer_access_devices to service_role;

revoke all on public.customer_access_device_sessions from anon;
revoke all on public.customer_access_device_sessions from authenticated;
grant select, insert, update, delete on public.customer_access_device_sessions to service_role;

revoke all on public.customer_access_pin_attempts from anon;
revoke all on public.customer_access_pin_attempts from authenticated;
grant select, insert, update, delete on public.customer_access_pin_attempts to service_role;

comment on table public.customer_access_principals is
  'Server-only individual PA/Boss identities. PINs are stored only as scrypt hashes by the application.';
comment on table public.customer_access_memberships is
  'Verified exact Boss booking scopes. A PA receives one row per managed Boss.';
comment on table public.customer_access_invitations is
  'Short-lived one-use invitation hashes issued only by verified Owner Admin.';
comment on table public.customer_access_device_sessions is
  'Long-lived renewable exact-device sessions; every read rechecks live principal, membership and device status.';
