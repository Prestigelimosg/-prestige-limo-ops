# Stage 4A-401A - Legacy Public Table RLS Production Target Proof Checklist

Stage 4A-401A is a production-target proof planning stage only. It does not apply a migration, run Supabase apply commands, run raw SQL, touch production, touch staging rows, run live save/load, print env values, or expose secrets.

## Why Stage 4A-401 Stopped

Stage 4A-401 stopped before applying because the local Supabase link still matched the masked Stage 4A-399 staging evidence target. The local linked project metadata was present, but it was not enough to prove the approved production Supabase project.

The project display name alone is not production proof. If the linked target cannot be distinguished from the Stage 4A-399 staging target, the production apply stage must stop before running any migration command.

## Production Target Proof Required

Before a future production apply stage can proceed, William must confirm the approved production Supabase project outside committed docs and without sharing secrets in the repo. The confirmation should identify the production project enough for the operator to compare it locally, but committed evidence must stay masked.

The future apply stage must verify all of these before applying:

- The local Supabase link points to William's approved production project.
- The linked target is not the Stage 4A-399 staging target.
- The target is not inferred from display name alone.
- The target proof does not print URLs, keys, tokens, env values, service-role values, or row data.
- `.env` files and `supabase/.temp/*` remain uncommitted.
- If the staging-vs-production distinction is ambiguous, stop before apply.

## Migration And Pending-State Proof Required

The future apply stage must re-review `supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql` before apply and confirm the migration only enables RLS on:

- `public.companies`
- `public.bookers`
- `public.saved_addresses`
- `public.rate_settings`
- `public.travelers`
- `public.drivers`

The future apply stage must also confirm the only pending migration is `202606050001_legacy_public_table_rls_hardening.sql`. If any other migration is pending, or if the migration prompt is ambiguous, stop before apply.

## Rollback Note

Enabling RLS on these legacy public tables should be treated as a production security change. If production verification fails because of this change, stop immediately and preserve masked evidence.

Any reverse RLS change must be a separate William-approved production rollback stage. It must name the exact production target, tables, command posture, backup/snapshot expectation, verification plan, and stop conditions. Do not use dashboard quick fixes, destructive SQL, data deletion, policy creation, customer/driver auth changes, notifications, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning as part of rollback.

## Future Command Boundary

Stage 4A-401A authorizes no Supabase command.

A future production apply stage may use this command boundary only after target proof passes and William separately approves that apply stage:

- Read-only ledger check before apply: `npx --yes supabase migration list`.
- The only migration apply command: `npx --yes supabase db push`.
- Read-only ledger check after apply: `npx --yes supabase migration list`.
- Sanitized read-only catalog verification for RLS enabled and zero policies on the six target tables.

The future apply stage must not run `supabase db reset`, raw SQL writes, dashboard quick fixes, data delete, live save/load, production persistence enablement, customer/driver auth or policies, notifications, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning.

## Stage 4A-401A Result

Production target proof remains blocked until the local Supabase link is proven to be William's approved production project and proven not to be the Stage 4A-399 staging target. Production DB was not touched in Stage 4A-401A.
