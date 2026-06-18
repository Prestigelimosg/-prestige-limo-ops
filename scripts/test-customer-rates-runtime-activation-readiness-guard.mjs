import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const routePath = "app/api/admin-customer-rates-runtime-write-action/route.ts";
const helperPath = "lib/admin-customer-rates-runtime-write-action.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-customer-rates-runtime-activation-readiness-guard.mjs";
const routePathFragment = "/api/admin-customer-rates-runtime-write-action";
const gateEnvName = "PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED";
const allowedCustomerRateKeys = ["MNG", "DEP", "TRF", "DSP"];
const forbiddenActivationFields = [
  "driver_payout_rules",
  "driver_payout",
  "payout",
  "paynow",
  "pay_now",
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
  "### Customer Rates Runtime Activation Readiness Guard Lock",
);

for (const phrase of [
  "Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.",
  "This is a docs/test-only activation-readiness guard for `POST /api/admin-customer-rates-runtime-write-action`.",
  "The `customer_rates` runtime boundary is already wired but remains closed by default through `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.",
  "Allowed customer_rates activation scope remains limited to existing company/traveler `id`, action type, and safe `customer_rates` keys only: MNG, DEP, TRF, and DSP.",
  "Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.companies.customer_rates` and `public.travelers.customer_rates` table/policy proof, server-session admin/dispatcher proof, rollback/kill-switch proof, and one bounded evidence window.",
  "Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.",
  "Future table/policy proof must verify `customer_rates` column access for `public.companies` and `public.travelers` only and must not include `driver_payout_rules`, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, or mock QA/dev archive fields.",
  "Future rollback/kill-switch proof must close `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy fallback/manual recovery plan intact.",
  "Any future write attempt, if separately approved, must be one bounded company/traveler `customer_rates` update or clear through the existing route only.",
  "Required tests before any future activation:",
  "No env change, deployment, DB read/write execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, `driver_payout_rules`, payout, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, or mock QA/dev archive change is approved by this lock.",
  "This lock adds `scripts/test-customer-rates-runtime-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Customer rates activation readiness phrase: ${phrase}`);
}

for (const command of [
  "node scripts/test-customer-rates-runtime-activation-readiness-guard.mjs",
  "node scripts/test-customer-rates-runtime-write-action-api-contract.mjs",
  "node scripts/test-customer-rates-runtime-app-wiring.mjs",
  "node scripts/test-customer-rates-runtime-create-path-guard.mjs",
  "node scripts/test-pricing-customer-rates-approval-packet.mjs",
  "node scripts/test-pricing-customer-rates-boundary-split.mjs",
  "node scripts/test-rate-override-split-gating-plan.mjs",
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
  "driver_payout_rules approved",
  "payout approved",
  "payment approved",
  "billing approved",
]) {
  assertExcludes(
    ledgerSection,
    forbiddenApprovalPhrase,
    `Forbidden customer rates activation approval phrase ${forbiddenApprovalPhrase}`,
  );
}

assertIncludes(routeSource, "export const dynamic = \"force-dynamic\";", "Customer rates route dynamic mode");
assertIncludes(routeSource, "export async function POST", "Customer rates route POST");
for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(routeSource, `export async function ${method}`, `Customer rates route ${method}`);
}
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Customer rates route admin boundary");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "Customer rates route actor adapter");
assertIncludes(routeSource, "executeAdminCustomerRatesRuntimeWriteAction", "Customer rates route helper");
const routePostBlock = sliceBetween(routeSource, "export async function POST", "\n}");
assertBefore(
  routePostBlock,
  "const boundary = requireAdminDispatcherBoundary(request);",
  "executeAdminCustomerRatesRuntimeWriteAction",
  "Customer rates route must validate admin/dispatcher boundary before helper execution",
);

assertIncludes(helperSource, "server-only", "Customer rates helper server-only boundary");
assertIncludes(helperSource, gateEnvName, "Customer rates runtime env gate name");
assertIncludes(helperSource, "const allowedActorRoles = new Set([\"admin\", \"dispatcher\"]);", "Customer rates allowed actor roles");
assertIncludes(helperSource, "const allowedCustomerRateKeys: BookingType[] = [\"MNG\", \"DEP\", \"TRF\", \"DSP\"];", "Customer rates allowed keys");
assertIncludes(helperSource, "const customerRatesWriteSelect = \"id, customer_rates\";", "Customer rates safe select");
assertIncludes(helperSource, "writeGateOpen()", "Customer rates runtime gate helper");
assertIncludes(helperSource, "actorCanWrite(actor)", "Customer rates runtime actor guard");
assertIncludes(helperSource, "boundary_mode === \"server-session-role-surface\"", "Customer rates server-session boundary");
assertIncludes(helperSource, "allowedActorRoles.has(actor.actor_role)", "Customer rates admin/dispatcher roles");
assertIncludes(helperSource, "source_surface === \"admin_api\"", "Customer rates admin API surface");
assertIncludes(helperSource, "database_client_enabled: false", "Customer rates default no DB client");
assertIncludes(helperSource, "reason: \"write_gate_closed\"", "Customer rates closed gate reason");
assertIncludes(helperSource, "no_op: true", "Customer rates no-op default");
assertIncludes(
  helperSource,
  "const targetTable = contract.action_scope === \"company\" ? \"companies\" : \"travelers\";",
  "Customer rates table scope",
);
assertIncludes(helperSource, ".from(targetTable)", "Customer rates scoped table access");
assertIncludes(helperSource, ".update(writePayload(contract.customer_rates))", "Customer rates safe payload update");
assertIncludes(helperSource, ".eq(\"id\", contract.id as number)", "Customer rates id-scoped update");
assertIncludes(helperSource, ".select(customerRatesWriteSelect)", "Customer rates safe select call");
assertExcludes(helperSource, "adminLegacyDataClient", "Customer rates helper legacy data client");
assertExcludes(helperSource, "adminLegacyTables", "Customer rates helper legacy table shim");
assertExcludes(helperSource, "/api/admin-legacy-data", "Customer rates helper legacy route");
assertExcludes(helperSource, ".from(\"rate_settings\")", "Customer rates helper rate_settings table");
assertExcludes(helperSource, ".from(\"driver_payout_rules\")", "Customer rates helper payout table");

const executeBlock = sliceBetween(
  helperSource,
  "export async function executeAdminCustomerRatesRuntimeWriteAction",
  "\n}",
);
assertBefore(executeBlock, "if (!contract.ok)", "if (!writeGateOpen())", "Customer rates contract must reject before gate check");
assertBefore(executeBlock, "if (!writeGateOpen())", "if (!actorCanWrite(actor))", "Customer rates gate before actor check");
assertBefore(executeBlock, "if (!actorCanWrite(actor))", "client = getRuntimeWriteClient(options)", "Customer rates actor before DB client");
assertBefore(executeBlock, "client = getRuntimeWriteClient(options)", ".from(targetTable)", "Customer rates DB client before table access");

const writePayload = sliceBetween(helperSource, "function writePayload", "function toCustomerRatesRecord");
assertIncludes(writePayload, "customer_rates: fields", "Customer rates write payload field");
assertIncludes(writePayload, "updated_at: new Date().toISOString()", "Customer rates write payload timestamp");
for (const forbiddenField of forbiddenActivationFields) {
  assertExcludes(writePayload, forbiddenField, `Customer rates write payload forbidden field ${forbiddenField}`);
}

const selectLine = helperSource.match(/const customerRatesWriteSelect = "([^"]+)";/)?.[1] || "";
assertIncludes(selectLine, "id", "Customer rates select id");
assertIncludes(selectLine, "customer_rates", "Customer rates select customer_rates");
for (const forbiddenField of forbiddenActivationFields) {
  assertExcludes(selectLine, forbiddenField, `Customer rates select forbidden field ${forbiddenField}`);
}

for (const key of allowedCustomerRateKeys) {
  assertIncludes(helperSource, `"${key}"`, `Customer rates allowed key ${key}`);
}

const saveCustomerRatesRuntime = sliceBetween(
  appPage,
  "async function saveCustomerRatesRuntime",
  "function driverPayoutRulesRuntimeRejectedFields",
);
assertIncludes(appPage, `const adminCustomerRatesRuntimeWriteActionApiPath =\n  "${routePathFragment}";`, "app route path constant");
assertIncludes(saveCustomerRatesRuntime, "fetch(adminCustomerRatesRuntimeWriteActionApiPath", "app customer rates runtime fetch");
assertIncludes(saveCustomerRatesRuntime, 'method: "POST"', "app customer rates runtime POST");
assertIncludes(saveCustomerRatesRuntime, '"x-prestige-admin-purpose": adminLegacyDataPurpose', "app customer rates admin purpose");
assertIncludes(saveCustomerRatesRuntime, "payload: CustomerRatesRuntimeWritePayload", "app customer rates typed payload");
assertIncludes(saveCustomerRatesRuntime, "body: JSON.stringify(payload)", "app customer rates payload body");
assertIncludes(saveCustomerRatesRuntime, "isCustomerRatesRuntimeWriteBlockedNoOp", "app customer rates closed-gate no-op");
assertExcludes(
  saveCustomerRatesRuntime,
  /driver_payout_rules|driver_payout|driverPayout|payment|billing|invoice|pdf/i,
  "app customer rates runtime forbidden payload/API fields",
);

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint remains unchanged");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM customer rates route separation");

assertExcludes(aiParseRoute, routePathFragment, "Parser route customer rates runtime separation");
assertExcludes(aiParseRoute, "executeAdminCustomerRatesRuntimeWriteAction", "Parser helper customer rates separation");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings route customer rates runtime separation");
assertExcludes(adminBookingsRoute, "executeAdminCustomerRatesRuntimeWriteAction", "Admin bookings helper customer rates separation");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings route customer rates runtime separation");
assertExcludes(adminSavedBookingsRoute, "executeAdminCustomerRatesRuntimeWriteAction", "Admin saved bookings helper customer rates separation");

assertIncludes(preactivationSuite, guardScript, "Preactivation suite customer rates activation guard registration");

console.log("customer_rates runtime activation readiness guard passed");
