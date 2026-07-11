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

# Pre-operation test-data permission

Until the owner explicitly declares that real operations have started, existing booking, driver, and customer records may be reused as test data because the owner will fully clean those records before live operations. Prefer reusing an existing test record over creating a duplicate, and keep every test scoped to the exact workflow under review.

This test-data permission does not authorize external sends or contacts without explicit action-time approval. It also does not authorize payment, payout, PayNow, invoice, billing, GPS, provider, authentication, environment, or Supabase configuration changes without the owner's specific approval. Customer and driver privacy boundaries remain mandatory, and testing must stop and report immediately when an issue is found.

# Verified PA identity implementation checkpoint

The operational admin booking persistence lane now supports nullable verified `company_id`, `booker_id`, and `traveler_id` fields already present in the established `bookings` schema. Do not recreate this persistence work, add another booking lane, or derive these IDs from names, email, phone, parser output, or display labels. The remaining work is explicit CRM selection and PA authentication/authorization on top of this existing identity persistence foundation.

Dispatch now has explicit verified company, PA/booker, and traveler selectors in the existing Booking Details section. They reuse the established rate-setup CRM list and operational save lane. Do not add a duplicate identity panel or infer selection from parser/display text.

The established allowlisted admin legacy-data route accepts PATCH from a verified same-origin admin/dispatcher server session so exact traveler `booker_id` links can be maintained. Do not broaden this exception to POST or DELETE, public/cross-origin callers, unsupported tables, or unsafe fields.

Customer access accounts have nullable verified `company_id` and unique non-null `booker_id` foundations. The legacy unique customer-account-reference index must remain until the existing `Copy + App Link` upsert is safely converted to booker identity. Never use company/account reference alone to authorize customer invoices or PA-private bookings.

Customer saved-booking reads support an additive verified `company_id + booker_id` scope. Both IDs are mandatory together; a partial pair must fail closed. Legacy sessions without either ID continue using the existing `customer_id` scope.
