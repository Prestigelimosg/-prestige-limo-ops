-- Customer company profile fields only. These fields are intentionally separate
-- from pricing, payout, invoice, booking, and driver operational data.
alter table public.companies
  add column if not exists billing_address text,
  add column if not exists main_phone text,
  add column if not exists mobile_phone text,
  add column if not exists website text,
  add column if not exists primary_contact_name text,
  add column if not exists billing_email text,
  add column if not exists accounts_email text,
  add column if not exists operations_email text;

alter table public.companies
  drop constraint if exists companies_customer_profile_contact_fields_length_check;

alter table public.companies
  add constraint companies_customer_profile_contact_fields_length_check check (
    (billing_address is null or char_length(billing_address) <= 500)
    and (main_phone is null or char_length(main_phone) <= 80)
    and (mobile_phone is null or char_length(mobile_phone) <= 80)
    and (website is null or char_length(website) <= 240)
    and (primary_contact_name is null or char_length(primary_contact_name) <= 160)
    and (billing_email is null or char_length(billing_email) <= 240)
    and (accounts_email is null or char_length(accounts_email) <= 240)
    and (operations_email is null or char_length(operations_email) <= 240)
  );
