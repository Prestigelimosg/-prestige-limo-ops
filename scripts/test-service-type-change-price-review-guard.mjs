import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const customersPagePath = "app/customers/page.tsx";
const portalPagePath = "app/my-bookings/page.tsx";
const bookPagePath = "app/book/page.tsx";
const hourlyHelperPath = "lib/hourly-billing.ts";
const billablePriceReviewPath = "lib/admin-monthly-invoice-billable-item-price-review-persistence.ts";

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
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);

  return source.slice(start, end);
}

const [appPage, customersPage, portalPage, bookPage, hourlyHelper, billablePriceReview] =
  await Promise.all([
    readFile(appPagePath, "utf8"),
    readFile(customersPagePath, "utf8"),
    readFile(portalPagePath, "utf8"),
    readFile(bookPagePath, "utf8"),
    readFile(hourlyHelperPath, "utf8"),
    readFile(billablePriceReviewPath, "utf8"),
  ]);

const saveBookingSection = sectionBetween(
  appPage,
  "async function saveBooking()",
  "function bookingRecordReferenceCandidates",
);
const saveOperationalSnapshotSection = sectionBetween(
  appPage,
  "async function saveAdminBookingOperationalSnapshot()",
  "async function loadAdminBookingOperationalSnapshots()",
);
const updateAppliedSnapshotSection = sectionBetween(
  appPage,
  "async function updateAppliedAdminBookingOperationalSnapshot()",
  "async function updateAdminCustomerRequestReviewDecision",
);
const serviceChangePromptSection = sectionBetween(
  appPage,
  'data-service-change-price-review="true"',
  'data-job-card-calendar-feedback="true"',
);
const issueInvoiceSection = sectionBetween(
  customersPage,
  "async function issuePreparedCustomerInvoice()",
  "async function downloadIssuedCustomerInvoice",
);
const invoiceIssuePanel = sectionBetween(
  customersPage,
  'data-customer-invoice-issue-panel="true"',
  'data-customer-invoice-draft-list="true"',
);

for (const fragment of [
  "type ServiceChangePriceReview =",
  "type ServiceChangePriceReviewConfirmation =",
  "function canonicalServiceTypeForPriceReview",
  "function buildServiceChangePriceReview",
  "HOURLY|DISPOSAL|STANDBY",
  "TRF|TRANSFER|POINT",
  "DEP|DEPARTURE|DEPART",
  "MNG|ARRIVAL|ARRIVING",
  "reviewedAmountLabel",
  "clean(bookingValue.customerPriceOverride)",
  "clean(bookingValue.manualExtraCharges)",
]) {
  assertIncludes(appPage, fragment, `service change review implementation fragment ${fragment}`);
}

for (const [label, section] of [
  ["Save + CRM", saveBookingSection],
  ["Save Operational Snapshot", saveOperationalSnapshotSection],
  ["Update Applied Snapshot", updateAppliedSnapshotSection],
]) {
  assertIncludes(
    section,
    "resolveServiceChangePriceReviewForSave()",
    `${label} must require service change price review before persistence`,
  );
}

for (const fragment of [
  "Service Change Price Review",
  "data-service-change-price-review-state",
  "data-service-change-price-review-old-service",
  "data-service-change-price-review-new-service",
  "data-service-change-price-review-amount",
  "Booking {serviceChangePriceReview.bookingReference}",
  "Account: {serviceChangePriceReview.customerAccount}. Passenger/traveler:",
  "Price/invoice must be reviewed before billing.",
  "Do not edit an issued invoice silently",
  "adjustment, credit note, or new invoice review",
  "data-service-change-price-review-confirm",
]) {
  assertIncludes(serviceChangePromptSection, fragment, `service change prompt fragment ${fragment}`);
}

for (const fragment of [
  "Click Preview Invoice first.",
  "isCustomerInvoicePreviewCurrent",
  "customerInvoiceRequestBodyFromPreview(\"issued\")",
  "Preview first, then create the PDF from the current reviewed details.",
]) {
  assertIncludes(issueInvoiceSection, fragment, `invoice preview-before-issue fragment ${fragment}`);
}

for (const fragment of [
  "Enter the approved customer amount before issuing.",
  "Enter adjustment reason before issuing an invoice with an edited amount.",
]) {
  assertIncludes(issueInvoiceSection, fragment, `invoice issue safety check ${fragment}`);
}

for (const fragment of [
  "Invoice, quotation, and credit note actions create separated stored billing documents with PDF",
  "Stripe checkout, payment link, card charge, bank debit, payout, provider job send, or automatic",
]) {
  assertIncludes(invoiceIssuePanel, fragment, `invoice issue safety copy ${fragment}`);
}

for (const fragment of [
  "calculateHourlyBillableMinutes(dspTotalMinutes)",
  "Hourly billable minutes must follow the 15-minute grace rule.",
  "DSP actual-time price review is allowed only for DSP/hourly bookings.",
]) {
  assertIncludes(billablePriceReview, fragment, `billable price review guard fragment ${fragment}`);
}

for (const fragment of [
  "hourlyBillingGraceMinutes = 15",
  "hourlyBillingUnitMinutes = 60",
  "16 minutes or more starts the next chargeable hour",
]) {
  assertIncludes(hourlyHelper, fragment, `hourly billing helper fragment ${fragment}`);
}

for (const [label, source] of [
  ["customer portal", portalPage],
  ["public booking", bookPage],
]) {
  assertExcludes(source, "Service Change Price Review", `${label} service change admin prompt`);
  assertExcludes(source, "data-service-change-price-review", `${label} service change admin data attributes`);
  assertExcludes(
    source,
    /driver[_\s-]*payout|paynow[_\s-]*payout|internal[_\s-]*finance|parser[_\s-]*debug|service[_\s-]*role|secret|raw[_\s-]*token/i,
    `${label} forbidden internal billing/debug/secrets surface`,
  );
}

console.log("Service type change price review guard passed.");
