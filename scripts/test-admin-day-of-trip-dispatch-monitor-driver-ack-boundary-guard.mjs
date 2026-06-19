import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appPath = "app/page.tsx";
const routePath = "app/api/admin-driver-job-statuses/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-day-of-trip-dispatch-monitor-driver-ack-boundary-guard.mjs";

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
  'data-admin-day-of-trip-dispatch-monitor="true"',
  'data-admin-day-of-trip-dispatch-monitor-controls="true"',
  "data-admin-day-of-trip-dispatch-monitor-option={option.value}",
  'data-admin-driver-job-status-readout="true"',
  'data-admin-day-of-trip-dispatch-monitor-boundary="true"',
  'const adminDriverJobStatusesApiPath = "/api/admin-driver-job-statuses";',
]) {
  assertIncludes(appPage, fragment, `existing Day-of-Trip monitor reuse fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-day-of-trip-dispatch-monitor="true"', 1],
  ['data-admin-driver-job-status-readout="true"', 1],
  ['data-admin-day-of-trip-dispatch-monitor-boundary="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected exactly one existing Day-of-Trip surface for ${fragment}.`,
  );
}

const driverAcknowledgementBlock = sectionBetween(
  appPage,
  "const driverAcknowledgementCoreReady =",
  "const dayOfTripDriverAcknowledged =",
);
const dayOfTripBlock = sectionBetween(
  appPage,
  "const dayOfTripDriverAcknowledged =",
  "const dayOfTripExceptionEscalationClosed =",
);
const dayOfTripMarkupBlock = sectionBetween(
  appPage,
  'aria-label="Day-of-Trip Dispatch Monitor"',
  'aria-label="Day-of-Trip Exception Escalation"',
);

for (const fragment of [
  "const driverAcknowledgementReleaseEligible = dispatchReleaseSavedReady;",
  "const driverAcknowledgementReady =",
  "driverAcknowledgementReleaseEligible &&",
  "driverAcknowledgementCoreReady;",
  "const driverAcknowledgementFollowUpOutcomeReady =",
  "driverAcknowledgementReady &&",
  'driverAcknowledgementFollowUpStatus === "acknowledged"',
]) {
  assertIncludes(
    driverAcknowledgementBlock,
    fragment,
    `Driver Acknowledgement gated outcome fragment ${fragment}`,
  );
}

for (const fragment of [
  "const dayOfTripDriverAcknowledged = driverAcknowledgementFollowUpOutcomeReady;",
  "!dayOfTripDriverAcknowledged",
  "Confirm driver acknowledgement before day-of-trip progress.",
  'const order: DayOfTripDispatchMonitorStatus[] = ["otw", "ots", "pob", "completed"];',
  'key: "driver-acknowledged"',
  'label: "Driver acknowledged"',
  'state: dayOfTripDriverAcknowledged ? "ready" : "needs-action"',
]) {
  assertIncludes(dayOfTripBlock, fragment, `Day-of-Trip Driver Acknowledgement boundary fragment ${fragment}`);
}

for (const fragment of [
  "const isDisabled =",
  "!dayOfTripDriverAcknowledged &&",
  'option.value !== "reminder-due" &&',
  'option.value !== "needs-call"',
  "disabled={isDisabled}",
  "data-admin-day-of-trip-dispatch-monitor-option={option.value}",
]) {
  assertIncludes(dayOfTripMarkupBlock, fragment, `Day-of-Trip control boundary fragment ${fragment}`);
}

for (const forbiddenProgress of ['option.value !== "otw"', 'option.value !== "ots"', 'option.value !== "pob"', 'option.value !== "completed"']) {
  assertExcludes(
    dayOfTripMarkupBlock,
    forbiddenProgress,
    `Day-of-Trip boundary should block all progress by default through the positive allowed-list, not ${forbiddenProgress}`,
  );
}

for (const fragment of [
  "requireAdminDispatcherBoundary",
  "loadAdminDriverJobStatuses",
  "export async function GET",
  "safeFailureResponse",
]) {
  assertIncludes(route, fragment, `existing admin driver job statuses route fragment ${fragment}`);
}

assertNotMatches(
  route,
  /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/,
  "admin driver job statuses route must remain read-only",
);

for (const forbidden of [
  "/api/admin-saved-bookings",
  "/api/ai-parse",
  "/api/admin-bookings",
  "/api/admin-customer-rates-runtime-write-action",
  "/api/admin-driver-payout-rules-runtime-write-action",
  "/api/admin-billing-payment-action-disabled-setup",
  "/api/admin-calendar-event-lifecycle-action-disabled-setup",
]) {
  assertExcludes(dayOfTripBlock + dayOfTripMarkupBlock, forbidden, `Day-of-Trip boundary forbidden route ${forbidden}`);
}

for (const pattern of [
  /customer_price|quoted_price|driver_payout|paynow|invoice|payment|pdf|billing|parser_debug|raw_ai|service_role|server_secret/i,
  /provider|send|notification|live_location|photo|calendar|auth/i,
]) {
  assertNotMatches(dayOfTripBlock, pattern, "Day-of-Trip boundary forbidden behavior");
}

assertIncludes(
  ledger,
  "## Admin Day-of-Trip Dispatch Monitor Driver Acknowledgement Boundary Lock",
  "ledger Day-of-Trip Driver Acknowledgement boundary heading",
);
assertIncludes(
  ledger,
  "Day-of-Trip progress controls for OTW, OTS, POB, and Completed remain blocked until Driver Acknowledgement is acknowledged through the gated Driver Acknowledgement follow-up outcome.",
  "ledger Day-of-Trip Driver Acknowledgement boundary",
);
assertIncludes(
  ledger,
  "This lock adds `scripts/test-admin-day-of-trip-dispatch-monitor-driver-ack-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "ledger Day-of-Trip boundary guard registration",
);
assertIncludes(
  docsIndex,
  "[Admin Day-of-Trip Dispatch Monitor Driver Acknowledgement Boundary Guard](../scripts/test-admin-day-of-trip-dispatch-monitor-driver-ack-boundary-guard.mjs)",
  "docs index Day-of-Trip Driver Acknowledgement boundary guard",
);
assertIncludes(preactivationSuite, guardScript, "preactivation suite Day-of-Trip boundary registration");

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

  assertExcludes(source, "/api/admin-driver-job-statuses", `${file} public admin driver job status caller`);
  assertExcludes(source, "data-admin-day-of-trip-dispatch-monitor-option", `${file} public day-of-trip control`);
  assertExcludes(source, "Day-of-Trip Dispatch Monitor", `${file} public Day-of-Trip admin label`);
}

const apiFiles = appFiles.filter((file) => file.split(path.sep).join("/").startsWith("app/api/"));
const unexpectedDayOfTripRoutes = apiFiles.filter((file) => {
  const normalized = file.split(path.sep).join("/");

  return (
    normalized !== routePath &&
    /day-of-trip-dispatch-monitor|admin-driver-job-statuses/.test(normalized)
  );
});

assert.deepEqual(
  unexpectedDayOfTripRoutes,
  [],
  "Day-of-Trip monitor must not add a duplicate admin route.",
);

console.log("Admin Day-of-Trip Dispatch Monitor Driver Acknowledgement boundary guard passed");
