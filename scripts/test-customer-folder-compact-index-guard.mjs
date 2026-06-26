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

const handoffSection = sectionBetween(
  customerPage,
  'data-customer-folder-index-handoff="true"',
  'data-regular-customer-booking-form-section="true"',
);

for (const fragment of [
  'data-customer-folder-index-handoff-layout="compact-list"',
  'data-customer-folder-index-compact-list="true"',
  "Open the customer folder and review job history there. Staff-facing only.",
  "Customers: ${customerFolderIndexHandoffRows.length}",
  "md:grid-cols-[minmax(10rem,1.3fr)_6rem_8rem_minmax(8rem,1fr)_8rem]",
  "min-h-9",
  "Review folder",
]) {
  assertIncludes(handoffSection, fragment, `compact customer folder handoff fragment ${fragment}`);
}

for (const forbiddenFragment of [
  "Visible mock folders",
  "lg:grid-cols-3",
  "job-history row",
  "rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6",
  "min-h-10",
]) {
  assertExcludes(handoffSection, forbiddenFragment, "customer folder giant-card handoff surface");
}

for (const forbiddenPattern of [
  /driver payout|PayNow payout|customer price|billing|invoice|payment\/PDF|payout comparisons/i,
  /internal admin notes|internal finance|parser\/debug|raw provider payload|raw driver live-location token/i,
  /mock QA|dev archive|api\.telegram\.org|whatsapp|twilio|sendMail|new\s+Resend/i,
]) {
  assertExcludes(handoffSection, forbiddenPattern, "customer folder compact handoff privacy boundary");
}

const ledgerHeading = "### Customer Folder Compact Index UI Lock";
assertIncludes(ledger, ledgerHeading, "ledger compact customer folder heading");

for (const phrase of [
  "The Customer Folder / Job History Handoff area now renders as a compact responsive list instead of three giant cards.",
  "Desktop/tablet uses dense rows so the three existing customer folders fit on one Mac screen without repeated scrolling.",
  "Mobile remains responsive with stacked compact rows; this is not a desktop-only layout and does not change customer or driver runtime behavior.",
  "The visible `Visible mock folders` wording is removed from the handoff; the count now uses the customer-facing admin label `Customers`.",
  "No route, API, parser, DB, env, Vercel, provider-send, GPS/live-location, billing/payment/PDF/payout, calendar, or shim behavior is changed.",
  "This polish is guarded by `scripts/test-customer-folder-compact-index-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledger, phrase, `compact customer folder ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation compact customer folder guard registration");

console.log("Customer folder compact index guard passed");
