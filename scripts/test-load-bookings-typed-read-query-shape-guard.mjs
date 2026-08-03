import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const routePath = "app/api/admin-load-bookings-typed-read/route.ts";
const typedReadGatedHelperPath = "lib/admin-load-bookings-typed-read-gated.ts";
const savedBookingReadPath = "lib/admin-saved-booking-read.ts";
const operationalRecordMapperPath =
  "lib/admin-load-bookings-operational-record-mapper.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-load-bookings-typed-read-query-shape-guard.mjs";
const typedReadPath = "/api/admin-load-bookings-typed-read";
const legacySavedBookingsPath = "/api/admin-saved-bookings";
const typedReadGateEnvName = "PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED";

const writePathPattern =
  /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(|rpc\s*\(/i;
const legacyShimPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeNonSelectedSourcePattern =
  /payment|billing|invoice|pdf|provider|send_state|send_log|auth|live_location|location_url|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;

const safeSelectedColumns = new Set([
  "booking_reference",
  "booker_id",
  "bookers.booker_name",
  "bookers.email",
  "bookers.phone",
  "booking_type",
  "child_seat_count",
  "child_seat_required",
  "child_seat_type",
  "companies.company_name",
  "companies.domain",
  "company_id",
  "contact_display_name",
  "contact_email",
  "contact_phone",
  "created_at",
  "customer_id",
  "customer_display_name",
  "customer_facing_status",
  "driver_contact",
  "driver_id",
  "driver_name",
  "driver_plate_number",
  "dropoff_address",
  "dropoff_location",
  "extra_stop_count",
  "flight_no",
  "id",
  "job_card",
  "pax",
  "passenger_name",
  "passenger_phone",
  "pax_count",
  "pickup_address",
  "pickup_at",
  "pickup_datetime",
  "pickup_location",
  "pickup_time",
  "route",
  "route_summary",
  "route_type",
  "service_type",
  "source_channel",
  "source_surface",
  "status",
  "traveler_id",
  "travelers.traveler_name",
  "updated_at",
  "vehicle",
  "vehicle_type",
  "vehicle_type_or_category",
  "admin_internal_status",
]);

const quarantinedLegacyColumns = new Set([
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
  "customer_price_amount",
  "customer_price_override_reason",
  "customer_rate",
  "customer_rate_override",
  "customer_rate_unit",
  "driver_dispatch_include_payout",
  "driver_notes",
  "driver_payout_amount",
  "driver_payout_max",
  "driver_payout_min",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_unit",
  "extra_stop_payout",
  "extra_stop_surcharge",
  "midnight_payout",
  "midnight_surcharge",
  "pricing_source",
]);

const quarantinedColumnToMapperFragment = new Map([
  ["child_seat_customer_surcharge", "child_seat_customer_surcharge"],
  ["child_seat_driver_payout", "child_seat_driver_payout"],
  ["customer_price_amount", "customer_price_amount"],
  ["customer_price_override_reason", "customer_price_override_reason"],
  ["customer_rate", "customer_rate"],
  ["customer_rate_override", "customer_rate_override"],
  ["customer_rate_unit", "customer_rate"],
  ["driver_dispatch_include_payout", "driver_dispatch_include_payout"],
  ["driver_notes", "driver_notes"],
  ["driver_payout_amount", "driver_payout_amount"],
  ["driver_payout_max", "driver_payout_max"],
  ["driver_payout_min", "driver_payout_min"],
  ["driver_payout_override", "driver_payout_override"],
  ["driver_payout_reason", "driver_payout_reason"],
  ["driver_payout_unit", "driver_payout_unit"],
  ["extra_stop_payout", "extra_stop_payout"],
  ["extra_stop_surcharge", "extra_stop_surcharge"],
  ["midnight_payout", "midnight_payout"],
  ["midnight_surcharge", "midnight_surcharge"],
  ["pricing_source", "pricing_source"],
]);

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

function splitSelect(selectSource) {
  const columns = [];
  let depth = 0;
  let current = "";

  for (const char of selectSource) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }

    if (char === "," && depth === 0) {
      columns.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    columns.push(current.trim());
  }

  return columns.flatMap((column) => {
    const nested = column.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);

    if (!nested) {
      return [column];
    }

    return splitSelect(nested[2]).map((field) => `${nested[1]}.${field}`);
  });
}

function selectedColumnsFrom(source) {
  const matches = [
    ...source.matchAll(
      /const adminSavedBooking(?:Legacy|Current|CurrentMinimal|FoundationScalar)ReadSelect =\n\s+"([^"]+)";/g,
    ),
  ];
  assert.equal(matches.length, 4, "admin saved booking read fallback selects must remain explicit string constants.");
  assertIncludes(source, "const adminSavedBookingReadSelects = [", "saved booking read fallback select list");

  return [...new Set(matches.flatMap((match) => splitSelect(match[1])))];
}

const [
  ledger,
  appPage,
  routeSource,
  typedReadGatedHelper,
  savedBookingRead,
  operationalRecordMapper,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  aiParseRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(typedReadGatedHelperPath, "utf8"),
  readFile(savedBookingReadPath, "utf8"),
  readFile(operationalRecordMapperPath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const queryShapeSection = sectionBetween(
  ledger,
  "### Load Bookings Typed Read Query Shape Guard Lock",
);

for (const phrase of [
  "Typed Load Bookings read query shape is guarded before any endpoint migration.",
  "The typed read endpoint remains gated by env-name `PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED` and must not print or require env values.",
  "The typed read query helper may read only the `bookings` table through list/detail select queries.",
  "The query helper must not use insert, update, upsert, delete, rpc, provider send, payment/PDF, auth, location/photo/calendar, parser/debug, internal/admin notes, secret/token fields, or legacy shim paths.",
  "Legacy finance/payout/rate source columns selected for compatibility must stay quarantined by field name and must only pass through `mapAdminLoadBookingsTypedReadList` or `mapAdminLoadBookingsTypedReadDetail` before any response.",
  "Typed read responses must return only safe operational `safe_dto` and `safe_card` shapes plus quarantine counts.",
  "Raw saved-booking rows must not be returned from `GET /api/admin-load-bookings-typed-read`.",
  "Load Bookings still keeps `GET /api/admin-saved-bookings` as the booking/form/detail source and fallback.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "No `/api/admin-saved-bookings` route endpoint swap is approved; the read helper may use the approved schema fallback only.",
  "No parser or `/api/ai-parse` change.",
  "No DB write, provider send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/card addition, or new shim is approved by this lock.",
  "This lock adds `scripts/test-load-bookings-typed-read-query-shape-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(queryShapeSection, phrase, `Query shape ledger phrase: ${phrase}`);
}

assertIncludes(routeSource, "export async function GET", "typed read route GET");
assertExcludes(routeSource, "export async function POST", "typed read route POST");
assertExcludes(routeSource, "export async function PUT", "typed read route PUT");
assertExcludes(routeSource, "export async function PATCH", "typed read route PATCH");
assertExcludes(routeSource, "export async function DELETE", "typed read route DELETE");
assertIncludes(routeSource, "buildAdminLoadBookingsTypedReadGateState", "typed read gate state");
assertIncludes(
  routeSource,
  'blockedResponse("Load Bookings typed read is not enabled on this server.", 503)',
  "typed read closed gate",
);
assertIncludes(routeSource, "loadAdminSavedBookingById(searchParams, actor)", "typed detail read helper");
assertIncludes(routeSource, "loadAdminSavedBookingList(searchParams, actor)", "typed list read helper");
assertIncludes(
  routeSource,
  "mapAdminLoadBookingsTypedReadDetail(result.data.booking)",
  "typed detail mapper before response",
);
assertIncludes(
  routeSource,
  "mapAdminLoadBookingsTypedReadList(result.data.bookings)",
  "typed list mapper before response",
);
assertIncludes(routeSource, "booking: mapped.booking", "typed detail mapped response");
assertIncludes(routeSource, "bookings: mapped.bookings", "typed list mapped response");
assertIncludes(routeSource, "rejected_fields: mapped.rejected_fields", "typed unsafe record rejection");
assertExcludes(routeSource, "booking: result.data.booking", "typed raw detail response");
assertExcludes(routeSource, "bookings: result.data.bookings", "typed raw list response");
assertExcludes(routeSource, writePathPattern, "typed route write path");
assertExcludes(routeSource, legacyShimPattern, "typed route legacy shim path");

assertIncludes(typedReadGatedHelper, typedReadGateEnvName, "typed read gate env name");
assertIncludes(
  typedReadGatedHelper,
  "buildAdminLoadBookingsOperationalRecordMapper",
  "typed read gated helper mapper",
);
assertIncludes(typedReadGatedHelper, "writeEnabled: false", "typed read gated helper write disabled");
assertExcludes(typedReadGatedHelper, writePathPattern, "typed read gated helper write path");
assertExcludes(typedReadGatedHelper, legacyShimPattern, "typed read gated helper legacy shim path");

assertIncludes(savedBookingRead, "createClient", "typed read helper server client boundary");
assertIncludes(savedBookingRead, "validServerDatabaseUrl", "typed read helper URL validation");
assertIncludes(savedBookingRead, "validServerCredential", "typed read helper credential validation");
assertIncludes(savedBookingRead, "SUPABASE_URL", "typed read helper env-name only");
assertIncludes(savedBookingRead, "SUPABASE_SERVICE_ROLE_KEY", "typed read helper env-name only");
assertIncludes(
  savedBookingRead,
  'new Set(["booking_id", "booking_reference", "id"])',
  "typed detail query params",
);
assertIncludes(savedBookingRead, 'new Set(["limit", "offset", "scope"])', "typed list query params");
assertIncludes(savedBookingRead, "const defaultListLimit = 25;", "typed list default limit");
assertIncludes(savedBookingRead, "const maxListLimit = 100;", "typed list max limit");
assertIncludes(savedBookingRead, "const maxListOffset = 10_000;", "typed list max offset");
assertIncludes(savedBookingRead, ".from(\"bookings\")", "typed read bookings table");
assertExcludes(savedBookingRead, /\.from\((?!["']bookings["'])/i, "typed read non-bookings table");
assertIncludes(savedBookingRead, "loadAdminSavedBookingsWithSchemaFallback", "typed read schema fallback helper");
assertIncludes(savedBookingRead, "isColumnMissingFailure", "typed read fallback scope");
assertIncludes(savedBookingRead, ".select(selectedColumns)", "typed read explicit fallback select");
assertIncludes(savedBookingRead, ".eq(\"id\", parsed.data.id)", "typed detail id filter");
assertIncludes(
  savedBookingRead,
  '.eq("booking_reference", parsed.data.booking_reference)',
  "typed detail booking-reference filter",
);
assertIncludes(savedBookingRead, ".order(\"created_at\", { ascending: false })", "typed list order");
assertIncludes(savedBookingRead, ".limit(1)", "typed detail limit");
assertIncludes(savedBookingRead, "parsed.data.offset + parsed.data.limit - 1", "typed list bounded range");
assertIncludes(savedBookingRead, ".maybeSingle()", "typed detail maybeSingle");
assertExcludes(savedBookingRead, ".select(\"*\")", "typed read wildcard select");
assertExcludes(savedBookingRead, writePathPattern, "typed read helper write path");
assertExcludes(savedBookingRead, legacyShimPattern, "typed read helper legacy shim path");

const selectedColumns = selectedColumnsFrom(savedBookingRead);

for (const selectedColumn of selectedColumns) {
  const isKnownSafe = safeSelectedColumns.has(selectedColumn);
  const isKnownQuarantined = quarantinedLegacyColumns.has(selectedColumn);

  assert.equal(
    isKnownSafe || isKnownQuarantined,
    true,
    `${selectedColumn} must be an approved safe or quarantined source column.`,
  );

  assert.equal(
    unsafeNonSelectedSourcePattern.test(selectedColumn),
    false,
    `${selectedColumn} must not select provider/payment/auth/location/photo/calendar/internal/debug/secret fields.`,
  );
}

for (const requiredColumn of safeSelectedColumns) {
  assert.ok(selectedColumns.includes(requiredColumn), `Safe selected column missing: ${requiredColumn}`);
}

for (const quarantinedColumn of quarantinedLegacyColumns) {
  assert.ok(
    selectedColumns.includes(quarantinedColumn),
    `Quarantined compatibility column missing: ${quarantinedColumn}`,
  );

  const mapperFragment = quarantinedColumnToMapperFragment.get(quarantinedColumn);
  assert.ok(mapperFragment, `Missing mapper fragment for ${quarantinedColumn}.`);
  assertIncludes(
    operationalRecordMapper,
    `"${mapperFragment}"`,
    `Operational mapper quarantine fragment ${mapperFragment}`,
  );
}

assertIncludes(
  operationalRecordMapper,
  "quarantined_field_names: collectQuarantinedFieldNames(source)",
  "operational mapper quarantined fields",
);
assertIncludes(
  operationalRecordMapper,
  "safe_card: safeCardContract.safe_card",
  "operational mapper safe card response",
);
assertIncludes(
  operationalRecordMapper,
  "safe_dto: safeDtoContract.safe_dto",
  "operational mapper safe DTO response",
);
assertExcludes(operationalRecordMapper, writePathPattern, "operational mapper write path");
assertExcludes(operationalRecordMapper, legacyShimPattern, "operational mapper legacy shim path");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
  "Load Bookings typed operational display bridge",
);
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Load Bookings legacy fallback endpoint",
);
assertIncludes(loadBookingsBlock, "setBookings(loadedBookings);", "Legacy records remain form/detail source");
assertExcludes(loadBookingsBlock, "setBookings(typedOperationalDisplay", "Typed read must not replace records");
assertExcludes(loadBookingsBlock, "setBookings(typedOperationalCards", "Typed cards must not replace records");

const typedDisplayBridge = sliceBetween(
  appPage,
  "async function fetchLoadBookingsTypedOperationalDisplayResult",
  "function getLoadBookingsOperationalDisplayTitle",
);
assertIncludes(typedDisplayBridge, `fetch(\`\${adminLoadBookingsTypedReadApiPath}?`, "typed bridge fetch");
assertIncludes(typedDisplayBridge, 'method: "GET"', "typed bridge GET");
assertIncludes(typedDisplayBridge, "operationalDisplay: null", "typed bridge rollback fallback");
assertIncludes(typedDisplayBridge, "terminalUnavailable", "typed bridge terminal outcome");
assertExcludes(typedDisplayBridge, legacySavedBookingsPath, "typed bridge direct legacy route coupling");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, typedReadPath, "Save Booking typed read separation");
assertExcludes(saveBookingBlock, legacySavedBookingsPath, "Save Booking saved-bookings separation");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "admin-saved-bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "admin-saved-bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "admin-saved-bookings detail remains");
assertExcludes(adminSavedBookingsRoute, typedReadPath, "admin-saved-bookings typed route coupling");

for (const [label, source] of [
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, "admin-load-bookings-typed-read-gated", `${label} typed helper import`);
  assertExcludes(source, "admin-load-bookings-operational-record-mapper", `${label} mapper import`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite query shape guard registration");

console.log("Load Bookings typed read query shape guard passed");
