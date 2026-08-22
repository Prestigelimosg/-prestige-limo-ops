import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const guardScript = "scripts/test-customer-folder-price-review-guard.mjs";
const [
  agents,
  folder,
  customers,
  sharedCalculation,
  savedBookingsRead,
  adminSavedBookingsRead,
  rateSetupRoute,
  dspActualTimeRoute,
  invoicePersistence,
  ledger,
  suite,
] = await Promise.all([
  readFile("AGENTS.md", "utf8"),
  readFile("app/customers/[customerId]/saved-bookings-panel.tsx", "utf8"),
  readFile("app/customers/page.tsx", "utf8"),
  readFile("lib/customer-dsp-invoice-review.ts", "utf8"),
  readFile("lib/admin-customer-saved-bookings-read.ts", "utf8"),
  readFile("lib/admin-saved-booking-read.ts", "utf8"),
  readFile("app/api/admin-rate-setup/route.ts", "utf8"),
  readFile("app/api/admin-driver-job-dsp-actual-time-summaries/route.ts", "utf8"),
  readFile("lib/customer-invoice-record-persistence.ts", "utf8"),
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

const dspCalculationAgentLockSection = sectionBetween(
  agents,
  "# Owner-locked DSP customer billing calculation — do not break",
  "\n# ",
);
for (const phrase of [
  "saved canonical booking pickup",
  "real persisted Driver `Job Completed`/JC timestamp",
  "must never use Driver OTS, POB, scheduled DSP end, current time, booking status, or admin completion",
  "two-hour minimum",
  "15-minute grace",
  "verified traveler/company/Prestige rate precedence",
  "booking `10846`",
  "`374` minutes",
  "`6` billable hours",
  "SGD390",
  "must remain a temporary review proposal",
  "must never automatically save a customer price, select a job, create or issue an invoice, send an email, or record a payment",
  guardScript,
  "scripts/test-admin-dispatch-dsp-scheduled-end-invoice-wiring-guard.mjs",
  "scripts/test-admin-driver-job-dsp-actual-time-read-api-contract.mjs",
]) {
  includes(
    dspCalculationAgentLockSection,
    phrase,
    `DSP customer billing owner lock ${phrase}`,
  );
}

for (const fragment of [
  'data-customer-folder-saved-bookings-price=',
  'data-customer-folder-price-review-editor=',
  'data-customer-folder-price-review-input=',
  'data-customer-folder-price-review-save=',
  "Customer price",
  "Save price review",
  '"Review required"',
  '"Review required · tick to confirm"',
  "Ticking a job confirms its displayed customer price for this invoice.",
  'review?.status === "reviewed"',
  "loadAutomatedBillingReviews",
  "customerInvoiceBookingType",
  "Confirm a supported saved service (MNG, DEP, TRF, or DSP) before price review.",
  "adminDriverJobDspActualTimeSummariesApiPath",
  "adminRateSetupApiPath",
  "calculateCustomerDspBillingActualMinutes",
  "calculateCustomerInvoiceRateReview",
  "billingStartedAt: billingStartAt",
  "billingEndedAt: billingEndAt",
  'summary?.billing_time_source === "admin_correction"',
  "summary?.dsp_started_at",
  "summary?.dsp_ended_at",
  '"corrected billing"',
  '"booking-to-JC"',
  "customerFolderReviewedPricePayload",
  'params.set("selected_booking_references"',
  "customerFolderSelectedPriceReviewsParam",
]) {
  includes(folder, fragment, `customer-folder price review ${fragment}`);
}

for (const fragment of [
  "billingStartedAt: billingStartAt",
  "billingEndedAt: summary?.dsp_ended_at",
]) {
  includes(customers, fragment, `selected-customer DSP midnight interval ${fragment}`);
}

assert.equal(
  folder.includes('"Codex price · tick to confirm"'),
  false,
  "unconfirmed calculated proposals must use the same Review required wording before and after reload",
);

const initialBillingReview = sectionBetween(
  folder,
  "function customerFolderBillingReviewForBooking",
  "function customerFolderRateSourceLabel",
);
for (const fragment of [
  "const bookingType = customerInvoiceBookingType(booking.service_type);",
  "if (bookingType) {",
  'message: "Calculating"',
  'status: "calculating"',
  "if (savedAmountCents)",
]) {
  includes(
    initialBillingReview,
    fragment,
    `customer-folder initial current-price loading state ${fragment}`,
  );
}
assert.equal(
  initialBillingReview.indexOf("const bookingType =") <
    initialBillingReview.indexOf("const savedAmountCents ="),
  true,
  "supported bookings must enter the current-price calculating state before an older saved amount can be displayed",
);

const automatedBillingReview = sectionBetween(
  folder,
  "async function loadAutomatedBillingReviews",
  "async function loadSavedBookings",
);

for (const fragment of [
  "options: { forceRateSetup?: boolean; replaceReviewed?: boolean } = {}",
  'options.replaceReviewed || next[reference]?.status !== "reviewed"',
]) {
  includes(
    automatedBillingReview,
    fragment,
    `customer-folder reviewed-price invalidation ${fragment}`,
  );
}

const inlineBookingSave = sectionBetween(
  folder,
  "async function saveInlineBookingDetails",
  "function openPriceReview",
);

for (const fragment of [
  "const updatedBillingBooking: CustomerFolderSavedBookingRecord = {",
  'message: "Calculating"',
  'status: "calculating"',
  "const recalculatedReviews = await loadAutomatedBillingReviews([updatedBillingBooking], {",
  "forceRateSetup: true",
  "replaceReviewed: true",
  'setPriceDraft(recalculatedAmountCents ? (recalculatedAmountCents / 100).toFixed(2) : "")',
]) {
  includes(
    inlineBookingSave,
    fragment,
    `saved job detail price invalidation ${fragment}`,
  );
}

assert.equal(
  inlineBookingSave.includes('amountCents: current[reference]?.amountCents ?? null'),
  false,
  "a saved service or identity change must never retain an older reviewed amount",
);

for (const forbidden of [
  "summary.dsp_total_minutes",
  "summary?.actual_time_status",
  "summary.dsp_started_at",
  "Complete Driver OTS→JC actual time",
]) {
  assert.equal(
    automatedBillingReview.includes(forbidden),
    false,
    `exact-customer folder DSP billing must not use ${forbidden}`,
  );
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
  "export function calculateCustomerDspBillingActualMinutes",
  "export function customerDspBillingTouchesMidnightWindow",
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
  "customer_price_label: string | null;",
  "traveler_id: number | null;",
  "vehicle_type_or_category: string | null;",
  "child_seat_count: number;",
  "extra_stop_count: number;",
]) {
  includes(savedBookingsRead, fragment, `existing safe booking calculation input ${fragment}`);
}

for (const fragment of [
  'import { loadAdminSavedBookingList } from "./admin-saved-booking-read";',
  "const bookingsResult = await loadAdminSavedBookingList({",
  "customer_price_label: safeCustomerPriceLabel(booking.customer_price_amount)",
  "function safeCustomerPriceLabel(value: unknown)",
]) {
  includes(savedBookingsRead, fragment, `persisted customer price reload projection ${fragment}`);
}

for (const fragment of [
  "const adminSavedBookingCurrentReadSelect =",
  "customer_price_amount, admin_internal_status",
  "const adminSavedBookingCurrentMinimalReadSelect =",
  "booking_service_items(item_type, quantity, notes)",
  'normalizedServiceItemCount(row.booking_service_items, "extra_stop")',
  "integerOrNull(row.extra_stop_count)",
]) {
  includes(adminSavedBookingsRead, fragment, `admin saved-booking current-schema price input ${fragment}`);
}

for (const fragment of [
  'additionalSameOriginRefererPathPrefixes: ["/customers/"]',
  'additionalSameOriginRefererPathnames: ["/customers"]',
]) {
  includes(rateSetupRoute, fragment, `customer-folder rate setup boundary ${fragment}`);
  includes(dspActualTimeRoute, fragment, `customer-folder DSP actual-time boundary ${fragment}`);
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
  "persists the exact reviewed amount on that exact unbilled booking",
  "phone or desktop reload",
  "Multi-job `Review invoice & email` remains disabled until every selected row has a positive reviewed customer price.",
  "no driver payout or payout comparison is returned or rendered.",
  guardScript,
]) {
  includes(ledgerSection, phrase, `price-review ledger phrase ${phrase}`);
}

const sharedPricePersistence = sectionBetween(
  invoicePersistence,
  "export async function refreshAdminCustomerAmendedUnpaidInvoice(",
  "export async function recordCustomerInvoiceActionEmailDelivery(",
);

for (const fragment of [
  "if (matchingInvoices.length === 0)",
  'customer_price_amount: amountCents / 100',
  '.eq("booking_reference", bookingReference)',
  '.eq("customer_id", customerId)',
  '.eq("updated_at", verifiedUpdatedAt)',
  'select("booking_reference, customer_id, customer_price_amount, updated_at")',
]) {
  includes(sharedPricePersistence, fragment, `shared price persistence ${fragment}`);
}

assert.equal(
  sharedPricePersistence.includes('.insert('),
  false,
  "reviewed-price persistence must never create a replacement booking or invoice",
);

const bookingToJcLedgerSection = sectionBetween(
  ledger,
  "### Exact-Customer Folder DSP Booking-Time To JC Repair (2026-07-26)",
  "\n### ",
);
for (const phrase of [
  "saved booking pickup",
  "Driver JC end",
  "Driver OTS remains separate operational evidence",
  "existing `Customer price` tag",
  "owner-locked in `AGENTS.md`",
  guardScript,
]) {
  includes(bookingToJcLedgerSection, phrase, `booking-to-JC folder ledger phrase ${phrase}`);
}

const persistedJcFallbackLedgerSection = sectionBetween(
  ledger,
  "### DSP Persisted JC Billing-Evidence Fallback Repair (2026-07-26)",
  "\n### ",
);
for (const phrase of [
  "booking `10846`",
  "canonical `driver_job_status_events`",
  "never infers JC from OTS, POB, current time, scheduled end",
  "`374` minutes",
  "`6` billable hours",
  "SGD390",
  "scripts/test-admin-driver-job-dsp-actual-time-read-api-contract.mjs",
  guardScript,
]) {
  includes(
    persistedJcFallbackLedgerSection,
    phrase,
    `persisted Driver JC fallback ledger phrase ${phrase}`,
  );
}

const customerFolderTimingBoundaryLedgerSection = sectionBetween(
  ledger,
  "### Customer-Folder DSP Timing Read Boundary Repair (2026-07-26)",
  "\n### ",
);
for (const phrase of [
  "HTTP 403",
  "`/customers/155`",
  "same-origin",
  "read-only DSP timing route",
  "`/driver-job-demo` remains blocked",
  "scripts/test-admin-driver-job-dsp-actual-time-read-api-contract.mjs",
  guardScript,
]) {
  includes(
    customerFolderTimingBoundaryLedgerSection,
    phrase,
    `customer-folder DSP timing boundary ledger phrase ${phrase}`,
  );
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
  const {
    calculateCustomerDspBillingActualMinutes,
    calculateCustomerInvoiceRateReview,
    customerDspBillingTouchesMidnightWindow,
  } = require(
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

  const orchardDepartureSetup = {
    companies: [{ customer_rates: {}, id: 48 }],
    settings: {
      child_seat_customer_surcharge: 15,
      customer_rates: { DEP: { AVF: 75 } },
      extra_stop_surcharge: 15,
      midnight_surcharge: 15,
    },
    travelers: [{ company_id: 48, customer_rates: {}, id: 36 }],
  };
  const orchardDepartureInput = {
    actualMinutes: null,
    bookingType: "DEP",
    childSeatCount: 0,
    companyId: 48,
    extraStopCount: 0,
    pickupAt: "2026-07-13T06:45:00+08:00",
    travelerId: 36,
    vehicleType: "AVF",
  };
  const orchardWithoutExtraStop = calculateCustomerInvoiceRateReview(
    orchardDepartureInput,
    orchardDepartureSetup,
  );
  const orchardWithExtraStop = calculateCustomerInvoiceRateReview(
    { ...orchardDepartureInput, extraStopCount: 1 },
    orchardDepartureSetup,
  );
  assert.equal(orchardWithoutExtraStop?.baseAmountCents, 7_500);
  assert.equal(orchardWithoutExtraStop?.surchargeAmountCents, 1_500);
  assert.equal(orchardWithoutExtraStop?.amountCents, 9_000);
  assert.equal(orchardWithExtraStop?.surchargeAmountCents, 3_000);
  assert.equal(orchardWithExtraStop?.amountCents, 10_500);

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

  const bookingToJcMinutes = calculateCustomerDspBillingActualMinutes(
    "2026-07-26T13:00:00+08:00",
    "2026-07-26T15:30:59+08:00",
  );
  assert.equal(bookingToJcMinutes, 150);
  const bookingToJcReview = calculateCustomerInvoiceRateReview(
    {
      actualMinutes: bookingToJcMinutes,
      billingEndedAt: "2026-07-26T15:30:59+08:00",
      billingStartedAt: "2026-07-26T13:00:00+08:00",
      bookingType: "DSP",
      childSeatCount: 0,
      companyId: 26,
      extraStopCount: 0,
      pickupAt: "2026-07-26T13:00:00+08:00",
      travelerId: 22,
      vehicleType: "AVF",
    },
    {
      ...exactDefaultSetup,
      settings: {
        ...exactDefaultSetup.settings,
        customer_rates: { DSP: { AVF: 65 } },
      },
    },
  );
  assert.equal(bookingToJcReview?.actualMinutes, 150);
  assert.equal(bookingToJcReview?.billableHours, 3);
  assert.equal(bookingToJcReview?.amountCents, 19_500);

  const booking10894BillingStartedAt = "2026-08-21T10:35:00.000Z";
  const booking10894BillingEndedAt = "2026-08-21T19:19:00.000Z";
  const booking10894Minutes = calculateCustomerDspBillingActualMinutes(
    booking10894BillingStartedAt,
    booking10894BillingEndedAt,
  );
  assert.equal(booking10894Minutes, 524);
  assert.equal(
    customerDspBillingTouchesMidnightWindow(
      booking10894BillingStartedAt,
      booking10894BillingEndedAt,
    ),
    true,
    "Booking 10894 must receive one midnight surcharge because its corrected DSP interval reaches 03:19 SGT.",
  );
  const booking10894Review = calculateCustomerInvoiceRateReview(
    {
      actualMinutes: booking10894Minutes,
      billingEndedAt: booking10894BillingEndedAt,
      billingStartedAt: booking10894BillingStartedAt,
      bookingType: "DSP",
      childSeatCount: 0,
      companyId: 51,
      extraStopCount: 0,
      pickupAt: booking10894BillingStartedAt,
      travelerId: null,
      vehicleType: "AVF",
    },
    {
      companies: [{ customer_rates: {}, id: 51 }],
      settings: {
        child_seat_customer_surcharge: 15,
        customer_rates: { DSP: { AVF: 65 } },
        extra_stop_surcharge: 15,
        midnight_surcharge: 15,
      },
      travelers: [],
    },
  );
  assert.equal(booking10894Review?.billableHours, 9);
  assert.equal(booking10894Review?.baseAmountCents, 58_500);
  assert.equal(booking10894Review?.surchargeAmountCents, 1_500);
  assert.equal(booking10894Review?.amountCents, 60_000);
  assert.equal(
    customerDspBillingTouchesMidnightWindow(
      "2026-08-21T07:00:00+08:00",
      "2026-08-21T23:00:00+08:00",
    ),
    false,
    "A DSP interval ending exactly at 23:00 must remain outside the midnight window.",
  );
  assert.equal(
    customerDspBillingTouchesMidnightWindow(
      "2026-08-21T23:00:00+08:00",
      "2026-08-21T23:01:00+08:00",
    ),
    true,
    "A DSP interval starting at 23:00 must receive the midnight surcharge.",
  );

  const bridgeCorrectedMinutes = calculateCustomerDspBillingActualMinutes(
    "2026-08-06T09:30:00+08:00",
    "2026-08-06T19:15:00+08:00",
  );
  assert.equal(bridgeCorrectedMinutes, 585);
  const bridgeCorrectedReview = calculateCustomerInvoiceRateReview(
    {
      actualMinutes: bridgeCorrectedMinutes,
      billingEndedAt: "2026-08-06T19:15:00+08:00",
      billingStartedAt: "2026-08-06T09:30:00+08:00",
      bookingType: "DSP",
      childSeatCount: 0,
      companyId: 77,
      extraStopCount: 0,
      pickupAt: "2026-08-06T00:30:00+08:00",
      travelerId: 79,
      vehicleType: "S",
    },
    {
      companies: [{ customer_rates: {}, id: 77 }],
      settings: {
        child_seat_customer_surcharge: 15,
        customer_rates: { DSP: { S: 160 } },
        extra_stop_surcharge: 0,
        midnight_surcharge: 15,
      },
      travelers: [
        { company_id: 77, customer_rates: { DSP: { S: 999 } }, id: 78 },
        { company_id: 77, customer_rates: {}, id: 79 },
      ],
    },
  );
  assert.equal(bridgeCorrectedReview?.billableHours, 10);
  assert.equal(bridgeCorrectedReview?.rateCents, 16_000);
  assert.equal(bridgeCorrectedReview?.amountCents, 160_000);
  assert.equal(bridgeCorrectedReview?.customerRateSource, "default");
} finally {
  await rm(calculationRuntimeDir, { force: true, recursive: true });
}

console.log("Customer-folder price review guard passed");
