import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docPath = "docs/admin-monthly-billing-month-grouping-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPath = "app/page.tsx";
const groupingRoutePath = "app/api/admin-monthly-billing-groups/route.ts";
const groupingReadPath = "lib/admin-monthly-billing-grouping-read.ts";
const appSmokePath = "scripts/test-app-smoke-browser.mjs";
const bookingUiBrowserPath = "scripts/test-booking-ui-browser.mjs";
const mobileUsabilityBrowserPath = "scripts/test-mobile-usability-browser.mjs";
const groupingReadContractPath = "scripts/test-admin-monthly-billing-grouping-read-contract.mjs";
const guardScript =
  "scripts/test-admin-monthly-billing-month-grouping-existing-workflow-lock.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must not include ${fragment}.`);
}

function assertNotMatches(source, pattern, label) {
  assert.doesNotMatch(source, pattern, `${label} must not match ${pattern}.`);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n## ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [
  doc,
  ledger,
  docsIndex,
  preactivationSuite,
  appPage,
  groupingRoute,
  groupingRead,
  appSmoke,
  bookingUiBrowser,
  mobileUsabilityBrowser,
  groupingReadContract,
] = await Promise.all([
  readFile(docPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(groupingRoutePath, "utf8"),
  readFile(groupingReadPath, "utf8"),
  readFile(appSmokePath, "utf8"),
  readFile(bookingUiBrowserPath, "utf8"),
  readFile(mobileUsabilityBrowserPath, "utf8"),
  readFile(groupingReadContractPath, "utf8"),
]);

for (const fragment of [
  "# Admin Monthly Billing Month Grouping Existing Workflow Lock",
  "This document is docs/test-only.",
  "It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads beyond the existing guarded admin read path, DB writes beyond existing approved admin API routes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing automation, invoice creation, PDF generation or sending, payment/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "The admin-only Monthly Billing Month Grouping workflow already exists in the current app. Do not rebuild it as a duplicate workflow.",
  "`app/page.tsx` owns the existing Monthly Billing Month Grouping Review at `data-admin-monthly-billing-month-grouping-review`.",
  "`app/page.tsx` owns the existing saved monthly billing grouping read controls at `data-admin-monthly-billing-month-grouping-read-controls`.",
  "`app/page.tsx` owns the existing completed-booking billing-readiness audit action at `data-admin-completed-booking-billing-readiness-audit-action`.",
  "`app/page.tsx` owns the existing monthly billing draft-plan, invoice draft-prep, item-review, billable price review, issue-review, issue-record, invoice-number reservation, and PDF-review readiness action controls within the same existing Monthly Billing Month Grouping Review.",
  "The saved monthly billing grouping read path is `GET /api/admin-monthly-billing-groups`, backed by `lib/admin-monthly-billing-grouping-read.ts`.",
  "These surfaces are admin-only operational review and preparation controls.",
  "They do not create invoices, generate PDFs, send PDFs, collect payment, automate payouts, activate billing automation, send notifications, send customer messages, send driver notifications, change auth, change parser behavior, or change Save Booking behavior.",
  "`scripts/test-app-smoke-browser.mjs` covers the Monthly Billing Month Grouping Review across mobile and desktop viewports, including local controls, read-only boundary text, compact layout, readable rows/controls/notes, and forbidden private text checks.",
  "`scripts/test-booking-ui-browser.mjs` covers the existing local review controls, guarded read calls, draft/review action buttons, saved grouping pagination/filtering, and no unexpected Load Booking call shape changes.",
  "`scripts/test-mobile-usability-browser.mjs` covers compact mobile layout, read filters, pagination controls, readable rows/controls/notes, and no-horizontal-overflow behavior.",
  "Dedicated API contract tests already exist for the guarded monthly billing grouping read and monthly billing draft/review routes.",
  "Future work must reuse the existing Monthly Billing Month Grouping Review instead of adding another UI sector, card, button cluster, route, helper, or shim for the same purpose.",
  "Allowed future work, only after explicit owner approval, must stay compact and colocated with the existing monthly billing month grouping review controls.",
  "Adding a duplicate monthly billing month grouping, billing readiness audit, monthly billing draft plan, monthly invoice draft-prep, invoice item review, billable price review, issue review, issue record, invoice-number reservation, or PDF-readiness UI sector, button, card, route, helper, or shim.",
  "Activating invoice creation, PDF generation, PDF sending, payment links, payment collection, payout automation, billing automation, accounting posting, provider sends, live location, auth, photo/proof, calendar behavior, parser-learning behavior, or unapproved DB writes.",
  "Moving this workflow into customer or driver surfaces.",
  "Exposing customer price, driver payout, PayNow payout details, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, mock QA/dev archive, or secrets.",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.",
]) {
  assertIncludes(doc, fragment, `month grouping lock doc fragment ${fragment}`);
}

for (const fragment of [
  "const monthlyBillingMonthGroupingReviewStatusLabel =",
  "const monthlyBillingMonthGroupingReviewOptions:",
  "const monthlyBillingMonthGroupingReviewItems:",
  'data-admin-monthly-billing-month-grouping-review="true"',
  'data-admin-monthly-billing-month-grouping-review-status="true"',
  'data-admin-monthly-billing-month-grouping-review-context="true"',
  'data-admin-monthly-billing-month-grouping-read-feedback="true"',
  'data-admin-monthly-billing-month-grouping-review-controls="true"',
  'data-admin-monthly-billing-month-grouping-read-controls="true"',
  'data-admin-monthly-billing-month-grouping-customer-search="true"',
  'data-admin-monthly-billing-month-grouping-readiness-filter="true"',
  'data-admin-monthly-billing-month-grouping-limit="true"',
  'data-admin-monthly-billing-month-grouping-page-summary="true"',
  'data-admin-monthly-billing-month-grouping-previous-page="true"',
  'data-admin-monthly-billing-month-grouping-next-page="true"',
  'data-admin-completed-booking-billing-readiness-audit-action="true"',
  'data-admin-monthly-billing-draft-plan-save-action="true"',
  'data-admin-monthly-invoice-draft-save-action="true"',
  'data-admin-monthly-invoice-draft-item-review-save-action="true"',
  'data-admin-monthly-invoice-billable-price-review-amount-input="true"',
  'data-admin-monthly-invoice-billable-price-review-save-action="true"',
  'data-admin-monthly-invoice-issue-review-save-action="true"',
  'data-admin-monthly-invoice-issue-record-save-action="true"',
  'data-admin-monthly-invoice-number-reservation-action="true"',
  'data-admin-monthly-invoice-pdf-readiness-action="true"',
  'data-admin-monthly-billing-month-grouping-review-note="true"',
  'data-admin-monthly-billing-month-grouping-review-boundary="true"',
  "Monthly Billing Month Grouping Review",
  "Saved grouping read and guarded draft planning by customer/account and billing month before",
  "Guarded admin API read plus completed-booking billing-readiness audit, monthly billing",
  "No direct Supabase",
  "write outside approved API routes; no invoice creation, PDF",
  "generation, PDF sending, payment, payout, notification sending, auth change, parser change, billing",
]) {
  assertIncludes(appPage, fragment, `existing app month grouping fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-monthly-billing-month-grouping-review="true"', 1],
  ['data-admin-monthly-billing-month-grouping-read-controls="true"', 1],
  ['data-admin-monthly-billing-month-grouping-review-boundary="true"', 1],
  ['data-admin-monthly-billing-draft-plan-save-action="true"', 1],
  ['data-admin-monthly-invoice-draft-save-action="true"', 1],
  ['data-admin-monthly-invoice-issue-record-save-action="true"', 1],
  ['data-admin-monthly-invoice-number-reservation-action="true"', 1],
  ['data-admin-monthly-invoice-pdf-readiness-action="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected one existing app month grouping surface for ${fragment}`,
  );
}

for (const fragment of [
  "export async function GET(request: Request)",
  "loadAdminMonthlyBillingGroups",
  "requireAdminDispatcherBoundary(request)",
  "Admin monthly billing grouping request failed safely.",
]) {
  assertIncludes(groupingRoute, fragment, `monthly billing grouping route fragment ${fragment}`);
}

for (const fragment of [
  "export const adminMonthlyBillingGroupingReadVersion =",
  "Admin monthly billing grouping read is not enabled on this server.",
  "Admin monthly billing grouping read requires a verified admin or dispatcher server session.",
  "const forbiddenSafeTextFragments =",
  '"driver_payout"',
  '"paynow"',
  '"payment"',
  '"pdf"',
  '"internal_admin_note"',
]) {
  assertIncludes(groupingRead, fragment, `monthly billing grouping read fragment ${fragment}`);
}

for (const forbiddenExport of [
  "export async function POST",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assertExcludes(groupingRoute, forbiddenExport, `monthly billing grouping route ${forbiddenExport}`);
}

for (const fragment of [
  "checkAdminMonthlyBillingMonthGroupingReview",
  "Monthly Billing Month Grouping Review",
  "[data-admin-monthly-billing-month-grouping-review]",
  "expected monthly billing month grouping review local controls",
  "expected monthly billing month grouping review keys",
  "Guarded admin API read plus completed-booking billing-readiness audit",
  "issue-record save, invoice-number reservation, and PDF-review readiness only.",
  "expected no private/customer/driver forbidden text in monthly billing month grouping review",
  "expected monthly billing month grouping review not to create horizontal overflow",
]) {
  assertIncludes(appSmoke, fragment, `app smoke month grouping fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-monthly-billing-month-grouping-review='true']",
  "Monthly Billing Month Grouping Review",
  "Load or apply a saved operational booking before reading saved monthly billing groups.",
  "Monthly billing month grouping review needed",
  "[data-admin-monthly-billing-month-grouping-customer-search='true']",
  "[data-admin-monthly-billing-month-grouping-readiness-filter='true']",
  "[data-admin-monthly-billing-month-grouping-limit='true']",
  "[data-admin-monthly-billing-draft-plan-save-action='true']",
  "[data-admin-monthly-invoice-draft-save-action='true']",
  "[data-admin-monthly-invoice-draft-item-review-save-action='true']",
  "[data-admin-monthly-invoice-billable-price-review-save-action='true']",
  "[data-admin-monthly-invoice-issue-review-save-action='true']",
  "[data-admin-monthly-invoice-issue-record-save-action='true']",
  "[data-admin-monthly-invoice-number-reservation-action='true']",
  "[data-admin-monthly-invoice-pdf-readiness-action='true']",
  "GET /api/admin-monthly-billing-groups?limit=1&page=1&billing_month=2026-05",
]) {
  assertIncludes(bookingUiBrowser, fragment, `booking UI month grouping fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-monthly-billing-month-grouping-review='true']",
  "expected Monthly Billing Month Grouping Review section",
  "expected Monthly Billing Month Grouping Review read filters",
  "expected Monthly Billing Month Grouping Review pagination controls",
  "expected Monthly Billing Month Grouping Review read-only boundary",
  "expected Monthly Billing Month Grouping Review not to create horizontal overflow",
]) {
  assertIncludes(mobileUsabilityBrowser, fragment, `mobile month grouping fragment ${fragment}`);
}

for (const fragment of [
  "lib/admin-monthly-billing-grouping-read.ts",
  "app/api/admin-monthly-billing-groups/route.ts",
  "disabledMonthlyBillingGroupingReadError",
  "unsafeMonthlyBillingLeakPattern",
  "Admin monthly billing grouping read requires a verified admin or dispatcher server session.",
]) {
  assertIncludes(groupingReadContract, fragment, `grouping read contract fragment ${fragment}`);
}

const ledgerSection = sectionBetween(
  ledger,
  "## Admin Monthly Billing Month Grouping Existing Workflow Lock",
);

for (const fragment of [
  "The existing admin-only Monthly Billing Month Grouping workflow is locked by `docs/admin-monthly-billing-month-grouping-existing-workflow-lock.md`.",
  "This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads beyond the existing guarded admin read path, DB writes beyond existing approved admin API routes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing automation, invoice creation, PDF generation or sending, payment/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "Do not add a duplicate Monthly Billing Month Grouping, billing readiness audit, monthly billing draft plan, monthly invoice draft-prep, invoice item review, billable price review, issue review, issue record, invoice-number reservation, or PDF-readiness UI sector, button, card, route, helper, or shim.",
  "Existing surfaces are `data-admin-monthly-billing-month-grouping-review`, `data-admin-monthly-billing-month-grouping-read-controls`, `data-admin-completed-booking-billing-readiness-audit-action`, `data-admin-monthly-billing-draft-plan-save-action`, and the existing monthly invoice draft/review action controls in `app/page.tsx`.",
  "Existing guarded read path is `GET /api/admin-monthly-billing-groups`, backed by `lib/admin-monthly-billing-grouping-read.ts`.",
  "Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, `scripts/test-mobile-usability-browser.mjs`, and the dedicated monthly billing/invoice API contract tests.",
  "Future approved changes must stabilize or extend the existing monthly billing month grouping workflow only, stay compact and colocated, keep invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, and driver notifications blocked unless separately approved, and keep customer/driver privacy boundaries intact.",
  "This lock adds `scripts/test-admin-monthly-billing-month-grouping-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger month grouping lock fragment ${fragment}`);
}

for (const fragment of [
  "[Admin Monthly Billing Month Grouping Existing Workflow Lock](admin-monthly-billing-month-grouping-existing-workflow-lock.md)",
  "existing admin-only Monthly Billing Month Grouping Review, guarded saved grouping read controls, draft/review action controls, and no-duplicate rule",
]) {
  assertIncludes(docsIndex, fragment, `docs index month grouping lock fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite month grouping lock registration");

for (const [label, text] of [
  ["doc", doc],
  ["ledgerSection", ledgerSection],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(text, /```(?:bash|sql)/i, `${label} runnable shell or SQL block`);
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

console.log("Admin Monthly Billing Month Grouping existing workflow lock passed");
