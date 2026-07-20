<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mandatory startup and no-duplicate workflow

Before proposing, testing, or editing a feature:

1. Read `docs/current-implementation-ledger.md` as the current implementation source of truth.
2. Run `git status --short --branch` and `git log --oneline -10` to identify the branch, uncommitted work, and recently completed fixes.
3. Search the existing app, routes, docs, and focused guard scripts for the requested workflow before proposing a new implementation.
4. Run the existing focused guard before changing the workflow. Treat documented behavior with a passing guard as already implemented unless the exact workflow is reproduced as broken in the approved runtime surface.
5. Do not add a second lane, panel, route, helper, button, or write path for an existing workflow. Repair the established lane in place and preserve its wired consumers.
6. Record every approved fix in the implementation ledger and protect it with a focused regression guard so later agents can distinguish completed work from a newly reproduced failure.
7. Before committing an application change, stage the bounded files and run `npm run guard:staged-app-change`. Do not commit until the staged application change includes both `docs/current-implementation-ledger.md` and an appropriate focused `scripts/test-*.mjs` guard update.

Follow TEST → FIX → REVIEW → COMMIT in one bounded pass. Do not claim runtime behavior works from source inspection or a passing guard alone.

# Verified workflow preservation lock

Everything recorded as completed, deployed, live, or verified in `docs/current-implementation-ledger.md` is an established workflow contract. Do not remove, rename, reorganize, broaden, redesign, reset, reimplement, or “improve” that behavior unless the exact workflow is first reproduced as broken in the approved runtime surface and the owner approves the bounded repair. If no defect is reproduced, make no application change.

Any approved repair must stay inside the existing lane and preserve its established UI location, controls, routes, API and persistence boundaries, consumers, privacy exclusions, and focused regression guards. Do not use an unrelated request as permission to alter another completed workflow.

The Dashboard `Today's Jobs` Driver Reports completion workflow is specifically locked: a persisted driver `Job Completed`/JC report remains visible evidence and must not automatically close the card, mark the saved booking completed, create a Completed / History fallback row, or enable archived-job deletion. Only the existing explicit `Admin confirm completed` action may move the saved booking to Completed / History. The card must remain visible and refreshable with OTW, OTS, POB, and JC evidence until that admin action succeeds. Preserve `scripts/test-admin-active-job-confirm-completed-guard.mjs`, `scripts/test-driver-completed-history-grouping-guard.mjs`, and the corresponding `scripts/test-booking-ui-browser.mjs` coverage.

The Driver Calendar system is a separate established workflow. Do not change its action, OAuth, event, credential, route, or UI behavior while diagnosing or repairing Driver Reports or admin completion.

# Pre-operation test-data permission

Until the owner explicitly declares that real operations have started, existing booking, driver, and customer records may be reused as test data because the owner will fully clean those records before live operations. Prefer reusing an existing test record over creating a duplicate, and keep every test scoped to the exact workflow under review.

This test-data permission does not authorize external sends or contacts without explicit action-time approval. It also does not authorize payment, payout, PayNow, invoice, billing, GPS, provider, authentication, environment, or Supabase configuration changes without the owner's specific approval. Customer and driver privacy boundaries remain mandatory, and testing must stop and report immediately when an issue is found.

# Verified PA identity implementation checkpoint

The operational admin booking persistence lane now supports nullable verified `company_id`, `booker_id`, and `traveler_id` fields already present in the established `bookings` schema. Do not recreate this persistence work, add another booking lane, or derive these IDs from names, email, phone, parser output, or display labels. The remaining work is explicit CRM selection and PA authentication/authorization on top of this existing identity persistence foundation.

Dispatch now has explicit verified company, PA/booker, and traveler selectors in the existing Booking Details section. They reuse the established rate-setup CRM list and operational save lane. Do not add a duplicate identity panel or infer selection from parser/display text.

The established allowlisted admin legacy-data route accepts PATCH from a verified same-origin admin/dispatcher server session so exact traveler `booker_id` links can be maintained. Do not broaden this exception to POST or DELETE, public/cross-origin callers, unsupported tables, or unsafe fields.

Customer access accounts have nullable verified `company_id` and unique non-null `booker_id` foundations. The legacy unique customer-account-reference index must remain until the existing `Copy + App Link` upsert is safely converted to booker identity. Never use company/account reference alone to authorize customer invoices or PA-private bookings.

Customer saved-booking reads support an additive verified `company_id + booker_id` scope. Both IDs are mandatory together; a partial pair must fail closed. Legacy sessions without either ID continue using the existing `customer_id` scope.

Reference-bearing customer sessions hydrate verified company/booker IDs only from the validated active `customer_access_accounts` row. Do not trust client-supplied identity IDs.

Customer invoice records have an additive nullable `booker_id` schema foundation. Do not enable customer booker-scoped invoice reads until invoice issuance persists verified `booker_id`; company/customer identity alone is never sufficient for PA-private invoices.

Admin invoice preparation carries nullable verified company/booker IDs from the exact saved booking. Do not infer these IDs from billing labels or account-scope display text.

Customer invoice list/PDF reads require validated access-account `customer_id + booker_id` whenever the active account has a booker. Never accept customer-supplied booker scope or fall back to company-wide invoices for a verified PA.

# Completed customer/driver messaging lane — do not duplicate

The customer/driver/admin in-app messaging workflow is implemented and live in the established lane. Before changing it, read `docs/current-implementation-ledger.md` sections `Single-Booking Customer/Driver Quick-Reply Production Activation`, `Today’s Jobs Admin-to-Driver Messages`, `Driver-to-Customer One-Tap Replies`, `Customer-to-Driver One-Tap Replies`, and `Today’s Jobs Unified Message History`, then run the focused guards named there.

Do not add another chat page, message panel, route, table, composer, notification format, customer session lane, driver-token lane, provider send, or polling path. Repair these established consumers in place:

- Admin: the existing `Messages` card inside Dashboard `Today’s Jobs`.
- Driver: the existing token-scoped Driver Job page and `/api/driver-job/[token]/quick-replies` plus token-scoped notification read.
- Customer: the existing authenticated My Bookings detail and `/api/customer-driver-quick-replies` plus `customer_app` notification read.
- Persistence/admin visibility: the existing `customer_driver_app_notification_outbox` and `/api/admin-customer-driver-app-notifications`.

Privacy remains mandatory: customers must never see Admin ↔ Driver messages; admin must see Customer ↔ Driver messages; customer reads remain `customer_app` only; driver reads remain `driver_app` only. Customer/driver replies stay fixed-template, exact-booking scoped, authenticated/link-bound, and blocked after POB/completion. No Email, WhatsApp, SMS, Telegram, or other external provider send is part of this lane.
