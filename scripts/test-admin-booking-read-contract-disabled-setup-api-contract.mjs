import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-booking-read-contract-disabled-setup/route.ts";
const helperPath = "lib/admin-booking-read-contract-disabled-setup.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const setupApiPath = "/api/admin-booking-read-contract-disabled-setup";
const setupApiName = "admin-booking-read-contract-disabled-setup";
const helperExportName = "buildAdminBookingReadContractDisabledSetup";
const sourceFiles = [routePath, helperPath, boundaryPath];
const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";

const routeLivePattern =
  /export async function (POST|PUT|PATCH|DELETE)|@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const helperLivePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeSafeOutputPattern =
  /pricing|payout|customer_rates|driver_payout_rules|rate_override|payment|billing|invoice|pdf|provider|send_state|send_log|auth|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;

const safeFields = [
  "audit_summary",
  "booking_reference",
  "booking_status",
  "contact_display_name",
  "contact_email",
  "contact_phone",
  "created_at",
  "customer_display_name",
  "dropoff_location",
  "pickup_datetime",
  "pickup_location",
  "route_points_summary",
  "route_summary",
  "service_item_summary",
  "service_type",
  "updated_at",
];
const forbiddenFields = [
  "pricing",
  "payout",
  "customer_rates",
  "driver_payout_rules",
  "rate_override",
  "payment",
  "pdf",
  "billing",
  "provider_send",
  "auth_session",
  "live_location",
  "photo",
  "calendar_event_id",
  "internal_admin_notes",
  "debug_payload",
  "secret_token",
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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
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
  assert.equal(value.readEnabled, false, `${label} must keep readEnabled false.`);
  assert.equal(value.read_enabled, false, `${label} must keep read_enabled false.`);
  assert.equal(value.liveReadEnabled, false, `${label} must keep liveReadEnabled false.`);
  assert.equal(value.live_read_enabled, false, `${label} must keep live_read_enabled false.`);
  assert.equal(value.dbReadEnabled, false, `${label} must keep dbReadEnabled false.`);
  assert.equal(value.db_read_enabled, false, `${label} must keep db_read_enabled false.`);
  assert.equal(value.listReadEnabled, false, `${label} must keep listReadEnabled false.`);
  assert.equal(value.list_read_enabled, false, `${label} must keep list_read_enabled false.`);
  assert.equal(value.detailReadEnabled, false, `${label} must keep detailReadEnabled false.`);
  assert.equal(value.detail_read_enabled, false, `${label} must keep detail_read_enabled false.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.no_live_read, true, `${label} must keep no_live_read true.`);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
}

function assertBlockedNoOp(value, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, true, `${label} must be ok as a valid disabled read contract.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(
    value.delivery_surface,
    "admin_booking_read_contract_disabled_setup_only",
    `${label} must use the disabled admin booking read delivery surface.`,
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
    `${label} must not expose pricing, payout, payment, provider, auth, location, photo, calendar, internal, parser, mock, token, or secret text.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-booking-read-contract-disabled-"));
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
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(routeSource, "export async function GET", "Admin booking read disabled setup route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Admin booking read disabled setup route");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Admin booking read disabled setup route");
assertIncludes(routeSource, helperExportName, "Admin booking read disabled setup route");
assertExcludes(routeSource, routeLivePattern, "Admin booking read disabled setup route");

assertIncludes(helperSource, "server-only", "Admin booking read disabled setup helper");
assertIncludes(helperSource, helperExportName, "Admin booking read disabled setup helper");
assertIncludes(helperSource, "readEnabled: false", "Admin booking read disabled setup helper");
assertIncludes(helperSource, "liveReadEnabled: false", "Admin booking read disabled setup helper");
assertIncludes(helperSource, "dbReadEnabled: false", "Admin booking read disabled setup helper");
assertIncludes(helperSource, "writeEnabled: false", "Admin booking read disabled setup helper");
assertIncludes(helperSource, "no_live_read: true", "Admin booking read disabled setup helper");
assertExcludes(helperSource, helperLivePattern, "Admin booking read disabled setup helper");

for (const field of safeFields) {
  assertIncludes(helperSource, `"${field}"`, `Allowed admin booking read field ${field}`);
}

for (const field of forbiddenFields) {
  assertIncludes(helperSource, `"${field}"`, `Forbidden admin booking read field ${field}`);
}

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, setupApiName, label);
  assertExcludes(source, helperExportName, label);
}

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe route");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM safe route");
assertExcludes(saveBookingBlock, setupApiName, "Save Booking + CRM safe route");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Load Bookings legacy read remains separate",
);
assertExcludes(loadBookingsBlock, setupApiName, "Load Bookings must not wire disabled read contract yet");
assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings read route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings list read");

assertIncludes(
  preactivationSuite,
  "scripts/test-admin-booking-read-contract-disabled-setup-api-contract.mjs",
  "Preactivation suite disabled admin booking read contract entry",
);

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminBookingReadContractDisabledSetup } = harness.helper;
  const safeContract = buildAdminBookingReadContractDisabledSetup({
    audit_summary: "Created by admin dispatcher",
    booking_reference: "PL-READ-20260616-001",
    booking_status: "confirmed",
    contact_display_name: "Ops Booker",
    contact_email: "ops@example.com",
    contact_phone: "+65 9000 0000",
    created_at: "2026-06-16T10:00:00.000Z",
    customer_display_name: "Safe Customer",
    dropoff_location: "Raffles Hotel Singapore",
    pickup_datetime: "2026-06-16T14:00:00.000+08:00",
    pickup_location: "Changi Airport Terminal 3",
    read_mode: "detail",
    route_points_summary: "Pickup then drop-off",
    route_summary: "Changi Airport Terminal 3 > Raffles Hotel Singapore",
    service_item_summary: "1 child seat",
    service_type: "arrival",
    updated_at: "2026-06-16T10:05:00.000Z",
  });

  assertBlockedNoOp(safeContract, "Safe helper read contract");
  assert.equal(safeContract.read_mode, "detail");
  assert.deepEqual(safeContract.booking_read_field_names, safeFields);

  const forbiddenContract = buildAdminBookingReadContractDisabledSetup({
    pricing: "hidden",
    payout: "hidden",
    customer_rates: "{}",
    driver_payout_rules: "{}",
    rate_override: "hidden",
    payment: "hidden",
    pdf: "hidden",
    billing: "hidden",
    provider_send: "hidden",
    auth_session: "hidden",
    live_location: "hidden",
    photo: "hidden",
    calendar_event_id: "hidden",
    internal_admin_notes: "hidden",
    debug_payload: "hidden",
    secret_token: "hidden",
  });

  assertRejectedNoOp(forbiddenContract, forbiddenFields, "Forbidden helper read contract");

  const invalidContract = buildAdminBookingReadContractDisabledSetup({
    booking_reference: "driver payout hidden",
    unknown_field: "ignored",
  });

  assertRejectedNoOp(
    invalidContract,
    ["booking_reference", "unknown_field"],
    "Invalid helper read contract",
  );

  const routeSuccess = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PL-READ-20260616-001",
        booking_status: "confirmed",
        contact_phone: "+65 9000 0000",
        customer_display_name: "Safe Customer",
        pickup_location: "Changi Airport Terminal 3",
        read_mode: "list",
        route_summary: "Changi Airport Terminal 3 > Raffles Hotel Singapore",
        service_item_summary: "1 child seat",
      }),
      { headers: adminHeaders() },
    ),
  );
  const routeSuccessBody = await routeSuccess.json();

  assert.equal(routeSuccess.status, 200);
  assert.equal(routeSuccessBody.ok, true);
  assertBlockedNoOp(routeSuccessBody.result, "Route safe read contract");
  assert.equal(routeSuccessBody.result.read_mode, "list");
  assertNoUnsafeSafeOutput(routeSuccessBody, "Route safe read contract");

  const routeForbidden = await harness.route.GET(
    new Request(
      apiUrl({
        billing: "hidden",
        customer_rates: "{}",
        driver_payout_rules: "{}",
        payment: "hidden",
        pricing: "hidden",
      }),
      { headers: adminHeaders() },
    ),
  );
  const routeForbiddenBody = await routeForbidden.json();

  assert.equal(routeForbidden.status, 400);
  assert.equal(routeForbiddenBody.ok, false);
  assertRejectedNoOp(
    routeForbiddenBody.result,
    ["billing", "customer_rates", "driver_payout_rules", "payment", "pricing"],
    "Route forbidden read contract",
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

console.log("admin booking read contract disabled setup API contract passed");
