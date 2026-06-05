# Stage 4A-382 - Admin Persistence Enable Approval Checklist

Stage 4A-382 is a read-only approval and audit checklist for controlled admin booking persistence enablement. It records which mocked backend gates must be green before any separate real-write stage can even be considered.

This checklist is not approval to enable real writes. Real writes require a separate future stage and explicit William approval.

## A. Hard Boundary

- This stage does not activate real database writes.
- This stage does not approve persistence enablement.
- This stage does not approve Supabase commands.
- Supabase commands are not allowed unless explicitly approved in a separate future stage.
- No new migrations are allowed unless explicitly approved in a separate future stage.
- No real customer auth or driver auth is added.
- No notifications, billing, invoice, PDF, Stripe, PayNow payout, live-location, proof/photo, or parser-learning behavior is added.
- Parser files and parser behavior remain unchanged.
- Package scripts and `test:safe` membership remain unchanged.
- Public/customer/driver UI behavior remains unchanged.

## B. Mocked Gates Required Before Consideration

All of these mocked/read-only gates must be green before real-write enablement can even be considered:

- Adapter contract tests: `node scripts/test-admin-booking-supabase-adapter-contract.mjs`.
- API write-enable gate tests: `node scripts/test-admin-booking-persistence-api-gate.mjs`.
- Staging-config readiness tests: `node scripts/test-admin-booking-persistence-staging-config.mjs`.
- Kill-switch regression tests: `node scripts/test-admin-booking-persistence-kill-switch.mjs`.
- Enable-readiness tests: `node scripts/test-admin-booking-persistence-enable-readiness.mjs`.
- Parser tests: `npm run test:parser`.
- Browser route-leak tests: `npm run test:app-smoke-browser`.
- Mobile usability tests: `npm run test:mobile-usability-browser`.
- Full safe suite: `npm run test:safe`.

Supporting browser and build checks should also remain green in the same bounded pass:

- `npm run test:booking-ui-browser`.
- `npm run test:driver-job-page-browser`.
- `npm run lint`.
- `npm run build`.

## C. Enablement Safety Conditions

- The kill-switch must stay available.
- Closing the kill-switch must close write paths immediately.
- Ready staging configuration must not bypass the admin/dispatcher gate.
- Ready enablement configuration must still require a valid admin/dispatcher session.
- Local-dev admin fallback must not be treated as real-write approval.
- Customer, public, driver, and anonymous paths must remain blocked from admin booking persistence writes.
- Customer booking request paths must not become a hidden real-write enablement path.
- Browser/client bundles must not import server-only persistence code.
- API responses must stay safe and must not reveal internal readiness secrets, stack traces, SQL, Supabase internals, or server-only module details.

## D. Unsafe Fields That Must Remain Blocked

The admin booking persistence adapter and API gate must continue to reject or avoid these fields and field families:

- Pricing and quoted price fields.
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
- Internal admin notes and internal driver notes unless a separate future approval narrows and protects them.

## E. Secret Handling Audit Rule

Service-role/server-only secrets must never be exposed to browser code, client bundles, public JavaScript, API responses, logs, screenshots, commits, or docs examples.

Checklist examples must use descriptive placeholders only. They must not include real service-role values, staging secrets, live secrets, production project URLs, access tokens, session tokens, or copied environment files.

## F. Future Real-Write Approval Requirements

A future real-write stage must be separate from this checklist and must include explicit William approval before any write path is activated. That future stage must restate:

- The exact environment being targeted.
- The exact database/project being targeted.
- The exact migration and RLS posture, if any migration is approved.
- The exact admin/dispatcher auth gate being used.
- The kill-switch rollback behavior.
- The public/customer/driver/anonymous block behavior.
- The no-secret-exposure checks.
- The full required command list and post-commit `npm run test:safe`.

Until that separate approval exists, controlled persistence enablement remains read-only and mocked for audit purposes only.

## G. Recommended Next Different Backend Workflow Step

Recommended next different backend workflow step:

Stage 4A-383 - Read-only checkpoint review of the persistence enable approval checklist and mocked gate evidence before any migration, Supabase command, API expansion, auth expansion, or real-write stage is proposed.
