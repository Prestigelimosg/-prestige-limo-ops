import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const assignmentDisplayHelperPath = "lib/admin-driver-assignment-display.ts";
const assignmentDisplayRoutePath = "app/api/admin-driver-assignment-display/route.ts";
const availabilityHelperPath = "lib/admin-driver-availability.ts";
const availabilityRoutePath = "app/api/admin-driver-availability/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

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

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);

  assert.notEqual(start, -1, `Missing source start: ${startNeedle}`);

  const end = source.indexOf(endNeedle, start + startNeedle.length);

  assert.notEqual(end, -1, `Missing source end: ${endNeedle}`);

  return source.slice(start, end);
}

const [
  ledger,
  appPage,
  legacyRoute,
  assignmentDisplayHelper,
  assignmentDisplayRoute,
  availabilityHelper,
  availabilityRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
  readFile(assignmentDisplayHelperPath, "utf8"),
  readFile(assignmentDisplayRoutePath, "utf8"),
  readFile(availabilityHelperPath, "utf8"),
  readFile(availabilityRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const lockSection = sectionBetween(
  ledger,
  "### Full Driver Profile Save/Delete Split Readiness Lock",
);

for (const phrase of [
  "Full driver profile save/delete split readiness is locked by `scripts/test-full-driver-profile-split-readiness-lock.mjs`.",
  "Remaining legacy driver shim call sites are `loadDrivers`, `saveDriverProfile`, and `deleteDriverProfile`.",
  "Full driver profile legacy path still exposes `GET`, `POST`, `PATCH`, and `DELETE` through the admin legacy data route.",
  "Loaded/saved legacy driver fields include `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, `availability_status`, `payout_preferences`, `driver_payout_rules`, `notes`, `preferred_areas`, and `airport_permit_notes`.",
  "Safe driver display/read is already typed through `GET /api/admin-driver-assignment-display`.",
  "Driver availability/deactivation is already typed through `/api/admin-driver-availability`.",
  "Full driver profile save/delete remains parked.",
  "Future safe shape must be disabled/no-write first.",
  "Allowed future safe fields only: `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`.",
  "Forbidden fields remain parked: `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, `preferred_areas`, `airport_permit_notes`, internal/admin notes, payment, PDF, billing, provider/send, auth, location, photo, calendar, and debug.",
  "No runtime implementation is approved by this lock.",
]) {
  assertIncludes(lockSection, phrase, `Full driver profile split readiness phrase: ${phrase}`);
}

const loadDriversBlock = sliceBetween(
  appPage,
  "async function loadDrivers",
  "async function fetchDriverAssignmentDisplayDriverRecords",
);
const saveDriverProfileBlock = sliceBetween(
  appPage,
  "async function saveDriverProfile",
  "async function deactivateDriverProfile",
);
const deleteDriverProfileBlock = sliceBetween(
  appPage,
  "async function deleteDriverProfile",
  "async function saveBooking",
);

assertIncludes(loadDriversBlock, ".from(adminLegacyTables.drivers)", "Parked full profile load");
assertIncludes(
  loadDriversBlock,
  '.select("id, driver_name, contact_number, vehicle_type, plate_number, payout_preferences, driver_payout_rules, availability_status, notes, preferred_areas, airport_permit_notes")',
  "Parked full profile load field list",
);
assertIncludes(saveDriverProfileBlock, ".from(adminLegacyTables.drivers)", "Parked full profile save");
assertIncludes(saveDriverProfileBlock, "payout_preferences: clean(driverProfileDraft.payoutPreferences) || null", "Parked payout preferences save");
assertIncludes(saveDriverProfileBlock, "driver_payout_rules: driverProfileDraft.payoutRules", "Parked payout rules save");
assertIncludes(saveDriverProfileBlock, "notes: clean(driverProfileDraft.notes) || null", "Parked notes save");
assertIncludes(saveDriverProfileBlock, "preferred_areas: clean(driverProfileDraft.preferredAreas) || null", "Parked preferred areas save");
assertIncludes(saveDriverProfileBlock, "airport_permit_notes: clean(driverProfileDraft.airportPermitNotes) || null", "Parked airport permit notes save");
assertIncludes(deleteDriverProfileBlock, ".from(adminLegacyTables.drivers).delete()", "Parked full profile delete");

for (const fragment of [
  "drivers: new Set",
  '"driver_name"',
  '"contact_number"',
  '"vehicle_type"',
  '"plate_number"',
  '"availability_status"',
  '"payout_preferences"',
  '"driver_payout_rules"',
  '"notes"',
  '"preferred_areas"',
  '"airport_permit_notes"',
  "export async function GET",
  "export async function POST",
  "export async function PATCH",
  "export async function DELETE",
]) {
  assertIncludes(legacyRoute, fragment, `Legacy full driver profile surface ${fragment}`);
}

assertIncludes(
  assignmentDisplayHelper,
  'const driverAssignmentDisplaySelect =\n  "id, driver_name, contact_number, vehicle_type, plate_number, availability_status";',
  "Typed driver assignment display select",
);
assertExcludes(
  assignmentDisplayHelper,
  /\.update\s*\(|\.insert\s*\(|\.upsert\s*\(|\.delete\s*\(/,
  "Typed driver assignment display helper",
);
assertIncludes(assignmentDisplayRoute, "export async function GET", "Typed driver assignment display route");
assertExcludes(
  assignmentDisplayRoute,
  /export async function (POST|PUT|PATCH|DELETE)/,
  "Typed driver assignment display route",
);

assertIncludes(availabilityHelper, "const adminDriverAvailabilitySelect = \"id, availability_status, updated_at\";", "Typed driver availability select");
assertIncludes(availabilityHelper, '.from("drivers")', "Typed driver availability target");
assertIncludes(availabilityHelper, ".update({", "Typed driver availability narrow update");
assertIncludes(availabilityHelper, "availability_status: availabilityStatus", "Typed driver availability status update");
assertExcludes(
  availabilityHelper,
  /payout_preferences|driver_payout_rules|preferred_areas|airport_permit_notes|customer_rates/i,
  "Typed driver availability helper",
);
assertIncludes(availabilityRoute, "export async function PATCH", "Typed driver availability route");
assertIncludes(availabilityRoute, "export async function GET", "Typed driver availability route blocked GET");
assertIncludes(availabilityRoute, "export async function POST", "Typed driver availability route blocked POST");
assertIncludes(availabilityRoute, "export async function PUT", "Typed driver availability route blocked PUT");
assertIncludes(availabilityRoute, "export async function DELETE", "Typed driver availability route blocked DELETE");
assertIncludes(
  availabilityRoute,
  "Admin driver availability request is outside the allowed contract.",
  "Typed driver availability non-PATCH blocked contract",
);

assertIncludes(
  preactivationSuite,
  "scripts/test-full-driver-profile-split-readiness-lock.mjs",
  "Preactivation suite full driver profile split readiness guard entry",
);

console.log("full driver profile split readiness lock guard passed");
