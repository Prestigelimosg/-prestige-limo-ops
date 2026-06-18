import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const routePath = "app/api/admin-driver-payout-rules-runtime-write-action/route.ts";
const helperPath = "lib/admin-driver-payout-rules-runtime-write-action.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-driver-payout-rules-runtime-activation-readiness-guard.mjs";
const routePathFragment = "/api/admin-driver-payout-rules-runtime-write-action";
const gateEnvName = "PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED";
const allowedBookingTypeKeys = ["MNG", "DEP", "TRF", "DSP"];
const allowedRuleFields = ["min", "max", "amount", "perHour"];
const forbiddenActivationFields = [
  "customer_rate",
  "customer_price",
  "customer_rates",
  "pricing",
  "price",
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
  "parser_debug",
  "debug",
  "secret",
  "api_key",
  "access_token",
  "raw_token",
  "paynow",
  "pay_now",
  "payout_preferences",
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
  "### Driver Payout Rules Runtime Activation Readiness Guard Lock",
);

for (const phrase of [
  "Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.",
  "This is a docs/test-only activation-readiness guard for `POST /api/admin-driver-payout-rules-runtime-write-action`.",
  "The `driver_payout_rules` runtime boundary is already wired but remains closed by default through `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.",
  "Allowed driver_payout_rules activation scope remains limited to existing company/traveler `id`, action type, booking types MNG, DEP, TRF, and DSP, and payout rule fields `min`, `max`, `amount`, and `perHour`.",
  "Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.companies.driver_payout_rules` and `public.travelers.driver_payout_rules` table/policy proof, server-session admin/dispatcher proof, rollback/kill-switch proof, customer/driver finance visibility proof, and one bounded evidence window.",
  "Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.",
  "Future table/policy proof must verify `driver_payout_rules` column access for `public.companies` and `public.travelers` only and must not include customer pricing, `customer_rates`, PayNow payout details, payout preferences, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, or mock QA/dev archive fields.",
  "Future rollback/kill-switch proof must close `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy fallback/manual recovery plan intact.",
  "Any future write attempt, if separately approved, must be one bounded company/traveler `driver_payout_rules` update or clear through the existing route only.",
  "Required tests before any future activation:",
  "No env change, deployment, DB read/write execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, customer pricing, `customer_rates`, PayNow payout details, payout preferences, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, or mock QA/dev archive change is approved by this lock.",
  "This lock adds `scripts/test-driver-payout-rules-runtime-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Driver payout activation readiness phrase: ${phrase}`);
}

for (const command of [
  "node scripts/test-driver-payout-rules-runtime-activation-readiness-guard.mjs",
  "node scripts/test-driver-payout-rules-runtime-write-action-api-contract.mjs",
  "node scripts/test-driver-payout-rules-runtime-app-wiring.mjs",
  "node scripts/test-payout-approval-packet.mjs",
  "node scripts/test-payout-runtime-split-guard.mjs",
  "node scripts/test-pricing-customer-rates-approval-packet.mjs",
  "node scripts/test-customer-rates-runtime-activation-readiness-guard.mjs",
  "node scripts/test-full-driver-profile-runtime-approval-packet.mjs",
  "node scripts/test-rate-settings-runtime-approval-packet.mjs",
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
  "live write approved",
  "production approved",
  "deployment approved",
  "migration approved",
  "customer_rates approved",
  "pricing approved",
  "payment approved",
  "billing approved",
  "PayNow approved",
]) {
  assertExcludes(
    ledgerSection,
    forbiddenApprovalPhrase,
    `Forbidden driver payout activation approval phrase ${forbiddenApprovalPhrase}`,
  );
}

assertIncludes(routeSource, "export const dynamic = \"force-dynamic\";", "Driver payout route dynamic mode");
assertIncludes(routeSource, "export async function POST", "Driver payout route POST");
for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(routeSource, `export async function ${method}`, `Driver payout route ${method}`);
}
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Driver payout route admin boundary");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "Driver payout route actor adapter");
assertIncludes(routeSource, "executeAdminDriverPayoutRulesRuntimeWriteAction", "Driver payout route helper");
const routePostBlock = sliceBetween(routeSource, "export async function POST", "\n}");
assertBefore(
  routePostBlock,
  "const boundary = requireAdminDispatcherBoundary(request);",
  "executeAdminDriverPayoutRulesRuntimeWriteAction",
  "Driver payout route must validate admin/dispatcher boundary before helper execution",
);

assertIncludes(helperSource, "server-only", "Driver payout helper server-only boundary");
assertIncludes(helperSource, gateEnvName, "Driver payout runtime env gate name");
assertIncludes(helperSource, "const allowedActorRoles = new Set([\"admin\", \"dispatcher\"]);", "Driver payout allowed actor roles");
assertIncludes(helperSource, "const allowedDriverPayoutRuleKeys: BookingType[] = [\"MNG\", \"DEP\", \"TRF\", \"DSP\"];", "Driver payout allowed booking keys");
assertIncludes(helperSource, "const allowedRuleFields = new Set([\"amount\", \"max\", \"min\", \"perHour\"]);", "Driver payout allowed rule fields");
assertIncludes(helperSource, "const driverPayoutRulesWriteSelect = \"id, driver_payout_rules\";", "Driver payout safe select");
assertIncludes(helperSource, "writeGateOpen()", "Driver payout runtime gate helper");
assertIncludes(helperSource, "actorCanWrite(actor)", "Driver payout runtime actor guard");
assertIncludes(helperSource, "boundary_mode === \"server-session-role-surface\"", "Driver payout server-session boundary");
assertIncludes(helperSource, "allowedActorRoles.has(actor.actor_role)", "Driver payout admin/dispatcher roles");
assertIncludes(helperSource, "source_surface === \"admin_api\"", "Driver payout admin API surface");
assertIncludes(helperSource, "database_client_enabled: false", "Driver payout default no DB client");
assertIncludes(helperSource, "reason: \"write_gate_closed\"", "Driver payout closed gate reason");
assertIncludes(helperSource, "no_op: true", "Driver payout no-op default");
assertIncludes(
  helperSource,
  "const targetTable = contract.action_scope === \"company\" ? \"companies\" : \"travelers\";",
  "Driver payout table scope",
);
assertIncludes(helperSource, ".from(targetTable)", "Driver payout scoped table access");
assertIncludes(helperSource, ".update(writePayload(contract.driver_payout_rules))", "Driver payout safe payload update");
assertIncludes(helperSource, ".eq(\"id\", contract.id as number)", "Driver payout id-scoped update");
assertIncludes(helperSource, ".select(driverPayoutRulesWriteSelect)", "Driver payout safe select call");
assertExcludes(helperSource, "adminLegacyDataClient", "Driver payout helper legacy data client");
assertExcludes(helperSource, "adminLegacyTables", "Driver payout helper legacy table shim");
assertExcludes(helperSource, "/api/admin-legacy-data", "Driver payout helper legacy route");
assertExcludes(helperSource, ".from(\"rate_settings\")", "Driver payout helper rate_settings table");
assertExcludes(helperSource, ".from(\"customer_rates\")", "Driver payout helper customer_rates table");

const executeBlock = sliceBetween(
  helperSource,
  "export async function executeAdminDriverPayoutRulesRuntimeWriteAction",
  "\n}",
);
assertBefore(executeBlock, "if (!contract.ok)", "if (!writeGateOpen())", "Driver payout contract must reject before gate check");
assertBefore(executeBlock, "if (!writeGateOpen())", "if (!actorCanWrite(actor))", "Driver payout gate before actor check");
assertBefore(executeBlock, "if (!actorCanWrite(actor))", "client = getRuntimeWriteClient(options)", "Driver payout actor before DB client");
assertBefore(executeBlock, "client = getRuntimeWriteClient(options)", ".from(targetTable)", "Driver payout DB client before table access");

const writePayload = sliceBetween(helperSource, "function writePayload", "function toDriverPayoutRulesRecord");
assertIncludes(writePayload, "driver_payout_rules: fields", "Driver payout write payload field");
assertIncludes(writePayload, "updated_at: new Date().toISOString()", "Driver payout write payload timestamp");
for (const forbiddenField of forbiddenActivationFields) {
  assertExcludes(writePayload, forbiddenField, `Driver payout write payload forbidden field ${forbiddenField}`);
}

const selectLine = helperSource.match(/const driverPayoutRulesWriteSelect = "([^"]+)";/)?.[1] || "";
assertIncludes(selectLine, "id", "Driver payout select id");
assertIncludes(selectLine, "driver_payout_rules", "Driver payout select driver_payout_rules");
for (const forbiddenField of forbiddenActivationFields) {
  assertExcludes(selectLine, forbiddenField, `Driver payout select forbidden field ${forbiddenField}`);
}

for (const key of allowedBookingTypeKeys) {
  assertIncludes(helperSource, `"${key}"`, `Driver payout allowed booking key ${key}`);
}
for (const field of allowedRuleFields) {
  assertIncludes(helperSource, `"${field}"`, `Driver payout allowed rule field ${field}`);
}
for (const forbiddenField of [
  "customer_rates",
  "customer_price",
  "payment",
  "billing",
  "invoice",
  "pdf",
  "paynow",
  "payout_preferences",
]) {
  assertIncludes(helperSource, forbiddenField, `Driver payout forbidden field guard ${forbiddenField}`);
}

const saveDriverPayoutRulesRuntime = sliceBetween(
  appPage,
  "async function saveDriverPayoutRulesRuntime",
  "function fullDriverProfileRuntimeRecordId",
);
assertIncludes(appPage, `const adminDriverPayoutRulesRuntimeWriteActionApiPath =\n  "${routePathFragment}";`, "app route path constant");
assertIncludes(saveDriverPayoutRulesRuntime, "fetch(adminDriverPayoutRulesRuntimeWriteActionApiPath", "app driver payout runtime fetch");
assertIncludes(saveDriverPayoutRulesRuntime, 'method: "POST"', "app driver payout runtime POST");
assertIncludes(saveDriverPayoutRulesRuntime, '"x-prestige-admin-purpose": adminLegacyDataPurpose', "app driver payout admin purpose");
assertIncludes(saveDriverPayoutRulesRuntime, "payload: DriverPayoutRulesRuntimeWritePayload", "app driver payout typed payload");
assertIncludes(saveDriverPayoutRulesRuntime, "body: JSON.stringify(payload)", "app driver payout payload body");
assertIncludes(saveDriverPayoutRulesRuntime, "isDriverPayoutRulesRuntimeWriteBlockedNoOp", "app driver payout closed-gate no-op");
assertExcludes(
  saveDriverPayoutRulesRuntime,
  /customer_rates|customer_rate|customer_price|payment|billing|invoice|pdf|provider|send_state|send_log|auth|location|photo|calendar|internal|admin_notes|debug|secret|api_key|access_token|raw_token|paynow|pay_now|payout_preferences/i,
  "app driver payout runtime forbidden payload/API fields",
);

const companyPayoutRuntimePayload = sliceBetween(
  appPage,
  "function buildCompanyDriverPayoutRulesRuntimeWritePayload",
  "function buildTravelerDriverPayoutRulesRuntimeWritePayload",
);
const travelerPayoutRuntimePayload = sliceBetween(
  appPage,
  "function buildTravelerDriverPayoutRulesRuntimeWritePayload",
  "function buildCompanyDriverPayoutOverridePayload",
);
for (const [label, source] of [
  ["Company driver_payout_rules runtime payload", companyPayoutRuntimePayload],
  ["Traveler driver_payout_rules runtime payload", travelerPayoutRuntimePayload],
]) {
  assertIncludes(source, "driver_payout_rules", label);
  assertExcludes(
    source,
    /customerRates|customer_rates|customerRate|customerPrice|customer_price|pricing|payment|billing|invoice|pdf|provider|send|auth|location|photo|calendar|internal|debug|secret|token|paynow|payout_preferences/i,
    label,
  );
}

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint remains unchanged");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM driver payout route separation");

assertExcludes(aiParseRoute, routePathFragment, "Parser route driver payout runtime separation");
assertExcludes(aiParseRoute, "executeAdminDriverPayoutRulesRuntimeWriteAction", "Parser helper driver payout separation");
assertExcludes(aiParseRoute, "driver_payout_rules", "Parser driver payout rules separation");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings route driver payout runtime separation");
assertExcludes(adminBookingsRoute, "executeAdminDriverPayoutRulesRuntimeWriteAction", "Admin bookings helper driver payout separation");
assertExcludes(adminBookingsRoute, "driver_payout_rules", "Admin bookings safe persistence payout separation");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings route driver payout runtime separation");
assertExcludes(adminSavedBookingsRoute, "executeAdminDriverPayoutRulesRuntimeWriteAction", "Admin saved bookings helper driver payout separation");

assertIncludes(preactivationSuite, guardScript, "Preactivation suite driver payout activation guard registration");

console.log("driver_payout_rules runtime activation readiness guard passed");
