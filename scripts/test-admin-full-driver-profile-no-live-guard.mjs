import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const actionRoutePath = "app/api/admin-full-driver-profile-action-disabled-setup/route.ts";
const actionHelperPath = "lib/admin-full-driver-profile-action-disabled-setup.ts";
const auditRoutePath = "app/api/admin-full-driver-profile-action-audit-payload-setup/route.ts";
const auditHelperPath = "lib/admin-full-driver-profile-action-audit-payload-setup.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const actionSetupApiName = "admin-full-driver-profile-action-disabled-setup";
const auditSetupApiName = "admin-full-driver-profile-action-audit-payload-setup";
const actionHelperExportName = "buildAdminFullDriverProfileActionDisabledSetup";
const auditHelperExportName = "buildAdminFullDriverProfileActionAuditPayloadSetup";

const routeLivePattern =
  /export async function (POST|PUT|PATCH|DELETE)|@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const helperLivePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const forbiddenOutputPattern =
  /payout_preferences|driver_payout_rules|customer_rates|customer_price|driver_payout|pricing|payout|paynow|pay_now|payment|billing|invoice|pdf|finance|internal_admin|admin_notes|preferred_areas|airport_permit_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;

const safeFields = [
  "driver_name",
  "contact_number",
  "vehicle_type",
  "plate_number",
  "availability_status",
];
const forbiddenFields = [
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
  "send",
  "auth",
  "location",
  "photo",
  "calendar",
  "debug",
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

function assertGetOnlySetupRoute(source, label) {
  assertIncludes(source, "export async function GET", `${label} GET handler`);
  assertIncludes(source, "resolveAdminDispatcherBoundary", `${label} admin boundary`);
  assertIncludes(source, "adminBookingPersistencePurpose", `${label} purpose boundary`);
  assertIncludes(source, "writeEnabled: false", `${label} write disabled`);
  assertIncludes(source, "liveWriteEnabled: false", `${label} live write disabled`);
  assertIncludes(source, "no_op: true", `${label} no-op`);
  assertExcludes(source, routeLivePattern, label);
}

function assertDisabledHelper(source, label) {
  assertIncludes(source, "server-only", `${label} server-only helper`);
  assertIncludes(source, "writeEnabled: false", `${label} write disabled`);
  assertIncludes(source, "liveWriteEnabled: false", `${label} live write disabled`);
  assertIncludes(source, "external_send: false", `${label} external send disabled`);
  assertIncludes(source, "no_op: true", `${label} no-op`);
  assertExcludes(source, helperLivePattern, label);
}

function sectionBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);

  return source.slice(startIndex, endIndex);
}

const [
  actionRoute,
  actionHelper,
  auditRoute,
  auditHelper,
  appPage,
  aiParseRoute,
  adminSavedBookingsRoute,
  legacyRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(actionRoutePath, "utf8"),
  readFile(actionHelperPath, "utf8"),
  readFile(auditRoutePath, "utf8"),
  readFile(auditHelperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertGetOnlySetupRoute(actionRoute, "Full driver profile disabled action route");
assertIncludes(actionRoute, actionHelperExportName, "Full driver profile disabled action route");
assertGetOnlySetupRoute(auditRoute, "Full driver profile audit payload route");
assertIncludes(auditRoute, auditHelperExportName, "Full driver profile audit payload route");

assertDisabledHelper(actionHelper, "Full driver profile disabled action helper");
assertIncludes(actionHelper, "admin_full_driver_profile_action_disabled_setup_only", "Disabled action delivery surface");
assertIncludes(actionHelper, "setup_only_disabled", "Disabled action setup-only reason");
assertIncludes(actionHelper, "unsafe_or_unknown_fields", "Disabled action unsafe rejection reason");

for (const safeField of safeFields) {
  assertIncludes(actionHelper, `"${safeField}"`, `Allowed full driver profile field ${safeField}`);
}

for (const forbiddenField of forbiddenFields) {
  assertIncludes(actionHelper, `"${forbiddenField}"`, `Forbidden full driver profile field ${forbiddenField}`);
}

assertDisabledHelper(auditHelper, "Full driver profile audit payload helper");
assertIncludes(
  auditHelper,
  "buildAdminFullDriverProfileActionDisabledSetup",
  "Audit payload helper must use disabled action helper",
);
assertIncludes(auditHelper, "auditWriteEnabled: false", "Audit payload helper must disable audit writes");
assertIncludes(
  auditHelper,
  "admin_full_driver_profile_action_audit_payload_setup_only",
  "Audit payload delivery surface",
);
assertIncludes(
  auditHelper,
  "rejectedForbiddenFieldCount",
  "Audit payload must summarize rejected forbidden fields",
);
assertExcludes(
  auditHelper,
  /driver_profile_fields:/,
  "Audit payload helper must not expose raw driver profile field values",
);

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["AI parse route", aiParseRoute],
  ["admin saved bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, actionSetupApiName, label);
  assertExcludes(source, auditSetupApiName, label);
  assertExcludes(source, actionHelperExportName, label);
  assertExcludes(source, auditHelperExportName, label);
}

const saveBookingSource = sectionBetween(
  appPage,
  "async function saveBooking()",
  "async function saveAdminBookingOperationalSnapshot()",
);
assertIncludes(saveBookingSource, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint");
assertExcludes(saveBookingSource, "/api/admin-saved-bookings", "Save Booking + CRM");
assertExcludes(saveBookingSource, actionSetupApiName, "Save Booking + CRM");
assertExcludes(saveBookingSource, auditSetupApiName, "Save Booking + CRM");

const saveDriverProfileSource = sectionBetween(
  appPage,
  "async function saveDriverProfile()",
  "async function deactivateDriverProfile()",
);
const deleteDriverProfileSource = sectionBetween(
  appPage,
  "async function deleteDriverProfile",
  "async function saveBooking()",
);

for (const [label, source] of [
  ["saveDriverProfile", saveDriverProfileSource],
  ["deleteDriverProfile", deleteDriverProfileSource],
]) {
  assertExcludes(source, actionSetupApiName, label);
  assertExcludes(source, auditSetupApiName, label);
  assertExcludes(source, actionHelperExportName, label);
  assertExcludes(source, auditHelperExportName, label);
}

assertIncludes(saveDriverProfileSource, "payout_preferences", "Parked full driver profile save");
assertIncludes(saveDriverProfileSource, "driver_payout_rules", "Parked full driver profile save");
assertIncludes(legacyRoute, "drivers: new Set", "Legacy drivers route remains parked");
assertIncludes(legacyRoute, '"payout_preferences"', "Legacy driver payout preferences remain parked");
assertIncludes(legacyRoute, '"driver_payout_rules"', "Legacy driver payout rules remain parked");

assertExcludes(actionRoute, forbiddenOutputPattern, "Disabled action route safe output");
assertExcludes(auditRoute, forbiddenOutputPattern, "Audit payload route safe output");

for (const entry of [
  "scripts/test-admin-full-driver-profile-action-disabled-setup-api-contract.mjs",
  "scripts/test-admin-full-driver-profile-action-audit-payload-setup-api-contract.mjs",
  "scripts/test-admin-full-driver-profile-no-live-guard.mjs",
]) {
  assertIncludes(preactivationSuite, entry, `Preactivation suite entry ${entry}`);
}

console.log("admin full driver profile no-live guard passed");
