import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

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

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
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
  'data-customer-booking-field="returnExtraStops"',
]) {
  assertIncludes(bookPage, fragment, `/book return trip UI marker ${fragment}`);
}

assert.equal(
  bookPage.match(/data-customer-booking-field="returnExtraStops"/g)?.length,
  1,
  "/book must render exactly one return extra stops field.",
);

for (const removedPortalFragment of [
  "type BookingRequestForm =",
  "data-customer-portal-return-trip-checkbox",
  "data-customer-portal-return-trip-fields",
]) {
  assertExcludes(portalPage, removedPortalFragment, `retired duplicate portal form ${removedPortalFragment}`);
}

for (const fragment of [
  "returnTripRequiredFields",
  "Please complete the outbound and return trip date, time, pickup, and drop-off details",
]) {
  assertIncludes(bookPage, fragment, `conditional return validation ${fragment}`);
}

assertIncludes(portalPage, 'href="/book"', "/my-bookings canonical booking-form link");
assertExcludes(
  portalPage,
  /data-customer-portal-return-trip-(?:checkbox|fields)=/,
  "/my-bookings duplicate return-trip form",
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
  "return_booking_reference:",
  "returnRequest?.public_booking_reference ||",
  "returnRequest?.booking_reference ||",
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
  'legLabel === "OUTBOUND" ? body.extraStops : body.returnExtraStops',
  "Missing required return trip request fields",
  "Linked return group",
]) {
  assertIncludes(persistence, fragment, `customer persistence return trip fragment ${fragment}`);
}

assertExcludes(
  `${bookPage}\n${portalPage}`,
  /admin_internal_status|driver_payout|paynow payout|internal admin note|parser_debug|mock_archive|mock_qa/i,
  "customer return trip public UI",
);

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-return-trip-"));

try {
  const sourcePath = path.join(process.cwd(), persistencePath);
  const outputPath = path.join(tempDir, "lib/admin-booking-persistence.js");
  const adapterStubPath = path.join(tempDir, "lib/admin-booking-supabase-adapter.js");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(persistence, sourcePath));
  await writeFile(
    adapterStubPath,
    [
      "async function unavailable() { throw new Error('persistence adapter must not run in parser guard'); }",
      "module.exports = {",
      "  createAdminBookingThroughSupabaseAdapter: unavailable,",
      "  loadAdminBookingByReferenceThroughSupabaseAdapter: unavailable,",
      "  listAdminBookingsThroughSupabaseAdapter: unavailable,",
      "  updateAdminBookingThroughSupabaseAdapter: unavailable,",
      "};",
    ].join("\n"),
  );

  const { parseCustomerBookingRequestPayloads } = createRequire(import.meta.url)(outputPath);
  const parsed = parseCustomerBookingRequestPayloads({
    contactNo: "+65 9000 1111",
    emailAddress: "return-test@example.com",
    passengerName: "Return Stop Test Passenger",
    pickupDate: "2026-08-20",
    pickupTime: "09:00",
    pickupLocation: "Outbound Pickup",
    dropoffLocation: "Outbound Dropoff",
    extraStops: "Outbound Stop A; Outbound Stop B",
    returnTripRequested: "yes",
    returnPickupDate: "2026-08-21",
    returnPickupTime: "18:00",
    returnPickupLocation: "Return Pickup",
    returnDropoffLocation: "Return Dropoff",
    returnExtraStops: "Return Stop A; Return Stop B",
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.requests.length, 2);
  assert.deepEqual(
    parsed.data.requests[0].route_points.map((point) => [point.point_type, point.location_text]),
    [
      ["pickup", "Outbound Pickup"],
      ["stop", "Outbound Stop A"],
      ["stop", "Outbound Stop B"],
      ["dropoff", "Outbound Dropoff"],
    ],
  );
  assert.deepEqual(
    parsed.data.requests[1].route_points.map((point) => [point.point_type, point.location_text]),
    [
      ["pickup", "Return Pickup"],
      ["stop", "Return Stop A"],
      ["stop", "Return Stop B"],
      ["dropoff", "Return Dropoff"],
    ],
  );
  assert.deepEqual(parsed.data.requests[1].service_items, [
    {
      blocks_count: null,
      item_type: "extra_stop",
      notes: null,
      quantity: 2,
      service_item_type: "extra_stop",
    },
  ]);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer return trip request guard passed");
