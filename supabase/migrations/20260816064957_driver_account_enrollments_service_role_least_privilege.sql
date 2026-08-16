-- Supabase's legacy public-schema default privileges granted more table
-- operations than this server-only enrollment lane needs. Reset the exact
-- service role grant and restore only its established read/create/update set.

revoke all on table public.driver_account_enrollments from service_role;
grant select, insert, update on table public.driver_account_enrollments to service_role;
