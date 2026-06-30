import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const routePath = "app/api/admin-load-bookings-typed-read/route.ts";
const gatedHelperPath = "lib/admin-load-bookings-typed-read-gated.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const typedReadPath = "/api/admin-load-bookings-typed-read";
const legacySavedBookingsPath = "/api/admin-saved-bookings";
const gateEnvName = "PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED";
const guardScript = "scripts/test-load-bookings-typed-read-rollback-boundary.mjs";

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
  gatedHelper,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  aiParseRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(gatedHelperPath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const rollbackSection = sectionBetween(
  ledger,
  "### Load Bookings Typed Read Rollback Boundary Lock",
);

for (const phrase of [
  "Typed Load Bookings read rollback boundary is guarded.",
  "Rollback path: close `PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED`; Load Bookings continues to use `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.",
  "Typed read failures, blocked responses, closed gates, or malformed responses must return `null` from the operational display bridge and must not block the legacy saved-bookings read.",
  "Typed safe-card state resets to empty before each load and falls back to empty maps/orders when typed read is unavailable.",
  "Typed read safe-card order is display-only and must not replace the legacy `BookingRecord` action/form/detail source.",
  "The typed endpoint remains GET-only and read-only.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` route endpoint swap is approved; the read helper may use the approved schema fallback only.",
  "No parser or `/api/ai-parse` change.",
  "No DB write, provider send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/card addition, or new shim is approved by this lock.",
  "This lock adds `scripts/test-load-bookings-typed-read-rollback-boundary.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(rollbackSection, phrase, `Rollback ledger phrase: ${phrase}`);
}

for (const forbiddenPhrase of [
  "typed endpoint may replace saved-bookings",
  "safe to remove legacy fallback",
  "typed read failure may block Load Bookings",
  "DB write approved",
  "provider send approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(rollbackSection, forbiddenPhrase, `Rollback forbidden phrase: ${forbiddenPhrase}`);
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
const typedFetchFragment = "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)";
const legacyFetchFragment = "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`";

assertIncludes(appPage, `const adminLoadBookingsTypedReadApiPath = "${typedReadPath}"`, "typed read path");
assertIncludes(loadBookingsBlock, typedFetchFragment, "typed operational display bridge");
assertIncludes(loadBookingsBlock, `${typedFetchFragment}.catch(() => null)`, "typed bridge safe failure fallback");
assertIncludes(loadBookingsBlock, legacyFetchFragment, "legacy saved-bookings fallback read");
assertIncludes(loadBookingsBlock, "setLoadBookingsTypedOperationalCardsById({});", "typed card reset");
assertIncludes(loadBookingsBlock, "setLoadBookingsTypedOperationalCardOrder([]);", "typed order reset");
assertIncludes(
  loadBookingsBlock,
  "setLoadBookingsTypedOperationalCardsById(typedOperationalDisplay?.cardsById ?? {})",
  "typed card empty fallback",
);
assertIncludes(
  loadBookingsBlock,
  "setLoadBookingsTypedOperationalCardOrder(typedOperationalDisplay?.orderedCardIds ?? [])",
  "typed order empty fallback",
);
assertIncludes(loadBookingsBlock, "setBookings(loadedBookings);", "legacy records remain action/form source");

const typedFetchIndex = loadBookingsBlock.indexOf(typedFetchFragment);
const legacyFetchIndex = loadBookingsBlock.indexOf(legacyFetchFragment);
assert.equal(typedFetchIndex > -1 && legacyFetchIndex > -1, true, "typed and legacy reads must both exist");
assert.equal(typedFetchIndex < legacyFetchIndex, true, "typed display hydration must run before legacy read");

assertExcludes(loadBookingsBlock, "setBookings(typedOperationalDisplay", "typed read must not replace records");
assertExcludes(loadBookingsBlock, "return typedOperationalDisplay", "typed read must not short-circuit Load Bookings");
assertExcludes(loadBookingsBlock, "throw typedOperationalDisplay", "typed read must not throw through Load Bookings");

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
  "typed bridge rejects blocked/malformed responses",
);
assertIncludes(typedDisplayBridge, "return null;", "typed bridge null fallback");
assertExcludes(typedDisplayBridge, legacySavedBookingsPath, "typed bridge must not call legacy route directly");

assertIncludes(typedReadRoute, "export async function GET", "typed route GET");
assertExcludes(typedReadRoute, "export async function POST", "typed route POST");
assertExcludes(typedReadRoute, "export async function PUT", "typed route PUT");
assertExcludes(typedReadRoute, "export async function PATCH", "typed route PATCH");
assertExcludes(typedReadRoute, "export async function DELETE", "typed route DELETE");
assertIncludes(typedReadRoute, "blockedResponse(\"Load Bookings typed read is not enabled on this server.\", 503)", "closed gate 503");
assertIncludes(typedReadRoute, "return safeFailureResponse();", "typed route safe failure response");
assertExcludes(typedReadRoute, /\.insert\(|\.upsert\(|\.update\(|\.delete\(|rpc\s*\(/i, "typed route DB write path");

assertIncludes(gatedHelper, gateEnvName, "typed gate env name");
assertIncludes(gatedHelper, "read_gate_open: readGateOpen", "typed gate state");
assertIncludes(gatedHelper, "writeEnabled: false", "typed gate write disabled");
assertIncludes(gatedHelper, "liveWriteEnabled: false", "typed gate live write disabled");
assertExcludes(gatedHelper, /\.insert\(|\.upsert\(|\.update\(|\.delete\(|rpc\s*\(/i, "typed helper DB write path");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "admin-saved-bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "admin-saved-bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "admin-saved-bookings detail remains");
assertExcludes(adminSavedBookingsRoute, typedReadPath, "admin-saved-bookings typed route coupling");
assertExcludes(adminSavedBookingsRoute, "admin-load-bookings-typed-read-gated", "admin-saved-bookings typed helper coupling");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, legacySavedBookingsPath, "Save Booking + CRM saved-bookings separation");
assertExcludes(saveBookingBlock, typedReadPath, "Save Booking + CRM typed read separation");

for (const [label, source] of [
  ["admin-bookings route", adminBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, typedReadPath, `${label} typed read path`);
  assertExcludes(source, "admin-load-bookings-typed-read-gated", `${label} typed read helper`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation rollback guard registration");

console.log("Load Bookings typed read rollback boundary guard passed");
