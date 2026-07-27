-- Private semantic email AI intake for one exact mailbox and sender.
-- This migration creates server-only review storage and a dormant-by-default
-- Supabase Cron call. It does not add a public/customer/driver policy, send an
-- external reply, create a booking, or modify any existing operational lane.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

set search_path = public, extensions;

create table if not exists public.admin_email_ai_mailbox_state (
  mailbox_address text primary key,
  uid_validity bigint not null,
  last_seen_uid bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_email_ai_mailbox_state_exact_mailbox_check check (
    mailbox_address = 'booking@prestigelimo.sg'
  ),
  constraint admin_email_ai_mailbox_state_uid_validity_check check (
    uid_validity > 0
  ),
  constraint admin_email_ai_mailbox_state_last_seen_uid_check check (
    last_seen_uid >= 0
  )
);

comment on table public.admin_email_ai_mailbox_state is
  'Server-only IMAP UID cursor for booking@prestigelimo.sg. The first run starts at the current UID so historic email is not scanned or charged.';

create table if not exists public.admin_email_ai_intake (
  id uuid primary key default gen_random_uuid(),
  mailbox_address text not null,
  recipient_address text not null,
  sender_address text not null,
  uid_validity bigint not null,
  imap_uid bigint not null,
  message_id_hash text not null,
  subject text not null default '',
  normalized_text text not null,
  classification text not null default 'uncertain',
  confidence numeric(5, 4) not null default 0,
  summary text not null,
  suggested_reply text not null default '',
  booking_parse_result jsonb not null default
    '{"multipleBookingsDetected":false,"bookings":[],"rawWarnings":[]}'::jsonb,
  canonical_booking_text text not null default '',
  review_reasons jsonb not null default '[]'::jsonb,
  processing_status text not null default 'processing',
  model text,
  openai_input_tokens integer not null default 0,
  openai_output_tokens integer not null default 0,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_email_ai_intake_exact_mailbox_check check (
    mailbox_address = 'booking@prestigelimo.sg'
  ),
  constraint admin_email_ai_intake_exact_recipient_check check (
    recipient_address = 'booking@prestigelimo.sg'
  ),
  constraint admin_email_ai_intake_exact_sender_check check (
    sender_address = 'info@prestigelimo.sg'
  ),
  constraint admin_email_ai_intake_uid_validity_check check (
    uid_validity > 0
  ),
  constraint admin_email_ai_intake_imap_uid_check check (
    imap_uid > 0
  ),
  constraint admin_email_ai_intake_message_hash_check check (
    message_id_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint admin_email_ai_intake_subject_length_check check (
    length(subject) <= 240
  ),
  constraint admin_email_ai_intake_normalized_text_length_check check (
    length(normalized_text) between 1 and 12000
  ),
  constraint admin_email_ai_intake_classification_check check (
    classification in (
      'confirmed_booking',
      'enquiry',
      'amendment',
      'cancellation',
      'unrelated',
      'uncertain'
    )
  ),
  constraint admin_email_ai_intake_confidence_check check (
    confidence between 0 and 1
  ),
  constraint admin_email_ai_intake_summary_length_check check (
    length(btrim(summary)) between 1 and 1000
  ),
  constraint admin_email_ai_intake_suggested_reply_length_check check (
    length(suggested_reply) <= 4000
  ),
  constraint admin_email_ai_intake_booking_result_object_check check (
    jsonb_typeof(booking_parse_result) = 'object'
  ),
  constraint admin_email_ai_intake_canonical_text_length_check check (
    length(canonical_booking_text) <= 12000
  ),
  constraint admin_email_ai_intake_review_reasons_array_check check (
    jsonb_typeof(review_reasons) = 'array'
  ),
  constraint admin_email_ai_intake_processing_status_check check (
    processing_status in (
      'processing',
      'queued',
      'failed',
      'reviewed',
      'dismissed'
    )
  ),
  constraint admin_email_ai_intake_model_length_check check (
    model is null or length(model) <= 80
  ),
  constraint admin_email_ai_intake_input_tokens_check check (
    openai_input_tokens >= 0
  ),
  constraint admin_email_ai_intake_output_tokens_check check (
    openai_output_tokens >= 0
  ),
  constraint admin_email_ai_intake_mailbox_uid_unique unique (
    mailbox_address,
    uid_validity,
    imap_uid
  ),
  constraint admin_email_ai_intake_message_hash_unique unique (
    message_id_hash
  )
);

comment on table public.admin_email_ai_intake is
  'Private service-role-only semantic review of new email received by booking@prestigelimo.sg from exact sender info@prestigelimo.sg.';

comment on column public.admin_email_ai_intake.normalized_text is
  'Bounded plain text from the exact allowed email pair. Never copy this field into generic notifications, customer surfaces, driver surfaces, logs, or external replies.';

comment on column public.admin_email_ai_intake.suggested_reply is
  'Internal draft only. No external send is implemented by this intake.';

create index if not exists admin_email_ai_intake_review_queue_idx
  on public.admin_email_ai_intake (processing_status, created_at desc);

alter table public.admin_email_ai_mailbox_state enable row level security;
alter table public.admin_email_ai_intake enable row level security;

revoke all on table public.admin_email_ai_mailbox_state
  from public, anon, authenticated;
revoke all on table public.admin_email_ai_intake
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.admin_email_ai_mailbox_state
  to service_role;
grant select, insert, update, delete
  on table public.admin_email_ai_intake
  to service_role;

-- The scheduled query performs no request until both exact Vault secrets exist.
-- Activation must store the exact Production endpoint and a separate bounded
-- bearer secret in Vault; neither value is committed in migration history.
select cron.schedule(
  'private-email-ai-intake',
  '* * * * *',
  $cron$
    select net.http_get(
      url := intake_config.endpoint_url,
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || intake_config.bearer_secret,
        'User-Agent',
        'Prestige-Limo-Ops-Supabase-Cron'
      ),
      timeout_milliseconds := 30000
    )
    from (
      select
        max(decrypted_secret) filter (
          where name = 'prestige_email_ai_intake_endpoint'
        ) as endpoint_url,
        max(decrypted_secret) filter (
          where name = 'prestige_email_ai_intake_cron_secret'
        ) as bearer_secret
      from vault.decrypted_secrets
      where name in (
        'prestige_email_ai_intake_endpoint',
        'prestige_email_ai_intake_cron_secret'
      )
    ) as intake_config
    where intake_config.endpoint_url =
      'https://app.prestigelimo.sg/api/cron/admin-email-ai-intake'
      and length(intake_config.bearer_secret) >= 32;
  $cron$
);
