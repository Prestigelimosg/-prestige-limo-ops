import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docPath = "docs/admin-day-of-trip-dispatch-monitor-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPath = "app/page.tsx";
const routePath = "app/api/admin-driver-job-statuses/route.ts";
const readHelperPath = "lib/admin-driver-job-status-read.ts";
const appSmokePath = "scripts/test-app-smoke-browser.mjs";
const bookingUiBrowserPath = "scripts/test-booking-ui-browser.mjs";
const mobileUsabilityBrowserPath = "scripts/test-mobile-usability-browser.mjs";
const backendAuditPath = "docs/backend-api-integration-audit.md";
const guardScript = "scripts/test-admin-day-of-trip-dispatch-monitor-existing-workflow-lock.mjs";

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
  readHelper,
  appSmoke,
  bookingUiBrowser,
  mobileUsabilityBrowser,
  backendAudit,
] = await Promise.all([
  readFile(docPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(readHelperPath, "utf8"),
  readFile(appSmokePath, "utf8"),
  readFile(bookingUiBrowserPath, "utf8"),
  readFile(mobileUsabilityBrowserPath, "utf8"),
  readFile(backendAuditPath, "utf8"),
]);

for (const fragment of [
  "# Admin Day-of-Trip Dispatch Monitor Existing Workflow Lock",
  "This document is docs/test-only.",
  "It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads beyond the existing guarded admin read path, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "The admin-only Day-of-Trip Dispatch Monitor already exists in the current app. Do not rebuild it as a duplicate workflow.",
  "`app/page.tsx` owns the existing compact Day-of-Trip Dispatch Monitor at `data-admin-day-of-trip-dispatch-monitor`.",
  "`app/page.tsx` owns the existing local progress controls at `data-admin-day-of-trip-dispatch-monitor-option`.",
  "`app/page.tsx` owns the existing saved driver status readout at `data-admin-driver-job-status-readout`.",
  "The existing saved driver status route is `/api/admin-driver-job-statuses`.",
  "The existing route is GET-only and read-only for admin monitoring.",
  "The existing helper is `lib/admin-driver-job-status-read.ts`.",
  "Driver token writes stay on the tokenized driver job route, not this admin monitor route.",
  "`scripts/test-app-smoke-browser.mjs` covers the Day-of-Trip Dispatch Monitor, saved driver status readout, compact layout, route boundary, and no-horizontal-overflow behavior across mobile and desktop viewports.",
  "`scripts/test-booking-ui-browser.mjs` covers the guarded saved booking load GET to `/api/admin-driver-job-statuses`, the safe request shape, and the existing readout rendering.",
  "`scripts/test-mobile-usability-browser.mjs` covers compact mobile Day-of-Trip Dispatch Monitor controls, rows, saved driver status readout, and no-horizontal-overflow boundaries.",
  "`docs/backend-api-integration-audit.md` records `/api/admin-driver-job-statuses` as integrated read-only in the existing Day-of-Trip Dispatch Monitor.",
  "Future work must reuse the existing Day-of-Trip Dispatch Monitor instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.",
  "Reuse the existing monitor, saved driver status readout, and `/api/admin-driver-job-statuses` read route.",
  "Keep the admin route read-only for monitoring unless a separate explicit approval changes that boundary.",
  "Keep driver token writes on the tokenized driver job route.",
  "Stay compact and colocated with the current dispatch/admin workflow controls.",
  "Keep Save Booking + CRM on `POST /api/admin-bookings`.",
  "Keep `/api/admin-saved-bookings` separate and unchanged.",
  "Adding a new Day-of-Trip Dispatch Monitor UI sector, button, card, route, helper, or shim.",
  "Adding writes, provider sends, or direct live database access outside the existing guarded admin read path.",
  "The correct forward action is to stabilize or extend the existing workflow only after explicit owner approval, not to create a parallel workflow.",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.",
]) {
  assertIncludes(doc, fragment, `day-of-trip monitor lock doc fragment ${fragment}`);
}

for (const fragment of [
  'const adminDriverJobStatusesApiPath = "/api/admin-driver-job-statuses";',
  "function adminDriverJobStatusFailureMessage",
  "function adminDriverJobStatusDisplayLabel",
  "function adminDriverJobStatusTimeLabel",
  "async function loadAdminDriverJobStatusRead",
  "const dayOfTripDispatchMonitorOptions:",
  "const dayOfTripDispatchMonitorItems:",
  'data-admin-day-of-trip-dispatch-monitor="true"',
  'data-admin-day-of-trip-dispatch-monitor-status="true"',
  'data-admin-day-of-trip-dispatch-monitor-context="true"',
  'data-admin-day-of-trip-dispatch-monitor-controls="true"',
  "data-admin-day-of-trip-dispatch-monitor-option={option.value}",
  "data-admin-day-of-trip-dispatch-monitor-item={item.key}",
  'data-admin-driver-job-status-readout="true"',
  'data-admin-day-of-trip-dispatch-monitor-boundary="true"',
  "Local day-of-trip bridge from release to job progress.",
  "Saved driver status reads use the guarded admin driver-status API.",
  "Live location is opened from",
  "the Dashboard Live Dispatch Map for active jobs only.",
  "billing, payment, PDF, payout, parser-learning, or broad tracking behavior.",
]) {
  assertIncludes(appPage, fragment, `existing app day-of-trip monitor fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-day-of-trip-dispatch-monitor="true"', 1],
  ['data-admin-driver-job-status-readout="true"', 1],
  ['data-admin-day-of-trip-dispatch-monitor-boundary="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected one existing app Day-of-Trip Dispatch Monitor surface for ${fragment}`,
  );
}

for (const fragment of [
  "requireAdminDispatcherBoundary",
  "adminDispatcherBoundaryToPersistenceAdapterActor",
  "loadAdminDriverJobStatuses",
  "export async function GET",
  "safeFailureResponse",
]) {
  assertIncludes(route, fragment, `admin driver job statuses route fragment ${fragment}`);
}

assertNotMatches(
  route,
  /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/,
  "admin driver job statuses route extra mutating method",
);

for (const fragment of [
  "export const adminDriverJobStatusReadVersion",
  "parseAdminDriverJobStatusReadParams",
  "loadAdminDriverJobStatuses",
  "getServerOnlyAdminDriverJobStatusSupabaseClient",
  'process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true"',
  'const driverJobStatusEventSelect =',
  '.from("driver_job_status_events")',
  ".select(driverJobStatusEventSelect)",
  '.eq("booking_reference", parsed.data.booking_reference)',
  '.order("occurred_at", { ascending: false })',
  ".limit(parsed.data.limit)",
  '"customer_price"',
  '"driver_payout"',
  '"paynow"',
  '"billing"',
  '"invoice"',
  '"payment"',
  '"parser_debug"',
  '"internal_admin_note"',
  '"token"',
]) {
  assertIncludes(readHelper, fragment, `admin driver job status read helper fragment ${fragment}`);
}

assertNotMatches(
  readHelper,
  /\.(insert|upsert|update|delete)\s*\(/,
  "admin driver job status read helper write operation",
);

for (const fragment of [
  "Day-of-Trip Dispatch Monitor",
  "[data-admin-day-of-trip-dispatch-monitor]",
  "[data-admin-driver-job-status-readout]",
  "expected saved driver status readout inside day-of-trip monitor",
  "expected no private/customer/driver forbidden text in day-of-trip monitor",
  "expected compact day-of-trip monitor",
  "expected day-of-trip monitor not to create horizontal overflow",
  "Expected applied snapshot load to show saved driver status through the existing Day-of-Trip Dispatch Monitor",
]) {
  assertIncludes(appSmoke, fragment, `app smoke day-of-trip monitor fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-day-of-trip-dispatch-monitor='true']",
  "[data-admin-driver-job-status-readout='true']",
  "GET /api/admin-driver-job-statuses?booking_reference=ui-cleanup-load-fixture&limit=4",
  "Expected saved booking load to GET saved driver status through the guarded read API path",
  "Expected saved driver status readout in the existing Day-of-Trip Dispatch Monitor",
  "Expected driver status read request shape to avoid private finance, parser, secret, and token/link internals",
]) {
  assertIncludes(bookingUiBrowser, fragment, `booking UI day-of-trip monitor fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-day-of-trip-dispatch-monitor='true']",
  "[data-admin-driver-job-status-readout='true']",
  "expected Day-of-Trip Dispatch Monitor section",
  "expected Day-of-Trip Dispatch Monitor local status controls",
  "expected saved driver status readout inside Day-of-Trip Dispatch Monitor",
  "expected Day-of-Trip Dispatch Monitor controls to stay readable",
  "expected compact Day-of-Trip Dispatch Monitor",
  "expected Day-of-Trip Dispatch Monitor not to create horizontal overflow",
]) {
  assertIncludes(mobileUsabilityBrowser, fragment, `mobile day-of-trip monitor fragment ${fragment}`);
}

for (const fragment of [
  "| `/api/admin-driver-job-statuses` | Integrated read-only in the existing Day-of-Trip Dispatch Monitor. | Keep read-only for admin monitoring; driver token writes stay on the tokenized route. |",
]) {
  assertIncludes(backendAudit, fragment, `backend audit day-of-trip monitor fragment ${fragment}`);
}

const ledgerSection = sectionBetween(ledger, "## Admin Day-of-Trip Dispatch Monitor Existing Workflow Lock");

for (const fragment of [
  "The existing admin-only Day-of-Trip Dispatch Monitor workflow is locked by `docs/admin-day-of-trip-dispatch-monitor-existing-workflow-lock.md`.",
  "This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads beyond the existing guarded admin read path, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "Do not add a duplicate Day-of-Trip Dispatch Monitor UI sector, button, card, route, helper, or shim.",
  "Existing surfaces are `data-admin-day-of-trip-dispatch-monitor`, `data-admin-day-of-trip-dispatch-monitor-option`, and `data-admin-driver-job-status-readout` in `app/page.tsx`.",
  "Existing saved driver status integration is GET-only `/api/admin-driver-job-statuses` through `lib/admin-driver-job-status-read.ts`; driver token writes stay on the tokenized driver job route.",
  "Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, `scripts/test-mobile-usability-browser.mjs`, and `docs/backend-api-integration-audit.md`.",
  "Future approved changes must stabilize or extend the existing monitor only, stay compact and colocated, keep the admin route read-only unless separately approved, and keep customer/driver privacy boundaries intact.",
  "This lock adds `scripts/test-admin-day-of-trip-dispatch-monitor-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger day-of-trip monitor lock fragment ${fragment}`);
}

for (const fragment of [
  "[Admin Day-of-Trip Dispatch Monitor Existing Workflow Lock](admin-day-of-trip-dispatch-monitor-existing-workflow-lock.md)",
  "existing admin-only Day-of-Trip Dispatch Monitor, saved driver status readout, GET-only driver-status API integration, and no-duplicate rule",
]) {
  assertIncludes(docsIndex, fragment, `docs index day-of-trip monitor lock fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite day-of-trip monitor lock registration");

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

console.log("Admin Day-of-Trip Dispatch Monitor existing workflow lock passed");
