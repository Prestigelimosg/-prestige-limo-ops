# Stage 4A-387 - Admin Persistence Staging Command And Evidence Checklist

Stage 4A-387 is a docs/test-only checklist that names the exact future staging command group, environment requirements, evidence steps, rollback steps, and stop conditions before any live staging write verification is attempted.

This checklist is not approval to run the proposed staging command group. This checklist is not approval to run Supabase commands. This checklist is not approval to perform live database writes. This checklist is not approval to create migrations. It does not activate persistence, expand APIs, expand auth, change runtime app behavior, change public/customer/driver UI behavior, or collect live staging write evidence.

## A. Approval Boundary

- William must explicitly approve each exact command line in the proposed future command group before any command is run.
- William must explicitly approve the exact future live staging write evidence collection stage before any write is attempted.
- No Supabase command may be run from Stage 4A-387.
- No migration may be created from Stage 4A-387.
- No live DB write may be performed from Stage 4A-387.
- No staging command in this checklist may be run by implication, convenience, prior approval, or partial approval.
- The first live staging verification, if William approves it later, must be limited to one controlled admin booking/customer save-load test.
- Production real writes remain blocked until a later production approval stage exists.

## B. Exact Proposed Future Command Group

The exact future command group to propose for a separate William-approved live staging evidence stage is:

`stage-4a-388-one-controlled-admin-booking-customer-save-load`

Do not run this command group in Stage 4A-387. The commands below are named only so William can review the exact future staging action before any live staging write verification is attempted.

No Supabase CLI command is proposed for the first controlled live staging verification. If future evidence later requires a Supabase command, William must explicitly approve that exact Supabase command before the first live staging write is attempted. `supabase db reset` must never be used.

### B1. Proposed future shell setup, not approved, not run

```bash
STAGE4A388_STAGING_BASE_URL="https://<approved-staging-admin-host>"
STAGE4A388_ADMIN_SESSION_TOKEN="<redacted-approved-staging-admin-session-token>"
STAGE4A388_BOOKING_REFERENCE="STAGE-4A-388-CONTROLLED-ADMIN-SAVE-LOAD-001"
STAGE4A388_SAFE_PAYLOAD='{"booking":{"booking_reference":"STAGE-4A-388-CONTROLLED-ADMIN-SAVE-LOAD-001","source_channel":"stage_4a_388_controlled_check","source_surface":"admin_api","pickup_datetime":"2026-06-15T09:30:00+08:00","pickup_at":"2026-06-15T09:30:00+08:00","pickup_location":"Stage 4A-388 controlled staging pickup","dropoff_location":"Stage 4A-388 controlled staging dropoff","route_type":"MNG","service_type":"airport_arrival","route_summary":"Stage 4A-388 controlled staging pickup > Stage 4A-388 controlled staging dropoff","customer_display_name":"Stage 4A-388 Controlled Customer","contact_display_name":"Stage 4A-388 Dispatcher Contact","contact_phone":"+6500004388","contact_email":"stage-4a-388@example.invalid","passenger_name":"Stage 4A-388 Passenger","passenger_phone":"+6500004389","pax_count":1,"luggage_count":1,"vehicle_type_or_category":"AVF","customer_facing_status":"review_required","admin_internal_status":"stage_verification_only","short_notice_review_status":"not_required","request_review_status":"admin_review_required","change_review_status":"not_requested","cancellation_review_status":"not_requested","parser_source_reference":"stage-4a-388-manual-controlled-payload"},"route_points":[{"point_type":"pickup","sequence_number":1,"location_text":"Stage 4A-388 controlled staging pickup"},{"point_type":"dropoff","sequence_number":2,"location_text":"Stage 4A-388 controlled staging dropoff"}],"service_items":[{"service_item_type":"child_seat","quantity":1,"notes":"Stage 4A-388 controlled safe service item"}]}'
```

### B2. Proposed future kill-switch OFF probe, not approved, not run

Run this only after William approves the future evidence stage and confirms the staging feature flag is OFF. Expected result: safe disabled response, no live write.

```bash
curl --fail-with-body --show-error --silent \
  --request POST "${STAGE4A388_STAGING_BASE_URL}/api/admin-bookings" \
  --header "content-type: application/json" \
  --header "origin: ${STAGE4A388_STAGING_BASE_URL}" \
  --header "referer: ${STAGE4A388_STAGING_BASE_URL}/" \
  --header "x-prestige-admin-purpose: admin-booking-persistence" \
  --header "x-prestige-admin-session-token: ${STAGE4A388_ADMIN_SESSION_TOKEN}" \
  --data-raw "${STAGE4A388_SAFE_PAYLOAD}" \
  | tee /tmp/stage-4a-388-kill-switch-off-redacted.json
```

### B3. Proposed future one controlled live staging save, not approved, not run

Run this only after William explicitly approves the same exact command and confirms staging has temporarily enabled `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED=true` for this one controlled check. Expected result: one controlled admin booking/customer save through `/api/admin-bookings`.

```bash
curl --fail-with-body --show-error --silent \
  --request POST "${STAGE4A388_STAGING_BASE_URL}/api/admin-bookings" \
  --header "content-type: application/json" \
  --header "origin: ${STAGE4A388_STAGING_BASE_URL}" \
  --header "referer: ${STAGE4A388_STAGING_BASE_URL}/" \
  --header "x-prestige-admin-purpose: admin-booking-persistence" \
  --header "x-prestige-admin-session-token: ${STAGE4A388_ADMIN_SESSION_TOKEN}" \
  --data-raw "${STAGE4A388_SAFE_PAYLOAD}" \
  | tee /tmp/stage-4a-388-controlled-save-redacted.json
```

### B4. Proposed future controlled staging load evidence, not approved, not run

Run this only after the approved single save returns a safe success response. Expected result: redacted load evidence showing the single controlled booking/customer save can be read back through the admin/dispatcher gate.

```bash
curl --fail-with-body --show-error --silent \
  --request GET "${STAGE4A388_STAGING_BASE_URL}/api/admin-bookings" \
  --header "origin: ${STAGE4A388_STAGING_BASE_URL}" \
  --header "referer: ${STAGE4A388_STAGING_BASE_URL}/" \
  --header "x-prestige-admin-purpose: admin-booking-persistence" \
  --header "x-prestige-admin-session-token: ${STAGE4A388_ADMIN_SESSION_TOKEN}" \
  | tee /tmp/stage-4a-388-controlled-load-redacted.json
```

### B5. Proposed future rollback OFF probe, not approved, not run

Run this only after William-approved evidence collection is complete and staging has turned `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF again. Expected result: safe disabled response, no live write.

```bash
curl --fail-with-body --show-error --silent \
  --request POST "${STAGE4A388_STAGING_BASE_URL}/api/admin-bookings" \
  --header "content-type: application/json" \
  --header "origin: ${STAGE4A388_STAGING_BASE_URL}" \
  --header "referer: ${STAGE4A388_STAGING_BASE_URL}/" \
  --header "x-prestige-admin-purpose: admin-booking-persistence" \
  --header "x-prestige-admin-session-token: ${STAGE4A388_ADMIN_SESSION_TOKEN}" \
  --data-raw "${STAGE4A388_SAFE_PAYLOAD}" \
  | tee /tmp/stage-4a-388-rollback-off-redacted.json
```

## C. Required Env And Config Checks

Before William approves the future command group, record all of these checks without exposing secrets:

- Confirm `STAGE4A388_STAGING_BASE_URL` points only at the approved staging admin host.
- Confirm no production host, production project, production database, or unknown target is present.
- Confirm `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` defaults OFF.
- Confirm `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED=true` is used only for the one William-approved controlled staging save window.
- Confirm the kill-switch is turning `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF.
- Confirm `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE=server-session-token`.
- Confirm `PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE` is `admin` or `dispatcher`.
- Confirm `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN` is a staging-only server-session token and is redacted from evidence.
- Confirm `PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL` identifies the William-approved staging verifier without including secrets.
- Confirm `SUPABASE_URL` is the approved staging server database URL.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is the approved staging server-only credential.
- Confirm no `NEXT_PUBLIC_` value, public anon key, placeholder, local URL, example URL, or copied docs value is used for server-only persistence.
- Confirm browser/client bundles cannot import server-only persistence modules.
- Confirm service-role/server-only secrets do not appear in browser code, client bundles, public JavaScript, API responses, logs, screenshots, commits, docs examples, or shared evidence.

## D. Required Preflight Checks

These checks must be green and recorded before any future live staging write evidence is collected:

- Confirm William reviewed this checklist.
- Confirm William explicitly approved `stage-4a-388-one-controlled-admin-booking-customer-save-load`.
- Confirm William explicitly approved each exact command line in Section B.
- Confirm no Supabase command is approved or needed for the first controlled save-load command group.
- Confirm no migration is approved or needed.
- Confirm the feature flag starts OFF.
- Confirm the kill-switch OFF probe returns the disabled safe response before enabling.
- Confirm the admin/dispatcher server-session gate is required.
- Confirm local-dev admin fallback cannot write while persistence is enabled.
- Confirm customer, public, driver, and anonymous paths remain blocked.
- Confirm customer booking request paths cannot become hidden admin persistence write paths.
- Confirm unsafe fields are rejected before adapter use.
- Confirm API responses do not expose secrets, env values, stack traces, SQL, Supabase internals, tokens, keys, credential names, or server-only module details.
- Confirm no customer auth, driver auth, notifications, billing, payment, invoice, PDF, payout, live-location, proof/photo, or parser-learning behavior is included.
- Confirm parser files, package scripts, `test:safe` membership, migrations, and public/customer/driver UI behavior are unchanged.
- Confirm staff have a manual operational fallback if the kill-switch closes.

These commands must be green before any future live staging write evidence is collected:

- `node scripts/test-admin-persistence-staging-command-evidence-checklist.mjs`.
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

## E. Controlled Save-Load Scope

The first live staging verification, if approved later, is limited to one controlled admin booking/customer save-load test:

- One staging-only booking reference: `STAGE-4A-388-CONTROLLED-ADMIN-SAVE-LOAD-001`.
- One safe admin POST to `/api/admin-bookings`.
- One safe admin GET from `/api/admin-bookings` to confirm the saved booking/customer can be loaded through the admin/dispatcher gate.
- Existing applied tables only: `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, and `audit_logs`.
- Safe operational fields only.
- No second booking, bulk import, update sweep, customer request conversion, driver assignment, payment workflow, notification workflow, or public/customer/driver workflow is included.

Safe operational fields are limited to the current adapter contract:

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
- Narrow create/load audit records for the approved admin persistence action.

## F. Blocked Surfaces And Unsafe Fields

Persistence defaults OFF. The kill-switch must close write paths immediately. The admin/dispatcher gate is required before any write reaches the server-only adapter. Customer, public, driver, and anonymous paths must remain blocked.

Unsafe fields must remain blocked before adapter use:

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

Forbidden feature scope for the first live staging verification:

- No customer auth.
- No driver auth.
- No notifications.
- No billing.
- No payment.
- No invoice.
- No PDF.
- No Stripe.
- No PayNow payout.
- No driver payout.
- No payout.
- No live-location.
- No proof/photo.
- No parser-learning.
- No parser file changes.
- No package script changes.
- No `test:safe` membership changes.
- No public/customer/driver UI behavior changes.

## G. Required Evidence To Collect

If William approves the future command group, collect only this redacted evidence:

- William's approval note for the exact future command group.
- The exact approved command lines, with secret values redacted.
- The exact staging environment and staging project target, with no secret values.
- Confirmation that the feature flag started OFF.
- The kill-switch OFF probe result showing writes closed before enabling.
- Confirmation that the temporary enabled window was staging-only.
- Confirmation that only an admin or dispatcher server-session gate was used.
- Confirmation that customer, public, driver, and anonymous requests remained blocked.
- Confirmation that the safe payload contained only approved operational fields.
- Confirmation that unsafe-field probes were rejected before adapter use.
- One controlled staging save result for `STAGE-4A-388-CONTROLLED-ADMIN-SAVE-LOAD-001`.
- One controlled staging load result proving the same booking/customer can be read back through `/api/admin-bookings`.
- Redacted database or dashboard evidence limited to `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, and `audit_logs`.
- Confirmation that no pricing, quoted price, driver payout, PayNow payout, invoice/payment/PDF, finance note, parser/debug internal, live-location/proof/photo, notification-send, mock archive, mock QA, mock workbench, customer auth, or driver auth field was written.
- Confirmation that turning the feature flag OFF after evidence collection closed write paths again.
- Confirmation that `npm run test:safe` passed after the feature flag was turned OFF.
- Final `git status --short` for the future approved stage.

Evidence must be redacted before it is shared. Do not share service-role values, session tokens, request tokens, database passwords, full env files, SQL error details, stack traces, Supabase internals, private customer data, or copied staging secrets.

## H. Required Rollback Steps

Rollback must be practiced and recorded in the future approved live staging write stage:

- Turn `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF.
- Confirm the rollback OFF probe returns the disabled safe response.
- Confirm admin create/update write attempts return the disabled safe response.
- Confirm customer, public, driver, and anonymous paths remain blocked.
- Confirm customer booking request paths cannot become hidden admin persistence write paths.
- Confirm unsafe-field probes are still rejected before adapter use.
- Confirm no Supabase client is created when the kill-switch is closed in mocked tests.
- Confirm no browser/client bundle can import server-only persistence modules.
- Run `node scripts/test-admin-booking-persistence-kill-switch.mjs`.
- Run `node scripts/test-admin-booking-controlled-real-write-enable.mjs`.
- Run `npm run test:safe`.
- Confirm `git status --short` is clean.
- Keep the manual staff fallback available until William approves any later production rollout.

## I. Stop Conditions

Abort the future live staging verification immediately if any stop condition appears:

- William approval is missing, ambiguous, or does not name `stage-4a-388-one-controlled-admin-booking-customer-save-load`.
- William approval does not include each exact command line from Section B.
- Any Supabase command is needed but lacks explicit William approval.
- Any migration is needed but lacks explicit William approval.
- The target environment is not confirmed as staging.
- Production or an unknown database target appears.
- `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` cannot be confirmed OFF before the check.
- The kill-switch OFF probe does not return the disabled safe response.
- The kill-switch fails to close write paths after evidence collection.
- The admin/dispatcher gate is bypassed.
- Local-dev admin fallback can write while persistence is enabled.
- Customer, public, driver, or anonymous paths can write admin persistence data.
- A customer booking request path becomes a hidden admin persistence write path.
- Unsafe fields reach the adapter or database layer.
- More than one controlled admin booking/customer save-load test is attempted.
- A server-only secret, service-role value, token, key, stack trace, SQL detail, Supabase internal, or env value appears in browser/client code, API responses, logs, screenshots, commits, docs examples, or shared evidence.
- Any customer auth, driver auth, notification, billing, payment, invoice, PDF, payout, live-location, proof/photo, or parser-learning behavior appears.
- Parser files, package scripts, `test:safe` membership, public/customer/driver UI behavior, schema, or migrations change unexpectedly.
- Any required test fails and cannot be fixed safely inside the approved future stage scope.

## J. Recommended Next Different Backend Workflow Step

Recommended next different backend workflow step:

Stage 4A-388 - William approval review for `stage-4a-388-one-controlled-admin-booking-customer-save-load`, with explicit approval or rejection of every named command before any live staging write verification is attempted.
