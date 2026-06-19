import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docPath = "docs/admin-monthly-billing-queue-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPath = "app/page.tsx";
const appSmokePath = "scripts/test-app-smoke-browser.mjs";
const bookingUiBrowserPath = "scripts/test-booking-ui-browser.mjs";
const mobileUsabilityBrowserPath = "scripts/test-mobile-usability-browser.mjs";
const guardScript = "scripts/test-admin-monthly-billing-queue-existing-workflow-lock.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
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
  appSmoke,
  bookingUiBrowser,
  mobileUsabilityBrowser,
] = await Promise.all([
  readFile(docPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(appSmokePath, "utf8"),
  readFile(bookingUiBrowserPath, "utf8"),
  readFile(mobileUsabilityBrowserPath, "utf8"),
]);

for (const fragment of [
  "# Admin Monthly Billing Queue Existing Workflow Lock",
  "This document is docs/test-only.",
  "It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing activation, invoice/PDF/payment/pricing/payout/auth/location/photo/calendar activation, month grouping activation, or new shims.",
  "The admin-only Monthly Billing Queue Readiness and Monthly Billing Queue Exception workflow already exists in the current app. Do not rebuild it as a duplicate workflow.",
  "`app/page.tsx` owns the existing Monthly Billing Queue Readiness Review at `data-admin-monthly-billing-queue-readiness-review`.",
  "`app/page.tsx` owns the existing Monthly Billing Queue Exception Review at `data-admin-monthly-billing-queue-exception-review`.",
  "These surfaces are local admin review controls only.",
  "They do not create invoices, PDFs, payment links, payout records, monthly billing groups, billing automation, accounting posts, notification sends, customer messages, driver notifications, auth changes, parser changes, Supabase writes, or live database access.",
  "The separate Monthly Billing Month Grouping Review and its read/action controls are not activated or changed by this lock.",
  "`scripts/test-app-smoke-browser.mjs` covers both monthly billing queue surfaces across mobile and desktop viewports.",
  "`scripts/test-booking-ui-browser.mjs` covers the existing local control labels, status text, local-only boundary, and forbidden private text checks.",
  "`scripts/test-mobile-usability-browser.mjs` covers compact mobile layout, readable rows/controls/notes, and no-horizontal-overflow behavior.",
  "Future work must reuse the existing Monthly Billing Queue Readiness and Exception workflow instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.",
  "Allowed future work, only after explicit owner approval, must stay compact and colocated with the existing monthly billing queue review controls.",
  "Adding a duplicate monthly billing queue readiness or monthly billing queue exception UI sector, button, card, route, helper, or shim.",
  "Activating invoice creation, PDF generation, payment links, payment collection, payout automation, billing automation, monthly grouping writes, accounting posting, provider sends, live location, auth, photo/proof, calendar behavior, parser-learning behavior, or DB writes.",
  "Moving this workflow into customer or driver surfaces.",
  "Exposing customer price, driver payout, PayNow payout details, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, mock QA/dev archive, or secrets.",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.",
]) {
  assertIncludes(doc, fragment, `monthly billing queue lock doc fragment ${fragment}`);
}

for (const fragment of [
  "const monthlyBillingQueueReadinessReviewStatusLabel =",
  "const monthlyBillingQueueReadinessReviewOptions:",
  "const monthlyBillingQueueReadinessReviewItems:",
  "const monthlyBillingQueueExceptionReviewStatusLabel =",
  "const monthlyBillingQueueExceptionReviewOptions:",
  "const monthlyBillingQueueExceptionReviewItems:",
  'data-admin-monthly-billing-queue-readiness-review="true"',
  'data-admin-monthly-billing-queue-readiness-review-controls="true"',
  'data-admin-monthly-billing-queue-readiness-review-note="true"',
  'data-admin-monthly-billing-queue-readiness-review-boundary="true"',
  'data-admin-monthly-billing-queue-exception-review="true"',
  'data-admin-monthly-billing-queue-exception-review-controls="true"',
  'data-admin-monthly-billing-queue-exception-review-note="true"',
  'data-admin-monthly-billing-queue-exception-review-boundary="true"',
  "Monthly Billing Queue Readiness Review",
  "Monthly Billing Queue Exception Review",
  "Local queue review for completed trips before any future monthly billing work.",
  "Local exception review for blocked trips before any future monthly billing work.",
  "Local UI only. No Supabase write, live database access, invoice creation, PDF, payment,",
  "payout, notification sending, auth change, parser change, billing activation, customer message,",
  "or driver notification behavior.",
]) {
  assertIncludes(appPage, fragment, `existing app monthly billing queue fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-monthly-billing-queue-readiness-review="true"', 1],
  ['data-admin-monthly-billing-queue-exception-review="true"', 1],
  ['data-admin-monthly-billing-queue-readiness-review-boundary="true"', 1],
  ['data-admin-monthly-billing-queue-exception-review-boundary="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected one existing app monthly billing queue surface for ${fragment}`,
  );
}

for (const fragment of [
  "checkAdminMonthlyBillingQueueReadinessReview",
  "checkAdminMonthlyBillingQueueExceptionReview",
  "Monthly Billing Queue Readiness Review",
  "Monthly Billing Queue Exception Review",
  "[data-admin-monthly-billing-queue-readiness-review]",
  "[data-admin-monthly-billing-queue-exception-review]",
  "expected monthly billing queue readiness boundary text",
  "expected monthly billing queue exception boundary text",
  "expected no private/customer/driver forbidden text in monthly billing queue readiness review",
  "expected no private/customer/driver forbidden text in monthly billing queue exception review",
  "expected monthly billing queue readiness review not to create horizontal overflow",
  "expected monthly billing queue exception review not to create horizontal overflow",
]) {
  assertIncludes(appSmoke, fragment, `app smoke monthly billing queue fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-monthly-billing-queue-readiness-review='true']",
  "[data-admin-monthly-billing-queue-exception-review='true']",
  "Monthly Billing Queue Readiness Review",
  "Monthly Billing Queue Exception Review",
  "Monthly billing queue review needed",
  "Monthly billing queue exception review needed",
  "state.monthlyBillingQueueReadinessReview.options.map",
  "state.monthlyBillingQueueExceptionReview.options.map",
  "state.monthlyBillingQueueReadinessReview.boundary",
  "state.monthlyBillingQueueExceptionReview.boundary",
]) {
  assertIncludes(bookingUiBrowser, fragment, `booking UI monthly billing queue fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-monthly-billing-queue-readiness-review='true']",
  "[data-admin-monthly-billing-queue-exception-review='true']",
  "expected Monthly Billing Queue Readiness Review section",
  "expected Monthly Billing Queue Exception Review section",
  "expected Monthly Billing Queue Readiness Review local-only boundary",
  "expected Monthly Billing Queue Exception Review local-only boundary",
  "expected Monthly Billing Queue Readiness Review not to create horizontal overflow",
  "expected Monthly Billing Queue Exception Review not to create horizontal overflow",
]) {
  assertIncludes(mobileUsabilityBrowser, fragment, `mobile monthly billing queue fragment ${fragment}`);
}

const ledgerSection = sectionBetween(ledger, "## Admin Monthly Billing Queue Existing Workflow Lock");

for (const fragment of [
  "The existing admin-only Monthly Billing Queue Readiness and Exception workflow is locked by `docs/admin-monthly-billing-queue-existing-workflow-lock.md`.",
  "This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing activation, invoice/PDF/payment/pricing/payout/auth/location/photo/calendar activation, month grouping activation, or new shims.",
  "Do not add a duplicate Monthly Billing Queue Readiness or Monthly Billing Queue Exception UI sector, button, card, route, helper, or shim.",
  "Existing surfaces are `data-admin-monthly-billing-queue-readiness-review` and `data-admin-monthly-billing-queue-exception-review` in `app/page.tsx`.",
  "Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, and `scripts/test-mobile-usability-browser.mjs`.",
  "Future approved changes must stabilize or extend the existing monthly billing queue workflow only, stay compact and colocated, keep invoice/PDF/payment/payout/billing automation and month grouping writes blocked unless separately approved, and keep customer/driver privacy boundaries intact.",
  "This lock adds `scripts/test-admin-monthly-billing-queue-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger monthly billing queue lock fragment ${fragment}`);
}

for (const fragment of [
  "[Admin Monthly Billing Queue Existing Workflow Lock](admin-monthly-billing-queue-existing-workflow-lock.md)",
  "existing admin-only Monthly Billing Queue Readiness and Monthly Billing Queue Exception review surfaces, and no-duplicate rule",
]) {
  assertIncludes(docsIndex, fragment, `docs index monthly billing queue lock fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite monthly billing queue lock registration");

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

console.log("Admin Monthly Billing Queue existing workflow lock passed");
