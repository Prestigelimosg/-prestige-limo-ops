import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appPath = "app/page.tsx";
const closeoutBillingLockPath = "docs/admin-closeout-billing-preparation-existing-workflow-lock.md";
const monthlyQueueLockPath = "docs/admin-monthly-billing-queue-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-closeout-billing-preparation-sequencing-guard.mjs";

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

const [
  appPage,
  closeoutBillingLock,
  monthlyQueueLock,
  ledger,
  docsIndex,
  preactivationSuite,
] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(closeoutBillingLockPath, "utf8"),
  readFile(monthlyQueueLockPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const sequencingBlock = sectionBetween(
  appPage,
  "const completedTripCloseoutReviewStatusLabel =",
  "const monthlyBillingQueueExceptionReviewStatusLabel =",
);
const sequencingMarkupBlock = sectionBetween(
  appPage,
  'aria-label="Completed Trip Closeout Review"',
  'aria-label="Monthly Billing Queue Exception Review"',
);

for (const fragment of [
  'data-admin-completed-trip-closeout-review="true"',
  'data-admin-closeout-to-billing-preparation-review="true"',
  'data-admin-billing-preparation-exception-review="true"',
  'data-admin-billing-preparation-summary-ready-review="true"',
  'data-admin-monthly-billing-queue-readiness-review="true"',
]) {
  assertIncludes(appPage, fragment, `existing closeout/billing sequencing surface ${fragment}`);
  assertIncludes(
    sequencingMarkupBlock,
    fragment,
    `sequencing markup reuses existing closeout/billing surface ${fragment}`,
  );
}

for (const [fragment, expectedCount] of [
  ['data-admin-completed-trip-closeout-review="true"', 1],
  ['data-admin-closeout-to-billing-preparation-review="true"', 1],
  ['data-admin-billing-preparation-exception-review="true"', 1],
  ['data-admin-billing-preparation-summary-ready-review="true"', 1],
  ['data-admin-monthly-billing-queue-readiness-review="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected exactly one existing closeout/billing sequencing surface for ${fragment}.`,
  );
}

for (const fragment of [
  "const closeoutToBillingCloseoutReviewed =",
  'closeoutToBillingPreparationReviewReached("closeout-reviewed") ||',
  "completedTripCloseoutReviewReadyLocally;",
  "const closeoutToBillingTripServiceDetailsReviewed =",
  'closeoutToBillingPreparationReviewReached("details-reviewed") ||',
  "completedTripCloseoutTripCompleted;",
  "const billingPreparationMissingBillingAccount =",
  "!closeoutToBillingCustomerAccountReady",
  "const billingPreparationIncompleteTripServiceDetails =",
  "!closeoutToBillingTripServiceDetailsReviewed",
  "const billingPreparationExtraChargesPending =",
  "!closeoutToBillingExtraChargesReviewed",
  "const billingPreparationBillingNoteActionRequired =",
  "!closeoutToBillingNoteReviewed",
  "const billingPreparationSummaryCloseoutReady =",
  'billingPreparationSummaryReviewReached("closeout-ready") ||',
  "closeoutToBillingCloseoutReviewed;",
  "const billingPreparationSummaryAccountReady =",
  'billingPreparationSummaryReviewReached("account-ready") &&',
  "closeoutToBillingCustomerAccountReady &&",
  "!billingPreparationMissingBillingAccount;",
  "const billingPreparationSummaryDetailsReady =",
  'billingPreparationSummaryReviewReached("details-ready") &&',
  "closeoutToBillingTripServiceDetailsReviewed &&",
  "!billingPreparationIncompleteTripServiceDetails;",
  "const billingPreparationSummaryExtraChargesReviewed =",
  'billingPreparationSummaryReviewReached("charges-reviewed") &&',
  "closeoutToBillingExtraChargesReviewed &&",
  "!billingPreparationExtraChargesPending;",
  "const billingPreparationSummaryExceptionsCleared =",
  'billingPreparationSummaryReviewReached("exceptions-cleared") &&',
  "billingPreparationExceptionReviewClearedLocally;",
  "const billingPreparationSummaryReadyForMonthlyReview =",
  'billingPreparationSummaryReviewStatus === "ready-for-monthly-review" &&',
  "billingPreparationSummaryCloseoutReady &&",
  "billingPreparationSummaryAccountReady &&",
  "billingPreparationSummaryDetailsReady &&",
  "billingPreparationSummaryExtraChargesReviewed &&",
  "billingPreparationSummaryExceptionsCleared;",
  "const monthlyBillingQueueReadyTripsCount = billingPreparationSummaryReadyForMonthlyReview ? 1 : 0;",
  "const monthlyBillingQueueBlockedTripsCount = billingPreparationSummaryReadyForMonthlyReview ? 0 : 1;",
  "const monthlyBillingQueueBillingPrepReviewed =",
  'monthlyBillingQueueReadinessReviewReached("billing-prep-reviewed") &&',
  "billingPreparationSummaryReadyForMonthlyReview;",
  "const monthlyBillingQueueExceptionsReviewed =",
  'monthlyBillingQueueReadinessReviewReached("exceptions-reviewed") &&',
  "billingPreparationSummaryExceptionsCleared;",
]) {
  assertIncludes(sequencingBlock, fragment, `closeout/billing sequencing fragment ${fragment}`);
}

for (const fragment of [
  "Review completed trip closeout locally.",
  "Review customer/account billing readiness locally.",
  "Review trip/service details locally.",
  "Review extra charges need locally.",
  "Review billing note locally.",
  "Confirm billing account before billing preparation.",
  "Complete trip/service detail review locally.",
  "Resolve extra charges review locally.",
  "Review billing note/action locally.",
  "Confirm closeout readiness locally.",
  "Confirm billing account readiness locally.",
  "Confirm trip/service details locally.",
  "Confirm extra charges review locally.",
  "Clear or document billing-prep exceptions locally.",
  "Move at least one completed trip to ready state locally.",
  "Clear blocked trips before monthly queue review.",
  "Review billing preparation summary locally.",
]) {
  assertIncludes(sequencingBlock, fragment, `closeout/billing next-action fragment ${fragment}`);
}

for (const fragment of [
  'key: "closeout-reviewed"',
  'key: "customer-account-billing-readiness"',
  'key: "trip-service-details-reviewed"',
  'key: "extra-charges-review-needed"',
  'key: "billing-note-reviewed"',
  'key: "missing-billing-account"',
  'key: "incomplete-trip-service-details"',
  'key: "extra-charges-pending"',
  'key: "billing-note-action-required"',
  'key: "closeout-ready"',
  'key: "billing-account-ready"',
  'key: "trip-service-details-ready"',
  'key: "extra-charges-reviewed"',
  'key: "exceptions-cleared-or-pending"',
  'key: "ready-for-monthly-billing-review"',
  'key: "ready-trips-count"',
  'key: "blocked-trips-count"',
  'key: "billing-prep-status"',
  'key: "exception-status"',
]) {
  assertIncludes(sequencingBlock, fragment, `closeout/billing checklist item ${fragment}`);
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
  assertExcludes(sequencingBlock + sequencingMarkupBlock, forbidden, `sequencing forbidden route ${forbidden}`);
}

assertNotMatches(
  sequencingBlock,
  /customer_price|quoted_price|driver_payout|paynow|invoice|payment|pdf|payout|parser_debug|raw_ai|service_role|server_secret|provider|notification|live_location|photo|calendar|auth/i,
  "closeout/billing sequencing state block forbidden behavior",
);

for (const fragment of [
  "Existing Closeout To Billing Preparation Sequencing",
  "Completed Trip Closeout ready locally feeds Closeout to Billing Preparation closeout readiness.",
  "Closeout to Billing Preparation review feeds Billing Preparation Exception Review checks for missing account, incomplete trip/service details, pending extra charges, and billing note/action readiness.",
  "Billing Preparation Summary / Ready Review requires closeout readiness, account readiness, trip/service details, extra charges review, and cleared billing-prep exceptions before it can become ready for monthly billing review.",
  "The existing Monthly Billing Queue readiness review consumes the Billing Preparation Summary ready state as local queue evidence only.",
]) {
  assertIncludes(closeoutBillingLock, fragment, `closeout billing lock sequencing fragment ${fragment}`);
}

for (const fragment of [
  "Existing billing-preparation sequencing feeds the monthly queue through local readiness state only.",
  "`scripts/test-admin-closeout-billing-preparation-sequencing-guard.mjs` covers the existing closeout-to-billing preparation to monthly queue sequencing evidence.",
  "Preserve the existing closeout-to-billing preparation to monthly queue derived-readiness sequence.",
]) {
  assertIncludes(monthlyQueueLock, fragment, `monthly queue lock sequencing fragment ${fragment}`);
}

for (const fragment of [
  "## Admin Closeout To Billing Preparation Sequencing Guard Lock",
  "Closeout to billing preparation sequencing is now docs/test guard-locked through existing derived readiness state",
  "This lock adds `scripts/test-admin-closeout-billing-preparation-sequencing-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledger, fragment, `ledger closeout billing sequencing fragment ${fragment}`);
}

assertIncludes(
  docsIndex,
  "[Admin Closeout To Billing Preparation Sequencing Guard](../scripts/test-admin-closeout-billing-preparation-sequencing-guard.mjs)",
  "docs index closeout billing sequencing guard",
);
assertIncludes(preactivationSuite, guardScript, "preactivation closeout billing sequencing registration");

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
    "data-admin-closeout-to-billing-preparation-review",
    "data-admin-billing-preparation-exception-review",
    "data-admin-billing-preparation-summary-ready-review",
    "data-admin-monthly-billing-queue-readiness-review",
    "Closeout to Billing Preparation Review",
    "Billing Preparation Exception Review",
    "Billing Preparation Summary / Ready Review",
    "Monthly Billing Queue Readiness Review",
  ]) {
    assertExcludes(source, fragment, `${file} public closeout/billing sequencing fragment`);
  }
}

console.log("Admin Closeout to Billing Preparation sequencing guard passed");
