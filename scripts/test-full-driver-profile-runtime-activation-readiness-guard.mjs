import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const routePath = "app/api/admin-full-driver-profile-runtime-write-action/route.ts";
const helperPath = "lib/admin-full-driver-profile-runtime-write-action.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-full-driver-profile-runtime-activation-readiness-guard.mjs";
const routePathFragment = "/api/admin-full-driver-profile-runtime-write-action";
const gateEnvName = "PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED";
const allowedSafeFields = [
  "availability_status",
  "contact_number",
  "driver_name",
  "plate_number",
  "vehicle_type",
];
const allowedRecordIdentityFields = ["id"];
const forbiddenActivationFields = [
  "payout_preferences",
  "driver_payout_rules",
  "driver_payout",
  "customer_rate",
  "customer_price",
  "customer_rates",
  "pricing",
  "price",
  "payout",
  "payment",
  "billing",
  "invoice",
  "pdf",
  "provider",
  "send_state",
  "send_log",
  "auth",
  "location",
  "live_location",
  "photo",
  "calendar",
  "internal",
  "admin_notes",
  "notes",
  "preferred_areas",
  "airport_permit_notes",
  "parser_debug",
  "debug",
  "secret",
  "api_key",
  "access_token",
  "raw_token",
  "updated_at",
  "paynow",
  "pay_now",
  "mock_archive",
  "mock_qa",
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

function sliceFrom(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);

  return source.slice(start);
}

function assertBefore(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  assert.notEqual(firstIndex, -1, `${label} missing first marker: ${first}`);
  assert.notEqual(secondIndex, -1, `${label} missing second marker: ${second}`);
  assert.ok(firstIndex < secondIndex, `${label} expected ${first} before ${second}.`);
}

const [
  ledger,
  routeSource,
  helperSource,
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Full Driver Profile Runtime Activation Readiness Guard Lock",
);

for (const phrase of [
  "Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.",
  "This is a docs/test-only activation-readiness guard for `POST /api/admin-full-driver-profile-runtime-write-action`.",
  "The full driver profile runtime boundary is already wired but remains closed by default through `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`.",
  "Allowed full driver profile activation scope remains limited to existing driver `id`, action types `full_driver_profile_save` and `full_driver_profile_delete`, and safe operational fields only: `driver_name`, `contact_number`, `vehicle_type`, `plate_number`, and `availability_status`.",
  "Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.drivers` table/policy proof for the safe operational columns only, server-session admin/dispatcher proof, rollback/kill-switch proof, customer/driver finance and internal-field visibility proof, and one bounded evidence window.",
  "Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.",
  "Future table/policy proof must verify access for `public.drivers` safe operational columns only and must not include `payout_preferences`, `driver_payout_rules`, customer pricing, `customer_rates`, PayNow payout details, payout preferences, notes, preferred areas, airport permit notes, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, or mock QA/dev archive fields.",
  "Future rollback/kill-switch proof must close `PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy fallback/manual recovery plan intact.",
  "Any future write/delete attempt, if separately approved, must be one bounded driver save/update/delete through the existing route only.",
  "Required tests before any future activation:",
  "No env change, deployment, DB read/write/delete execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, `payout_preferences`, `driver_payout_rules`, pricing, payout, notes, preferred areas, airport permit notes, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, PayNow, or mock QA/dev archive change is approved by this lock.",
  "This lock adds `scripts/test-full-driver-profile-runtime-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Full driver profile activation readiness phrase: ${phrase}`);
}

for (const command of [
  "node scripts/test-full-driver-profile-runtime-activation-readiness-guard.mjs",
  "node scripts/test-full-driver-profile-runtime-write-action-api-contract.mjs",
  "node scripts/test-full-driver-profile-runtime-app-wiring.mjs",
  "node scripts/test-full-driver-profile-runtime-approval-packet.mjs",
  "node scripts/test-admin-full-driver-profile-no-live-guard.mjs",
  "node scripts/test-full-driver-profile-split-readiness-lock.mjs",
  "node scripts/test-admin-full-driver-profile-action-disabled-setup-api-contract.mjs",
  "node scripts/test-admin-full-driver-profile-action-audit-payload-setup-api-contract.mjs",
  "node scripts/test-payout-approval-packet.mjs",
  "node scripts/test-payout-runtime-split-guard.mjs",
  "node scripts/test-remaining-shim-parked-state-lock.mjs",
  "node scripts/test-shim-cleanup-no-new-shim-guard.mjs",
  "node scripts/test-preactivation-verification-suite.mjs",
  "npm run lint",
  "git diff --check",
  "git diff --cached --check",
  "git status --short",
]) {
  assertIncludes(ledgerSection, command, `Required activation readiness test ${command}`);
}

for (const forbiddenApprovalPhrase of [
  "activation approved",
  "approved to open",
  "safe to open",
  "gate opened",
  "write gate opened",
  "write enabled now",
  "DB write approved",
  "DB delete approved",
  "live write approved",
  "live delete approved",
  "production approved",
  "deployment approved",
  "migration approved",
  "payout_preferences approved",
  "driver_payout_rules approved",
  "payout approved",
  "payment approved",
  "billing approved",
  "PayNow approved",
]) {
  assertExcludes(
    ledgerSection,
    forbiddenApprovalPhrase,
    `Forbidden full driver profile activation approval phrase ${forbiddenApprovalPhrase}`,
  );
}

assertIncludes(routeSource, "export const dynamic = \"force-dynamic\";", "Full driver profile route dynamic mode");
assertIncludes(routeSource, "export async function POST", "Full driver profile route POST");
for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(routeSource, `export async function ${method}`, `Full driver profile route ${method}`);
}
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Full driver profile route admin boundary");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "Full driver profile route actor adapter");
assertIncludes(routeSource, "executeAdminFullDriverProfileRuntimeWriteAction", "Full driver profile route helper");
const routePostBlock = sliceFrom(routeSource, "export async function POST");
assertBefore(
  routePostBlock,
  "const boundary = requireAdminDispatcherBoundary(request);",
  "executeAdminFullDriverProfileRuntimeWriteAction",
  "Full driver profile route must validate admin/dispatcher boundary before helper execution",
);

assertIncludes(helperSource, "server-only", "Full driver profile helper server-only boundary");
assertIncludes(helperSource, gateEnvName, "Full driver profile runtime env gate name");
assertIncludes(helperSource, "const allowedActorRoles = new Set([\"admin\", \"dispatcher\"]);", "Full driver profile allowed actor roles");
assertIncludes(helperSource, "const allowedAvailabilityStatuses = new Set([\"available\", \"busy\", \"inactive\", \"off\"]);", "Full driver profile allowed availability statuses");
assertIncludes(
  helperSource,
  "const fullDriverProfileWriteSelect =\n  \"id, driver_name, contact_number, vehicle_type, plate_number, availability_status\";",
  "Full driver profile safe select",
);
assertIncludes(helperSource, "writeGateOpen()", "Full driver profile runtime gate helper");
assertIncludes(helperSource, "validateActor(actor)", "Full driver profile runtime actor guard");
assertIncludes(helperSource, "boundary_mode === \"server-session-role-surface\"", "Full driver profile server-session boundary");
assertIncludes(helperSource, "allowedActorRoles.has(actor.actor_role)", "Full driver profile admin/dispatcher roles");
assertIncludes(helperSource, "source_surface === \"admin_api\"", "Full driver profile admin API surface");
assertIncludes(helperSource, "database_client_enabled: false", "Full driver profile default no DB client");
assertIncludes(helperSource, "blockedResult(base, \"write_gate_closed\")", "Full driver profile closed gate reason");
assertIncludes(helperSource, "no_op: true", "Full driver profile no-op default");
assertIncludes(helperSource, ".from(\"drivers\")", "Full driver profile drivers table access");
assertIncludes(helperSource, ".insert(payload)", "Full driver profile insert path");
assertIncludes(helperSource, ".update(payload)", "Full driver profile update path");
assertIncludes(helperSource, ".delete()", "Full driver profile delete path");
assertIncludes(helperSource, ".eq(\"id\", id)", "Full driver profile id-scoped update/delete");
assertIncludes(helperSource, ".select(fullDriverProfileWriteSelect)", "Full driver profile safe select call");
assertExcludes(helperSource, "adminLegacyDataClient", "Full driver profile helper legacy data client");
assertExcludes(helperSource, "adminLegacyTables", "Full driver profile helper legacy table shim");
assertExcludes(helperSource, "/api/admin-legacy-data", "Full driver profile helper legacy route");

const executeBlock = sliceFrom(
  helperSource,
  "export async function executeAdminFullDriverProfileRuntimeWriteAction",
);
assertBefore(executeBlock, "if (!writeGateOpen())", "if (!validateActor(actor))", "Full driver profile gate before actor check");
assertBefore(executeBlock, "if (!validateActor(actor))", "const clientResult = getRuntimeClient(options)", "Full driver profile actor before DB client");
assertBefore(executeBlock, "const clientResult = getRuntimeClient(options)", "await saveRuntimeRecord", "Full driver profile DB client before save");
assertBefore(executeBlock, "const clientResult = getRuntimeClient(options)", "await deleteRuntimeRecord", "Full driver profile DB client before delete");

const writePayload = sliceBetween(helperSource, "function writePayload", "function toRuntimeRecord");
for (const field of [
  "availability_status",
  "contact_number",
  "driver_name",
  "plate_number",
  "vehicle_type",
]) {
  assertIncludes(writePayload, field, `Full driver profile write payload field ${field}`);
}
assertIncludes(
  writePayload,
  'for (const excludedField of ["updated_at"])',
  "Full driver profile write payload strips updated_at metadata",
);
assertIncludes(
  writePayload,
  "delete (payload as Record<string, unknown>)[excludedField];",
  "Full driver profile write payload deletes excluded metadata before return",
);
assertExcludes(
  writePayload,
  /updated_at:\s*(new Date|fields\.|payload\.|safeText|source\.)/,
  "Full driver profile write payload app-written updated_at",
);
for (const forbiddenField of forbiddenActivationFields.filter((field) => field !== "updated_at")) {
  assertExcludes(writePayload, forbiddenField, `Full driver profile write payload forbidden field ${forbiddenField}`);
}

const selectLine = helperSource.match(/const fullDriverProfileWriteSelect =\n\s+"([^"]+)";/)?.[1] || "";
for (const field of [...allowedRecordIdentityFields, ...allowedSafeFields]) {
  assertIncludes(selectLine, field, `Full driver profile select field ${field}`);
}
for (const forbiddenField of forbiddenActivationFields) {
  assertExcludes(selectLine, forbiddenField, `Full driver profile select forbidden field ${forbiddenField}`);
}

for (const forbiddenField of [
  "payout_preferences",
  "driver_payout_rules",
  "preferred_areas",
  "airport_permit_notes",
  "notes",
  "updated_at",
  "paynow",
  "mock_archive",
  "mock_qa",
]) {
  assertIncludes(helperSource, forbiddenField, `Full driver profile forbidden field rejection ${forbiddenField}`);
}

const fullDriverRuntimeClientHelper = sliceBetween(
  appPage,
  "function fullDriverProfileRuntimeRejectedFields",
  "function buildCompanyRateOverridePayload",
);
assertIncludes(appPage, `const adminFullDriverProfileRuntimeWriteActionApiPath =\n  "${routePathFragment}";`, "app route path constant");
assertIncludes(fullDriverRuntimeClientHelper, "fetch(adminFullDriverProfileRuntimeWriteActionApiPath", "app full driver runtime fetch");
assertIncludes(fullDriverRuntimeClientHelper, "payload: FullDriverProfileRuntimeWritePayload", "app full driver runtime payload type");
assertIncludes(fullDriverRuntimeClientHelper, 'method: "POST"', "app full driver runtime POST");
assertIncludes(fullDriverRuntimeClientHelper, '"x-prestige-admin-purpose": adminLegacyDataPurpose', "app full driver runtime admin purpose");
assertIncludes(fullDriverRuntimeClientHelper, "isFullDriverProfileRuntimeWriteBlockedNoOp", "app full driver closed-gate no-op");
assertExcludes(
  fullDriverRuntimeClientHelper,
  /payout_preferences|driver_payout_rules|customer_rates|customer_rate|customer_price|pricing|price|payout|payment|billing|invoice|pdf|provider|send_state|send_log|auth|location|photo|calendar|internal|admin_notes|notes|preferred_areas|airport_permit_notes|parser_debug|debug|secret|api_key|access_token|raw_token|paynow|pay_now|mock_archive|mock_qa/i,
  "app full driver runtime forbidden payload/API fields",
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
assertIncludes(fullDriverRuntimeDeletePayload, "action_type: \"full_driver_profile_delete\"", "Full driver runtime delete action");
assertIncludes(fullDriverRuntimeDeletePayload, "id", "Full driver runtime delete id");

const saveDriverProfile = sliceBetween(appPage, "async function saveDriverProfile()", "async function deactivateDriverProfile");
const deleteDriverProfile = sliceBetween(appPage, "async function deleteDriverProfile", "async function saveBooking");
assertBefore(saveDriverProfile, "const fullDriverProfileRuntime", "const result = existingDriverId", "Full driver runtime save before legacy fallback");
assertBefore(deleteDriverProfile, "const fullDriverProfileRuntimePayload", "const result = await adminLegacyDataClient.from(adminLegacyTables.drivers).delete()", "Full driver runtime delete before legacy fallback");
assertIncludes(saveDriverProfile, ".from(adminLegacyTables.drivers)", "Full driver profile save legacy fallback remains");
assertIncludes(deleteDriverProfile, ".from(adminLegacyTables.drivers).delete()", "Full driver profile delete legacy fallback remains");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint remains unchanged");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM full driver runtime route separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, routePathFragment, "Parser route full driver runtime separation");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings full driver runtime separation");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings full driver runtime separation");
assertIncludes(preactivationSuite, guardScript, "Preactivation suite activation readiness guard registration");

console.log("full driver profile runtime activation readiness guard passed");
