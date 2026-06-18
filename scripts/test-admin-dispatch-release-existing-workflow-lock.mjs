import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docPath = "docs/admin-dispatch-release-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPath = "app/page.tsx";
const routePath = "app/api/admin-booking-workflow-statuses/route.ts";
const workflowStatusPersistencePath = "lib/admin-booking-workflow-status-persistence.ts";
const appSmokePath = "scripts/test-app-smoke-browser.mjs";
const bookingUiBrowserPath = "scripts/test-booking-ui-browser.mjs";
const mobileUsabilityBrowserPath = "scripts/test-mobile-usability-browser.mjs";
const apiContractPath = "scripts/test-admin-booking-workflow-status-api-contract.mjs";
const guardScript = "scripts/test-admin-dispatch-release-existing-workflow-lock.mjs";

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
  workflowStatusPersistence,
  appSmoke,
  bookingUiBrowser,
  mobileUsabilityBrowser,
  apiContract,
] = await Promise.all([
  readFile(docPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(workflowStatusPersistencePath, "utf8"),
  readFile(appSmokePath, "utf8"),
  readFile(bookingUiBrowserPath, "utf8"),
  readFile(mobileUsabilityBrowserPath, "utf8"),
  readFile(apiContractPath, "utf8"),
]);

for (const fragment of [
  "# Admin Dispatch Release Existing Workflow Lock",
  "This document is docs/test-only.",
  "It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "The admin-only Dispatch Release workflow already exists in the current app. Do not rebuild it as a duplicate workflow.",
  "`app/page.tsx` owns the existing compact Dispatch Release checklist at `data-admin-dispatch-release-checklist`.",
  "`app/page.tsx` owns the existing mark-ready control at `data-admin-dispatch-release-mark-ready`.",
  "`app/page.tsx` owns the existing Dispatch Release Handoff Packet at `data-admin-dispatch-release-handoff-packet`.",
  "The existing workflow status route is `/api/admin-booking-workflow-statuses`.",
  "The existing workflow area is `dispatch_release`.",
  "The existing saved status label is `Ready for dispatch release`.",
  "`scripts/test-app-smoke-browser.mjs` covers the Dispatch Release checklist and handoff packet across mobile and desktop viewports.",
  "`scripts/test-booking-ui-browser.mjs` covers the guarded workflow-status GET/POST shape for dispatch release and verifies forbidden finance, notification, parser, secret, and token fields are absent from request bodies.",
  "`scripts/test-mobile-usability-browser.mjs` covers the compact mobile Dispatch Release handoff packet and no-horizontal-overflow boundary.",
  "`scripts/test-admin-booking-workflow-status-api-contract.mjs` covers the guarded workflow-status API contract.",
  "Future work must reuse the existing Dispatch Release workflow instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.",
  "Reuse the existing checklist, handoff packet, and workflow-status API route.",
  "Stay compact and colocated with the current dispatch/admin workflow controls.",
  "Keep Save Booking + CRM on `POST /api/admin-bookings`.",
  "Keep `/api/admin-saved-bookings` separate and unchanged.",
  "Adding a new Dispatch Release UI sector, button, card, route, helper, or shim.",
  "Opening persistence gates or executing new live DB writes.",
  "The correct forward action is to stabilize or extend the existing workflow only after explicit owner approval, not to create a parallel workflow.",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.",
]) {
  assertIncludes(doc, fragment, `dispatch release lock doc fragment ${fragment}`);
}

for (const fragment of [
  'const adminWorkflowStatusApiPath = "/api/admin-booking-workflow-statuses";',
  'const adminDispatchReleaseWorkflowArea = "dispatch_release";',
  'data-admin-dispatch-release-checklist="true"',
  'data-admin-dispatch-release-mark-ready="true"',
  'data-admin-dispatch-release-handoff-packet="true"',
  'data-admin-dispatch-release-boundary="true"',
  'data-admin-dispatch-release-handoff-boundary="true"',
  'status_label: "Ready for dispatch release"',
  "workflow_area: adminDispatchReleaseWorkflowArea",
]) {
  assertIncludes(appPage, fragment, `existing app dispatch release fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-dispatch-release-checklist="true"', 1],
  ['data-admin-dispatch-release-handoff-packet="true"', 1],
  ['data-admin-dispatch-release-mark-ready="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected one existing app Dispatch Release surface for ${fragment}`,
  );
}

for (const fragment of [
  "requireAdminDispatcherBoundary",
  "parseAdminBookingWorkflowStatusLoadParams",
  "parseAdminBookingWorkflowStatusSavePayload",
  "loadAdminBookingWorkflowStatuses",
  "saveAdminBookingWorkflowStatus",
  "export async function GET",
  "export async function POST",
]) {
  assertIncludes(route, fragment, `workflow status route fragment ${fragment}`);
}

for (const fragment of [
  '"dispatch_release"',
  "adminBookingWorkflowAreas",
  "forbiddenWorkflowStatusFragments",
  '"customer_price"',
  '"driver_payout"',
  '"paynow"',
  '"billing"',
  '"invoice"',
  '"payment"',
  '"parser_debug"',
  '"internal_admin_note"',
]) {
  assertIncludes(workflowStatusPersistence, fragment, `workflow status persistence fragment ${fragment}`);
}

for (const fragment of [
  "Dispatch Release",
  "Dispatch Release Handoff Packet",
  "[data-admin-dispatch-release-checklist]",
  "[data-admin-dispatch-release-handoff-packet]",
  "expected one local-only Dispatch Release action",
  "expected Dispatch Release checklist not to create horizontal overflow",
  "expected Dispatch Release handoff packet not to create horizontal overflow",
]) {
  assertIncludes(appSmoke, fragment, `app smoke dispatch release fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-dispatch-release-checklist='true']",
  "[data-admin-dispatch-release-mark-ready='true']",
  'workflow_area: "dispatch_release"',
  "Expected dispatch release and driver acknowledgement workflow status GETs plus dispatch release POST to use the safe guarded API shape",
  "Expected workflow status request bodies to avoid private finance, notification, parser, and secret fields",
]) {
  assertIncludes(bookingUiBrowser, fragment, `booking UI dispatch release fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-dispatch-release-handoff-packet='true']",
  "expected Dispatch Release handoff packet",
  "expected compact Dispatch Release handoff packet",
  "expected Dispatch Release handoff packet not to create horizontal overflow",
]) {
  assertIncludes(mobileUsabilityBrowser, fragment, `mobile dispatch release fragment ${fragment}`);
}

for (const fragment of [
  "admin-booking-workflow-status-persistence.ts",
  "app/api/admin-booking-workflow-statuses/route.ts",
  "disabledWorkflowStatusPersistenceError",
  "unsafeWorkflowLeakPattern",
]) {
  assertIncludes(apiContract, fragment, `workflow status API contract fragment ${fragment}`);
}

const ledgerSection = sectionBetween(ledger, "## Admin Dispatch Release Existing Workflow Lock");

for (const fragment of [
  "The existing admin-only Dispatch Release workflow is locked by `docs/admin-dispatch-release-existing-workflow-lock.md`.",
  "This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "Do not add a duplicate Dispatch Release UI sector, button, card, route, helper, or shim.",
  "Existing surfaces are `data-admin-dispatch-release-checklist`, `data-admin-dispatch-release-mark-ready`, and `data-admin-dispatch-release-handoff-packet` in `app/page.tsx`.",
  "Existing workflow status integration is `/api/admin-booking-workflow-statuses` with workflow area `dispatch_release` and status label `Ready for dispatch release`.",
  "Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, `scripts/test-mobile-usability-browser.mjs`, and `scripts/test-admin-booking-workflow-status-api-contract.mjs`.",
  "Future approved changes must stabilize or extend the existing workflow only, stay compact and colocated, and keep customer/driver privacy boundaries intact.",
  "This lock adds `scripts/test-admin-dispatch-release-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger dispatch release lock fragment ${fragment}`);
}

for (const fragment of [
  "[Admin Dispatch Release Existing Workflow Lock](admin-dispatch-release-existing-workflow-lock.md)",
  "existing admin-only Dispatch Release checklist, handoff packet, workflow-status API integration, and no-duplicate rule",
]) {
  assertIncludes(docsIndex, fragment, `docs index dispatch release lock fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite dispatch release lock registration");

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

console.log("Admin Dispatch Release existing workflow lock passed");
