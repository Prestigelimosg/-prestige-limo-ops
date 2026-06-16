import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-full-driver-profile-action-disabled-setup/route.ts";
const helperPath = "lib/admin-full-driver-profile-action-disabled-setup.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const globalGuardPath = "scripts/test-global-preactivation-no-live-guard.mjs";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const setupApiPath = "/api/admin-full-driver-profile-action-disabled-setup";
const setupApiName = "admin-full-driver-profile-action-disabled-setup";
const helperExportName = "buildAdminFullDriverProfileActionDisabledSetup";
const sourceFiles = [routePath, helperPath, boundaryPath];
const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const routeLivePattern =
  /export async function (POST|PUT|PATCH|DELETE)|@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const helperLivePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeSafeOutputPattern =
  /payout_preferences|driver_payout_rules|customer_rates|customer_price|pricing|payout|payment|billing|invoice|pdf|finance|internal_admin|admin_notes|preferred_areas|airport_permit_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
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
  "provider_send",
  "auth_session",
  "location",
  "photo",
  "calendar_event_id",
  "debug_payload",
];
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyLocalAdminBoundary() {
  delete process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;
}

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

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(params = {}) {
  const url = new URL(`http://localhost${setupApiPath}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertDisabled(value, label) {
  assert.equal(value.actionEnabled, false, `${label} must keep actionEnabled false.`);
  assert.equal(value.action_enabled, false, `${label} must keep action_enabled false.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.live_write_enabled, false, `${label} must keep live_write_enabled false.`);
  assert.equal(value.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value.admin_review_required, true, `${label} must keep admin_review_required true.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
}

function assertBlockedNoOp(value, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, true, `${label} must be ok as a valid disabled action.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(
    value.delivery_surface,
    "admin_full_driver_profile_action_disabled_setup_only",
    `${label} must use the disabled full driver profile delivery surface.`,
  );
  assert.equal(value.contractReady, true, `${label} must have a ready disabled contract.`);
  assert.deepEqual(value.rejected_fields, [], `${label} must not reject safe fields.`);
  assertNoUnsafeSafeOutput(value, label);
}

function assertRejectedNoOp(value, expectedFields, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, false, `${label} must not be ok.`);
  assert.equal(value.status, "rejected", `${label} must be rejected.`);
  assert.equal(value.reason, "unsafe_or_unknown_fields", `${label} must reject unsafe fields.`);
  assert.equal(value.result_label, "rejected/no-op", `${label} must keep rejected/no-op label.`);

  for (const expectedField of expectedFields) {
    assert.ok(
      value.rejected_fields.includes(expectedField),
      `${label} must reject ${expectedField}.`,
    );
  }
}

function assertNoUnsafeSafeOutput(value, label) {
  assert.equal(
    unsafeSafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose payout, pricing, finance, internal, parser, mock, token, or secret text.`,
  );
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText.replace(/require\("([^"]+)\.ts"\)/g, 'require("$1.js")');
}

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-full-driver-profile-disabled-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: require(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    route: require(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const [
  routeSource,
  helperSource,
  appPage,
  aiParseRoute,
  adminSavedBookingsRoute,
  globalGuard,
  preactivationSuite,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(globalGuardPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(routeSource, "export async function GET", "Full driver profile disabled action route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Full driver profile disabled action route");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Full driver profile disabled action route");
assertIncludes(routeSource, helperExportName, "Full driver profile disabled action route");
assertExcludes(routeSource, routeLivePattern, "Full driver profile disabled action route");

assertIncludes(helperSource, "server-only", "Full driver profile disabled action helper");
assertIncludes(helperSource, helperExportName, "Full driver profile disabled action helper");
assertIncludes(helperSource, "writeEnabled: false", "Full driver profile disabled action helper");
assertIncludes(helperSource, "liveWriteEnabled: false", "Full driver profile disabled action helper");
assertIncludes(helperSource, "external_send: false", "Full driver profile disabled action helper");
assertIncludes(helperSource, '"payout_preferences"', "Full driver profile disabled action forbidden payout preferences");
assertIncludes(
  helperSource,
  '"driver_payout_rules"',
  "Full driver profile disabled action forbidden driver payout rules",
);
assertExcludes(helperSource, helperLivePattern, "Full driver profile disabled action helper");

assertExcludes(appPage, setupApiName, "App page must not wire disabled full driver profile action API");
assertExcludes(appPage, helperExportName, "App page must not import disabled full driver profile helper");
assertExcludes(aiParseRoute, setupApiName, "AI parse route");
assertExcludes(aiParseRoute, helperExportName, "AI parse route");
assertExcludes(adminSavedBookingsRoute, setupApiName, "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, helperExportName, "Admin saved bookings route");
assertIncludes(globalGuard, "admin-full-driver-profile-action", "Global no-live guard setup route fragment");
assertIncludes(
  preactivationSuite,
  "scripts/test-admin-full-driver-profile-action-disabled-setup-api-contract.mjs",
  "Preactivation suite disabled full driver profile action entry",
);

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminFullDriverProfileActionDisabledSetup } = harness.helper;
  const safeAction = buildAdminFullDriverProfileActionDisabledSetup({
    availability_status: "available",
    contact_number: "+65 8123 4567",
    driver_name: "Aisha Driver",
    plate_number: "SMA8888Z",
    vehicle_type: "Alphard",
  });

  assertBlockedNoOp(safeAction, "Safe helper action");
  assert.deepEqual(safeAction.driver_profile_field_names, [
    "availability_status",
    "contact_number",
    "driver_name",
    "plate_number",
    "vehicle_type",
  ]);

  const forbiddenAction = buildAdminFullDriverProfileActionDisabledSetup({
    availability_status: "available",
    payout_preferences: "PayNow payout",
    driver_payout_rules: "{}",
    pricing: "hidden",
    payout: "hidden",
    notes: "internal admin note",
    preferred_areas: "airport",
    airport_permit_notes: "permit",
    internal_admin_notes: "hidden",
    payment: "hidden",
    pdf: "hidden",
    billing: "hidden",
    provider_send: "hidden",
    auth_session: "hidden",
    location: "hidden",
    photo: "hidden",
    calendar_event_id: "hidden",
    debug_payload: "hidden",
  });

  assertRejectedNoOp(forbiddenAction, forbiddenFields, "Forbidden helper action");

  const invalidAction = buildAdminFullDriverProfileActionDisabledSetup({
    availability_status: "driver_payout",
    contact_number: "",
  });

  assertRejectedNoOp(invalidAction, ["availability_status", "contact_number"], "Invalid helper action");

  const routeSuccess = await harness.route.GET(
    new Request(
      apiUrl({
        availability_status: "busy",
        contact_number: "+65 8123 4567",
        driver_name: "Aisha Driver",
        plate_number: "SMA8888Z",
        vehicle_type: "Alphard",
      }),
      { headers: adminHeaders() },
    ),
  );
  const routeSuccessBody = await routeSuccess.json();

  assert.equal(routeSuccess.status, 200);
  assert.equal(routeSuccessBody.ok, true);
  assertBlockedNoOp(routeSuccessBody.result, "Route safe action");
  assertNoUnsafeSafeOutput(routeSuccessBody, "Route safe action");

  const routeForbidden = await harness.route.GET(
    new Request(
      apiUrl({
        payout_preferences: "PayNow payout",
        driver_payout_rules: "{}",
        notes: "internal",
      }),
      { headers: adminHeaders() },
    ),
  );
  const routeForbiddenBody = await routeForbidden.json();

  assert.equal(routeForbidden.status, 400);
  assert.equal(routeForbiddenBody.ok, false);
  assertRejectedNoOp(
    routeForbiddenBody.result,
    ["driver_payout_rules", "notes", "payout_preferences"],
    "Route forbidden action",
  );

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymousBody = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403);
  assert.equal(anonymousBody.ok, false);
  assert.equal(anonymousBody.status, "blocked");
  assert.equal(anonymousBody.error, routeBlockedMessage);
  assertDisabled(anonymousBody.result, "Anonymous route fallback result");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin full driver profile disabled action API contract passed");
