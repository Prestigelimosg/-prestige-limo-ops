# Stage 4A-390 - Admin Persistence Staging Save-Load Retry Failure Evidence

Stage 4A-390 attempted exactly one William-approved controlled staging save-load retry after the Stage 4A-389 adapter/schema fix. The retry failed safely at the controlled save step.

This document is not approval to rerun the staging save-load command. It is not approval to run Supabase CLI commands, create migrations, run raw SQL writes, delete staging rows, perform production writes, or expose environment values.

## Sanitized Retry Result

- Stage: `4A-390`.
- Latest pre-verification commit: `effe59b Diagnose controlled staging persistence save failure`.
- Exact approved live staging retry command that was attempted once:

```bash
PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED=stage-4a-390-william-approved node scripts/run-admin-booking-staging-save-load-verification.mjs
```

- Sanitized verification reference: `STAGING-VERIFY-4A390-20260605072200-KAC4OT`.
- Safe failure code: `controlled_save_failed_safely`.
- Safe failure status: `500`.
- The runner stopped at the controlled save step.
- The live retry command was not rerun.
- The runner did not print secrets, URLs, key prefixes, tokens, stack traces, SQL error details, or Supabase internals.

## Local Follow-Up Diagnosis

The local code/schema review after the failed retry found one additional adapter hardening issue that can be fixed without a migration:

- The Stage 4A-389 adapter wrote cumulative legacy compatibility columns unconditionally.
- A staging schema that has only the current admin persistence migration shape can reject those legacy columns before any controlled save succeeds.
- The Stage 4A-390 local fix changes the server-only adapter to try current-schema payloads first and fall back to cumulative compatibility payloads only after a safe insert failure.
- Local mocked contract tests now cover both the current migration shape and the cumulative migration shape.

Because the single approved live retry has already been consumed, this local fix must not be verified by another live staging write in Stage 4A-390. Any future live retry needs a new explicit William approval.

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

- Obtain a new explicit William approval naming the exact future live retry command.
- Run the local schema/adapter contract tests.
- Run all admin persistence mocked preflight gates.
- Confirm `.env.stage4a388.local` remains ignored and uncommitted.
- Attempt at most one controlled staging save-load command in that separately approved future stage.
