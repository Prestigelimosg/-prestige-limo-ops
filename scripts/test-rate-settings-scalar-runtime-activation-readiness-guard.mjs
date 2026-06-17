import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const routePath = "app/api/admin-rate-settings-runtime-write-action/route.ts";
const helperPath = "lib/admin-rate-settings-runtime-write-action.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-rate-settings-scalar-runtime-activation-readiness-guard.mjs";
const routePathFragment = "/api/admin-rate-settings-runtime-write-action";
const gateEnvName = "PRESTIGE_RATE_SETTINGS_WRITE_ENABLED";
const allowedScalarFields = [
  "id",
  "midnight_surcharge",
  "extra_stop_surcharge",
  "midnight_payout",
  "extra_stop_payout",
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
];
const forbiddenActivationFields = [
  "customer_rates",
  "driver_payout_rules",
  "customer_price",
  "customer_rate",
  "rate_override",
  "pricing",
  "payout",
  "payment",
  "pdf",
  "billing",
  "provider",
  "send",
  "auth",
  "location",
  "photo",
  "calendar",
  "internal",
  "admin_notes",
  "parser",
  "debug",
  "secret",
  "api_key",
  "access_token",
  "mock",
  "archive",
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

function countMatches(source, fragmentOrPattern) {
  if (fragmentOrPattern instanceof RegExp) {
    return [...source.matchAll(fragmentOrPattern)].length;
  }

  return source.split(fragmentOrPattern).length - 1;
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
  "### Rate Settings Scalar Runtime Activation Readiness Guard Lock",
);

for (const phrase of [
  "Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`.",
  "This is a docs/test-only activation-readiness guard for `POST /api/admin-rate-settings-runtime-write-action`.",
  "The `rate_settings` scalar runtime boundary is already wired but remains closed by default through `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`.",
  "Allowed scalar `rate_settings` fields remain limited to `midnight_surcharge`, `extra_stop_surcharge`, `midnight_payout`, `extra_stop_payout`, `child_seat_customer_surcharge`, and `child_seat_driver_payout` with `id` fixed to `default`.",
  "Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.rate_settings` table/policy proof, server-session admin/dispatcher proof, rollback/kill-switch proof, and one bounded evidence window.",
  "Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.",
  "Future table/policy proof must verify scalar-column access for `public.rate_settings` only and must not include `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, or mock QA/dev archive fields.",
  "Future rollback/kill-switch proof must close `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy fallback/manual recovery plan intact.",
  "Any future write attempt, if separately approved, must be one default-row scalar upsert through the existing route only.",
  "Required tests before any future activation:",
  "No env change, deployment, DB read/write execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, or mock QA/dev archive change is approved by this lock.",
  "This lock adds `scripts/test-rate-settings-scalar-runtime-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Rate settings scalar activation readiness phrase: ${phrase}`);
}

for (const command of [
  "node scripts/test-rate-settings-scalar-runtime-activation-readiness-guard.mjs",
  "node scripts/test-rate-settings-runtime-write-action-api-contract.mjs",
  "node scripts/test-rate-settings-scalar-runtime-legacy-fallback-guard.mjs",
  "node scripts/test-rate-settings-runtime-approval-packet.mjs",
  "node scripts/test-admin-rate-settings-write-action-disabled-setup-api-contract.mjs",
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
  "customer_rates approved",
  "driver_payout_rules approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(
    ledgerSection,
    forbiddenApprovalPhrase,
    `Forbidden rate settings activation approval phrase ${forbiddenApprovalPhrase}`,
  );
}

assertIncludes(routeSource, "export async function POST", "Rate settings scalar runtime activation route POST");
for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(routeSource, `export async function ${method}`, `Rate settings scalar runtime route ${method}`);
}
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Rate settings scalar route admin boundary");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "Rate settings scalar route actor adapter");
assertIncludes(routeSource, "executeAdminRateSettingsRuntimeWriteAction", "Rate settings scalar route helper");

assertIncludes(helperSource, gateEnvName, "Rate settings scalar runtime env gate name");
assertIncludes(helperSource, ".from(\"rate_settings\")", "Rate settings scalar runtime table");
assertIncludes(
  helperSource,
  ".upsert(writePayload(setup.rate_settings_fields), { onConflict: \"id\" })",
  "Rate settings scalar runtime default-row upsert",
);
assertIncludes(helperSource, ".select(rateSettingsWriteSelect)", "Rate settings scalar runtime safe select");
assertIncludes(helperSource, "writeGateOpen()", "Rate settings scalar runtime gate helper");
assertIncludes(helperSource, "actorCanWrite(actor)", "Rate settings scalar runtime actor guard");
assertIncludes(helperSource, "boundary_mode === \"server-session-role-surface\"", "Rate settings scalar runtime server-session boundary");
assertIncludes(helperSource, "allowedActorRoles.has(actor.actor_role)", "Rate settings scalar runtime admin/dispatcher roles");
assertIncludes(helperSource, "source_surface === \"admin_api\"", "Rate settings scalar runtime admin API surface");
assertIncludes(helperSource, "database_client_enabled: false", "Rate settings scalar runtime default no DB client");
assertIncludes(helperSource, "reason: \"write_gate_closed\"", "Rate settings scalar runtime closed gate reason");
assertIncludes(helperSource, "no_op: true", "Rate settings scalar runtime no-op default");

const executeBlock = sliceBetween(
  helperSource,
  "export async function executeAdminRateSettingsRuntimeWriteAction",
  "\n}",
);
const gateIndex = executeBlock.indexOf("if (!writeGateOpen())");
const actorIndex = executeBlock.indexOf("if (!actorCanWrite(actor))");
const clientIndex = executeBlock.indexOf("client = getRuntimeWriteClient(options)");
assert.ok(gateIndex >= 0, "Rate settings scalar runtime execute must check the write gate.");
assert.ok(actorIndex > gateIndex, "Rate settings scalar runtime execute must validate the actor after the gate.");
assert.ok(clientIndex > actorIndex, "Rate settings scalar runtime execute must create a DB client only after actor validation.");
assert.equal(
  countMatches(helperSource, /\.from\("rate_settings"\)/g),
  1,
  "Rate settings scalar runtime helper must use one rate_settings table access.",
);

const selectLine = helperSource.match(/const rateSettingsWriteSelect =\n\s+"([^"]+)";/)?.[1] || "";
for (const field of allowedScalarFields) {
  assertIncludes(selectLine, field, `Rate settings scalar select field ${field}`);
}
for (const forbiddenField of forbiddenActivationFields) {
  if (allowedScalarFields.some((field) => field.includes(forbiddenField))) {
    continue;
  }
  assertExcludes(selectLine, forbiddenField, `Rate settings scalar select forbidden field ${forbiddenField}`);
}

const writePayload = sliceBetween(helperSource, "function writePayload", "function writableFieldCount");
for (const field of allowedScalarFields) {
  assertIncludes(writePayload, field, `Rate settings scalar write payload field ${field}`);
}
for (const forbiddenField of forbiddenActivationFields) {
  if (allowedScalarFields.some((field) => field.includes(forbiddenField))) {
    continue;
  }
  assertExcludes(writePayload, forbiddenField, `Rate settings scalar write payload forbidden field ${forbiddenField}`);
}

const scalarRuntimeClientHelper = sliceBetween(
  appPage,
  "async function saveDefaultRateSettingsScalarRuntime",
  "type CompanyCrmIdentityContactPayload",
);
assertIncludes(appPage, `const adminRateSettingsRuntimeWriteActionApiPath =\n  "${routePathFragment}";`, "app route path constant");
assertIncludes(scalarRuntimeClientHelper, "fetch(adminRateSettingsRuntimeWriteActionApiPath", "app scalar runtime fetch");
assertIncludes(scalarRuntimeClientHelper, "payload: DefaultRateSettingsScalarRuntimePayload", "app scalar payload type");
assertIncludes(scalarRuntimeClientHelper, 'method: "POST"', "app scalar runtime POST");
assertIncludes(scalarRuntimeClientHelper, '"x-prestige-admin-purpose": adminLegacyDataPurpose', "app scalar admin purpose");
assertIncludes(scalarRuntimeClientHelper, "isRateSettingsRuntimeWriteBlockedNoOp", "app scalar closed-gate no-op");
assertExcludes(scalarRuntimeClientHelper, "customer_rates", "app scalar runtime customer rate maps");
assertExcludes(scalarRuntimeClientHelper, "driver_payout_rules", "app scalar runtime driver payout maps");

const saveDefaultRates = sliceBetween(appPage, "async function saveDefaultRates", "async function saveRateOverride");
assertIncludes(saveDefaultRates, ".from(adminLegacyTables.rateSettings)", "saveDefaultRates parked legacy fallback");
assertIncludes(saveDefaultRates, "customer_rates: customerRates", "saveDefaultRates parked customer_rates maps");
assertIncludes(saveDefaultRates, "driver_payout_rules: driverPayoutRules", "saveDefaultRates parked driver_payout_rules maps");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint remains unchanged");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM rate settings scalar route separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const [label, source] of [
  ["ai-parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, routePathFragment, `${label} rate settings scalar activation separation`);
  assertExcludes(source, "executeAdminRateSettingsRuntimeWriteAction", `${label} rate settings scalar helper separation`);
}

assertIncludes(preactivationSuite, guardScript, "Preactivation suite activation readiness guard registration");

console.log("rate settings scalar runtime activation readiness guard passed");
