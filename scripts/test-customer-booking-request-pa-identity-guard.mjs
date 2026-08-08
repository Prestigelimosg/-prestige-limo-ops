import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, readHelper, adapter, persistenceAdapter, bookPage, appSmoke] = await Promise.all([
  readFile("app/api/customer-booking-requests/route.ts", "utf8"),
  readFile("lib/customer-saved-bookings-read.ts", "utf8"),
  readFile("lib/customer-booking-request-adapter.ts", "utf8"),
  readFile("lib/admin-booking-supabase-adapter.ts", "utf8"),
  readFile("app/book/page.tsx", "utf8"),
  readFile("scripts/test-app-smoke-browser.mjs", "utf8"),
]);

for (const fragment of [
  "resolveCustomerSavedBookingsBoundaryForPurpose",
  "resolveCustomerSavedBookingsVerifiedIdentity",
  "expiredCustomerSavedBookingsSessionCookieHeaders",
  '"customer-booking-request"',
  '"/book"',
  "customer_id: verifiedIdentity.data.customer_account_reference",
  "company_id: verifiedIdentity.data.company_id",
  "booker_id: verifiedIdentity.data.booker_id",
  "Saved customer portal access was cleared. Review the request and submit it again.",
  "status: 409",
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

const submitMarker = 'data-customer-booking-submit="true"';
const submitMarkerIndex = bookPage.indexOf(submitMarker);
const submitButtonStart = bookPage.lastIndexOf("<button", submitMarkerIndex);
const submitButtonEnd = bookPage.indexOf("</button>", submitMarkerIndex);
assert.ok(
  submitMarkerIndex >= 0 && submitButtonStart >= 0 && submitButtonEnd > submitMarkerIndex,
  "The established customer booking submit button must remain present.",
);
const submitButton = bookPage.slice(submitButtonStart, submitButtonEnd);
assert.match(
  submitButton,
  /disabled=\{\s*submitting\s*\|\|\s*Boolean\(confirmationStatus\)\s*\|\|\s*!bookingSubmissionAccessResolved\s*\|\|\s*!hasBookingSubmissionAccess\s*\}/,
  "The submit button must retain its submitting, successful-submit, access-check, and verified-access locks.",
);
assert.match(
  submitButton,
  /\{confirmationStatus\s*\?\s*"Submitted"\s*:\s*submitting\s*\?\s*"Submitting\.\.\."\s*:\s*!bookingSubmissionAccessResolved\s*\?\s*"Checking booking access\.\.\."\s*:\s*!hasBookingSubmissionAccess\s*\?\s*"Phone verification required"\s*:\s*"Submit Booking Request"\}/,
  "The submit button must retain its current success, progress, access-check, OTP, and ready labels.",
);
assert.match(
  bookPage,
  /function updateField\([\s\S]*?setConfirmationStatus\(null\);[\s\S]*?\n  \}/,
  "Editing a safe booking field must continue clearing the successful-submit lock.",
);

assert.ok(
  appSmoke.includes(
    'await setCustomerBookingField("luggage", "2");\n      await clickCustomerBookingSubmit("second valid customer booking request for same pickup date/time after edit");',
  ) &&
    appSmoke.includes('second valid customer booking request for same pickup date/time after edit') &&
    appSmoke.includes('await setCustomerBookingField("luggage", "3");'),
  "Browser repeat and disabled-intake checks must edit a safe field before retrying the protected submitted form.",
);

assert.ok(
  readHelper.includes("export async function resolveCustomerSavedBookingsVerifiedIdentity"),
  "Existing customer session helper must expose server-verified portal identity.",
);
assert.ok(
  readHelper.includes("hasCompanyIdentity !== hasBookerIdentity"),
  "Partial verified PA identity must fail closed.",
);
assert.ok(
  readHelper.includes("Max-Age=0") && readHelper.includes("HttpOnly") && readHelper.includes("Secure"),
  "Obsolete customer portal cookies must be expired only through a secure server response.",
);

for (const forbidden of ["company_id", "booker_id", "traveler_id", "customer_id"]) {
  assert.equal(
    adapter.match(/const allowedApiRequestFields = new Set\(\[[\s\S]+?\]\);/)?.[0].includes(forbidden),
    false,
    `Customer form adapter must not submit ${forbidden}.`,
  );
}

console.log("Customer booking request PA identity guard passed.");
