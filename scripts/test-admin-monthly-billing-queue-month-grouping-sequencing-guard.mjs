import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appPath = "app/page.tsx";
const monthlyQueueLockPath = "docs/admin-monthly-billing-queue-existing-workflow-lock.md";
const monthlyGroupingLockPath = "docs/admin-monthly-billing-month-grouping-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs";

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

const [appPage, monthlyQueueLock, monthlyGroupingLock, ledger, docsIndex, preactivationSuite] =
  await Promise.all([
    readFile(appPath, "utf8"),
    readFile(monthlyQueueLockPath, "utf8"),
    readFile(monthlyGroupingLockPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(docsIndexPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);

const queueToGroupingStateBlock = sectionBetween(
  appPage,
  "const monthlyBillingQueueReadinessReviewStatusLabel =",
  "const mockMidnightChargeOverrideAutoDetected =",
);
const queueToGroupingMarkupBlock = sectionBetween(
  appPage,
  'aria-label="Monthly Billing Queue Readiness Review"',
  'data-dispatch-workflow-step="job-card-preview"',
);

for (const fragment of [
  'data-admin-monthly-billing-queue-readiness-review="true"',
  'data-admin-monthly-billing-queue-exception-review="true"',
  'data-admin-monthly-billing-month-grouping-review="true"',
  'data-admin-monthly-billing-month-grouping-read-controls="true"',
  'data-admin-completed-booking-billing-readiness-audit-action="true"',
  'data-admin-monthly-billing-draft-plan-save-action="true"',
]) {
  assertIncludes(appPage, fragment, `existing monthly billing sequencing surface ${fragment}`);
  assertIncludes(
    queueToGroupingMarkupBlock,
    fragment,
    `queue-to-grouping markup reuses existing surface ${fragment}`,
  );
}

for (const [fragment, expectedCount] of [
  ['data-admin-monthly-billing-queue-readiness-review="true"', 1],
  ['data-admin-monthly-billing-queue-exception-review="true"', 1],
  ['data-admin-monthly-billing-month-grouping-review="true"', 1],
  ['data-admin-monthly-billing-month-grouping-read-controls="true"', 1],
  ['data-admin-completed-booking-billing-readiness-audit-action="true"', 1],
  ['data-admin-monthly-billing-draft-plan-save-action="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected exactly one existing monthly billing sequencing surface for ${fragment}.`,
  );
}

for (const fragment of [
  "const monthlyBillingQueueReadyLocally =",
  'monthlyBillingQueueReadinessReviewStatus === "queued-locally" &&',
  "monthlyBillingQueueCustomerAccountReady &&",
  "monthlyBillingQueueBillingMonthReady &&",
  "monthlyBillingQueueTripsReviewed &&",
  "monthlyBillingQueueBillingPrepReviewed &&",
  "monthlyBillingQueueExceptionsReviewed;",
  "const monthlyBillingSavedGroupingReadyTripsCount =",
  "monthlyBillingSavedGroupingPrimaryGroup",
  ": monthlyBillingQueueReadyTripsCount;",
  "const monthlyBillingSavedGroupingBlockedTripsCount =",
  ": monthlyBillingQueueBlockedTripsCount;",
  "const monthlyBillingSavedGroupingTotalTrips =",
  ": monthlyBillingQueueReadyTripsCount + monthlyBillingQueueBlockedTripsCount;",
  "const monthlyBillingMonthGroupingCustomerAccountReviewed =",
  "monthlyBillingSavedGroupingHasGroup ||",
  'monthlyBillingMonthGroupingReviewReached("account-reviewed") &&',
  'monthlyBillingQueueCustomerAccountLabel !== "Customer/account not selected");',
  "const monthlyBillingMonthGroupingBillingMonthReviewed =",
  'monthlyBillingMonthGroupingReviewReached("month-reviewed") &&',
  'monthlyBillingQueueBillingMonthLabel !== "Billing month not selected" &&',
  'monthlyBillingQueueBillingMonthLabel !== "Billing month needs review");',
  "const monthlyBillingMonthGroupingCountsReviewed =",
  'monthlyBillingMonthGroupingReviewReached("counts-reviewed") &&',
  "monthlyBillingSavedGroupingTotalTrips > 0;",
  "const monthlyBillingMonthGroupingGroupedLocally =",
  'monthlyBillingMonthGroupingReviewStatus === "grouped-locally" &&',
  "monthlyBillingMonthGroupingAdminReviewed &&",
  "monthlyBillingSavedGroupingReadyTripsCount > 0 &&",
  "monthlyBillingSavedGroupingBlockedTripsCount === 0 &&",
  "monthlyBillingSavedGroupingReadinessStatus === \"ready\"",
  ": monthlyBillingQueueReadyLocally);",
]) {
  assertIncludes(queueToGroupingStateBlock, fragment, `queue-to-grouping state fragment ${fragment}`);
}

for (const fragment of [
  "Clear blocked trips before monthly queue review.",
  "Review billing preparation summary locally.",
  "Mark queued locally for future monthly billing review.",
  "Review ready and blocked trip counts locally.",
  "Resolve blocked saved trips before month grouping can be marked ready.",
  "Review customer/account and billing month grouping from saved data.",
  "Complete admin grouping review.",
  "Mark grouped for future monthly billing review.",
]) {
  assertIncludes(queueToGroupingStateBlock, fragment, `queue-to-grouping next-action fragment ${fragment}`);
}

for (const fragment of [
  'key: "monthly-billing-queue-status"',
  'key: "ready-trips-count"',
  'key: "blocked-trips-count"',
  'key: "month-grouping-status"',
  'key: "admin-review-status"',
]) {
  assertIncludes(queueToGroupingStateBlock, fragment, `queue-to-grouping checklist item ${fragment}`);
}

for (const forbidden of [
  "/api/admin-bookings",
  "/api/admin-saved-bookings",
  "/api/ai-parse",
  "/api/admin-customer-rates-runtime-write-action",
  "/api/admin-driver-payout-rules-runtime-write-action",
  "/api/admin-billing-payment-action-disabled-setup",
  "/api/admin-calendar-event-lifecycle-action-disabled-setup",
]) {
  assertExcludes(
    queueToGroupingStateBlock + queueToGroupingMarkupBlock,
    forbidden,
    `queue-to-grouping forbidden route ${forbidden}`,
  );
}

for (const fragment of [
  "Local UI only. No Supabase write, live database access, invoice creation, PDF, payment,",
  "payout, notification sending, auth change, parser change, billing activation, customer message,",
  "Guarded admin API read plus completed-booking billing-readiness audit, monthly billing",
  "draft-plan, invoice draft-prep, item-review, billable price review, issue-review,",
  "No direct Supabase",
  "generation, PDF sending, payment, payout, notification sending, auth change, parser change, billing",
]) {
  assertIncludes(queueToGroupingMarkupBlock, fragment, `queue-to-grouping boundary copy ${fragment}`);
}

assertNotMatches(
  queueToGroupingStateBlock,
  /customer_price|quoted_price|driver_payout|paynow|payout_comparison|parser_debug|raw_ai|service_role|server_secret|provider_send|live_location|photo_upload|calendar_sync/i,
  "queue-to-grouping sequencing state block forbidden behavior",
);

for (const fragment of [
  "Existing Monthly Billing Queue to Month Grouping Sequencing",
  "Monthly Billing Queue ready state feeds Month Grouping local fallback counts only when no saved monthly billing group is loaded.",
  "Monthly Billing Queue blocked trips prevent Month Grouping from becoming grouped locally.",
  "`scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs` covers the existing monthly queue to month grouping sequencing evidence.",
]) {
  assertIncludes(monthlyQueueLock, fragment, `monthly queue lock sequencing fragment ${fragment}`);
}

for (const fragment of [
  "Existing Monthly Billing Queue to Month Grouping Sequencing",
  "Month Grouping can mark grouped locally only when the existing Monthly Billing Queue is ready locally or a saved admin group is ready.",
  "Blocked queue trips and blocked saved trips remain blockers for Month Grouping readiness.",
  "`scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs` covers this queue-to-grouping boundary.",
]) {
  assertIncludes(monthlyGroupingLock, fragment, `month grouping lock sequencing fragment ${fragment}`);
}

for (const fragment of [
  "## Admin Monthly Billing Queue To Month Grouping Sequencing Guard Lock",
  "Monthly Billing Queue to Month Grouping sequencing is now docs/test guard-locked through existing derived readiness state.",
  "Monthly Billing Queue ready state feeds Month Grouping local fallback counts only when no saved monthly billing group is loaded.",
  "Month Grouping can mark grouped locally only when the existing Monthly Billing Queue is ready locally or a saved admin group is ready.",
  "This lock adds `scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledger, fragment, `ledger queue-to-grouping sequencing fragment ${fragment}`);
}

assertIncludes(
  docsIndex,
  "[Admin Monthly Billing Queue To Month Grouping Sequencing Guard](../scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs)",
  "docs index queue-to-grouping sequencing guard",
);
assertIncludes(preactivationSuite, guardScript, "preactivation queue-to-grouping sequencing registration");

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

  for (const fragment of [
    "data-admin-monthly-billing-queue-readiness-review",
    "data-admin-monthly-billing-queue-exception-review",
    "data-admin-monthly-billing-month-grouping-review",
    "data-admin-monthly-billing-month-grouping-read-controls",
    "Monthly Billing Queue Readiness Review",
    "Monthly Billing Queue Exception Review",
    "Monthly Billing Month Grouping Review",
  ]) {
    assertExcludes(source, fragment, `${file} public monthly billing sequencing fragment`);
  }
}

for (const [label, text] of [
  ["monthlyQueueLock", monthlyQueueLock],
  ["monthlyGroupingLock", monthlyGroupingLock],
  ["ledger", ledger],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(text, /```(?:bash|sql)/i, `${label} runnable shell or SQL block`);
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

console.log("Admin Monthly Billing Queue to Month Grouping sequencing guard passed");
