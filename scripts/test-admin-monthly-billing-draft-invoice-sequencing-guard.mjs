import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const appPath = "app/page.tsx";
const monthGroupingLockPath =
  "docs/admin-monthly-billing-month-grouping-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-monthly-billing-draft-invoice-sequencing-guard.mjs";

const adminRoutes = [
  "app/api/admin-monthly-billing-draft-plans/route.ts",
  "app/api/admin-monthly-invoice-drafts/route.ts",
  "app/api/admin-monthly-invoice-draft-item-reviews/route.ts",
  "app/api/admin-monthly-invoice-billable-item-price-reviews/route.ts",
  "app/api/admin-monthly-invoice-issue-reviews/route.ts",
  "app/api/admin-monthly-invoice-issue-records/route.ts",
  "app/api/admin-monthly-invoice-number-reservations/route.ts",
  "app/api/admin-monthly-invoice-issue-record-pdf-readiness/route.ts",
];

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

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing start fragment: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);

  return end === -1 ? source.slice(start) : source.slice(start, end);
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

const [appPage, monthGroupingLock, ledger, docsIndex, preactivationSuite, ...routeSources] =
  await Promise.all([
    readFile(appPath, "utf8"),
    readFile(monthGroupingLockPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(docsIndexPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    ...adminRoutes.map((routePath) => readFile(routePath, "utf8")),
  ]);

const sequencingStateBlock = sectionBetween(
  appPage,
  "const monthlyBillingDraftPlanSaving =",
  "const monthlyBillingMonthGroupingLocalNoteDetail =",
);
const sequencingMarkupBlock = sectionBetween(
  appPage,
  'aria-label="Monthly Billing Month Grouping Review"',
  'data-dispatch-workflow-step="job-card-preview"',
);
const appApiPathBlock = sectionBetween(
  appPage,
  'const adminMonthlyBillingDraftPlansApiPath = "/api/admin-monthly-billing-draft-plans";',
  'const adminAppNotificationsApiPath = "/api/admin-app-notifications";',
);

for (const fragment of [
  'const adminMonthlyBillingDraftPlansApiPath = "/api/admin-monthly-billing-draft-plans";',
  'const adminMonthlyInvoiceDraftsApiPath = "/api/admin-monthly-invoice-drafts";',
  '"/api/admin-monthly-invoice-draft-trip-candidates";',
  '"/api/admin-monthly-invoice-draft-item-reviews";',
  '"/api/admin-monthly-invoice-billable-item-price-reviews";',
  'const adminMonthlyInvoiceIssueReviewsApiPath = "/api/admin-monthly-invoice-issue-reviews";',
  'const adminMonthlyInvoiceIssueRecordsApiPath = "/api/admin-monthly-invoice-issue-records";',
  '"/api/admin-monthly-invoice-issue-record-pdf-readiness";',
  '"/api/admin-monthly-invoice-number-reservations";',
]) {
  assertIncludes(appApiPathBlock, fragment, `existing monthly draft/invoice route ${fragment}`);
}

for (const fragment of [
  'data-admin-monthly-billing-month-grouping-review="true"',
  'data-admin-monthly-billing-month-grouping-read-controls="true"',
  'data-admin-completed-booking-billing-readiness-audit-action="true"',
  'data-admin-monthly-billing-draft-plan-action-row="true"',
  'data-admin-monthly-billing-draft-plan-save-action="true"',
  'data-admin-monthly-invoice-draft-prep-action-row="true"',
  'data-admin-monthly-invoice-draft-save-action="true"',
  'data-admin-monthly-invoice-draft-item-review-action-row="true"',
  'data-admin-monthly-invoice-draft-item-review-save-action="true"',
  'data-admin-monthly-invoice-billable-price-review-action-row="true"',
  'data-admin-monthly-invoice-billable-price-review-amount-input="true"',
  'data-admin-monthly-invoice-billable-price-review-save-action="true"',
  'data-admin-monthly-invoice-issue-review-action-row="true"',
  'data-admin-monthly-invoice-issue-review-save-action="true"',
  'data-admin-monthly-invoice-issue-record-action-row="true"',
  'data-admin-monthly-invoice-issue-record-save-action="true"',
  'data-admin-monthly-invoice-number-reservation-action="true"',
  'data-admin-monthly-invoice-pdf-readiness-action="true"',
]) {
  assertIncludes(appPage, fragment, `existing monthly draft/invoice UI control ${fragment}`);
  assertIncludes(sequencingMarkupBlock, fragment, `reused monthly grouping surface ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-monthly-billing-month-grouping-review="true"', 1],
  ['data-admin-monthly-billing-draft-plan-action-row="true"', 1],
  ['data-admin-monthly-billing-draft-plan-save-action="true"', 1],
  ['data-admin-monthly-invoice-draft-prep-action-row="true"', 1],
  ['data-admin-monthly-invoice-draft-save-action="true"', 1],
  ['data-admin-monthly-invoice-draft-item-review-action-row="true"', 1],
  ['data-admin-monthly-invoice-draft-item-review-save-action="true"', 1],
  ['data-admin-monthly-invoice-billable-price-review-action-row="true"', 1],
  ['data-admin-monthly-invoice-billable-price-review-save-action="true"', 1],
  ['data-admin-monthly-invoice-issue-review-action-row="true"', 1],
  ['data-admin-monthly-invoice-issue-review-save-action="true"', 1],
  ['data-admin-monthly-invoice-issue-record-action-row="true"', 1],
  ['data-admin-monthly-invoice-issue-record-save-action="true"', 1],
  ['data-admin-monthly-invoice-number-reservation-action="true"', 1],
  ['data-admin-monthly-invoice-pdf-readiness-action="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected exactly one existing monthly draft/invoice surface for ${fragment}.`,
  );
}

for (const fragment of [
  "const monthlyBillingDraftPlanSaveDisabled =",
  "!monthlyBillingSavedGroupingPrimaryGroup ||",
  "monthlyBillingSavedGroupingTotalTrips < 1 ||",
  "const saveMonthlyBillingDraftPlanFromGrouping = async () =>",
  "if (!monthlyBillingSavedGroupingPrimaryGroup || monthlyBillingDraftPlanSaveDisabled)",
  "saveAdminMonthlyBillingDraftPlanFromGroup(",
  "const monthlyInvoiceDraftSaveDisabled =",
  "const saveMonthlyInvoiceDraftPrepFromGroup = async () =>",
  "if (!monthlyBillingSavedGroupingPrimaryGroup || monthlyInvoiceDraftSaveDisabled)",
  "saveAdminMonthlyInvoiceDraftPreparation({",
  "const monthlyInvoiceDraftItemReviewSaveDisabled =",
  "!monthlyInvoiceDraftPrimaryDraft ||",
  "!clean(monthlyInvoiceDraftPrimaryDraft.id) ||",
  "!Array.isArray(monthlyInvoiceDraftPrimaryDraft.linked_trips) ||",
  "monthlyInvoiceDraftPrimaryDraft.linked_trips.length < 1 ||",
  "saveMonthlyInvoiceDraftItemReviewFromCurrentDraft",
  "saveAdminMonthlyInvoiceDraftItemReviewFromDraft({",
  "const monthlyInvoiceBillablePriceReviewSaveDisabled =",
  "!monthlyInvoiceDraftItemReviewPrimaryReview ||",
  "!monthlyInvoiceBillablePriceReviewAmountCents ||",
  "saveMonthlyInvoiceBillablePriceReviewFromCurrentItem",
  "saveAdminMonthlyInvoiceBillablePriceReviewFromItemReview({",
  "const monthlyInvoiceIssueReviewSaveDisabled =",
  "!monthlyInvoiceDraftItemReviewHasReview ||",
  "!monthlyInvoiceBillablePriceReviewApproved ||",
  "monthlyInvoiceDraftTotalTripsCount < 1 ||",
  "saveMonthlyInvoiceIssueReviewFromCurrentDraft",
  "saveAdminMonthlyInvoiceIssueReviewFromDraft({",
  "const monthlyInvoiceIssueRecordSaveDisabled =",
  "!monthlyInvoiceIssueReviewPrimaryReview ||",
  "!clean(monthlyInvoiceIssueReviewPrimaryReview.id) ||",
  "!clean(monthlyInvoiceIssueReviewPrimaryReview.draft_id) ||",
  "monthlyInvoiceIssueRecordHasNumberedFlow ||",
  "monthlyInvoiceIssueReviewTotalTripsCount < 1 ||",
  "saveMonthlyInvoiceIssueRecordFromCurrentReview",
  "saveAdminMonthlyInvoiceIssueRecordFromReview({",
  "const monthlyInvoiceNumberReservationDisabled =",
  "monthlyInvoiceIssueRecordPrimaryRecord.draft_lock_status !== \"locked_for_issue\" ||",
  "monthlyInvoiceIssueRecordPrimaryRecord.issue_record_status !== \"draft_locked\" ||",
  "Boolean(clean(monthlyInvoiceIssueRecordPrimaryRecord.invoice_number)) ||",
  "reserveMonthlyInvoiceNumberFromCurrentIssueRecord",
  "reserveAdminMonthlyInvoiceNumberForIssueRecord(",
  "const monthlyInvoicePdfReadinessDisabled =",
  "monthlyInvoiceIssueRecordPrimaryRecord.issue_record_status !== \"invoice_number_reserved\" ||",
  "monthlyInvoiceIssueRecordPrimaryRecord.draft_lock_status !== \"locked_for_issue\" ||",
  "monthlyInvoiceIssueRecordPrimaryRecord.invoice_number_status !== \"reserved\" ||",
  "!clean(monthlyInvoiceIssueRecordPrimaryRecord.invoice_number) ||",
  "monthlyInvoiceIssueRecordPrimaryRecord.pdf_generation_status !== \"not_requested\" ||",
  "monthlyInvoiceIssueRecordPrimaryRecord.invoice_delivery_status !== \"not_sent\" ||",
  "monthlyInvoiceIssueRecordPrimaryRecord.payment_record_status !== \"not_recorded\" ||",
  "markMonthlyInvoiceIssueRecordPdfReviewReady",
  "markAdminMonthlyInvoiceIssueRecordPdfReviewReady(",
]) {
  assertIncludes(sequencingStateBlock, fragment, `monthly draft/invoice sequencing state ${fragment}`);
}

const sequenceOrder = [
  "const monthlyBillingDraftPlanSaveDisabled =",
  "const monthlyInvoiceDraftSaveDisabled =",
  "const monthlyInvoiceDraftItemReviewSaveDisabled =",
  "const monthlyInvoiceBillablePriceReviewSaveDisabled =",
  "const monthlyInvoiceIssueReviewSaveDisabled =",
  "const monthlyInvoiceIssueRecordSaveDisabled =",
  "const monthlyInvoiceNumberReservationDisabled =",
  "const monthlyInvoicePdfReadinessDisabled =",
];
let lastIndex = -1;
for (const fragment of sequenceOrder) {
  const index = sequencingStateBlock.indexOf(fragment);
  assert.equal(index > lastIndex, true, `Expected sequencing order for ${fragment}.`);
  lastIndex = index;
}

for (const fragment of [
  "{monthlyBillingSavedGroupingHasGroup ? (",
  "{monthlyInvoiceDraftHasDraft ? (",
  "{monthlyInvoiceDraftItemReviewHasReview ? (",
  "{monthlyInvoiceIssueReviewHasReview ? (",
  "No direct Supabase",
  "write outside approved API routes; no invoice creation, PDF",
  "generation, PDF sending, payment, payout, notification sending, auth change, parser change, billing",
]) {
  assertIncludes(sequencingMarkupBlock, fragment, `monthly draft/invoice markup boundary ${fragment}`);
}

for (const fragment of [
  "No PDF file, payment, payout, notification, or sending was created.",
  "No PDF, payment, payout, or sending was created.",
]) {
  assertIncludes(sequencingStateBlock, fragment, `monthly draft/invoice no-live result copy ${fragment}`);
}

for (const routeSource of routeSources) {
  assertIncludes(
    routeSource,
    "resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose)",
    "monthly draft/invoice admin boundary",
  );
  assertIncludes(routeSource, "requireAdminDispatcherBoundary(request)", "monthly draft/invoice boundary call");
  assertIncludes(routeSource, "blockedResponse(boundary.error)", "monthly draft/invoice blocked response");
  assertIncludes(routeSource, "safeFailureResponse()", "monthly draft/invoice safe failure response");
  assertNotMatches(
    routeSource,
    /SERVICE_ROLE_KEY|process\.env\.[A-Z0-9_]*(?:PAYMENT|PAYOUT|SEND|TWILIO|TELEGRAM|WHATSAPP|SMTP|PDF|CALENDAR|LOCATION|PHOTO|AUTH)/i,
    "monthly draft/invoice route env/provider activation",
  );
}

for (const forbidden of [
  "/api/admin-bookings",
  "/api/admin-saved-bookings",
  "/api/ai-parse",
  "/api/admin-billing-payment-action-disabled-setup",
  "/api/admin-calendar-event-lifecycle-action-disabled-setup",
  "/api/admin-customer-driver-details-email-send-disabled-setup",
  "/api/admin-whatsapp-customer-driver-details-send-disabled-setup",
  "/api/admin-sms-customer-driver-details-send-disabled-setup",
  "/api/admin-live-location-access-disabled-setup",
  "/api/admin-ots-photo-proof-upload-disabled-setup",
]) {
  assertExcludes(
    sequencingStateBlock + sequencingMarkupBlock,
    forbidden,
    `monthly draft/invoice sequencing forbidden route ${forbidden}`,
  );
}

for (const fragment of [
  "Existing Monthly Billing Month Grouping to Draft Plan / Invoice Review Sequencing",
  "Saved monthly billing grouping is the prerequisite for draft plan and invoice draft-prep actions.",
  "A saved invoice draft with linked trips is the prerequisite for item review.",
  "A saved item review and reviewed amount are prerequisites for billable price review.",
  "An approved billable price review is the prerequisite for issue review.",
  "A saved issue review is the prerequisite for issue record creation.",
  "A locked draft issue record is the prerequisite for invoice-number reservation.",
  "A reserved invoice number on a locked issue record is the prerequisite for PDF-review readiness.",
  "`scripts/test-admin-monthly-billing-draft-invoice-sequencing-guard.mjs` covers this draft/invoice sequencing boundary.",
]) {
  assertIncludes(monthGroupingLock, fragment, `month grouping lock draft/invoice sequencing ${fragment}`);
}

for (const fragment of [
  "## Admin Monthly Billing Draft And Invoice Review Sequencing Guard Lock",
  "Monthly Billing Month Grouping to Draft Plan / Invoice Review sequencing is now docs/test guard-locked through existing derived readiness state.",
  "Saved monthly billing grouping gates the existing draft-plan and invoice draft-prep actions.",
  "Saved invoice draft, item review, approved billable price review, issue review, issue record, invoice-number reservation, and PDF-review readiness stay ordered through the existing action controls.",
  "This lock adds `scripts/test-admin-monthly-billing-draft-invoice-sequencing-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledger, fragment, `ledger draft/invoice sequencing ${fragment}`);
}

assertIncludes(
  docsIndex,
  "[Admin Monthly Billing Draft And Invoice Review Sequencing Guard](../scripts/test-admin-monthly-billing-draft-invoice-sequencing-guard.mjs)",
  "docs index draft/invoice sequencing guard",
);
assertIncludes(preactivationSuite, guardScript, "preactivation draft/invoice sequencing registration");

const appFiles = await listFiles("app");
const publicSurfaceFiles = appFiles.filter((file) => {
  const normalized = file.split(path.sep).join("/");

  return (
    normalized !== appPath &&
    !normalized.startsWith("app/api/admin-") &&
    (normalized.startsWith("app/api/customer") ||
      normalized.startsWith("app/api/driver") ||
      normalized.startsWith("app/book") ||
      normalized.startsWith("app/customers") ||
      normalized.startsWith("app/driver-job") ||
      normalized.startsWith("app/my-bookings"))
  );
});

for (const file of publicSurfaceFiles) {
  const source = await readFile(file, "utf8");

  for (const fragment of [
    "data-admin-monthly-billing-draft-plan-save-action",
    "data-admin-monthly-invoice-draft-save-action",
    "data-admin-monthly-invoice-draft-item-review-save-action",
    "data-admin-monthly-invoice-billable-price-review-save-action",
    "data-admin-monthly-invoice-issue-review-save-action",
    "data-admin-monthly-invoice-issue-record-save-action",
    "data-admin-monthly-invoice-number-reservation-action",
    "data-admin-monthly-invoice-pdf-readiness-action",
    "Monthly Billing Month Grouping Review",
    "monthly invoice issue record",
    "monthly invoice number",
  ]) {
    assertExcludes(source, fragment, `${file} public monthly draft/invoice sequencing fragment`);
  }
}

for (const [label, text] of [
  ["monthGroupingLock", monthGroupingLock],
  ["ledger", ledger],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(text, /```(?:bash|sql)/i, `${label} runnable shell or SQL block`);
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

console.log("Admin Monthly Billing Draft and Invoice Review sequencing guard passed");
