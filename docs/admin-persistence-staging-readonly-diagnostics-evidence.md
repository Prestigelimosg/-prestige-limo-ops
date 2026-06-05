# Stage 4A-391 - Admin Persistence Staging Read-Only Diagnostics Evidence

Stage 4A-391 added a read-only staging diagnostic for the admin booking persistence path after the single Stage 4A-390 controlled save-load retry failed safely.

This document is not approval to rerun the save-load command. It is not approval to insert, update, delete, upsert, run Supabase CLI commands, create migrations, run raw SQL writes, delete staging rows, perform production writes, or expose environment values.

## Sanitized Diagnostic Result

- Stage: `4A-391`.
- Latest pre-diagnostic commit: `8c13a3d Record controlled staging persistence save load retry`.
- Exact read-only staging diagnostic command:

```bash
node scripts/check-admin-booking-staging-readonly-contract.mjs
```

- Final sanitized diagnostic category: `auth_or_key_rejected`.
- The Supabase client initialized server-side.
- Read-only table reachability checks were blocked by `auth_or_key_rejected`.
- Read-only adapter column contract checks were blocked by `auth_or_key_rejected`.
- Read-only embedded load contract check was blocked by `auth_or_key_rejected`.
- Read-only prior-reference count checks were blocked by `auth_or_key_rejected`.
- No row contents were printed.
- No secrets, URLs, key prefixes, tokens, stack traces, SQL details, Supabase internals, or environment values were printed or committed.

## Diagnosis

The remaining staging save blocker is categorized as `auth_or_key_rejected` before table reachability, column compatibility, embedded load shape, or prior-reference counts can be confirmed.

This means Stage 4A-391 did not identify a migration-required table or column blocker. Because the read-only checks are rejected at the auth/key boundary, schema shape and partial-row status remain unconfirmed by staging evidence.

The fix is not a migration in this stage. The next backend workflow should confirm or replace the staging-only Supabase URL/service-role pairing outside Git, then rerun only the read-only diagnostic. A future live save-load retry still needs a new explicit William approval.

## Safety Boundaries Preserved

- No live save-load retry was attempted.
- No insert, update, delete, or upsert was performed.
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

- Confirm `.env.stage4a388.local` remains ignored and uncommitted.
- Confirm staging-only Supabase URL/service-role pairing without printing values.
- Rerun only the read-only staging diagnostic.
- Do not rerun the controlled save-load command without a new explicit William approval.
