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
  "</main>",
);
const invoiceLoadEffect = sectionBetween(
  customersPage,
  "async function loadIssuedCustomerInvoices()",
  "void loadIssuedCustomerInvoices();",
);
const ledgerSection = sectionBetween(ledger, "### Customers Invoice Workspace Cleanup", "\n### ");
const serverAuthorityLedgerSection = sectionBetween(
  ledger,
  "### Server-Authoritative Customer Invoice Display",
  "\n### ",
);

assertIncludes(
  customersPage,
  "useState<CustomerDisplayedInvoiceRecord[]>([])",
  "Customers invoice list must start empty while the guarded server read resolves",
);
assertIncludes(
  invoiceLoadEffect,
  "setIssuedCustomerInvoices(serverIssuedRecords);",
  "successful server invoice read must replace browser-local fallback records",
);
assertIncludes(
  invoiceLoadEffect,
  "setIssuedCustomerInvoices(localInvoices);",
  "browser-local invoices must remain a read-failure fallback only",
);
assertExcludes(
  invoiceLoadEffect,
  "mergeDisplayedInvoices(serverIssuedRecords, localInvoices)",
  "successful server invoice read must not merge browser-local fallback records",
);

for (const phrase of [
  "Production diagnosis found zero rows in every Supabase invoice table while the Customers page still displayed 14 pending invoices from the legacy Chrome-local fallback.",
  "A successful guarded admin invoice read is authoritative and replaces browser-local fallback rows instead of merging them into the live billing overview.",
  "The invoice list starts empty while the guarded read resolves, preventing stale local invoices from flashing before the server response.",
  "Browser-local invoices remain available only when the guarded admin invoice read fails; no local record is deleted by this display repair.",
  "The current 1 August automation fixtures in Supabase bookings and customer records remain untouched.",
]) {
  assertIncludes(serverAuthorityLedgerSection, phrase, `server-authority ledger phrase: ${phrase}`);
}

for (const fragment of [
  'const customerInvoiceWorkspaceTabs: Array<{ label: string; value: CustomerInvoiceWorkspaceTab }> = [];',
  'useState<CustomerInvoiceWorkspaceTab>("create-invoice")',
  'data-customer-billing-overview="true"',
  'data-selected-customer-dashboard="true"',
  'data-customer-folder-finder-list="true"',
  'data-selected-customer-prepare-monthly-invoice="true"',
  'data-selected-customer-monthly-invoice-summary="true"',
  'data-customer-invoice-workspace="true"',
  'data-customer-billing-workbench-drawer="true"',
  'data-customer-billing-workbench-summary="true"',
  'data-customer-billing-workbench-contents="true"',
  "Advanced invoice workbench",
  "Prepare monthly invoice",
  "Send Invoice Workbench",
  "Customers & Invoices",
  'className="rounded-lg border border-sky-300 border-l-8 bg-sky-50 shadow-sm"',
  'className="rounded-lg border border-emerald-300 border-l-8 bg-emerald-50 shadow-sm"',
  '"rounded-lg border border-violet-300 border-l-8 bg-violet-50 shadow-sm"',
  "plainInvoiceSelectedJobReviewActive",
  'data-selected-job-invoice-actions="true"',
]) {
  assertIncludes(customersPage, fragment, `customers invoice workspace fragment ${fragment}`);
}

assertIncludes(
  customersPage,
  "{selectedCustomerPrimaryMonthlyBillingGroup ? (",
  "Selected-customer monthly invoice action must require an exact billing account/month group.",
);

assert.equal(
  customersPage.includes('data-customer-folder-support-drawer="true"'),
  false,
  "duplicate customer folder support drawer must not return to the daily Customers page.",
);

assert.equal(
  customersPage.indexOf('data-customer-billing-overview="true"') <
    customersPage.indexOf('data-selected-customer-dashboard="true"') &&
    customersPage.indexOf('data-selected-customer-dashboard="true"') <
      customersPage.indexOf('data-customer-billing-workbench-drawer="true"') &&
    customersPage.indexOf('data-customer-billing-workbench-drawer="true"') <
      customersPage.indexOf('data-customer-invoice-workspace="true"'),
  true,
  "daily Customers page order must be overview, selected-customer workspace, then collapsed invoice workbench drawer.",
);

for (const forbiddenFragment of [
  'data-customer-internal-staff-notice="true"',
  "Internal Staff Dashboard — Not Customer-Facing",
  "Use /book for customer booking requests.",
  'data-customer-summary-strip="true"',
  'data-customer-folder-finder="true"',
  'data-customer-monthly-billing-queue="true"',
  'data-customer-monthly-billing-group-select="true"',
  'data-customer-monthly-billing-prepare-group="true"',
  'data-customer-monthly-billing-group-summary="true"',
  'data-unbilled-customers-sector="true"',
  "Monthly Billing Queue",
  "Prepare monthly bill",
  '{ label: "Statements", value: "statements" }',
  '{ label: "Outstanding", value: "outstanding" }',
  '{ label: "Follow-up", value: "follow-up" }',
  'useState<CustomerInvoiceWorkspaceTab>("statements")',
  "const showLegacyMockCustomerWorkbench = false;",
  'data-customer-invoice-workspace-panel="statements"',
  'data-customer-invoice-workspace-panel="outstanding"',
  'data-customer-invoice-workspace-panel="follow-up"',
  'data-monthly-statement-preview="true"',
  'data-outstanding-payments-review="true"',
  'data-collection-follow-up-queue="true"',
  'data-customer-advanced-booking-drawer="true"',
  'data-customer-debug-tools-drawer="true"',
  'data-regular-customer-booking-form-section="true"',
  'data-regular-customer-booking-list-preview="true"',
  'data-mock-payment-event-log="true"',
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
  "Customers page daily flow is compact: the customer billing overview opens one selected-customer workspace, and the fake payment summary strip is removed.",
  "The redundant `Internal Staff Dashboard — Not Customer-Facing` banner is removed from the authenticated Customers page. Route authorization and all customer/public privacy boundaries remain unchanged.",
  "The three established top-level workflow sectors are visually separated in place: Customer Billing Overview uses a blue accent, Selected Customer uses a green accent, and Advanced Invoice Workbench uses a violet accent. Their order, controls, data attributes, and wired consumers are unchanged.",
  "The broad app smoke follows the established visible `Find saved jobs` and `Driver Message` markers instead of the retired `Load Bookings` and `Driver Dispatch` labels. Its Operational Snapshot scenario keeps review-pending status but no longer expects the customer-request decision controls removed from that hidden panel; the dedicated visible-queue identity guard and booking adapter contract continue protecting the established decision/PATCH lane. Application workflows and write paths are unchanged.",
  "The same browser smoke now requires Customer Billing Overview on desktop and mobile and rejects the retired folder-finder helper plus global Monthly Billing Queue, matching the focused cleanup guard. Selected-customer monthly preparation and the advanced invoice workbench remain the only established invoice workflow; no invoice, payment, send, or persistence behavior changes.",
  "Its final public-route leak sweep uses that same Customer Billing Overview as the `/customers`-only visibility boundary while continuing to reject the retired folder-index handoff and all admin, driver, finance, and mock/archive surfaces from public routes.",
  "The removed global Monthly Billing Queue stays retired; real closeout-ready saved bookings are grouped by saved billing account/month inside the selected customer workspace.",
  "The selected-customer `Prepare monthly invoice` action requires an exact billing account/month group and loads it into the existing collapsed advanced invoice workbench.",
  "The invoice workbench no longer exposes the mock statement, outstanding, or follow-up tabs in daily operation.",
  "The duplicate folder handoff support drawer, advanced booking mock drawer, and mock logs are removed from the rendered daily customer dashboard.",
  "This is UI-only structure cleanup; it does not activate invoice/PDF/payment/provider sending, DB writes, env changes, GPS/live location, billing/payout, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-customers-invoice-workspace-cleanup-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customers invoice workspace cleanup guard registration");

console.log("Customers invoice workspace cleanup guard passed");
