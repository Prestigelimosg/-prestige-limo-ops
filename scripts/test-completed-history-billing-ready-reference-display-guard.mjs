import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const customersPagePath = "app/customers/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-completed-history-billing-ready-reference-display-guard.mjs";

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

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end);
}

const [appPage, customersPage, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(customersPagePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const compactReferenceHelper = sectionBetween(
  appPage,
  "function compactBookingReference",
  "function cleanDispatchHandoffBookingReference",
);
const closeoutPayloadBuilder = sectionBetween(
  appPage,
  "function buildCompletedTripCloseoutReviewPayload",
  "async function updateAppliedAdminBookingOperationalSnapshot",
);
const rowBillingReadyAction = sectionBetween(
  appPage,
  "async function markCompletedHistoryBookingBillingReady",
  "function bookingRecordCanBeDeletedFromCompletedHistory",
);
const completedHistoryPanel = sectionBetween(
  appPage,
  "const completedBookingsPanel = (",
  "const jobCardCopyEditState =",
);
const customerCompactReferenceHelper = sectionBetween(
  customersPage,
  "function compactCustomerBookingReference",
  "function savedBookingCountLabel",
);
const customerFolderJobsSection = sectionBetween(
  customersPage,
  'data-customer-folder-jobs-panel="true"',
  'data-unbilled-customers-sector="true"',
);
const monthlyBillingQueueSection = sectionBetween(
  customersPage,
  'data-unbilled-customers-sector="true"',
  'data-customer-invoice-prep-panel="true"',
);
const invoicePrepSection = sectionBetween(
  customersPage,
  'data-customer-invoice-prep-panel="true"',
  'data-customer-invoice-prep-billing-breakdown="true"',
);

for (const fragment of [
  "const structuredReference = reference.match(/^([A-Za-z]+)-(\\d{8})(\\d{4,6})(?:-([A-Za-z0-9]{4,10}))?$/);",
  "return `${prefix}-${suffix}`;",
  "return `${prefix}-${reference.slice(-6)}`;",
]) {
  assertIncludes(compactReferenceHelper, fragment, `admin compact reference helper ${fragment}`);
  assertIncludes(customerCompactReferenceHelper, fragment, `customer compact reference helper ${fragment}`);
}

for (const fragment of [
  "function isCompletedHistoryBillingReadyMessage",
  "const [completedHistoryBillingReadyBookingId, setCompletedHistoryBillingReadyBookingId]",
  "function buildCompletedTripCloseoutReviewPayload",
  "async function markCompletedHistoryBookingBillingReady",
  "data-completed-billing-ready-booking={bookingId}",
  "onClick={() => markCompletedHistoryBookingBillingReady(savedBooking, operationalCard)}",
]) {
  assertIncludes(appPage, fragment, `completed history billing ready source ${fragment}`);
}

for (const fragment of [
  "billing_prep_readiness: billingPrepReadiness",
  "booking_reference: bookingReference",
  "closeout_status: closeoutStatus",
  "completed_job_status: completedJobStatus",
  "dsp_actual_hours_readiness: dspActualHoursReadiness",
  "extra_charges_readiness: extraChargesReadiness",
  "nextStatus === \"ready-locally\" || isBillableCloseoutException",
  "ready_for_billing_prep",
]) {
  assertIncludes(closeoutPayloadBuilder, fragment, `completed closeout payload builder ${fragment}`);
}

for (const fragment of [
  "bookingRecordIsCompletedStatus(bookingRecord)",
  "buildCompletedTripCloseoutReviewPayload({",
  "nextStatus: \"ready-locally\"",
  "Admin marked completed job billing ready from Completed / History.",
  "method: \"POST\"",
  "adminCompletedBookingCloseoutApiPath",
  "Billing readiness saved for ${referenceLabel}. Monthly Billing Queue can pick it up.",
]) {
  assertIncludes(rowBillingReadyAction, fragment, `completed history billing ready action ${fragment}`);
}

for (const fragment of [
  "isCompletedHistoryBillingReadyMessage(rawBookingCompletionMessage)",
  "data-completed-billing-ready-booking={bookingId}",
  "completedHistoryBillingReadyBookingId === bookingId ? \"Saving...\" : \"Billing ready\"",
  "completedHistoryBillingReadyBookingId === bookingId",
]) {
  assertIncludes(completedHistoryPanel, fragment, `completed history billing ready panel ${fragment}`);
}

for (const fragment of [
  "compactCustomerBookingReference(booking.booking_reference, \"Reference unavailable\")",
  "title={savedBookingDisplayText(booking.booking_reference, \"Reference unavailable\")}",
  "{savedBookingDisplayText(booking.booking_reference)}",
]) {
  assertIncludes(customerFolderJobsSection, fragment, `customer folder compact reference ${fragment}`);
}

for (const fragment of [
  "title={row.reference}",
  "{compactCustomerBookingReference(row.reference)}",
]) {
  assertIncludes(monthlyBillingQueueSection, fragment, `monthly billing compact reference ${fragment}`);
}

for (const fragment of [
  "title={customerInvoicePrepRow.reference}",
  "{compactCustomerBookingReference(customerInvoicePrepRow.reference)}",
]) {
  assertIncludes(invoicePrepSection, fragment, `invoice prep compact reference ${fragment}`);
}

for (const forbiddenPattern of [
  /sendMail|new\s+Resend|api\.telegram\.org|twilio|whatsapp/i,
  /navigator\.geolocation|watchPosition|getCurrentPosition/i,
  /invoice number|reserve invoice|payment|PayNow|driver_payout|payout/i,
]) {
  assertExcludes(rowBillingReadyAction, forbiddenPattern, "completed history billing ready action boundary");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation suite registration for completed history billing ready reference display guard",
);

console.log("Completed history billing ready reference display guard passed");
