import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

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
  '"Codex price · tick to confirm"',
  "Ticking a job confirms its displayed customer price for this invoice.",
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
  "Selected job ${missingReviewedPriceReference} remains listed below but is blocked until its customer price is reviewed in Jobs not billed yet.",
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

const calculationRuntimeDir = await mkdtemp(
  path.join(os.tmpdir(), "prestige-customer-invoice-rate-review-"),
);

try {
  for (const moduleName of ["hourly-billing", "pricing", "customer-dsp-invoice-review"]) {
    const source = await readFile(`lib/${moduleName}.ts`, "utf8");

    await writeFile(
      path.join(calculationRuntimeDir, `${moduleName}.js`),
      ts.transpileModule(source, {
        compilerOptions: {
          esModuleInterop: true,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    );
  }

  const require = createRequire(import.meta.url);
  const { calculateCustomerInvoiceRateReview } = require(
    path.join(calculationRuntimeDir, "customer-dsp-invoice-review.js"),
  );
  const exactIdentityInput = {
    actualMinutes: null,
    bookingType: "DEP",
    childSeatCount: 0,
    companyId: 26,
    extraStopCount: 0,
    pickupAt: "2026-07-20T04:00:00.000Z",
    travelerId: 22,
    vehicleType: "AVF",
  };
  const exactDefaultSetup = {
    companies: [{ customer_rates: {}, id: 26 }],
    settings: {
      child_seat_customer_surcharge: 15,
      customer_rates: { DEP: { AVF: 70 } },
      extra_stop_surcharge: 0,
      midnight_surcharge: 15,
    },
    travelers: [{ company_id: 26, customer_rates: {}, id: 22 }],
  };

  assert.deepEqual(
    calculateCustomerInvoiceRateReview(exactIdentityInput, exactDefaultSetup),
    {
      actualMinutes: null,
      amountCents: 7000,
      baseAmountCents: 7000,
      billableHours: null,
      billableMinutes: null,
      bookingType: "DEP",
      customerRateSource: "default",
      customerRateUnit: "job",
      rateCents: 7000,
      surchargeAmountCents: 0,
    },
    "Exact verified identities with no override must use the Prestige default rate",
  );

  const companyOverrideSetup = {
    ...exactDefaultSetup,
    companies: [{ customer_rates: { DEP: { AVF: 72 } }, id: 26 }],
  };
  const companyOverrideReview = calculateCustomerInvoiceRateReview(
    exactIdentityInput,
    companyOverrideSetup,
  );
  assert.equal(companyOverrideReview?.rateCents, 7200);
  assert.equal(companyOverrideReview?.amountCents, 7200);
  assert.equal(companyOverrideReview?.customerRateSource, "company");

  const travelerOverrideSetup = {
    ...companyOverrideSetup,
    travelers: [
      { company_id: 26, customer_rates: { DEP: { AVF: 73 } }, id: 22 },
    ],
  };
  const travelerOverrideReview = calculateCustomerInvoiceRateReview(
    exactIdentityInput,
    travelerOverrideSetup,
  );
  assert.equal(travelerOverrideReview?.rateCents, 7300);
  assert.equal(travelerOverrideReview?.amountCents, 7300);
  assert.equal(travelerOverrideReview?.customerRateSource, "boss");

  const mismatchedTravelerReview = calculateCustomerInvoiceRateReview(
    exactIdentityInput,
    {
      ...companyOverrideSetup,
      travelers: [
        { company_id: 999, customer_rates: { DEP: { AVF: 99 } }, id: 22 },
      ],
    },
  );
  assert.equal(mismatchedTravelerReview?.rateCents, 7200);
  assert.equal(mismatchedTravelerReview?.customerRateSource, "company");

  const unrelatedTravelerReview = calculateCustomerInvoiceRateReview(
    exactIdentityInput,
    {
      ...companyOverrideSetup,
      travelers: [
        { company_id: 26, customer_rates: { MNG: { AVF: 99 } }, id: 22 },
      ],
    },
  );
  assert.equal(unrelatedTravelerReview?.rateCents, 7200);
  assert.equal(unrelatedTravelerReview?.customerRateSource, "company");
} finally {
  await rm(calculationRuntimeDir, { force: true, recursive: true });
}

console.log("Customer-folder price review guard passed");
