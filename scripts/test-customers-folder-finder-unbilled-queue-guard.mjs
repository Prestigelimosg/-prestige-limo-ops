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
const ledgerSection = sectionBetween(
  ledger,
  "### Customers Folder Finder And Unbilled Queue",
  "\n### ",
);

for (const fragment of [
  "const customerFolderFinderPageSizeOptions = [10, 25];",
  "const [customerFolderFinderPageSize, setCustomerFolderFinderPageSize] = useState(10);",
  "const [customerFolderFinderPage, setCustomerFolderFinderPage] = useState(1);",
  "const filteredCustomers = useMemo(() => {",
  "return customerFolderIndexRows.filter((row) => {",
  "const paginatedCustomerFolderFinderRows = filteredCustomers.slice(",
  "function updateCustomerFolderFinderSearch(value: string) {",
  "function updateCustomerFolderFinderPageSize(value: number) {",
]) {
  assertIncludes(customersPage, fragment, `customer folder finder source fragment ${fragment}`);
}

for (const fragment of [
  'data-customer-folder-finder-search="true"',
  'data-customer-folder-finder-page-size="true"',
  'data-customer-folder-finder-previous="true"',
  'data-customer-folder-finder-next="true"',
  'data-customer-folder-finder-list="true"',
  'data-customer-folder-finder-row={customer.customerId}',
  'data-customer-folder-finder-load-accounts="true"',
  "{pageSize} per page",
  "paginatedCustomerFolderFinderRows.map((customer)",
  "Search all customer folders, scan 10 at a time",
]) {
  assertIncludes(folderFinderSection, fragment, `customer folder finder UI fragment ${fragment}`);
}

for (const fragment of [
  "type UnbilledCustomerRow = {",
  "function getMockUnbilledCustomerRows() {",
  "const [unbilledCustomersPageSize, setUnbilledCustomersPageSize] = useState(10);",
  "const [unbilledCustomersPage, setUnbilledCustomersPage] = useState(1);",
  "const unbilledCustomerRows = useMemo<UnbilledCustomerRow[]>(() => {",
  "item.billingStatus.trim().toLowerCase().includes(\"unbilled\")",
  "const paginatedUnbilledCustomerRows = unbilledCustomerRows.slice(",
]) {
  assertIncludes(customersPage, fragment, `unbilled customers source fragment ${fragment}`);
}

for (const fragment of [
  'data-unbilled-customers-count="true"',
  'data-unbilled-customers-pagination="true"',
  'data-unbilled-customers-page-size="true"',
  'data-unbilled-customers-previous="true"',
  'data-unbilled-customers-next="true"',
  'data-unbilled-customers-list="true"',
  'data-unbilled-customer-row={row.key}',
  'data-unbilled-customer-open-folder={row.key}',
  'data-unbilled-customers-boundary="true"',
  "Review these before sending invoices so unbilled or statement-needed accounts are not missed.",
  "paginatedUnbilledCustomerRows.map((row)",
]) {
  assertIncludes(unbilledSection, fragment, `unbilled customers UI fragment ${fragment}`);
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
}

for (const phrase of [
  "Customers page now has a visible Customer Folder Finder that searches all loaded customer folders and paginates the compact folder rows 10 per page by default.",
  "The finder keeps the existing guarded Load Saved Accounts control visible, but it does not auto-load or create a new route/API.",
  "A new Unbilled Customers checkpoint sits before the invoice workspace so unbilled draft rows and statement-needed account rows are visible before invoice work starts.",
  "Both lists are compact row/table layouts with next/previous controls for larger account books instead of giant account cards.",
  "This is UI-only structure on the existing Customers page; it does not activate invoice/PDF/payment/provider sending, DB writes, env changes, GPS/live location, billing/payout, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-customers-folder-finder-unbilled-queue-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customers folder finder/unbilled guard registration");

console.log("Customers folder finder and unbilled queue guard passed");
