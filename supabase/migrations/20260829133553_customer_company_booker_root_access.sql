-- Additive Company+Booker root access for future Customer app activation.
-- Existing PA/Boss Traveller memberships remain readable compatibility data;
-- no principal, device, session, subscription, invitation, or legacy row is
-- rewritten or removed by this migration.

set search_path = public, extensions;

alter table public.customer_access_memberships
  alter column traveler_id drop not null;

alter table public.customer_access_memberships
  drop constraint if exists customer_access_memberships_traveler_scope_check;

alter table public.customer_access_memberships
  add constraint customer_access_memberships_traveler_scope_check check (
    membership_role = 'managing_pa' or traveler_id is not null
  );

create unique index customer_access_memberships_company_booker_root_key
  on public.customer_access_memberships (principal_id, company_id, booker_id)
  where traveler_id is null;

create index customer_access_memberships_company_booker_active_idx
  on public.customer_access_memberships
  (company_id, booker_id, membership_status);
