import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customers-folder-finder-unbilled-queue-guard.mjs";

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

const folderFinderSection = sectionBetween(
  customersPage,
  'data-customer-folder-finder="true"',
  'data-unbilled-customers-sector="true"',
);
const unbilledSection = sectionBetween(
  customersPage,
  'data-unbilled-customers-sector="true"',
  'data-customer-invoice-workspace="true"',
);
const invoiceWorkspaceSection = sectionBetween(
  customersPage,
  'data-customer-invoice-workspace="true"',
  'data-customer-advanced-booking-drawer="true"',
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customers Folder Finder And Unbilled Queue",
  "\n### ",
);

for (const fragment of [
  "const customerFolderFinderPageSize = 10;",
  "const [customerFolderFinderPage, setCustomerFolderFinderPage] = useState(1);",
  "const [customerFolderFinderSelectedId, setCustomerFolderFinderSelectedId] = useState(\"\");",
  "const [customerFolderFinderDropdownOpen, setCustomerFolderFinderDropdownOpen] = useState(false);",
  "const selectedCustomerFolderFinderRow = useMemo(",
  "const filteredCustomers = useMemo(() => {",
  "if (customerFolderFinderSelectedId && row.customerId !== customerFolderFinderSelectedId) {",
  "return customerFolderIndexRows.filter((row) => {",
  "const paginatedCustomerFolderFinderRows = filteredCustomers.slice(",
  "const customerFolderFinderDropdownRows = customerFolderIndexRows.slice(",
  "const customerFolderFinderDropdownPageNumbers = Array.from(",
  "function updateCustomerFolderFinderSearch(value: string) {",
  "setCustomerFolderFinderSelectedId(\"\");",
  "function updateCustomerFolderFinderSelection(value: string) {",
  "function showAllCustomerFolderFinderRows(pageNumber = 1) {",
]) {
  assertIncludes(customersPage, fragment, `customer folder finder source fragment ${fragment}`);
}

for (const fragment of [
  "All customers",
  'data-customer-folder-finder-select="true"',
  'data-customer-folder-finder-dropdown-panel="true"',
  'data-customer-folder-finder-all-customers-option="true"',
  'data-customer-folder-finder-dropdown-page-row={customer.customerId}',
  'data-customer-folder-finder-page-numbers="true"',
  'data-customer-folder-finder-dropdown-page-number={pageNumber}',
  "customerFolderFinderDropdownRows.map((customer)",
  "customerFolderFinderDropdownPageNumbers.map((pageNumber)",
  "10 per page",
  'data-customer-folder-finder-search="true"',
  'data-customer-folder-finder-list="true"',
  'data-customer-folder-finder-row={customer.customerId}',
  'data-customer-folder-finder-load-accounts="true"',
  'data-customer-folder-finder-count="true"',
  "{filteredCustomers.length} folders",
  "Load Accounts",
  "min-h-8 whitespace-nowrap",
  "paginatedCustomerFolderFinderRows.map((customer)",
  "Search all customer folders, scan 10 at a time",
  "Dropdown selected ${selectedCustomerFolderFinderRow.customerName}",
]) {
  assertIncludes(folderFinderSection, fragment, `customer folder finder UI fragment ${fragment}`);
}

for (const fragment of [
  'const adminCompletedBookingCloseoutApiPath = "/api/admin-completed-booking-closeouts";',
  "type UnbilledCustomerRow = {",
  "type RegularCustomerSavedBookingReadTarget = {",
  "type RegularCustomerSavedBookingCloseoutRecord = {",
  "type RegularCustomerSavedBookingBillingReadinessState = {",
  "const localCustomerFolderSavedBookingTargets",
  "function savedBookingCloseoutIsBillingReady(",
  "function savedBookingUnbilledRow(",
  "function getMockUnbilledCustomerRows() {",
  "const [",
  "regularCustomerSavedBookingBillingReadinessState,",
  "setRegularCustomerSavedBookingBillingReadinessState,",
  "const [selectedUnbilledCustomerRowKey, setSelectedUnbilledCustomerRowKey] = useState(\"\");",
  "const [preparingUnbilledCustomerRowKey, setPreparingUnbilledCustomerRowKey] = useState(\"\");",
  "const [customerInvoicePrepRowKey, setCustomerInvoicePrepRowKey] = useState(\"\");",
  "const [customerInvoicePrepFeedback, setCustomerInvoicePrepFeedback] = useState(",
  "async function readRegularCustomerSavedBookingsForTarget(",
  "async function loadRegularCustomerSavedBookingsForUnbilledQueue(",
  "await loadRegularCustomerSavedBookingsForUnbilledQueue(",
  "Loading saved bookings for the existing Unbilled Customers queue...",
  "async function loadRegularCustomerSavedBookingBillingReadiness(",
  "fetch(`${adminCompletedBookingCloseoutApiPath}?${params.toString()}`",
  'data-regular-customer-saved-billing-readiness-note="true"',
  "const unbilledCustomerRows = useMemo<UnbilledCustomerRow[]>(() => {",
  "item.billingStatus.trim().toLowerCase().includes(\"unbilled\")",
  "regularCustomerSavedBookingReadState.savedBookings",
  "regularCustomerSavedBookingBillingReadinessState.closeoutsByReference",
  "savedBookingUnbilledRow(",
  "Closeout ready / amount needed",
  "Draft amount not set",
  "Enter the approved customer amount before previewing or issuing.",
  "const selectedUnbilledCustomerRow = useMemo(",
  "const visibleUnbilledCustomerRows = selectedUnbilledCustomerRow",
  "const getUnbilledPrepareButtonLabel = (rowKey: string) =>",
  "\"Preparing\"",
  "\"Prepared\"",
  "function updateSelectedUnbilledCustomerRow(value: string) {",
  "const customerInvoicePrepRow = useMemo(",
  "function prepareCustomerInvoiceFromUnbilled(row: UnbilledCustomerRow) {",
  "setPreparingUnbilledCustomerRowKey(row.key);",
  "setSelectedUnbilledCustomerRowKey(row.key);",
  "setCustomerInvoiceWorkspaceTab(\"statements\");",
  "setOutstandingReviewSearchTerm(row.customerName);",
  "document.querySelector<HTMLElement>(\"[data-customer-invoice-prep-next-action='true']\")",
  "Review the amount and route, then issue only when the invoice is correct.",
  "function clearCustomerInvoicePrep() {",
]) {
  assertIncludes(customersPage, fragment, `unbilled customers source fragment ${fragment}`);
}

for (const fragment of [
  'data-unbilled-customers-count="true"',
  'data-unbilled-customers-dropdown="true"',
  'data-unbilled-customers-select="true"',
  'data-unbilled-customers-scroll-list="true"',
  'data-unbilled-customers-list="true"',
  'data-unbilled-customer-row={row.key}',
  'data-unbilled-customer-prepare-invoice={row.key}',
  'data-unbilled-customer-open-folder={row.key}',
  'data-unbilled-customers-boundary="true"',
  "Prepare",
  "Review these before sending invoices so unbilled or statement-needed accounts are not missed.",
  "All unbilled customers",
  "visibleUnbilledCustomerRows.map((row)",
]) {
  assertIncludes(unbilledSection, fragment, `unbilled customers UI fragment ${fragment}`);
}

for (const duplicateFragment of [
  'data-unbilled-customers-selected-label="true"',
  "preparedUnbilledCustomerLabel",
]) {
  assertExcludes(unbilledSection, duplicateFragment, "duplicate unbilled customer selector");
}

for (const fragment of [
  'data-customer-invoice-prep-panel="true"',
  'ref={customerInvoicePrepPanelRef}',
  'data-customer-invoice-prep-next-action="true"',
  'data-customer-invoice-prep-active={customerInvoicePrepRow.key}',
  'data-customer-invoice-prep-open-folder="true"',
  'data-customer-invoice-prep-clear="true"',
  'data-customer-invoice-prep-empty="true"',
  'data-customer-invoice-prep-feedback="true"',
  "No customer loaded. Use Prepare in Unbilled Customers to focus one invoice job here.",
]) {
  assertIncludes(invoiceWorkspaceSection, fragment, `invoice prep handoff UI fragment ${fragment}`);
}

for (const forbiddenPattern of [
  />\s*Open Customer Folder\s*</,
  /lg:grid-cols-3/,
  /fetch\(|\/api\/|createClient|service_role|process\.env/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio/i,
  /navigator\.geolocation|watchPosition|getCurrentPosition/i,
  /driver payout|PayNow payout|payout comparisons|customer price/i,
  /internal admin notes|internal finance notes|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(folderFinderSection, forbiddenPattern, "customer folder finder compact/privacy boundary");
  assertExcludes(unbilledSection, forbiddenPattern, "unbilled customers compact/privacy boundary");
  assertExcludes(invoiceWorkspaceSection, forbiddenPattern, "invoice prep compact/privacy boundary");
}

for (const phrase of [
  "Customers page now has a visible Customer Folder Finder that searches all loaded customer folders and paginates the compact folder rows 10 per page by default.",
  "The finder uses a visible `All customers` dropdown for direct folder selection; it shows 10 customer folders at a time and keeps numbered page buttons inside the dropdown for larger 200-plus account lists.",
  "The finder keeps the existing guarded `Load Accounts` control visible as a compact one-line button, with the folder count shown as a small `1-10 of N folders` chip; that same button now refreshes the guarded saved-booking bridge for the existing Unbilled Customers queue without adding a new route/API.",
  "A new Unbilled Customers checkpoint sits before the invoice workspace so unbilled draft rows and statement-needed account rows are visible before invoice work starts.",
  "Guarded saved-booking reads now check the existing completed closeout status for those references and bridge only closeout-ready saved bookings into the existing Unbilled Customers queue with `Draft amount not set`.",
  "Each unbilled row has a compact `Prepare` action that changes through `Preparing` to `Prepared`, loads that exact customer/job into the Send Invoice Workbench prep strip, opens the Statements tab, narrows the Outstanding search to that customer, and focuses the next workbench action.",
  "The finder no longer shows a separate page-size dropdown or separate previous/next buttons; the Unbilled Customers list keeps one dropdown plus a compact scrollable row/table, with the duplicate selected-label wording below the dropdown removed.",
  "This is a UI handoff into the existing admin monthly billing workflow; it does not add a second invoice engine, create invoice numbers, generate PDFs, send invoices, activate payment/provider sending, write DB rows, change env, activate GPS/live location, billing/payout automation, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-customers-folder-finder-unbilled-queue-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customers folder finder/unbilled guard registration");

console.log("Customers folder finder and unbilled queue guard passed");
