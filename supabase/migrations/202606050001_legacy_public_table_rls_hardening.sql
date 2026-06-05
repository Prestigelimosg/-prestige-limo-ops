-- Stage 4A-398: legacy public-table RLS hardening draft.
-- Do not apply without separate William approval.

alter table if exists public.companies enable row level security;
alter table if exists public.bookers enable row level security;
alter table if exists public.saved_addresses enable row level security;
alter table if exists public.rate_settings enable row level security;
alter table if exists public.travelers enable row level security;
alter table if exists public.drivers enable row level security;
