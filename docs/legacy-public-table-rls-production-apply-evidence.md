# Stage 4A-401C - Legacy Public Table RLS Production Evidence

Stage 4A-401C was approved by William for the proven production Supabase project. The stage did not print the full project reference, env values, URLs, keys, tokens, row data, stack traces, or Supabase internals.

## Target Proof

- Approved production target proof used prefix/suffix comparison only.
- Masked production project reference: `kvv...atm`.
- The full production project reference was not recorded.
- `.env` files and `supabase/.temp/*` remained uncommitted.

## Migration Reviewed

- File: `supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql`.
- Scope: enable RLS on `public.companies`, `public.bookers`, `public.saved_addresses`, `public.rate_settings`, `public.travelers`, and `public.drivers`.
- No policies were included in the migration.
- No insert, update, delete, upsert, drop table, grant, or dashboard quick fix was included.

## Rollback Plan Confirmed Before Apply Gate

If production verification failed because of this RLS hardening, the stage would stop immediately and preserve masked evidence. Any reverse RLS change would require a separate William-approved production rollback stage, scoped to the exact production target and the six tables or a production backup/snapshot plan. No rollback was executed in Stage 4A-401C.

## Migration Ledger Result

- Read-only pre-apply ledger command:

```bash
npx --yes supabase migration list
```

- The production ledger already showed `202606050001` present in both local and remote columns.
- The expected pending-migration gate was therefore not met.
- No production migration apply command was run in Stage 4A-401C.
- The apply command `npx --yes supabase db push` was intentionally not run because the target migration was already present remotely.

## Read-Only Verification Evidence

The stage used a Supabase CLI read-only linked catalog verification for RLS and policy counts. It did not run destructive SQL, data writes, deletes, live save/load, dashboard quick fixes, production persistence enablement, customer/driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning.

Sanitized production catalog result:

| Table | RLS enabled in production | Policy count | Public/anon policy count |
| --- | --- | ---: | ---: |
| `public.bookers` | yes | 0 | 0 |
| `public.companies` | yes | 0 | 0 |
| `public.drivers` | yes | 0 | 0 |
| `public.rate_settings` | yes | 0 | 0 |
| `public.saved_addresses` | yes | 0 | 0 |
| `public.travelers` | yes | 0 | 0 |

## Safety Boundaries Preserved

- Production DB was touched only by read-only migration ledger and read-only catalog verification.
- No production migration apply command was run in Stage 4A-401C because the migration was already present remotely.
- No `supabase db reset` was run.
- No destructive SQL was run.
- No data delete was run.
- No live save/load command was run.
- No staging row deletion was run.
- No public anon policies were created.
- No customer, driver, or public database policies were created.
- No production persistence enablement was performed.
- No parser, package-script, customer/driver auth, notification, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning behavior was changed.
