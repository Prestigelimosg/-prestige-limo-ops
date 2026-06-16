import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const assignmentDisplayHelperPath = "lib/admin-driver-assignment-display.ts";
const assignmentDisplayRoutePath = "app/api/admin-driver-assignment-display/route.ts";
const availabilityHelperPath = "lib/admin-driver-availability.ts";
const availabilityRoutePath = "app/api/admin-driver-availability/route.ts";
const disabledActionRoutePath = "app/api/admin-full-driver-profile-action-disabled-setup/route.ts";
const disabledActionHelperPath = "lib/admin-full-driver-profile-action-disabled-setup.ts";
const auditPayloadRoutePath = "app/api/admin-full-driver-profile-action-audit-payload-setup/route.ts";
const auditPayloadHelperPath = "lib/admin-full-driver-profile-action-audit-payload-setup.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const actionSetupApiName = "admin-full-driver-profile-action-disabled-setup";
const auditSetupApiName = "admin-full-driver-profile-action-audit-payload-setup";
const actionHelperExportName = "buildAdminFullDriverProfileActionDisabledSetup";
const auditHelperExportName = "buildAdminFullDriverProfileActionAuditPayloadSetup";
const liveWritePattern =
  /@supabase\/supabase-js|createClient|\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|rpc\s*\(|fetch\s*\(|process\.env|SUPABASE_[A-Z_]*|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;

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
  adminSavedBookingsRoute,
  legacyRoute,
  assignmentDisplayHelper,
  assignmentDisplayRoute,
  availabilityHelper,
  availabilityRoute,
  disabledActionRoute,
  disabledActionHelper,
  auditPayloadRoute,
  auditPayloadHelper,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
  readFile(assignmentDisplayHelperPath, "utf8"),
  readFile(assignmentDisplayRoutePath, "utf8"),
  readFile(availabilityHelperPath, "utf8"),
  readFile(availabilityRoutePath, "utf8"),
  readFile(disabledActionRoutePath, "utf8"),
  readFile(disabledActionHelperPath, "utf8"),
  readFile(auditPayloadRoutePath, "utf8"),
  readFile(auditPayloadHelperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const packetSection = sectionBetween(ledger, "### Full Driver Profile Runtime Approval Packet Lock");

for (const phrase of [
  "Approval status: pending future runtime-wiring approval.",
  "This is a docs/test-only approval packet guarded by `scripts/test-full-driver-profile-runtime-approval-packet.mjs`.",
  "Full driver profile display/read is typed through `GET /api/admin-driver-assignment-display`.",
  "Driver availability/deactivation is typed through `/api/admin-driver-availability`.",
  "Full driver profile save/delete runtime remains parked.",
  "`loadDrivers`, `saveDriverProfile`, and `deleteDriverProfile` still use the legacy `drivers` shim path for full profile surfaces.",
  "Disabled full driver profile action setup, audit payload setup, and no-live guard already exist.",
  "Future runtime lane must exclude `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, `airport_permit_notes`, internal/admin notes, payment/PDF/billing, provider/send, auth, location/photo/calendar, debug, and secrets unless separately approved.",
  "Future DB write/delete requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write/delete execution.",
  "Future runtime wiring must not change Save Booking + CRM.",
  "Future runtime wiring must not change `/api/admin-saved-bookings`.",
  "Future runtime wiring must not change parser behavior or `/api/ai-parse`.",
  "Future runtime wiring must not add UI sectors/buttons/cards.",
  "Future runtime wiring must not add new shims.",
  "Required tests before any future wiring:",
  "Rollback note:",
  "No runtime implementation, UI/API/helper behavior change, env change, deployment, DB write/delete, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, risky activation, UI sector/button/card, or new shim is approved by this packet.",
]) {
  assertIncludes(packetSection, phrase, `Full driver profile runtime approval packet phrase: ${phrase}`);
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation approved",
  "safe to wire now",
  "DB write approved",
  "DB delete approved",
  "live write approved",
  "live delete approved",
  "payout_preferences approved",
  "driver_payout_rules approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(packetSection, forbiddenApprovalPhrase, `Forbidden approval phrase ${forbiddenApprovalPhrase}`);
}

assertIncludes(
  assignmentDisplayHelper,
  'const driverAssignmentDisplaySelect =\n  "id, driver_name, contact_number, vehicle_type, plate_number, availability_status";',
  "Typed driver assignment display select",
);
assertIncludes(assignmentDisplayRoute, "export async function GET", "Typed driver assignment display GET route");
assertExcludes(
  assignmentDisplayRoute,
  /export async function (POST|PUT|PATCH|DELETE)/,
  "Typed driver assignment display route writes",
);

assertIncludes(availabilityHelper, "const adminDriverAvailabilitySelect = \"id, availability_status, updated_at\";", "Typed driver availability select");
assertIncludes(availabilityHelper, "availability_status: availabilityStatus", "Typed driver availability status update");
assertExcludes(
  availabilityHelper,
  /payout_preferences|driver_payout_rules|preferred_areas|airport_permit_notes|customer_rates/i,
  "Typed driver availability helper forbidden full profile fields",
);

for (const fragment of [
  "export async function PATCH",
  "Admin driver availability request is outside the allowed contract.",
]) {
  assertIncludes(availabilityRoute, fragment, `Typed driver availability route fragment: ${fragment}`);
}

const loadDriversSource = sliceBetween(
  appPage,
  "async function loadDrivers",
  "async function fetchDriverAssignmentDisplayDriverRecords",
);
const saveDriverProfileSource = sliceBetween(
  appPage,
  "async function saveDriverProfile()",
  "async function deactivateDriverProfile",
);
const deleteDriverProfileSource = sliceBetween(
  appPage,
  "async function deleteDriverProfile",
  "async function saveBooking",
);

assertIncludes(loadDriversSource, ".from(adminLegacyTables.drivers)", "Parked full driver profile load");
assertIncludes(saveDriverProfileSource, ".from(adminLegacyTables.drivers)", "Parked full driver profile save");
assertIncludes(deleteDriverProfileSource, ".from(adminLegacyTables.drivers).delete()", "Parked full driver profile delete");

for (const fragment of [
  "payout_preferences",
  "driver_payout_rules",
  "notes",
  "preferred_areas",
  "airport_permit_notes",
]) {
  assertIncludes(loadDriversSource, fragment, `Parked full driver profile load field ${fragment}`);
  assertIncludes(saveDriverProfileSource, fragment, `Parked full driver profile save field ${fragment}`);
}

const saveBookingSource = sliceBetween(
  appPage,
  "async function saveBooking()",
  "async function loadBookings",
);
assertIncludes(saveBookingSource, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint");
assertExcludes(saveBookingSource, "/api/admin-saved-bookings", "Save Booking + CRM saved bookings separation");

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["AI parse route", aiParseRoute],
  ["admin saved bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, actionSetupApiName, `${label} disabled full driver action setup wiring`);
  assertExcludes(source, auditSetupApiName, `${label} full driver audit setup wiring`);
  assertExcludes(source, actionHelperExportName, `${label} disabled full driver action helper wiring`);
  assertExcludes(source, auditHelperExportName, `${label} full driver audit helper wiring`);
}

for (const fragment of [
  "drivers: new Set",
  '"payout_preferences"',
  '"driver_payout_rules"',
  '"notes"',
  '"preferred_areas"',
  '"airport_permit_notes"',
]) {
  assertIncludes(legacyRoute, fragment, `Legacy driver full profile route fragment: ${fragment}`);
}

for (const [label, source] of [
  ["Disabled full driver action route", disabledActionRoute],
  ["Full driver audit route", auditPayloadRoute],
]) {
  assertIncludes(source, "export async function GET", `${label} GET-only setup`);
  assertExcludes(source, "export async function POST", label);
  assertExcludes(source, "export async function PATCH", label);
  assertExcludes(source, "export async function DELETE", label);
  assertExcludes(source, liveWritePattern, `${label} live write/delete path`);
}

for (const [label, source] of [
  ["Disabled full driver action helper", disabledActionHelper],
  ["Full driver audit helper", auditPayloadHelper],
]) {
  assertIncludes(source, "server-only", label);
  assertIncludes(source, "writeEnabled: false", `${label} write disabled`);
  assertIncludes(source, "liveWriteEnabled: false", `${label} live write disabled`);
  assertIncludes(source, "no_op: true", `${label} no-op`);
  assertExcludes(source, liveWritePattern, `${label} live write/delete path`);
}

for (const fragment of [
  "payout_preferences",
  "driver_payout_rules",
  "pricing",
  "payout",
  "notes",
  "preferred_areas",
  "airport_permit_notes",
  "internal_admin_notes",
  "payment",
  "pdf",
  "billing",
  "provider",
  "auth",
  "location",
  "photo",
  "calendar",
  "debug",
]) {
  assertIncludes(disabledActionHelper, `"${fragment}"`, `Disabled action forbidden field ${fragment}`);
}

for (const entry of [
  "scripts/test-full-driver-profile-runtime-approval-packet.mjs",
  "scripts/test-admin-full-driver-profile-no-live-guard.mjs",
  "scripts/test-full-driver-profile-split-readiness-lock.mjs",
  "scripts/test-admin-full-driver-profile-action-disabled-setup-api-contract.mjs",
  "scripts/test-admin-full-driver-profile-action-audit-payload-setup-api-contract.mjs",
]) {
  assertIncludes(preactivationSuite, entry, `Preactivation suite entry ${entry}`);
}

console.log("full driver profile runtime approval packet guard passed");
