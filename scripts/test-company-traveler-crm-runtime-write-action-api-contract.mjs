import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-company-traveler-crm-runtime-write-action/route.ts";
const helperPath = "lib/admin-company-traveler-crm-runtime-write-action.ts";
const contractHelperPath =
  "lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts";
const readinessHelperPath = "lib/admin-company-traveler-crm-write-readiness-setup-foundation.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const adapterStubPath = "lib/admin-booking-supabase-adapter.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const routePathFragment = "/api/admin-company-traveler-crm-runtime-write-action";
const guardScript = "scripts/test-company-traveler-crm-runtime-write-action-api-contract.mjs";
const gateEnvName = "PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED";

const forbiddenRuntimeWiringPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const forbiddenOutputPattern =
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|paynow|pay_now|payment|billing|invoice|pdf|finance|provider|send_state|send_log|auth_session|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
const forbiddenFieldFragments = [
  "customer_rates",
  "driver_payout_rules",
  "customer_price",
  "driver_payout",
  "rate_override",
  "pricing",
  "payout",
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

const originalEnv = {
  [gateEnvName]: process.env[gateEnvName],
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL:
    process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL,
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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

function assertNoForbiddenOutput(value, label) {
  assert.equal(
    forbiddenOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose finance, payout, payment, provider, auth, live location, photo, calendar, internal, parser, mock, token, or secret output.`,
  );
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

function safeCompanyInput() {
  return {
    action_type: "company_create",
    company_name: "Acme Travel Desk",
    domain: "acme.example",
  };
}

function safeTravelerInput() {
  return {
    action_type: "traveler_update",
    booker_email: "lee@example.com",
    id: 7,
    traveler_name: "Mr Lee",
  };
}

function forbiddenInput() {
  return {
    action_type: "traveler_update",
    customer_rates: [{ amount: 250 }],
    driver_payout_rules: [{ amount: 80 }],
    id: 7,
    pricing_source: "manual rate override",
  };
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function assertClosedGate(value, label) {
  assert.equal(value.ok, false, `${label} must not save.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
  assert.equal(value.reason, "write_gate_closed", `${label} must keep the CRM write gate closed.`);
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
  assert.ok(value.record?.id, `${label} must return a safe record id.`);
  assertNoForbiddenOutput(value, label);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-runtime-write-action-"));
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
      "  const mock = globalThis.__prestigeCrmRuntimeWriteMock;",
      "  if (mock) {",
      "    mock.createdClients += 1;",
      "  }",
      "  throw new Error('Live Supabase client creation is blocked in this guard.');",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );

  for (const relativePath of [
    readinessHelperPath,
    contractHelperPath,
    boundaryPath,
    helperPath,
    routePath,
  ]) {
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

  function selectedRecord(table, payload) {
    return table === "companies"
      ? {
          domain: payload.domain || null,
          id: 11,
          company_name: payload.company_name || null,
        }
      : {
          booker_contact: payload.booker_contact || null,
          booker_email: payload.booker_email || null,
          booker_name: payload.booker_name || null,
          company_id: payload.company_id || null,
          default_address: payload.default_address || null,
          default_dropoff_address: payload.default_dropoff_address || null,
          default_pickup_address: payload.default_pickup_address || null,
          id: 7,
          preferred_vehicle: payload.preferred_vehicle || null,
          traveler_name: payload.traveler_name || null,
        };
  }

  function query(table, operation, payload) {
    const call = {
      eq: null,
      operation,
      payload,
      select: null,
      table,
    };
    calls.push(call);

    return {
      eq(field, value) {
        call.eq = { field, value };

        return this;
      },
      select(select) {
        call.select = select;

        return {
          async single() {
            return {
              data: selectedRecord(table, payload),
              error: null,
            };
          },
        };
      },
    };
  }

  return {
    calls,
    client: {
      from(table) {
        return {
          insert(payload) {
            return query(table, "insert", payload);
          },
          update(payload) {
            return query(table, "update", payload);
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
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(routeSource, "export async function POST", "CRM runtime write action route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "CRM runtime write action route");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "CRM runtime write action route");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "CRM runtime write action route");
assertIncludes(routeSource, "executeAdminCompanyTravelerCrmRuntimeWriteAction", "CRM runtime write action route");
assertExcludes(routeSource, "export async function GET", "CRM runtime write action route");
assertExcludes(routeSource, "export async function PATCH", "CRM runtime write action route");
assertExcludes(routeSource, "export async function DELETE", "CRM runtime write action route");
assertExcludes(routeSource, forbiddenRuntimeWiringPattern, "CRM runtime write action route");

assertIncludes(helperSource, "server-only", "CRM runtime write action helper");
assertIncludes(helperSource, "PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED", "CRM runtime helper gate");
assertIncludes(helperSource, "@supabase/supabase-js", "CRM runtime write action helper");
assertIncludes(helperSource, ".from(\"companies\")", "CRM runtime write company table");
assertIncludes(helperSource, ".from(\"travelers\")", "CRM runtime write traveler table");
assertIncludes(helperSource, ".insert(payload)", "CRM runtime write insert");
assertIncludes(helperSource, ".update(payload)", "CRM runtime write update");
assertIncludes(helperSource, ".select(companyWriteSelect)", "CRM runtime company safe select");
assertIncludes(helperSource, ".select(travelerWriteSelect)", "CRM runtime traveler safe select");
assertExcludes(helperSource, forbiddenRuntimeWiringPattern, "CRM runtime write action helper");

const companySelectLine = helperSource.match(/const companyWriteSelect = "([^"]+)";/)?.[1] || "";
const travelerSelectLine = helperSource.match(/const travelerWriteSelect =\n  "([^"]+)";/)?.[1] || "";

assertIncludes(companySelectLine, "company_name", "CRM runtime company safe select");
assertIncludes(travelerSelectLine, "traveler_name", "CRM runtime traveler safe select");
assertIncludes(travelerSelectLine, "booker_email", "CRM runtime traveler safe select");

for (const forbiddenFragment of forbiddenFieldFragments) {
  assertExcludes(companySelectLine, forbiddenFragment, `CRM runtime company select forbidden ${forbiddenFragment}`);
  assertExcludes(travelerSelectLine, forbiddenFragment, `CRM runtime traveler select forbidden ${forbiddenFragment}`);
}

const crmRuntimeClientHelper = sliceBetween(
  appPage,
  "async function saveCompanyTravelerCrmIdentityContactRuntime",
  "function buildCompanyRateOverridePayload",
);
const saveRateOverrideSource = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
const saveBookingSource = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");

assertIncludes(appPage, routePathFragment, "App page CRM runtime route path");
assertIncludes(
  crmRuntimeClientHelper,
  "fetch(adminCompanyTravelerCrmRuntimeWriteActionApiPath",
  "CRM runtime client helper fetch",
);
assertIncludes(crmRuntimeClientHelper, "JSON.stringify(payload)", "CRM runtime client helper payload");
assertIncludes(crmRuntimeClientHelper, '"x-prestige-admin-purpose"', "CRM runtime client helper admin boundary");
assertIncludes(crmRuntimeClientHelper, "isCrmRuntimeWriteBlockedNoOp", "CRM runtime helper closed-gate no-op handling");
assertIncludes(saveRateOverrideSource, "saveCompanyTravelerCrmIdentityContactRuntime", "Rate override CRM identity split");
assertIncludes(saveRateOverrideSource, "buildCompanyCrmIdentityContactPayload", "Rate override company identity split");
assertIncludes(saveRateOverrideSource, "buildTravelerCrmIdentityContactPayload", "Rate override traveler identity split");
assertIncludes(saveRateOverrideSource, "buildCompanyRateOverridePayload", "Rate override company rate lane");
assertIncludes(saveRateOverrideSource, "buildTravelerRateOverridePayload", "Rate override traveler rate lane");
assertIncludes(
  saveRateOverrideSource,
  "buildLegacyCompanyRateOverrideInsertPayload",
  "Gate-closed company fallback preserves current rate override behavior",
);
assertIncludes(
  saveRateOverrideSource,
  "buildLegacyTravelerRateOverrideInsertPayload",
  "Gate-closed traveler fallback preserves current rate override behavior",
);
assertExcludes(crmRuntimeClientHelper, /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|payment|billing|invoice|pdf|provider|auth_session|live_location|photo|calendar|internal_admin|admin_notes|debug_payload|secret|api_key|access_token/i, "CRM runtime client helper");
assertExcludes(saveBookingSource, routePathFragment, "Save Booking + CRM must not call CRM runtime write route");
assertExcludes(aiParseRoute, routePathFragment, "Parser route must not call CRM runtime write route");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings route must not call CRM runtime write route");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings route must not call CRM runtime write route");

for (const source of [appPage, aiParseRoute, adminBookingsRoute, adminSavedBookingsRoute]) {
  assertExcludes(source, "executeAdminCompanyTravelerCrmRuntimeWriteAction", "Server CRM runtime helper must not be imported client-side or by unrelated routes");
}

assertIncludes(preactivationSuite, guardScript, "Preactivation suite CRM runtime action guard entry");

const harness = await loadHarness();

try {
  const { helper, route } = harness;

  globalThis.__prestigeCrmRuntimeWriteMock = { createdClients: 0 };

  setEnv({
    [gateEnvName]: undefined,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_URL: undefined,
  });

  const closedResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(safeCompanyInput()),
      headers: adminHeaders(),
      method: "POST",
    }),
  );
  const closed = await responseJson(closedResponse);

  assert.equal(closedResponse.status, 503, "Closed CRM runtime write route must return 503.");
  assertClosedGate(closed, "closed CRM runtime write route");
  assert.equal(
    globalThis.__prestigeCrmRuntimeWriteMock.createdClients,
    0,
    "Closed CRM runtime write route must not create a Supabase client.",
  );

  const forbiddenResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(forbiddenInput()),
      headers: adminHeaders(),
      method: "POST",
    }),
  );
  const forbidden = await responseJson(forbiddenResponse);

  assert.equal(forbiddenResponse.status, 400, "Forbidden CRM runtime write route must return 400.");
  assertRejected(forbidden, ["customer_rates", "driver_payout_rules", "pricing_source"], "forbidden CRM runtime write route");
  assert.equal(
    globalThis.__prestigeCrmRuntimeWriteMock.createdClients,
    0,
    "Rejected CRM runtime write route must not create a Supabase client.",
  );

  const missingBoundaryResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(safeCompanyInput()),
      headers: { referer: "http://localhost/" },
      method: "POST",
    }),
  );
  const missingBoundary = await responseJson(missingBoundaryResponse);

  assert.equal(missingBoundaryResponse.status, 403, "Missing admin boundary must return 403.");
  assert.equal(missingBoundary.ok, false, "Missing admin boundary must reject.");
  assert.equal(missingBoundary.no_op, true, "Missing admin boundary must remain no-op.");
  assert.equal(
    globalThis.__prestigeCrmRuntimeWriteMock.createdClients,
    0,
    "Missing admin boundary must not create a Supabase client.",
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
      body: JSON.stringify(safeCompanyInput()),
      headers: adminHeaders(),
      method: "POST",
    }),
  );
  const localActor = await responseJson(localActorResponse);

  assert.equal(localActorResponse.status, 403, "Open gate with local-dev actor must return 403.");
  assertServerSessionRequired(localActor, "open gate local-dev actor CRM runtime write route");
  assert.equal(
    globalThis.__prestigeCrmRuntimeWriteMock.createdClients,
    0,
    "Open gate local-dev actor must not create a Supabase client.",
  );

  const fakeCompany = createFakeClient();
  const fakeTraveler = createFakeClient();
  const actor = {
    actor_label: "Harness admin",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };

  const companyResult = await helper.executeAdminCompanyTravelerCrmRuntimeWriteAction(
    safeCompanyInput(),
    actor,
    { clientFactory: () => fakeCompany.client },
  );
  const travelerResult = await helper.executeAdminCompanyTravelerCrmRuntimeWriteAction(
    safeTravelerInput(),
    actor,
    { clientFactory: () => fakeTraveler.client },
  );

  assertSaved(companyResult, "mocked company CRM runtime write");
  assertSaved(travelerResult, "mocked traveler CRM runtime write");

  assert.deepEqual(fakeCompany.calls, [
    {
      eq: null,
      operation: "insert",
      payload: {
        company_name: "Acme Travel Desk",
        domain: "acme.example",
      },
      select: "id, company_name, domain",
      table: "companies",
    },
  ]);
  assert.deepEqual(fakeTraveler.calls, [
    {
      eq: { field: "id", value: 7 },
      operation: "update",
      payload: {
        booker_email: "lee@example.com",
        traveler_name: "Mr Lee",
      },
      select:
        "id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_name, booker_contact, booker_email",
      table: "travelers",
    },
  ]);
} finally {
  restoreEnv();
  delete globalThis.__prestigeCrmRuntimeWriteMock;
  await harness.cleanup();
}

console.log("company/traveler CRM runtime write action API contract guard passed");
