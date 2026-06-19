import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docPath = "docs/admin-completed-trip-closeout-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPath = "app/page.tsx";
const routePath = "app/api/admin-completed-booking-closeouts/route.ts";
const persistencePath = "lib/admin-completed-booking-closeout-persistence.ts";
const appSmokePath = "scripts/test-app-smoke-browser.mjs";
const bookingUiBrowserPath = "scripts/test-booking-ui-browser.mjs";
const mobileUsabilityBrowserPath = "scripts/test-mobile-usability-browser.mjs";
const apiContractPath = "scripts/test-admin-completed-booking-closeout-api-contract.mjs";
const backendAuditPath = "docs/backend-api-integration-audit.md";
const guardScript = "scripts/test-admin-completed-trip-closeout-existing-workflow-lock.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertNotMatches(source, pattern, label) {
  assert.doesNotMatch(source, pattern, `${label} must not match ${pattern}.`);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n## ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [
  doc,
  ledger,
  docsIndex,
  preactivationSuite,
  appPage,
  route,
  persistence,
  appSmoke,
  bookingUiBrowser,
  mobileUsabilityBrowser,
  apiContract,
  backendAudit,
] = await Promise.all([
  readFile(docPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(appSmokePath, "utf8"),
  readFile(bookingUiBrowserPath, "utf8"),
  readFile(mobileUsabilityBrowserPath, "utf8"),
  readFile(apiContractPath, "utf8"),
  readFile(backendAuditPath, "utf8"),
]);

for (const fragment of [
  "# Admin Completed Trip Closeout Existing Workflow Lock",
  "This document is docs/test-only.",
  "It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, new live reads, DB writes beyond the existing guarded completed closeout API path, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "The admin-only Day-of-Trip Completion Handoff and Completed Trip Closeout Review workflow already exists in the current app. Do not rebuild it as a duplicate workflow.",
  "`app/page.tsx` owns the existing local Day-of-Trip Completion Handoff at `data-admin-day-of-trip-completion-handoff`.",
  "`app/page.tsx` owns the existing Completed Trip Closeout Review at `data-admin-completed-trip-closeout-review`.",
  "`app/page.tsx` owns the existing completed closeout save/load path through `/api/admin-completed-booking-closeouts`.",
  "The existing closeout route is guarded by the admin/dispatcher boundary and supports closeout GET and status-only POST save/load behavior.",
  "The existing helper is `lib/admin-completed-booking-closeout-persistence.ts`.",
  "The existing persistence guard rejects finance, invoice, payment, PDF, payout, PayNow, notification, auth, live location, photo/proof, parser/debug, internal note, secret, mock QA, and dev archive fields.",
  "`scripts/test-app-smoke-browser.mjs` covers the Day-of-Trip Completion Handoff and Completed Trip Closeout Review across mobile and desktop viewports.",
  "`scripts/test-booking-ui-browser.mjs` covers guarded completed closeout GET/POST shape, existing closeout review save feedback, and forbidden request body fields.",
  "`scripts/test-mobile-usability-browser.mjs` covers compact mobile completion handoff, completed closeout review, completed-closeout API boundary, and no-horizontal-overflow behavior.",
  "`scripts/test-admin-completed-booking-closeout-api-contract.mjs` covers the guarded completed closeout API contract.",
  "`docs/backend-api-integration-audit.md` records `/api/admin-completed-booking-closeouts` as integrated for the existing completed trip closeout control.",
  "Future work must reuse the existing Completion Handoff and Completed Trip Closeout Review instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.",
  "Reuse the existing completion handoff, completed closeout review, and `/api/admin-completed-booking-closeouts` route.",
  "Keep completed closeout status-only unless a separate explicit approval changes that boundary.",
  "Keep invoice, PDF, payment, payout, PayNow payout, and billing automation blocked unless separately approved.",
  "Keep Save Booking + CRM on `POST /api/admin-bookings`.",
  "Keep `/api/admin-saved-bookings` separate and unchanged.",
  "Adding a new Completion Handoff or Completed Trip Closeout Review UI sector, button, card, route, helper, or shim.",
  "Expanding completed closeout into invoice/PDF/payment/payout/billing automation.",
  "Opening new persistence gates or executing new live DB writes outside the existing guarded completed closeout API path.",
  "The correct forward action is to stabilize or extend the existing workflow only after explicit owner approval, not to create a parallel workflow.",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.",
]) {
  assertIncludes(doc, fragment, `completed closeout lock doc fragment ${fragment}`);
}

for (const fragment of [
  'const adminCompletedBookingCloseoutApiPath = "/api/admin-completed-booking-closeouts";',
  "function adminCompletedBookingCloseoutFailureMessage",
  "function adminCompletedBookingCloseoutDisplayLabel",
  "async function loadAdminCompletedBookingCloseoutRecord",
  "function saveCompletedTripCloseoutReviewStatus",
  'data-admin-day-of-trip-completion-handoff="true"',
  'data-admin-day-of-trip-completion-handoff-controls="true"',
  'data-admin-day-of-trip-completion-handoff-note="true"',
  'data-admin-day-of-trip-completion-handoff-boundary="true"',
  'data-admin-completed-trip-closeout-review="true"',
  'data-admin-completed-trip-closeout-review-controls="true"',
  'data-admin-completed-trip-closeout-review-note="true"',
  'data-admin-completed-trip-closeout-review-feedback="true"',
  'data-admin-completed-trip-closeout-review-boundary="true"',
  "Completed Trip Closeout Review",
  "completed closeout API saves status only",
  "No Supabase write outside it; no live database access beyond that path",
  "Admin updated completed closeout from the existing closeout review control.",
]) {
  assertIncludes(appPage, fragment, `existing app completed closeout fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-day-of-trip-completion-handoff="true"', 1],
  ['data-admin-completed-trip-closeout-review="true"', 1],
  ['data-admin-completed-trip-closeout-review-boundary="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected one existing app completed closeout surface for ${fragment}`,
  );
}

for (const fragment of [
  "requireAdminDispatcherBoundary",
  "parseAdminCompletedBookingCloseoutLoadParams",
  "parseAdminCompletedBookingCloseoutSavePayload",
  "loadAdminCompletedBookingCloseout",
  "saveAdminCompletedBookingCloseout",
  "export async function GET",
  "export async function POST",
  "safeFailureResponse",
]) {
  assertIncludes(route, fragment, `completed closeout route fragment ${fragment}`);
}

for (const fragment of [
  "adminCompletedBookingCloseoutPersistenceVersion",
  "adminCompletedBookingCloseoutStatuses",
  "allowedCloseoutTopLevelFields",
  "allowedSafeContextFields",
  "forbiddenCloseoutFragments",
  "parseAdminCompletedBookingCloseoutSavePayload",
  "parseAdminCompletedBookingCloseoutLoadParams",
  "getServerOnlyCompletedBookingCloseoutSupabaseClient",
  'process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true"',
  '.from("completed_booking_closeouts")',
  ".upsert(row, { onConflict: \"booking_reference\" })",
  ".select(completedBookingCloseoutSelect)",
  '"customer_price"',
  '"driver_payout"',
  '"paynow"',
  '"invoice"',
  '"payment"',
  '"pdf"',
  '"payout"',
  '"notification"',
  '"live_location"',
  '"parser_debug"',
  '"internal_admin_note"',
  '"mock_qa"',
]) {
  assertIncludes(persistence, fragment, `completed closeout persistence fragment ${fragment}`);
}

for (const fragment of [
  "Day-of-Trip Completion Handoff",
  "Completed Trip Closeout Review",
  "[data-admin-day-of-trip-completion-handoff]",
  "[data-admin-completed-trip-closeout-review]",
  "expected completion handoff not to create horizontal overflow",
  "expected completed trip closeout boundary text",
  "completed closeout API",
]) {
  assertIncludes(appSmoke, fragment, `app smoke completed closeout fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-day-of-trip-completion-handoff='true']",
  "[data-admin-completed-trip-closeout-review='true']",
  "GET /api/admin-completed-booking-closeouts?booking_reference=ui-cleanup-load-fixture",
  "Expected saved booking load to GET completed closeout through the guarded API path",
  "Expected Completed Trip Closeout Review Ready Locally control to be clickable for completed closeout API save",
  "Expected completed closeout POST to use the safe guarded API shape",
  "Expected completed closeout request body to avoid private finance, invoice/payment, notification, parser, and secret fields",
]) {
  assertIncludes(bookingUiBrowser, fragment, `booking UI completed closeout fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-day-of-trip-completion-handoff='true']",
  "[data-admin-completed-trip-closeout-review='true']",
  "expected Day-of-Trip Completion Handoff section",
  "expected Completed Trip Closeout Review section",
  "expected Completed Trip Closeout Review completed-closeout API boundary",
  "expected Day-of-Trip Completion Handoff not to create horizontal overflow",
  "expected Completed Trip Closeout Review not to create horizontal overflow",
]) {
  assertIncludes(mobileUsabilityBrowser, fragment, `mobile completed closeout fragment ${fragment}`);
}

for (const fragment of [
  "parseAdminCompletedBookingCloseoutSavePayload",
  "saveAdminCompletedBookingCloseout",
  "http://localhost/api/admin-completed-booking-closeouts?booking_reference=SAFE-CLOSEOUT-001",
  "mock.client.operations[0].table",
  "Forbidden completed booking closeout fields rejected.",
  "Admin completed booking closeout API contract tests passed.",
]) {
  assertIncludes(apiContract, fragment, `completed closeout API contract fragment ${fragment}`);
}

for (const fragment of [
  "| `/api/admin-completed-booking-closeouts` | Integrated for the existing completed trip closeout control. | Expand closeout fields only through existing UI controls and contract tests. |",
]) {
  assertIncludes(backendAudit, fragment, `backend audit completed closeout fragment ${fragment}`);
}

const ledgerSection = sectionBetween(ledger, "## Admin Completed Trip Closeout Existing Workflow Lock");

for (const fragment of [
  "The existing admin-only Day-of-Trip Completion Handoff and Completed Trip Closeout Review workflow is locked by `docs/admin-completed-trip-closeout-existing-workflow-lock.md`.",
  "This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, new live reads, DB writes beyond the existing guarded completed closeout API path, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "Do not add a duplicate Completion Handoff or Completed Trip Closeout Review UI sector, button, card, route, helper, or shim.",
  "Existing surfaces are `data-admin-day-of-trip-completion-handoff` and `data-admin-completed-trip-closeout-review` in `app/page.tsx`.",
  "Existing completed closeout integration is `/api/admin-completed-booking-closeouts` through `lib/admin-completed-booking-closeout-persistence.ts` and remains guarded/status-only.",
  "Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, `scripts/test-mobile-usability-browser.mjs`, `scripts/test-admin-completed-booking-closeout-api-contract.mjs`, and `docs/backend-api-integration-audit.md`.",
  "Future approved changes must stabilize or extend the existing closeout workflow only, stay compact and colocated, keep invoice/PDF/payment/payout/billing automation blocked unless separately approved, and keep customer/driver privacy boundaries intact.",
  "This lock adds `scripts/test-admin-completed-trip-closeout-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger completed closeout lock fragment ${fragment}`);
}

for (const fragment of [
  "[Admin Completed Trip Closeout Existing Workflow Lock](admin-completed-trip-closeout-existing-workflow-lock.md)",
  "existing admin-only Day-of-Trip Completion Handoff, Completed Trip Closeout Review, guarded completed-closeout API integration, and no-duplicate rule",
]) {
  assertIncludes(docsIndex, fragment, `docs index completed closeout lock fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite completed closeout lock registration");

for (const [label, text] of [
  ["doc", doc],
  ["ledgerSection", ledgerSection],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(text, /```(?:bash|sql)/i, `${label} runnable shell or SQL block`);
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

console.log("Admin Completed Trip Closeout existing workflow lock passed");
