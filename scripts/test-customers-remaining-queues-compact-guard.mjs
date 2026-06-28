import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customers-remaining-queues-compact-guard.mjs";

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

const collectionSection = sectionBetween(
  customersPage,
  'data-collection-follow-up-queue="true"',
  'data-customer-debug-tools-drawer="true"',
);
const monthlyStatementSection = sectionBetween(
  customersPage,
  'data-monthly-statement-preview="true"',
  'data-customer-invoice-workspace-panel="outstanding"',
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customers Remaining Queues Compact Dropdowns",
  "\n### ",
);

for (const fragment of [
  "grid gap-2 px-3 py-2 transition hover:bg-slate-50 sm:px-4 lg:grid-cols-[minmax(12rem,1.25fr)_minmax(8rem,0.75fr)_minmax(7rem,0.6fr)_minmax(10rem,0.8fr)_minmax(9rem,auto)]",
  "data-collection-follow-up-actions-toggle={item.key}",
  "data-collection-follow-up-actions-dropdown={item.key}",
  "aria-label={`Open Customer Folder for ${item.customerName}`}",
  "Open\n                    </Link>",
]) {
  assertIncludes(collectionSection, fragment, `compact collection follow-up fragment ${fragment}`);
}

for (const fragment of [
  "grid gap-2 px-3 py-2 transition hover:bg-slate-50 sm:px-4 lg:grid-cols-[minmax(12rem,1.25fr)_minmax(10rem,0.9fr)_minmax(7rem,0.6fr)_minmax(9rem,auto)]",
  "data-monthly-statement-actions-toggle={group.key}",
  "data-monthly-statement-actions-dropdown={group.key}",
  "aria-label={`Open Customer Folder for ${group.customerName}`}",
  "Open\n                    </Link>",
]) {
  assertIncludes(monthlyStatementSection, fragment, `compact monthly statement fragment ${fragment}`);
}

for (const [section, label] of [
  [collectionSection, "collection follow-up compact row"],
  [monthlyStatementSection, "monthly statement compact row"],
]) {
  for (const forbiddenPattern of [
    /grid gap-4 p-4 sm:p-5/,
    /Open Customer Folder\s*<\/Link>/,
    /min-h-11 items-center justify-center/,
    /text-2xl font-bold/,
    /fetch\(|\/api\/|createClient|service_role|process\.env/i,
    /sendMail|new\s+Resend|api\.telegram\.org|twilio/i,
    /navigator\.geolocation|watchPosition|getCurrentPosition/i,
  ]) {
    assertExcludes(section, forbiddenPattern, `${label} boundary`);
  }
}

assert.equal(
  collectionSection.indexOf('data-follow-up-action="schedule"') >
    collectionSection.indexOf("data-collection-follow-up-actions-dropdown"),
  true,
  "follow-up actions must stay inside the compact Actions dropdown.",
);

assert.equal(
  monthlyStatementSection.indexOf("data-statement-preview-action={group.key}") >
    monthlyStatementSection.indexOf("data-monthly-statement-actions-dropdown"),
  true,
  "statement preview action must stay inside the compact Actions dropdown.",
);

for (const phrase of [
  "Collection Follow-up Queue now renders each account as a slim row with compact `Open` and `Actions` controls.",
  "Monthly Account Statement Preview now uses the same compact row/dropdown pattern instead of large action cards.",
  "Follow-up buttons, statement row details, preview controls, long helper text, and feedback stay inside native `Actions` dropdowns.",
  "This is UI-only polish on the existing local/mock customers page; it does not add routes, APIs, DB reads/writes, env changes, provider sends, GPS/live location, billing/payment/PDF/invoice/payout activation, calendar sync, or shims.",
  "Guard coverage lives in `scripts/test-customers-remaining-queues-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation remaining customers compact queue guard registration");

console.log("Customers remaining queues compact guard passed");
