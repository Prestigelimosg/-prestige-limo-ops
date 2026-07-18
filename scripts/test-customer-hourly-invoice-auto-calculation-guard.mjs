import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
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

const [customersPage, ledger, preactivationSuite] = await Promise.all([
  readFile(customersPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const savedBookingBillingRow = sectionBetween(
  customersPage,
  "function savedBookingUnbilledRow",
  "function customerBillingScopeNeedsReview",
);
const activeMonthlyPreparation = sectionBetween(
  customersPage,
  "async function readAdminRateSetupForDspInvoice",
  "async function readCustomerInvoiceDriverActualTimeSummary",
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Hourly Invoice Auto Calculation Lock",
  "\n### ",
);

for (const fragment of [
  "const billingAmountCents = savedBookingCustomerBillingAmountCents(booking);",
  "const billingAmountLabel = billingAmountCents ? formatInvoiceAmount(billingAmountCents) : \"\";",
  'amount: billingAmountLabel || "Draft amount not set"',
  "Enter the approved customer amount before previewing or issuing.",
  "invoiceLineDescription: `${billableServiceLabel} - ${reference}`",
]) {
  assertIncludes(savedBookingBillingRow, fragment, `saved reviewed amount boundary ${fragment}`);
}

for (const fragment of [
  "async function prepareMonthlyBillingGroupForInvoice(group: CustomerMonthlyBillingGroup)",
  "prepareMonthlyBillingDspRowsForInvoice",
  "readCustomerInvoiceDriverActualTimeSummary",
  "calculateDspCustomerInvoiceAmountCents",
  "resolvePricing",
  "adminRateSetupApiPath",
  "amount: monthlyBillingInvoiceAmountInput(firstRow)",
  "lineDescription: monthlyBillingInvoiceLineDescription(firstRow)",
  "additionalRows.map((row) => ({",
  "amount: monthlyBillingInvoiceAmountInput(row)",
  "lineDescription: monthlyBillingInvoiceLineDescription(row)",
  "Enter approved amounts before Preview, Draft, Issue, or Email.",
  "function prepareSelectedCustomerMonthlyInvoice()",
  "void prepareMonthlyBillingGroupForInvoice(selectedCustomerPrimaryMonthlyBillingGroup);",
]) {
  assertIncludes(activeMonthlyPreparation, fragment, `active monthly preparation ${fragment}`);
}

for (const forbidden of [
  "getCustomerInvoiceDriverActualTimeCalculatedAmount",
  "calculateHourlyInvoiceAmountCents",
  "calculateHourlyBillableMinutes",
  "hourlyBillingDefaultRateCents",
  "customerInvoiceCalculatedAmountCents",
  "customerInvoiceCalculatedBillingBreakdown",
  "customerInvoiceCalculatedLineDescription",
]) {
  assertExcludes(activeMonthlyPreparation, forbidden, `active monthly automatic amount ${forbidden}`);
}

assertExcludes(
  customersPage,
  'onClick={() => prepareCustomerInvoiceFromUnbilled(row)}',
  "removed per-row automatic invoice preparation action",
);
assertExcludes(
  customersPage,
  'data-unbilled-customer-billing-breakdown={row.key}',
  "removed global unbilled-row calculation display",
);

for (const phrase of [
  "The removed mock/local hourly unbilled-row auto-calculation UI is not part of the active selected-customer monthly invoice workflow.",
  "Non-DSP selected-customer monthly preparation copies only an existing saved reviewed customer amount; when no approved amount exists, the row remains `Draft amount not set` and admin must enter and review it before Preview, Draft, Issue, or Email.",
  "The active path does not use the mock/local default `$65/hr` calculator or customer-page automatic hourly amount state.",
  "DSP is the explicit exception: selected-customer monthly preparation requires actual Driver OTS/JC timing, applies the established DSP whole-hour rule, and resolves the CRM vehicle rate by verified identity IDs before populating the existing Create Invoice form.",
  "Guard coverage lives in `scripts/test-customer-hourly-invoice-auto-calculation-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation hourly invoice guard registration");

console.log("Customer hourly invoice fail-safe amount guard passed");
