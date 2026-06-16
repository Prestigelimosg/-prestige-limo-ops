import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-load-bookings-typed-read-adapter-foundation.ts";
const safeDtoHelperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const helperExportName = "buildAdminLoadBookingsTypedReadAdapterFoundation";
const helperVersionName = "adminLoadBookingsTypedReadAdapterFoundationVersion";
const setupSurfaceName = "load_bookings_typed_read_adapter_foundation_setup_only";
const guardScript = "scripts/test-load-bookings-typed-read-adapter-foundation.mjs";

const livePathPattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|\.select\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeSafeOutputPattern =
  /pricing|payout|customer_rate|customer_price|customer_rates|driver_payout_rules|driver_payout|driver_notes|driver_dispatch_include_payout|midnight_surcharge|extra_stop_surcharge|child_seat_customer_surcharge|pricing_source|rate_override|payment|billing|invoice|pdf|provider|send_state|send_log|auth|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;

const safeFields = [
  "assigned_driver_display_name",
  "assigned_driver_phone",
  "assigned_driver_plate",
  "assigned_driver_status",
  "assigned_driver_vehicle_type",
  "audit_summary",
  "booking_id",
  "booking_reference",
  "booking_status",
  "booking_type",
  "booker_display_name",
  "booker_email",
  "booker_phone",
  "child_seat_display",
  "company_display_name",
  "created_at",
  "customer_display_name",
  "dropoff_address",
  "dropoff_datetime",
  "extra_stop_display",
  "job_card_display",
  "pax_display",
  "pickup_address",
  "pickup_datetime",
  "route_points_summary",
  "route_summary",
  "service_display",
  "traveler_display_name",
  "updated_at",
  "vehicle_display",
];

const forbiddenFields = [
  "pricing",
  "payout",
  "customer_rate",
  "customer_price_amount",
  "customer_rate_override",
  "customer_price_override_reason",
  "customer_rates",
  "driver_payout_rules",
  "driver_payout_min",
  "driver_payout_max",
  "driver_payout_amount",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_unit",
  "driver_notes",
  "driver_dispatch_include_payout",
  "midnight_surcharge",
  "midnight_payout",
  "extra_stop_surcharge",
  "extra_stop_payout",
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
  "pricing_source",
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

function assertDisabled(value, label) {
  assert.equal(value.readEnabled, false, `${label} must keep readEnabled false.`);
  assert.equal(value.read_enabled, false, `${label} must keep read_enabled false.`);
  assert.equal(value.liveReadEnabled, false, `${label} must keep liveReadEnabled false.`);
  assert.equal(value.live_read_enabled, false, `${label} must keep live_read_enabled false.`);
  assert.equal(value.dbReadEnabled, false, `${label} must keep dbReadEnabled false.`);
  assert.equal(value.db_read_enabled, false, `${label} must keep db_read_enabled false.`);
  assert.equal(value.databaseClientEnabled, false, `${label} must keep databaseClientEnabled false.`);
  assert.equal(value.database_client_enabled, false, `${label} must keep database_client_enabled false.`);
  assert.equal(value.legacyClientEnabled, false, `${label} must keep legacyClientEnabled false.`);
  assert.equal(value.legacy_client_enabled, false, `${label} must keep legacy_client_enabled false.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.appPageRuntimeWiringEnabled, false, `${label} must keep appPageRuntimeWiringEnabled false.`);
  assert.equal(
    value.app_page_runtime_wiring_enabled,
    false,
    `${label} must keep app_page_runtime_wiring_enabled false.`,
  );
  assert.equal(
    value.loadBookingsRuntimeWiringEnabled,
    false,
    `${label} must keep loadBookingsRuntimeWiringEnabled false.`,
  );
  assert.equal(
    value.load_bookings_runtime_wiring_enabled,
    false,
    `${label} must keep load_bookings_runtime_wiring_enabled false.`,
  );
  assert.equal(
    value.loadBookingsEndpointChanged,
    false,
    `${label} must keep loadBookingsEndpointChanged false.`,
  );
  assert.equal(
    value.load_bookings_endpoint_changed,
    false,
    `${label} must keep load_bookings_endpoint_changed false.`,
  );
  assert.equal(
    value.savedBookingsEndpointChanged,
    false,
    `${label} must keep savedBookingsEndpointChanged false.`,
  );
  assert.equal(
    value.saved_bookings_endpoint_changed,
    false,
    `${label} must keep saved_bookings_endpoint_changed false.`,
  );
  assert.equal(value.saveBookingChanged, false, `${label} must keep saveBookingChanged false.`);
  assert.equal(value.save_booking_changed, false, `${label} must keep save_booking_changed false.`);
  assert.equal(value.parserChanged, false, `${label} must keep parserChanged false.`);
  assert.equal(value.parser_changed, false, `${label} must keep parser_changed false.`);
  assert.equal(value.no_live_read, true, `${label} must keep no_live_read true.`);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
}

function assertBlockedNoOp(value, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, true, `${label} must be ok as a valid setup-only adapter foundation.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(value.delivery_surface, setupSurfaceName, `${label} must use the setup-only delivery surface.`);
  assert.equal(value.adapterReady, true, `${label} must have adapterReady true.`);
  assert.equal(value.foundationReady, true, `${label} must have foundationReady true.`);
  assert.deepEqual(value.rejected_fields, [], `${label} must not reject safe fields.`);
  assertNoUnsafeSafeOutput(value, label);
}

function assertRejectedNoOp(value, expectedFields, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, false, `${label} must not be ok.`);
  assert.equal(value.status, "rejected", `${label} must be rejected.`);
  assert.equal(value.result_label, "rejected/no-op", `${label} must keep rejected/no-op label.`);

  for (const expectedField of expectedFields) {
    assert.ok(value.rejected_fields.includes(expectedField), `${label} must reject ${expectedField}.`);
  }
}

function assertNoUnsafeSafeOutput(value, label) {
  assert.equal(
    unsafeSafeOutputPattern.test(
      JSON.stringify({
        safe_dto: value.safe_dto,
        safe_read_field_names: value.safe_read_field_names,
        dto_field_names: value.dto_field_names,
      }),
    ),
    false,
    `${label} safe output must not expose finance, payout, payment, provider, auth, live location, photo, calendar, internal, parser, mock, token, or secret text.`,
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

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-load-bookings-db-read-adapter-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const helperSourcePath = path.join(process.cwd(), helperPath);
  const safeDtoSourcePath = path.join(process.cwd(), safeDtoHelperPath);
  const helperOutputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const safeDtoOutputPath = path.join(tempDir, safeDtoHelperPath.replace(/\.ts$/, ".js"));
  const helperSource = await readFile(helperSourcePath, "utf8");
  const safeDtoSource = await readFile(safeDtoSourcePath, "utf8");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await mkdir(path.dirname(helperOutputPath), { recursive: true });
  await writeFile(safeDtoOutputPath, transpileTypescript(safeDtoSource, safeDtoSourcePath));
  await writeFile(helperOutputPath, transpileTypescript(helperSource, helperSourcePath));

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: require(helperOutputPath),
  };
}

const [
  helperSource,
  safeDtoHelperSource,
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(safeDtoHelperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(helperSource, "server-only", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, helperExportName, "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, helperVersionName, "Load Bookings typed read adapter foundation helper");
assertIncludes(
  helperSource,
  "buildAdminLoadBookingsSafeDtoContract",
  "Load Bookings typed read adapter foundation helper must use safe DTO contract",
);
assertIncludes(helperSource, "readEnabled: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "liveReadEnabled: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "dbReadEnabled: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "databaseClientEnabled: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "legacyClientEnabled: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "writeEnabled: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "appPageRuntimeWiringEnabled: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "loadBookingsEndpointChanged: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "savedBookingsEndpointChanged: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "saveBookingChanged: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "parserChanged: false", "Load Bookings typed read adapter foundation helper");
assertIncludes(helperSource, "no_live_read: true", "Load Bookings typed read adapter foundation helper");
assertExcludes(helperSource, livePathPattern, "Load Bookings typed read adapter foundation helper live path");

for (const field of safeFields) {
  assertIncludes(helperSource, `"${field}"`, `Allowed typed read adapter field ${field}`);
}

for (const field of forbiddenFields) {
  assertIncludes(helperSource, `"${field}"`, `Forbidden typed read adapter field ${field}`);
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "Current Load Bookings endpoint",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Current Load Bookings method");
assertExcludes(loadBookingsBlock, helperPath, "Load Bookings app wiring to typed read adapter foundation");
assertExcludes(loadBookingsBlock, "admin-load-bookings-typed-read-adapter-foundation", "Load Bookings app wiring");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const [label, source] of [
  ["Safe DTO helper", safeDtoHelperSource],
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, helperPath, `${label} typed read adapter foundation wiring`);
  assertExcludes(source, "admin-load-bookings-typed-read-adapter-foundation", `${label} typed read adapter import`);
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings detail remains");
assertIncludes(preactivationSuite, guardScript, "Preactivation suite typed read adapter guard registration");

const harness = await loadHarness();

try {
  const { buildAdminLoadBookingsTypedReadAdapterFoundation, fallbackAdminLoadBookingsTypedReadAdapterFoundation } =
    harness.helper;

  assert.equal(typeof buildAdminLoadBookingsTypedReadAdapterFoundation, "function", "Helper export must be callable.");
  assert.equal(typeof fallbackAdminLoadBookingsTypedReadAdapterFoundation, "function", "Fallback export must be callable.");

  const safeResult = buildAdminLoadBookingsTypedReadAdapterFoundation({
    read_mode: "list",
    requested_fields: ["booking_reference", "booking_status", "pickup_address", "assigned_driver_display_name"],
    booking_reference: "BK-2026-001",
    booking_status: "confirmed",
    pickup_address: "1 Orchard Road",
    assigned_driver_display_name: "Driver Team",
  });
  assertBlockedNoOp(safeResult, "Safe typed read adapter foundation payload");
  assert.deepEqual(safeResult.safe_read_field_names, [
    "assigned_driver_display_name",
    "booking_reference",
    "booking_status",
    "pickup_address",
  ]);
  assert.equal(safeResult.safe_dto.booking_reference, "BK-2026-001");
  assert.equal(safeResult.safe_dto.pickup_address, "1 Orchard Road");
  assert.equal(safeResult.readMode, "list");
  assert.equal(safeResult.read_mode, "list");

  const detailResult = buildAdminLoadBookingsTypedReadAdapterFoundation({
    mode: "detail",
    ref: "BK-DETAIL-001",
    pickup_location: "Changi Airport",
    vehicle_type: "Mercedes V-Class",
  });
  assertBlockedNoOp(detailResult, "Safe detail typed read adapter foundation payload");
  assert.equal(detailResult.readMode, "detail");
  assert.equal(detailResult.safe_dto.booking_reference, "BK-DETAIL-001");
  assert.equal(detailResult.safe_dto.pickup_address, "Changi Airport");
  assert.equal(detailResult.safe_dto.vehicle_display, "Mercedes V-Class");

  const rejectedResult = buildAdminLoadBookingsTypedReadAdapterFoundation({
    booking_reference: "BK-UNSAFE-001",
    requested_fields: ["booking_reference", "pricing", "driver_payout_amount"],
    customer_price_amount: "100",
    driver_payout_amount: "80",
    provider_send: "true",
  });
  assertRejectedNoOp(
    rejectedResult,
    ["customer_price_amount", "driver_payout_amount", "pricing", "provider_send"],
    "Unsafe typed read adapter foundation payload",
  );

  const fallbackResult = fallbackAdminLoadBookingsTypedReadAdapterFoundation();
  assertBlockedNoOp(fallbackResult, "Fallback typed read adapter foundation payload");
} finally {
  await harness.cleanup();
}

console.log("Load Bookings typed read adapter foundation guard passed");
