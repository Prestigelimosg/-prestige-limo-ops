import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const typedReadRoutePath = "app/api/admin-load-bookings-typed-read/route.ts";
const savedBookingReadPath = "lib/admin-saved-booking-read.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-load-bookings-typed-read-detail-isolation-guard.mjs";
const typedReadPath = "/api/admin-load-bookings-typed-read";
const legacySavedBookingsPath = "/api/admin-saved-bookings";
const adminBookingsPath = "/api/admin-bookings";

const writePathPattern =
  /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(|rpc\s*\(/i;

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

function blockFrom(source, marker, startAt = 0) {
  const markerIndex = source.indexOf(marker, startAt);
  assert.notEqual(markerIndex, -1, `Missing block marker: ${marker}`);
  const openIndex = source.indexOf("{", markerIndex);
  assert.notEqual(openIndex, -1, `Missing opening brace for block marker: ${marker}`);

  let depth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return source.slice(markerIndex, index + 1);
    }
  }

  throw new Error(`Unclosed block for marker: ${marker}`);
}

const [
  ledger,
  appPage,
  typedReadRoute,
  savedBookingRead,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  aiParseRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(typedReadRoutePath, "utf8"),
  readFile(savedBookingReadPath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Load Bookings Typed Read Detail Isolation Guard Lock",
);

for (const phrase of [
  "Load Bookings typed-read detail mode is isolated before any future endpoint migration.",
  "This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, or DB writes.",
  "Typed detail responses may exist only on `GET /api/admin-load-bookings-typed-read` when an `id` or `booking_id` query param is supplied by an approved internal caller.",
  "The app Load Bookings bridge must request only list mode with `limit=25`; it must not send `id` or `booking_id` to the typed-read endpoint.",
  "The app typed-read response type and bridge must consume only `bookings` list payloads; they must not consume a singular `booking` detail payload or branch on typed `mode=detail`.",
  "Typed detail data must not feed `loadSelectedBooking`, `bookingRecordToForm`, Save Booking + CRM, driver dispatch payout copy, driver assignment payout controls, billing readiness, or finance/payout/internal paths.",
  "Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings` and `BookingRecord`.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No pricing, payout, customer rates, driver payout rules, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields are approved for customer or driver visibility.",
  "This lock adds `scripts/test-load-bookings-typed-read-detail-isolation-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Detail isolation ledger phrase: ${phrase}`);
}

for (const forbiddenPhrase of [
  "typed detail may replace Load Bookings",
  "typed detail may feed Save Booking",
  "typed detail may feed form",
  "endpoint migration is approved",
  "DB write approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, `Forbidden detail isolation ledger phrase: ${forbiddenPhrase}`);
}

assertIncludes(typedReadRoute, "export async function GET", "typed route GET");
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(typedReadRoute, `export async function ${method}`, `typed route ${method}`);
}
assertExcludes(typedReadRoute, writePathPattern, "typed route write path");

const getBlock = blockFrom(typedReadRoute, "export async function GET");
const detailBranch = blockFrom(getBlock, "if (isDetailRead)");
assertIncludes(
  getBlock,
  'const isDetailRead = Boolean(searchParams.get("id") || searchParams.get("booking_id"));',
  "typed detail trigger",
);
assertIncludes(detailBranch, "loadAdminSavedBookingById(searchParams, actor)", "typed detail read helper");
assertIncludes(detailBranch, "mapAdminLoadBookingsTypedReadDetail(result.data.booking)", "typed detail mapper");
assertIncludes(detailBranch, "booking: mapped.booking", "typed detail safe mapped response");
assertIncludes(detailBranch, "mode: mapped.mode", "typed detail mode");
assertIncludes(detailBranch, "status: \"ready\"", "typed detail ready status");
assertExcludes(detailBranch, "bookings: mapped.bookings", "typed detail list response");
assertExcludes(detailBranch, "booking: result.data.booking", "typed detail raw response");
assertExcludes(detailBranch, writePathPattern, "typed detail write path");
assert.equal(countMatches(typedReadRoute, "booking: mapped.booking"), 1, "only one typed detail response.");

assertIncludes(savedBookingRead, 'const allowedSingleReadQueryParams = new Set(["booking_id", "id"]);', "typed detail params");
assertIncludes(
  savedBookingRead,
  'readParamsValue(params, "id") || readParamsValue(params, "booking_id")',
  "typed detail id fallback order",
);
assertIncludes(savedBookingRead, ".eq(\"id\", parsed.data.id)", "typed detail id filter");
assertIncludes(savedBookingRead, ".limit(1)", "typed detail limit");
assertIncludes(savedBookingRead, ".maybeSingle()", "typed detail maybeSingle");
assertExcludes(savedBookingRead, writePathPattern, "typed detail read helper write path");

const typedResponseType = sliceBetween(
  appPage,
  "type AdminLoadBookingsTypedReadResponse = {",
  "type BookingStatusValue",
);
assertIncludes(typedResponseType, "bookings?: AdminLoadBookingsTypedReadSafeBooking[];", "app typed list payload");
assertIncludes(typedResponseType, 'mode?: "detail" | "list";', "app typed mode metadata");
assertExcludes(typedResponseType, "booking?:", "app typed singular detail payload");
assertExcludes(typedResponseType, "record?:", "app typed raw record payload");
assertExcludes(typedResponseType, "data?:", "app typed raw data payload");

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
  "typed bridge list-only response gate",
);
assertIncludes(typedDisplayBridge, "return buildLoadBookingsTypedOperationalDisplayResult(responseBody.bookings)", "typed bridge list builder");
assertIncludes(typedDisplayBridge, "return null;", "typed bridge detail/null fallback");
assertExcludes(typedDisplayBridge, /responseBody\.booking(?!s)/, "typed bridge singular detail payload");
assertExcludes(typedDisplayBridge, "responseBody.mode", "typed bridge detail mode branch");
assertExcludes(typedDisplayBridge, "booking_id", "typed bridge detail query param");
assertExcludes(typedDisplayBridge, 'searchParams.set("id"', "typed bridge id query set");
assertExcludes(typedDisplayBridge, 'searchParams.append("id"', "typed bridge id query append");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(loadBookingsBlock, 'new URLSearchParams({ limit: "25" })', "Load Bookings list params only");
assertIncludes(loadBookingsBlock, "fetchLoadBookingsTypedOperationalDisplayResult(searchParams).catch(() => null)", "typed list bridge safe fallback");
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "legacy saved-bookings read",
);
assertIncludes(loadBookingsBlock, "setBookings(loadedBookings);", "legacy BookingRecord source");
assertExcludes(loadBookingsBlock, "booking_id", "Load Bookings typed detail query");
assertExcludes(loadBookingsBlock, 'searchParams.set("id"', "Load Bookings id query set");
assertExcludes(loadBookingsBlock, 'searchParams.append("id"', "Load Bookings id query append");
assertExcludes(loadBookingsBlock, /responseBody\.booking(?!s)/, "Load Bookings singular typed payload");

const loadSelectedBookingBlock = sliceBetween(
  appPage,
  "function loadSelectedBooking",
  "async function saveAdminBookingOperationalSnapshot",
);
assertIncludes(loadSelectedBookingBlock, "bookingRecordToForm(bookingRecord)", "selected booking uses BookingRecord");
for (const fragment of [
  "const bookingReference =",
  "cleanReferenceText(bookingRecord.booking_reference)",
  "cleanReferenceText(bookingRecord.id)",
  "setLoadedBookingId(bookingReference)",
]) {
  assertIncludes(loadSelectedBookingBlock, fragment, `selected booking legacy id source ${fragment}`);
}
for (const forbiddenSelectedFragment of [
  "AdminLoadBookingsTypedReadSafeBooking",
  "LoadBookingsOperationalDisplayCard",
  "loadBookingsTypedOperational",
  "safe_card",
  "safe_dto",
  "responseBody.booking",
  typedReadPath,
]) {
  assertExcludes(
    loadSelectedBookingBlock,
    forbiddenSelectedFragment,
    `selected booking typed detail fragment ${forbiddenSelectedFragment}`,
  );
}

const bookingRecordToFormBlock = sliceBetween(appPage, "function bookingRecordToForm", "function stripBookerFromJobCard");
assertIncludes(bookingRecordToFormBlock, "bookingRecordToOperationalFormFields(bookingRecord)", "form operational source");
assertIncludes(
  bookingRecordToFormBlock,
  "bookingRecordToFinancePayoutInternalFormFields(bookingRecord)",
  "form finance/internal source",
);
assertExcludes(bookingRecordToFormBlock, "AdminLoadBookingsTypedReadSafeBooking", "typed detail form source");
assertExcludes(bookingRecordToFormBlock, "LoadBookingsOperationalDisplayCard", "typed card form source");
assertExcludes(bookingRecordToFormBlock, "safe_card", "safe card form source");
assertExcludes(bookingRecordToFormBlock, "safe_dto", "safe DTO form source");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, `fetch("${adminBookingsPath}"`, "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, typedReadPath, "Save Booking typed detail separation");
assertExcludes(saveBookingBlock, legacySavedBookingsPath, "Save Booking saved-bookings separation");
assertExcludes(saveBookingBlock, "safe_card", "Save Booking safe-card separation");
assertExcludes(saveBookingBlock, "safe_dto", "Save Booking safe-DTO separation");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "saved-bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "saved-bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "saved-bookings detail remains");
assertExcludes(adminSavedBookingsRoute, typedReadPath, "saved-bookings typed route coupling");
assertExcludes(adminSavedBookingsRoute, "admin-load-bookings-typed-read-gated", "saved-bookings typed helper coupling");

for (const [label, source] of [
  ["admin-bookings route", adminBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, typedReadPath, `${label} typed-read path`);
  assertExcludes(source, "admin-load-bookings-typed-read-gated", `${label} typed-read helper`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation detail isolation guard registration");

console.log("Load Bookings typed read detail isolation guard passed");
