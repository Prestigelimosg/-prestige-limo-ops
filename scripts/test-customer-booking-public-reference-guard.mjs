import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  adminAdapter: "lib/admin-booking-supabase-adapter.ts",
  adminRead: "lib/admin-saved-booking-read.ts",
  adminCustomerRead: "lib/admin-customer-accounts-read.ts",
  adminCustomerUi: "app/customers/page.tsx",
  adminUi: "app/page.tsx",
  customerAdapter: "lib/customer-portal-saved-bookings-adapter.ts",
  customerRead: "lib/customer-saved-bookings-read.ts",
  customerUi: "app/my-bookings/page.tsx",
  receiptEmail: "lib/customer-booking-receipt-email.ts",
  requestRoute: "app/api/customer-booking-requests/route.ts",
  driverRead: "lib/driver-job-status-persistence.ts",
  driverDetailsEmail: "lib/admin-customer-driver-details-email-send-action.ts",
  ledger: "docs/current-implementation-ledger.md",
  migration: "supabase/migrations/202607180001_customer_booking_public_reference_foundation.sql",
  panel: "app/customers/[customerId]/booking-reference-settings-panel.tsx",
  route: "app/api/admin-customer-booking-reference-settings/route.ts",
  settings: "lib/admin-customer-booking-reference-settings.ts",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

function includes(key, fragment, label) {
  assert.ok(source[key].includes(fragment), `Missing ${label}: ${fragment}`);
}

function excludes(key, pattern, label) {
  assert.doesNotMatch(source[key], pattern, `Unsafe ${label}`);
}

for (const fragment of [
  "add column if not exists public_booking_reference text",
  "customer_booking_reference_sequences",
  "global_booking_reference_sequence",
  "bookings_public_booking_reference_key",
  "assign_booking_public_reference",
  "^[0-9]{5}$",
  "[A-Z0-9]{2,12}-[0-9]{5}",
  "enable row level security",
  "revoke all",
]) {
  includes("migration", fragment, "public booking reference schema contract");
}

includes("migration", "new.public_booking_reference", "insert-time persisted public reference");
includes("migration", "new.customer_id", "customer-scoped prefix lookup");
includes("migration", "booking_public_reference_exhausted", "five-digit exhaustion fail-closed path");
includes("migration", "booking_public_reference_prefix_unavailable", "locked prefix unavailable fail-closed path");
excludes("migration", /customer_invoice_sequences|monthly_invoice_issue_records|invoice_prefix/i, "invoice schema coupling");

for (const key of ["adminAdapter", "adminRead", "customerRead", "driverRead"]) {
  includes(key, "public_booking_reference", `${key} public reference read`);
}
includes("adminCustomerRead", "latest_public_booking_reference", "admin customer latest public reference projection");
includes("adminCustomerUi", "latestPublicBookingReference", "admin customer public reference display");

includes("customerRead", "booking_reference: bookingReference", "customer internal reference retention");
includes("customerRead", "public_booking_reference: publicBookingReference", "customer public reference projection");
includes("customerAdapter", "internalBookingReference", "customer internal operation key");
includes("customerAdapter", "publicBookingReference", "customer public display reference");
includes("customerUi", "booking.publicBookingReference", "customer visible public reference");
includes("receiptEmail", "booking.public_booking_reference", "customer receipt public reference");
includes("requestRoute", "primaryRequest.public_booking_reference", "customer request response public reference");
includes("driverRead", "public_reference: publicBookingReference", "driver public reference display mapping");
includes("adminUi", "bookingPublicReference", "admin shared public reference selector");
includes("adminUi", "bookingRecord.public_booking_reference", "admin public reference search/display");
includes("adminUi", "public_job_reference", "admin live-map public reference display projection");
includes("adminUi", "customer_visible_booking_reference", "customer driver-details email public reference payload");
includes("adminUi", "dispatchPublicBookingReference", "customer and driver dispatch-copy public reference display");
includes("driverDetailsEmail", "customer_visible_booking_reference", "customer driver-details email public reference rendering");
includes("driverDetailsEmail", "payload.customer_booking_details.booking_reference.replace", "driver-details email internal idempotency key retention");

for (const key of ["route", "settings", "panel"]) {
  excludes(key, /customer_invoice_sequences|monthly_invoice_issue_records|reserve_monthly_invoice|invoice_sequence_number/i, `${key} invoice workflow coupling`);
}

includes("settings", "prefix_locked", "immutable customer booking prefix");
includes("settings", "next_sequence_number", "customer booking sequence visibility");
includes("route", "requireCustomerFolderAdminBoundary", "customer-folder admin boundary");
includes("panel", "Booking reference prefix", "customer-folder booking prefix control");
includes("ledger", "Customer Booking Public Reference Lane", "implementation ledger record");

console.log("Customer booking public reference guard passed.");
