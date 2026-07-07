import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const hourlyBillingPath = "lib/hourly-billing.ts";
const driverActualTimeRoutePath = "app/api/admin-driver-job-dsp-actual-time-summaries/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-invoice-driver-jc-override-guard.mjs";

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

const [customersPage, hourlyBilling, driverActualTimeRoute, ledger, preactivationSuite] =
  await Promise.all([
    readFile(customersPagePath, "utf8"),
    readFile(hourlyBillingPath, "utf8"),
    readFile(driverActualTimeRoutePath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);

const driverActualTimeReadFunction = sectionBetween(
  customersPage,
  "async function readCustomerInvoiceDriverActualTimeSummary(bookingReference: string)",
  "async function prepareCustomerInvoiceFromUnbilled(row: UnbilledCustomerRow)",
);
const driverActualTimeCalculation = sectionBetween(
  customersPage,
  "function getCustomerInvoiceDriverActualTimeCalculatedAmount(",
  "function regularCustomerBookingFeedbackClass",
);
const prepareFunction = sectionBetween(
  customersPage,
  "async function prepareCustomerInvoiceFromUnbilled(row: UnbilledCustomerRow)",
  "function clearCustomerInvoicePrep()",
);
const issueFunction = sectionBetween(
  customersPage,
  "async function issuePreparedCustomerInvoice()",
  "async function downloadIssuedCustomerInvoice(invoice: CustomerDisplayedInvoiceRecord)",
);
const requestBodyHelper = sectionBetween(
  customersPage,
  "function customerInvoiceRequestBodyFromPreview(documentState: CustomerBillingDocumentState)",
  "async function saveCustomerInvoiceDraft()",
);
const previewFunction = sectionBetween(
  customersPage,
  "function customerInvoiceLineDescriptionForPreview(",
  "function issuePreparedCustomerInvoice()",
);
const previewLineItem = sectionBetween(previewFunction, "lineItems: [", "previewKey:");
const requestBodyLineItems = sectionBetween(
  requestBodyHelper,
  "lineItems: customerInvoicePreview.lineItems,",
  "reference:",
);
const invoicePrepWorkspace = sectionBetween(
  customersPage,
  'data-customer-invoice-prep-panel="true"',
  "</main>",
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Invoice Driver JC Timing And Override Guard",
  "\n### ",
);

for (const fragment of [
  "calculateHourlyBillableMinutes",
  'const adminDriverJobDspActualTimeSummariesApiPath =',
  '"/api/admin-driver-job-dsp-actual-time-summaries"',
  "type CustomerInvoiceDriverActualTimeSummary =",
  "type CustomerInvoiceDriverActualTimeReadState =",
  "type CustomerInvoiceCalculatedAmount =",
  "function isHourlyCustomerInvoiceRow(row: UnbilledCustomerRow)",
  "function validCustomerInvoiceDriverTimingReference(reference: string)",
  "function getCustomerInvoiceDriverActualTimeCalculatedAmount(",
  "customerInvoiceAdjustmentReason",
  "customerInvoiceAmountEdited",
]) {
  assertIncludes(customersPage, fragment, `customers driver JC invoice fragment ${fragment}`);
}

for (const fragment of [
  "export function calculateHourlyBillableMinutes(totalMinutes: number | null | undefined)",
  "export const hourlyBillingDefaultRateCents = 6500;",
  "export const hourlyBillingGraceRuleText =",
]) {
  assertIncludes(hourlyBilling, fragment, `hourly billing helper fragment ${fragment}`);
}

for (const fragment of [
  'summary?.actual_time_status !== "complete"',
  "calculateHourlyBillableMinutes(actualMinutes)",
  "Math.round(billableHours * hourlyBillingDefaultRateCents)",
  "Driver JC timing:",
  "Driver JC actual time |",
  "hourlyBillingGraceRuleText",
]) {
  assertIncludes(driverActualTimeCalculation, fragment, `driver JC calculation fragment ${fragment}`);
}

for (const fragment of [
  "new URLSearchParams({",
  "booking_reference: bookingReference",
  'limit: "1"',
  'headers: {',
  '"x-prestige-admin-purpose": "admin-booking-persistence"',
  'method: "GET"',
  "result.latest_summary",
  "Driver JC timing read could not be completed.",
]) {
  assertIncludes(driverActualTimeReadFunction, fragment, `driver JC read fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /method:\s*"(?:POST|PATCH|PUT|DELETE)"/,
  /saveCustomerLocalInvoice|createCustomerLocalInvoiceRecord|downloadCustomerInvoicePdf/,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio|checkout\.sessions|new\s+Stripe|paymentIntent/i,
]) {
  assertExcludes(driverActualTimeReadFunction, forbiddenPattern, "driver JC timing invoice read function");
}

for (const fragment of [
  "const shouldReadDriverActualTime = isHourlyCustomerInvoiceRow(row) && Boolean(bookingReference);",
  "setCustomerInvoiceCalculatedAmountCents(baseCalculation?.amountCents ?? null);",
  "setCustomerInvoiceCalculatedLineDescription(baseCalculation?.invoiceLineDescription ?? \"\");",
  "customerInvoicePrepRowKeyRef.current !== row.key",
  "getCustomerInvoiceDriverActualTimeCalculatedAmount(row, summary)",
  "setCustomerInvoiceIssueAmount(formatInvoiceAmount(driverCalculation.amountCents).replace(/^\\$/, \"\"));",
  "Driver JC timing loaded into Approved amount.",
]) {
  assertIncludes(prepareFunction, fragment, `prepare driver JC invoice fragment ${fragment}`);
}

for (const fragment of [
  'data-customer-invoice-calculated-amount="true"',
  'data-customer-invoice-calculated-breakdown="true"',
  'data-customer-invoice-driver-jc-timing="true"',
  'data-customer-invoice-override-reason="true"',
  "Adjustment reason",
]) {
  assertIncludes(invoicePrepWorkspace, fragment, `invoice prep workspace UI fragment ${fragment}`);
}

for (const fragment of [
  "customerInvoiceAmountEdited && !customerInvoiceAdjustmentReason.trim()",
  "Enter adjustment reason before issuing an invoice with an edited amount.",
  "[data-customer-invoice-override-reason='true']",
  "if (!customerInvoicePreview || !isCustomerInvoicePreviewCurrent)",
  "Click Preview Invoice first. If you changed amount, due date, folder, adjustment reason, or card payment option, refresh the preview before issuing.",
]) {
  assertIncludes(issueFunction, fragment, `invoice override issue guard fragment ${fragment}`);
}

assertIncludes(
  requestBodyHelper,
  "lineItems: customerInvoicePreview.lineItems",
  "invoice request body preview line items",
);

for (const fragment of [
  "customerInvoiceLineDescriptionForPreview",
  "amountEdited",
  "approved customer amount",
  "preview ready. Review the details below before creating any PDF.",
]) {
  assertIncludes(previewFunction, fragment, `invoice override preview guard fragment ${fragment}`);
}

assertExcludes(
  previewLineItem,
  "customerInvoiceAdjustmentReason",
  "customer PDF invoice preview line item should not print the admin adjustment reason",
);
assertExcludes(
  requestBodyLineItems,
  "customerInvoiceAdjustmentReason",
  "customer PDF invoice request body line item should not print the admin adjustment reason",
);

for (const fragment of [
  "export async function GET(request: Request)",
  "loadAdminDriverJobDspActualTimeSummaries",
  "resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose)",
]) {
  assertIncludes(driverActualTimeRoute, fragment, `driver actual time route fragment ${fragment}`);
}
assertExcludes(driverActualTimeRoute, /export async function (?:POST|PATCH|PUT|DELETE)/, "driver actual time route");

for (const forbiddenPattern of [
  /driver payout|PayNow payout|payout comparisons|customer price/i,
  /internal admin notes|internal finance notes|parser\/debug|mock QA|dev archive/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio|new\s+Stripe|checkout\.sessions|paymentIntent/i,
]) {
  assertExcludes(invoicePrepWorkspace, forbiddenPattern, "customer invoice prep UI privacy/provider boundary");
}

for (const phrase of [
  "Preparing an hourly unbilled invoice row now checks the existing guarded driver JC actual-time summary read path by booking reference.",
  "A completed driver JC timing summary recalculates the customer invoice amount with the locked 15-minute grace hourly rule and the `$65/hr` default rate.",
  "The Approved amount remains editable before issue, but changing it away from the calculated amount requires an Adjustment reason before invoice/PDF creation.",
  "Adjustment reasons stay in admin review feedback and are not printed into the customer PDF line item.",
  "The driver JC invoice read is GET-only through `/api/admin-driver-job-dsp-actual-time-summaries` with `x-prestige-admin-purpose`; it does not write records, send providers, activate payments, or expose driver/customer forbidden data.",
  "Guard coverage lives in `scripts/test-customer-invoice-driver-jc-override-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation driver JC invoice guard registration");

console.log("Customer invoice driver JC timing and override guard passed");
