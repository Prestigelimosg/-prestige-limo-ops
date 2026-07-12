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
  'data-selected-customer-dashboard="true"',
  'data-customer-billing-workbench-drawer="true"',
);

for (const fragment of [
  'data-customer-billing-overview="true"',
  'data-selected-customer-dashboard="true"',
  'data-customer-folder-finder-select="true"',
  'data-customer-folder-finder-count="true"',
  "{filteredCustomers.length} folders",
  "Load Accounts",
  "min-h-8 whitespace-nowrap",
  'data-customer-folder-finder-dropdown-panel="true"',
  'data-customer-folder-finder-page-numbers="true"',
  'data-customer-folder-finder-list="true"',
  'data-customer-folder-finder-row={customer.customerFolderKey}',
  'data-customer-folder-finder-feedback="true"',
  'className={`mt-2 text-xs font-semibold leading-5 ${',
  "function customerFolderLatestPickupDisplay",
  "function customerFolderLatestSummary",
  "compactCustomerBookingReference(customer.latestBookingReference, \"\")",
  "customerFolderLatestSummary(customer)",
  "All customers",
  "10 per page",
  "Open folder",
  "href={customer.folderHref}",
  'data-customer-billing-workbench-drawer="true"',
  'data-customer-billing-workbench-summary="true"',
  'data-customer-billing-workbench-contents="true"',
  "Prepare monthly invoice",
  'data-selected-customer-prepare-monthly-invoice="true"',
  'data-selected-customer-monthly-invoice-summary="true"',
]) {
  assertIncludes(customerPage, fragment, `compact customer finder fragment ${fragment}`);
}

const billingDrawerStart = customerPage.indexOf('data-customer-billing-workbench-drawer="true"');
assert.notEqual(billingDrawerStart, -1, "customer billing workbench drawer must exist");
assert.equal(
  customerPage.lastIndexOf("<details", billingDrawerStart) > customerPage.lastIndexOf("</details>", billingDrawerStart),
  true,
  "customer billing workbench must be inside a collapsed native details drawer",
);
assert.equal(
  customerPage.indexOf('data-selected-customer-dashboard="true"') < billingDrawerStart,
  true,
  "selected-customer workspace must stay before the collapsed invoice workbench drawer",
);
assert.equal(
  billingDrawerStart < customerPage.indexOf('data-customer-invoice-workspace="true"'),
  true,
  "Send Invoice Workbench must stay inside the collapsed billing workbench drawer",
);

for (const forbiddenFragment of [
  'data-customer-summary-strip="true"',
  'data-customer-folder-finder="true"',
  'data-unbilled-customers-sector="true"',
  'data-customer-monthly-billing-queue="true"',
  'data-customer-monthly-billing-group-select="true"',
  'data-customer-monthly-billing-prepare-group="true"',
  "Monthly Billing Queue",
  "Prepare monthly bill",
  '{ label: "Statements", value: "statements" }',
  '{ label: "Outstanding", value: "outstanding" }',
  '{ label: "Follow-up", value: "follow-up" }',
  'useState<CustomerInvoiceWorkspaceTab>("statements")',
  'data-customer-folder-support-drawer="true"',
  'data-customer-folder-index-handoff="true"',
  "Customer folder support list",
  "Customer Folder / Job History Handoff",
  "Review folder",
  'data-customer-folder-finder-page-size="true"',
  'data-customer-folder-finder-previous="true"',
  'data-customer-folder-finder-next="true"',
  "All customer folders - {customerFolderFinderPageSize} per page",
  "Dropdown selected",
  'data-customer-folder-finder-no-folder',
  'data-customer-portal-access-link',
  'data-customer-portal-access-revoke',
  "Copy link",
  "Portal invite copied for",
  "Portal link copied for",
  "Billing workbench and mock review queues",
  "All unbilled customers",
  "Folder pending",
  "? [customer.latestPickupAt, customer.latestServiceType, customer.latestBookingReference]",
  "getMockUnbilledCustomerRows()",
  "localCustomerFolderSavedBookingTargets",
  "View jobs",
  'data-customer-folder-finder-view-jobs={customer.customerFolderKey}',
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

assertExcludes(
  finderSection,
  /\?\s*\[\s*customer\.latestPickupAt,\s*customer\.latestServiceType,\s*customer\.latestBookingReference\s*\]\s*\.filter\(Boolean\)\s*\.join\(" \| "\)\s*\|\|/s,
  "customer folder latest visible row raw reference rendering",
);

const ledgerHeading = "### Customer Folder Compact Index UI Lock";
assertIncludes(ledger, ledgerHeading, "ledger compact customer folder heading");

for (const phrase of [
  "The old Customer Folder / Job History Handoff support drawer is removed from the normal Customers page flow; the compact finder is now the single customer-folder lookup surface.",
  "The compact finder keeps 10-row pages and an `All customers` dropdown with numbered page buttons for 200-plus accounts.",
  "Finder load/search/selected feedback is a quiet one-line status under the controls, not a large success card, so the customer table stays visually dominant.",
  "The fake top payment summary strip is removed from the daily Customers page.",
  "The invoice workbench is collapsed behind an admin-only drawer, leaving the daily visible Customers page focused on the customer overview and selected-customer monthly preparation.",
  "The mock statement, outstanding, follow-up, advanced booking, and support log drawers are not rendered in normal operation.",
  "The normal finder row opens the customer's own folder page instead of showing a duplicate inline job-view sector; customer app links stay in Dispatch Customer Copy `Copy + App Link`.",
  "Customer folder pages load compact scrollable saved-job rows with an `Open/Edit` Dispatch handoff for exact booking references.",
  "No route, API, parser, DB, env, Vercel, provider-send, GPS/live-location, billing/payment/PDF/payout, calendar, or shim behavior is changed.",
  "This polish is guarded by `scripts/test-customer-folder-compact-index-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledger, phrase, `compact customer folder ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation compact customer folder guard registration");

console.log("Customer folder compact index guard passed");
