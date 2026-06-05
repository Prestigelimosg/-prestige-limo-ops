# Stage 4A-395 - Admin Persistence Production Readiness Gate

Stage 4A-395 is a local/read-only production-readiness and staging-cleanup decision gate. It does not enable production persistence, does not approve cleanup, and does not approve any database write.

## Layman Summary

The admin persistence path has now passed controlled staging checks in two ways: the server-only adapter can save and load one fake staging booking/customer record, and the actual admin API route can save and load one fake staging booking/customer record. That means the narrow internal admin persistence path has useful staging evidence.

Production is still not turned on. The next decision is not "flip the switch"; it is a go/no-go review of production environment, RLS/security posture, cleanup preference, and exact approvals.

## Proven Safe In Staging

- Stage 4A-393 server-only adapter staging save/load succeeded.
- Stage 4A-394 admin API-route staging save/load succeeded.
- Stage 4A-397 retired browser-side direct Supabase access for the legacy admin public tables by moving the admin dashboard calls behind a server-only admin route.
- Stage 4A-398 created a local RLS hardening migration draft for the legacy admin public tables.
- Stage 4A-399 applied that RLS hardening migration to the approved staging Supabase project only and verified RLS enabled with no public anon policies.
- The staging env/key was accepted by read-only checks in Stage 4A-392.
- Persistence still defaults OFF.
- The kill-switch blocks writes.
- Admin/dispatcher server-session gating is required.
- Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.
- Unsafe fields remain rejected before adapter use.
- No real customer auth, driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning is included.

## Evidence References

- [Admin Persistence Staging Save-Load Success Evidence](admin-persistence-staging-save-load-success-evidence.md) records the sanitized Stage 4A-393 server-only adapter staging save/load success.
- [Admin Persistence API Staging Save-Load Success Evidence](admin-persistence-api-staging-save-load-success-evidence.md) records the sanitized Stage 4A-394 admin API-route staging save/load success.
- [Admin Persistence Staging Read-Only Env Key Confirmed](admin-persistence-staging-readonly-env-key-confirmed.md) records the sanitized Stage 4A-392 read-only env/key confirmation.
- [Admin Persistence Staging Command And Evidence Checklist](admin-persistence-staging-command-and-evidence-checklist.md) preserves the staged command and evidence boundary.
- [Admin Persistence Staging Verification Packet](admin-persistence-staging-verification-packet.md) preserves the broader staging verification packet.
- [Admin Persistence Real-Write Approval Proposal](admin-persistence-real-write-approval-proposal.md) preserves the earlier real-write approval proposal boundary.
- [Admin Persistence Enable Approval Checklist](admin-persistence-enable-approval-checklist.md) preserves the enablement checklist and mocked gate requirements.
- [Admin Persistence Staging Cleanup Decision](admin-persistence-staging-cleanup-decision.md) records the Stage 4A-395 cleanup decision boundary.
- [Legacy Public Table Server Route Hardening](legacy-public-table-server-route-hardening.md) records the Stage 4A-397 browser-direct-access retirement and confirms the RLS migration remains separate.
- [Legacy Public Table RLS Hardening](legacy-public-table-rls-hardening.md) records the Stage 4A-398 local RLS migration draft and Stage 4A-399 staging-only apply result.
- [Legacy Public Table RLS Hardening Apply Evidence](legacy-public-table-rls-hardening-apply-evidence.md) records the masked Stage 4A-399 staging apply and read-only verification evidence.
- [Legacy Public Table RLS Production Decision Packet](legacy-public-table-rls-production-decision-packet.md) records the Stage 4A-400 post-apply review and keeps production RLS apply blocked until a separate approval.

## Production Go/No-Go

Production enablement is not approved.

Production writes remain blocked until William separately approves a production enablement stage with exact environment, exact feature-flag posture, exact migration/Supabase command posture, exact rollback plan, and passing test evidence.

Production readiness is currently `blocked`.

## Known Production Blockers And Decision Items

- Staging evidence exists, but production env is not verified.
- Production feature flag remains OFF.
- Staging verification rows may exist and need a separate cleanup decision.
- Any staging cleanup write/delete requires separate explicit William approval.
- Supabase Security Advisor previously showed RLS disabled on older public tables:
  - `public.companies`.
  - `public.bookers`.
  - `public.saved_addresses`.
  - `public.rate_settings`.
  - `public.travelers`.
  - `public.drivers`.
- Stage 4A-397 moved the admin dashboard runtime access for those tables behind a server-only admin route.
- Stage 4A-398 created a local RLS hardening migration draft.
- Stage 4A-399 applied and verified that draft in approved staging only; production still requires separate explicit William approval before any production RLS apply, production read, or production write.
- Stage 4A-400 reviewed the staging evidence and keeps production decision `blocked`.
- Do not fix those from the dashboard in this stage.
- If those tables still exist and are exposed, production readiness should require a separate approved RLS hardening migration stage.

## Required Separate Approvals

- Production write requires separate explicit William approval.
- Any Supabase command requires separate explicit William approval.
- Any migration requires separate explicit William approval.
- Any staging cleanup write/delete requires separate explicit William approval.
- Any dashboard quick fix is forbidden unless separately approved.
- Any production dashboard or Supabase UI fix is forbidden unless separately approved.

## Required Safety Boundaries

- No live save-load retry is approved.
- No insert, update, delete, or upsert is approved.
- No staging row deletion is approved.
- No raw SQL write is approved.
- No production Supabase CLI command is approved.
- No production migration is approved.
- Stage 4A-399 approves only the completed staging apply and verification; applying or deploying to production remains not approved.
- Stage 4A-400 is a decision packet only; it does not approve production apply, production reads, production writes, dashboard fixes, raw SQL, or live save/load.
- No production write is approved.
- No dashboard quick fix is approved.
- `.env.stage4a388.local` must remain ignored and uncommitted.
- Secrets, env values, URLs, key prefixes, tokens, stack traces, SQL internals, and Supabase internals must not be printed or committed.

## Unsafe Fields That Stay Rejected

Unsafe fields remain rejected before adapter use:

- Pricing / quoted price fields.
- Driver payout fields.
- PayNow payout fields.
- Invoice, payment, and PDF fields.
- Billing and accounting fields.
- Finance notes.
- Parser/debug internals.
- Raw parser prompts, AI prompts, parser-learning, and parser rule-change fields.
- Live-location, proof, and photo fields.
- Notification-send fields and message delivery state.
- Mock archive fields.
- Mock QA fields.
- Mock workbench and dev workbench fields.
- Customer auth and driver auth fields.
- Service-role, server-only, server secret, and internal credential fields.

## Forbidden Feature Scope

This gate includes no real customer auth, driver auth, notifications, billing, payment, invoice, PDF, Stripe, PayNow payout, driver payout, payout, live-location, proof/photo, or parser-learning.

## Required Checks Before Any Future Production Enablement

Before a future production enablement stage can be considered, a separate approval packet must confirm:

- The exact production environment and project target without exposing secrets.
- Production env values are present, non-placeholder, production-approved, and never printed.
- Production feature flag starts OFF.
- Kill-switch OFF behavior blocks writes.
- Admin/dispatcher gate is required.
- Customer, public, driver, and anonymous paths remain blocked.
- Unsafe fields are rejected before adapter use.
- Browser/client bundles cannot import server-only persistence.
- API responses do not expose secrets, env values, stack traces, SQL, Supabase internals, tokens, keys, or server-only details.
- The legacy public table RLS advisor blocker is resolved or explicitly accepted by a separate approved security stage.
- Any required Supabase command or migration has explicit William approval.
- Post-change `npm run test:safe` passes and `git status --short` is clean.

## Stage 4A-395 Decision

- Production readiness: `blocked`.
- Production enablement: `not approved`.
- Production writes: `not approved`.
- Supabase commands: `not approved`.
- Migrations: `not approved`.
- Dashboard quick fixes: `not approved`.
- Staging cleanup write/delete: `not approved`.
- Recommended next backend workflow: separate William-approved production-readiness/RLS hardening review, or a separate William-approved staging-only cleanup workflow if cleanup is desired.
