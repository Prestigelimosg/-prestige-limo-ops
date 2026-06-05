# Stage 4A-389 - Admin Persistence Staging Save-Load Failure Evidence

Stage 4A-389 documents the sanitized result from the single Stage 4A-388 controlled staging save-load attempt and the local adapter/schema diagnosis performed after that safe stop.

This document is not approval to rerun the staging save-load command. It is not approval to run Supabase CLI commands, create migrations, run raw SQL writes, delete staging rows, perform production writes, or expose environment values.

## Sanitized Stage 4A-388 Result

- Stage: `4A-388`.
- Exact approved live staging verification command that was attempted once:

```bash
PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED=stage-4a-388-william-approved node scripts/run-admin-booking-staging-save-load-verification.mjs
```

- Sanitized verification reference: `STAGING-VERIFY-4A388-20260605063421-BWH52V`.
- Safe failure code: `controlled_save_failed_safely`.
- Safe failure status: `500`.
- The runner stopped at the controlled save step.
- The runner did not print secrets, URLs, key prefixes, tokens, stack traces, SQL error details, or Supabase internals.
- No second live staging write was attempted in Stage 4A-389.

## Local Diagnosis

The local code/schema review found that the adapter tests were hiding cumulative migration contract risks:

- Existing migration history can leave numeric database identifiers in place while the adapter only accepted string identifiers.
- Existing migration history can leave legacy non-null operational columns in place while the adapter wrote only the newer column names for contact, route point, service item, and audit rows.
- Existing route-point constraints use the shared safe intersection of `pickup`, `dropoff`, `stop`, and `waypoint`; `extra_stop` route points must be stored as `stop` in the cumulative adapter contract.
- UI-facing source labels such as `admin-api` remain DTO labels only. Database-facing source surfaces remain underscore values such as `admin_api` and `admin_dashboard`.

The fix is possible without a migration by hardening the server-only adapter against the existing cumulative schema contract and adding local contract tests. A separate approved migration stage is still required for any future schema cleanup, constraint replacement, or production rollout.

## Safety Boundaries Preserved

- No Supabase CLI command was run.
- No migration was created.
- No raw SQL write was performed.
- No staging row deletion was performed.
- No production write was performed.
- No environment file was committed.
- No secret, token, URL, key prefix, service-role key, or environment value was printed or committed.
- Persistence still defaults OFF.
- The kill-switch remains `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`.
- Admin/dispatcher server-session gating remains required.
- Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.
- Unsafe fields continue to be rejected before adapter use.

## Before Any Future Retry

- Run the local schema/adapter contract test.
- Run all admin persistence mocked preflight gates.
- Confirm `.env.stage4a388.local` remains ignored and uncommitted.
- Obtain a new explicit William approval for any future live staging save-load command.
- Attempt at most one controlled staging save-load command in that separately approved future stage.
