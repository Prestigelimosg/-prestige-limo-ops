import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appPath = "app/page.tsx";
const routePath = "app/api/admin-booking-workflow-statuses/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";
const guardScript = "scripts/test-confirmed-booking-dispatch-release-boundary-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must not include ${fragment}.`);
}

function assertNotMatches(source, pattern, label) {
  assert.doesNotMatch(source, pattern, `${label} must not match ${pattern}.`);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing start fragment: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);

  return end === -1 ? source.slice(start) : source.slice(start, end);
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

const [appPage, route, preactivationSuite, ledger] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);

for (const fragment of [
  'const adminWorkflowStatusApiPath = "/api/admin-booking-workflow-statuses";',
  'const adminDispatchReleaseWorkflowArea = "dispatch_release";',
  'data-admin-dispatch-release-checklist="true"',
  'data-admin-dispatch-release-mark-ready="true"',
  'data-admin-dispatch-release-handoff-packet="true"',
  'workflow_area: adminDispatchReleaseWorkflowArea',
  'status_label: "Ready for dispatch release"',
]) {
  assertIncludes(appPage, fragment, `existing Dispatch Release reuse fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-dispatch-release-checklist="true"', 1],
  ['data-admin-dispatch-release-mark-ready="true"', 1],
  ['data-admin-dispatch-release-handoff-packet="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected exactly one existing Dispatch Release surface for ${fragment}.`,
  );
}

for (const fragment of [
  'const dispatchReleaseConfirmedBookingStatus = "confirmed";',
  "const dispatchReleaseNonEligibleBookingStatuses = [",
  '"requested"',
  '"pending staff review"',
  '"cancelled"',
  '"completed"',
  "const dispatchReleaseRawBookingStatus =",
  "const dispatchReleaseNormalizedBookingStatus =",
  "const dispatchReleaseConfirmedOnlyEligible =",
  "dispatchReleaseNormalizedBookingStatus === dispatchReleaseConfirmedBookingStatus",
  "dispatchReleaseNonEligibleBookingStatuses.includes",
]) {
  assertIncludes(appPage, fragment, `confirmed-only eligibility fragment ${fragment}`);
}

const dispatchReadinessBlock = sectionBetween(
  appPage,
  "const dispatchReleaseRawBookingStatus =",
  "const dispatchReleaseContextLabel =",
);

for (const fragment of [
  "dispatchReleaseConfirmedOnlyEligible",
  "dispatchReleaseNonConfirmedStatusExplicitlyBlocked",
  "dispatchReleaseStatusDisplay",
  "const dispatchReleaseReviewCleared =",
  "dispatchReleaseConfirmedOnlyEligible &&",
  "dispatchReleaseNonConfirmedStatusExplicitlyBlocked",
  "const dispatchReleaseReady =",
  "dispatchReleaseConfirmedOnlyEligible &&",
  "dispatchReleaseChecklist.every",
]) {
  assertIncludes(dispatchReadinessBlock, fragment, `dispatch readiness confirmed-only fragment ${fragment}`);
}

const saveBlock = sectionBetween(
  appPage,
  "async function saveDispatchReleaseWorkflowStatus()",
  "async function saveDriverAcknowledgementWorkflowStatus()",
);

for (const fragment of [
  "if (!dispatchReleaseConfirmedOnlyEligible)",
  "Dispatch release requires a confirmed booking before staff can mark it ready.",
  "return;",
  "if (!dispatchReleaseReady)",
  "fetch(adminWorkflowStatusApiPath",
  'status_value: "ready"',
  "workflow_area: adminDispatchReleaseWorkflowArea",
]) {
  assertIncludes(saveBlock, fragment, `dispatch release save confirmed-only fragment ${fragment}`);
}

assert.equal(
  saveBlock.indexOf("if (!dispatchReleaseConfirmedOnlyEligible)") <
    saveBlock.indexOf("fetch(adminWorkflowStatusApiPath"),
  true,
  "Confirmed-only eligibility must be checked before the workflow-status POST.",
);

const markReadyButtonBlock = sectionBetween(
  appPage,
  'data-admin-dispatch-release-mark-ready="true"',
  'onClick={saveDispatchReleaseWorkflowStatus}',
);

assertIncludes(
  markReadyButtonBlock,
  "!dispatchReleaseConfirmedOnlyEligible ||",
  "mark-ready disabled confirmed-only guard",
);

for (const fragment of [
  "requireAdminDispatcherBoundary",
  "resolveAdminDispatcherBoundary",
  "parseAdminBookingWorkflowStatusSavePayload",
  "saveAdminBookingWorkflowStatus",
  "export async function POST",
]) {
  assertIncludes(route, fragment, `existing workflow status route fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite guard registration");
assertIncludes(ledger, "## Confirmed Booking Dispatch Release Boundary Lock", "ledger lock heading");
assertIncludes(
  ledger,
  "Only normalized `confirmed` bookings are eligible for the existing admin Dispatch Release mark-ready/save path.",
  "ledger confirmed-only lock",
);

for (const forbidden of [
  "/api/admin-saved-bookings",
  "/api/ai-parse",
  "/api/admin-customer-rates-runtime-write-action",
  "/api/admin-driver-payout-rules-runtime-write-action",
  "/api/admin-billing-payment-action-disabled-setup",
  "/api/admin-calendar-event-lifecycle-action-disabled-setup",
]) {
  assertExcludes(saveBlock, forbidden, `Dispatch Release save path forbidden route ${forbidden}`);
}

for (const pattern of [
  /customer_price|quoted_price|driver_payout|paynow|invoice|payment|pdf|billing|parser_debug|raw_ai|service_role|server_secret/i,
  /provider|send|notification|live_location|photo|calendar|auth/i,
]) {
  assertNotMatches(saveBlock, pattern, "Dispatch Release save path forbidden behavior");
}

const appFiles = await listFiles("app");
const publicSurfaceFiles = appFiles.filter((file) => {
  const normalized = file.split(path.sep).join("/");

  return (
    normalized !== appPath &&
    !normalized.startsWith("app/api/admin-") &&
    (normalized.startsWith("app/api/customer") ||
      normalized.startsWith("app/api/driver") ||
      normalized.startsWith("app/book") ||
      normalized.startsWith("app/customers") ||
      normalized.startsWith("app/driver-job") ||
      normalized.startsWith("app/my-bookings"))
  );
});

for (const file of publicSurfaceFiles) {
  const source = await readFile(file, "utf8");

  assertExcludes(source, "/api/admin-booking-workflow-statuses", `${file} public workflow-status caller`);
  assertExcludes(source, "data-admin-dispatch-release-mark-ready", `${file} public dispatch release control`);
  assertExcludes(source, "Ready for dispatch release", `${file} public dispatch release label`);
}

const apiFiles = appFiles.filter((file) => file.split(path.sep).join("/").startsWith("app/api/"));
const unexpectedDispatchReleaseRoutes = apiFiles.filter((file) => {
  const normalized = file.split(path.sep).join("/");

  return (
    normalized !== routePath &&
    /dispatch-release|booking-workflow-statuses/.test(normalized)
  );
});

assert.deepEqual(
  unexpectedDispatchReleaseRoutes,
  [],
  "Dispatch Release must not add a duplicate route.",
);

for (const forbiddenRoute of [
  "/api/admin-saved-bookings",
  "/api/ai-parse",
  "/api/admin-bookings",
]) {
  assertExcludes(
    dispatchReadinessBlock + saveBlock + markReadyButtonBlock,
    forbiddenRoute,
    `Confirmed-only boundary must not change ${forbiddenRoute}.`,
  );
}

console.log("Confirmed Booking Dispatch Release boundary guard passed");
