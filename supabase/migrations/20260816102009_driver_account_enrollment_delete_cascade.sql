-- Permit the established atomic Admin Delete + Revoke function to delete an
-- account-bearing Driver profile. Only the server-only one-time enrollment
-- claim follows the exact Driver row; Job Links and the revoked access-account
-- tombstone remain governed by their existing constraints.

set search_path = public, extensions;
set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.driver_account_enrollments
  drop constraint if exists driver_account_enrollments_driver_id_fkey,
  add constraint driver_account_enrollments_driver_id_fkey
    foreign key (driver_id)
    references public.drivers(id)
    on delete cascade;

comment on constraint driver_account_enrollments_driver_id_fkey
  on public.driver_account_enrollments is
  'Deletes only the one-time server enrollment claim when the established Admin Delete + Revoke action deletes the exact Driver profile. Historical Job Links, bookings, Driver Reports, audit evidence, revoked access-account tombstones, and Auth identities remain unchanged.';
