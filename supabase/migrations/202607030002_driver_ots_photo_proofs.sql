-- Driver OTS photo proof runtime foundation.
-- This activates the previously planned driver_ots admin-only proof path.
-- It stores photo bytes in a private Supabase Storage bucket and stores only
-- safe operational metadata in public.driver_ots_photo_proofs.
-- No customer visibility, provider send, billing, payment, payout, parser,
-- mock archive, or internal finance/admin-note data is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ots-photo-proofs',
  'ots-photo-proofs',
  false,
  8388608,
  array[
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  allowed_mime_types = excluded.allowed_mime_types,
  file_size_limit = excluded.file_size_limit,
  public = false;

create table if not exists public.driver_ots_photo_proofs (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null,
  driver_job_link_id uuid references public.driver_job_links(id) on delete cascade,
  ots_status_event_id uuid references public.driver_job_status_events(id) on delete set null,
  photo_type text not null default 'ots',
  proof_status text not null default 'uploaded',
  storage_bucket text not null default 'ots-photo-proofs',
  storage_path text not null,
  content_type text not null,
  file_size_bytes integer not null,
  uploaded_at timestamptz not null default now(),
  source_surface text not null default 'driver_job_api',
  actor_role text not null default 'driver',
  safe_upload_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint driver_ots_photo_proofs_reference_not_blank check (length(btrim(booking_reference)) > 0),
  constraint driver_ots_photo_proofs_photo_type_check check (photo_type = 'ots'),
  constraint driver_ots_photo_proofs_status_check check (proof_status in ('uploaded', 'deleted')),
  constraint driver_ots_photo_proofs_bucket_check check (storage_bucket = 'ots-photo-proofs'),
  constraint driver_ots_photo_proofs_path_not_blank check (length(btrim(storage_path)) > 0),
  constraint driver_ots_photo_proofs_content_type_check check (
    content_type in (
      'image/heic',
      'image/heif',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  ),
  constraint driver_ots_photo_proofs_file_size_check check (
    file_size_bytes > 0 and file_size_bytes <= 8388608
  ),
  constraint driver_ots_photo_proofs_source_surface_check check (
    source_surface in ('driver_job_api', 'admin_api', 'migration', 'system')
  ),
  constraint driver_ots_photo_proofs_actor_role_check check (
    actor_role in ('driver', 'admin', 'dispatcher', 'system')
  ),
  constraint driver_ots_photo_proofs_safe_context_object check (
    jsonb_typeof(safe_upload_context) = 'object'
  )
);

comment on table public.driver_ots_photo_proofs is
  'Admin-only OTS photo proof metadata for verified driver job links. Raw images live in private Supabase Storage; customer and public routes must not read this table.';

comment on column public.driver_ots_photo_proofs.storage_path is
  'Private Supabase Storage object path. Return only through short-lived admin-gated read URLs, never to customer or public driver responses.';

comment on column public.driver_ots_photo_proofs.safe_upload_context is
  'Safe operational upload context only. Do not store prices, payouts, payment details, provider payloads, auth links, parser/debug internals, customer-visible proof data, live-location data, or internal finance/admin notes.';

alter table public.driver_ots_photo_proofs
  add column if not exists booking_reference text,
  add column if not exists driver_job_link_id uuid,
  add column if not exists ots_status_event_id uuid,
  add column if not exists photo_type text not null default 'ots',
  add column if not exists proof_status text not null default 'uploaded',
  add column if not exists storage_bucket text not null default 'ots-photo-proofs',
  add column if not exists storage_path text,
  add column if not exists content_type text,
  add column if not exists file_size_bytes integer,
  add column if not exists uploaded_at timestamptz not null default now(),
  add column if not exists source_surface text not null default 'driver_job_api',
  add column if not exists actor_role text not null default 'driver',
  add column if not exists safe_upload_context jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists driver_ots_photo_proofs_booking_reference_idx
  on public.driver_ots_photo_proofs (booking_reference);

create index if not exists driver_ots_photo_proofs_driver_job_link_id_idx
  on public.driver_ots_photo_proofs (driver_job_link_id);

create index if not exists driver_ots_photo_proofs_uploaded_at_idx
  on public.driver_ots_photo_proofs (uploaded_at desc);

create unique index if not exists driver_ots_photo_proofs_storage_path_key
  on public.driver_ots_photo_proofs (storage_bucket, storage_path);

alter table public.driver_ots_photo_proofs enable row level security;

grant select, insert, update, delete on public.driver_ots_photo_proofs to service_role;

-- RLS is intentionally enabled without anon, authenticated, customer, or
-- driver policies. Server-only routes verify the driver token for uploads and
-- the admin/dispatcher boundary for reads using the service role.
