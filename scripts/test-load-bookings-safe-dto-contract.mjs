import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const helperExportName = "buildAdminLoadBookingsSafeDtoContract";
const helperVersionName = "adminLoadBookingsSafeDtoContractVersion";
const setupSurfaceName = "load_bookings_safe_dto_contract_setup_only";
const guardScript = "scripts/test-load-bookings-safe-dto-contract.mjs";

const livePathPattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
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
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
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
    value.savedBookingsEndpointChanged,
    false,
    `${label} must keep savedBookingsEndpointChanged false.`,
  );
  assert.equal(
    value.saved_bookings_endpoint_changed,
    false,
    `${label} must keep saved_bookings_endpoint_changed false.`,
  );
  assert.equal(value.no_live_read, true, `${label} must keep no_live_read true.`);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
}

function assertBlockedNoOp(value, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, true, `${label} must be ok as a valid setup-only DTO contract.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(
    value.delivery_surface,
    setupSurfaceName,
    `${label} must use the setup-only Load Bookings DTO delivery surface.`,
  );
  assert.equal(value.contractReady, true, `${label} must have a ready setup-only contract.`);
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
    `${label} must not expose finance, payout, payment, provider, auth, live location, photo, calendar, internal, parser, mock, token, or secret text.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-load-bookings-safe-dto-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const sourcePath = path.join(process.cwd(), helperPath);
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: require(outputPath),
  };
}

const [
  helperSource,
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(helperSource, "server-only", "Load Bookings safe DTO helper");
assertIncludes(helperSource, helperExportName, "Load Bookings safe DTO helper");
assertIncludes(helperSource, helperVersionName, "Load Bookings safe DTO helper");
assertIncludes(helperSource, "readEnabled: false", "Load Bookings safe DTO helper");
assertIncludes(helperSource, "liveReadEnabled: false", "Load Bookings safe DTO helper");
assertIncludes(helperSource, "dbReadEnabled: false", "Load Bookings safe DTO helper");
assertIncludes(helperSource, "writeEnabled: false", "Load Bookings safe DTO helper");
assertIncludes(
  helperSource,
  "loadBookingsRuntimeWiringEnabled: false",
  "Load Bookings safe DTO helper",
);
assertIncludes(
  helperSource,
  "savedBookingsEndpointChanged: false",
  "Load Bookings safe DTO helper",
);
assertIncludes(helperSource, "no_live_read: true", "Load Bookings safe DTO helper");
assertExcludes(helperSource, livePathPattern, "Load Bookings safe DTO helper");

for (const field of safeFields) {
  assertIncludes(helperSource, `"${field}"`, `Allowed Load Bookings safe DTO field ${field}`);
}

for (const field of forbiddenFields) {
  assertIncludes(helperSource, `"${field}"`, `Forbidden Load Bookings safe DTO field ${field}`);
}

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM route");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM route");
assertExcludes(saveBookingBlock, helperExportName, "Save Booking + CRM helper wiring");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "Load Bookings legacy read remains separate",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings legacy read method");
assertExcludes(loadBookingsBlock, helperExportName, "Load Bookings runtime wiring");
assertExcludes(loadBookingsBlock, "admin-load-bookings-safe-dto-contract", "Load Bookings runtime wiring");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, helperExportName, label);
  assertExcludes(source, "admin-load-bookings-safe-dto-contract", label);
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings route");

assertIncludes(preactivationSuite, guardScript, "Preactivation suite Load Bookings safe DTO guard entry");

const harness = await loadHarness();

try {
  const { buildAdminLoadBookingsSafeDtoContract } = harness.helper;
  const safeContract = buildAdminLoadBookingsSafeDtoContract({
    assigned_driver_display_name: "Ahmad Driver",
    assigned_driver_phone: "+65 9000 0000",
    assigned_driver_plate: "SLZ1234A",
    assigned_driver_status: "available",
    assigned_driver_vehicle_type: "Mercedes V-Class",
    audit_summary: "Created by admin dispatcher",
    booking_id: "15",
    booking_reference: "PL-READ-20260616-001",
    booking_status: "confirmed",
    booking_type: "airport_arrival",
    booker_display_name: "Ops Booker",
    booker_email: "ops@example.com",
    booker_phone: "+65 8000 0000",
    child_seat_display: "1 child seat",
    company_display_name: "Prestige Test Company",
    created_at: "2026-06-16T10:00:00.000Z",
    customer_display_name: "Safe Customer",
    dropoff_address: "Raffles Hotel Singapore",
    dropoff_datetime: "2026-06-16T14:45:00.000+08:00",
    extra_stop_display: "1 extra stop",
    job_card_display: "Arrival transfer",
    pax_display: "2 pax",
    pickup_address: "Changi Airport Terminal 3",
    pickup_datetime: "2026-06-16T14:00:00.000+08:00",
    read_mode: "detail",
    route_points_summary: "Pickup then drop-off",
    route_summary: "Changi Airport Terminal 3 > Raffles Hotel Singapore",
    service_display: "Airport arrival",
    traveler_display_name: "Safe Traveler",
    updated_at: "2026-06-16T10:05:00.000Z",
    vehicle_display: "Mercedes V-Class",
  });

  assertBlockedNoOp(safeContract, "Safe Load Bookings DTO contract");
  assert.equal(safeContract.read_mode, "detail");
  assert.deepEqual(safeContract.dto_field_names, [...safeFields].sort());

  const aliasContract = buildAdminLoadBookingsSafeDtoContract({
    booking_ref: "PL-READ-ALIAS-001",
    dropoff_location: "Raffles Hotel Singapore",
    pickup_location: "Changi Airport Terminal 3",
    service_type: "Airport arrival",
    vehicle_type: "Mercedes V-Class",
  });

  assertBlockedNoOp(aliasContract, "Alias Load Bookings DTO contract");
  assert.equal(aliasContract.safe_dto.booking_reference, "PL-READ-ALIAS-001");
  assert.equal(aliasContract.safe_dto.pickup_address, "Changi Airport Terminal 3");
  assert.equal(aliasContract.safe_dto.dropoff_address, "Raffles Hotel Singapore");
  assert.equal(aliasContract.safe_dto.service_display, "Airport arrival");
  assert.equal(aliasContract.safe_dto.vehicle_display, "Mercedes V-Class");

  const forbiddenContract = buildAdminLoadBookingsSafeDtoContract({
    auth_session: "hidden",
    billing: "hidden",
    calendar_event_id: "hidden",
    child_seat_customer_surcharge: "hidden",
    child_seat_driver_payout: "hidden",
    customer_price_amount: "hidden",
    customer_price_override_reason: "hidden",
    customer_rate: "hidden",
    customer_rate_override: "hidden",
    customer_rates: "{}",
    debug_payload: "hidden",
    driver_dispatch_include_payout: "hidden",
    driver_notes: "hidden",
    driver_payout_amount: "hidden",
    driver_payout_max: "hidden",
    driver_payout_min: "hidden",
    driver_payout_override: "hidden",
    driver_payout_reason: "hidden",
    driver_payout_rules: "{}",
    driver_payout_unit: "hidden",
    extra_stop_payout: "hidden",
    extra_stop_surcharge: "hidden",
    internal_admin_notes: "hidden",
    live_location: "hidden",
    midnight_payout: "hidden",
    midnight_surcharge: "hidden",
    payment: "hidden",
    pdf: "hidden",
    photo: "hidden",
    payout: "hidden",
    pricing: "hidden",
    pricing_source: "hidden",
    provider_send: "hidden",
    rate_override: "hidden",
    secret_token: "hidden",
  });

  assertRejectedNoOp(forbiddenContract, forbiddenFields, "Forbidden Load Bookings DTO contract");

  const invalidContract = buildAdminLoadBookingsSafeDtoContract({
    booking_reference: "driver payout hidden",
    unknown_field: "ignored",
  });

  assertRejectedNoOp(
    invalidContract,
    ["booking_reference", "unknown_field"],
    "Invalid Load Bookings DTO contract",
  );
} finally {
  await harness.cleanup();
}

console.log("Load Bookings safe DTO contract guard passed");
