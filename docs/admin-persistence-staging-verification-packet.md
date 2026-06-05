# Stage 4A-386 - Admin Persistence Staging Verification Packet

Stage 4A-386 is a docs/test-only staging verification packet for the controlled admin booking persistence enablement path.

This packet is not approval to run Supabase commands. This packet is not approval to perform live writes. This packet is not approval to create migrations. It does not activate persistence, expand APIs, expand auth, change runtime app behavior, or collect live staging write evidence.

## A. Approval Boundary

- William must explicitly approve any future live staging write evidence collection.
- Supabase commands require explicit William approval.
- Migrations require explicit William approval.
- Live staging writes require explicit William approval in a separate future stage.
- This packet does not approve staging writes, production writes, schema changes, API expansion, auth expansion, browser/client behavior changes, or package-script changes.
- Production real writes remain blocked until a later production approval stage exists.

## B. Current Controlled State

- The controlled admin persistence write path exists.
- The controlled write path uses the existing applied tables only: `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, and `audit_logs`.
- The controlled write path remains server-only.
- `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` must default OFF.
- The kill-switch is the persistence feature flag; turning `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` off must close write paths immediately.
- The admin/dispatcher gate is required before any write can reach the server-only adapter.
- Ready staging configuration must not bypass the admin/dispatcher gate.
- Customer, public, driver, and anonymous paths must remain blocked from admin booking persistence writes.
- Customer booking request paths must not become a hidden admin persistence write enablement path.
- Browser/client bundles must not import server-only persistence modules.
- Service-role/server-only secrets must never be exposed to browser code, client bundles, public JavaScript, API responses, logs, screenshots, commits, docs examples, or support notes.

## C. Safe Data Scope

A future live staging write, if William explicitly approves it later, may cover only the existing safe operational adapter scope:

- `booking_reference`.
- `source_channel` and `source_surface`.
- `customer_id` only where resolved by the approved server-only path.
- `pickup_datetime` and `pickup_at`.
- `pickup_location`.
- `dropoff_location`.
- `route_type` and `service_type`.
- `route_summary`.
- `customer_display_name`.
- `contact_display_name`.
- `contact_phone`.
- `contact_email`.
- `passenger_name`.
- `passenger_phone`.
- `pax_count`.
- `luggage_count`.
- `vehicle_type_or_category`.
- `customer_facing_status`.
- `admin_internal_status`.
- `short_notice_review_status`.
- `request_review_status`.
- `change_review_status`.
- `cancellation_review_status`.
- `parser_source_reference`.
- Route points and stops.
- Service items for child seat, extra stop, waiting time, and midnight charge.
- Narrow create/update audit records for the approved admin persistence action.

Unsafe fields must remain blocked before adapter use.

## D. Forbidden Feature Scope

The staging verification packet and any later first live staging write evidence collection must not add or exercise:

- Customer auth.
- Driver auth.
- Notifications.
- Billing.
- Payment.
- Invoice.
- PDF.
- Stripe.
- PayNow payout.
- Driver payout.
- Live-location.
- Proof/photo.
- Parser-learning.
- Parser file changes.
- Package script changes.
- `test:safe` membership changes.
- Public/customer/driver UI behavior changes.

The following field families must remain rejected or absent before adapter use:

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

## E. Required Preflight Before Any Future Live Staging Write

Before William approves any future live staging write evidence collection, all of these preflight checks must be complete and recorded:

- Confirm this packet has been reviewed by William.
- Confirm William explicitly approves the exact future live staging write evidence collection stage.
- Confirm William explicitly approves any Supabase command needed for that future stage.
- Confirm William explicitly approves any migration if a migration is proposed; otherwise confirm no migration is allowed.
- Confirm the exact staging environment and staging project target are named without exposing secrets.
- Confirm no production project or production database is targeted.
- Confirm `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` defaults OFF before the live check begins.
- Confirm the kill-switch has been tested with the feature flag OFF.
- Confirm admin/dispatcher server-session mode is required.
- Confirm local-dev admin fallback is not accepted for enabled writes.
- Confirm customer, public, driver, and anonymous paths remain blocked.
- Confirm unsafe fields are rejected before adapter use.
- Confirm browser/client bundles cannot import server-only write enablement code.
- Confirm failure responses do not expose secrets, env values, stack traces, SQL, Supabase internals, tokens, keys, or server-only details.
- Confirm no customer auth, driver auth, notifications, billing, payment, invoice, PDF, payout, live-location, proof/photo, or parser-learning behavior is included.
- Confirm parser files, package scripts, `test:safe` membership, and public/customer/driver UI behavior are unchanged.
- Confirm staff have a manual operational fallback if the kill-switch is closed.

These commands must be green before any future live staging write evidence is collected:

- `node scripts/test-admin-persistence-staging-verification-packet.mjs`.
- `node scripts/test-admin-booking-controlled-real-write-enable.mjs`.
- `node scripts/test-admin-persistence-real-write-approval-proposal.mjs`.
- `node scripts/test-admin-persistence-enable-approval-checklist.mjs`.
- `node scripts/test-admin-booking-persistence-enable-readiness.mjs`.
- `node scripts/test-admin-booking-persistence-kill-switch.mjs`.
- `node scripts/test-admin-booking-persistence-staging-config.mjs`.
- `node scripts/test-admin-booking-persistence-api-gate.mjs`.
- `node scripts/test-admin-booking-supabase-adapter-contract.mjs`.
- `npm run test:booking-ui-browser`.
- `npm run test:driver-job-page-browser`.
- `npm run test:parser`.
- `npm run lint`.
- `npm run build`.
- `npm run test:app-smoke-browser`.
- `npm run test:mobile-usability-browser`.
- `npm run test:safe`.
- `git diff --check`.
- `git status --short`.

## F. Exact Evidence For A Future Approved Live Staging Write

If William explicitly approves a future live staging write evidence collection stage, collect only this evidence:

- The William approval note for that exact future stage.
- The exact staging environment and staging project target, redacted so no service-role/server-only secret is exposed.
- Confirmation that the feature flag started OFF.
- Confirmation that the kill-switch OFF state blocked admin writes before enabling.
- Confirmation that customer, public, driver, and anonymous requests were blocked before enabling.
- Confirmation that only an admin or dispatcher server-session gate was used.
- Confirmation that the safe payload contained only approved operational fields.
- Confirmation that unsafe-field probes were rejected before adapter use.
- One controlled staging create or update result, using a staging-only booking reference chosen for this verification.
- Redacted API response evidence that contains no secret, token, stack trace, SQL, Supabase internals, or server-only detail.
- Redacted database evidence limited to the existing tables: `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, and `audit_logs`.
- Confirmation that no pricing, payout, PayNow, invoice/payment/PDF, finance note, parser/debug internal, live-location/proof/photo, notification-send, mock archive, mock QA, mock workbench, customer auth, or driver auth field was written.
- Confirmation that turning the feature flag OFF after the evidence collection closed write paths again.
- Confirmation that `npm run test:safe` passed after the feature flag was turned OFF.
- Final `git status --short` for the future stage.

Evidence must be redacted before it is shared. Do not share service-role values, session tokens, request tokens, database passwords, full env files, SQL error details, stack traces, or private customer data.

## G. Required Rollback Steps

Rollback must be practiced and recorded in the future approved live staging write stage:

- Turn `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF.
- Confirm admin create/update write attempts return the disabled safe response.
- Confirm customer, public, driver, and anonymous paths remain blocked.
- Confirm unsafe-field probes are still rejected before adapter use.
- Confirm no Supabase client is created when the kill-switch is closed in mocked tests.
- Confirm no browser/client bundle can import server-only persistence modules.
- Run `node scripts/test-admin-booking-persistence-kill-switch.mjs`.
- Run `node scripts/test-admin-booking-controlled-real-write-enable.mjs`.
- Run `npm run test:safe`.
- Confirm `git status --short` is clean.
- Keep the manual staff fallback available until William approves any later production rollout.

## H. Stop Conditions

Abort the future live staging verification immediately if any stop condition appears:

- William approval is missing, ambiguous, or does not name the exact live staging write evidence collection.
- Any Supabase command is needed but lacks explicit William approval.
- Any migration is needed but lacks explicit William approval.
- The target environment is not confirmed as staging.
- Production or an unknown database target appears.
- `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` cannot be confirmed OFF before the check.
- The kill-switch fails to close write paths.
- The admin/dispatcher gate is bypassed.
- Local-dev admin fallback can write while persistence is enabled.
- Customer, public, driver, or anonymous paths can write admin persistence data.
- A customer booking request path becomes a hidden admin persistence write path.
- Unsafe fields reach the adapter or database layer.
- A server-only secret, service-role value, token, key, stack trace, SQL detail, Supabase internal, or env value appears in browser/client code, API responses, logs, screenshots, commits, docs examples, or shared evidence.
- Any customer auth, driver auth, notification, billing, payment, invoice, PDF, payout, live-location, proof/photo, or parser-learning behavior appears.
- Parser files, package scripts, `test:safe` membership, public/customer/driver UI behavior, schema, or migrations change unexpectedly.
- Any required test fails and cannot be fixed safely inside the approved future stage scope.

## I. Recommended Next Different Backend Workflow Step

Recommended next different backend workflow step:

Stage 4A-387 - William-approved staging command and evidence checklist, explicitly naming any Supabase command before a single live staging write verification is attempted.
