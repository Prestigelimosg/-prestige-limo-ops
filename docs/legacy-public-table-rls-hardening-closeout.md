# Stage 4A-402 - Legacy Public Table RLS Hardening Closeout

Stage 4A-402 is a docs-and-tests closeout only. It does not run Supabase CLI commands, run raw SQL, touch a live database, run live save/load, enable production persistence, create policies, change auth, delete data, print env values, or expose secrets.

## Closeout Summary

Legacy public-table RLS hardening evidence is complete for both staging and production.

- Stage 4A-399 recorded staging evidence for `202606050001_legacy_public_table_rls_hardening.sql`.
- Stage 4A-401C recorded production evidence for the same migration.
- Staging evidence shows RLS enabled and zero policies/public anon policies on all six legacy public tables.
- Production evidence shows RLS enabled and zero policies/public anon policies on all six legacy public tables.
- The migration only enables RLS and creates no policies, grants, inserts, updates, deletes, upserts, drops, customer/driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning behavior.

Covered tables:

| Table | Staging evidence | Production evidence | Policy count | Public/anon policy count |
| --- | --- | --- | ---: | ---: |
| `public.bookers` | RLS enabled | RLS enabled | 0 | 0 |
| `public.companies` | RLS enabled | RLS enabled | 0 | 0 |
| `public.drivers` | RLS enabled | RLS enabled | 0 | 0 |
| `public.rate_settings` | RLS enabled | RLS enabled | 0 | 0 |
| `public.saved_addresses` | RLS enabled | RLS enabled | 0 | 0 |
| `public.travelers` | RLS enabled | RLS enabled | 0 | 0 |

## Still Blocked

Production persistence remains OFF and is not approved.

- No production booking/customer save-load is approved.
- No production write is approved.
- No production persistence feature flag change is approved.
- No production Supabase command is approved by this closeout.
- No customer auth, driver auth, customer/driver/public database policies, notifications, billing, payment, PDF, payout, live-location, proof/photo, parser-learning, or dashboard quick fix is approved.
- Any future production persistence stage must separately prove environment, feature flag posture, auth gate, kill-switch behavior, unsafe-field rejection, rollback, test coverage, and no-secret evidence.

## Next Options

### Option A - Continue Supabase Persistence/Auth Path

Use this path if William wants to keep moving toward real production persistence.

The next stage should be a separate approval packet for production persistence/auth readiness. It should confirm production env/config without printing values, keep persistence default OFF until explicitly enabled, prove kill-switch behavior, prove admin/dispatcher-only access, keep customer/public/driver/anonymous paths blocked, review any required RLS policies before creation, and define rollback and evidence requirements before any production write.

### Option B - Pause Supabase And Return To App/Business Workflow Work

Use this path if William wants to pause backend risk and improve the operator/customer experience next.

Safe next work can stay local/mock/docs/UI-only: dispatch workflow polish, customer request review flow, driver assignment handoff, dashboard consolidation, mobile usability, copy/operations improvements, or business-process docs. This path must not enable production persistence, run Supabase commands, create policies, touch live data, send notifications, create billing/payment/PDF/payout behavior, enable live-location, or change parser-learning behavior.

## Evidence References

- [Legacy Public Table RLS Hardening Apply Evidence](legacy-public-table-rls-hardening-apply-evidence.md)
- [Legacy Public Table RLS Production Evidence](legacy-public-table-rls-production-apply-evidence.md)
- [Admin Persistence Production Readiness Gate](admin-persistence-production-readiness-gate.md)
