import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const adminBookingReadSetupRoutePath =
  "app/api/admin-booking-read-contract-disabled-setup/route.ts";
const adminBookingReadSetupHelperPath = "lib/admin-booking-read-contract-disabled-setup.ts";
const safeDtoHelperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const safeUiAdapterHelperPath = "lib/admin-load-bookings-safe-ui-adapter-card-contract.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const dbReadApprovalGuardScript = "scripts/test-load-bookings-db-read-approval-packet.mjs";
const typedEndpointApprovalGuardScript =
  "scripts/test-load-bookings-typed-endpoint-migration-approval-packet.mjs";
const disabledReadSetupRoute = "/api/admin-booking-read-contract-disabled-setup";
const safeDtoHelperFragment = "admin-load-bookings-safe-dto-contract";
const safeUiAdapterHelperFragment = "admin-load-bookings-safe-ui-adapter-card-contract";
const dbReadPathPattern =
  /@supabase\/supabase-js|createClient|\.from\(|\.select\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|rpc\s*\(|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;

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
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  adminBookingReadSetupRoute,
  adminBookingReadSetupHelper,
  safeDtoHelper,
  safeUiAdapterHelper,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(adminBookingReadSetupRoutePath, "utf8"),
  readFile(adminBookingReadSetupHelperPath, "utf8"),
  readFile(safeDtoHelperPath, "utf8"),
  readFile(safeUiAdapterHelperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const approvalSection = sectionBetween(ledger, "### Load Bookings DB Read Approval Packet");

for (const phrase of [
  "Approval status: pending future DB-read activation approval.",
  "This packet is docs/test-only and does not approve typed endpoint migration, runtime implementation, DB read activation, env changes, deployment, migrations, or live reads.",
  "Typed Load Bookings endpoint migration remains parked.",
  "Load Bookings still uses `GET /api/admin-saved-bookings`.",
  "Operational display adapter remains implemented and guarded.",
  "Existing typed read contract remains setup-only/no-live-read at `GET /api/admin-booking-read-contract-disabled-setup`.",
  "Future typed read requires separate DB-read approval before any DB read execution.",
  "Future approval must verify required env names only; env values, secrets, tokens, keys, and connection strings must not be printed, logged, committed, or echoed.",
  "Future approval must verify target table names, read-only policy/RLS posture, read-only query shape, and no write/update/delete/upsert/rpc path before activation.",
  "Future approval must include a rollback plan that keeps Load Bookings on `GET /api/admin-saved-bookings` until the typed endpoint is approved, verified, and reversible.",
  "Future typed endpoint migration must not change Save Booking + CRM.",
  "Future typed endpoint migration must not change `/api/admin-saved-bookings` behavior.",
  "Future typed endpoint migration must not touch parser behavior or `/api/ai-parse`.",
  "Future typed endpoint migration must exclude pricing, payout, payment/PDF, provider/send, auth, location/photo/calendar, internal/admin notes, debug, and secrets.",
  "Future typed endpoint migration must not add UI sectors/buttons/cards.",
  "Future typed endpoint migration must not add new shims.",
  "Required future tests before any DB-read activation: typed endpoint contract test, DB-read/env-name/table-policy approval guard, safe DTO contract guard, safe UI adapter/card contract guard, operational runtime mapping guard, forbidden-field exclusion guard, Load Bookings route-flow guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, no-new-shim guard, booking UI browser test, and rollback/no-live checkpoint.",
  "This packet adds `scripts/test-load-bookings-db-read-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "No runtime implementation",
]) {
  assertIncludes(approvalSection, phrase, `Load Bookings DB-read approval phrase: ${phrase}`);
}

for (const forbiddenApprovalPhrase of [
  "typed endpoint migration is approved",
  "DB read activation is approved",
  "runtime implementation is approved",
  "safe to read now",
  "safe to wire now",
  "env values may be printed",
  "secrets may be printed",
  "write path approved",
  "live read approved",
]) {
  assertExcludes(
    approvalSection,
    forbiddenApprovalPhrase,
    `Load Bookings DB-read approval forbidden phrase ${forbiddenApprovalPhrase}`,
  );
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Current Load Bookings legacy endpoint",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Current Load Bookings method");
assertExcludes(loadBookingsBlock, disabledReadSetupRoute, "Typed read setup route runtime wiring");
assertExcludes(loadBookingsBlock, safeDtoHelperFragment, "Safe DTO server helper runtime import");
assertExcludes(loadBookingsBlock, safeUiAdapterHelperFragment, "Safe UI adapter server helper runtime import");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings detail remains");
assertExcludes(adminSavedBookingsRoute, disabledReadSetupRoute, "Admin saved bookings route typed read migration");
assertExcludes(adminSavedBookingsRoute, safeDtoHelperFragment, "Admin saved bookings route safe DTO wiring");
assertExcludes(
  adminSavedBookingsRoute,
  safeUiAdapterHelperFragment,
  "Admin saved bookings route safe UI adapter wiring",
);

assertIncludes(adminBookingReadSetupRoute, "export async function GET", "Typed read setup route GET-only");
assertExcludes(adminBookingReadSetupRoute, "export async function POST", "Typed read setup route POST");
assertExcludes(adminBookingReadSetupRoute, "export async function PATCH", "Typed read setup route PATCH");
assertExcludes(adminBookingReadSetupRoute, "export async function DELETE", "Typed read setup route DELETE");
assertIncludes(adminBookingReadSetupRoute, "no_live_read", "Typed read setup route no-live marker");

for (const [label, source] of [
  ["Typed read setup helper", adminBookingReadSetupHelper],
  ["Safe DTO helper", safeDtoHelper],
  ["Safe UI adapter helper", safeUiAdapterHelper],
]) {
  assertIncludes(source, "dbReadEnabled: false", `${label} DB read disabled`);
  assertIncludes(source, "liveReadEnabled: false", `${label} live read disabled`);
  assertIncludes(source, "no_live_read: true", `${label} no-live read marker`);
  assertExcludes(source, dbReadPathPattern, `${label} DB read path`);
}

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
]) {
  assertExcludes(source, disabledReadSetupRoute, `${label} typed read setup route wiring`);
  assertExcludes(source, safeDtoHelperFragment, `${label} safe DTO wiring`);
  assertExcludes(source, safeUiAdapterHelperFragment, `${label} safe UI adapter wiring`);
}

for (const suiteEntry of [
  dbReadApprovalGuardScript,
  typedEndpointApprovalGuardScript,
  "scripts/test-load-bookings-operational-runtime-mapping-guard.mjs",
  "scripts/test-load-bookings-safe-ui-adapter-card-contract.mjs",
  "scripts/test-load-bookings-safe-dto-contract.mjs",
  "scripts/test-shim-cleanup-no-new-shim-guard.mjs",
]) {
  assertIncludes(preactivationSuite, suiteEntry, `Preactivation suite entry ${suiteEntry}`);
}

console.log("Load Bookings DB read approval packet guard passed");
