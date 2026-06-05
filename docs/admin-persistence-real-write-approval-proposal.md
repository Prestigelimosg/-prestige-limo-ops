# Stage 4A-384 - Admin Persistence Real-Write Approval Proposal

Stage 4A-384 is a docs-only proposal packet for William to review before any future real-write admin booking persistence stage is proposed.

This proposal is not approval to enable real writes. It does not activate persistence, expand APIs, expand auth, run Supabase commands, create migrations, or change runtime app behavior.

## A. Approval Boundary

- William must explicitly approve a separate future real-write stage before any real write path is enabled.
- Supabase commands require explicit William approval in that future stage.
- Migrations require explicit William approval in that future stage.
- This proposal does not approve staging writes, production writes, schema changes, API expansion, auth expansion, or browser/client behavior changes.
- First real-write enablement, if approved later, must be staging-only and controlled.
- Production real writes must remain blocked until a later production approval stage exists.

## B. Proposed Future Real-Write Scope

The first real-write stage, if William approves it later, should be limited to an internal admin/dispatcher booking persistence path in staging.

It may write only safe operational booking/customer data that already fits the approved adapter contract:

- `booking_reference`.
- `source_channel` and `source_surface`.
- `customer_id` only where already resolved by the approved server-side path.
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
- `created_at` and `updated_at`.
- Narrow create/update audit records for the approved admin persistence action.

The first real-write stage must not add customer auth, driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, parser-learning, API expansion, auth expansion, package-script changes, `test:safe` membership changes, parser file changes, or public/customer/driver UI behavior changes.

## C. Required Feature Flag And Environment Gates

- The persistence feature flag must default OFF.
- The write gate must be opened only in the approved staging environment.
- The staging server configuration must require a valid server database URL.
- The staging server configuration must require a valid server-only credential.
- Server-only credentials must not use public, anon, `NEXT_PUBLIC_`, placeholder, local, example, or copied documentation values.
- Service-role/server-only secrets must never be exposed to browser code, client bundles, public JavaScript, API responses, logs, screenshots, commits, or docs examples.
- Browser/client bundles must not import server-only persistence modules.

## D. Required Admin/Dispatcher Gate

- The admin/dispatcher gate must be required for every write.
- Ready config must not bypass the admin/dispatcher gate.
- Feature flag alone must not open persistence.
- Ready staging config alone must not open persistence.
- A valid admin/dispatcher session alone must not open persistence.
- Safe payload parsing alone must not open persistence.
- Local-dev admin fallback must not be treated as real-write approval.
- Customer, public, driver, and anonymous paths must remain blocked from admin booking persistence writes.
- Customer booking request paths must not become a hidden real-write enablement path.
- API responses must stay generic and must not reveal internal readiness secrets, stack traces, SQL, Supabase internals, server-only module details, tokens, keys, or credential names.

## E. Required Kill-Switch And Rollback Plan

- The kill-switch must remain available.
- The kill-switch must stay tested before and after any future real-write stage.
- Closing the kill-switch must close write paths immediately.
- Rollback must include turning the persistence feature flag OFF.
- Rollback must include confirming admin write paths return the disabled safe response.
- Rollback must include confirming customer, public, driver, and anonymous paths remain blocked.
- Rollback must include confirming no Supabase client is created when the kill-switch is closed.
- Rollback must include confirming `npm run test:safe` passes after the flag is turned OFF.
- Rollback must include preserving a manual operational fallback for staff.

## F. Unsafe Fields That Stay Forbidden

The future real-write stage must continue to reject or avoid these field families:

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

## G. Required Tests Before Any Future Real-Write Stage

Before any future real-write stage begins, these checks must be green:

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

## H. Required Tests During And After Any Future Real-Write Stage

The future real-write stage must re-run the same full gate list after implementation and before commit. It must also include targeted staging-only evidence that:

- Feature flag OFF closes write paths.
- Kill-switch closed closes write paths immediately.
- Admin and dispatcher sessions can pass only through the approved server-session gate.
- Customer, public, driver, and anonymous paths cannot create or update admin booking persistence data.
- Unsafe fields are rejected before a database client or write operation is reached.
- Service-role/server-only secrets do not appear in browser/client bundles, API responses, logs, screenshots, commits, or docs examples.
- No customer auth, driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning behavior was added.
- Parser files, package scripts, `test:safe` membership, and public/customer/driver UI behavior were not changed.

After commit, the future stage must run `npm run test:safe` again and confirm `git status --short` is clean.

## I. Future Approval Packet Requirements

A future William approval request must restate:

- The exact staging environment.
- The exact database/project target.
- The exact feature flag name and default OFF posture.
- The exact admin/dispatcher gate.
- The exact migration status and whether migrations are explicitly approved.
- The exact Supabase commands, if any are explicitly approved.
- The exact safe data scope.
- The exact forbidden data scope.
- The rollback/kill-switch steps.
- The full required test list.
- The commit and post-commit verification plan.

Until William explicitly approves that future packet, real-write persistence remains blocked.

## J. Recommended Next Different Backend Workflow Step

Recommended next different backend workflow step:

Stage 4A-385 - Read-only William approval review checkpoint for this proposal packet before any migration, Supabase command, API expansion, auth expansion, or real-write implementation stage.
