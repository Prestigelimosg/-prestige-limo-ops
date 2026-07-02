import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPath = "app/page.tsx";
const customersPath = "app/customers/page.tsx";
const closeoutPersistencePath = "lib/admin-completed-booking-closeout-persistence.ts";
const monthlyGroupingPath = "lib/admin-monthly-billing-grouping-read.ts";
const tripCandidatesPath = "lib/admin-monthly-invoice-draft-trip-candidates.ts";
const closeoutMigrationPath = "supabase/migrations/202606070001_completed_booking_closeout_persistence.sql";
const bookingUiGuardPath = "scripts/test-booking-ui-browser.mjs";
const appSmokeGuardPath = "scripts/test-app-smoke-browser.mjs";
const mobileGuardPath = "scripts/test-mobile-usability-browser.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);

  return source.slice(start, end);
}

const [
  appPage,
  customersPage,
  closeoutPersistence,
  monthlyGrouping,
  tripCandidates,
  closeoutMigration,
  bookingUiGuard,
  appSmokeGuard,
  mobileGuard,
] = await Promise.all([
  readFile(appPath, "utf8"),
  readFile(customersPath, "utf8"),
  readFile(closeoutPersistencePath, "utf8"),
  readFile(monthlyGroupingPath, "utf8"),
  readFile(tripCandidatesPath, "utf8"),
  readFile(closeoutMigrationPath, "utf8"),
  readFile(bookingUiGuardPath, "utf8"),
  readFile(appSmokeGuardPath, "utf8"),
  readFile(mobileGuardPath, "utf8"),
]);

const closeoutStatusBlock = sectionBetween(
  appPage,
  "type CompletedTripCloseoutReviewStatus =",
  "type CloseoutToBillingPreparationReviewStatus =",
);
const closeoutSaveBlock = sectionBetween(
  appPage,
  "async function saveCompletedTripCloseoutReviewStatus",
  "async function updateAppliedAdminBookingOperationalSnapshot",
);
const closeoutReviewLogicBlock = sectionBetween(
  appPage,
  "const completedTripCloseoutReviewStatusLabel =",
  "const closeoutToBillingPreparationReviewStatusLabel =",
);
const closeoutReviewMarkupBlock = sectionBetween(
  appPage,
  'aria-label="Completed Trip Closeout Review"',
  'aria-label="Closeout to Billing Preparation Review"',
);
const unbilledBridgeBlock = sectionBetween(
  customersPage,
  "function savedBookingCloseoutIsBillingReady",
  "function hasMockBalanceDue",
);
const invoiceIssueBlock = sectionBetween(
  customersPage,
  "function previewPreparedCustomerInvoice",
  "async function downloadIssuedCustomerInvoice",
);

for (const fragment of [
  '"customer-no-show-billable"',
  '"late-cancellation-billable"',
  '"waived-no-charge"',
]) {
  assertIncludes(closeoutStatusBlock, fragment, `closeout status union ${fragment}`);
}

for (const fragment of [
  'nextStatus === "customer-no-show-billable"',
  'nextStatus === "late-cancellation-billable"',
  'nextStatus === "waived-no-charge"',
  'closeout_status: closeoutStatus',
  'completed_job_status: completedJobStatus',
  'dsp_actual_hours_readiness: dspActualHoursReadiness',
  'extra_charges_readiness: extraChargesReadiness',
  'billing_prep_readiness: billingPrepReadiness',
  'completedJobStatus =',
  '"completion_exception"',
  '"ready_for_billing_prep"',
  '"blocked"',
  '"Admin marked customer no-show as billable after closeout review."',
  '"Admin marked late cancellation as billable after closeout review."',
  '"Admin marked closeout waived with no charge after review."',
  "adminCompletedBookingCloseoutApiPath",
]) {
  assertIncludes(closeoutSaveBlock, fragment, `closeout save mapping ${fragment}`);
}

for (const fragment of [
  "No-show Bill",
  "Late Cancel Bill",
  "Waive",
  "Customer no-show billing review ready",
  "Late cancellation billing review ready",
  "Waived / no charge closeout",
  "completedTripCloseoutBillableExceptionReviewed",
  "completedTripCloseoutNoChargeExceptionClosed",
]) {
  assertIncludes(closeoutReviewLogicBlock + closeoutReviewMarkupBlock, fragment, `closeout UI ${fragment}`);
}

assert.equal(
  countOccurrences(appPage, 'data-admin-completed-trip-closeout-review="true"'),
  1,
  "No-show/late-cancel control must reuse the existing completed closeout surface.",
);
assert.equal(
  countOccurrences(appPage, 'data-admin-closeout-to-billing-preparation-review="true"'),
  1,
  "No-show/late-cancel control must not duplicate the billing-prep surface.",
);

for (const fragment of [
  '(completedJobStatus === "completed" || completedJobStatus === "completion_exception")',
  "function savedBookingCloseoutBillingDispositionLabel",
  '"Customer no-show"',
  '"Late cancellation"',
  '"Closeout exception ready / amount needed"',
  "Enter the approved customer amount before previewing or issuing.",
]) {
  assertIncludes(unbilledBridgeBlock, fragment, `customers unbilled bridge ${fragment}`);
}

for (const fragment of [
  "Enter the approved customer amount before issuing. This prevents under-billing or over-billing.",
  "Click Preview Invoice first. If you changed amount, due date, folder, adjustment reason, or card payment option, refresh the preview before issuing.",
  "Preview first, then create the PDF from the current reviewed details.",
]) {
  assertIncludes(invoiceIssueBlock, fragment, `invoice amount/preview guard ${fragment}`);
}

for (const source of [monthlyGrouping, tripCandidates]) {
  assertIncludes(
    source,
    '(completedJobStatus === "completed" || completedJobStatus === "completion_exception")',
    "monthly helpers include ready closeout exceptions only through existing readiness flags",
  );
  assertIncludes(source, 'billingPrepReadiness === "ready"', "monthly helpers require ready billing prep");
}
assertIncludes(tripCandidates, "Ready closeout has no draft trip link yet.", "trip candidate neutral ready text");

for (const forbiddenSchemaFragment of [
  "'customer-no-show-billable'",
  "'late-cancellation-billable'",
  "'waived-no-charge'",
  "no_show",
  "late_cancel",
  "billing_disposition",
]) {
  assertExcludes(closeoutPersistence, forbiddenSchemaFragment, "closeout persistence enum/schema stays unchanged");
  assertExcludes(closeoutMigration, forbiddenSchemaFragment, "closeout migration stays unchanged");
}

for (const source of [closeoutSaveBlock, closeoutReviewLogicBlock, closeoutReviewMarkupBlock, unbilledBridgeBlock]) {
  assertExcludes(
    source,
    /\/api\/admin-no-show|\/api\/admin-late-cancel|\/api\/admin-closeout-billing-control/i,
    "no duplicate no-show/late-cancel route",
  );
  assertExcludes(
    source,
    /stripe|payment link|card charge|bank debit|provider job send|driver payout|PayNow payout/i,
    "no no-show/late-cancel payment, payout, or provider activation",
  );
}

for (const source of [bookingUiGuard, appSmokeGuard, mobileGuard]) {
  assertIncludes(source, "No-show Bill", "browser guards include no-show control");
  assertIncludes(source, "Late Cancel Bill", "browser guards include late-cancel control");
  assertIncludes(source, "Waive", "browser guards include waive control");
}

console.log("No-show / late-cancellation billing control guard passed");
