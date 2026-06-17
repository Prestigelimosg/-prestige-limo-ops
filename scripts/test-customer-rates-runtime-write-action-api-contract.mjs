import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-customer-rates-runtime-write-action/route.ts";
const helperPath = "lib/admin-customer-rates-runtime-write-action.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";

const routePathFragment = "/api/admin-customer-rates-runtime-write-action";
const guardScript = "scripts/test-customer-rates-runtime-write-action-api-contract.mjs";
const gateEnvName = "PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED";
const forbiddenRuntimeWiringPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const forbiddenSafeOutputPattern =
  /driver_payout|driver_payout_rules|payout|paynow|pay_now|payment|billing|invoice|pdf|provider|send_state|send_log|auth_session|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
const forbiddenFieldFragments = [
  "driver_payout_rules",
  "driver_payout",
  "payout",
  "payment",
  "billing",
  "invoice",
  "pdf",
  "provider",
  "auth",
  "location",
  "photo",
  "calendar",
  "internal",
  "debug",
  "secret",
];
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

function safeInput(overrides = {}) {
  return {
    action_type: "company_customer_rates_update",
    customer_rates: {
      DEP: 90,
      MNG: 100,
    },
    id: 42,
    ...overrides,
  };
}

function travelerInput() {
  return safeInput({
    action_type: "traveler_customer_rates_update",
    customer_rates: {
      DSP: 65,
      TRF: 70,
    },
    id: 88,
  });
}

function forbiddenInput() {
  return {
    ...safeInput(),
    driver_payout_rules: { MNG: { max: 70, min: 60 } },
    payment: { status: "paid" },
    pricing_snapshot: { amount: 100 },
  };
}

function assertNoForbiddenSafeOutput(value, label) {
  assert.equal(
    forbiddenSafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose payout, payment, billing, provider, auth, location, photo, calendar, internal, parser, mock, token, or secret output.`,
  );
}

function assertClosedGate(value, label) {
  assert.equal(value.ok, false, `${label} must not save.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
  assert.equal(value.reason, "write_gate_closed", `${label} must keep the customer rates write gate closed.`);
  assert.equal(value.write_gate_open, false, `${label} must keep write_gate_open false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.env_gate_name, gateEnvName, `${label} must expose only the env gate name.`);
  assert.deepEqual(value.customer_rates, { DEP: 90, MNG: 100 }, `${label} must keep safe customer rates only.`);
  assertNoForbiddenSafeOutput(value, label);
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
  assertNoForbiddenSafeOutput(value, label);
}

function assertSaved(value, label, expectedCustomerRates) {
  assert.equal(value.ok, true, `${label} must save through the mocked client.`);
  assert.equal(value.status, "saved", `${label} must report saved status.`);
  assert.equal(value.reason, "saved", `${label} must report saved reason.`);
  assert.equal(value.no_op, false, `${label} must not be no-op under mocked safe write.`);
  assert.equal(value.write_gate_open, true, `${label} must have the mocked write gate open.`);
  assert.equal(value.write_enabled, true, `${label} must enable write only under mocked safe write.`);
  assert.equal(value.database_client_enabled, true, `${label} must use only the mocked DB client.`);
  assert.deepEqual(value.record, {
    customer_rates: expectedCustomerRates,
    id: value.id,
  });
  assertNoForbiddenSafeOutput(value, label);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-rates-runtime-write-"));
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
                          customer_rates: payload.customer_rates,
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

const ledgerSection = sectionBetween(ledger, "### Customer Rates Runtime Write Gate Lock");
for (const phrase of [
  "Added gated customer_rates runtime write boundary.",
  "New route: `POST /api/admin-customer-rates-runtime-write-action`.",
  "The write gate is closed by default through `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.",
  "Allowed input is existing company/traveler `id`, action type, and safe `customer_rates` keys only: MNG, DEP, TRF, DSP.",
  "Forbidden fields remain rejected/excluded: `driver_payout_rules`, driver payout, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, and mock QA/dev archive fields.",
  "The app rate override save/remove flow calls this typed boundary for `customer_rates` first.",
  "Closed-gate/no-op responses fall back to the existing legacy path to preserve current behavior.",
  "When the typed boundary reports `saved`, the legacy follow-up omits `customer_rates` and writes only parked `driver_payout_rules` plus allowed metadata.",
  "No typed payout runtime write is wired by this gate.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "No parser or `/api/ai-parse` change.",
  "No UI sector/card, env change, deployment, DB write execution, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Customer rates runtime gate ledger phrase: ${phrase}`);
}

assertIncludes(routeSource, "export const dynamic = \"force-dynamic\";", "Route dynamic mode");
assertIncludes(routeSource, "export async function POST", "Route POST handler");
assertExcludes(routeSource, /export async function (GET|PUT|PATCH|DELETE)/, "Route write method boundary");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Route admin boundary");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "Route actor adapter");
assertIncludes(routeSource, "executeAdminCustomerRatesRuntimeWriteAction", "Route helper execution");
assertIncludes(routeSource, "Response.json(result", "Route JSON response");

assertIncludes(helperSource, "server-only", "Helper server-only boundary");
assertIncludes(helperSource, gateEnvName, "Helper env gate");
assertIncludes(helperSource, "createClient", "Helper gated Supabase client");
assertIncludes(helperSource, ".from(targetTable)", "Helper typed table dispatch");
assertIncludes(helperSource, ".update(writePayload(contract.customer_rates))", "Helper safe update payload");
assertIncludes(helperSource, ".eq(\"id\", contract.id as number)", "Helper id-scoped update");
assertIncludes(helperSource, ".select(customerRatesWriteSelect)", "Helper safe select");
assertExcludes(helperSource, forbiddenRuntimeWiringPattern, "Helper must not use legacy shims");
assertExcludes(helperSource, "driver_payout_rules:", "Helper must not write driver payout rules");
assertExcludes(helperSource, "driver_payout_amount", "Helper must not write driver payout snapshots");
assertExcludes(helperSource, "customer_price_amount", "Helper must not write booking price snapshots");

for (const forbiddenFragment of forbiddenFieldFragments) {
  assertIncludes(helperSource, forbiddenFragment, `Helper forbidden field guard ${forbiddenFragment}`);
}

assertIncludes(appPage, routePathFragment, "App page must call the gated customer rates runtime write route");
assertIncludes(appPage, "saveCustomerRatesRuntime", "App page customer rates runtime helper");
assertIncludes(appPage, "includeCustomerRates: !companyCustomerRatesRuntime.saved", "Company fallback customer_rates guard");
assertIncludes(appPage, "includeCustomerRates: !travelerCustomerRatesRuntime.saved", "Traveler fallback customer_rates guard");
assertExcludes(aiParseRoute, routePathFragment, "Parser route must not call customer rates runtime write route");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings route must not call customer rates runtime write route");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings route must not call customer rates runtime write route");
assertExcludes(adminSavedBookingsRoute, "executeAdminCustomerRatesRuntimeWriteAction", "Admin saved bookings route helper separation");

assertIncludes(preactivationSuite, guardScript, "Preactivation suite customer rates runtime write guard");

const serverActor = {
  actor_label: "Admin Dispatcher",
  actor_role: "admin",
  boundary_mode: "server-session-role-surface",
  source_surface: "admin_api",
};
const localActor = {
  actor_label: "Local Admin",
  actor_role: "admin",
  boundary_mode: "local-dev",
  source_surface: "admin_api",
};

const harness = await loadHarness();
try {
  const { executeAdminCustomerRatesRuntimeWriteAction } = harness.helper;

  setEnv({ [gateEnvName]: undefined });
  const closedGate = await executeAdminCustomerRatesRuntimeWriteAction(safeInput(), serverActor, {
    clientFactory() {
      throw new Error("clientFactory must not run while customer rates write gate is closed");
    },
  });
  assertClosedGate(closedGate, "Closed customer rates write gate");

  const rejected = await executeAdminCustomerRatesRuntimeWriteAction(forbiddenInput(), serverActor, {
    clientFactory() {
      throw new Error("clientFactory must not run for forbidden customer rates input");
    },
  });
  assertRejected(rejected, ["driver_payout_rules", "payment", "pricing_snapshot"], "Forbidden customer rates input");

  const invalidRate = await executeAdminCustomerRatesRuntimeWriteAction(
    safeInput({ customer_rates: { MNG: -1 } }),
    serverActor,
    {
      clientFactory() {
        throw new Error("clientFactory must not run for invalid customer rate input");
      },
    },
  );
  assertRejected(invalidRate, ["customer_rates.MNG"], "Invalid customer rate input");

  const invalidActionType = await executeAdminCustomerRatesRuntimeWriteAction(
    safeInput({ action_type: "secret_admin_override_token" }),
    serverActor,
    {
      clientFactory() {
        throw new Error("clientFactory must not run for invalid customer rates action type");
      },
    },
  );
  assertRejected(invalidActionType, ["action_type"], "Invalid customer rates action type");
  assert.equal(invalidActionType.action_type, null, "Invalid action type must not be echoed.");
  assertNoForbiddenSafeOutput(invalidActionType, "Invalid customer rates action type");

  setEnv({ [gateEnvName]: "true" });
  const localDevBlocked = await executeAdminCustomerRatesRuntimeWriteAction(safeInput(), localActor, {
    clientFactory() {
      throw new Error("clientFactory must not run before server-session actor is verified");
    },
  });
  assertServerSessionRequired(localDevBlocked, "Customer rates local-dev actor");

  const companyCalls = [];
  const savedCompany = await executeAdminCustomerRatesRuntimeWriteAction(safeInput(), serverActor, {
    clientFactory: () => mockedClient(companyCalls),
  });
  assertSaved(savedCompany, "Mocked company customer rates save", { DEP: 90, MNG: 100 });
  assert.deepEqual(companyCalls, [
    { table: "companies" },
    { payload: { customer_rates: { DEP: 90, MNG: 100 }, updated_at: companyCalls[1].payload.updated_at } },
    { column: "id", id: 42 },
    { select: "id, customer_rates" },
  ]);
  assert.equal(typeof companyCalls[1].payload.updated_at, "string", "Company save must stamp updated_at.");

  const travelerCalls = [];
  const savedTraveler = await executeAdminCustomerRatesRuntimeWriteAction(travelerInput(), serverActor, {
    clientFactory: () => mockedClient(travelerCalls),
  });
  assertSaved(savedTraveler, "Mocked traveler customer rates save", { DSP: 65, TRF: 70 });
  assert.equal(travelerCalls[0].table, "travelers", "Traveler customer rates save must target travelers.");
  assert.deepEqual(travelerCalls[1].payload.customer_rates, { DSP: 65, TRF: 70 });

  const clearCalls = [];
  const clearedCompany = await executeAdminCustomerRatesRuntimeWriteAction(
    safeInput({ customer_rates: {} }),
    serverActor,
    {
      clientFactory: () => mockedClient(clearCalls),
    },
  );
  assertSaved(clearedCompany, "Mocked company customer rates clear", {});
  assert.deepEqual(clearCalls[1].payload.customer_rates, {}, "Customer rates clear must persist an empty map.");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("customer_rates runtime write action API contract guard passed");
