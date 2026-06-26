import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const customerBookingPagePath = "app/book/page.tsx";
const customerPortalPagePath = "app/my-bookings/page.tsx";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const driverJobLinkPath = "lib/driver-job-link.ts";
const driverJobBrowserTestPath = "scripts/test-driver-job-page-browser.mjs";
const guardScript = "scripts/test-public-route-source-privacy-boundary-guard.mjs";

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

function assertNoLineMatches(source, pattern, label) {
  const matchingLines = source
    .split(/\r?\n/)
    .map((line, index) => ({ index: index + 1, line }))
    .filter(({ line }) => pattern.test(line));

  assert.deepEqual(
    matchingLines,
    [],
    `${label} must not have matching lines for ${pattern}.`,
  );
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing source block start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing source block end: ${endFragment}`);

  return source.slice(start, end);
}

const [
  ledger,
  preactivationSuite,
  customerBookingPage,
  customerPortalPage,
  driverJobPage,
  driverJobLink,
  driverJobBrowserTest,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(customerBookingPagePath, "utf8"),
  readFile(customerPortalPagePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(driverJobLinkPath, "utf8"),
  readFile(driverJobBrowserTestPath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Public Route Source Privacy Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver route source privacy is guarded across `app/book/page.tsx`, `app/my-bookings/page.tsx`, `app/driver-job/[token]/page.tsx`, and `lib/driver-job-link.ts`.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Customer booking and customer portal source must not render driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive details.",
  "Driver job source must not render customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive details.",
  "Driver job source may keep forbidden words only in protective redaction/blocking code such as `driverPaymentDetailLinePattern`, `lineValue`, `driverDetailLines`, and `unsafeStatusHistoryFragments`.",
  "Driver app updates and status history must render only safe fields: `safe_title`, `safe_message`, and `safeNote`.",
  "The browser privacy checks remain in `npm run test:safe`; this guard covers static source boundaries that do not require a running app.",
  "This lock adds `scripts/test-public-route-source-privacy-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public route privacy ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public route privacy guard registration");

const customerForbiddenFragments = [
  /driver payout/i,
  /paynow payout/i,
  /internal admin/i,
  /parser\/debug|parser debug|parser_debug/i,
  /admin finance/i,
  /mock qa|mock_qa|mock archive|mock_archive/i,
];

for (const source of [customerBookingPage, customerPortalPage]) {
  for (const forbiddenPattern of customerForbiddenFragments) {
    assertExcludes(source, forbiddenPattern, "customer-facing route source");
  }
}

assertIncludes(
  customerBookingPage,
  "This is a booking request only, not a confirmed booking yet.",
  "customer booking request-only copy",
);
assertIncludes(
  customerBookingPage,
  "No price, payment, invoice, PDF, or billing file is created here.",
  "customer booking no-finance-file copy",
);
assertIncludes(
  customerPortalPage,
  "Booking request received for review. This is not confirmed yet. Our staff will reply to confirm availability.",
  "customer portal request-only feedback",
);

assertNoLineMatches(
  driverJobPage,
  /["'`][^"'`]*(?:customer price|driver payout|billing|invoice|payment|payout|paynow|pay now|finance|internal admin|mock qa|mock archive)[^"'`]*["'`]/i,
  "driver job rendered source",
);

assertIncludes(
  driverJobPage,
  "const driverPaymentDetailLinePattern = /\\b(bank|account|acct|paynow|pay\\s+now|payment|payout)\\b/i;",
  "driver pasted-detail payment redaction pattern",
);
assertIncludes(
  driverJobPage,
  "if (match?.[1] && !driverPaymentDetailLinePattern.test(line))",
  "driver labelled pasted-detail redaction check",
);
assertIncludes(
  driverJobPage,
  ".filter((line) => !driverPaymentDetailLinePattern.test(line));",
  "driver freeform pasted-detail redaction filter",
);
assertIncludes(
  driverJobPage,
  "Private account and internal compensation details are not shown here.",
  "driver visible private-account boundary copy",
);

const driverAppUpdateRecordBlock = blockBetween(
  driverJobPage,
  "type DriverAppUpdateRecord = {",
  "};\n\ntype DriverAppUpdateApiResponse",
);

for (const safeField of ["safe_message?: string | null;", "safe_title?: string | null;"]) {
  assertIncludes(driverAppUpdateRecordBlock, safeField, `driver app update safe field ${safeField}`);
}

for (const unsafeUpdateAccess of [
  /update\.message\b/,
  /update\.title\b/,
  /update\.body\b/,
  /update\.payload\b/,
  /update\.token\b/,
  /update\.driver_job_link_id\b/,
]) {
  assertExcludes(driverJobPage, unsafeUpdateAccess, "driver app update unsafe field access");
}

assertIncludes(
  driverJobPage,
  'safeDisplayText(update.safe_title, "Dispatch update")',
  "driver app update safe title render",
);
assertIncludes(
  driverJobPage,
  'safeDisplayText(update.safe_message, "Contact dispatch for the latest job update.")',
  "driver app update safe message render",
);
assertIncludes(driverJobPage, "data-driver-job-status-timing-evidence", "driver status timing safe render");
assertExcludes(driverJobPage, "event.safeNote", "driver saved status history hidden from public page");
assertExcludes(driverJobPage, "data-driver-job-saved-status-history", "driver saved status history panel hidden");
assertExcludes(driverJobPage, "data-driver-job-activity-log", "driver activity log panel hidden");

const safeDriverJobPayloadBlock = blockBetween(
  driverJobLink,
  "export type SafeDriverJobPayload = {",
  "};\n\nexport type SafeDriverJobStatusHistoryItem",
);

for (const forbiddenPattern of [
  /price/i,
  /billing/i,
  /invoice/i,
  /payment/i,
  /payout/i,
  /paynow/i,
  /finance/i,
  /\btoken\b/i,
  /internal/i,
  /debug/i,
  /mock/i,
]) {
  assertExcludes(safeDriverJobPayloadBlock, forbiddenPattern, "SafeDriverJobPayload public shape");
}

const unsafeStatusHistoryBlock = blockBetween(
  driverJobLink,
  "const unsafeStatusHistoryFragments = [",
  "];\n\nexport function generateDriverJobLinkToken",
);

for (const unsafeFragment of [
  '"billing"',
  '"customer_price"',
  '"debug"',
  '"driver_payout"',
  '"finance"',
  '"internal_admin_note"',
  '"invoice"',
  '"mock_archive"',
  '"payment"',
  '"paynow"',
  '"payout"',
  '"token"',
]) {
  assertIncludes(unsafeStatusHistoryBlock, unsafeFragment, `unsafe status history fragment ${unsafeFragment}`);
}

assertIncludes(
  driverJobLink,
  "unsafeStatusHistoryFragments.some((fragment) => normalized.includes(fragment))",
  "driver status history unsafe fragment rejection",
);
assertIncludes(
  driverJobLink,
  "safeNote: safeStatusHistoryText(item.safeNote, 500) || null",
  "driver status history safeNote sanitizer",
);

for (const browserPrivacyCheck of [
  "Driver job page should not expose workflow customer price.",
  "Driver job page should not expose workflow driver payout.",
  "Driver job page should not expose PayNow details.",
  "Driver job page should not expose billing details.",
  "Driver job page should not expose invoice details.",
  "Driver job page should not expose payment details.",
  "Driver job page should not expose payout details.",
  "Driver job page should not expose finance details.",
  "Public driver details parser must not expose pasted payment or internal remark text.",
  "Driver app updates feed must not expose token internals, finance, or external channel data.",
]) {
  assertIncludes(driverJobBrowserTest, browserPrivacyCheck, `driver browser privacy check: ${browserPrivacyCheck}`);
}

console.log("Public route source privacy boundary guard passed");
