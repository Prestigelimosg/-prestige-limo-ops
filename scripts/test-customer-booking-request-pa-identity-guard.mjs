import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, readHelper, adapter, persistenceAdapter, bookPage] = await Promise.all([
  readFile("app/api/customer-booking-requests/route.ts", "utf8"),
  readFile("lib/customer-saved-bookings-read.ts", "utf8"),
  readFile("lib/customer-booking-request-adapter.ts", "utf8"),
  readFile("lib/admin-booking-supabase-adapter.ts", "utf8"),
  readFile("app/book/page.tsx", "utf8"),
]);

for (const fragment of [
  "resolveCustomerSavedBookingsBoundaryForPurpose",
  "resolveCustomerSavedBookingsVerifiedIdentity",
  '"customer-booking-request"',
  '"/book"',
  "customer_id: verifiedIdentity.data.customer_account_reference",
  "company_id: verifiedIdentity.data.company_id",
  "booker_id: verifiedIdentity.data.booker_id",
]) {
  assert.ok(route.includes(fragment), `PA booking request route must include ${fragment}`);
}

for (const fragment of [
  'actor.boundary_mode === "customer-booking-request-surface"',
  'actor.actor_role === "system"',
  "dbIdentifierOrNull(booking.customer_id)",
  "dbIdentifierOrNull(booking.company_id)",
  "dbIdentifierOrNull(booking.booker_id)",
]) {
  assert.ok(persistenceAdapter.includes(fragment), `Verified PA persistence must include ${fragment}`);
}

for (const fragment of [
  'disabled={submitting || Boolean(confirmationStatus)}',
  'confirmationStatus ? "Submitted" : submitting ? "Submitting..." : "Submit Booking Request"',
]) {
  assert.ok(bookPage.includes(fragment), `Successful submit button state must include ${fragment}`);
}

assert.ok(
  readHelper.includes("export async function resolveCustomerSavedBookingsVerifiedIdentity"),
  "Existing customer session helper must expose server-verified portal identity.",
);
assert.ok(
  readHelper.includes("hasCompanyIdentity !== hasBookerIdentity"),
  "Partial verified PA identity must fail closed.",
);

for (const forbidden of ["company_id", "booker_id", "traveler_id", "customer_id"]) {
  assert.equal(
    adapter.match(/const allowedApiRequestFields = new Set\(\[[\s\S]+?\]\);/)?.[0].includes(forbidden),
    false,
    `Customer form adapter must not submit ${forbidden}.`,
  );
}

console.log("Customer booking request PA identity guard passed.");
