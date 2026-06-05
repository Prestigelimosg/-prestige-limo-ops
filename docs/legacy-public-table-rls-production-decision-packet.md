# Stage 4A-400 - Legacy Public Table RLS Production Decision Packet

Stage 4A-400 is a post-apply review packet only. It does not apply anything, run Supabase commands, run raw SQL, touch production, delete staging rows, or run live save/load.

## Staging Evidence Reviewed

Stage 4A-399 applied `supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql` to the approved staging Supabase project only.

The staging evidence confirms:

| Table | RLS enabled in staging | Policy count | Public/anon policy count |
| --- | --- | ---: | ---: |
| `public.bookers` | yes | 0 | 0 |
| `public.companies` | yes | 0 | 0 |
| `public.drivers` | yes | 0 | 0 |
| `public.rate_settings` | yes | 0 | 0 |
| `public.saved_addresses` | yes | 0 | 0 |
| `public.travelers` | yes | 0 | 0 |

The migration enables row-level security only. It creates no policies, grants, inserts, updates, deletes, upserts, drops, or public anon access.

## Production Decision

Production decision: `blocked`.

Production RLS apply is not approved. Production reads are not approved. Production writes are not approved. Production dashboard fixes are not approved.

The Stage 4A-399 staging result is useful evidence, but it is not permission to apply the migration to production. Any production action requires a separate William-approved production stage that names the exact production target, exact command posture, rollback plan, verification plan, and stop conditions without exposing secrets or env values.

## Required Before Any Production Approval

- Confirm the exact production Supabase project without printing URLs, keys, tokens, or env values.
- Confirm the production rollback plan before any production apply.
- Confirm a production verification plan that checks RLS enabled and no public anon policies without printing sensitive details.
- Confirm no customer, driver, or public database policies are added by implication.
- Confirm the admin dashboard still uses the server-only admin route for legacy public-table access.
- Confirm `npm run test:safe` passes before and after any future production stage.

## Boundaries Preserved In Stage 4A-400

- No Supabase CLI command was run.
- No raw SQL was run.
- No dashboard quick fix was performed.
- No production project was touched.
- No live save/load was run.
- No staging row deletion was run.
- No env files were printed or committed.
- No parser, package-script, customer/driver auth, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning behavior changed.
