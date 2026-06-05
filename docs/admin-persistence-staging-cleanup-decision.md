# Stage 4A-395 - Admin Persistence Staging Cleanup Decision

Stage 4A-395 records the staging cleanup decision after the controlled Stage 4A-393 and Stage 4A-394 save/load verifications.

This document does not approve cleanup. It does not approve a staging delete, update, insert, upsert, raw SQL write, Supabase command, migration, production write, dashboard quick fix, or exposure of environment values.

## Cleanup Decision

Staging cleanup write/delete is not approved.

No staging row deletion was performed in Stage 4A-395.

The verified staging references may remain as sanitized evidence until William separately approves a cleanup workflow:

- `STAGING-VERIFY-4A393-20260605092213-5VT0IV`.
- `STAGING-API-VERIFY-4A394-20260605095158-LV1NVT`.

Cleanup is not required to prove the local production-readiness gate. Cleanup is a separate operational decision because deleting or modifying staging rows is still a database write.

## What Is Already Known

- Stage 4A-393 server-only adapter staging save/load succeeded.
- Stage 4A-394 admin API-route staging save/load succeeded.
- Both stages used fake staging booking/customer data only.
- Both stages reported sanitized evidence only.
- Both stages preserved the default-OFF persistence posture.
- Both stages confirmed the kill-switch blocks writes.
- Both stages confirmed the admin/dispatcher gate is required.
- Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.
- Unsafe fields remain rejected before adapter use.

## Separate Approval Required For Cleanup

Any future staging cleanup workflow requires separate explicit William approval before any write/delete is attempted.

That future approval must name:

- The exact staging-only target.
- The exact cleanup reference or references.
- The exact cleanup command or route.
- Whether a Supabase command is approved; default is not approved.
- Whether a migration is approved; default is not approved.
- Whether raw SQL is approved; default is not approved.
- The rollback and evidence plan.
- The no-production-access boundary.
- The post-cleanup `npm run test:safe` and `git status --short` checks.

## Cleanup Stop Conditions

Stop before cleanup if any of these appear:

- The target is production, unknown, or ambiguous.
- The cleanup command would print secrets, env values, URLs, key prefixes, tokens, stack traces, SQL internals, or Supabase internals.
- The cleanup command requires Supabase CLI without explicit approval.
- The cleanup command requires raw SQL without explicit approval.
- The cleanup command requires a migration without explicit approval.
- The cleanup command affects rows outside the exact approved staging references.
- The cleanup command touches customer auth, driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, parser-learning, parser files, package scripts, or public/customer/driver UI behavior.

## Stage 4A-395 Decision

- Staging cleanup needed now: `no`.
- Staging cleanup approved now: `no`.
- Staging row deletion performed: `no`.
- Staging cleanup write/delete requires separate explicit William approval: `yes`.
- Production enablement remains not approved.
- Recommended next backend workflow: separate William-approved production-readiness/RLS hardening review, or separate William-approved staging-only cleanup if William wants the staging evidence rows removed later.
