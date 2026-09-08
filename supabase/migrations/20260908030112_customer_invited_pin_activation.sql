-- An Admin-issued, single-use invitation may verify access without verifying email.
-- Existing email-verified users and every Company/Booker/traveller scope stay intact.
alter table public.customer_access_principals
  add column if not exists invitation_verified_at timestamptz;

alter table public.customer_access_principals
  drop constraint customer_access_principals_active_pin_check;
alter table public.customer_access_principals
  add constraint customer_access_principals_active_pin_check check (
    principal_status <> 'active'
    or (pin_hash is not null and (email_verified_at is not null or invitation_verified_at is not null))
  );
