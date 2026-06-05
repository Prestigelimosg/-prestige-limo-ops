# Stage 4A-398 - Legacy Public Table RLS Hardening Draft

Stage 4A-398 creates a local migration draft to enable row-level security for the six legacy public tables that were previously flagged as a production-readiness blocker.

## Why This Exists

The legacy admin CRM, rates, and driver tables were older public tables. Before tightening them, Stage 4A-397 first moved the admin dashboard away from browser-side direct Supabase access and behind a server-only admin route.

Now that browser direct access has been retired, this stage prepares the RLS hardening draft for review. The migration is present in the repository only; it has not been applied to any Supabase project.

## Draft Migration

- File: `supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql`.
- Tables covered: `public.companies`, `public.bookers`, `public.saved_addresses`, `public.rate_settings`, `public.travelers`, and `public.drivers`.
- The draft enables row-level security only.
- No public anon policies are added.
- No customer, driver, or public database policies are added.
- No data is deleted.

## Approval Boundary

- Supabase command/apply requires separate explicit William approval.
- Raw SQL against Supabase requires separate explicit William approval.
- Production enablement remains not approved.
- Production writes remain not approved.
- Staging cleanup write/delete remains not approved.
- Dashboard quick fixes remain not approved.

## Required Follow-Up

Before this draft can be applied, a separate backend security stage must re-confirm the exact target project, approval posture, rollback plan, RLS policy posture, and passing safety checks without exposing secrets or env values.
