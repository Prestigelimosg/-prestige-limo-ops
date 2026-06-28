import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customers-outstanding-review-dropdown-guard.mjs";

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

const outstandingReviewSection = sectionBetween(
  customersPage,
  'data-outstanding-payments-review="true"',
  'data-collection-follow-up-queue="true"',
);
const outstandingRowBlock = sectionBetween(
  outstandingReviewSection,
  "paginatedOutstandingReviewItems.map((item)",
  'data-outstanding-payments-no-results="true"',
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customers Outstanding Review Compact Dropdown",
  "\n### ",
);

for (const fragment of [
  "px-3 py-2 transition hover:bg-slate-50 sm:px-4",
  "lg:grid-cols-[minmax(12rem,1.35fr)_minmax(7rem,0.65fr)_minmax(6rem,0.55fr)_minmax(10rem,0.85fr)_minmax(9rem,auto)]",
  '<details className="group relative flex-1 lg:flex-none">',
  'className="inline-flex min-h-9 w-full cursor-pointer list-none',
  "data-outstanding-review-actions-dropdown={item.key}",
  "<span>Actions</span>",
  'data-outstanding-open-customer-folder={item.key}',
  "Open\n                        </Link>",
  "Last follow-up: {item.lastFollowUpDate}",
]) {
  assertIncludes(outstandingRowBlock, fragment, `compact outstanding review fragment ${fragment}`);
}

for (const forbiddenPattern of [
  />\s*Open Customer Folder\s*</,
  /View details\s+—\s+Mock Only/,
  /Hide details\s+—\s+Mock Only/,
  /expandedOutstandingPaymentKey/,
  /setExpandedOutstandingPaymentKey/,
  /md:w-44/,
  /min-h-10 items-center justify-center rounded-md border border-slate-900/,
  /fetch\(|\/api\/|createClient|service_role|process\.env/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio/i,
  /navigator\.geolocation|watchPosition|getCurrentPosition/i,
]) {
  assertExcludes(outstandingRowBlock, forbiddenPattern, "outstanding review compact dropdown boundary");
}

assert.equal(
  outstandingRowBlock.indexOf('data-payment-action="invoice-sent"') >
    outstandingRowBlock.indexOf("data-outstanding-review-actions-dropdown"),
  true,
  "mock payment buttons must stay inside the compact Actions dropdown.",
);

assert.equal(
  outstandingRowBlock.indexOf("data-payment-action-feedback={item.key}") >
    outstandingRowBlock.indexOf("data-outstanding-review-actions-dropdown"),
  true,
  "row feedback must stay inside the compact Actions dropdown.",
);

for (const phrase of [
  "Outstanding Payments Review now renders each customer as a slim account row with only compact `Open` and `Actions` controls visible by default.",
  "The `Actions` control uses the existing expanded row state as a dropdown; mock payment controls, long notes, and row feedback stay inside that dropdown.",
  "The default row keeps the practical scan fields visible: customer, invoice, outstanding amount/status, aging, due date, and next action.",
  "This is UI-only polish on the existing local/mock customers page; it does not add routes, APIs, DB reads/writes, env changes, deploys, provider sends, GPS/live location, billing/payment/PDF/invoice/payout activation, calendar sync, or shims.",
  "Guard coverage lives in `scripts/test-customers-outstanding-review-dropdown-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customers outstanding review dropdown guard registration");

console.log("Customers outstanding review dropdown guard passed");
