import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperPath = "lib/driver-job-calendar-event.ts";
const persistencePath = "lib/driver-job-status-persistence.ts";
const routePath = "app/api/driver-job/[token]/calendar/route.ts";
const pagePath = "app/driver-job/[token]/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-driver-job-calendar-download-guard.mjs";

const [helper, persistence, route, page, ledger, suite] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(pagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(suitePath, "utf8"),
]);

for (const fragment of [
  "buildDriverJobCalendarDownload",
  "calendarSequenceFromUpdatedAt",
  "payload.scheduleUpdatedAt",
  'timezone: "Asia/Singapore"',
  '"TRIGGER:-PT1H"',
  "UID:",
  "SEQUENCE:",
  "BEGIN:VCALENDAR",
  "BEGIN:VALARM",
]) {
  assert.equal(helper.includes(fragment), true, `Driver calendar helper must include ${fragment}.`);
}

assert.doesNotMatch(
  helper,
  /MIDNIGHT JOB|23:30|buildMidnightCalendarDisplayAdjustment/,
  "Driver calendar must use the actual pickup time, not the admin midnight display adjustment.",
);
assert.doesNotMatch(
  helper,
  /customer_price|billing|invoice|payment|paynow|payout|finance|internal_admin_note|parser_debug|mock_archive|raw_token|token_hash/i,
  "Driver calendar helper must not include forbidden driver fields or token material.",
);

for (const fragment of [
  "loadCurrentSafeBookingSchedule",
  'from("bookings")',
  'eq("booking_reference", link.booking_reference)',
  "currentSafeSchedule || safePayloadRecordFromLink(link)",
]) {
  assert.equal(persistence.includes(fragment), true, `Driver payload persistence must include ${fragment}.`);
}

for (const fragment of [
  "getProductionDriverJobPayloadForToken",
  "getDriverJobPayloadForTokenContract",
  "buildDriverJobCalendarDownload",
  '"content-type": "text/calendar; charset=utf-8"',
  '"cache-control": "private, no-store, max-age=0"',
  '"content-disposition"',
  "payloadResult.payload.acknowledged",
  "Acknowledge this Driver Job before adding it to a calendar.",
]) {
  assert.equal(route.includes(fragment), true, `Driver calendar route must include ${fragment}.`);
}

assert.doesNotMatch(
  route,
  /SUPABASE|service_role|admin-bookings|admin-saved-bookings|customer_price|billing|invoice|payment|paynow|payout/i,
  "Driver calendar route must stay on the established token-safe payload boundary.",
);

for (const fragment of [
  'data-driver-job-calendar-action="true"',
  'data-driver-job-calendar-source="current-driver-job-schedule"',
  "Add / Update Calendar",
  "/calendar",
]) {
  assert.equal(page.includes(fragment), true, `Driver Job page must include ${fragment}.`);
}

assert.equal(
  ledger.includes("### Driver Job Calendar Add And Amendment Update"),
  true,
  "Implementation ledger must record the driver calendar workflow.",
);
assert.equal(suite.includes(guardPath), true, "Preactivation suite must register the driver calendar guard.");

const { buildDriverJobCalendarDownload } = await import("../lib/driver-job-calendar-event.ts");

const initial = buildDriverJobCalendarDownload({
  acknowledged: true,
  assignedDriver: { contact: "", name: "Safe Driver", plate: "SLV1234X", vehicleModel: "V Class" },
  bookingType: "MNG",
  bookingTypeLabel: "Arrival",
  dropoffLocation: "Marina Bay Sands",
  flightNumber: "SQ 318",
  passengerName: "Safe Passenger",
  pickupDate: "2026-07-15",
  pickupDateTime: "15 Jul 2026, 00:30",
  pickupLocation: "Changi Airport Terminal 3",
  pickupTime: "0030hrs",
  reference: "ADM-20260715003000",
  route: "Changi Airport Terminal 3 > Marina Bay Sands",
  scheduleUpdatedAt: "2026-07-13T02:52:22.000Z",
  status: "assigned",
  statusHistory: [],
  statusLabel: "Assigned",
  waypoints: [],
});

assert.equal(initial.ok, true);
assert.match(initial.ics, /DTSTART;TZID=Asia\/Singapore:20260715T003000/);
assert.match(initial.ics, /DTEND;TZID=Asia\/Singapore:20260715T020000/);
assert.match(initial.ics, /TRIGGER:-PT1H/);
assert.match(initial.ics, /UID:driver-job-ADM-20260715003000@prestige-limo-ops/);
assert.match(initial.ics, /SEQUENCE:[1-9][0-9]*/);
assert.doesNotMatch(initial.ics, /23:30|PRIVATE|token|customer_price|billing|invoice|payment|paynow|payout/i);

const amended = buildDriverJobCalendarDownload({
  ...initial.payload,
  pickupDate: "2026-07-15",
  pickupDateTime: "15 Jul 2026, 01:00",
  pickupTime: "0100hrs",
  scheduleUpdatedAt: "2026-07-13T02:56:44.000Z",
});

assert.equal(amended.ok, true);
assert.match(amended.ics, /DTSTART;TZID=Asia\/Singapore:20260715T010000/);
assert.match(amended.ics, /UID:driver-job-ADM-20260715003000@prestige-limo-ops/);
assert.match(amended.ics, /SEQUENCE:[1-9][0-9]*/);
assert.equal(amended.sequence > initial.sequence, true, "Amended calendar sequence must increase.");

const originalMode = process.env.DRIVER_JOB_LINK_MODE;
const originalPublicMode = process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE;
const originalProductionGate = process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED;
process.env.DRIVER_JOB_LINK_MODE = "mock";
process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE = "mock";
process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED = "false";

try {
  const [{ GET }, driverJobRoute, { mockDriverJobTokens }] = await Promise.all([
    import("../app/api/driver-job/[token]/calendar/route.ts"),
    import("../app/api/driver-job/[token]/route.ts"),
    import("../lib/driver-job-link-mock-store.ts"),
  ]);
  const context = (token) => ({ params: Promise.resolve({ token }) });
  const beforeAck = await GET(
    new Request(`http://localhost/api/driver-job/${mockDriverJobTokens.validA}/calendar`),
    context(mockDriverJobTokens.validA),
  );

  assert.equal(beforeAck.status, 409);

  const acknowledged = await driverJobRoute.PATCH(
    new Request(`http://localhost/api/driver-job/${mockDriverJobTokens.validA}`, {
      body: JSON.stringify({ driver_name: "Safe Calendar Driver" }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    context(mockDriverJobTokens.validA),
  );
  assert.equal(acknowledged.status, 200);

  const response = await GET(
    new Request(`http://localhost/api/driver-job/${mockDriverJobTokens.validA}/calendar`),
    context(mockDriverJobTokens.validA),
  );
  const routeIcs = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.match(response.headers.get("content-disposition") || "", /attachment; filename=/);
  assert.match(routeIcs, /BEGIN:VCALENDAR/);
  assert.match(routeIcs, /TRIGGER:-PT1H/);
  assert.equal(routeIcs.includes(mockDriverJobTokens.validA), false);

  const unauthorized = await GET(
    new Request("http://localhost/api/driver-job/not-a-valid-token/calendar"),
    context("not-a-valid-token"),
  );
  assert.equal(unauthorized.status, 401);
} finally {
  if (originalMode === undefined) delete process.env.DRIVER_JOB_LINK_MODE;
  else process.env.DRIVER_JOB_LINK_MODE = originalMode;
  if (originalPublicMode === undefined) delete process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE;
  else process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE = originalPublicMode;
  if (originalProductionGate === undefined) delete process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED;
  else process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED = originalProductionGate;
}

console.log("Driver Job calendar download guard passed");
