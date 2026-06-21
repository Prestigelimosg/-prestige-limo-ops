import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-customer-driver-details-email-send-action/route.ts";
const helperPath = "lib/admin-customer-driver-details-email-send-action.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const adapterStubPath = "lib/admin-booking-supabase-adapter.ts";
const globalGuardPath = "scripts/test-global-preactivation-no-live-guard.mjs";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";
const routePathFragment = "/api/admin-customer-driver-details-email-send-action";
const guardScript = "scripts/test-admin-customer-driver-details-email-send-action-api-contract.mjs";
const gateEnvName = "PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED";
const providerName = "resend";
const selectedFrom = "Prestige Limo Dispatch <info@prestigelimo.sg>";
const selectedReplyTo = "info@prestigelimo.sg";

const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL:
    process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  PRESTIGE_DRIVER_DETAILS_EMAIL_FROM: process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_FROM,
  PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO: process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO,
  PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST:
    process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST,
  PRESTIGE_EMAIL_PROVIDER: process.env.PRESTIGE_EMAIL_PROVIDER,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  [gateEnvName]: process.env[gateEnvName],
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

function assertSafeResponse(value, label) {
  const serialized = JSON.stringify(value).toLowerCase();

  for (const forbidden of [
    "test-resend-secret-key",
    "raw_provider_response",
    "rawproviderresponse",
    "response_headers",
    "debug_payload",
    "customer_price",
    "driver_payout",
    "paynow",
    "internal_admin",
    "admin_notes",
    "parser_debug",
    "mock_archive",
    "authorization",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${label} must not expose ${forbidden}.`);
  }
}

function adminHeaders(extra = {}) {
  return {
    "x-prestige-admin-purpose": "admin-booking-persistence",
    origin: "http://localhost",
    referer: "http://localhost/",
    ...extra,
  };
}

function serverSessionHeaders() {
  return adminHeaders({
    "x-prestige-admin-session-token": "resend-test-admin-token",
  });
}

function routeUrl(pathname = routePathFragment) {
  return new URL(`http://localhost${pathname}`);
}

function validPayload(overrides = {}) {
  return {
    customer_booking_details: {
      booking_reference: "PLO-EMAIL-001",
      customer_passenger_traveler_name: "Ms Lim Traveler",
      customer_facing_flight_number: "SQ318",
      drop_off_location: "Changi Airport Terminal 3",
      passenger_count: "2",
      pickup_date: "2026-06-21",
      pickup_location: "Raffles Hotel Singapore",
      pickup_time: "10:30",
      service_type: "Airport Arrival",
      ...(overrides.customer_booking_details || {}),
    },
    driver_details: {
      car_plate: "SLA1234X",
      car_type: "Mercedes V-Class",
      driver_contact: "+65 8888 0000",
      driver_name: "Tan Driver",
      ...(overrides.driver_details || {}),
    },
    recipient_email: "allowlisted@example.com",
    ...overrides,
  };
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function assertClosed(value, label) {
  assert.equal(value.ok, false, `${label} must not send.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
  assert.equal(value.reason, "email_send_gate_closed", `${label} must report closed gate.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.email_send_enabled, false, `${label} must not enable email send.`);
  assert.equal(value.external_send, false, `${label} must not externally send.`);
  assert.equal(value.provider_request_count, 0, `${label} must make zero provider requests.`);
  assert.equal(value.database_persistence_enabled, false, `${label} must not persist DB data.`);
  assert.equal(value.notification_table_write_enabled, false, `${label} must not write notification rows.`);
  assert.equal(value.scheduler_enabled, false, `${label} must not schedule.`);
  assert.equal(value.retry_enabled, false, `${label} must not retry.`);
  assert.equal(value.polling_enabled, false, `${label} must not poll.`);
  assert.equal(value.fallback_enabled, false, `${label} must not fallback.`);
  assert.equal(value.blast_enabled, false, `${label} must not blast.`);
  assert.equal(value.batch_send_enabled, false, `${label} must not batch send.`);
  assert.equal(value.invoice_email_enabled, false, `${label} must not mix invoice email.`);
  assert.equal(value.live_location_email_enabled, false, `${label} must not activate live-location email.`);
  assert.equal(value.env_gate_name, gateEnvName, `${label} must expose only gate env name.`);
  assertSafeResponse(value, label);
}

function assertMissingProvider(value, label) {
  assert.equal(value.ok, false, `${label} must not send.`);
  assert.equal(value.status, "blocked", `${label} must remain blocked.`);
  assert.equal(value.reason, "provider_not_configured", `${label} must report provider not configured.`);
  assert.equal(value.provider_request_count, 0, `${label} must make zero provider requests.`);
  assert.equal(value.external_send, false, `${label} must not externally send.`);
  assertSafeResponse(value, label);
}

function assertRejected(value, reason, label) {
  assert.equal(value.ok, false, `${label} must reject.`);
  assert.equal(value.status, "rejected", `${label} must report rejected status.`);
  assert.equal(value.reason, reason, `${label} must report ${reason}.`);
  assert.equal(value.provider_request_count, 0, `${label} must not call provider.`);
  assert.equal(value.external_send, false, `${label} must not externally send.`);
  assertSafeResponse(value, label);
}

function assertSuccess(value, label) {
  assert.equal(value.ok, true, `${label} must succeed.`);
  assert.equal(value.status, "sent", `${label} must report sent.`);
  assert.equal(value.reason, "send_succeeded", `${label} must report send_succeeded.`);
  assert.equal(value.provider, providerName, `${label} must identify Resend.`);
  assert.equal(value.message_id, "email_test_123", `${label} must normalize safe provider message id.`);
  assert.equal(value.provider_request_count, 1, `${label} must make exactly one provider request.`);
  assert.equal(value.email_send_enabled, true, `${label} must mark email send enabled only after call.`);
  assert.equal(value.external_send, true, `${label} must mark external send true only after call.`);
  assert.equal(value.database_persistence_enabled, false, `${label} must not persist DB data.`);
  assert.equal(value.notification_table_write_enabled, false, `${label} must not write notification rows.`);
  assert.equal(value.scheduler_enabled, false, `${label} must not schedule.`);
  assert.equal(value.retry_enabled, false, `${label} must not retry.`);
  assert.equal(value.polling_enabled, false, `${label} must not poll.`);
  assert.equal(value.fallback_enabled, false, `${label} must not fallback.`);
  assert.equal(value.blast_enabled, false, `${label} must not blast.`);
  assert.equal(value.batch_send_enabled, false, `${label} must not batch send.`);
  assertSafeResponse(value, label);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-resend-driver-details-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const adapterPath = path.join(tempDir, adapterStubPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
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

  for (const relativePath of [boundaryPath, helperPath, routePath]) {
    await writeTranspiled(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: require(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    route: require(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const [
  routeSource,
  helperSource,
  globalGuard,
  preactivationSuite,
  ledger,
  packageJsonSource,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(globalGuardPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile("package.json", "utf8"),
]);
const combined = `${routeSource}\n${helperSource}`;

assertIncludes(routeSource, "export async function POST", "Driver Details Email send route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Driver Details Email send route");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Driver Details Email send route");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "Driver Details Email send route");
assertIncludes(routeSource, "executeAdminCustomerDriverDetailsEmailSendAction", "Driver Details Email send route");
assertExcludes(routeSource, "export async function GET", "Driver Details Email send route");
assertExcludes(routeSource, "export async function PATCH", "Driver Details Email send route");
assertExcludes(routeSource, "export async function DELETE", "Driver Details Email send route");

for (const fragment of [
  "server-only",
  gateEnvName,
  "PRESTIGE_EMAIL_PROVIDER",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_FROM",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST",
  "RESEND_API_KEY",
  "email_send_gate_closed",
  "provider_not_configured",
  "recipient_not_allowlisted",
  "provider_timeout",
  "provider_failure",
  "send_succeeded",
  "customer_passenger_traveler_name",
  "Customer/passenger/traveler name",
  "CUSTOMER BOOKING DETAILS",
  "DRIVER DETAILS",
  "provider_request_count: 0",
  "provider_request_count: 1",
  "AbortSignal.timeout",
  "batch_send_enabled: false",
  "database_persistence_enabled: false",
  "notification_table_write_enabled: false",
  "scheduler_enabled: false",
  "retry_enabled: false",
  "polling_enabled: false",
  "fallback_enabled: false",
  "blast_enabled: false",
  "invoice_email_enabled: false",
  "live_location_email_enabled: false",
]) {
  assertIncludes(helperSource, fragment, `Driver Details Email helper ${fragment}`);
}

for (const fragment of [
  "createClient",
  "@supabase/supabase-js",
  ".from(",
  ".insert(",
  ".upsert(",
  ".update(",
  ".delete(",
  "nodemailer",
  "sendgrid",
  "mailgun",
  "postmark",
  "new Resend",
  "messages.create",
  "sendMail",
  "telegram",
  "whatsapp",
  "sms",
  "invoice_pdf",
  "pdf_link",
]) {
  assertExcludes(combined.toLowerCase(), fragment.toLowerCase(), `Driver Details Email source ${fragment}`);
}

for (const forbiddenContentFragment of ["payment", "payout", "driver_payout_rules", "customer_rates"]) {
  assertIncludes(
    helperSource,
    `"${forbiddenContentFragment}"`,
    `Driver Details Email helper forbidden content fragment ${forbiddenContentFragment}`,
  );
}

const packageJson = JSON.parse(packageJsonSource);
const installedPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];

for (const packageName of installedPackages) {
  assert.equal(packageName === "resend", false, "Driver Details Email contract must not install Resend SDK.");
}

const gateCheckIndex = helperSource.indexOf("if (!sendGateOpen())");
const apiKeyReadIndex = helperSource.indexOf("process.env.RESEND_API_KEY");
const providerCallIndex = helperSource.indexOf("await providerFetch");

assert.notEqual(gateCheckIndex, -1, "Driver Details Email helper must check gate.");
assert.notEqual(apiKeyReadIndex, -1, "Driver Details Email helper must contain API key read.");
assert.notEqual(providerCallIndex, -1, "Driver Details Email helper must contain provider fetch call.");
assert.ok(apiKeyReadIndex > gateCheckIndex, "RESEND_API_KEY read must occur only after closed-gate check.");
assert.ok(providerCallIndex > apiKeyReadIndex, "Provider call must occur only after config validation.");

assertIncludes(globalGuard, routePath, "Global no-live guard exact route exception");
assertIncludes(globalGuard, guardScript, "Global no-live guard exact route contract script");
assertIncludes(preactivationSuite, guardScript, "Preactivation suite Driver Details Email send guard");
assertIncludes(ledger, "Resend Driver Details Email Gated Send Contract Lock", "Ledger Resend send contract lock");
assertIncludes(ledger, routePathFragment, "Ledger Resend send route");
assertIncludes(ledger, gateEnvName, "Ledger Resend send gate");
assertIncludes(
  ledger,
  "customer/passenger/traveler name",
  "Ledger Resend send customer/passenger/traveler name field",
);

const harness = await loadHarness();
const originalFetch = globalThis.fetch;

try {
  const { helper, route } = harness;
  let providerRequests = 0;

  globalThis.fetch = async () => {
    providerRequests += 1;
    throw new Error("Provider fetch must stay blocked in closed-gate tests.");
  };

  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    RESEND_API_KEY: "test-resend-secret-key",
    [gateEnvName]: undefined,
  });

  const closedResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(validPayload()),
      headers: adminHeaders(),
      method: "POST",
    }),
  );
  const closed = await responseJson(closedResponse);

  assert.equal(closedResponse.status, 503, "Closed Driver Details Email route must return 503.");
  assertClosed(closed, "closed Driver Details Email route");
  assert.equal(providerRequests, 0, "Closed gate must not make provider requests.");

  const publicResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(validPayload()),
      headers: { origin: "http://localhost" },
      method: "POST",
    }),
  );
  const publicBody = await responseJson(publicResponse);

  assert.equal(publicResponse.status, 403, "Public/missing-boundary send route must return 403.");
  assert.equal(publicBody.ok, false);
  assert.equal(publicBody.external_send, false);
  assertSafeResponse(publicBody, "public Driver Details Email route");
  assert.equal(providerRequests, 0, "Public route must not make provider requests.");

  setEnv({
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Harness dispatcher",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: "resend-test-admin-token",
    [gateEnvName]: "true",
  });

  const missingConfigResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(validPayload()),
      headers: serverSessionHeaders(),
      method: "POST",
    }),
  );
  const missingConfig = await responseJson(missingConfigResponse);

  assert.equal(missingConfigResponse.status, 503, "Missing Resend config must return 503.");
  assertMissingProvider(missingConfig, "missing config Driver Details Email route");
  assert.equal(providerRequests, 0, "Missing config must not make provider requests.");

  setEnv({
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Harness dispatcher",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: "resend-test-admin-token",
    PRESTIGE_DRIVER_DETAILS_EMAIL_FROM: selectedFrom,
    PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO: selectedReplyTo,
    PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST: "allowlisted@example.com",
    PRESTIGE_EMAIL_PROVIDER: providerName,
    RESEND_API_KEY: "test-resend-secret-key",
    [gateEnvName]: "true",
  });

  const invalidPayloadResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(
        validPayload({
          customer_booking_details: {
            pricing: "secret pricing",
          },
        }),
      ),
      headers: serverSessionHeaders(),
      method: "POST",
    }),
  );
  const invalidPayload = await responseJson(invalidPayloadResponse);

  assert.equal(invalidPayloadResponse.status, 400, "Forbidden payload fields must return 400.");
  assertRejected(invalidPayload, "invalid_input", "forbidden payload Driver Details Email route");
  assert.equal(providerRequests, 0, "Forbidden payload must not make provider requests.");

  const allowlistResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(validPayload({ recipient_email: "outside@example.com" })),
      headers: serverSessionHeaders(),
      method: "POST",
    }),
  );
  const allowlistBody = await responseJson(allowlistResponse);

  assert.equal(allowlistResponse.status, 403, "Non-allowlisted recipient must return 403.");
  assertRejected(allowlistBody, "recipient_not_allowlisted", "non-allowlisted Driver Details Email route");
  assert.equal(providerRequests, 0, "Non-allowlisted recipient must not make provider requests.");

  const actor = {
    actor_label: "Harness dispatcher",
    actor_role: "dispatcher",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
  let providerBody = null;
  const success = await helper.executeAdminCustomerDriverDetailsEmailSendAction(
    validPayload(),
    actor,
    {
      providerFetch: async (url, init) => {
        providerRequests += 1;
        providerBody = JSON.parse(init.body);
        assert.equal(url, "https://api.resend.com/emails");
        assert.equal(init.method, "POST");
        assert.equal(init.headers.Authorization, "Bearer test-resend-secret-key");
        assert.equal(init.headers["Content-Type"], "application/json");
        assert.deepEqual(providerBody.to, ["allowlisted@example.com"]);
        assert.equal(providerBody.from, selectedFrom);
        assert.equal(providerBody.reply_to, selectedReplyTo);
        assert.match(providerBody.text, /Hi Ms Lim Traveler,/);
        assert.match(providerBody.text, /CUSTOMER BOOKING DETAILS/);
        assert.match(providerBody.text, /Customer\/passenger\/traveler name: Ms Lim Traveler/);
        assert.match(providerBody.text, /DRIVER DETAILS/);
        assert.doesNotMatch(JSON.stringify(providerBody).toLowerCase(), /payout|paynow|pricing|invoice|debug|token/);

        return {
          json: async () => ({
            id: "email_test_123",
            raw_provider_response: "must-not-leak",
          }),
          ok: true,
          status: 200,
        };
      },
    },
  );

  assertSuccess(success, "mocked success Driver Details Email helper");
  assert.equal(providerRequests, 1, "Success helper must make one provider request.");
  assert.ok(providerBody, "Success helper must build a provider body.");

  const providerFailure = await helper.executeAdminCustomerDriverDetailsEmailSendAction(
    validPayload(),
    actor,
    {
      providerFetch: async () => ({
        json: async () => ({ raw_provider_error: "must-not-leak" }),
        ok: false,
        status: 500,
      }),
    },
  );

  assert.equal(providerFailure.ok, false);
  assert.equal(providerFailure.status, "failed");
  assert.equal(providerFailure.reason, "provider_failure");
  assert.equal(providerFailure.provider_request_count, 1);
  assertSafeResponse(providerFailure, "provider failure Driver Details Email helper");

  const providerTimeout = await helper.executeAdminCustomerDriverDetailsEmailSendAction(
    validPayload(),
    actor,
    {
      providerFetch: async () => {
        const error = new Error("timeout");
        error.name = "AbortError";
        throw error;
      },
    },
  );

  assert.equal(providerTimeout.ok, false);
  assert.equal(providerTimeout.status, "failed");
  assert.equal(providerTimeout.reason, "provider_timeout");
  assert.equal(providerTimeout.provider_request_count, 1);
  assertSafeResponse(providerTimeout, "provider timeout Driver Details Email helper");
} finally {
  globalThis.fetch = originalFetch;
  restoreEnv();
  await harness.cleanup();
}

console.log("admin customer driver details email send action API contract guard passed");
