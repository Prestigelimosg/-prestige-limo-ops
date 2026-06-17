import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const fullDriverRuntimeHelperPath = "lib/admin-full-driver-profile-runtime-write-action.ts";
const fullDriverRuntimeRoutePath =
  "app/api/admin-full-driver-profile-runtime-write-action/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const routePathFragment = "/api/admin-full-driver-profile-runtime-write-action";
const guardScript = "scripts/test-full-driver-profile-runtime-app-wiring.mjs";
const forbiddenRuntimePayloadPattern =
  /payout_preferences|driver_payout_rules|customer_rates|customer_rate|customer_price|pricing|price|payout|payment|billing|invoice|pdf|provider|send_state|send_log|auth|location|photo|calendar|internal|admin_notes|notes|preferred_areas|airport_permit_notes|parser_debug|debug|secret|api_key|access_token|raw_token|paynow|pay_now|mock_archive|mock_qa/i;

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

function assertBefore(source, earlier, later, label) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);

  assert.notEqual(earlierIndex, -1, `${label} missing earlier marker: ${earlier}`);
  assert.notEqual(laterIndex, -1, `${label} missing later marker: ${later}`);
  assert.ok(earlierIndex < laterIndex, `${label} must keep ${earlier} before ${later}.`);
}

const [
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  fullDriverRuntimeHelper,
  fullDriverRuntimeRoute,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(fullDriverRuntimeHelperPath, "utf8"),
  readFile(fullDriverRuntimeRoutePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Full Driver Profile Runtime App Wiring Lock");
for (const phrase of [
  "Driver Database save/delete now calls the gated full driver profile runtime write boundary first.",
  "The route remains closed by default through `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.",
  "Closed-gate/no-op responses fall back to the existing legacy `drivers` shim path to preserve current behavior.",
  "When the typed full driver profile boundary reports `saved` or `deleted`, the legacy follow-up is skipped.",
  "The runtime payload includes safe operational driver fields only: `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`.",
  "The delete runtime payload includes only a safe driver id plus action type.",
  "Payout preferences, driver payout rules, notes, preferred areas, airport permit notes, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, PayNow, and mock/archive fields remain outside the typed runtime payload.",
  "Existing legacy fallback still contains the parked full-profile fields while the gate is closed.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No UI sector/card, env change, deployment, live DB write/delete execution, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Full driver profile runtime app wiring ledger phrase: ${phrase}`);
}

assertIncludes(appPage, "const adminFullDriverProfileRuntimeWriteActionApiPath", "Full driver runtime route constant");
assertIncludes(appPage, routePathFragment, "Full driver runtime route path");
assertIncludes(appPage, "type FullDriverProfileRuntimeSavePayload", "Full driver runtime save payload type");
assertIncludes(appPage, "type FullDriverProfileRuntimeDeletePayload", "Full driver runtime delete payload type");
assertIncludes(appPage, "type FullDriverProfileRuntimeWriteResponse", "Full driver runtime response type");
assertIncludes(appPage, "async function saveFullDriverProfileRuntime", "Full driver runtime client helper");
assertIncludes(appPage, "isFullDriverProfileRuntimeWriteBlockedNoOp", "Full driver closed-gate fallback helper");
assertIncludes(appPage, "\"x-prestige-admin-purpose\": adminLegacyDataPurpose", "Full driver runtime admin purpose header");

const fullDriverRuntimeClientHelper = sliceBetween(
  appPage,
  "function fullDriverProfileRuntimeRejectedFields",
  "function buildCompanyRateOverridePayload",
);
assertIncludes(
  fullDriverRuntimeClientHelper,
  "fetch(adminFullDriverProfileRuntimeWriteActionApiPath",
  "Full driver runtime fetch",
);
assertIncludes(fullDriverRuntimeClientHelper, "\"write_gate_closed\"", "Full driver runtime closed-gate fallback");
assertIncludes(fullDriverRuntimeClientHelper, "fullDriverProfileRuntimeWriteSaved", "Full driver runtime saved detection");
assertIncludes(fullDriverRuntimeClientHelper, "fullDriverProfileRuntimeWriteDeleted", "Full driver runtime deleted detection");
assertExcludes(
  fullDriverRuntimeClientHelper,
  forbiddenRuntimePayloadPattern,
  "Full driver runtime client helper",
);

const fullDriverRuntimeSavePayload = sliceBetween(
  appPage,
  "function buildFullDriverProfileRuntimeSavePayload",
  "function buildFullDriverProfileRuntimeDeletePayload",
);
const fullDriverRuntimeDeletePayload = sliceBetween(
  appPage,
  "function buildFullDriverProfileRuntimeDeletePayload",
  "async function saveFullDriverProfileRuntime",
);

for (const fragment of [
  "action_type: \"full_driver_profile_save\"",
  "availability_status",
  "contact_number",
  "driver_name",
  "plate_number",
  "vehicle_type",
]) {
  assertIncludes(fullDriverRuntimeSavePayload, fragment, `Full driver runtime save payload ${fragment}`);
}
assertExcludes(fullDriverRuntimeSavePayload, forbiddenRuntimePayloadPattern, "Full driver runtime save payload");
assertIncludes(fullDriverRuntimeDeletePayload, "action_type: \"full_driver_profile_delete\"", "Full driver runtime delete action");
assertIncludes(fullDriverRuntimeDeletePayload, "id", "Full driver runtime delete id");
assertExcludes(fullDriverRuntimeDeletePayload, forbiddenRuntimePayloadPattern, "Full driver runtime delete payload");

const saveDriverProfile = sliceBetween(
  appPage,
  "async function saveDriverProfile()",
  "async function deactivateDriverProfile",
);
assertIncludes(saveDriverProfile, "saveFullDriverProfileRuntime", "Driver profile save runtime call");
assertIncludes(saveDriverProfile, "buildFullDriverProfileRuntimeSavePayload", "Driver profile save runtime payload");
assertIncludes(saveDriverProfile, "if (!fullDriverProfileRuntime.saved)", "Driver profile save legacy fallback gate");
assertBefore(
  saveDriverProfile,
  "const fullDriverProfileRuntime",
  "const result = existingDriverId",
  "Driver profile save runtime before legacy fallback",
);
assertIncludes(saveDriverProfile, "payout_preferences", "Driver profile save parked payout preferences fallback");
assertIncludes(saveDriverProfile, "driver_payout_rules", "Driver profile save parked payout rules fallback");
assertIncludes(saveDriverProfile, "preferred_areas", "Driver profile save parked preferred areas fallback");
assertIncludes(saveDriverProfile, "airport_permit_notes", "Driver profile save parked airport permit notes fallback");

const deleteDriverProfile = sliceBetween(
  appPage,
  "async function deleteDriverProfile",
  "async function saveBooking",
);
assertIncludes(deleteDriverProfile, "saveFullDriverProfileRuntime", "Driver profile delete runtime call");
assertIncludes(deleteDriverProfile, "buildFullDriverProfileRuntimeDeletePayload", "Driver profile delete runtime payload");
assertIncludes(deleteDriverProfile, "if (!fullDriverProfileRuntime.deleted)", "Driver profile delete legacy fallback gate");
assertBefore(
  deleteDriverProfile,
  "const fullDriverProfileRuntimePayload",
  "const result = await adminLegacyDataClient.from(adminLegacyTables.drivers).delete()",
  "Driver profile delete runtime before legacy fallback",
);

const fullDriverRuntimeWritePayload = sliceBetween(
  fullDriverRuntimeHelper,
  "function writePayload",
  "function toRuntimeRecord",
);
assertIncludes(fullDriverRuntimeWritePayload, "driver_name", "Full driver server write payload driver name");
assertIncludes(fullDriverRuntimeWritePayload, "contact_number", "Full driver server write payload contact number");
assertIncludes(fullDriverRuntimeWritePayload, "vehicle_type", "Full driver server write payload vehicle type");
assertIncludes(fullDriverRuntimeWritePayload, "plate_number", "Full driver server write payload plate number");
assertIncludes(fullDriverRuntimeWritePayload, "availability_status", "Full driver server write payload availability status");
assertExcludes(fullDriverRuntimeWritePayload, forbiddenRuntimePayloadPattern, "Full driver server write payload");
assertIncludes(fullDriverRuntimeRoute, "executeAdminFullDriverProfileRuntimeWriteAction", "Full driver runtime route executor");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM full driver runtime separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, routePathFragment, "Parser route full driver runtime separation");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings full driver runtime separation");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings full driver runtime separation");
assertIncludes(preactivationSuite, guardScript, "Preactivation full driver runtime app wiring guard registration");

console.log("full driver profile runtime app wiring guard passed");
