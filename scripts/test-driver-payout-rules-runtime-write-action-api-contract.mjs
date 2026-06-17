import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-driver-payout-rules-runtime-write-action/route.ts";
const helperPath = "lib/admin-driver-payout-rules-runtime-write-action.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";

const routePathFragment = "/api/admin-driver-payout-rules-runtime-write-action";
const guardScript = "scripts/test-driver-payout-rules-runtime-write-action-api-contract.mjs";
const gateEnvName = "PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED";
const forbiddenRuntimeWiringPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const forbiddenNonPayoutOutputPattern =
  /customer_rate|customer_price|customer_rates|pricing_snapshot|payment|billing|invoice|pdf|provider|send_state|send_log|auth_session|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token|paynow|pay_now|payout_preferences/i;
const originalEnv = {
  [gateEnvName]: process.env[gateEnvName],
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
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

function setEnv(overrides) {
  restoreEnv();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
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

function safeInput(overrides = {}) {
  return {
    action_type: "company_driver_payout_rules_update",
    driver_payout_rules: {
      DSP: { amount: 50, perHour: true },
      MNG: { max: 75, min: 65 },
    },
    id: 42,
    ...overrides,
  };
}

function travelerInput() {
  return safeInput({
    action_type: "traveler_driver_payout_rules_update",
    driver_payout_rules: {
      DEP: { max: 65, min: 55 },
      TRF: { amount: 45 },
    },
    id: 88,
  });
}

function forbiddenInput() {
  return {
    ...safeInput(),
    customer_rates: { MNG: 100 },
    customer_price_amount: 120,
    payment: { status: "paid" },
    pricing_snapshot: { amount: 100 },
    payout_preferences: "PayNow payout",
  };
}

function assertNoNonPayoutOutput(value, label) {
  assert.equal(
    forbiddenNonPayoutOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose customer pricing, payment, billing, provider, auth, location, photo, calendar, internal, parser, mock, token, PayNow, or secret output.`,
  );
}

function assertClosedGate(value, label, expectedDriverPayoutRules) {
  assert.equal(value.ok, false, `${label} must not save.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
  assert.equal(value.reason, "write_gate_closed", `${label} must keep the driver payout write gate closed.`);
  assert.equal(value.write_gate_open, false, `${label} must keep write_gate_open false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.env_gate_name, gateEnvName, `${label} must expose only the env gate name.`);
  assert.deepEqual(
    value.driver_payout_rules,
    expectedDriverPayoutRules,
    `${label} must keep safe driver payout rules only.`,
  );
  assertNoNonPayoutOutput(value, label);
}

function assertRejected(value, expectedFields, label) {
  assert.equal(value.ok, false, `${label} must reject unsafe input.`);
  assert.equal(value.status, "rejected", `${label} must report rejected status.`);
  assert.equal(value.reason, "unsafe_or_unknown_fields", `${label} must report unsafe fields.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);

  for (const expectedField of expectedFields) {
    assert.ok(
      value.rejected_fields.some((field) => field.includes(expectedField)),
      `${label} must reject ${expectedField}.`,
    );
  }
}

function assertServerSessionRequired(value, label) {
  assert.equal(value.ok, false, `${label} must not save with local-dev actor.`);
  assert.equal(value.status, "blocked", `${label} must remain blocked.`);
  assert.equal(value.reason, "admin_session_required", `${label} must require server-session admin.`);
  assert.equal(value.write_gate_open, true, `${label} must show only the mocked gate was open.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assertNoNonPayoutOutput(value, label);
}

function assertSaved(value, label, expectedDriverPayoutRules) {
  assert.equal(value.ok, true, `${label} must save through the mocked client.`);
  assert.equal(value.status, "saved", `${label} must report saved status.`);
  assert.equal(value.reason, "saved", `${label} must report saved reason.`);
  assert.equal(value.no_op, false, `${label} must not be no-op under mocked safe write.`);
  assert.equal(value.write_gate_open, true, `${label} must have the mocked write gate open.`);
  assert.equal(value.write_enabled, true, `${label} must enable write only under mocked safe write.`);
  assert.equal(value.database_client_enabled, true, `${label} must use only the mocked DB client.`);
  assert.deepEqual(value.record, {
    driver_payout_rules: expectedDriverPayoutRules,
    id: value.id,
  });
  assertNoNonPayoutOutput(value, label);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-payout-runtime-write-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  const helperOutputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const helperSource = await readFile(helperPath, "utf8");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(helperOutputPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    "module.exports = { createClient() { throw new Error('createClient must not be called without explicit test clientFactory'); } };",
  );
  await writeFile(helperOutputPath, transpileTypescript(helperSource, helperPath));

  const requireFromTemp = createRequire(path.join(tempDir, "harness.cjs"));
  const helper = requireFromTemp(`./${helperPath.replace(/\.ts$/, ".js")}`);

  return {
    helper,
    async cleanup() {
      await rm(tempDir, { force: true, recursive: true });
    },
  };
}

function mockedClient(calls) {
  return {
    from(table) {
      calls.push({ table });

      return {
        update(payload) {
          calls.push({ payload });

          return {
            eq(column, id) {
              calls.push({ column, id });

              return {
                select(select) {
                  calls.push({ select });

                  return {
                    async single() {
                      return {
                        data: {
                          driver_payout_rules: payload.driver_payout_rules,
                          id,
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
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
  ledger,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Driver Payout Rules Runtime Write Gate Lock");
for (const phrase of [
  "Added gated `driver_payout_rules` runtime write boundary.",
  "The route remains closed by default through `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.",
  "It accepts company/traveler `driver_payout_rules` only.",
  "It rejects customer pricing, `customer_rates`, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal notes, debug, secrets, PayNow, and payout preferences.",
  "App runtime wiring is guarded separately by `scripts/test-driver-payout-rules-runtime-app-wiring.mjs`.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No UI sector/card, env change, deployment, live DB write execution, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Driver payout runtime ledger phrase: ${phrase}`);
}

assertIncludes(routeSource, "export async function POST", "Driver payout runtime POST route");
assertExcludes(routeSource, "export async function GET", "Driver payout runtime GET route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Admin dispatcher boundary");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Admin purpose boundary");
assertIncludes(routeSource, "executeAdminDriverPayoutRulesRuntimeWriteAction", "Runtime helper call");
assertExcludes(routeSource, forbiddenRuntimeWiringPattern, "Driver payout runtime route");
assertExcludes(helperSource, forbiddenRuntimeWiringPattern, "Driver payout runtime helper");

const writePayloadSource = sliceBetween(helperSource, "function writePayload", "function toDriverPayoutRulesRecord");
assertIncludes(writePayloadSource, "driver_payout_rules", "Driver payout runtime write payload");
assertExcludes(writePayloadSource, /customer_rates|customer_rate|customer_price|pricing|payment|billing|invoice|pdf|provider|auth|location|photo|calendar|internal|debug|secret|paynow|payout_preferences/i, "Driver payout runtime write payload");

assertIncludes(helperSource, gateEnvName, "Driver payout runtime env gate");
assertIncludes(helperSource, "company_driver_payout_rules_update", "Company action type");
assertIncludes(helperSource, "traveler_driver_payout_rules_update", "Traveler action type");
assertIncludes(helperSource, "allowedRuleFields", "Driver payout rule field allowlist");
assertIncludes(helperSource, "forbiddenFieldPattern", "Forbidden field pattern");
assertIncludes(helperSource, "customer_rates", "Forbidden customer_rates rejection");
assertIncludes(helperSource, "paynow", "Forbidden PayNow rejection");
assertIncludes(helperSource, "payout_preferences", "Forbidden payout preferences rejection");

assertIncludes(appPage, routePathFragment, "Guarded app/page.tsx payout runtime wiring");
assertIncludes(appPage, "saveDriverPayoutRulesRuntime", "Guarded app/page.tsx payout runtime client helper");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM payout runtime separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, routePathFragment, "Parser route payout runtime separation");
assertExcludes(aiParseRoute, "driver_payout_rules", "Parser payout rules separation");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings payout runtime separation");
assertExcludes(adminBookingsRoute, "driver_payout_rules", "Admin bookings safe persistence payout separation");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings payout runtime separation");

assertIncludes(preactivationSuite, guardScript, "Preactivation suite driver payout runtime guard registration");
assertIncludes(
  preactivationSuite,
  "scripts/test-driver-payout-rules-runtime-app-wiring.mjs",
  "Preactivation suite driver payout runtime app wiring guard registration",
);

const localDevActor = {
  actor_label: "Local dev",
  actor_role: "admin",
  boundary_mode: "local-dev",
  source_surface: "admin_api",
};
const serverAdminActor = {
  actor_label: "Runtime test admin",
  actor_role: "admin",
  boundary_mode: "server-session-role-surface",
  source_surface: "admin_api",
};

const harness = await loadHarness();

try {
  const { executeAdminDriverPayoutRulesRuntimeWriteAction } = harness.helper;

  setEnv({ [gateEnvName]: undefined });
  assertClosedGate(
    await executeAdminDriverPayoutRulesRuntimeWriteAction(safeInput(), localDevActor),
    "closed gate company payload",
    { DSP: { amount: 50, perHour: true }, MNG: { max: 75, min: 65 } },
  );
  assertClosedGate(
    await executeAdminDriverPayoutRulesRuntimeWriteAction(travelerInput(), localDevActor),
    "closed gate traveler payload",
    { DEP: { max: 65, min: 55 }, TRF: { amount: 45 } },
  );

  assertRejected(
    await executeAdminDriverPayoutRulesRuntimeWriteAction(forbiddenInput(), localDevActor),
    ["customer_rates", "customer_price_amount", "payment", "pricing_snapshot", "payout_preferences"],
    "forbidden customer/payment/provider fields",
  );
  assertRejected(
    await executeAdminDriverPayoutRulesRuntimeWriteAction(
      safeInput({ driver_payout_rules: { MNG: { max: 50, min: 70 } } }),
      localDevActor,
    ),
    ["driver_payout_rules.MNG.min_max_range"],
    "invalid min/max range",
  );
  assertRejected(
    await executeAdminDriverPayoutRulesRuntimeWriteAction(
      safeInput({ driver_payout_rules: { MNG: { customer_price: 90, min: 60 } } }),
      localDevActor,
    ),
    ["driver_payout_rules.MNG.customer_price"],
    "unknown nested customer price field",
  );

  setEnv({ [gateEnvName]: "true" });
  assertServerSessionRequired(
    await executeAdminDriverPayoutRulesRuntimeWriteAction(safeInput(), localDevActor),
    "open gate local-dev actor",
  );

  setEnv({
    [gateEnvName]: "true",
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_URL: undefined,
  });
  const noConfig = await executeAdminDriverPayoutRulesRuntimeWriteAction(safeInput(), serverAdminActor);
  assert.equal(noConfig.ok, false, "missing config must not save");
  assert.equal(noConfig.reason, "config_not_ready", "missing config must fail safely");
  assert.equal(noConfig.database_client_enabled, false, "missing config must not enable DB client");
  assert.equal(noConfig.no_op, true, "missing config must remain no-op");

  const companyCalls = [];
  const companySaved = await executeAdminDriverPayoutRulesRuntimeWriteAction(
    safeInput(),
    serverAdminActor,
    { clientFactory: () => mockedClient(companyCalls) },
  );
  assertSaved(companySaved, "mocked company write", {
    DSP: { amount: 50, perHour: true },
    MNG: { max: 75, min: 65 },
  });
  assert.deepEqual(companyCalls[0], { table: "companies" });
  assert.equal(companyCalls[1].payload.driver_payout_rules.MNG.min, 65);
  assert.equal(companyCalls[1].payload.customer_rates, undefined);
  assert.equal(companyCalls[3].select, "id, driver_payout_rules");

  const travelerCalls = [];
  const travelerSaved = await executeAdminDriverPayoutRulesRuntimeWriteAction(
    travelerInput(),
    serverAdminActor,
    { clientFactory: () => mockedClient(travelerCalls) },
  );
  assertSaved(travelerSaved, "mocked traveler write", {
    DEP: { max: 65, min: 55 },
    TRF: { amount: 45 },
  });
  assert.deepEqual(travelerCalls[0], { table: "travelers" });
  assert.equal(travelerCalls[1].payload.customer_rates, undefined);
  assert.equal(travelerCalls[3].select, "id, driver_payout_rules");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("driver_payout_rules runtime write action API contract guard passed");
