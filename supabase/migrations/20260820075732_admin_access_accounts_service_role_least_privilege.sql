-- Supabase's public-schema default privileges granted the server role more
-- table operations than this read-only Admin-account verification lane needs.
-- Reset the exact table grant and restore only SELECT.

revoke all on table public.admin_access_accounts from service_role;
grant select on table public.admin_access_accounts to service_role;
