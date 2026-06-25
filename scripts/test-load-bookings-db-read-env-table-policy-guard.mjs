import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const routePath = "app/api/admin-load-bookings-typed-read/route.ts";
const typedReadGatedHelperPath = "lib/admin-load-bookings-typed-read-gated.ts";
const savedBookingReadPath = "lib/admin-saved-booking-read.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-load-bookings-db-read-env-table-policy-guard.mjs";
const typedReadGateEnvName = "PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED";
const typedReadPath = "/api/admin-load-bookings-typed-read";
const legacySavedBookingsPath = "/api/admin-saved-bookings";

const writePathPattern =
  /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(|rpc\s*\(/i;
const legacyShimPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeSelectedSourcePattern =
  /payment|billing|invoice|pdf|provider|send_state|send_log|auth|live_location|location_url|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|access_token|raw_token/i;

const requiredLedgerPhrases = [
  "Load Bookings DB-read env/table-policy readiness is guarded without executing a live DB read.",
  "This lock does not approve DB-read activation, endpoint migration, env changes, deployment, migrations, or live reads.",
  "Required env names are limited to `PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`; env values must not be printed, logged, committed, or echoed.",
  "Future typed read activation must verify the target `bookings` table, joined read relationships `companies`, `bookers`, and `travelers`, read-only policy/RLS posture, and rollback before opening the gate.",
  "The read helper must validate admin/dispatcher actor boundary before creating a Supabase client.",
  "When booking persistence is enabled, the read helper must require `server-session-role-surface` and admin/dispatcher role before DB-read execution.",
  "The read helper must use read-only list/detail operators only: select, eq, order, limit, and maybeSingle.",
  "The read helper must not use insert, update, upsert, delete, rpc, storage, provider send, payment/PDF, auth, location/photo/calendar, parser/debug, internal/admin notes, secret/token fields, or legacy shim paths.",
  "Load Bookings still keeps `GET /api/admin-saved-bookings` as booking/form/detail source and fallback.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "No `/api/admin-saved-bookings` route/helper change.",
  "No parser or `/api/ai-parse` change.",
  "No UI sector/card addition or new shim is approved by this lock.",
  "This lock adds `scripts/test-load-bookings-db-read-env-table-policy-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
];

const allowedSelectedColumns = new Set([
  "booking_reference",
  "booker_id",
  "bookers.booker_name",
  "bookers.email",
  "bookers.phone",
  "booking_type",
  "child_seat_count",
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
  "child_seat_required",
  "child_seat_type",
  "companies.company_name",
  "companies.domain",
  "company_id",
  "contact_display_name",
  "contact_email",
  "contact_phone",
  "created_at",
  "customer_display_name",
  "customer_price_amount",
  "customer_price_override_reason",
  "customer_rate",
  "customer_rate_override",
  "customer_rate_unit",
  "driver_contact",
  "driver_dispatch_include_payout",
  "driver_id",
  "driver_name",
  "driver_notes",
  "driver_payout_amount",
  "driver_payout_max",
  "driver_payout_min",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_unit",
  "driver_plate_number",
  "dropoff_address",
  "dropoff_location",
  "extra_stop_count",
  "extra_stop_payout",
  "extra_stop_surcharge",
  "flight_no",
  "id",
  "job_card",
  "midnight_payout",
  "midnight_surcharge",
  "pax",
  "passenger_name",
  "passenger_phone",
  "pax_count",
  "pickup_address",
  "pickup_at",
  "pickup_datetime",
  "pickup_location",
  "pickup_time",
  "pricing_source",
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

function countMatches(source, fragmentOrPattern) {
  if (fragmentOrPattern instanceof RegExp) {
    return [...source.matchAll(fragmentOrPattern)].length;
  }

  return source.split(fragmentOrPattern).length - 1;
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
  const match = source.match(/const adminSavedBookingReadSelect =\n\s+"([^"]+)";/);
  assert.ok(match, "adminSavedBookingReadSelect must remain an explicit string constant.");

  return splitSelect(match[1]);
}

const [
  ledger,
  appPage,
  routeSource,
  typedReadGatedHelper,
  savedBookingRead,
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
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Load Bookings DB Read Env Table Policy Guard Lock",
);

for (const phrase of requiredLedgerPhrases) {
  assertIncludes(ledgerSection, phrase, `DB-read env/table-policy ledger phrase: ${phrase}`);
}

for (const forbiddenPhrase of [
  "DB-read activation is approved",
  "endpoint migration is approved",
  "env values may be printed",
  "live read approved",
  "write path approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, `Forbidden ledger phrase ${forbiddenPhrase}`);
}

assertIncludes(typedReadGatedHelper, typedReadGateEnvName, "typed read gate env-name");
assertIncludes(
  typedReadGatedHelper,
  `process.env[adminLoadBookingsTypedReadEnabledEnvName] === "true"`,
  "typed read strict gate check",
);
assertIncludes(typedReadGatedHelper, "writeEnabled: false", "typed read write disabled");
assertIncludes(typedReadGatedHelper, "liveWriteEnabled: false", "typed read live write disabled");
assertExcludes(typedReadGatedHelper, writePathPattern, "typed read gated helper write path");
assertExcludes(typedReadGatedHelper, legacyShimPattern, "typed read gated helper legacy shim path");

assertIncludes(routeSource, "export async function GET", "typed read route GET");
assertExcludes(routeSource, "export async function POST", "typed read route POST");
assertExcludes(routeSource, "export async function PUT", "typed read route PUT");
assertExcludes(routeSource, "export async function PATCH", "typed read route PATCH");
assertExcludes(routeSource, "export async function DELETE", "typed read route DELETE");
assertIncludes(routeSource, "buildAdminLoadBookingsTypedReadGateState", "typed read gate state");
assertIncludes(
  routeSource,
  'blockedResponse("Load Bookings typed read is not enabled on this server.", 503)',
  "typed read closed gate response",
);
assertIncludes(routeSource, "loadAdminSavedBookingById(searchParams, actor)", "typed detail read helper");
assertIncludes(routeSource, "loadAdminSavedBookingList(searchParams, actor)", "typed list read helper");
assertIncludes(
  routeSource,
  "mapAdminLoadBookingsTypedReadDetail(result.data.booking)",
  "typed detail mapper boundary",
);
assertIncludes(
  routeSource,
  "mapAdminLoadBookingsTypedReadList(result.data.bookings)",
  "typed list mapper boundary",
);
assertIncludes(routeSource, "booking: mapped.booking", "typed detail safe mapped response");
assertIncludes(routeSource, "bookings: mapped.bookings", "typed list safe mapped response");
assertExcludes(routeSource, "booking: result.data.booking", "typed raw detail response");
assertExcludes(routeSource, "bookings: result.data.bookings", "typed raw list response");
assertExcludes(routeSource, writePathPattern, "typed route write path");
assertExcludes(routeSource, legacyShimPattern, "typed route legacy shim path");
assertExcludes(routeSource, "console.", "typed route env/log output");

assertIncludes(savedBookingRead, 'new Set(["admin", "dispatcher", "system"])', "read helper actor roles");
assertIncludes(savedBookingRead, 'new Set(["booking_id", "id"])', "detail read params");
assertIncludes(savedBookingRead, 'new Set(["limit"])', "list read params");
assertIncludes(savedBookingRead, "const defaultListLimit = 25;", "default list limit");
assertIncludes(savedBookingRead, "const maxListLimit = 100;", "max list limit");
assertIncludes(savedBookingRead, "validServerDatabaseUrl", "server URL validation");
assertIncludes(savedBookingRead, "validServerCredential", "server credential validation");
assertIncludes(savedBookingRead, "configValueOrNull(process.env.SUPABASE_URL)", "server URL env-name");
assertIncludes(
  savedBookingRead,
  "configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY)",
  "server service role env-name",
);
assertExcludes(savedBookingRead, "NEXT_PUBLIC_SUPABASE", "public Supabase env names");
assertExcludes(savedBookingRead, "SUPABASE_ANON_KEY", "anon Supabase env name");
assertExcludes(savedBookingRead, "console.", "read helper env/log output");

const validateActorBlock = sliceBetween(savedBookingRead, "function validateActor", "function getSavedBookingClient");
assertIncludes(validateActorBlock, "allowedAdapterActorRoles.has(actor.actor_role)", "actor role validation");
assertIncludes(validateActorBlock, 'actor.source_surface !== "admin_api"', "actor source validation");
assertIncludes(validateActorBlock, "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED", "persistence gate actor hardening");
assertIncludes(
  validateActorBlock,
  'actor.boundary_mode !== "server-session-role-surface"',
  "server session boundary mode validation",
);
assertIncludes(
  validateActorBlock,
  '!["admin", "dispatcher"].includes(actor.actor_role)',
  "server session role validation",
);

const clientBlock = sliceBetween(savedBookingRead, "function getSavedBookingClient", "function readParamsValue");
const validateIndex = clientBlock.indexOf("const actorResult = validateActor(actor);");
const supabaseUrlIndex = clientBlock.indexOf("const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);");
const createClientIndex = clientBlock.indexOf("createClient(supabaseUrl as string, serviceRoleKey as string");
assert.ok(validateIndex >= 0, "getSavedBookingClient must validate actor.");
assert.ok(supabaseUrlIndex > validateIndex, "env names must be read only after actor validation.");
assert.ok(createClientIndex > supabaseUrlIndex, "Supabase client must be created only after env validation.");
assertIncludes(clientBlock, "validServerDatabaseUrl(supabaseUrl)", "client URL validation");
assertIncludes(clientBlock, "validServerCredential(serviceRoleKey)", "client credential validation");

assert.equal(
  countMatches(savedBookingRead, /\.from\("bookings"\)/g),
  2,
  "typed read helper must use exactly the two bookings list/detail table reads.",
);
assertExcludes(savedBookingRead, /\.from\((?!["']bookings["'])/i, "typed read non-bookings table");
assertIncludes(savedBookingRead, ".select(adminSavedBookingReadSelect)", "typed read explicit select");
assertIncludes(savedBookingRead, ".eq(\"id\", parsed.data.id)", "typed detail id filter");
assertIncludes(savedBookingRead, ".order(\"created_at\", { ascending: false })", "typed list order");
assertIncludes(savedBookingRead, ".limit(1)", "typed detail limit");
assertIncludes(savedBookingRead, ".limit(parsed.data.limit)", "typed list limit");
assertIncludes(savedBookingRead, ".maybeSingle()", "typed detail maybeSingle");
assertExcludes(savedBookingRead, ".select(\"*\")", "typed read wildcard select");
assertExcludes(savedBookingRead, ".storage", "typed read storage path");
assertExcludes(savedBookingRead, writePathPattern, "typed read helper write path");
assertExcludes(savedBookingRead, legacyShimPattern, "typed read helper legacy shim path");

for (const relationship of [
  "companies(company_name, domain)",
  "bookers(booker_name, email, phone)",
  "travelers(traveler_name)",
]) {
  assertIncludes(savedBookingRead, relationship, `typed read relationship ${relationship}`);
}

for (const forbiddenRelationship of [
  "customer_rates(",
  "driver_payout_rules(",
  "payments(",
  "invoices(",
  "providers(",
  "drivers(",
  "admin_notes(",
]) {
  assertExcludes(savedBookingRead, forbiddenRelationship, `forbidden typed read relationship ${forbiddenRelationship}`);
}

for (const selectedColumn of selectedColumnsFrom(savedBookingRead)) {
  assert.ok(
    allowedSelectedColumns.has(selectedColumn),
    `${selectedColumn} must be approved before joining the typed read select.`,
  );
  assert.equal(
    unsafeSelectedSourcePattern.test(selectedColumn),
    false,
    `${selectedColumn} must not select provider/payment/auth/location/photo/calendar/internal/debug fields.`,
  );
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
  "Load Bookings typed display bridge",
);
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "Load Bookings legacy booking/form/detail source",
);
assertIncludes(loadBookingsBlock, "setBookings(loadedBookings);", "legacy records remain action source");
assertExcludes(loadBookingsBlock, "setBookings(typedOperational", "typed DTO must not replace form records");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, typedReadPath, "Save Booking typed read separation");
assertExcludes(saveBookingBlock, legacySavedBookingsPath, "Save Booking saved-bookings separation");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "admin-saved-bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "admin-saved-bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "admin-saved-bookings detail remains");
assertExcludes(adminSavedBookingsRoute, typedReadPath, "admin-saved-bookings typed read route coupling");

for (const [label, source] of [
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, "admin-load-bookings-typed-read-gated", `${label} typed read gated helper import`);
  assertExcludes(source, "admin-load-bookings-operational-record-mapper", `${label} operational mapper import`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite DB-read env/table-policy guard registration");

console.log("Load Bookings DB read env/table-policy guard passed");
