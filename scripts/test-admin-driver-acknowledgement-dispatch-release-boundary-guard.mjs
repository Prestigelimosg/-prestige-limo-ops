import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appPath = "app/page.tsx";
const routePath = "app/api/admin-booking-workflow-statuses/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-driver-acknowledgement-dispatch-release-boundary-guard.mjs";

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

const [appPage, route, ledger, docsIndex, preactivationSuite] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

for (const fragment of [
  'const adminWorkflowStatusApiPath = "/api/admin-booking-workflow-statuses";',
  'const adminDispatchReleaseWorkflowArea = "dispatch_release";',
  'const adminDriverAcknowledgementWorkflowArea = "driver_acknowledgement";',
  'data-admin-driver-acknowledgement-readiness="true"',
  'data-admin-driver-acknowledgement-mark-ready="true"',
  'data-admin-driver-acknowledgement-follow-up="true"',
  'status_label: "Driver acknowledgement ready"',
  "workflow_area: adminDriverAcknowledgementWorkflowArea",
]) {
  assertIncludes(appPage, fragment, `existing Driver Acknowledgement reuse fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-driver-acknowledgement-readiness="true"', 1],
  ['data-admin-driver-acknowledgement-mark-ready="true"', 1],
  ['data-admin-driver-acknowledgement-follow-up="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected exactly one existing Driver Acknowledgement surface for ${fragment}.`,
  );
}

const readinessBlock = sectionBetween(
  appPage,
  "const driverAcknowledgementCoreReady =",
  "const customerDriverDetailsEmailReviewVehicleType =",
);
const saveBlock = sectionBetween(
  appPage,
  "async function saveDriverAcknowledgementWorkflowStatus()",
  "async function saveCompletedTripCloseoutReviewStatus(",
);
const markupBlock = sectionBetween(
  appPage,
  'aria-label="Driver Acknowledgement Readiness"',
  'aria-label="Day-of-Trip Dispatch Monitor"',
);
const followUpBlock = sectionBetween(
  appPage,
  "const driverAcknowledgementFollowUpStatusLabel =",
  "const dayOfTripDriverAcknowledged =",
);

for (const fragment of [
  "const dispatchReleaseSavedReady =",
  "clean(dispatchReleaseWorkflowStatus?.workflow_area) === adminDispatchReleaseWorkflowArea",
  'clean(dispatchReleaseWorkflowStatus?.status_value) === "ready"',
]) {
  assertIncludes(appPage, fragment, `existing saved Dispatch Release status fragment ${fragment}`);
}

for (const fragment of [
  "const driverAcknowledgementReleaseEligible = dispatchReleaseSavedReady;",
  "const driverAcknowledgementReady =",
  "driverAcknowledgementReleaseEligible &&",
  "driverAcknowledgementCoreReady;",
  "driverAcknowledgementSavedReady && driverAcknowledgementReady",
  "Saved dispatch release status ready.",
  "Save dispatch release ready status first.",
  'key: "dispatch-release-saved"',
  'label: "Dispatch release saved"',
  "state: driverAcknowledgementReleaseEligible ? \"ready\" : \"needs-action\"",
]) {
  assertIncludes(readinessBlock, fragment, `Driver Acknowledgement readiness sequencing fragment ${fragment}`);
}

for (const fragment of [
  "if (!driverAcknowledgementReleaseEligible)",
  "Save dispatch release ready status before marking driver acknowledgement ready.",
  "return;",
  "if (!driverAcknowledgementCoreReady)",
  "fetch(adminWorkflowStatusApiPath",
  'status_value: "ready"',
  "workflow_area: adminDriverAcknowledgementWorkflowArea",
]) {
  assertIncludes(saveBlock, fragment, `Driver Acknowledgement save sequencing fragment ${fragment}`);
}

assert.equal(
  saveBlock.indexOf("if (!driverAcknowledgementReleaseEligible)") <
    saveBlock.indexOf("fetch(adminWorkflowStatusApiPath"),
  true,
  "Saved Dispatch Release eligibility must be checked before the Driver Acknowledgement workflow-status POST.",
);
assert.equal(
  saveBlock.indexOf("if (!driverAcknowledgementReleaseEligible)") <
    saveBlock.indexOf("if (!driverAcknowledgementCoreReady)"),
  true,
  "Saved Dispatch Release eligibility must be the first Driver Acknowledgement readiness gate.",
);

for (const fragment of [
  "driverAcknowledgementReady",
  "disabled={!driverAcknowledgementReady || adminBookingWorkflowStatusAction !== null}",
  "data-admin-driver-acknowledgement-mark-ready=\"true\"",
  "const isDisabled = option.value !== \"pending\" && !driverAcknowledgementReady;",
]) {
  assertIncludes(markupBlock, fragment, `Driver Acknowledgement markup sequencing fragment ${fragment}`);
}

for (const fragment of [
  "const driverAcknowledgementFollowUpNextAction = !driverAcknowledgementReady",
  "const driverAcknowledgementFollowUpOutcomeReady =",
  "driverAcknowledgementReady &&",
  'driverAcknowledgementFollowUpStatus === "acknowledged"',
  "Complete driver acknowledgement readiness first.",
  "state: driverAcknowledgementFollowUpOutcomeReady ? \"ready\" : \"needs-action\"",
]) {
  assertIncludes(followUpBlock, fragment, `Driver Acknowledgement follow-up sequencing fragment ${fragment}`);
}

assertIncludes(
  appPage,
  "const dayOfTripDriverAcknowledged = driverAcknowledgementFollowUpOutcomeReady;",
  "Day-of-Trip must only see Driver Acknowledgement after the gated outcome is ready",
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

for (const forbidden of [
  "/api/admin-saved-bookings",
  "/api/ai-parse",
  "/api/admin-customer-rates-runtime-write-action",
  "/api/admin-driver-payout-rules-runtime-write-action",
  "/api/admin-billing-payment-action-disabled-setup",
  "/api/admin-calendar-event-lifecycle-action-disabled-setup",
]) {
  assertExcludes(saveBlock, forbidden, `Driver Acknowledgement save path forbidden route ${forbidden}`);
}

for (const pattern of [
  /customer_price|quoted_price|driver_payout|paynow|invoice|payment|pdf|billing|parser_debug|raw_ai|service_role|server_secret/i,
  /provider|send|notification|live_location|photo|calendar|auth/i,
]) {
  assertNotMatches(saveBlock, pattern, "Driver Acknowledgement save path forbidden behavior");
}

assertIncludes(
  ledger,
  "## Admin Driver Acknowledgement Dispatch Release Boundary Lock",
  "ledger Driver Acknowledgement boundary heading",
);
assertIncludes(
  ledger,
  "Driver Acknowledgement mark-ready/save now requires the existing Dispatch Release workflow status to be saved ready first.",
  "ledger Driver Acknowledgement saved Dispatch Release gate",
);
assertIncludes(
  ledger,
  "This lock adds `scripts/test-admin-driver-acknowledgement-dispatch-release-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "ledger Driver Acknowledgement boundary guard registration",
);
assertIncludes(
  docsIndex,
  "[Admin Driver Acknowledgement Dispatch Release Boundary Guard](../scripts/test-admin-driver-acknowledgement-dispatch-release-boundary-guard.mjs)",
  "docs index Driver Acknowledgement boundary guard",
);
assertIncludes(preactivationSuite, guardScript, "preactivation suite Driver Acknowledgement boundary registration");

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
  assertExcludes(source, "data-admin-driver-acknowledgement-mark-ready", `${file} public driver acknowledgement control`);
  assertExcludes(source, "Driver acknowledgement ready", `${file} public Driver Acknowledgement label`);
}

const apiFiles = appFiles.filter((file) => file.split(path.sep).join("/").startsWith("app/api/"));
const unexpectedDriverAcknowledgementRoutes = apiFiles.filter((file) => {
  const normalized = file.split(path.sep).join("/");

  return (
    normalized !== routePath &&
    /driver-acknowledgement|booking-workflow-statuses/.test(normalized)
  );
});

assert.deepEqual(
  unexpectedDriverAcknowledgementRoutes,
  [],
  "Driver Acknowledgement must not add a duplicate route.",
);

console.log("Admin Driver Acknowledgement Dispatch Release boundary guard passed");
