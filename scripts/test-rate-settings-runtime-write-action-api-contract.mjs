import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-rate-settings-runtime-write-action/route.ts";
const helperPath = "lib/admin-rate-settings-runtime-write-action.ts";
const disabledSetupHelperPath = "lib/admin-rate-settings-write-action-disabled-setup.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const adapterStubPath = "lib/admin-booking-supabase-adapter.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";

const routePathFragment = "/api/admin-rate-settings-runtime-write-action";
const guardScript = "scripts/test-rate-settings-runtime-write-action-api-contract.mjs";
const gateEnvName = "PRESTIGE_RATE_SETTINGS_WRITE_ENABLED";

const forbiddenRuntimeWiringPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const forbiddenOutputPattern =
  /customer_rates|driver_payout_rules|customer_price|rate_override|pricing_snapshot|payout_snapshot|payment|billing|invoice|pdf|finance|provider|send_state|send_log|auth_session|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
const forbiddenFieldFragments = [
  "customer_rates",
  "driver_payout_rules",
  "customer_price",
  "rate_override",
  "pricing_snapshot",
  "payout_snapshot",
  "payment",
  "billing",
  "invoice",
  "pdf",
  "provider",
  "auth_session",
  "live_location",
  "photo",
  "calendar",
  "internal_admin",
  "admin_notes",
  "debug_payload",
  "secret",
  "api_key",
  "access_token",
];
const safeSelectFields = [
  "id",
  "midnight_surcharge",
  "extra_stop_surcharge",
  "midnight_payout",
  "extra_stop_payout",
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
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

function adminHeaders(extra = {}) {
  return {
    "x-prestige-admin-purpose": "admin-booking-persistence",
    origin: "http://localhost",
    referer: "http://localhost/",
    ...extra,
  };
}

function routeUrl(pathname = routePathFragment) {
  return new URL(`http://localhost${pathname}`);
}

function safeInput() {
  return {
    child_seat_customer_surcharge: 15,
    child_seat_driver_payout: 10,
    extra_stop_payout: 12,
    extra_stop_surcharge: 18,
    id: "default",
    midnight_payout: 20,
    midnight_surcharge: 35,
  };
}

function forbiddenInput() {
  return {
    customer_rates: { MNG: 100 },
    driver_payout_rules: { MNG: { max: 60, min: 40 } },
    pricing_snapshot: { amount: 100 },
  };
}

function assertNoForbiddenOutput(value, label) {
  assert.equal(
    forbiddenOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose customer rate maps, payout rules, price snapshots, payout snapshots, payment, provider, auth, live location, photo, calendar, internal, parser, mock, token, or secret output.`,
  );
}

function assertClosedGate(value, label) {
  assert.equal(value.ok, false, `${label} must not save.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
  assert.equal(value.reason, "write_gate_closed", `${label} must keep the rate settings write gate closed.`);
  assert.equal(value.write_gate_open, false, `${label} must keep write_gate_open false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.env_gate_name, gateEnvName, `${label} must expose only the env gate name.`);
  assertNoForbiddenOutput(value, label);
}

function assertRejected(value, expectedFields, label) {
  assert.equal(value.ok, false, `${label} must reject unsafe input.`);
  assert.equal(value.status, "rejected", `${label} must report rejected status.`);
  assert.equal(value.reason, "unsafe_or_unknown_fields", `${label} must report unsafe fields.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);

  for (const expectedField of expectedFields) {
    assert.ok(value.rejected_fields.includes(expectedField), `${label} must reject ${expectedField}.`);
  }
}

function assertServerSessionRequired(value, label) {
  assert.equal(value.ok, false, `${label} must not save with local-dev actor.`);
  assert.equal(value.status, "blocked", `${label} must remain blocked.`);
  assert.equal(value.reason, "admin_session_required", `${label} must require server-session admin.`);
  assert.equal(value.write_gate_open, true, `${label} must show only the mocked gate was open.`);
  assert.equal(value.database_client_enabled, false, `${label} must not create a DB client.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assertNoForbiddenOutput(value, label);
}

function assertSaved(value, label) {
  assert.equal(value.ok, true, `${label} must save through the mocked client.`);
  assert.equal(value.status, "saved", `${label} must report saved status.`);
  assert.equal(value.reason, "saved", `${label} must report saved reason.`);
  assert.equal(value.no_op, false, `${label} must not be no-op under mocked safe write.`);
  assert.equal(value.write_gate_open, true, `${label} must have the mocked write gate open.`);
  assert.equal(value.write_enabled, true, `${label} must enable write only under mocked safe write.`);
  assert.equal(value.database_client_enabled, true, `${label} must use only the mocked DB client.`);
  assert.deepEqual(value.record, {
    child_seat_customer_surcharge: 15,
    child_seat_driver_payout: 10,
    extra_stop_payout: 12,
    extra_stop_surcharge: 18,
    id: "default",
    midnight_payout: 20,
    midnight_surcharge: 35,
  });
  assertNoForbiddenOutput(value, label);
}

async function responseJson(response) {
  return JSON.parse(await response.text());
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

async function writeTranspiled(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-rate-settings-runtime-write-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  const adapterPath = path.join(tempDir, adapterStubPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(adapterPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    adapterPath,
    [
      "function adminDispatcherBoundaryToPersistenceAdapterActor(context) {",
      "  return {",
      "    actor_label: context.actorLabel || 'Harness admin',",
      "    actor_role: context.role === 'dispatcher' ? 'dispatcher' : 'admin',",
      "    boundary_mode: context.mode,",
      "    source_surface: 'admin_api',",
      "  };",
      "}",
      "module.exports = { adminDispatcherBoundaryToPersistenceAdapterActor };",
    ].join("\n"),
  );
  await writeFile(
    supabasePath,
    [
      "function createClient() {",
      "  const mock = globalThis.__prestigeRateSettingsRuntimeWriteMock;",
      "  if (mock) {",
      "    mock.createdClients += 1;",
      "  }",
      "  throw new Error('Live Supabase client creation is blocked in this guard.');",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );

  for (const relativePath of [disabledSetupHelperPath, boundaryPath, helperPath, routePath]) {
    await writeTranspiled(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: require(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    route: require(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

function createFakeClient() {
  const calls = [];

  return {
    calls,
    client: {
      from(table) {
        return {
          upsert(payload, options) {
            const call = {
              operation: "upsert",
              options,
              payload,
              select: null,
              table,
            };
            calls.push(call);

            return {
              select(select) {
                call.select = select;

                return {
                  async single() {
                    return {
                      data: payload,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      },
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

const ledgerSection = sectionBetween(ledger, "### Rate Settings Runtime Write Action Gate Lock");

for (const phrase of [
  "Typed `rate_settings` runtime write boundary is added at `POST /api/admin-rate-settings-runtime-write-action`.",
  "Stage 1 app wiring calls the route from `saveDefaultRates` through `saveDefaultRateSettingsScalarRuntime`; it sends only scalar default `rate_settings` fields.",
  "Closed-gate blocked/no-op responses are treated as non-blocking so the current legacy save behavior remains preserved.",
  "`saveDefaultRates` still uses the parked legacy `rate_settings` shim path for `customer_rates` and `driver_payout_rules` map fields.",
  "The dedicated gate is `PRESTIGE_RATE_SETTINGS_WRITE_ENABLED`; it is closed by default and env values are never printed.",
  "With the gate closed, the route returns blocked/no-op and does not create a Supabase client.",
  "If the gate is opened later, a server-session admin/dispatcher actor is still required before any database client can be created.",
  "Allowed scalar `rate_settings` fields are limited to `midnight_surcharge`, `extra_stop_surcharge`, `midnight_payout`, `extra_stop_payout`, `child_seat_customer_surcharge`, and `child_seat_driver_payout` with `id` fixed to `default`.",
  "Forbidden fields remain rejected/excluded: `customer_rates`, `driver_payout_rules`, customer price/rate maps, rate overrides, pricing/payout snapshots, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and tokens.",
  "No Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/card, provider activation, live send, env change, deployment, migration, live DB write execution, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Rate settings runtime ledger phrase: ${phrase}`);
}

assertIncludes(routeSource, "export async function POST", "Rate settings runtime route POST");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Rate settings runtime route boundary");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Rate settings runtime route purpose");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "Rate settings runtime route actor");
assertIncludes(routeSource, "executeAdminRateSettingsRuntimeWriteAction", "Rate settings runtime route helper");
for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(routeSource, `export async function ${method}`, `Rate settings runtime route ${method}`);
}
assertExcludes(routeSource, forbiddenRuntimeWiringPattern, "Rate settings runtime route legacy shim path");

assertIncludes(helperSource, "server-only", "Rate settings runtime helper");
assertIncludes(helperSource, gateEnvName, "Rate settings runtime gate");
assertIncludes(helperSource, "@supabase/supabase-js", "Rate settings runtime helper DB import");
assertIncludes(helperSource, ".from(\"rate_settings\")", "Rate settings runtime table");
assertIncludes(helperSource, ".upsert(writePayload(setup.rate_settings_fields), { onConflict: \"id\" })", "Rate settings runtime upsert");
assertIncludes(helperSource, ".select(rateSettingsWriteSelect)", "Rate settings runtime safe select");
assertExcludes(helperSource, forbiddenRuntimeWiringPattern, "Rate settings runtime helper legacy shim path");
assertExcludes(helperSource, ".insert(", "Rate settings runtime insert");
assertExcludes(helperSource, ".delete(", "Rate settings runtime delete");
assertExcludes(helperSource, ".rpc(", "Rate settings runtime rpc");
assertExcludes(helperSource, "console.", "Rate settings runtime console output");

const selectLine = helperSource.match(/const rateSettingsWriteSelect =\n\s+"([^"]+)";/)?.[1] || "";
for (const field of safeSelectFields) {
  assertIncludes(selectLine, field, `Rate settings safe select ${field}`);
}
for (const forbiddenFragment of forbiddenFieldFragments) {
  assertExcludes(selectLine, forbiddenFragment, `Rate settings select forbidden ${forbiddenFragment}`);
}

const executeBlock = sliceBetween(
  helperSource,
  "export async function executeAdminRateSettingsRuntimeWriteAction",
  "\n}",
);
const gateIndex = executeBlock.indexOf("if (!writeGateOpen())");
const actorIndex = executeBlock.indexOf("if (!actorCanWrite(actor))");
const clientIndex = executeBlock.indexOf("client = getRuntimeWriteClient(options)");
assert.ok(gateIndex >= 0, "Rate settings runtime execute must check write gate.");
assert.ok(actorIndex > gateIndex, "Rate settings runtime execute must validate actor after write gate.");
assert.ok(clientIndex > actorIndex, "Rate settings runtime execute must create DB client only after actor validation.");
assert.equal(countMatches(helperSource, /\.from\("rate_settings"\)/g), 1, "Rate settings runtime helper must use one table.");

const saveDefaultRates = sliceBetween(appPage, "async function saveDefaultRates", "async function saveRateOverride");
const scalarRuntimeClientHelper = sliceBetween(
  appPage,
  "async function saveDefaultRateSettingsScalarRuntime",
  "type CompanyCrmIdentityContactPayload",
);

assertIncludes(appPage, `const adminRateSettingsRuntimeWriteActionApiPath =\n  "${routePathFragment}";`, "app/page.tsx rate settings runtime route path");
assertIncludes(scalarRuntimeClientHelper, "payload: DefaultRateSettingsScalarRuntimePayload", "Rate settings scalar runtime payload type");
assertIncludes(scalarRuntimeClientHelper, "fetch(adminRateSettingsRuntimeWriteActionApiPath", "Rate settings scalar runtime fetch");
assertIncludes(scalarRuntimeClientHelper, "body: JSON.stringify(payload)", "Rate settings scalar runtime body");
assertIncludes(scalarRuntimeClientHelper, '"content-type": "application/json"', "Rate settings scalar runtime JSON header");
assertIncludes(scalarRuntimeClientHelper, '"x-prestige-admin-purpose": adminLegacyDataPurpose', "Rate settings scalar runtime admin purpose");
assertIncludes(scalarRuntimeClientHelper, 'method: "POST"', "Rate settings scalar runtime method");
assertIncludes(scalarRuntimeClientHelper, "isRateSettingsRuntimeWriteBlockedNoOp", "Rate settings scalar runtime closed-gate no-op");
assertExcludes(scalarRuntimeClientHelper, "customer_rates", "Rate settings scalar runtime customer rate maps");
assertExcludes(scalarRuntimeClientHelper, "driver_payout_rules", "Rate settings scalar runtime driver payout maps");
assertExcludes(scalarRuntimeClientHelper, "normalizeCustomerRateRules", "Rate settings scalar runtime customer normalizer");
assertExcludes(scalarRuntimeClientHelper, "normalizeDriverPayoutRules", "Rate settings scalar runtime driver normalizer");
assertIncludes(saveDefaultRates, ".from(adminLegacyTables.rateSettings)", "saveDefaultRates remains parked on legacy shim");
assertIncludes(saveDefaultRates, "const scalarRuntimeSave = await saveDefaultRateSettingsScalarRuntime(scalarRateSettings);", "saveDefaultRates scalar runtime call");
assertIncludes(saveDefaultRates, "customer_rates: customerRates", "saveDefaultRates customer rates remain legacy");
assertIncludes(saveDefaultRates, "driver_payout_rules: driverPayoutRules", "saveDefaultRates driver payout rules remain legacy");
assert.equal(countMatches(appPage, routePathFragment), 1, "app/page.tsx must reference the rate settings runtime route only through its path constant.");
assertExcludes(appPage, "executeAdminRateSettingsRuntimeWriteAction", "app/page.tsx runtime helper import");

for (const [label, source] of [
  ["ai-parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, routePathFragment, `${label} rate settings runtime route coupling`);
  assertExcludes(source, "executeAdminRateSettingsRuntimeWriteAction", `${label} rate settings runtime helper import`);
}

assertIncludes(preactivationSuite, guardScript, "Preactivation suite rate settings runtime action guard");

const harness = await loadHarness();

try {
  const { helper, route } = harness;

  globalThis.__prestigeRateSettingsRuntimeWriteMock = { createdClients: 0 };

  setEnv({
    [gateEnvName]: undefined,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_URL: undefined,
  });

  const closedResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(safeInput()),
      headers: adminHeaders(),
      method: "POST",
    }),
  );
  const closed = await responseJson(closedResponse);

  assert.equal(closedResponse.status, 503, "Closed rate settings runtime route must return 503.");
  assertClosedGate(closed, "closed rate settings runtime route");
  assert.equal(
    globalThis.__prestigeRateSettingsRuntimeWriteMock.createdClients,
    0,
    "Closed rate settings runtime route must not create a Supabase client.",
  );

  const forbiddenResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(forbiddenInput()),
      headers: adminHeaders(),
      method: "POST",
    }),
  );
  const forbidden = await responseJson(forbiddenResponse);

  assert.equal(forbiddenResponse.status, 400, "Forbidden rate settings runtime route must return 400.");
  assertRejected(
    forbidden,
    ["customer_rates", "driver_payout_rules", "pricing_snapshot"],
    "forbidden rate settings runtime route",
  );
  assert.equal(
    globalThis.__prestigeRateSettingsRuntimeWriteMock.createdClients,
    0,
    "Rejected rate settings runtime route must not create a Supabase client.",
  );

  setEnv({
    [gateEnvName]: "true",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_URL: undefined,
  });

  const localActorResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(safeInput()),
      headers: adminHeaders(),
      method: "POST",
    }),
  );
  const localActor = await responseJson(localActorResponse);

  assert.equal(localActorResponse.status, 403, "Open gate with local-dev actor must return 403.");
  assertServerSessionRequired(localActor, "open gate local-dev actor rate settings runtime route");
  assert.equal(
    globalThis.__prestigeRateSettingsRuntimeWriteMock.createdClients,
    0,
    "Open gate local-dev actor must not create a Supabase client.",
  );

  const fakeRateSettings = createFakeClient();
  const actor = {
    actor_label: "Harness admin",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
  const result = await helper.executeAdminRateSettingsRuntimeWriteAction(
    safeInput(),
    actor,
    { clientFactory: () => fakeRateSettings.client },
  );

  assertSaved(result, "mocked rate settings runtime write");
  assert.equal(fakeRateSettings.calls.length, 1, "Mocked rate settings runtime write must use one upsert.");
  assert.equal(fakeRateSettings.calls[0].table, "rate_settings");
  assert.equal(fakeRateSettings.calls[0].operation, "upsert");
  assert.deepEqual(fakeRateSettings.calls[0].options, { onConflict: "id" });
  assert.equal(
    fakeRateSettings.calls[0].select,
    "id, midnight_surcharge, extra_stop_surcharge, midnight_payout, extra_stop_payout, child_seat_customer_surcharge, child_seat_driver_payout",
  );
  assert.deepEqual(
    Object.keys(fakeRateSettings.calls[0].payload).sort(),
    [
      "child_seat_customer_surcharge",
      "child_seat_driver_payout",
      "extra_stop_payout",
      "extra_stop_surcharge",
      "id",
      "midnight_payout",
      "midnight_surcharge",
      "updated_at",
    ],
  );
  for (const forbiddenKey of ["customer_rates", "driver_payout_rules", "pricing_snapshot", "payout_snapshot"]) {
    assert.equal(
      Object.hasOwn(fakeRateSettings.calls[0].payload, forbiddenKey),
      false,
      `Mocked rate settings payload must not include ${forbiddenKey}.`,
    );
  }
} finally {
  restoreEnv();
  delete globalThis.__prestigeRateSettingsRuntimeWriteMock;
  await harness.cleanup();
}

console.log("rate settings runtime write action API contract guard passed");
