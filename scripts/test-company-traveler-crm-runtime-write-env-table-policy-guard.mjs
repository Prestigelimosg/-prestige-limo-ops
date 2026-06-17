import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const routePath = "app/api/admin-company-traveler-crm-runtime-write-action/route.ts";
const helperPath = "lib/admin-company-traveler-crm-runtime-write-action.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-company-traveler-crm-runtime-write-env-table-policy-guard.mjs";
const crmRuntimeWriteRoutePath = "/api/admin-company-traveler-crm-runtime-write-action";
const crmRuntimeWriteGateEnvName =
  "PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED";

const legacyShimPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeSourcePattern =
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|paynow|pay_now|payment|billing|invoice|pdf|finance|provider|send_state|send_log|auth_session|live_location|location_url|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|secret|api_key|access_token|raw_token/i;

const requiredLedgerPhrases = [
  "CRM identity/contact runtime write env/table-policy readiness is guarded without opening the write gate or executing a live DB write.",
  "This lock does not approve env changes, deployment, migrations, DB writes, live CRM activation, rate overrides, pricing, payout, provider/send, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, UI sectors/cards, or new shims.",
  "Required env names are limited to `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`; env values must not be printed, logged, committed, or echoed.",
  "The CRM write gate remains closed by default; closed-gate/no-op responses must preserve the existing legacy rate override fallback until a separate owner-approved gate-opening pass.",
  "Future gate opening must verify table/policy readiness for `companies` and `travelers` only.",
  "Allowed future `companies` write fields are limited to `company_name` and `domain`, plus safe returned `id`.",
  "Allowed future `travelers` write fields are limited to `company_id`, `traveler_name`, `preferred_vehicle`, `default_address`, `default_pickup_address`, `default_dropoff_address`, `booker_name`, `booker_contact`, and `booker_email`, plus safe returned `id`.",
  "Forbidden fields remain excluded: rate overrides, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and tokens.",
  "The helper must validate the CRM write gate and server-session admin/dispatcher actor boundary before creating any Supabase client.",
  "The helper must not use `adminLegacyDataClient`, `adminLegacyTables`, `/api/admin-legacy-data`, or any new shim.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains unchanged and separate.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "Rollback note: close `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`, keep the legacy rate override fallback unchanged, rerun CRM runtime, rate split, shim cleanup, preactivation, lint, build, and booking UI checks, and do not deploy or write live data until rollback is verified.",
  "This lock adds `scripts/test-company-traveler-crm-runtime-write-env-table-policy-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
];

const allowedCompanySelectColumns = new Set(["id", "company_name", "domain"]);
const allowedTravelerSelectColumns = new Set([
  "booker_contact",
  "booker_email",
  "booker_name",
  "company_id",
  "default_address",
  "default_dropoff_address",
  "default_pickup_address",
  "id",
  "preferred_vehicle",
  "traveler_name",
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

function splitColumns(source) {
  return source
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
}

function assertAllowedColumns(selectSource, allowedColumns, label) {
  for (const column of splitColumns(selectSource)) {
    assert.ok(allowedColumns.has(column), `${label} column ${column} must be explicitly allowed.`);
    assert.equal(
      unsafeSourcePattern.test(column),
      false,
      `${label} column ${column} must not expose finance, payout, payment, provider, auth, location/photo/calendar, internal, debug, token, or secret fields.`,
    );
  }
}

const [
  ledger,
  appPage,
  routeSource,
  helperSource,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  aiParseRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Company/Traveler CRM Runtime Write Env Table Policy Guard Lock",
);

for (const phrase of requiredLedgerPhrases) {
  assertIncludes(ledgerSection, phrase, `CRM env/table-policy ledger phrase: ${phrase}`);
}

for (const forbiddenPhrase of [
  "env values may be printed",
  "DB write is approved",
  "live CRM activation approved",
  "rate override activation approved",
  "pricing activation approved",
  "payout activation approved",
  "new shim approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, `Forbidden ledger phrase ${forbiddenPhrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite CRM env/table-policy guard registration");

assertIncludes(routeSource, "export async function POST", "CRM runtime write route POST");
assertExcludes(routeSource, "export async function GET", "CRM runtime write route GET");
assertExcludes(routeSource, "export async function PUT", "CRM runtime write route PUT");
assertExcludes(routeSource, "export async function PATCH", "CRM runtime write route PATCH");
assertExcludes(routeSource, "export async function DELETE", "CRM runtime write route DELETE");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "CRM route admin boundary");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "CRM route purpose boundary");
assertIncludes(
  routeSource,
  "adminDispatcherBoundaryToPersistenceAdapterActor",
  "CRM route persistence actor boundary",
);
assertIncludes(routeSource, "executeAdminCompanyTravelerCrmRuntimeWriteAction", "CRM route helper boundary");
assertExcludes(routeSource, legacyShimPattern, "CRM route legacy shim path");
assertExcludes(routeSource, "console.", "CRM route console output");

assertIncludes(helperSource, "server-only", "CRM runtime helper server-only boundary");
assertIncludes(helperSource, crmRuntimeWriteGateEnvName, "CRM runtime write gate env name");
assertIncludes(
  helperSource,
  `process.env[adminCompanyTravelerCrmRuntimeWriteActionEnvGateName] === "true"`,
  "CRM runtime strict write gate check",
);
assertIncludes(helperSource, "configValue(process.env.SUPABASE_URL)".replace("configValue", "cleanConfigValue"), "CRM runtime server URL env-name");
assertIncludes(
  helperSource,
  "cleanConfigValue(process.env.SUPABASE_SERVICE_ROLE_KEY)",
  "CRM runtime service role env-name",
);
assertExcludes(helperSource, "NEXT_PUBLIC_SUPABASE", "CRM runtime helper public Supabase env");
assertExcludes(helperSource, "SUPABASE_ANON_KEY", "CRM runtime helper anon key env");
assertExcludes(helperSource, "console.", "CRM runtime helper console output");
assertExcludes(helperSource, legacyShimPattern, "CRM runtime helper legacy shim path");
assertExcludes(helperSource, /\.from\((?!["'](?:companies|travelers)["'])/i, "CRM runtime helper non-CRM table");

const actorCanWriteBlock = sliceBetween(helperSource, "function actorCanWrite", "function getRuntimeWriteClient");
assertIncludes(
  actorCanWriteBlock,
  'actor.boundary_mode === "server-session-role-surface"',
  "CRM runtime actor server-session boundary",
);
assertIncludes(actorCanWriteBlock, "allowedActorRoles.has(actor.actor_role)", "CRM runtime actor role guard");
assertIncludes(actorCanWriteBlock, 'actor.source_surface === "admin_api"', "CRM runtime actor source guard");
assertIncludes(actorCanWriteBlock, "textOrNull(actor.actor_label)", "CRM runtime actor label guard");

const clientBlock = sliceBetween(helperSource, "function getRuntimeWriteClient", "function companyPayload");
assertIncludes(clientBlock, "validServerDatabaseUrl(supabaseUrl)", "CRM runtime server URL validation");
assertIncludes(clientBlock, "validServerCredential(serviceRoleKey)", "CRM runtime service role validation");
assertIncludes(clientBlock, "createClient(supabaseUrl as string, serviceRoleKey as string", "CRM runtime client creation");

const executeBlock = sliceBetween(
  helperSource,
  "export async function executeAdminCompanyTravelerCrmRuntimeWriteAction",
  "\n}",
);
const gateIndex = executeBlock.indexOf("if (!writeGateOpen())");
const actorIndex = executeBlock.indexOf("if (!actorCanWrite(actor))");
const clientIndex = executeBlock.indexOf("client = getRuntimeWriteClient(options)");
assert.ok(gateIndex >= 0, "CRM runtime execute must check write gate.");
assert.ok(actorIndex > gateIndex, "CRM runtime execute must validate actor after write gate.");
assert.ok(clientIndex > actorIndex, "CRM runtime execute must create DB client only after actor validation.");

const companySelect = helperSource.match(/const companyWriteSelect = "([^"]+)";/)?.[1] || "";
const travelerSelect = helperSource.match(/const travelerWriteSelect =\n\s+"([^"]+)";/)?.[1] || "";
assertAllowedColumns(companySelect, allowedCompanySelectColumns, "CRM company write select");
assertAllowedColumns(travelerSelect, allowedTravelerSelectColumns, "CRM traveler write select");
assert.equal(countMatches(helperSource, /\.from\("companies"\)/g), 2, "CRM helper must only use company insert/update table reads.");
assert.equal(countMatches(helperSource, /\.from\("travelers"\)/g), 2, "CRM helper must only use traveler insert/update table reads.");

const companyPayloadBlock = sliceBetween(helperSource, "function companyPayload", "function travelerPayload");
assertIncludes(companyPayloadBlock, "company_fields.company_name", "CRM company payload company_name");
assertIncludes(companyPayloadBlock, "company_fields.domain", "CRM company payload domain");
assertExcludes(companyPayloadBlock, unsafeSourcePattern, "CRM company payload forbidden fields");

const travelerPayloadBlock = sliceBetween(helperSource, "function travelerPayload", "function toCompanyRecord");
for (const field of [
  "booker_contact",
  "booker_email",
  "booker_name",
  "company_id",
  "default_address",
  "default_dropoff_address",
  "default_pickup_address",
  "preferred_vehicle",
  "traveler_name",
]) {
  assertIncludes(travelerPayloadBlock, `traveler_fields.${field}`, `CRM traveler payload ${field}`);
}
assertExcludes(travelerPayloadBlock, unsafeSourcePattern, "CRM traveler payload forbidden fields");

const writeCompanyBlock = sliceBetween(helperSource, "async function writeCompany", "async function writeTraveler");
assertIncludes(writeCompanyBlock, ".insert(payload)", "CRM company insert");
assertIncludes(writeCompanyBlock, ".update(payload)", "CRM company update");
assertIncludes(writeCompanyBlock, ".eq(\"id\", contract.company_fields.id)", "CRM company id update filter");
assertIncludes(writeCompanyBlock, ".select(companyWriteSelect)", "CRM company safe select");
assertIncludes(writeCompanyBlock, ".single()", "CRM company single response");
assertExcludes(writeCompanyBlock, ".upsert(", "CRM company upsert");
assertExcludes(writeCompanyBlock, ".delete(", "CRM company delete");
assertExcludes(writeCompanyBlock, ".rpc(", "CRM company rpc");

const writeTravelerBlock = sliceBetween(
  helperSource,
  "async function writeTraveler",
  "export async function executeAdminCompanyTravelerCrmRuntimeWriteAction",
);
assertIncludes(writeTravelerBlock, ".insert(payload)", "CRM traveler insert");
assertIncludes(writeTravelerBlock, ".update(payload)", "CRM traveler update");
assertIncludes(writeTravelerBlock, ".eq(\"id\", contract.traveler_fields.id)", "CRM traveler id update filter");
assertIncludes(writeTravelerBlock, ".select(travelerWriteSelect)", "CRM traveler safe select");
assertIncludes(writeTravelerBlock, ".single()", "CRM traveler single response");
assertExcludes(writeTravelerBlock, ".upsert(", "CRM traveler upsert");
assertExcludes(writeTravelerBlock, ".delete(", "CRM traveler delete");
assertExcludes(writeTravelerBlock, ".rpc(", "CRM traveler rpc");

const crmRuntimeClientHelper = sliceBetween(
  appPage,
  "async function saveCompanyTravelerCrmIdentityContactRuntime",
  "function buildCompanyRateOverridePayload",
);
assertIncludes(appPage, crmRuntimeWriteRoutePath, "app CRM runtime route path");
assertIncludes(crmRuntimeClientHelper, "fetch(adminCompanyTravelerCrmRuntimeWriteActionApiPath", "app CRM runtime fetch");
assertIncludes(crmRuntimeClientHelper, "JSON.stringify(payload)", "app CRM runtime payload");
assertIncludes(crmRuntimeClientHelper, "isCrmRuntimeWriteBlockedNoOp", "app CRM closed-gate no-op preservation");
assertExcludes(crmRuntimeClientHelper, unsafeSourcePattern, "app CRM runtime helper forbidden fields");

const saveRateOverrideBlock = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
assertIncludes(
  saveRateOverrideBlock,
  "saveCompanyTravelerCrmIdentityContactRuntime",
  "rate override flow CRM runtime split",
);
assertIncludes(
  saveRateOverrideBlock,
  "buildCompanyRateOverridePayload",
  "rate override flow keeps rate lane separate",
);
assertIncludes(
  saveRateOverrideBlock,
  "buildTravelerRateOverridePayload",
  "rate override flow keeps traveler rate lane separate",
);
assertIncludes(
  saveRateOverrideBlock,
  "buildLegacyCompanyRateOverrideInsertPayload",
  "closed-gate company fallback preserved",
);
assertIncludes(
  saveRateOverrideBlock,
  "buildLegacyTravelerRateOverrideInsertPayload",
  "closed-gate traveler fallback preserved",
);

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBookingBlock, crmRuntimeWriteRoutePath, "Save Booking CRM runtime route separation");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking saved-bookings separation");

for (const [label, source] of [
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, crmRuntimeWriteRoutePath, `${label} CRM runtime route coupling`);
  assertExcludes(
    source,
    "executeAdminCompanyTravelerCrmRuntimeWriteAction",
    `${label} CRM runtime helper import`,
  );
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "admin-saved-bookings GET remains");
assertExcludes(aiParseRoute, "admin-company-traveler-crm-runtime-write-action", "parser CRM route separation");

console.log("company/traveler CRM runtime write env/table-policy guard passed");
