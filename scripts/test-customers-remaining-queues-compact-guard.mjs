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
  "Monthly Billing Queue",
  "Customer Billing Overview",
  "type CustomerBillingOverviewRow = {",
  "type SelectedCustomerBillingInvoiceRow = {",
  "customerBillingOverviewRows",
  "customerBillingOverviewTotals",
  "selectedCustomerBillingInvoiceRows",
  "selectedCustomerBillingInvoiceDetail",
  "async function viewCustomerJobsFromBillingOverviewRow(row: CustomerBillingOverviewRow)",
  'data-customer-billing-overview="true"',
  "data-customer-billing-overview-row={row.customerFolderKey}",
  "data-customer-billing-overview-open={row.customerFolderKey}",
  'data-selected-customer-invoice-list="true"',
  "data-selected-customer-invoice-open={invoice.key}",
  "data-selected-customer-invoice-review-edit={invoice.key}",
  'data-selected-customer-invoice-open-workbench="true"',
  "data-selected-customer-invoice-row={invoice.key}",
  'data-selected-customer-invoice-detail="true"',
  "function reviewSelectedCustomerInvoice(invoiceKey: string)",
  "function openAdvancedInvoiceWorkbenchForReview()",
  "data-selected-customer-invoice-detail-item={`${selectedCustomerBillingInvoiceDetail.key}-${itemIndex}`}",
  "Advanced invoice workbench",
  "Open only after review",
  "Prepare monthly bill",
  "async function viewCustomerJobsFromBillingRow(row: UnbilledCustomerRow)",
  "readRegularCustomerSavedBookingsForTarget(",
  'data-customer-folder-finder-name-jobs={customer.customerFolderKey}',
  "onClick={() => viewCustomerFolderJobs(customer)}",
  'data-unbilled-customer-view-jobs={row.key}',
  "onClick={() => viewCustomerJobsFromBillingRow(row)}",
  "Search the customer or company, open the correct folder, then use Monthly Billing Queue below to",
  "Choose the customer/month with ready completed jobs, then click Prepare monthly bill.",
  "before any invoice number, PDF, payment, or send action.",
  "Same company names stay",
  "separate by saved account ID and passenger scope.",
  'data-customer-monthly-billing-group-select="true"',
]) {
  assertIncludes(customersPage, fragment, `real monthly billing queue fragment ${fragment}`);
}

for (const fragment of [
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
