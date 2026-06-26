import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customerPagePath = "app/customers/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customers-page-scaled-queues-guard.mjs";

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

const followUpSection = sectionBetween(
  customerPage,
  'data-collection-follow-up-queue="true"',
  'data-monthly-statement-preview="true"',
);
const monthlyStatementSection = sectionBetween(
  customerPage,
  'data-monthly-statement-preview="true"',
  'data-mock-payment-event-log="true"',
);

for (const fragment of [
  "const customerQueuePageSizeOptions = [10, 25];",
  "const [collectionFollowUpPageSize, setCollectionFollowUpPageSize] = useState(10);",
  "const paginatedCollectionFollowUpItems = visibleCollectionFollowUpItems.slice(",
  "const [monthlyStatementPageSize, setMonthlyStatementPageSize] = useState(10);",
  "const paginatedMonthlyStatementGroups = mockStatementPreviewGroups.slice(",
]) {
  assertIncludes(customerPage, fragment, `customers queue pagination source fragment ${fragment}`);
}

for (const fragment of [
  'data-collection-follow-up-pagination="true"',
  'data-collection-follow-up-page-size="true"',
  'data-collection-follow-up-previous="true"',
  'data-collection-follow-up-next="true"',
  "Showing {collectionFollowUpShowingStart}-{collectionFollowUpShowingEnd}",
  "paginatedCollectionFollowUpItems.map((item)",
]) {
  assertIncludes(followUpSection, fragment, `collection follow-up pagination fragment ${fragment}`);
}

assertExcludes(
  followUpSection,
  "visibleCollectionFollowUpItems.map((item)",
  "collection follow-up render must use the paginated row list",
);

for (const fragment of [
  'data-monthly-statement-pagination="true"',
  'data-monthly-statement-page-size="true"',
  'data-monthly-statement-previous="true"',
  'data-monthly-statement-next="true"',
  "Showing {monthlyStatementShowingStart}-{monthlyStatementShowingEnd}",
  "paginatedMonthlyStatementGroups.map((group)",
]) {
  assertIncludes(monthlyStatementSection, fragment, `monthly statement pagination fragment ${fragment}`);
}

assertExcludes(
  monthlyStatementSection,
  "mockStatementPreviewGroups.map((group)",
  "monthly statement render must use the paginated group list",
);

for (const forbiddenPattern of [
  /fetch\(|\/api\/|createClient|service_role|process\.env/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio/i,
  /navigator\.geolocation|watchPosition|getCurrentPosition/i,
]) {
  assertExcludes(followUpSection, forbiddenPattern, "collection follow-up pagination UI-only boundary");
  assertExcludes(monthlyStatementSection, forbiddenPattern, "monthly statement pagination UI-only boundary");
}

const ledgerHeading = "### Customers Page Scaled Queue Pagination UI Lock";
assertIncludes(ledger, ledgerHeading, "ledger customers scaled queue heading");

for (const phrase of [
  "The Customers & Payments follow-up queue and monthly statement preview now render through compact paginated row lists instead of mapping every visible customer row at once.",
  "Default page size is 10 rows with a 25-row option, keeping desktop scanning practical for larger customer lists while mobile remains stacked and touch-friendly.",
  "This is UI-only pagination on existing local/admin sections; it does not add routes, APIs, DB reads/writes, env changes, Vercel changes, provider sends, GPS/live-location, billing/payment/PDF/payout activation, calendar sync, or shims.",
  "Existing admin-only boundaries remain unchanged and customer/driver forbidden finance/internal/mock-archive data remains blocked from public surfaces.",
  "This polish is guarded by `scripts/test-customers-page-scaled-queues-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledger, phrase, `customers scaled queue ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customers scaled queue guard registration");

console.log("Customers page scaled queues guard passed");
