-- Allow multiple PA/booker access accounts under one company while preserving
-- the existing controlled customer portal until verified identities are linked.

alter table if exists public.customer_access_accounts
  add column if not exists company_id bigint references public.companies(id) on delete restrict,
  add column if not exists booker_id bigint references public.bookers(id) on delete restrict;

create unique index if not exists customer_access_accounts_booker_id_key
  on public.customer_access_accounts (booker_id)
  where booker_id is not null;

create index if not exists customer_access_accounts_company_id_idx
  on public.customer_access_accounts (company_id)
  where company_id is not null;

comment on column public.customer_access_accounts.company_id is
  'Verified company identity. Company membership alone never authorizes customer booking or invoice access.';

comment on column public.customer_access_accounts.booker_id is
  'Verified PA/booker identity used for customer booking and invoice authorization. One booker may manage multiple permitted travelers.';
