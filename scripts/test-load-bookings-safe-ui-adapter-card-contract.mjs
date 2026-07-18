import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-load-bookings-safe-ui-adapter-card-contract.ts";
const safeDtoHelperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const helperExportName = "buildAdminLoadBookingsSafeUiAdapterCardContract";
const helperVersionName = "adminLoadBookingsSafeUiAdapterCardContractVersion";
const helperPathFragment = "admin-load-bookings-safe-ui-adapter-card-contract";
const setupSurfaceName = "load_bookings_safe_ui_adapter_card_contract_setup_only";
const guardScript = "scripts/test-load-bookings-safe-ui-adapter-card-contract.mjs";

const livePathPattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeSafeCardPattern =
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
  assert.equal(value.loadBookingsRuntimeWiringEnabled, false, `${label} must keep runtime wiring disabled.`);
  assert.equal(value.load_bookings_runtime_wiring_enabled, false, `${label} must keep runtime wiring disabled.`);
  assert.equal(value.loadBookingsEndpointChanged, false, `${label} must keep the Load Bookings endpoint unchanged.`);
  assert.equal(value.load_bookings_endpoint_changed, false, `${label} must keep the Load Bookings endpoint unchanged.`);
  assert.equal(value.savedBookingsEndpointChanged, false, `${label} must keep /api/admin-saved-bookings unchanged.`);
  assert.equal(value.saved_bookings_endpoint_changed, false, `${label} must keep /api/admin-saved-bookings unchanged.`);
  assert.equal(value.uiAdapterRuntimeWiringEnabled, false, `${label} must keep UI adapter runtime wiring disabled.`);
  assert.equal(value.ui_adapter_runtime_wiring_enabled, false, `${label} must keep UI adapter runtime wiring disabled.`);
  assert.equal(value.uiRenderingEnabled, false, `${label} must not render real UI.`);
  assert.equal(value.ui_rendering_enabled, false, `${label} must not render real UI.`);
  assert.equal(value.realUiCardRenderingEnabled, false, `${label} must not render real cards.`);
  assert.equal(value.real_ui_card_rendering_enabled, false, `${label} must not render real cards.`);
  assert.equal(value.no_live_read, true, `${label} must keep no_live_read true.`);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
}

function assertBlockedNoOp(value, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, true, `${label} must be ok as a valid setup-only adapter contract.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(value.delivery_surface, setupSurfaceName, `${label} must use the setup-only delivery surface.`);
  assert.equal(value.adapterReady, true, `${label} must have a ready setup-only adapter.`);
  assert.equal(value.cardReady, true, `${label} must have a ready setup-only card contract.`);
  assert.deepEqual(value.rejected_fields, [], `${label} must not reject safe fields.`);
  assertNoUnsafeSafeCard(value.safe_card, label);
}

function assertRejectedNoOp(value, expectedFields, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, false, `${label} must not be ok.`);
  assert.equal(value.status, "rejected", `${label} must be rejected.`);
  assert.equal(value.reason, "unsafe_or_unknown_fields", `${label} must reject unsafe fields.`);
  assert.equal(value.result_label, "rejected/no-op", `${label} must keep rejected/no-op label.`);

  for (const expectedField of expectedFields) {
    assert.ok(value.rejected_fields.includes(expectedField), `${label} must reject ${expectedField}.`);
  }
}

function assertNoUnsafeSafeCard(value, label) {
  assert.equal(
    unsafeSafeCardPattern.test(JSON.stringify(value)),
    false,
    `${label} safe card must not expose finance, payout, payment, provider, auth, live location, photo, calendar, internal, parser, mock, token, or secret text.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-load-bookings-safe-ui-adapter-"));
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

assertIncludes(helperSource, "server-only", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, helperExportName, "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, helperVersionName, "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "uiAdapterRuntimeWiringEnabled: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "uiRenderingEnabled: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "realUiCardRenderingEnabled: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "loadBookingsRuntimeWiringEnabled: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "loadBookingsEndpointChanged: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "savedBookingsEndpointChanged: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "readEnabled: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "liveReadEnabled: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "dbReadEnabled: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "writeEnabled: false", "Load Bookings safe UI adapter helper");
assertIncludes(helperSource, "no_live_read: true", "Load Bookings safe UI adapter helper");
assertExcludes(helperSource, livePathPattern, "Load Bookings safe UI adapter helper");

for (const field of safeFields) {
  assertIncludes(helperSource, `"${field}"`, `Allowed Load Bookings safe UI adapter field ${field}`);
}

for (const field of forbiddenFields) {
  assertIncludes(helperSource, `"${field}"`, `Forbidden Load Bookings safe UI adapter field ${field}`);
}

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM route");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM route");
assertExcludes(saveBookingBlock, helperExportName, "Save Booking + CRM helper wiring");
assertExcludes(saveBookingBlock, helperPathFragment, "Save Booking + CRM helper wiring");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Load Bookings legacy read remains separate",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings legacy read method");
assertExcludes(loadBookingsBlock, helperExportName, "Load Bookings runtime wiring");
assertExcludes(loadBookingsBlock, helperPathFragment, "Load Bookings runtime wiring");
assertExcludes(appPage, helperExportName, "app/page.tsx safe UI adapter runtime wiring");
assertExcludes(appPage, helperPathFragment, "app/page.tsx safe UI adapter runtime wiring");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, helperExportName, label);
  assertExcludes(source, helperPathFragment, label);
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings route");

assertIncludes(safeDtoHelperSource, "loadBookingsRuntimeWiringEnabled: false", "Safe DTO contract remains blocked");
assertIncludes(safeDtoHelperSource, "savedBookingsEndpointChanged: false", "Safe DTO contract keeps saved bookings separate");

assertIncludes(preactivationSuite, guardScript, "Preactivation suite Load Bookings safe UI adapter guard entry");

const harness = await loadHarness();

try {
  const { buildAdminLoadBookingsSafeUiAdapterCardContract } = harness.helper;
  const safeContract = buildAdminLoadBookingsSafeUiAdapterCardContract({
    assigned_driver_display_name: "Ahmad Driver",
    assigned_driver_phone: "+65 9000 0000",
    assigned_driver_plate: "SLZ1234A",
    assigned_driver_status: "available",
    assigned_driver_vehicle_type: "Mercedes V-Class",
    audit_summary: "Created by dispatcher",
    booking_id: "15",
    booking_reference: "PL-UI-20260616-001",
    booking_status: "confirmed",
    booking_type: "airport arrival",
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
    route_points_summary: "Pickup then drop-off",
    route_summary: "Changi Airport Terminal 3 > Raffles Hotel Singapore",
    service_display: "Airport arrival",
    traveler_display_name: "Safe Traveler",
    updated_at: "2026-06-16T10:05:00.000Z",
    vehicle_display: "Mercedes V-Class",
  });

  assertBlockedNoOp(safeContract, "Safe Load Bookings UI adapter contract");
  assert.deepEqual(safeContract.safe_card_field_names, [...safeFields].sort());
  assert.equal(safeContract.safe_card.booking_reference, "PL-UI-20260616-001");

  const aliasContract = buildAdminLoadBookingsSafeUiAdapterCardContract({
    booking_ref: "PL-UI-ALIAS-001",
    dropoff_location: "Raffles Hotel Singapore",
    pickup_location: "Changi Airport",
    service_type: "Airport transfer",
    vehicle_type: "Mercedes V-Class",
  });

  assertBlockedNoOp(aliasContract, "Aliased safe Load Bookings UI adapter contract");
  assert.equal(aliasContract.safe_card.booking_reference, "PL-UI-ALIAS-001");
  assert.equal(aliasContract.safe_card.dropoff_address, "Raffles Hotel Singapore");
  assert.equal(aliasContract.safe_card.pickup_address, "Changi Airport");
  assert.equal(aliasContract.safe_card.service_display, "Airport transfer");
  assert.equal(aliasContract.safe_card.vehicle_display, "Mercedes V-Class");

  const rejectedContract = buildAdminLoadBookingsSafeUiAdapterCardContract({
    auth_session: "unsafe",
    billing: "unsafe",
    calendar_event_id: "unsafe",
    customer_price_amount: 99,
    customer_rate: 88,
    customer_rate_override: 77,
    customer_rates: {},
    debug_payload: {},
    driver_dispatch_include_payout: true,
    driver_notes: "unsafe",
    driver_payout_amount: 55,
    driver_payout_min: 45,
    driver_payout_rules: {},
    internal_admin_notes: "unsafe",
    live_location: "unsafe",
    payment: "unsafe",
    pdf: "unsafe",
    photo: "unsafe",
    pricing: "unsafe",
    pricing_source: "unsafe",
    provider_send: "unsafe",
    rate_override: "unsafe",
    secret_token: "unsafe",
  });

  assertRejectedNoOp(
    rejectedContract,
    [
      "auth_session",
      "billing",
      "calendar_event_id",
      "customer_price_amount",
      "customer_rate",
      "customer_rate_override",
      "customer_rates",
      "debug_payload",
      "driver_dispatch_include_payout",
      "driver_notes",
      "driver_payout_amount",
      "driver_payout_min",
      "driver_payout_rules",
      "internal_admin_notes",
      "live_location",
      "payment",
      "pdf",
      "photo",
      "pricing",
      "pricing_source",
      "provider_send",
      "rate_override",
      "secret_token",
    ],
    "Forbidden Load Bookings UI adapter contract",
  );

  const unsafeValueContract = buildAdminLoadBookingsSafeUiAdapterCardContract({
    booking_reference: "PL-UI-UNSAFE-VALUE",
    audit_summary: "contains driver payout details",
  });

  assertRejectedNoOp(unsafeValueContract, ["audit_summary"], "Unsafe safe-field value contract");
} finally {
  await harness.cleanup();
}

console.log("Load Bookings safe UI adapter card contract guard passed");
