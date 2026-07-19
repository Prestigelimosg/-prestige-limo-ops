import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardScript = "scripts/test-customer-folder-price-review-guard.mjs";
const [folder, customers, sharedCalculation, savedBookingsRead, rateSetupRoute, ledger, suite] = await Promise.all([
  readFile("app/customers/[customerId]/saved-bookings-panel.tsx", "utf8"),
  readFile("app/customers/page.tsx", "utf8"),
  readFile("lib/customer-dsp-invoice-review.ts", "utf8"),
  readFile("lib/admin-customer-saved-bookings-read.ts", "utf8"),
  readFile("app/api/admin-rate-setup/route.ts", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);

  return source.slice(start, end);
}

for (const fragment of [
  'data-customer-folder-saved-bookings-price=',
  'data-customer-folder-price-review-editor=',
  'data-customer-folder-price-review-input=',
  'data-customer-folder-price-review-save=',
  "Customer price",
  "Save price review",
  '"Review required"',
  '"Codex price · review"',
  '"Review every price first"',
  'review?.status === "reviewed"',
  "loadAutomatedBillingReviews",
  "customerInvoiceBookingType",
  "Confirm a supported saved service (MNG, DEP, TRF, or DSP) before price review.",
  "adminDriverJobDspActualTimeSummariesApiPath",
  "adminRateSetupApiPath",
  "calculateCustomerInvoiceRateReview",
  "customerFolderReviewedPricePayload",
  'params.set("selected_booking_references"',
  "customerFolderSelectedPriceReviewsParam",
]) {
  includes(folder, fragment, `customer-folder price review ${fragment}`);
}

for (const fragment of [
  "function selectedInvoicePriceReviews(value: string, selectedReferences: string[])",
  "selectedReferenceSet.has(reference)",
  "Number.isSafeInteger(amountCents)",
  "amountCents <= 100_000_000",
  "missingReviewedPriceReference",
  "Review the customer price for ${missingReviewedPriceReference}",
  "amount: firstInvoiceRow.amountCents",
  "amount: row.amountCents",
  "their reviewed customer prices",
]) {
  includes(customers, fragment, `exact invoice handoff price review ${fragment}`);
}

for (const fragment of [
  "export function calculateCustomerInvoiceRateReview",
  "export function customerInvoiceBookingType",
  "export function calculateCustomerDspInvoiceReview",
  "calculateDspCustomerInvoiceAmountCents",
  "if (!bookingType)",
  "baseAmountCents",
  "customerRateUnit",
  "traveler.id === input.travelerId",
  "company.id === input.companyId",
  "hourlyRateCents",
  "surchargeAmountCents",
  "customerRateSource",
]) {
  includes(sharedCalculation, fragment, `shared DSP customer calculation ${fragment}`);
}

const safeReviewShape = sectionBetween(
  sharedCalculation,
  "export type CustomerInvoiceRateReview = {",
  "export type CustomerDspInvoiceReview",
);
for (const forbidden of ["driverPayout", "payout", "payNow", "internal", "finance"]) {
  assert.equal(
    safeReviewShape.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    `shared customer review result must not expose ${forbidden}`,
  );
}

for (const fragment of [
  "company_id: number | null;",
  "traveler_id: number | null;",
  "vehicle_type_or_category: string | null;",
  "child_seat_count: number;",
  "extra_stop_count: number;",
]) {
  includes(savedBookingsRead, fragment, `existing safe booking calculation input ${fragment}`);
}

for (const fragment of [
  'additionalSameOriginRefererPathPrefixes: ["/customers/"]',
  'additionalSameOriginRefererPathnames: ["/customers"]',
]) {
  includes(rateSetupRoute, fragment, `customer-folder rate setup boundary ${fragment}`);
}

const ledgerSection = sectionBetween(
  ledger,
  "### Customer-Folder Price Review Before Invoice (2026-07-19)",
  "\n### ",
);
for (const phrase of [
  "Every existing `Jobs not billed yet` row now has one compact `Customer price` tag.",
  "DEP, TRF, and MNG rows without a saved amount receive a temporary Codex proposal from the existing Prestige rate setup",
  "The proposal remains in browser memory only until admin clicks `Save price review`",
  "Multi-job `Review invoice & email` remains disabled until every selected row has a positive reviewed customer price.",
  "no driver payout or payout comparison is returned or rendered.",
  guardScript,
]) {
  includes(ledgerSection, phrase, `price-review ledger phrase ${phrase}`);
}

includes(suite, guardScript, "preactivation price-review guard registration");

console.log("Customer-folder price review guard passed");
