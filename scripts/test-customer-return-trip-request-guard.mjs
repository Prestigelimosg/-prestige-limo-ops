import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bookPagePath = "app/book/page.tsx";
const portalPagePath = "app/my-bookings/page.tsx";
const adapterPath = "lib/customer-booking-request-adapter.ts";
const routePath = "app/api/customer-booking-requests/route.ts";
const persistencePath = "lib/admin-booking-persistence.ts";

const [
  bookPage,
  portalPage,
  adapter,
  route,
  persistence,
] = await Promise.all(
  [bookPagePath, portalPagePath, adapterPath, routePath, persistencePath].map((path) =>
    readFile(path, "utf8"),
  ),
);

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  const matched = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);

  assert.equal(matched, false, `${label} must not include ${pattern}.`);
}

for (const fragment of [
  "returnTripRequested",
  "returnPickupDate",
  "returnPickupTime",
  "returnFlightNumber",
  "returnPickupLocation",
  "returnDropoffLocation",
  "returnExtraStops",
]) {
  assertIncludes(bookPage, fragment, `/book return trip form field ${fragment}`);
}

for (const fragment of [
  'data-customer-booking-return-trip-checkbox="true"',
  'data-customer-booking-return-trip-fields="true"',
]) {
  assertIncludes(bookPage, fragment, `/book return trip UI marker ${fragment}`);
}

assertIncludes(portalPage, 'href="/book"', "/my-bookings canonical booking-form link");
assertExcludes(
  portalPage,
  /data-customer-portal-return-trip-(?:checkbox|fields)=/,
  "/my-bookings duplicate return-trip form",
);

assertIncludes(bookPage, "returnTripRequiredFields", "/book conditional return validation fields");
assertIncludes(
  bookPage,
  "Please complete the outbound and return trip date, time, pickup, and drop-off details",
  "/book conditional return validation message",
);

for (const fragment of [
  "returnTripRequested: input.returnTripRequested",
  "returnPickupDate: input.returnPickupDate",
  "returnPickupTime: input.returnPickupTime",
  "returnFlightNumber: input.returnFlightNumber",
  "returnPickupLocation: input.returnPickupLocation",
  "returnDropoffLocation: input.returnDropoffLocation",
  "returnExtraStops: input.returnExtraStops",
  '"return_trip_requested"',
  '"return_booking_reference"',
]) {
  assertIncludes(adapter, fragment, `customer adapter return trip fragment ${fragment}`);
}

for (const fragment of [
  "parseCustomerBookingRequestPayloads",
  "for (const requestPayload of parsed.data.requests)",
  "const returnRequest = savedRequests[1] ?? null;",
  "return_booking_reference: returnRequest?.booking_reference ?? null",
  "return_trip_requested: parsed.data.returnTripRequested",
  "await notifyAdminNewBookingRequest(primaryRequest);",
]) {
  assertIncludes(route, fragment, `customer request route return trip fragment ${fragment}`);
}

for (const fragment of [
  "type CustomerBookingRequestParsedPayloads",
  "function isCustomerReturnTripRequested",
  "buildCustomerBookingRequestPayloadForLeg",
  'bookingReference: returnTripRequested ? `${groupReference}-OUT` : groupReference',
  'bookingReference: `${groupReference}-RET`',
  "Missing required return trip request fields",
  "Linked return group",
  'legLabel === "OUTBOUND" ? body.extraStops : body.returnExtraStops',
]) {
  assertIncludes(persistence, fragment, `customer persistence return trip fragment ${fragment}`);
}

assertExcludes(
  `${bookPage}\n${portalPage}`,
  /admin_internal_status|driver_payout|paynow payout|internal admin note|parser_debug|mock_archive|mock_qa/i,
  "customer return trip public UI",
);

console.log("Customer return trip request guard passed");
