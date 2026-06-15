# Core Admin Booking Persistence Activation Readiness Packet

This packet is docs-only. It does not approve or activate live DB/write, migrations, Supabase env, provider/env, external APIs, live sending, payment, PDF, payout, auth, live location, photo upload/storage, CRM/calendar amendment writes, package changes, or shim changes.

## Current Checkpoints

- Latest repo commit at owner checklist update: `647f9bb Update ledger for core booking persistence safe path guard`.
- Latest implementation checkpoint currently preserved in the ledger: `4045c0a Add core booking persistence safe path guard`.
- Inspected paths: `app/page.tsx` Save Booking + CRM flow, `app/page.tsx` Admin Booking Persistence panel, `app/api/admin-bookings/route.ts`, `lib/admin-booking-persistence.ts`, `lib/admin-booking-supabase-adapter.ts`, existing admin booking persistence tests/docs, and ledger risk locks for pricing, payout, rates, and shims.

## Proposed First Live Activation Scope

- Exact proposed first activation: Admin Save Booking + CRM only, narrowed to the admin-only operational booking persistence contract at `POST /api/admin-bookings`.
- The currently visible legacy `Save Booking + CRM` button in `app/page.tsx` posts to `/api/admin-saved-bookings` with rich pricing/payout snapshot fields. That rich path is not approved for first live activation unless it is narrowed or rerouted to the operational contract.
- The safer first scope is one controlled admin/dispatcher booking/customer save-load path through `buildAdminBookingPersistencePayload`, `saveAdminBookingOperationalSnapshot`, and the server-only Supabase adapter.
- First activation must stay staging-only until separately approved for production.
- Customer amendment/cancellation must never auto-update CRM or calendar. Any CRM booking update or calendar update/cancel requires admin approval and a separate activation decision.

## Owner Approval Checklist For First Live DB Write Rehearsal

- Approval status: pending owner approval.
- Owner: ______________________________.
- Date: ______________________________.
- Exact approved future scope for a separately approved rehearsal: Admin Save Booking + CRM via `POST /api/admin-bookings` only.
- Explicitly not approved: `/api/admin-saved-bookings`, because it includes rich pricing/payout snapshot fields and is outside the first safe live DB write scope.
- Allowed fields: operational booking fields only, as listed in this packet and enforced by the `/api/admin-bookings` parser/guard.
- Excluded/risky fields: pricing, payout, payment, PDF, billing, `customer_rates`, `driver_payout_rules`, rate overrides, provider/send, auth, photo, live location, internal notes, and debug fields.
- Required kill switch: `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` must stay closed until owner approval and an approved controlled rehearsal window.
- Required Supabase/admin env names only, with values never printed, committed, pasted, or exposed: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`, and `PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL`.
- Table/policy verification checklist: confirm `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, and `audit_logs` exist; confirm required safe operational columns; confirm service-role access is server-only; confirm public/customer/driver anon clients cannot write; confirm RLS/policies do not expose finance/internal/debug fields; confirm no migration is included unless separately approved.
- Staging rehearsal checklist: use staging only; use one unique booking reference; verify kill switch OFF returns the disabled safe response; open the switch only for the approved window; call only `POST /api/admin-bookings`; verify one controlled save/load; verify no `/api/admin-saved-bookings` write; close the switch immediately after evidence is captured.
- Rollback/manual recovery checklist: keep previous successful preview deployment and commit ready; close `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`; record the controlled booking reference and inserted row ids if available; prepare owner-approved cleanup for exact rows only; rotate any exposed secret; rerun guards after recovery.
- Tests required before any activation: `node scripts/test-core-booking-persistence-safe-path-guard.mjs`, `node scripts/test-preactivation-verification-suite.mjs`, `node scripts/test-admin-booking-persistence-kill-switch.mjs`, `node scripts/test-admin-booking-persistence-api-gate.mjs`, `node scripts/test-admin-booking-supabase-adapter-contract.mjs`, `node scripts/test-admin-booking-persistence-staging-config.mjs`, `node scripts/test-admin-booking-persistence-enable-readiness.mjs`, `npm run lint`, `npm run build`, `git diff --check`, and `git status --short`.
- Same-pass rule: no CRM/calendar amendment updates, provider/live sending, auth, location, photo, payment, payout, or risky shim writes in the same pass.

## Allowed First Live Write Fields

Only safe operational booking fields from the existing `/api/admin-bookings` contract may be considered:

- `booking_reference`.
- `source_channel`, `source_surface`.
- `customer_id` only when resolved by the approved server-only adapter path.
- `pickup_datetime`, `pickup_at`.
- `pickup_location`, `dropoff_location`.
- `route_type`, `service_type`, `route_summary`.
- `customer_display_name`.
- `contact_display_name`, `contact_phone`, `contact_email`.
- `passenger_name`, `passenger_phone`.
- `pax_count`, `luggage_count`.
- `vehicle_type_or_category`.
- `customer_facing_status`, `admin_internal_status`.
- `short_notice_review_status`, `request_review_status`, `change_review_status`, `cancellation_review_status`.
- `parser_source_reference` as a safe source label only, not parser/debug internals.
- Route points: pickup, dropoff, stop, waypoint, extra stop.
- Service items: child seat, extra stop, waiting time, midnight charge.
- Narrow audit log for the approved admin persistence action.

Allowed tables for the first controlled write must be limited to the existing server-only adapter scope: `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, and `audit_logs`.

## Explicitly Excluded Fields And Areas

The first activation must exclude:

- Pricing, quoted prices, customer rates, customer surcharges, and rate overrides.
- Driver payout, payout ranges, payout comparisons, PayNow payout, commissions, and driver payout override fields.
- `customer_rates`, `driver_payout_rules`, `rate_settings` write/upsert, pricing, and payout paths.
- Payment, payment links, PDF, invoice, billing, and admin finance fields.
- Full driver profile write/delete, driver payout preferences, internal driver notes, preferred areas, and airport permit notes.
- Customer/traveler/company rate override writes.
- Provider/env activation, external APIs, email, WhatsApp, SMS, Telegram, and live sending.
- Auth/session/token issuing beyond the already planned admin/dispatcher boundary check.
- Live location, GPS capture, customer map, photo upload/storage, OTS photo proof, and storage policies.
- Parser/debug internals, mock QA/dev archive data, raw prompts, parser learning, and internal admin notes.
- CRM/calendar amendment update actions, calendar sync, calendar update, and calendar cancel.

## Required Approvals Before Activation

No activation can begin until the owner separately approves all of the following:

- Live DB write approval for the exact staging target and exact command/path.
- Supabase env approval for server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, with secrets never printed, committed, logged, or exposed to client bundles.
- Confirmation that `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` defaults OFF and is enabled only for an approved controlled window.
- Admin/dispatcher boundary approval, including `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE=server-session-token`, approved role, approved actor label, and staging-only session token handling.
- Table and policy verification for `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, and `audit_logs`.
- Verification that RLS, service-role use, and server-only imports do not expose secrets or permit public/customer/driver writes.
- Rollback/manual recovery plan approval before any live write.
- Explicit confirmation that no migration is included in this first activation unless separately approved.

## Required Tests And Checks Before Activation

Run and record these before any approved live write window:

- `node scripts/test-preactivation-verification-suite.mjs`.
- `node scripts/test-admin-booking-persistence-kill-switch.mjs`.
- `node scripts/test-admin-booking-persistence-api-gate.mjs`.
- `node scripts/test-admin-booking-supabase-adapter-contract.mjs`.
- `node scripts/test-admin-booking-persistence-staging-config.mjs`.
- `node scripts/test-admin-booking-persistence-enable-readiness.mjs`.
- `node scripts/test-admin-booking-controlled-real-write-enable.mjs`.
- `node scripts/test-admin-persistence-enable-approval-checklist.mjs`.
- `node scripts/test-admin-persistence-real-write-approval-proposal.mjs`.
- `node scripts/test-admin-persistence-staging-command-evidence-checklist.mjs`.
- `npm run lint`.
- `npm run build`.
- `npm run test:app-smoke-browser`.
- `npm run test:booking-ui-browser`.
- `git diff --check`.
- `git status --short`.

After any staging deployment, also verify the staging URL loads, no live provider/env keys are required, no custom domain/production promotion occurred, and no live activation area outside this packet changed.

## Rollback And Manual Recovery Plan

- Keep `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF by default.
- Before enabling, run a kill-switch OFF probe and confirm the write path returns the safe disabled response.
- Enable only for the approved staging window and only for the approved payload/path.
- Immediately turn the kill-switch OFF after the controlled save-load check.
- Run the kill-switch OFF probe again and confirm writes are closed.
- Record any controlled booking reference created during the approved test.
- If cleanup is needed, do not run destructive cleanup from this packet. Create a separate owner-approved cleanup plan with exact target rows and rollback evidence.
- If the app surface breaks, roll back to the previous successful preview deployment or revert the activation commit and redeploy preview only.
- If any secret is exposed, stop, revoke/rotate it, remove the exposure, and rerun the pre-activation suite before any further action.

## Must Not Be Activated In The Same Pass

- Provider/env activation or live sending for email, WhatsApp, SMS, or Telegram.
- Payment, PDF, billing, payout, payment links, invoice generation, or finance exposure.
- Customer/driver auth activation, session creation, or token issuing.
- FlightAware live lookup/scheduler.
- Live location, GPS capture, storage, customer map, or admin live map.
- OTS photo upload, Supabase Storage bucket/policies, photo viewer, or customer photo visibility.
- CRM/calendar amendment update/cancel, calendar sync, or job-card creation from customer amendment/cancellation.
- Risky shim write paths: `rate_settings`, full drivers write/delete, `customer_rates`, `driver_payout_rules`, pricing, payout, or rate override writes.

## Next Owner Decision

The next safe step is owner review of this packet. Any actual activation needs a separate approval packet naming the exact staging target, exact env changes, exact command/path, exact payload, exact rollback window, and exact evidence to collect.
