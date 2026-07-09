import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customerFolderPagePath = "app/customers/[customerId]/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-folder-job-history-compact-guard.mjs";

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

const [customerFolderPage, ledger, preactivationSuite] = await Promise.all([
  readFile(customerFolderPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const jobHistorySection = sectionBetween(
  customerFolderPage,
  "data-customer-job-history-clarity={customer.id}",
  'data-payment-collection-detail={customer.id}',
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Folder Job History Compact Rows",
  "\n### ",
);

for (const fragment of [
  "Job history snapshot",
  'data-customer-job-history-compact-summary="true"',
  'data-customer-job-history-compact-table="true"',
  'data-customer-job-history-clarity-row={booking.invoiceNumber}',
  "max-h-80 overflow-auto",
  "<table className=\"w-full min-w-[860px] border-collapse text-left text-sm\">",
  "Request/change",
]) {
  assertIncludes(jobHistorySection, fragment, `compact job history fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /<article[\s\S]*data-customer-job-history-clarity-row/,
  /sm:grid-cols-3/,
  /<div className="rounded-md border border-slate-200 bg-slate-50 p-3">/,
  /<h2 className="text-lg font-bold text-slate-950">Upcoming jobs<\/h2>/,
  /<h2 className="text-lg font-bold text-slate-950">Completed jobs<\/h2>/,
  /data-customer-job-status-index="true"/,
  /Upcoming \/ Completed Index/,
  /driver payout|PayNow payout|customer price|payout comparisons/i,
  /internal admin notes|internal finance notes|parser\/debug|mock QA|dev archive/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio|navigator\.geolocation/i,
]) {
  assertExcludes(jobHistorySection, forbiddenPattern, "customer folder job history compact/privacy boundary");
}

for (const phrase of [
  "Customer folder `Job history snapshot` now uses one slim summary strip plus a compact scrollable table instead of summary cards and large job cards.",
  "The duplicate Upcoming/Completed job blocks are removed from the customer folder; job status now stays in the compact job rows.",
  "This is customer-folder UI-only polish on existing mock/customer data; it does not add routes, APIs, DB reads/writes, env changes, Vercel changes, invoice/PDF/payment/provider sending, payout automation, GPS/live location, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-customer-folder-job-history-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer folder job history compact guard registration");

console.log("Customer folder job history compact guard passed");
