import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docPath = "docs/admin-closeout-billing-preparation-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPath = "app/page.tsx";
const appSmokePath = "scripts/test-app-smoke-browser.mjs";
const bookingUiBrowserPath = "scripts/test-booking-ui-browser.mjs";
const mobileUsabilityBrowserPath = "scripts/test-mobile-usability-browser.mjs";
const guardScript = "scripts/test-admin-closeout-billing-preparation-existing-workflow-lock.mjs";

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
  "# Admin Closeout To Billing Preparation Existing Workflow Lock",
  "This document is docs/test-only.",
  "It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing activation, invoice/PDF/payment/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "The admin-only closeout-to-billing preparation workflow already exists in the current app. Do not rebuild it as a duplicate workflow.",
  "`app/page.tsx` owns the existing Closeout to Billing Preparation Review at `data-admin-closeout-to-billing-preparation-review`.",
  "`app/page.tsx` owns the existing Billing Preparation Exception Review at `data-admin-billing-preparation-exception-review`.",
  "`app/page.tsx` owns the existing Billing Preparation Summary / Ready Review at `data-admin-billing-preparation-summary-ready-review`.",
  "These surfaces are local admin review controls only.",
  "They do not create invoices, PDFs, payment links, payout records, billing automation, accounting posts, notification sends, customer messages, driver notifications, live location behavior, parser-learning behavior, Supabase writes, or live database access.",
  "`scripts/test-app-smoke-browser.mjs` covers all three closeout-to-billing preparation surfaces across mobile and desktop viewports.",
  "`scripts/test-booking-ui-browser.mjs` covers the existing local control labels, status text, local-only boundary, and forbidden private text checks.",
  "`scripts/test-mobile-usability-browser.mjs` covers compact mobile layout, readable rows/controls/notes, and no-horizontal-overflow behavior.",
  "Future work must reuse the existing closeout-to-billing preparation workflow instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.",
  "Allowed future work, only after explicit owner approval, must stay compact and colocated with the existing closeout and billing-preparation review controls.",
  "Adding a duplicate closeout-to-billing preparation, billing-prep exception, or billing-prep summary UI sector, button, card, route, helper, or shim.",
  "Activating invoice creation, PDF generation, payment links, payment collection, payout automation, billing automation, accounting posting, provider sends, live location, auth, photo/proof, calendar behavior, parser-learning behavior, or DB writes.",
  "Moving this workflow into customer or driver surfaces.",
  "Exposing customer price, driver payout, PayNow payout details, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, mock QA/dev archive, or secrets.",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.",
]) {
  assertIncludes(doc, fragment, `closeout billing prep lock doc fragment ${fragment}`);
}

for (const fragment of [
  "const closeoutToBillingPreparationReviewStatusLabel =",
  "const closeoutToBillingPreparationReviewOptions:",
  "const closeoutToBillingPreparationReviewItems:",
  "const billingPreparationExceptionReviewStatusLabel =",
  "const billingPreparationExceptionReviewOptions:",
  "const billingPreparationExceptionReviewItems:",
  "const billingPreparationSummaryReviewStatusLabel =",
  "const billingPreparationSummaryReviewOptions:",
  "const billingPreparationSummaryReviewItems:",
  'data-admin-closeout-to-billing-preparation-review="true"',
  'data-admin-closeout-to-billing-preparation-review-controls="true"',
  'data-admin-closeout-to-billing-preparation-review-note="true"',
  'data-admin-closeout-to-billing-preparation-review-boundary="true"',
  'data-admin-billing-preparation-exception-review="true"',
  'data-admin-billing-preparation-exception-review-controls="true"',
  'data-admin-billing-preparation-exception-review-note="true"',
  'data-admin-billing-preparation-exception-review-boundary="true"',
  'data-admin-billing-preparation-summary-ready-review="true"',
  'data-admin-billing-preparation-summary-ready-review-controls="true"',
  'data-admin-billing-preparation-summary-ready-review-note="true"',
  'data-admin-billing-preparation-summary-ready-review-boundary="true"',
  "Closeout to Billing Preparation Review",
  "Billing Preparation Exception Review",
  "Billing Preparation Summary / Ready Review",
  "Local bridge from completed trip closeout to future billing preparation.",
  "Local exception check before any future billing preparation work.",
  "Local summary for future monthly billing readiness after closeout and exception review.",
  "Local UI only. No Supabase write, live database access, billing activation, invoice, PDF,",
  "payment, payout, notification sending, customer message, driver notification, live location, or",
  "parser-learning behavior.",
]) {
  assertIncludes(appPage, fragment, `existing app closeout billing prep fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-closeout-to-billing-preparation-review="true"', 1],
  ['data-admin-billing-preparation-exception-review="true"', 1],
  ['data-admin-billing-preparation-summary-ready-review="true"', 1],
  ['data-admin-closeout-to-billing-preparation-review-boundary="true"', 1],
  ['data-admin-billing-preparation-exception-review-boundary="true"', 1],
  ['data-admin-billing-preparation-summary-ready-review-boundary="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected one existing app closeout billing prep surface for ${fragment}`,
  );
}

for (const fragment of [
  "checkAdminCloseoutToBillingPreparationReview",
  "checkAdminBillingPreparationExceptionReview",
  "checkAdminBillingPreparationSummaryReadyReview",
  "Closeout to Billing Preparation Review",
  "Billing Preparation Exception Review",
  "Billing Preparation Summary / Ready Review",
  "[data-admin-closeout-to-billing-preparation-review]",
  "[data-admin-billing-preparation-exception-review]",
  "[data-admin-billing-preparation-summary-ready-review]",
  "expected closeout to billing preparation boundary text",
  "expected billing preparation exception boundary text",
  "expected billing preparation summary ready review boundary text",
  "expected no private/customer/driver forbidden text in billing preparation review",
  "expected no private/customer/driver forbidden text in billing preparation exception review",
  "expected no private/customer/driver forbidden text in billing preparation summary ready review",
  "expected closeout to billing preparation not to create horizontal overflow",
  "expected billing preparation exception not to create horizontal overflow",
  "expected billing preparation summary ready review not to create horizontal overflow",
]) {
  assertIncludes(appSmoke, fragment, `app smoke closeout billing prep fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-closeout-to-billing-preparation-review='true']",
  "[data-admin-billing-preparation-exception-review='true']",
  "[data-admin-billing-preparation-summary-ready-review='true']",
  "Closeout to Billing Preparation Review",
  "Billing Preparation Exception Review",
  "billingPreparationSummaryReadyReview",
  "Closeout to billing preparation review needed",
  "Billing preparation exception review needed",
  "Billing preparation summary review needed",
  "state.closeoutToBillingPreparationReview.options.map",
  "state.billingPreparationExceptionReview.options.map",
  "state.billingPreparationSummaryReadyReview.options.map",
]) {
  assertIncludes(bookingUiBrowser, fragment, `booking UI closeout billing prep fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-closeout-to-billing-preparation-review='true']",
  "[data-admin-billing-preparation-exception-review='true']",
  "[data-admin-billing-preparation-summary-ready-review='true']",
  "expected Closeout to Billing Preparation Review section",
  "expected Billing Preparation Exception Review section",
  "expected Billing Preparation Summary / Ready Review section",
  "expected Closeout to Billing Preparation Review local-only boundary",
  "expected Billing Preparation Exception Review local-only boundary",
  "expected Billing Preparation Summary / Ready Review local-only boundary",
  "expected Closeout to Billing Preparation Review not to create horizontal overflow",
  "expected Billing Preparation Exception Review not to create horizontal overflow",
  "expected Billing Preparation Summary / Ready Review not to create horizontal overflow",
]) {
  assertIncludes(mobileUsabilityBrowser, fragment, `mobile closeout billing prep fragment ${fragment}`);
}

const ledgerSection = sectionBetween(ledger, "## Admin Closeout To Billing Preparation Existing Workflow Lock");

for (const fragment of [
  "The existing admin-only Closeout to Billing Preparation workflow is locked by `docs/admin-closeout-billing-preparation-existing-workflow-lock.md`.",
  "This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing activation, invoice/PDF/payment/pricing/payout/auth/location/photo/calendar activation, or new shims.",
  "Do not add a duplicate Closeout to Billing Preparation, Billing Preparation Exception, or Billing Preparation Summary / Ready Review UI sector, button, card, route, helper, or shim.",
  "Existing surfaces are `data-admin-closeout-to-billing-preparation-review`, `data-admin-billing-preparation-exception-review`, and `data-admin-billing-preparation-summary-ready-review` in `app/page.tsx`.",
  "Existing coverage lives in `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, and `scripts/test-mobile-usability-browser.mjs`.",
  "Future approved changes must stabilize or extend the existing billing-preparation workflow only, stay compact and colocated, keep invoice/PDF/payment/payout/billing automation blocked unless separately approved, and keep customer/driver privacy boundaries intact.",
  "This lock adds `scripts/test-admin-closeout-billing-preparation-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger closeout billing prep lock fragment ${fragment}`);
}

for (const fragment of [
  "[Admin Closeout To Billing Preparation Existing Workflow Lock](admin-closeout-billing-preparation-existing-workflow-lock.md)",
  "existing admin-only Closeout to Billing Preparation, Billing Preparation Exception, Billing Preparation Summary / Ready Review surfaces, and no-duplicate rule",
]) {
  assertIncludes(docsIndex, fragment, `docs index closeout billing prep lock fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite closeout billing prep lock registration");

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

console.log("Admin Closeout to Billing Preparation existing workflow lock passed");
