import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appPath = "app/page.tsx";
const closeoutRoutePath = "app/api/admin-completed-booking-closeouts/route.ts";
const closeoutPersistencePath = "lib/admin-completed-booking-closeout-persistence.ts";
const exceptionContractPath = "docs/admin-driver-exception-handling-contract.md";
const closeoutLockPath = "docs/admin-completed-trip-closeout-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-exception-recovery-closeout-sequencing-guard.mjs";

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
  closeoutRoute,
  closeoutPersistence,
  exceptionContract,
  closeoutLock,
  ledger,
  docsIndex,
  preactivationSuite,
] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(closeoutRoutePath, "utf8"),
  readFile(closeoutPersistencePath, "utf8"),
  readFile(exceptionContractPath, "utf8"),
  readFile(closeoutLockPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const sequencingBlock = sectionBetween(
  appPage,
  "const dayOfTripExceptionEscalationClosed =",
  "const closeoutToBillingPreparationReviewStatusLabel =",
);
const sequencingMarkupBlock = sectionBetween(
  appPage,
  'aria-label="Day-of-Trip Exception Escalation"',
  'aria-label="Closeout to Billing Preparation Review"',
);

for (const fragment of [
  'data-admin-day-of-trip-exception-escalation="true"',
  'data-admin-dispatch-recovery-replacement-readiness="true"',
  'data-admin-post-recovery-update-readiness="true"',
  'data-admin-day-of-trip-completion-handoff="true"',
  'data-admin-completed-trip-closeout-review="true"',
]) {
  assertIncludes(appPage, fragment, `existing exception/recovery/closeout surface ${fragment}`);
  assertIncludes(
    sequencingMarkupBlock,
    fragment,
    `sequencing markup reuses existing exception/recovery/closeout surface ${fragment}`,
  );
}

for (const [fragment, expectedCount] of [
  ['data-admin-day-of-trip-exception-escalation="true"', 1],
  ['data-admin-dispatch-recovery-replacement-readiness="true"', 1],
  ['data-admin-post-recovery-update-readiness="true"', 1],
  ['data-admin-day-of-trip-completion-handoff="true"', 1],
  ['data-admin-completed-trip-closeout-review="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected exactly one existing sequencing surface for ${fragment}.`,
  );
}

for (const fragment of [
  "const dispatchRecoveryReplacementReadyLocally =",
  'dispatchRecoveryReplacementStatus === "ready-locally";',
  "const postRecoveryReplacementDriverDispatchCopyReviewed =",
  'postRecoveryUpdateReached("driver-copy-reviewed") ||',
  "(dispatchRecoveryReplacementReadyLocally && dispatchRecoveryReplacementDispatchCopyReady);",
  "const postRecoveryNewDriverJobLinkReady =",
  'postRecoveryUpdateReached("job-link-ready") || dispatchRecoveryReplacementJobLinkReady;',
  "const postRecoveryUpdateReadyLocally = postRecoveryUpdateStatus === \"ready-locally\";",
  "const dayOfTripCompletionCustomerCloseoutReady =",
  'dayOfTripCompletionHandoffReached("customer-closeout-ready") ||',
  "postRecoveryUpdateReadyLocally;",
  "const dayOfTripCompletionExceptionResolutionReviewed =",
  'dayOfTripCompletionHandoffReached("exception-reviewed") ||',
  "dayOfTripExceptionEscalationClosed;",
  "const completedTripCloseoutCustomerCloseoutReviewed =",
  'completedTripCloseoutReviewReached("customer-closeout-reviewed") ||',
  "dayOfTripCompletionCustomerCloseoutReady;",
  "const completedTripCloseoutExceptionResolutionReviewed =",
  'completedTripCloseoutReviewReached("exception-reviewed") ||',
  "dayOfTripCompletionExceptionResolutionReviewed;",
]) {
  assertIncludes(sequencingBlock, fragment, `exception/recovery closeout sequencing fragment ${fragment}`);
}

for (const fragment of [
  "Review customer update copy locally.",
  "Review replacement driver dispatch copy locally.",
  "Review original driver follow-up locally.",
  "Prepare new driver job link readiness locally.",
  "Review customer ETA/update status locally.",
  "Review customer closeout update readiness locally.",
  "Review exception/resolution note locally.",
  "Review customer closeout locally.",
  "Review exception/resolution locally.",
]) {
  assertIncludes(sequencingBlock, fragment, `sequencing next-action fragment ${fragment}`);
}

for (const fragment of [
  'key: "customer-update-copy-reviewed"',
  'key: "replacement-driver-dispatch-copy-reviewed"',
  'key: "original-driver-follow-up-reviewed"',
  'key: "new-driver-job-link-readiness"',
  'key: "customer-eta-update-status"',
  'key: "customer-closeout-update-readiness"',
  'key: "exception-resolution-note-reviewed"',
  'key: "customer-closeout-reviewed"',
  'key: "exception-resolution-reviewed"',
]) {
  assertIncludes(sequencingBlock, fragment, `sequencing checklist item ${fragment}`);
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
  "sequencing state block forbidden behavior",
);

for (const fragment of [
  "requireAdminDispatcherBoundary",
  "parseAdminCompletedBookingCloseoutLoadParams",
  "parseAdminCompletedBookingCloseoutSavePayload",
  "export async function GET",
  "export async function POST",
  "safeFailureResponse",
]) {
  assertIncludes(closeoutRoute, fragment, `existing closeout route fragment ${fragment}`);
}

for (const fragment of [
  "allowedCloseoutTopLevelFields",
  "allowedSafeContextFields",
  "forbiddenCloseoutFragments",
  'process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true"',
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
  assertIncludes(closeoutPersistence, fragment, `existing closeout persistence safety fragment ${fragment}`);
}

for (const fragment of [
  "Existing Exception/Recovery To Closeout Sequencing",
  "Dispatch Recovery / Replacement readiness feeds Post-Recovery replacement-driver copy and new-driver job-link readiness.",
  "Post-Recovery Update ready locally feeds Day-of-Trip Completion Handoff customer closeout readiness.",
  "Closed Day-of-Trip Exception Escalation feeds Day-of-Trip Completion Handoff exception/resolution review.",
  "Day-of-Trip Completion Handoff feeds the existing Completed Trip Closeout Review customer closeout and exception/resolution checklist states.",
]) {
  assertIncludes(exceptionContract, fragment, `exception contract sequencing fragment ${fragment}`);
}

for (const fragment of [
  "Existing exception/recovery sequencing feeds the closeout workflow through existing derived readiness state only.",
  "`scripts/test-admin-exception-recovery-closeout-sequencing-guard.mjs` covers the existing exception/recovery to completion/closeout sequencing evidence.",
  "Preserve the existing exception/recovery to completion/closeout derived-readiness sequence.",
]) {
  assertIncludes(closeoutLock, fragment, `completed closeout lock sequencing fragment ${fragment}`);
}

for (const fragment of [
  "## Admin Exception Recovery To Closeout Sequencing Guard Lock",
  "Exception/recovery to closeout sequencing is now docs/test guard-locked through existing derived readiness state",
  "This lock adds `scripts/test-admin-exception-recovery-closeout-sequencing-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledger, fragment, `ledger exception recovery closeout sequencing fragment ${fragment}`);
}

assertIncludes(
  docsIndex,
  "[Admin Exception Recovery To Closeout Sequencing Guard](../scripts/test-admin-exception-recovery-closeout-sequencing-guard.mjs)",
  "docs index exception recovery closeout sequencing guard",
);
assertIncludes(preactivationSuite, guardScript, "preactivation exception recovery closeout sequencing registration");

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
    "data-admin-day-of-trip-exception-escalation",
    "data-admin-dispatch-recovery-replacement-readiness",
    "data-admin-post-recovery-update-readiness",
    "data-admin-day-of-trip-completion-handoff",
    "data-admin-completed-trip-closeout-review",
    "/api/admin-completed-booking-closeouts",
  ]) {
    assertExcludes(source, fragment, `${file} public exception/recovery/closeout fragment`);
  }
}

console.log("Admin exception/recovery to closeout sequencing guard passed");
