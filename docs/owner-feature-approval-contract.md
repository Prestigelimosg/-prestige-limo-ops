# Owner Feature Approval Contract

This contract locks the owner rule: do not add a new product feature unless the owner explicitly approves that feature.

It is docs/test-only. It does not approve runtime implementation, UI/API behavior change, new UI sectors, new buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.

## Not Feature Approval

The following phrases are not feature approval by themselves:

- `proceed`
- `move forward`
- `move to next`
- `next task`
- `keep moving`
- `continue`

Those phrases may authorize bounded read-only verification, docs clarification, test/guard hardening, bug fixing for already-approved work, staging smoke, review, or commit work. They do not authorize a new product surface, workflow, button, route, provider integration, database behavior, live send, or customer/driver-visible feature.

## Approval Required

A new feature needs explicit owner approval naming the actual feature or behavior before implementation starts.

The approval must identify:

- the feature scope;
- the user or role affected;
- the allowed UI/API/runtime behavior;
- the data that may be read, written, shown, or sent;
- the forbidden data that must remain blocked;
- required tests and rollback/reversal plan;
- whether staging smoke, deployment, env, DB, provider, or migration work is included.

If any of those are unclear, implementation must stop and ask for clarification before editing runtime code.

## Allowed Without New-Feature Approval

The following remain allowed when they are bounded and do not change product behavior:

- read-only code or docs audit;
- local test, lint, smoke, and guard execution;
- docs clarification that records the current approved boundary;
- test-only or docs-only guard hardening;
- bug fix for already-approved behavior;
- review and commit of the bounded verification/fix work.

These tasks must still obey the project privacy boundaries and must not activate live DB/write, migrations, deployment, provider sends, payment/PDF/pricing/payout/auth/location/photo/calendar behavior, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, UI sectors/buttons, or new shims unless separately approved.

## Public Visibility Boundary

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, mock QA/dev archive, raw driver issue reports, dispatcher exception notes, replacement-driver review notes, raw status event rows, token hashes, service-role/server-only details, live location coordinates outside an approved customer-safe handoff, photo/proof storage details, customer billing internals, invoices, payments, PDFs, pricing internals, or payout comparisons.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, mock QA/dev archive, dispatcher exception notes, replacement-driver review notes, customer billing/payment/PDF readiness, or customer-private portal/session internals.

## UI Boundary

Do not add a UI sector, card, or button unless the owner explicitly approves that exact UI behavior.

If a future approved UI change is needed, it must stay compact, colocated with the existing similar area, and protected by matching tests.

## Stop Rule

If a task would add a new feature and the owner has not explicitly approved that feature, stop before editing runtime code.

The safe forward move is to do read-only verification, define a docs/test-only approval packet, or ask for exact approval.
