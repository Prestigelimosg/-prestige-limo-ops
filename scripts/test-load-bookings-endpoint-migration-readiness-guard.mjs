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

const guardScript = "scripts/test-load-bookings-endpoint-migration-readiness-guard.mjs";
const typedReadPath = "/api/admin-load-bookings-typed-read";
const legacySavedBookingsPath = "/api/admin-saved-bookings";
const adminBookingsPath = "/api/admin-bookings";
const gateEnvName = "PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED";

const writePathPattern =
  /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(|rpc\s*\(/i;
const newUiSectorPattern =
  /Load Bookings Endpoint Migration|Typed Endpoint Migration|Replace Saved Bookings|Migrate Load Bookings/i;

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

const readinessSection = sectionBetween(
  ledger,
  "### Load Bookings Endpoint Migration Readiness Guard Lock",
);

for (const phrase of [
  "Load Bookings endpoint migration readiness is guarded before any future endpoint swap.",
  "This is a docs/test-only readiness guard; it does not approve endpoint migration.",
  "Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings`.",
  "The typed read endpoint remains `GET /api/admin-load-bookings-typed-read` and is used only for safe operational display-card hydration when the existing gate and admin boundary allow it.",
  "Typed safe-card data must not replace the legacy `BookingRecord` source used by `bookingRecordToForm`, `loadSelectedBooking`, Save Booking + CRM, driver dispatch payout copy, driver assignment payout controls, billing readiness, or finance/payout/internal paths.",
  "Future endpoint migration requires separate owner approval, rollback proof, no forbidden-field leak proof, and a bounded staging smoke.",
  "Forbidden fields remain excluded from typed output and must not reach customers or drivers: pricing, payout, customer rates, driver payout rules, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, and mock QA/dev archive fields.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No env change, deployment, DB write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim is approved by this lock.",
  "This lock adds `scripts/test-load-bookings-endpoint-migration-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(readinessSection, phrase, `Endpoint migration readiness ledger phrase: ${phrase}`);
}

for (const forbiddenPhrase of [
  "endpoint migration is approved",
  "safe to replace saved-bookings",
  "remove legacy fallback",
  "typed read owns form",
  "typed read owns detail",
  "typed read owns actions",
  "DB write approved",
  "provider send approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(readinessSection, forbiddenPhrase, `Endpoint readiness forbidden phrase: ${forbiddenPhrase}`);
}

assertIncludes(appPage, `const adminSavedBookingsApiPath = "${legacySavedBookingsPath}"`, "legacy saved bookings path");
assertIncludes(appPage, `const adminLoadBookingsTypedReadApiPath = "${typedReadPath}"`, "typed read path");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
const loadSelectedBookingBlock = sliceBetween(appPage, "function loadSelectedBooking", "async function saveAdminBookingOperationalSnapshot");
const typedDisplayBridgeBlock = sliceBetween(
  appPage,
  "async function fetchLoadBookingsTypedOperationalDisplayResult",
  "function getLoadBookingsOperationalDisplayTitle",
);
const bookingRecordToFormBlock = sliceBetween(
  appPage,
  "function bookingRecordToForm",
  "function bookingRecordToOperationalFormFields",
);
const bookingCardPriceLineBlock = sliceBetween(appPage, "function bookingCardPriceLine", "function positiveRateOrDefault");
const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");

const typedDisplayFetchFragment = "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)";
const legacySavedBookingsFetchFragment = "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`";

assertIncludes(loadBookingsBlock, `${typedDisplayFetchFragment}.catch(() => null)`, "typed display safe fallback");
assertIncludes(loadBookingsBlock, legacySavedBookingsFetchFragment, "legacy saved-bookings fetch");
assertIncludes(loadBookingsBlock, "setBookings(loadedBookings);", "legacy BookingRecord state source");
assertIncludes(loadBookingsBlock, "setLoadBookingsTypedOperationalCardsById({});", "typed cards reset");
assertIncludes(loadBookingsBlock, "setLoadBookingsTypedOperationalCardOrder([]);", "typed order reset");
assertIncludes(
  loadBookingsBlock,
  "setLoadBookingsTypedOperationalCardsById(typedOperationalDisplay?.cardsById ?? {})",
  "typed display cards remain separate state",
);
assertIncludes(
  loadBookingsBlock,
  "setLoadBookingsTypedOperationalCardOrder(typedOperationalDisplay?.orderedCardIds ?? [])",
  "typed display order remains separate state",
);

const typedDisplayFetchIndex = loadBookingsBlock.indexOf(typedDisplayFetchFragment);
const legacySavedBookingsFetchIndex = loadBookingsBlock.indexOf(legacySavedBookingsFetchFragment);
assert.equal(
  typedDisplayFetchIndex > -1 && legacySavedBookingsFetchIndex > -1,
  true,
  "typed display fetch and legacy saved-bookings fetch must both exist.",
);
assert.equal(
  typedDisplayFetchIndex < legacySavedBookingsFetchIndex,
  true,
  "typed display hydration must happen before the legacy form/detail source read.",
);

for (const forbiddenLoadFragment of [
  "setBookings(typedOperationalDisplay",
  "setBookings(loadBookingsTypedOperational",
  "return typedOperationalDisplay",
  "throw typedOperationalDisplay",
]) {
  assertExcludes(loadBookingsBlock, forbiddenLoadFragment, `Load Bookings typed migration fragment ${forbiddenLoadFragment}`);
}

assertIncludes(typedDisplayBridgeBlock, `fetch(\`\${adminLoadBookingsTypedReadApiPath}?`, "typed display bridge fetch");
assertIncludes(typedDisplayBridgeBlock, 'method: "GET"', "typed display bridge GET-only");
assertIncludes(typedDisplayBridgeBlock, "operationalDisplay: null", "typed display bridge null fallback");
assertIncludes(typedDisplayBridgeBlock, "terminalUnavailable", "typed display bridge terminal outcome");
assertIncludes(
  typedDisplayBridgeBlock,
  "if (!response.ok || responseBody?.ok !== true || !Array.isArray(responseBody.bookings))",
  "typed display bridge rejects blocked or malformed responses",
);
assertExcludes(typedDisplayBridgeBlock, legacySavedBookingsPath, "typed bridge must not call saved-bookings directly");
assertExcludes(typedDisplayBridgeBlock, writePathPattern, "typed bridge write path");

assertIncludes(loadSelectedBookingBlock, "bookingRecordToForm(bookingRecord)", "selected booking uses BookingRecord form mapper");
assertIncludes(loadSelectedBookingBlock, "setActiveTab(\"dispatch\")", "selected booking action flow remains");
assertExcludes(loadSelectedBookingBlock, "LoadBookingsOperationalDisplayCard", "safe card must not feed selected booking");
assertExcludes(loadSelectedBookingBlock, "loadBookingsTypedOperational", "typed display state must not feed selected booking");
assertExcludes(loadSelectedBookingBlock, "safe_card", "safe card object must not feed selected booking");
assertExcludes(loadSelectedBookingBlock, "safe_dto", "safe DTO object must not feed selected booking");

assertIncludes(bookingRecordToFormBlock, "...bookingRecordToOperationalFormFields(bookingRecord)", "form operational fields use BookingRecord");
assertIncludes(
  bookingRecordToFormBlock,
  "...bookingRecordToFinancePayoutInternalFormFields(bookingRecord)",
  "form finance/payout/internal fields remain BookingRecord-only",
);
assertExcludes(bookingRecordToFormBlock, "LoadBookingsOperationalDisplayCard", "safe card must not feed form mapper");
assertExcludes(bookingRecordToFormBlock, "loadBookingsTypedOperational", "typed display state must not feed form mapper");
assertExcludes(bookingRecordToFormBlock, "safe_card", "safe card object must not feed form mapper");
assertExcludes(bookingRecordToFormBlock, "safe_dto", "safe DTO object must not feed form mapper");

assertExcludes(bookingCardPriceLineBlock, "LoadBookingsOperationalDisplayCard", "safe card must not feed price line");
assertExcludes(bookingCardPriceLineBlock, "loadBookingsTypedOperational", "typed display state must not feed price line");
assertExcludes(bookingCardPriceLineBlock, "safe_card", "safe card object must not feed price line");
assertExcludes(bookingCardPriceLineBlock, "safe_dto", "safe DTO object must not feed price line");

assertIncludes(saveBookingBlock, `fetch("${adminBookingsPath}"`, "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM POST");
assertExcludes(saveBookingBlock, legacySavedBookingsPath, "Save Booking + CRM saved-bookings separation");
assertExcludes(saveBookingBlock, typedReadPath, "Save Booking + CRM typed-read separation");
assertExcludes(saveBookingBlock, "safe_card", "Save Booking + CRM safe-card separation");
assertExcludes(saveBookingBlock, "safe_dto", "Save Booking + CRM safe-DTO separation");

assertIncludes(typedReadRoute, "export async function GET", "typed read route GET");
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(typedReadRoute, `export async function ${method}`, `typed read route ${method}`);
}
assertIncludes(typedReadRoute, 'blockedResponse("Load Bookings typed read is not enabled on this server.", 503)', "typed read closed gate");
assertIncludes(typedReadRoute, "return safeFailureResponse();", "typed read safe failure");
assertIncludes(typedReadRoute, "loadAdminSavedBookingById(searchParams, actor)", "typed read detail source");
assertIncludes(typedReadRoute, "loadAdminSavedBookingList(searchParams, actor)", "typed read list source");
assertIncludes(typedReadRoute, "mapAdminLoadBookingsTypedReadDetail(result.data.booking)", "typed detail mapped before response");
assertIncludes(typedReadRoute, "mapAdminLoadBookingsTypedReadList(result.data.bookings)", "typed list mapped before response");
assertIncludes(typedReadRoute, "booking: mapped.booking", "typed detail safe mapped response");
assertIncludes(typedReadRoute, "bookings: mapped.bookings", "typed list safe mapped response");
assertExcludes(typedReadRoute, "booking: result.data.booking", "typed detail raw response");
assertExcludes(typedReadRoute, "bookings: result.data.bookings", "typed list raw response");
assertExcludes(typedReadRoute, writePathPattern, "typed route DB write path");

assertIncludes(typedReadGatedHelper, gateEnvName, "typed read gate env name");
assertIncludes(typedReadGatedHelper, "writeEnabled: false", "typed gate write disabled");
assertIncludes(typedReadGatedHelper, "liveWriteEnabled: false", "typed gate live write disabled");
assertIncludes(typedReadGatedHelper, "loadBookingsEndpointChanged: false", "typed gate endpoint unchanged");
assertIncludes(typedReadGatedHelper, "savedBookingsEndpointChanged: false", "typed gate saved-bookings unchanged");
assertIncludes(typedReadGatedHelper, "saveBookingChanged: false", "typed gate Save Booking unchanged");
assertIncludes(typedReadGatedHelper, "parserChanged: false", "typed gate parser unchanged");
assertExcludes(typedReadGatedHelper, writePathPattern, "typed gated helper DB write path");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "saved-bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "saved-bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "saved-bookings detail remains");
assertIncludes(adminSavedBookingsRoute, "export async function POST", "saved-bookings existing POST remains separate");
assertIncludes(adminSavedBookingsRoute, "export async function DELETE", "saved-bookings existing DELETE remains separate");
assertExcludes(adminSavedBookingsRoute, typedReadPath, "saved-bookings typed route coupling");
assertExcludes(adminSavedBookingsRoute, "admin-load-bookings-typed-read-gated", "saved-bookings typed helper coupling");

for (const [label, source] of [
  ["admin-bookings route", adminBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, typedReadPath, `${label} typed read route coupling`);
  assertExcludes(source, "admin-load-bookings-typed-read-gated", `${label} typed helper coupling`);
}

assertExcludes(appPage, newUiSectorPattern, "new endpoint migration UI sector text");

for (const requiredGuard of [
  "scripts/test-load-bookings-typed-read-rollback-boundary.mjs",
  "scripts/test-load-bookings-typed-read-query-shape-guard.mjs",
  "scripts/test-load-bookings-db-read-env-table-policy-guard.mjs",
  "scripts/test-load-bookings-operational-runtime-mapping-guard.mjs",
  "scripts/test-load-bookings-typed-operational-display-merge-guard.mjs",
  guardScript,
]) {
  assertIncludes(preactivationSuite, requiredGuard, `preactivation guard registration ${requiredGuard}`);
}

console.log("Load Bookings endpoint migration readiness guard passed");
