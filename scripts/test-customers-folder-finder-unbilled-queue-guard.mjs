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
  "</main>",
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
  "if (customerFolderFinderSelectedId && row.customerFolderKey !== customerFolderFinderSelectedId) {",
  "return customerFolderIndexRows.filter((row) => {",
  "const paginatedCustomerFolderFinderRows = filteredCustomers.slice(",
  "const customerFolderFinderDropdownRows = customerFolderIndexRows.slice(",
  "const customerFolderFinderDropdownPageNumbers = Array.from(",
  "function updateCustomerFolderFinderSearch(value: string) {",
  "setCustomerFolderFinderSelectedId(\"\");",
  "function updateCustomerFolderFinderSelection(value: string) {",
  "function showAllCustomerFolderFinderRows(pageNumber = 1) {",
  "const [customerFolderJobViewState, setCustomerFolderJobViewState] =",
  "const [expandedCustomerFolderJobReference, setExpandedCustomerFolderJobReference] = useState(\"\");",
  "function resetCustomerFolderJobView(",
  "async function viewCustomerFolderJobs(",
  "setCustomerFolderFinderSelectedId(customer.customerFolderKey);",
  "readRegularCustomerSavedBookingsForTarget(target, \"customer-id\")",
  "function groupCustomerFolderSavedBookingsByMonth(",
  "const customerFolderSavedBookingMonthGroups = useMemo(",
]) {
  assertIncludes(customersPage, fragment, `customer folder finder source fragment ${fragment}`);
}

for (const fragment of [
  "All customers",
  'data-customer-folder-finder-select="true"',
  'data-customer-folder-finder-dropdown-panel="true"',
  'data-customer-folder-finder-all-customers-option="true"',
  'data-customer-folder-finder-dropdown-page-row={customer.customerFolderKey}',
  'data-customer-folder-finder-page-numbers="true"',
  'data-customer-folder-finder-dropdown-page-number={pageNumber}',
  "customerFolderFinderDropdownRows.map((customer)",
  "customerFolderFinderDropdownPageNumbers.map((pageNumber)",
  "10 per page",
  'data-customer-folder-finder-search="true"',
  'data-customer-folder-finder-list="true"',
  'data-customer-folder-finder-row={customer.customerFolderKey}',
  'data-customer-folder-finder-load-accounts="true"',
  'data-customer-folder-finder-count="true"',
  "{filteredCustomers.length} folders",
  "Load Accounts",
  "min-h-8 whitespace-nowrap",
  "paginatedCustomerFolderFinderRows.map((customer)",
  "Search all customer folders, scan 10 at a time",
  "Selected customer: ${selectedCustomerFolderFinderRow.customerName}",
  'data-customer-folder-finder-view-jobs={customer.customerFolderKey}',
  "View jobs",
  'data-customer-folder-jobs-panel="true"',
  'data-customer-folder-jobs-count="true"',
  'data-customer-folder-jobs-feedback="true"',
  'data-customer-folder-jobs-list="true"',
  'data-customer-folder-job-month-group={group.key}',
  'data-customer-folder-job-row={bookingReference}',
  'data-customer-folder-job-view-toggle={bookingReference}',
  'data-customer-folder-job-details={bookingReference}',
]) {
  assertIncludes(folderFinderSection, fragment, `customer folder finder UI fragment ${fragment}`);
}

for (const fragment of [
  'const adminCompletedBookingCloseoutApiPath = "/api/admin-completed-booking-closeouts";',
  "type UnbilledCustomerRow = {",
  "type RegularCustomerSavedBookingReadTarget = {",
  "type RegularCustomerSavedBookingCloseoutRecord = {",
  "type RegularCustomerSavedBookingBillingReadinessState = {",
  "regularCustomerAccountReadState.accounts.map(customerFolderRowFromSavedAccount)",
  "function savedBookingCloseoutIsBillingReady(",
  "function savedBookingUnbilledRow(",
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
  "Loading saved bookings for the Monthly Billing Queue...",
  "async function loadRegularCustomerSavedBookingBillingReadiness(",
  "fetch(`${adminCompletedBookingCloseoutApiPath}?${params.toString()}`",
  "const unbilledCustomerRows = useMemo<UnbilledCustomerRow[]>(() => {",
  "regularCustomerSavedBookingReadState.savedBookings",
  "regularCustomerSavedBookingBillingReadinessState.closeoutsByReference",
  "savedBookingUnbilledRow(",
  "Closeout ready / amount needed",
  "Draft amount not set",
  "Enter the approved customer amount before previewing or issuing.",
  "const customerId = savedBookingCustomerId(booking);",
  "if (!customerId) {\n    return null;\n  }",
  "const customerMonthlyBillingAccountReviewCount = useMemo(() => {",
  "firstRow.customerId.localeCompare(secondRow.customerId)",
  "const billingAccountKey = normalizeCustomerFolderMatch(row.customerId);",
  "const billingScopeKey = normalizeCustomerFolderMatch(row.accountScopeKey || \"booker_traveller_not_set\");",
  "existingGroup.needsScopeReview ||= row.needsScopeReview;",
  "function customerBillingScopeNeedsReview(accountScopeKey: string, accountScopeLabel: string)",
  "if (group.needsScopeReview)",
  "if (row.needsScopeReview)",
  "const selectedUnbilledCustomerRow = useMemo(",
  "const visibleUnbilledCustomerRows =",
  "selectedMonthlyBillingGroup?.rows ??",
  "const getUnbilledPrepareButtonLabel = (rowKey: string) =>",
  "\"Preparing\"",
  "\"Prepared\"",
  "function updateSelectedMonthlyBillingGroup(value: string) {",
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
  'data-unbilled-customers-boundary="true"',
  "Prepare",
  "Select one saved billing account and month, review the jobs, then prepare the bill in the invoice",
  "All billing account/month groups",
  "Same company names stay separate by saved account ID and passenger scope.",
  'data-customer-monthly-billing-account-review-count="true"',
  "Passenger scope needs review",
  "Review scope",
  "Account {row.customerId}",
  "visibleUnbilledCustomerRows.map((row)",
]) {
  assertIncludes(unbilledSection, fragment, `unbilled customers UI fragment ${fragment}`);
}

for (const forbiddenStrictBillingFragment of [
  "const customerId = savedBookingCustomerId(booking) || reference;",
  "normalizeCustomerFolderMatch(row.customerId || row.customerName)",
  "normalizeCustomerFolderMatch(group.customerName) ===",
]) {
  assertExcludes(
    unbilledSection,
    forbiddenStrictBillingFragment,
    "strict monthly billing account grouping must not fall back to names or references",
  );
  assertExcludes(
    customersPage,
    forbiddenStrictBillingFragment,
    "strict monthly billing account grouping must not fall back to names or references",
  );
}

for (const duplicateFragment of [
  'data-unbilled-customers-selected-label="true"',
  "preparedUnbilledCustomerLabel",
  'data-customer-advanced-booking-drawer="true"',
  'data-customer-debug-tools-drawer="true"',
  'data-regular-customer-booking-list-preview="true"',
  'data-monthly-statement-preview="true"',
]) {
  assertExcludes(unbilledSection, duplicateFragment, "duplicate unbilled customer selector");
}

for (const removedFinderFragment of [
  'data-customer-folder-finder-no-folder',
  'data-customer-portal-access-link',
  'data-customer-portal-access-revoke',
  ">Pending</",
  "Copy link",
  "Portal invite copied for",
  "Portal link copied for",
]) {
  assertExcludes(folderFinderSection, removedFinderFragment, "removed customer finder placeholder/copy wording");
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
  "No customer loaded. Use Prepare monthly bill from the Monthly Billing Queue to load jobs here.",
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
  "The finder keeps the existing guarded `Load Accounts` control visible as a compact one-line button, with the folder count shown as a small `1-10 of N folders` chip; that same button now refreshes the guarded saved-booking bridge for the Monthly Billing Queue without adding a new route/API.",
  "Customer rows no longer show a meaningless `Pending` folder placeholder; `View jobs` opens an inline read-only saved-job panel for that exact saved account id.",
  "Customer finder rows no longer expose portal invite/revoke controls; customer app link copying stays in the existing Dispatch Customer Copy `Copy + App Link` lane.",
  "The inline saved-job panel groups jobs by booking month before the exact job `View/Edit`, safe `Delete job`, and `Open in Dispatch` controls.",
  "The Monthly Billing Queue sits before the invoice workspace so completed closeout-ready jobs are visible before invoice work starts.",
  "Guarded saved-booking reads now check the existing completed closeout status for those references and bridge only closeout-ready saved bookings into the Monthly Billing Queue with `Draft amount not set`.",
  "Customer Finder job reads and closeout-ready saved-booking rows keep the real saved customer/account id as the invoice `customerId`; the old mock folder match fallback is removed from this billing queue.",
  "Monthly Billing Queue groups only by the saved billing account ID plus passenger/traveller account scope plus billing month; it does not fall back to company, booker, passenger, display name, or booking reference.",
  "Closeout-ready jobs without a saved billing account ID or passenger/traveller billing scope are held behind an `account review needed` count instead of being prepared under the wrong customer.",
  "The Monthly Billing Queue has one billing account/month group selector plus one primary `Prepare monthly bill` action that fills the existing Create Invoice workbench for admin review.",
  "The `Prepare monthly bill` action stays hidden until admin selects an exact billing account/month group, so the normal Customer dashboard does not show a disabled/noisy prepare button when there are no billable jobs.",
  "The finder no longer shows noisy selected-dropdown wording; selecting a customer now shows a short `Selected customer` status only.",
  "This is a UI handoff into the existing admin invoice workflow; it does not add a second invoice engine, create invoice numbers, generate PDFs, send invoices, activate payment/provider sending, write DB rows, change env, activate GPS/live location, billing/payout automation, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-customers-folder-finder-unbilled-queue-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customers folder finder/unbilled guard registration");

console.log("Customers folder finder and unbilled queue guard passed");
