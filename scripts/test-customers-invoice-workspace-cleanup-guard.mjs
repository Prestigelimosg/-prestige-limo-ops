import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customers-invoice-workspace-cleanup-guard.mjs";

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

const invoiceWorkspace = sectionBetween(
  customersPage,
  'data-customer-invoice-workspace="true"',
  'data-customer-advanced-booking-drawer="true"',
);
const ledgerSection = sectionBetween(ledger, "### Customers Invoice Workspace Cleanup", "\n### ");

for (const fragment of [
  'const customerInvoiceWorkspaceTabs: Array<{ label: string; value: CustomerInvoiceWorkspaceTab }> = [];',
  'useState<CustomerInvoiceWorkspaceTab>("create-invoice")',
  "const showLegacyMockCustomerWorkbench = false;",
  'data-customer-invoice-workspace="true"',
  'data-customer-invoice-workspace-panel="statements"',
  'data-customer-invoice-workspace-panel="outstanding"',
  'data-customer-invoice-workspace-panel="follow-up"',
  'data-customer-folder-finder="true"',
  'data-customer-monthly-billing-queue="true"',
  'data-customer-monthly-billing-group-select="true"',
  'data-customer-monthly-billing-prepare-group="true"',
  'data-customer-monthly-billing-group-summary="true"',
  'data-unbilled-customers-sector="true"',
  'data-customer-billing-workbench-drawer="true"',
  'data-customer-billing-workbench-summary="true"',
  'data-customer-billing-workbench-contents="true"',
  'data-customer-advanced-booking-drawer="true"',
  'data-customer-debug-tools-drawer="true"',
  "Invoice workbench",
  "Monthly Billing Queue",
  "Prepare monthly bill",
  "Send Invoice Workbench",
  "Customers & Invoices",
]) {
  assertIncludes(customersPage, fragment, `customers invoice workspace fragment ${fragment}`);
}

assertIncludes(
  customersPage,
  "{selectedMonthlyBillingGroup ? (",
  "Monthly Billing Queue prepare action must be conditional on selecting an exact billing account/month group.",
);

assert.equal(
  (customersPage.match(/data-monthly-statement-preview="true"/g) ?? []).length,
  1,
  "customers page legacy archive must keep one Monthly Account Statement Preview section while it is not exposed.",
);

assert.equal(
  customersPage.indexOf('useState<CustomerInvoiceWorkspaceTab>("create-invoice")') <
    customersPage.indexOf('data-customer-invoice-workspace-panel="statements"'),
  true,
  "legacy statement previews must not be the default invoice workspace tab.",
);

assert.equal(
  customersPage.indexOf("const showLegacyMockCustomerWorkbench = false;") <
    customersPage.indexOf('data-customer-advanced-booking-drawer="true"'),
  true,
  "legacy customer mock workbench must be behind the false render gate.",
);

assert.equal(
  customersPage.indexOf("const showLegacyMockCustomerWorkbench = false;") <
    customersPage.indexOf('data-customer-debug-tools-drawer="true"'),
  true,
  "legacy customer support/mock logs must be behind the false render gate.",
);

assert.equal(
  customersPage.includes('data-customer-folder-support-drawer="true"'),
  false,
  "duplicate customer folder support drawer must not return to the daily Customers page.",
);

assert.equal(
  customersPage.indexOf('data-customer-folder-finder="true"') <
    customersPage.indexOf('data-unbilled-customers-sector="true"') &&
    customersPage.indexOf('data-customer-monthly-billing-queue="true"') <
      customersPage.indexOf('data-customer-billing-workbench-drawer="true"') &&
    customersPage.indexOf('data-customer-billing-workbench-drawer="true"') <
      customersPage.indexOf('data-customer-invoice-workspace="true"'),
  true,
  "daily Customers page order must be finder, monthly billing queue, then collapsed invoice workbench drawer.",
);

for (const forbiddenFragment of [
  'data-customer-summary-strip="true"',
  '{ label: "Statements", value: "statements" }',
  '{ label: "Outstanding", value: "outstanding" }',
  '{ label: "Follow-up", value: "follow-up" }',
  'useState<CustomerInvoiceWorkspaceTab>("statements")',
  "Dropdown selected",
  "Billing workbench and mock review queues",
  "All unbilled customers",
  "Folder pending",
  "getMockUnbilledCustomerRows()",
  "localCustomerFolderSavedBookingTargets",
]) {
  assertExcludes(customersPage, forbiddenFragment, "customer monthly billing queue cleanup");
}

for (const forbiddenPattern of [
  /fetch\(|\/api\/|createClient|service_role|process\.env/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio/i,
  /navigator\.geolocation|watchPosition|getCurrentPosition/i,
  /driver payout|PayNow payout|payout comparisons|internal finance notes/i,
  /internal admin notes|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(invoiceWorkspace, forbiddenPattern, "invoice workspace cleanup UI-only/privacy boundary");
}

for (const phrase of [
  "Customers page daily flow is compact: customer finder and Monthly Billing Queue stay visible for normal operation; the fake payment summary strip is removed.",
  "The Monthly Billing Queue groups real closeout-ready saved bookings by saved billing account/month and no longer mixes mock/local draft rows into the visible billing queue.",
  "The invoice workbench no longer exposes the mock statement, outstanding, or follow-up tabs in daily operation.",
  "The duplicate folder handoff support drawer, advanced booking mock drawer, and mock logs are removed from the rendered daily customer dashboard.",
  "This is UI-only structure cleanup; it does not activate invoice/PDF/payment/provider sending, DB writes, env changes, GPS/live location, billing/payout, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-customers-invoice-workspace-cleanup-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customers invoice workspace cleanup guard registration");

console.log("Customers invoice workspace cleanup guard passed");
