import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customers-remaining-queues-compact-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must not include ${fragment}.`);
}

const [customersPage, preactivationSuite] = await Promise.all([
  readFile(customersPagePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

for (const fragment of [
  "Customer Billing Overview",
  "type CustomerBillingOverviewRow = {",
  "type SelectedCustomerBillingInvoiceRow = {",
  "customerBillingOverviewRows",
  "customerBillingOverviewTotals",
  "selectedCustomerBillingInvoiceRows",
  "selectedCustomerBillingInvoiceDetail",
  "selectedCustomerMonthlyBillingGroups",
  "selectedCustomerPrimaryMonthlyBillingGroup",
  "selectedCustomerWorkspaceOpen",
  "function prepareSelectedCustomerMonthlyInvoice()",
  'data-customer-billing-overview="true"',
  'data-selected-customer-dashboard="true"',
  'data-customer-folder-finder-list="true"',
  "data-customer-billing-overview-row={row.customerFolderKey}",
  "data-customer-billing-overview-open={row.customerFolderKey}",
  'data-selected-customer-prepare-monthly-invoice="true"',
  'data-selected-customer-no-monthly-invoice-ready="true"',
  'data-selected-customer-monthly-invoice-summary="true"',
  'data-selected-customer-back-to-all="true"',
  'data-selected-customer-invoice-list="true"',
  "data-selected-customer-invoice-open={invoice.key}",
  "data-selected-customer-invoice-view={invoice.key}",
  "data-selected-customer-invoice-pdf={invoice.key}",
  "data-selected-customer-invoice-email={invoice.key}",
  "data-selected-customer-invoice-paid={invoice.key}",
  "data-selected-customer-invoice-row={invoice.key}",
  'data-selected-customer-invoice-detail="true"',
  "function reviewSelectedCustomerInvoice(invoiceKey: string)",
  "advancedInvoiceWorkbenchVisible",
  "data-selected-customer-invoice-detail-item={`${selectedCustomerBillingInvoiceDetail.key}-${itemIndex}`}",
  "Advanced invoice workbench",
  "Open only after review",
  "Prepare monthly invoice",
  "readRegularCustomerSavedBookingsForTarget(",
]) {
  assertIncludes(customersPage, fragment, `selected-customer billing workflow fragment ${fragment}`);
}

for (const fragment of [
  'data-customer-folder-finder="true"',
  'data-customer-monthly-billing-queue="true"',
  'data-customer-monthly-billing-group-select="true"',
  "Monthly Billing Queue",
  "Prepare monthly bill",
  'data-collection-follow-up-queue="true"',
  'data-monthly-statement-preview="true"',
  'data-customer-invoice-workspace-panel="outstanding"',
  'data-customer-invoice-workspace-panel="follow-up"',
  'data-customer-advanced-booking-drawer="true"',
  'data-customer-debug-tools-drawer="true"',
  'data-regular-customer-booking-form-section="true"',
  'data-regular-customer-booking-list-preview="true"',
]) {
  assertExcludes(customersPage, fragment, `removed legacy remaining queue fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation remaining customers queue removal guard registration");

console.log("Customers legacy remaining queues removal guard passed");
