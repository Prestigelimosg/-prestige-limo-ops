import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-load-bookings-typed-read-admin-display-exposure-guard.mjs";
const typedReadPath = "/api/admin-load-bookings-typed-read";

const customerDriverSurfacePaths = [
  ["customer folder index", "app/customers/page.tsx"],
  ["customer folder detail", "app/customers/[customerId]/page.tsx"],
  ["customer saved-bookings panel", "app/customers/[customerId]/saved-bookings-panel.tsx"],
  ["customer saved-bookings API", "app/api/customer-saved-bookings/route.ts"],
  ["customer booking requests API", "app/api/customer-booking-requests/route.ts"],
  ["customer booking statuses API", "app/api/customer-booking-statuses/route.ts"],
  ["customer portal sessions API", "app/api/customer-portal-sessions/route.ts"],
  ["driver job demo page", "app/driver-job-demo/page.tsx"],
  ["driver job token page", "app/driver-job/[token]/page.tsx"],
  ["driver job token API", "app/api/driver-job/[token]/route.ts"],
  ["driver job status API", "app/api/driver-job/[token]/status/route.ts"],
  ["driver job notifications API", "app/api/driver-job/[token]/notifications/route.ts"],
  ["driver job issue alert API", "app/api/driver-job/[token]/issue-alert/route.ts"],
  ["driver job bids API", "app/api/driver-job-bids/route.ts"],
];

const typedExposureFragments = [
  typedReadPath,
  "adminLoadBookingsTypedReadApiPath",
  "AdminLoadBookingsTypedRead",
  "LoadBookingsOperationalDisplayCard",
  "LoadBookingsTypedOperationalDisplayResult",
  "buildLoadBookingsOperationalDisplayCardFromTypedRead",
  "buildLoadBookingsTypedOperationalDisplayResult",
  "fetchLoadBookingsTypedOperationalDisplayResult",
  "loadBookingsTypedOperational",
  "safe_card",
  "safe_dto",
  "quarantined_field_count",
];

const forbiddenOperationalDisplayFieldFragments = [
  "admin_note",
  "admin_notes",
  "billing",
  "customer_price",
  "customer_rate",
  "customer_rates",
  "debug",
  "driver_dispatch_include_payout",
  "driver_notes",
  "driver_payout",
  "driver_payout_rules",
  "invoice",
  "internal",
  "mock_archive",
  "parser",
  "payment",
  "paynow",
  "payout",
  "pricing",
  "rate_override",
  "secret",
  "token",
];

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function countMatches(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

function assertNoTypedReadExposure(source, label) {
  for (const fragment of typedExposureFragments) {
    assertExcludes(source, fragment, `${label} typed-read exposure fragment ${fragment}`);
  }
}

const [
  ledger,
  appPage,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  aiParseRoute,
  preactivationSuite,
  ...customerDriverSurfaceSources
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  ...customerDriverSurfacePaths.map(([, path]) => readFile(path, "utf8")),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Load Bookings Typed Read Admin Display Exposure Guard Lock",
);

for (const phrase of [
  "Load Bookings typed-read safe-card exposure is guarded at the admin display boundary.",
  "This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, customer/driver visibility changes, or runtime behavior changes.",
  "The typed-read app bridge may hydrate only `LoadBookingsOperationalDisplayCard` list display data inside the internal admin Load Bookings path.",
  "Typed safe-card and safe DTO data must not feed Customer Copy, Driver Job Link payloads/copy, driver job pages or APIs, customer pages or APIs, selected booking form, Save Booking + CRM, parser, or `/api/admin-saved-bookings`.",
  "The typed-read app bridge remains list-mode only with `limit=25` and must not send `id` or `booking_id`.",
  "The safe operational display field list remains limited to operational identifiers/status/booking/vehicle/service/date/address/route/pax/job-card/display/contact summary fields.",
  "Visible typed operational text is filtered for forbidden finance/payout/payment/billing/internal/parser/debug/secret/token/mock archive fragments before display.",
  "Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings` and `BookingRecord`.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields are approved for customer or driver visibility.",
  "This lock adds `scripts/test-load-bookings-typed-read-admin-display-exposure-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Admin display exposure ledger phrase: ${phrase}`);
}

for (const forbiddenPhrase of [
  "typed safe-card may feed Customer Copy",
  "typed safe-card may feed Driver Job Link",
  "typed read may feed customer pages",
  "typed read may feed driver pages",
  "endpoint migration is approved",
  "DB write approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, `Forbidden admin display exposure phrase: ${forbiddenPhrase}`);
}

assert.equal(
  countMatches(appPage, `const adminLoadBookingsTypedReadApiPath = "${typedReadPath}"`),
  1,
  "typed read path must be declared once in app/page.tsx.",
);

const fieldNamesBlock = sliceBetween(
  appPage,
  "const loadBookingsOperationalDisplayFieldNames = [",
  "] as const;",
);

for (const allowedField of [
  "assigned_driver_display_name",
  "assigned_driver_phone",
  "assigned_driver_plate",
  "assigned_driver_status",
  "assigned_driver_vehicle_type",
  "audit_summary",
  "booking_id",
  "booking_reference",
  "booking_status",
  "booking_type",
  "booker_display_name",
  "booker_email",
  "booker_phone",
  "child_seat_display",
  "company_display_name",
  "created_at",
  "customer_display_name",
  "dropoff_address",
  "dropoff_datetime",
  "extra_stop_display",
  "job_card_display",
  "pax_display",
  "pickup_address",
  "pickup_datetime",
  "route_points_summary",
  "route_summary",
  "service_display",
  "traveler_display_name",
  "updated_at",
  "vehicle_display",
]) {
  assertIncludes(fieldNamesBlock, `"${allowedField}"`, `allowed operational field ${allowedField}`);
}

for (const forbiddenFragment of forbiddenOperationalDisplayFieldFragments) {
  assertExcludes(
    fieldNamesBlock,
    forbiddenFragment,
    `operational display field forbidden fragment ${forbiddenFragment}`,
  );
}

const forbiddenValueListBlock = sliceBetween(
  appPage,
  "const loadBookingsOperationalDisplayForbiddenValueFragments = [",
  "] as const;",
);

for (const forbiddenValueFragment of [
  "admin finance",
  "admin note",
  "billing",
  "customer price",
  "customer rate",
  "debug",
  "driver payout",
  "internal admin",
  "internal note",
  "invoice",
  "parser",
  "payment",
  "paynow",
  "pricing",
  "rate override",
  "secret",
  "service role",
  "token",
]) {
  assertIncludes(
    forbiddenValueListBlock,
    `"${forbiddenValueFragment}"`,
    `forbidden operational display value ${forbiddenValueFragment}`,
  );
}

const operationalDisplayTextBlock = sliceBetween(
  appPage,
  "function loadBookingsOperationalDisplayText",
  "function createEmptyLoadBookingsOperationalDisplayCard",
);
assertIncludes(
  operationalDisplayTextBlock,
  "hasForbiddenLoadBookingsOperationalDisplayText(text)",
  "operational display forbidden text filter",
);
assertIncludes(operationalDisplayTextBlock, "text.length > maxLength", "operational display max length filter");

const typedResponseType = sliceBetween(
  appPage,
  "type AdminLoadBookingsTypedReadResponse = {",
  "type BookingStatusValue",
);
assertIncludes(typedResponseType, "bookings?: AdminLoadBookingsTypedReadSafeBooking[];", "typed list payload");
assertExcludes(typedResponseType, "booking?:", "typed singular detail payload");
assertExcludes(typedResponseType, "record?:", "typed raw record payload");
assertExcludes(typedResponseType, "data?:", "typed raw data payload");

const typedCardBuilderBlock = sliceBetween(
  appPage,
  "function buildLoadBookingsOperationalDisplayCardFromTypedRead",
  "function loadBookingsOperationalDisplayCardKey",
);
assertIncludes(typedCardBuilderBlock, "const safeCard = safeBooking.safe_card ?? {};", "typed safe-card source");
assertIncludes(typedCardBuilderBlock, "const safeDto = safeBooking.safe_dto ?? {};", "typed safe-DTO fallback");
assertIncludes(
  typedCardBuilderBlock,
  "for (const fieldName of loadBookingsOperationalDisplayFieldNames)",
  "typed card allowed field loop",
);
assertIncludes(
  typedCardBuilderBlock,
  "loadBookingsOperationalDisplayText(",
  "typed card value sanitizer",
);
assertExcludes(typedCardBuilderBlock, "customerCopy", "typed card Customer Copy exposure");
assertExcludes(typedCardBuilderBlock, "driverJob", "typed card Driver Job exposure");

const typedDisplayBridge = sliceBetween(
  appPage,
  "async function fetchLoadBookingsTypedOperationalDisplayResult",
  "function getLoadBookingsOperationalDisplayTitle",
);
assertIncludes(typedDisplayBridge, `fetch(\`\${adminLoadBookingsTypedReadApiPath}?`, "typed bridge fetch");
assertIncludes(typedDisplayBridge, 'method: "GET"', "typed bridge GET method");
assertIncludes(
  typedDisplayBridge,
  "if (!response.ok || responseBody?.ok !== true || !Array.isArray(responseBody.bookings))",
  "typed bridge list-only gate",
);
assertIncludes(
  typedDisplayBridge,
  "return buildLoadBookingsTypedOperationalDisplayResult(responseBody.bookings)",
  "typed bridge list builder",
);
assertIncludes(typedDisplayBridge, "return null;", "typed bridge null fallback");
assertExcludes(typedDisplayBridge, /responseBody\.booking(?!s)/, "typed bridge singular detail payload");
assertExcludes(typedDisplayBridge, "responseBody.mode", "typed bridge detail mode branch");
assertExcludes(typedDisplayBridge, "booking_id", "typed bridge detail booking_id query");
assertExcludes(typedDisplayBridge, 'searchParams.set("id"', "typed bridge id query set");
assertExcludes(typedDisplayBridge, 'searchParams.append("id"', "typed bridge id query append");
assertExcludes(typedDisplayBridge, "setMessage", "typed bridge user-visible failure text");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(loadBookingsBlock, 'new URLSearchParams({ limit: "25" })', "Load Bookings list-mode query");
assertIncludes(
  loadBookingsBlock,
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams).catch(() => null)",
  "typed display safe fallback",
);
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "legacy saved-bookings read remains",
);
assertIncludes(loadBookingsBlock, "setBookings(loadedBookings);", "legacy BookingRecord source remains");
assertExcludes(loadBookingsBlock, "booking_id", "Load Bookings detail booking_id query");
assertExcludes(loadBookingsBlock, 'searchParams.set("id"', "Load Bookings id query set");
assertExcludes(loadBookingsBlock, 'searchParams.append("id"', "Load Bookings id query append");

const customerCopyBlock = sliceBetween(
  appPage,
  "const customerCopyCard = useMemo(() => {",
  "const draftDriverDispatchCard = useMemo(() => {",
);
assertNoTypedReadExposure(customerCopyBlock, "Customer Copy");
assertIncludes(customerCopyBlock, "const sections = [", "Customer Copy booking-state sections");
assertIncludes(customerCopyBlock, "booking.driverName", "Customer Copy driver display source remains booking state");

const driverDispatchBlock = sliceBetween(
  appPage,
  "const draftDriverDispatchCard = useMemo(() => {",
  "const activeAdminDriverJobLink =",
);
assertNoTypedReadExposure(driverDispatchBlock, "Driver Dispatch copy");
assertIncludes(driverDispatchBlock, "booking.driverIncludePayout && driverPayout", "Driver Dispatch payout gating remains booking state");

const driverJobLinkMessageBlock = sliceBetween(
  appPage,
  "const driverJobLinkMessage = useMemo(() => {",
  "const generatedDispatchCopyMessages = useMemo",
);
assertNoTypedReadExposure(driverJobLinkMessageBlock, "Driver Job Link copy");
for (const fragment of [
  "const bookingReference =",
  "cleanReferenceText(dispatchReleaseWorkflowBookingReference)",
  "cleanReferenceText(activeAdminDriverJobLink?.booking_reference)",
  "bookingReference ? `Reference: ${bookingReference}`",
]) {
  assertIncludes(driverJobLinkMessageBlock, fragment, `Driver Job Link legacy reference ${fragment}`);
}

const driverJobLinkPayloadBlock = sliceBetween(
  appPage,
  "function buildAdminDriverJobLinkCreatePayload",
  "async function createDriverJobLink",
);
assertNoTypedReadExposure(driverJobLinkPayloadBlock, "Driver Job Link payload");
assertIncludes(driverJobLinkPayloadBlock, "dispatchReleaseWorkflowBookingReference", "Driver Job Link reference source");
assertIncludes(driverJobLinkPayloadBlock, "booking.driverName", "Driver Job Link driver source remains booking state");

const loadSelectedBookingBlock = sliceBetween(
  appPage,
  "function loadSelectedBooking",
  "async function saveAdminBookingOperationalSnapshot",
);
assertIncludes(loadSelectedBookingBlock, "bookingRecordToForm(bookingRecord)", "selected booking form source");
for (const fragment of [
  "const bookingReference =",
  "cleanReferenceText(bookingRecord.booking_reference)",
  "cleanReferenceText(bookingRecord.id)",
  "setLoadedBookingId(bookingReference)",
]) {
  assertIncludes(loadSelectedBookingBlock, fragment, `selected booking legacy id source ${fragment}`);
}
assertNoTypedReadExposure(loadSelectedBookingBlock, "selected booking form load");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertNoTypedReadExposure(saveBookingBlock, "Save Booking + CRM");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking saved-bookings separation");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertNoTypedReadExposure(source, label);
}

for (const [[label], source] of customerDriverSurfacePaths.map((entry, index) => [
  entry,
  customerDriverSurfaceSources[index],
])) {
  assertNoTypedReadExposure(source, label);
}

assertIncludes(preactivationSuite, guardScript, "preactivation admin display exposure guard registration");

console.log("Load Bookings typed read admin display exposure guard passed");
