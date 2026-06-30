import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const typedReadRoutePath = "app/api/admin-load-bookings-typed-read/route.ts";
const typedReadGatedHelperPath = "lib/admin-load-bookings-typed-read-gated.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-load-bookings-primary-list-source-boundary-guard.mjs";
const typedReadPath = "/api/admin-load-bookings-typed-read";
const legacySavedBookingsPath = "/api/admin-saved-bookings";
const adminBookingsPath = "/api/admin-bookings";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matched =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matched, false, `${label} must not include ${fragmentOrPattern}.`);
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

const [
  ledger,
  appPage,
  typedReadRoute,
  typedReadGatedHelper,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  aiParseRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(typedReadRoutePath, "utf8"),
  readFile(typedReadGatedHelperPath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Load Bookings Primary List Source Boundary Guard Lock",
);
const implementationSection = sectionBetween(
  ledger,
  "### Load Bookings Primary List Source Runtime Implementation Lock",
);

for (const phrase of [
  "Load Bookings primary-list-source boundary was guarded before bounded runtime implementation.",
  "This guard did not approve runtime implementation by itself; runtime work still requires owner approval and remains bounded to list/display source only.",
  "For the bounded runtime lane, `runtime read wiring` means typed read safe operational data may become the primary list/display source only.",
  "`runtime read wiring` does not mean opening the DB-read gate, changing env, activating live DB reads, migrating detail/form fallback, or replacing legacy action/form source.",
  "Existing `GET /api/admin-load-bookings-typed-read` must be reused for typed safe operational list/display data.",
  "Existing `GET /api/admin-saved-bookings` must remain the booking/form/detail fallback source unless a separate owner-approved detail/form migration guard is added later.",
  "`loadSelectedBooking` and `bookingRecordToForm` must continue to consume legacy `BookingRecord` records, not typed `safe_card` or `safe_dto` output.",
  "Typed safe-card data must not feed Save Booking + CRM, `bookingRecordToForm`, driver dispatch payout copy, driver assignment payout controls, billing readiness, pricing, payout, payment/PDF, provider send, parser, auth/location/photo/calendar, or internal/admin/debug fields.",
  "Typed read failure, closed gate, blocked admin boundary, or malformed response must fall back safely without replacing the legacy booking/form source.",
  "No duplicate Load Bookings UI sector/button/card/route/helper/shim is approved.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "This lock adds `scripts/test-load-bookings-primary-list-source-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Primary-list boundary ledger phrase ${phrase}`);
}

for (const phrase of [
  "Owner-approved bounded runtime implementation for Load Bookings primary list/display source is recorded.",
  "`GET /api/admin-load-bookings-typed-read` safe operational cards and ordered IDs are now the primary display/list ordering source when present.",
  "Legacy `GET /api/admin-saved-bookings` remains the `BookingRecord` fallback for booking/form/detail/actions.",
  'Typed safe cards mark display items with `primaryListSource: "typed-read"` only; they do not feed `bookingRecordToForm`, `loadSelectedBooking`, Save Booking + CRM, pricing, payout, payment/PDF, provider send, parser, auth/location/photo/calendar, or internal/admin/debug fields.',
  "Typed-card IDs without a matching legacy `BookingRecord` are not made actionable by this implementation.",
  "Typed read failure, closed gate, blocked admin boundary, malformed response, or missing typed data falls back safely to legacy display ordering without replacing the legacy booking/form source.",
  "No duplicate Load Bookings UI sector/button/card/route/helper/shim was added.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No env change, deployment, DB read/write, provider send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, unrelated UI sector/button/card addition, or new shim is included.",
]) {
  assertIncludes(
    implementationSection,
    phrase,
    `Primary-list implementation ledger phrase ${phrase}`,
  );
}

for (const forbiddenPhrase of [
  "DB-read gate opening is approved",
  "typed read owns form",
  "typed read owns detail",
  "typed read owns actions",
  "remove legacy fallback",
  "replace `/api/admin-saved-bookings`",
  "Save Booking migration approved",
  "pricing activation approved",
  "payout activation approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, `Primary-list forbidden phrase ${forbiddenPhrase}`);
}

assertIncludes(appPage, `const adminLoadBookingsTypedReadApiPath = "${typedReadPath}"`, "typed read path");
assertIncludes(appPage, `const adminSavedBookingsApiPath = "${legacySavedBookingsPath}"`, "legacy saved-bookings path");
assertIncludes(
  appPage,
  'type LoadBookingsOperationalDisplayItemSource = "legacy-fallback" | "typed-read";',
  "typed primary display source marker",
);
assertIncludes(
  appPage,
  "primaryListSource: LoadBookingsOperationalDisplayItemSource;",
  "display item source field",
);
assertIncludes(
  appPage,
  'data-admin-booking-persistence-scrollbox="true"',
  "loaded operational snapshots scrollbox",
);
assertIncludes(
  appPage,
  "displayedAdminBookingPersistenceRecords.map((record)",
  "loaded operational snapshots full rendered list",
);
assertExcludes(
  appPage,
  "displayedAdminBookingPersistenceRecords.slice(0, 3)",
  "loaded operational snapshots artificial three-row cap",
);

const typedDisplayBridgeBlock = sliceBetween(
  appPage,
  "async function fetchLoadBookingsTypedOperationalDisplayResult",
  "function getLoadBookingsOperationalDisplayTitle",
);
const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
const loadSelectedBookingBlock = sliceBetween(
  appPage,
  "function loadSelectedBooking",
  "async function saveAdminBookingOperationalSnapshot",
);
const bookingRecordToFormBlock = sliceBetween(
  appPage,
  "function bookingRecordToForm",
  "function bookingRecordToOperationalFormFields",
);
const operationalDisplayItemBlock = sliceBetween(
  appPage,
  "function buildLoadBookingsOperationalDisplayItems",
  "const assignedDriverId",
);
const operationalDisplayItemSourceBlock = sliceBetween(
  appPage,
  "function getLoadBookingsOperationalDisplayItemSource",
  "function buildLoadBookingsOperationalDisplayItems",
);
const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");

assertIncludes(typedDisplayBridgeBlock, `fetch(\`\${adminLoadBookingsTypedReadApiPath}?`, "typed display fetch");
assertIncludes(typedDisplayBridgeBlock, 'method: "GET"', "typed display fetch GET-only");
assertIncludes(typedDisplayBridgeBlock, "return null;", "typed display safe fallback");
assertIncludes(
  typedDisplayBridgeBlock,
  "if (!response.ok || responseBody?.ok !== true || !Array.isArray(responseBody.bookings))",
  "typed display rejects unsafe responses",
);
assertExcludes(typedDisplayBridgeBlock, "setBookings", "typed display bridge must not replace BookingRecord list state");
assertExcludes(typedDisplayBridgeBlock, legacySavedBookingsPath, "typed display bridge must not call legacy route");

const typedDisplayFetchFragment = "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)";
const legacySavedBookingsFetchFragment = "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`";
const adminBookingsFallbackFetchFragment = "const adminBookingsResponse = await fetch(adminBookingsApiPath, requestInit);";
assertIncludes(loadBookingsBlock, `${typedDisplayFetchFragment}.catch(() => null)`, "typed display best-effort fetch");
assertIncludes(loadBookingsBlock, legacySavedBookingsFetchFragment, "legacy saved-bookings fetch");
assertIncludes(loadBookingsBlock, adminBookingsFallbackFetchFragment, "admin bookings fallback fetch");
assertIncludes(loadBookingsBlock, "const loadedBookings = sortBookingsNewestFirst(bookingsListResult.bookings);", "admin list result source");
assertIncludes(loadBookingsBlock, "setBookings(loadedBookings);", "legacy BookingRecord state source");
assertIncludes(
  loadBookingsBlock,
  "setLoadBookingsTypedOperationalCardsById(typedOperationalDisplay?.cardsById ?? {})",
  "typed safe cards separate state",
);
assertIncludes(
  loadBookingsBlock,
  "setLoadBookingsTypedOperationalCardOrder(typedOperationalDisplay?.orderedCardIds ?? [])",
  "typed safe order separate state",
);

const typedDisplayFetchIndex = loadBookingsBlock.indexOf(typedDisplayFetchFragment);
const legacySavedBookingsFetchIndex = loadBookingsBlock.indexOf(legacySavedBookingsFetchFragment);
const adminBookingsFallbackFetchIndex = loadBookingsBlock.indexOf(adminBookingsFallbackFetchFragment);
assert.equal(
  typedDisplayFetchIndex > -1 &&
    legacySavedBookingsFetchIndex > -1 &&
    adminBookingsFallbackFetchIndex > -1,
  true,
  "Load Bookings must keep typed display, saved-bookings source, and admin-bookings fallback fetches.",
);
assert.equal(
  typedDisplayFetchIndex < legacySavedBookingsFetchIndex &&
    legacySavedBookingsFetchIndex < adminBookingsFallbackFetchIndex,
  true,
  "Typed display hydration must happen before saved-bookings read and admin-bookings fallback.",
);

for (const forbiddenLoadFragment of [
  "setBookings(typedOperationalDisplay",
  "setBookings(loadBookingsTypedOperational",
  "setBookings(typedOperationalCardsById",
  "setBooking(typedOperationalDisplay",
  "setBooking(loadBookingsTypedOperational",
  "bookingRecordToForm(typedOperationalDisplay",
  "loadSelectedBooking(typedOperationalDisplay",
]) {
  assertExcludes(loadBookingsBlock, forbiddenLoadFragment, `Load Bookings primary-list boundary ${forbiddenLoadFragment}`);
}

for (const fragment of [
  "bookingRecord,",
  "operationalCard: getLoadBookingsOperationalDisplayCard(bookingRecord)",
  "primaryListSource: getLoadBookingsOperationalDisplayItemSource(bookingRecord)",
  "const shouldUseTypedOperationalOrder =",
  "options?.useTypedOperationalOrder ?? loadBookingsTypedOperationalCardOrder.length > 0",
  "if (!shouldUseTypedOperationalOrder)",
  "typedOrder: loadBookingsTypedOperationalCardOrderIndex.get(String(displayItem.bookingRecord.id))",
]) {
  assertIncludes(operationalDisplayItemBlock, fragment, `operational display item boundary ${fragment}`);
}
assertExcludes(operationalDisplayItemBlock, "setBooking", "operational display items must not own selected booking state");
assertExcludes(operationalDisplayItemBlock, "bookingRecordToForm", "operational display items must not own form mapping");

assertIncludes(
  operationalDisplayItemSourceBlock,
  'return typedCard ? "typed-read" : "legacy-fallback";',
  "typed primary source marker source",
);
assertExcludes(
  operationalDisplayItemSourceBlock,
  "bookingRecordToForm",
  "typed primary source marker form separation",
);
assertExcludes(
  operationalDisplayItemSourceBlock,
  "setBooking",
  "typed primary source marker selected booking separation",
);

assertIncludes(loadSelectedBookingBlock, "bookingRecordToForm(bookingRecord)", "selected booking legacy form source");
assertIncludes(
  loadSelectedBookingBlock,
  "bookingRecordToAdminBookingPersistenceRecord(bookingRecord)",
  "selected booking legacy update-target source",
);
assertIncludes(
  loadSelectedBookingBlock,
  "markAdminBookingAsActiveForUpdates(bookingReference, loadedAdminBookingRecord)",
  "selected booking active update target",
);
for (const fragment of [
  "const bookingReference =",
  "cleanReferenceText(bookingRecord.booking_reference)",
  "cleanReferenceText(bookingRecord.id)",
  "setLoadedBookingId(bookingReference)",
]) {
  assertIncludes(loadSelectedBookingBlock, fragment, `selected booking legacy id source ${fragment}`);
}
assertExcludes(loadSelectedBookingBlock, "safe_card", "safe-card selected booking separation");
assertExcludes(loadSelectedBookingBlock, "safe_dto", "safe-DTO selected booking separation");
assertExcludes(loadSelectedBookingBlock, "loadBookingsTypedOperational", "typed display selected booking separation");

for (const fragment of [
  "...bookingRecordToOperationalFormFields(bookingRecord)",
  "...bookingRecordToFinancePayoutInternalFormFields(bookingRecord)",
]) {
  assertIncludes(bookingRecordToFormBlock, fragment, `BookingRecord form fallback ${fragment}`);
}
assertExcludes(bookingRecordToFormBlock, "safe_card", "safe-card form separation");
assertExcludes(bookingRecordToFormBlock, "safe_dto", "safe-DTO form separation");
assertExcludes(bookingRecordToFormBlock, "loadBookingsTypedOperational", "typed display form separation");

assertIncludes(saveBookingBlock, `fetch("${adminBookingsPath}"`, "Save Booking endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking POST");
assertExcludes(saveBookingBlock, legacySavedBookingsPath, "Save Booking saved-bookings separation");
assertExcludes(saveBookingBlock, typedReadPath, "Save Booking typed-read separation");
assertExcludes(saveBookingBlock, "safe_card", "Save Booking safe-card separation");
assertExcludes(saveBookingBlock, "safe_dto", "Save Booking safe-DTO separation");

assertIncludes(typedReadRoute, "export async function GET", "typed read route GET");
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(typedReadRoute, `export async function ${method}`, `typed read route ${method}`);
}
assertIncludes(typedReadRoute, "resolveAdminDispatcherBoundary", "typed read admin boundary");
assertIncludes(typedReadRoute, 'blockedResponse("Load Bookings typed read is not enabled on this server.", 503)', "typed read closed gate");
assertIncludes(typedReadRoute, "return safeFailureResponse();", "typed read safe failure");
assertIncludes(typedReadRoute, "mapAdminLoadBookingsTypedReadList(result.data.bookings)", "typed read list mapped");
assertIncludes(typedReadRoute, "mapAdminLoadBookingsTypedReadDetail(result.data.booking)", "typed read detail mapped");
assertExcludes(typedReadRoute, "bookings: result.data.bookings", "typed read raw list response");
assertExcludes(typedReadRoute, "booking: result.data.booking", "typed read raw detail response");

for (const fragment of [
  "loadBookingsRuntimeWiringEnabled: false",
  "load_bookings_runtime_wiring_enabled: false",
  "savedBookingsEndpointChanged: false",
  "saved_bookings_endpoint_changed: false",
  "saveBookingChanged: false",
  "parserChanged: false",
  "writeEnabled: false",
  "liveWriteEnabled: false",
]) {
  assertIncludes(typedReadGatedHelper, fragment, `typed read gate boundary ${fragment}`);
}

for (const [label, source] of [
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, "loadBookingsTypedOperational", `${label} typed display state coupling`);
  assertExcludes(source, "safe_card", `${label} safe-card coupling`);
  assertExcludes(source, "safe_dto", `${label} safe-DTO coupling`);
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "legacy saved-bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "legacy saved-bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "legacy saved-bookings detail remains");
assertExcludes(adminSavedBookingsRoute, "admin-load-bookings-typed-read-gated", "saved-bookings typed helper separation");

assertIncludes(preactivationSuite, guardScript, "preactivation primary-list guard registration");

console.log("Load Bookings primary-list source boundary guard passed");
