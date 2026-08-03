import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const typedReadRoutePath = "app/api/admin-load-bookings-typed-read/route.ts";
const typedReadGatedHelperPath = "lib/admin-load-bookings-typed-read-gated.ts";
const adminSavedBookingReadPath = "lib/admin-saved-booking-read.ts";
const appPagePath = "app/page.tsx";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-load-bookings-typed-read-admin-boundary-order-guard.mjs";
const typedReadPath = "/api/admin-load-bookings-typed-read";
const legacySavedBookingsPath = "/api/admin-saved-bookings";
const gateEnvName = "PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED";

const writePathPattern =
  /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(|rpc\s*\(/i;
const secretValuePattern =
  /process\.env\[[^\]]+\]\s*\)|console\.|SERVICE_ROLE_KEY.*console|SUPABASE_URL.*console/i;

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
  typedReadRoute,
  typedReadGatedHelper,
  adminSavedBookingRead,
  appPage,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  aiParseRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(typedReadRoutePath, "utf8"),
  readFile(typedReadGatedHelperPath, "utf8"),
  readFile(adminSavedBookingReadPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Load Bookings Typed Read Admin Boundary Order Guard Lock",
);

for (const phrase of [
  "Load Bookings typed-read admin-boundary ordering is guarded before any future endpoint migration.",
  "This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, or DB writes.",
  "The typed-read route must resolve the admin/dispatcher boundary before checking the read gate, converting the actor, parsing search params, or calling saved-booking read helpers.",
  "If the admin boundary fails, the route must return the boundary blocked response before any actor conversion or saved-booking read helper call.",
  "The route may include gate-state metadata in blocked responses, but it must not create a DB client or execute a list/detail read before the admin boundary passes.",
  "The typed-read route remains GET-only and read-only.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "Current Load Bookings booking/form/detail source remains `GET /api/admin-saved-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No pricing, payout, customer rates, driver payout rules, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields are approved for customer or driver visibility.",
  "This lock adds `scripts/test-load-bookings-typed-read-admin-boundary-order-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Admin boundary order ledger phrase: ${phrase}`);
}

for (const forbiddenPhrase of [
  "endpoint migration is approved",
  "boundary can run after DB read",
  "DB read before boundary",
  "actor conversion before boundary",
  "env values may be printed",
  "Save Booking changed",
  "saved-bookings changed",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, `Forbidden boundary ledger phrase: ${forbiddenPhrase}`);
}

assertIncludes(typedReadRoute, "export async function GET", "typed route GET");
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(typedReadRoute, `export async function ${method}`, `typed route ${method}`);
}
assertExcludes(typedReadRoute, writePathPattern, "typed route write path");
assertExcludes(typedReadRoute, "createClient(", "typed route DB client creation");
assertExcludes(typedReadRoute, "from(", "typed route direct table access");
assertExcludes(typedReadRoute, "console.", "typed route console/env output");

const boundaryFunction = sliceBetween(
  typedReadRoute,
  "function requireAdminDispatcherBoundary",
  "export async function GET",
);
assertIncludes(boundaryFunction, "resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose)", "boundary resolver");
assertIncludes(boundaryFunction, "blockedResponse(boundary.error)", "boundary blocked response");
assertExcludes(boundaryFunction, "adminDispatcherBoundaryToPersistenceAdapterActor", "boundary helper actor conversion");
assertExcludes(boundaryFunction, "loadAdminSavedBooking", "boundary helper saved-booking read");
assertExcludes(boundaryFunction, "new URL", "boundary helper search param parse");
assertExcludes(boundaryFunction, writePathPattern, "boundary helper write path");

const getBlock = sliceBetween(typedReadRoute, "export async function GET", "\n}");
const boundaryIndex = getBlock.indexOf("const boundary = requireAdminDispatcherBoundary(request);");
const boundaryReturnIndex = getBlock.indexOf("if (!boundary.ok)");
const boundaryResponseIndex = getBlock.indexOf("return boundary.response;");
const gateIndex = getBlock.indexOf("const gate = buildAdminLoadBookingsTypedReadGateState();");
const gateClosedIndex = getBlock.indexOf("if (!gate.read_gate_open)");
const actorIndex = getBlock.indexOf("const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);");
const searchParamsIndex = getBlock.indexOf("const searchParams = new URL(request.url).searchParams;");
const detailReadIndex = getBlock.indexOf("loadAdminSavedBookingById(searchParams, actor)");
const listReadIndex = getBlock.indexOf("loadAdminSavedBookingList(searchParams, actor)");

for (const [label, index] of [
  ["boundary check", boundaryIndex],
  ["boundary failure branch", boundaryReturnIndex],
  ["boundary response", boundaryResponseIndex],
  ["gate state", gateIndex],
  ["gate closed branch", gateClosedIndex],
  ["actor conversion", actorIndex],
  ["search params", searchParamsIndex],
  ["detail read helper", detailReadIndex],
  ["list read helper", listReadIndex],
]) {
  assert.notEqual(index, -1, `Missing GET ordering fragment: ${label}`);
}

assert.equal(boundaryIndex < boundaryReturnIndex, true, "boundary check must happen before boundary branch");
assert.equal(boundaryReturnIndex < boundaryResponseIndex, true, "boundary branch must return boundary response");
assert.equal(boundaryResponseIndex < gateIndex, true, "boundary block must return before gate check");
assert.equal(gateIndex < gateClosedIndex, true, "gate state must be checked before actor conversion");
assert.equal(gateClosedIndex < actorIndex, true, "closed gate must return before actor conversion");
assert.equal(actorIndex < searchParamsIndex, true, "actor conversion must happen before query parsing");
assert.equal(searchParamsIndex < detailReadIndex, true, "query parsing must happen before detail read helper");
assert.equal(searchParamsIndex < listReadIndex, true, "query parsing must happen before list read helper");
assert.equal(actorIndex < detailReadIndex, true, "actor conversion must happen before detail read helper");
assert.equal(actorIndex < listReadIndex, true, "actor conversion must happen before list read helper");

assertIncludes(typedReadGatedHelper, gateEnvName, "typed read gate env name");
assertIncludes(typedReadGatedHelper, "writeEnabled: false", "typed gate write disabled");
assertIncludes(typedReadGatedHelper, "liveWriteEnabled: false", "typed gate live write disabled");
assertIncludes(typedReadGatedHelper, "databaseClientEnabled: readGateOpen", "typed gate DB client flag only");
assertExcludes(typedReadGatedHelper, "createClient(", "typed gate helper DB client creation");
assertExcludes(typedReadGatedHelper, writePathPattern, "typed gate helper write path");
assertExcludes(typedReadGatedHelper, secretValuePattern, "typed gate helper secret/env output");

assertIncludes(adminSavedBookingRead, "const allowedAdapterActorRoles = new Set", "saved-booking actor roles");
assertIncludes(adminSavedBookingRead, "safeActorError", "saved-booking safe actor error");
assertIncludes(adminSavedBookingRead, "safeSessionActorError", "saved-booking safe session actor error");
assertIncludes(adminSavedBookingRead, "createClient", "saved-booking read helper owns DB client creation");
assertExcludes(adminSavedBookingRead, writePathPattern, "saved-booking read helper write path");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(loadBookingsBlock, "fetchLoadBookingsTypedOperationalDisplayResult(searchParams).catch(() => null)", "typed display safe fallback");
assertIncludes(loadBookingsBlock, "fetchAdminSavedBookingsList(searchParams)", "saved-bookings list read");
assertIncludes(loadBookingsBlock, "setBookings(loadedBookings);", "legacy BookingRecord source");
assertExcludes(loadBookingsBlock, "setBookings(typedOperationalDisplay", "typed display must not replace records");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM route");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, legacySavedBookingsPath, "Save Booking + CRM saved-bookings separation");
assertExcludes(saveBookingBlock, typedReadPath, "Save Booking + CRM typed-read separation");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "saved-bookings GET");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "saved-bookings list");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "saved-bookings detail");
assertExcludes(adminSavedBookingsRoute, typedReadPath, "saved-bookings typed route coupling");
assertExcludes(adminSavedBookingsRoute, "admin-load-bookings-typed-read-gated", "saved-bookings typed helper coupling");

for (const [label, source] of [
  ["admin-bookings route", adminBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, typedReadPath, `${label} typed-read route coupling`);
  assertExcludes(source, "admin-load-bookings-typed-read-gated", `${label} typed-read helper coupling`);
}

for (const requiredGuard of [
  "scripts/test-load-bookings-endpoint-migration-readiness-guard.mjs",
  guardScript,
]) {
  assertIncludes(preactivationSuite, requiredGuard, `preactivation registration ${requiredGuard}`);
}

console.log("Load Bookings typed-read admin boundary order guard passed");
