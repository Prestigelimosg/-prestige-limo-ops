import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hourlyHelperPath = "lib/hourly-billing.ts";
const localInvoicesHelperPath = "lib/customer-local-invoices.ts";
const customersPagePath = "app/customers/page.tsx";
const mockCustomersPath = "app/customers/_data/mock-customers.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-hourly-invoice-auto-calculation-guard.mjs";

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

const [hourlyHelper, localInvoicesHelper, customersPage, mockCustomers, ledger, preactivationSuite] =
  await Promise.all([
    readFile(hourlyHelperPath, "utf8"),
    readFile(localInvoicesHelperPath, "utf8"),
    readFile(customersPagePath, "utf8"),
    readFile(mockCustomersPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);

const invoiceIssuePanel = sectionBetween(
  customersPage,
  'data-customer-invoice-issue-panel="true"',
  "</main>",
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Hourly Invoice Auto Calculation Lock",
  "\n### ",
);

for (const fragment of [
  "export const hourlyBillingDefaultRateCents = 6500;",
  "function parseClockTimeToMinutes(value: string)",
  "export function calculateActualTimeMinutesFromClockTimes(startTime: string, endTime: string)",
  "const totalMinutes = sameDayMinutes > 0 ? sameDayMinutes : sameDayMinutes + 24 * 60;",
  "export function calculateHourlyInvoiceAmountCents(",
  "const billableHours = billableMinutes / hourlyBillingUnitMinutes;",
  "amountCents: Math.round(billableHours * rateCents)",
]) {
  assertIncludes(hourlyHelper, fragment, `hourly helper fragment ${fragment}`);
}

for (const fragment of [
  "lineItems?: CustomerLocalInvoiceLineItem[];",
  "const lineItems =",
  "input.lineItems?.length",
  "lineItems,",
]) {
  assertIncludes(localInvoicesHelper, fragment, `local invoice helper line item fragment ${fragment}`);
}

for (const fragment of [
  "calculateHourlyInvoiceAmountCents",
  "hourlyBillingDefaultRateCents",
  "hourlyBillingGraceRuleText",
  "function getRegularCustomerHourlyInvoiceReview(form: RegularCustomerBookingForm)",
  "const regularCustomerHourlyInvoiceReview = useMemo(",
  "function getCustomerInvoiceDriverActualTimeCalculatedAmount(",
  "Driver JC timing: ${actualMinutes} actual min / ${billableMinutes} billable min",
  "invoiceLineDescription: `Driver JC actual time | ${actualMinutes} actual min | ${billableMinutes} billable min | ${rateLabel}`",
  "customerInvoiceCalculatedLineDescription ||",
  "row.invoiceLineDescription ||",
  "lineItems: [",
]) {
  assertIncludes(customersPage, fragment, `customers hourly invoice fragment ${fragment}`);
}

for (const fragment of [
  'data-unbilled-customer-billing-breakdown={row.key}',
  'data-customer-invoice-prep-billing-breakdown="true"',
]) {
  assertIncludes(customersPage, fragment, `invoice prep calculation fragment ${fragment}`);
}

for (const fragment of [
  'data-customer-invoice-prep-next-action="true"',
  'data-customer-invoice-issued-local-email={invoice.invoiceNumber}',
  'data-customer-invoice-issued-local-mark-paid={invoice.invoiceNumber}',
  'data-customer-invoice-issued-local-mark-unpaid={invoice.invoiceNumber}',
  'data-customer-invoice-issued-local-status-toggle={invoice.invoiceNumber}',
]) {
  assertIncludes(invoiceIssuePanel, fragment, `invoice issue action fragment ${fragment}`);
}

for (const fragment of [
  "handleCustomerInvoiceEmailAction(invoice)",
  "markIssuedCustomerInvoicePaid(invoice)",
  "markIssuedCustomerInvoiceUnpaid(invoice)",
  "saveCustomerLocalInvoice(paidInvoice)",
  "saveCustomerLocalInvoice(unpaidInvoice)",
]) {
  assertIncludes(customersPage, fragment, `invoice action handler fragment ${fragment}`);
}

for (const fragment of [
  'id: "hourly-test-customer"',
  'companyName: "Hourly Test Customer"',
  'invoicePrefix: "HTC"',
  "Mock/local browser invoice testing only",
]) {
  assertIncludes(mockCustomers, fragment, `mock hourly customer fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /sendMail|new\s+Resend|api\.telegram\.org|twilio|messages\.create|client\.messages/i,
  /checkout\.sessions|paymentIntent|paymentLink|loadStripe|new\s+Stripe/i,
  /createClient|service_role|process\.env/i,
  /driver payout|PayNow payout|payout comparisons|internal admin notes|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(invoiceIssuePanel, forbiddenPattern, "hourly invoice issue provider/db/privacy boundary");
  assertExcludes(localInvoicesHelper, forbiddenPattern, "local invoice helper provider/db/privacy boundary");
}

for (const phrase of [
  "Admin Customers can create a mock/local hourly booking row with actual start time, actual end time, and a default `$65/hr` rate.",
  "Hourly invoice amounts use the locked 15-minute grace rule: 16 minutes or more starts the next chargeable hour.",
  "Preparing an hourly unbilled row carries the calculated amount and calculation breakdown into the Send Invoice Workbench.",
  "The generated invoice/PDF line item includes the hourly start/end, actual minutes, billable minutes, and hourly rate.",
  "Issued invoices show compact PDF, gated Email, and one Paid/Unpaid status toggle in the issued invoice table.",
  "The added `Hourly Test Customer` is mock/local test data only and does not create real customer, payment, provider, bank, or Supabase records.",
  "Guard coverage lives in `scripts/test-customer-hourly-invoice-auto-calculation-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation hourly invoice guard registration");

console.log("Customer hourly invoice auto calculation guard passed");
