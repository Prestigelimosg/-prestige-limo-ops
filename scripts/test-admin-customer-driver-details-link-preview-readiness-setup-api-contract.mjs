import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-customer-driver-details-link-preview-readiness-setup/route.ts";
const helperPath = "lib/customer-driver-details-link-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  helperPath,
];
const unsafeOutputPattern =
  /driver_payout|customer_price|paynow|payment|billing|invoice|payout|internal_admin|internal_finance|service_role|server_secret|secret|stripe|smtp/i;
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
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

function applyLocalAdminBoundary() {
  delete process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;
}

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(params = {}) {
  const url = new URL("http://localhost/api/admin-customer-driver-details-link-preview-readiness-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertLinkDisabled(value, label) {
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.linkEnabled, false, `${label} must keep linkEnabled false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
  assert.equal(value.tokenIssued, false, `${label} must keep tokenIssued false.`);

  if (Object.hasOwn(value, "authActivationEnabled")) {
    assert.equal(value.authActivationEnabled, false, `${label} must keep authActivationEnabled false.`);
  }

  if (Object.hasOwn(value, "dbWriteEnabled")) {
    assert.equal(value.dbWriteEnabled, false, `${label} must keep dbWriteEnabled false.`);
  }

  if (Object.hasOwn(value, "providerConfigured")) {
    assert.equal(value.providerConfigured, false, `${label} must keep providerConfigured false.`);
  }
}

function transpileTypescript(tsSource, filename) {
  return ts.transpileModule(tsSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const source = await readFile(relativePath, "utf8");
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, relativePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-details-link-api-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const routeSource = await readFile(routePath, "utf8");
const helperSource = await readFile(helperPath, "utf8");
const routeAndHelperSource = `${routeSource}\n${helperSource}`;

for (const fragment of [
  "buildCustomerDriverDetailsLinkSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "customer_driver_details_secure_link",
  "booking_reference",
  "customer_safe_token_placeholder",
  "expiry_label",
  "driver_details_visibility_flags",
  "linkEnabled",
  "tokenIssued",
  "liveAccessEnabled",
  "external_send",
  "email",
  "whatsapp",
  "sms",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing customer driver-details link API fragment: ${fragment}`);
}

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "nodemailer",
  "sendgrid",
  "mailgun",
  "resend",
  "twilio",
  "vonage",
  "messagebird",
  "whatsapp-cloud-api",
  "sendMessage",
  "send_message",
  "messages.create",
  "sendSms",
  "sendSMS",
  "AUTH_TOKEN",
  "ACCESS_TOKEN",
  "SECRET_KEY",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Customer driver-details link API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assertLinkDisabled(anonymous, "Anonymous blocked response");
  assertLinkDisabled(anonymous.preview, "Anonymous blocked preview");
  assertLinkDisabled(anonymous.preview.payload, "Anonymous blocked preview payload");
  assertLinkDisabled(anonymous.readiness, "Anonymous blocked readiness");
  assert.equal(anonymous.channel, "customer_driver_details_secure_link");
  assert.deepEqual(anonymous.channels, ["email", "whatsapp", "sms"]);
  assert.deepEqual(anonymous.readiness.missing_requirements, ["booking_reference"]);
  assert.equal(anonymous.readiness.linkPayloadReady, false);

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-LINK-API-001",
        customer_safe_token_placeholder: "customer-safe-placeholder",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        expiry_label: "Expires 15 minutes after issue",
        pickup_time: "12 Jun 2026, 10:00",
        route: "Changi Airport T3 to Raffles Hotel",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assertLinkDisabled(ready, "Ready response");
  assertLinkDisabled(ready.preview, "Ready preview");
  assertLinkDisabled(ready.preview.payload, "Ready preview payload");
  assertLinkDisabled(ready.readiness, "Ready readiness");
  assert.equal(ready.channel, "customer_driver_details_secure_link");
  assert.deepEqual(ready.channels, ["email", "whatsapp", "sms"]);
  assert.equal(ready.preview.linkPayloadReady, true);
  assert.equal(ready.readiness.linkPayloadReady, true);
  assert.deepEqual(ready.readiness.missing_requirements, []);
  assert.deepEqual(ready.preview.payload, {
    authActivationEnabled: false,
    booking_reference: "PLO-LINK-API-001",
    channels: ["email", "whatsapp", "sms"],
    customer_safe_token_placeholder: "customer-safe-placeholder",
    dbWriteEnabled: false,
    driver_details_visibility_flags: {
      booking_reference: true,
      driver_name: true,
      driver_phone: true,
      pickup_time: true,
      route: true,
      vehicle_plate: true,
      vehicle_type: true,
    },
    external_send: false,
    expiry_label: "Expires 15 minutes after issue",
    linkEnabled: false,
    liveAccessEnabled: false,
    tokenIssued: false,
  });

  const camelResponse = await harness.route.GET(
    new Request(
      apiUrl({
        bookingReference: "PLO-LINK-API-002",
        channels: "sms,whatsapp",
        driverName: "Lim Driver",
        driverPhone: "+65 8777 0000",
        pickupTime: "13 Jun 2026, 09:00",
        tokenPlaceholder: "approved-placeholder",
        vehiclePlate: "SLA4321Z",
        vehicleType: "Toyota Alphard",
      }),
      { headers: adminHeaders() },
    ),
  );
  const camel = await camelResponse.json();

  assert.equal(camelResponse.status, 200);
  assertLinkDisabled(camel, "Camel-case response");
  assert.deepEqual(camel.channels, ["whatsapp", "sms"]);
  assert.equal(camel.preview.payload.booking_reference, "PLO-LINK-API-002");
  assert.equal(camel.preview.payload.customer_safe_token_placeholder, "approved-placeholder");
  assert.equal(camel.preview.payload.expiry_label, "Short-lived setup placeholder");
  assert.deepEqual(camel.preview.payload.driver_details_visibility_flags, {
    booking_reference: true,
    driver_name: true,
    driver_phone: true,
    pickup_time: true,
    route: false,
    vehicle_plate: true,
    vehicle_type: true,
  });
  assert.deepEqual(camel.readiness.missing_requirements, []);

  const unsafeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "payment-token",
        customerSafeTokenPlaceholder: "server_secret placeholder",
        customer_price: "200",
        driver_name: "driver_payout",
        driver_phone: "billing_amount",
        expiryLabel: "invoice payment secret",
        internal_admin_notes: "Do not leak",
        pickup_time: "10:00",
        route: "internal_admin_note",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafe = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 200);
  assertLinkDisabled(unsafe, "Unsafe response");
  assertLinkDisabled(unsafe.preview, "Unsafe preview");
  assertLinkDisabled(unsafe.preview.payload, "Unsafe payload");
  assert.equal(unsafe.preview.payload.booking_reference, null);
  assert.equal(unsafe.preview.payload.customer_safe_token_placeholder, "customer-safe-placeholder");
  assert.equal(unsafe.preview.payload.expiry_label, "Short-lived setup placeholder");
  assert.equal(unsafe.readiness.linkPayloadReady, false);
  assert.deepEqual(unsafe.readiness.missing_requirements, ["booking_reference"]);
  assert.deepEqual(unsafe.preview.payload.driver_details_visibility_flags, {
    booking_reference: false,
    driver_name: false,
    driver_phone: false,
    pickup_time: true,
    route: false,
    vehicle_plate: true,
    vehicle_type: true,
  });
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(unsafe)),
    false,
    "Unsafe customer driver-details link API output must not leak pricing, payout, billing, payment, internal, provider, or secret details.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin customer driver details link preview readiness setup API contract passed");
