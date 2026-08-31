-- Scope established monthly billing preparation by verified Company + Booker.
-- Existing legacy rows are preserved with nullable identity and are never guessed/backfilled.
-- Application guards keep null or partial identity blocked from new preparation writes.

begin;

alter table public.monthly_billing_draft_plans
  add column if not exists company_id bigint references public.companies(id) on delete restrict,
  add column if not exists booker_id bigint references public.bookers(id) on delete restrict;

alter table public.monthly_invoice_drafts
  add column if not exists company_id bigint references public.companies(id) on delete restrict,
  add column if not exists booker_id bigint references public.bookers(id) on delete restrict;

comment on column public.monthly_billing_draft_plans.company_id is
  'Verified Company identity for the exact monthly billing account. Null preserves legacy rows for blocked review only.';
comment on column public.monthly_billing_draft_plans.booker_id is
  'Verified Booker identity for the exact monthly billing account. Null preserves legacy rows for blocked review only.';
comment on column public.monthly_invoice_drafts.company_id is
  'Verified Company identity for the exact monthly invoice draft account. Null preserves legacy rows for blocked review only.';
comment on column public.monthly_invoice_drafts.booker_id is
  'Verified Booker identity for the exact monthly invoice draft account. Null preserves legacy rows for blocked review only.';

drop index if exists public.monthly_billing_draft_plans_account_month_key;
drop index if exists public.monthly_invoice_drafts_account_month_key;

create unique index if not exists monthly_billing_draft_plans_verified_identity_month_key
  on public.monthly_billing_draft_plans (customer_id, company_id, booker_id, billing_month);

create unique index if not exists monthly_invoice_drafts_verified_identity_month_key
  on public.monthly_invoice_drafts (customer_id, company_id, booker_id, billing_month);

create index if not exists monthly_billing_draft_plans_identity_lookup_idx
  on public.monthly_billing_draft_plans (billing_month, customer_id, company_id, booker_id);

create index if not exists monthly_invoice_drafts_identity_lookup_idx
  on public.monthly_invoice_drafts (billing_month, customer_id, company_id, booker_id);

commit;
