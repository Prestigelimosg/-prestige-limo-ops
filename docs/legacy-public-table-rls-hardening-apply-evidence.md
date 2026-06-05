# Stage 4A-399 - Legacy Public Table RLS Hardening Apply Evidence

Stage 4A-399 applied the legacy public-table RLS hardening migration to the approved staging Supabase project only.

## Approval And Target

- William approved Stage 4A-399 for the approved staging Supabase project only.
- Target proof passed before apply: the ignored local staging env matched the local Supabase link and the previously documented staging apply target.
- Masked linked project reference: `kvv...atm`.
- `.env.stage4a388.local` remained ignored and uncommitted.
- No env values, URLs, key prefixes, service-role values, session tokens, row data, stack traces, or Supabase internals were recorded.

## Migration Reviewed

- File: `supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql`.
- Scope: enable RLS on `public.companies`, `public.bookers`, `public.saved_addresses`, `public.rate_settings`, `public.travelers`, and `public.drivers`.
- No policies were included in the migration.
- No insert, update, delete, upsert, drop table, grant, or dashboard quick fix was included.

## Rollback Plan Confirmed Before Apply

If staging verification failed because of this RLS hardening, the stage would stop immediately. Any reverse RLS change or staging restore would require a separate William-approved staging-only rollback stage, scoped to these six tables or a staging backup/snapshot. No rollback was executed in Stage 4A-399.

## Apply Evidence

- Pre-apply remote migration ledger showed only `202606050001` pending.
- Apply prompt listed only `202606050001_legacy_public_table_rls_hardening.sql`.
- Exact apply command:

```bash
npx --yes supabase db push
```

- Apply result: finished successfully.
- Post-apply remote migration ledger showed `202606050001` present in both local and remote columns.

## Read-Only Verification Evidence

Docker-dependent schema dump verification was unavailable in this local environment because Docker was not running. The stage then used the Supabase CLI read-only linked database query path for catalog verification.

Sanitized catalog result:

| Table | RLS enabled | Policy count | Public/anon policy count |
| --- | --- | ---: | ---: |
| `public.bookers` | yes | 0 | 0 |
| `public.companies` | yes | 0 | 0 |
| `public.drivers` | yes | 0 | 0 |
| `public.rate_settings` | yes | 0 | 0 |
| `public.saved_addresses` | yes | 0 | 0 |
| `public.travelers` | yes | 0 | 0 |

## Safety Boundaries Preserved

- Live DB was touched only by the single approved staging migration apply and read-only staging verification.
- No production project was touched.
- No `supabase db reset` was run.
- No destructive SQL was run.
- No live save-load command was run.
- No staging row deletion was run.
- No public anon policies were created.
- No customer, driver, or public database policies were created.
- No parser, package-script, customer/driver auth, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning behavior was changed.
