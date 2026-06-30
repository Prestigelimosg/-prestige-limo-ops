import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customerPagePath = "app/customers/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-folder-compact-index-guard.mjs";

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

const [customerPage, ledger, preactivationSuite] = await Promise.all([
  readFile(customerPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const finderSection = sectionBetween(
  customerPage,
  'data-customer-folder-finder="true"',
  'data-unbilled-customers-sector="true"',
);

for (const fragment of [
  'data-customer-summary-strip="true"',
  'data-customer-folder-finder="true"',
  'data-customer-folder-finder-select="true"',
  'data-customer-folder-finder-count="true"',
  "{filteredCustomers.length} folders",
  "Load Accounts",
  "min-h-8 whitespace-nowrap",
  'data-customer-folder-finder-dropdown-panel="true"',
  'data-customer-folder-finder-page-numbers="true"',
  'data-customer-folder-finder-list="true"',
  'data-customer-folder-finder-row={customer.customerId}',
  "All customers",
  "10 per page",
  "Open",
]) {
  assertIncludes(customerPage, fragment, `compact customer finder fragment ${fragment}`);
}

for (const forbiddenFragment of [
  'data-customer-folder-support-drawer="true"',
  'data-customer-folder-index-handoff="true"',
  "Customer folder support list",
  "Customer Folder / Job History Handoff",
  "Review folder",
  'data-customer-folder-finder-page-size="true"',
  'data-customer-folder-finder-previous="true"',
  'data-customer-folder-finder-next="true"',
  "All customer folders - {customerFolderFinderPageSize} per page",
  "lg:grid-cols-3",
]) {
  assertExcludes(customerPage, forbiddenFragment, "customer folder duplicate/giant-card surface");
}

for (const forbiddenPattern of [
  /driver payout|PayNow payout|customer price|payment\/PDF|payout comparisons/i,
  /internal admin notes|internal finance|parser\/debug|raw provider payload|raw driver live-location token/i,
  /mock QA|dev archive|api\.telegram\.org|whatsapp|twilio|sendMail|new\s+Resend/i,
]) {
  assertExcludes(finderSection, forbiddenPattern, "customer folder compact finder privacy boundary");
}

const ledgerHeading = "### Customer Folder Compact Index UI Lock";
assertIncludes(ledger, ledgerHeading, "ledger compact customer folder heading");

for (const phrase of [
  "The old Customer Folder / Job History Handoff support drawer is removed from the normal Customers page flow; the compact finder is now the single customer-folder lookup surface.",
  "The compact finder keeps 10-row pages and an `All customers` dropdown with numbered page buttons for 200-plus accounts.",
  "The top payment summary is a slim strip instead of four large cards.",
  "No route, API, parser, DB, env, Vercel, provider-send, GPS/live-location, billing/payment/PDF/payout, calendar, or shim behavior is changed.",
  "This polish is guarded by `scripts/test-customer-folder-compact-index-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledger, phrase, `compact customer folder ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation compact customer folder guard registration");

console.log("Customer folder compact index guard passed");
