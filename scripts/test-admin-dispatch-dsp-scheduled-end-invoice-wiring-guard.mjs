import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const files = {
  dashboard: await readFile("app/page.tsx", "utf8"),
  customers: await readFile("app/customers/page.tsx", "utf8"),
  persistence: await readFile("lib/admin-booking-persistence.ts", "utf8"),
  adapter: await readFile("lib/admin-booking-supabase-adapter.ts", "utf8"),
  savedBookings: await readFile("lib/admin-customer-saved-bookings-read.ts", "utf8"),
  pricing: await readFile("lib/pricing.ts", "utf8"),
  customerDspReview: await readFile("lib/customer-dsp-invoice-review.ts", "utf8"),
  migration: await readFile(
    "supabase/migrations/20260718165716_add_booking_dropoff_datetime.sql",
    "utf8",
  ),
  ledger: await readFile("docs/current-implementation-ledger.md", "utf8"),
  suite: await readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
};

function mustInclude(source, fragment, label) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function mustExclude(source, fragment, label) {
  assert.equal(source.includes(fragment), false, `${label} must exclude ${fragment}.`);
}

const missingPickupGuardStart = files.dashboard.indexOf(
  "function adminDispatchSaveCrmMissingPickupFields",
);
const missingPickupGuardEnd = files.dashboard.indexOf(
  "function adminDispatchSaveCrmMissingPickupMessage",
  missingPickupGuardStart,
);
assert.notEqual(missingPickupGuardStart, -1, "Dispatch missing-pickup guard must remain present.");
assert.notEqual(missingPickupGuardEnd, -1, "Dispatch missing-pickup message must remain present.");
const missingPickupGuard = files.dashboard.slice(missingPickupGuardStart, missingPickupGuardEnd);

for (const fragment of [
  "const hasOptionalDspScheduledEnd",
  "clean(bookingValue.dspEndDate)",
  "clean(bookingValue.dspEndTime)",
  "if (hasOptionalDspScheduledEnd)",
]) {
  mustInclude(
    missingPickupGuard,
    fragment,
    "Save + CRM optional DSP scheduled-end client guard",
  );
}

mustExclude(
  missingPickupGuard,
  'if (normalizeBookingType(bookingValue.bookingType) === "DSP")',
  "unconditional Save + CRM DSP scheduled-end requirement",
);

for (const fragment of [
  "dspEndDate",
  "dspEndTime",
  "data-admin-dispatch-dsp-end-date",
  "data-admin-dispatch-dsp-end-time",
  "dropoff_datetime: dspEndDateTime",
  "bookingRecord.dropoff_datetime",
]) {
  mustInclude(files.dashboard, fragment, "existing Dispatch booking lane");
}

for (const fragment of [
  "dropoff_datetime?: string | null",
  '"dropoff_datetime"',
  "validateDspScheduledEnd",
  "const scheduledEndDateTime = textOrNull(booking.dropoff_datetime)",
  "if (!isAdminDashboardDsp || !scheduledEndDateTime)",
  "DSP scheduled end must be after its scheduled pickup",
]) {
  mustInclude(files.persistence, fragment, "admin booking persistence contract");
}

mustExclude(
  files.persistence,
  "Admin DSP booking requires a valid scheduled dropoff_datetime.",
  "optional Admin DSP scheduled-end persistence contract",
);

for (const fragment of [
  "dropoff_datetime",
  "dropoff_datetime: textOrNull(booking.dropoff_datetime)",
  "dropoff_datetime: textOrNull(row.dropoff_datetime)",
]) {
  mustInclude(files.adapter, fragment, "existing Supabase booking adapter");
}

for (const fragment of [
  "traveler_id",
  "vehicle_type_or_category",
  "child_seat_count",
  "extra_stop_count",
]) {
  mustInclude(files.savedBookings, fragment, "admin-safe saved-booking read");
}

for (const fragment of [
  "calculateDspCustomerInvoiceAmountCents",
  "calculateDspBillableMinutes",
  "billableHours * hourlyRate",
]) {
  mustInclude(files.pricing, fragment, "canonical DSP customer invoice calculator");
}

for (const fragment of [
  "prepareMonthlyBillingDspRowsForInvoice",
  "readCustomerInvoiceDriverActualTimeSummary",
  "calculateCustomerDspInvoiceReview",
  "adminRateSetupApiPath",
  "travelerId: row.travelerId",
  "companyId: row.companyId",
  "DSP actual timing is incomplete",
]) {
  mustInclude(files.customers, fragment, "existing selected-customer invoice preparation lane");
}

for (const fragment of [
  "calculateDspCustomerInvoiceAmountCents",
  'bookingType: "DSP"',
  "traveler.id === input.travelerId",
  "company.id === input.companyId",
]) {
  mustInclude(files.customerDspReview, fragment, "shared DSP customer review lane");
}

for (const fragment of [
  "add column if not exists dropoff_datetime timestamptz",
  "scheduled DSP end",
]) {
  mustInclude(files.migration, fragment, "tracked bookings schema migration");
}

for (const fragment of [
  "DSP Scheduled End Optional Save Repair",
  "optional scheduled `dropoff_datetime`",
  "actual Driver OTS/JC timing",
  "verified traveler/company IDs",
]) {
  mustInclude(files.ledger, fragment, "implementation ledger checkpoint");
}

mustInclude(
  files.suite,
  "scripts/test-admin-dispatch-dsp-scheduled-end-invoice-wiring-guard.mjs",
  "preactivation suite registration",
);

const compiledPersistence = ts.transpileModule(files.persistence, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "lib/admin-booking-persistence.ts",
}).outputText;
const persistenceModule = { exports: {} };
const persistenceAdapterMock = {
  createAdminBookingThroughSupabaseAdapter() {
    throw new Error("Persistence write must not run in the DSP scheduled-end parser guard.");
  },
  loadAdminBookingByReferenceThroughSupabaseAdapter() {
    throw new Error("Persistence read must not run in the DSP scheduled-end parser guard.");
  },
  listAdminBookingsThroughSupabaseAdapter() {
    throw new Error("Persistence read must not run in the DSP scheduled-end parser guard.");
  },
  updateAdminBookingThroughSupabaseAdapter() {
    throw new Error("Persistence write must not run in the DSP scheduled-end parser guard.");
  },
};
const requirePersistenceDependency = (specifier) => {
  assert.equal(
    specifier,
    "./admin-booking-supabase-adapter",
    `Unexpected persistence dependency ${specifier}.`,
  );
  return persistenceAdapterMock;
};

new Function("require", "module", "exports", compiledPersistence)(
  requirePersistenceDependency,
  persistenceModule,
  persistenceModule.exports,
);

const { parseAdminBookingPersistencePayload } = persistenceModule.exports;

function adminDspPayload(dropoffDateTime) {
  return {
    booking: {
      booking_reference: "DSP-OPTIONAL-END-GUARD",
      contact_phone: "+65 6000 0000",
      customer_display_name: "DSP Guard Account",
      dropoff_datetime: dropoffDateTime,
      dropoff_location: "Drop-off To Confirm",
      pickup_datetime: "2026-07-26T13:00:00+08:00",
      pickup_location: "Wallich Street",
      route_type: "DSP",
      service_type: "DSP",
      source_channel: "admin-dashboard",
      source_surface: "admin_api",
    },
    route_points: [
      {
        location_text: "Wallich Street",
        point_type: "pickup",
        sequence_number: 1,
      },
      {
        location_text: "Drop-off To Confirm",
        point_type: "dropoff",
        sequence_number: 2,
      },
    ],
    service_items: [],
  };
}

const missingScheduledEnd = parseAdminBookingPersistencePayload(adminDspPayload(null));
assert.equal(
  missingScheduledEnd.ok,
  true,
  "Admin DSP booking must save without a scheduled end date or time.",
);
assert.equal(missingScheduledEnd.data.booking.dropoff_datetime, null);

const malformedOptionalScheduledEnd = parseAdminBookingPersistencePayload(
  adminDspPayload("not-a-date"),
);
assert.equal(malformedOptionalScheduledEnd.ok, false);
assert.equal(malformedOptionalScheduledEnd.status, 400);
assert.equal(
  malformedOptionalScheduledEnd.error,
  "Malformed operational booking dropoff_datetime rejected.",
);

const scheduledEndBeforePickup = parseAdminBookingPersistencePayload(
  adminDspPayload("2026-07-26T12:59:00+08:00"),
);
assert.equal(scheduledEndBeforePickup.ok, false);
assert.equal(scheduledEndBeforePickup.status, 400);
assert.equal(
  scheduledEndBeforePickup.error,
  "DSP scheduled end must be after its scheduled pickup.",
);

const validOptionalScheduledEnd = parseAdminBookingPersistencePayload(
  adminDspPayload("2026-07-26T15:00:00+08:00"),
);
assert.equal(validOptionalScheduledEnd.ok, true);
assert.equal(
  validOptionalScheduledEnd.data.booking.dropoff_datetime,
  "2026-07-26T15:00:00+08:00",
);

console.log("Admin Dispatch optional DSP scheduled-end and invoice wiring guard passed");
