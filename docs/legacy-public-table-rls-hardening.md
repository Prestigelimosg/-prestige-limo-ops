# Stage 4A-398 / Stage 4A-399 - Legacy Public Table RLS Hardening

Stage 4A-398 creates a local migration draft to enable row-level security for the six legacy public tables that were previously flagged as a production-readiness blocker.

## Why This Exists

The legacy admin CRM, rates, and driver tables were older public tables. Before tightening them, Stage 4A-397 first moved the admin dashboard away from browser-side direct Supabase access and behind a server-only admin route.

Now that browser direct access has been retired, Stage 4A-398 prepared the RLS hardening draft for review. Stage 4A-399 later applied that same migration to the approved staging Supabase project only.

## Migration

- File: `supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql`.
- Tables covered: `public.companies`, `public.bookers`, `public.saved_addresses`, `public.rate_settings`, `public.travelers`, and `public.drivers`.
- The migration enables row-level security only.
- No public anon policies are added.
- No customer, driver, or public database policies are added.
- No data is deleted.

## Stage 4A-399 Staging Result

- William approved Stage 4A-399 for the approved staging Supabase project only.
- The migration was applied to staging with the established Supabase CLI workflow.
- Remote ledger verification showed `202606050001` applied after the staging push.
- Read-only catalog verification showed RLS enabled on all six target tables.
- Read-only catalog verification showed zero policies and zero public/anon policy count on all six target tables.
- [Legacy Public Table RLS Hardening Apply Evidence](legacy-public-table-rls-hardening-apply-evidence.md) records the masked staging evidence.

## Approval Boundary

- Production enablement remains not approved.
- Production writes remain not approved.
- Staging cleanup write/delete remains not approved.
- Dashboard quick fixes remain not approved.
- Customer auth, driver auth, customer/driver/public database policies, billing, payment, PDF, payout, live-location, proof/photo, and parser-learning remain out of scope.

## Required Follow-Up

Before any production use, a separate production approval stage must re-confirm the exact production project, production rollback plan, RLS policy posture, and passing safety checks without exposing secrets or env values. Stage 4A-399 does not approve production apply, production reads, or production writes.
