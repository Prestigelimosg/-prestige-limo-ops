import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  dashboard: await readFile("app/page.tsx", "utf8"),
  customers: await readFile("app/customers/page.tsx", "utf8"),
  persistence: await readFile("lib/admin-booking-persistence.ts", "utf8"),
  adapter: await readFile("lib/admin-booking-supabase-adapter.ts", "utf8"),
  savedBookings: await readFile("lib/admin-customer-saved-bookings-read.ts", "utf8"),
  pricing: await readFile("lib/pricing.ts", "utf8"),
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
  "DSP scheduled end must be after its scheduled pickup",
]) {
  mustInclude(files.persistence, fragment, "admin booking persistence contract");
}

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
  "calculateDspCustomerInvoiceAmountCents",
  "adminRateSetupApiPath",
  "travelerId: row.travelerId",
  "companyId: row.companyId",
  "DSP actual timing is incomplete",
]) {
  mustInclude(files.customers, fragment, "existing selected-customer invoice preparation lane");
}

for (const fragment of [
  "add column if not exists dropoff_datetime timestamptz",
  "scheduled DSP end",
]) {
  mustInclude(files.migration, fragment, "tracked bookings schema migration");
}

for (const fragment of [
  "Dispatch DSP Scheduled End And Final Invoice Calculation",
  "scheduled `dropoff_datetime`",
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

console.log("Admin Dispatch DSP scheduled-end and invoice wiring guard passed");
