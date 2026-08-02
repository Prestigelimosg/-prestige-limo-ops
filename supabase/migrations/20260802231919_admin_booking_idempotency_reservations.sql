-- Stage 2: server-only idempotency reservations for confirmed ChatGPT booking previews.
-- This table never stores raw idempotency values, confirmation tokens, source messages,
-- provider data, parser internals, customer IDs, driver data, finance data, or secrets.

create table if not exists public.admin_booking_idempotency_reservations (
  idempotency_key_hash text primary key,
  payload_hash text not null,
  booking_reference text not null unique,
  state text not null default 'pending',
  owner_token_hash text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_booking_idempotency_key_hash_check
    check (idempotency_key_hash ~ '^[a-f0-9]{64}$'),
  constraint admin_booking_idempotency_payload_hash_check
    check (payload_hash ~ '^[a-f0-9]{64}$'),
  constraint admin_booking_idempotency_owner_hash_check
    check (owner_token_hash ~ '^[a-f0-9]{64}$'),
  constraint admin_booking_idempotency_reference_check
    check (booking_reference ~ '^[A-Z0-9][A-Z0-9-]{5,79}$'),
  constraint admin_booking_idempotency_state_check
    check (state in ('pending', 'completed', 'failed'))
);

alter table public.admin_booking_idempotency_reservations enable row level security;

revoke all on table public.admin_booking_idempotency_reservations from anon, authenticated;
grant select, insert, update on table public.admin_booking_idempotency_reservations to service_role;

create index if not exists admin_booking_idempotency_reservations_updated_at_idx
  on public.admin_booking_idempotency_reservations (updated_at);

comment on table public.admin_booking_idempotency_reservations is
  'Server-only hashed idempotency reservations for one confirmed booking create through POST /api/admin-bookings. RLS has no public, customer, driver, anon, or authenticated policy.';

comment on column public.admin_booking_idempotency_reservations.idempotency_key_hash is
  'SHA-256 digest only; the caller-supplied idempotency value is never stored.';

comment on column public.admin_booking_idempotency_reservations.payload_hash is
  'SHA-256 digest of the exact canonical confirmed preview plus bounded preview-only fields.';
