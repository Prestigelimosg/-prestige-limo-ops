import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-whatsapp-customer-driver-details-send-disabled-setup/route.ts";
const helperPath = "lib/whatsapp-customer-driver-details-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/admin-whatsapp-message-disabled-adapter.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  helperPath,
];
const unsafeOutputPattern =
  /driver_payout|customer_price|paynow|payment|billing|invoice|payout|internal_admin|internal_finance|secret|token|graph\.facebook|api\.whatsapp|whatsapp\.com|wa\.me|sendMessage/i;
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
  const url = new URL("http://localhost/api/admin-whatsapp-customer-driver-details-send-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertNoLiveFlags(value, label) {
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.liveSendingEnabled, false, `${label} must keep liveSendingEnabled false.`);
  assert.equal(value.providerConfigured, false, `${label} must keep providerConfigured false.`);
  assert.equal(value.sendingEnabled, false, `${label} must keep sendingEnabled false.`);
}

function assertBlockedSend(value, label) {
  assertNoLiveFlags(value, label);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must expose blocked/no-op.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-whatsapp-customer-driver-details-send-api-"));
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
  "buildWhatsAppCustomerDriverDetailsSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "whatsapp_customer",
  "booking_reference",
  "pickup_time",
  "driver_name",
  "driver_phone",
  "vehicle_type",
  "vehicle_plate",
  "blocked/no-op",
  "setup_only_disabled",
  "sendingEnabled",
  "external_send",
  "providerConfigured",
  "liveSendingEnabled",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing disabled WhatsApp customer driver-details API fragment: ${fragment}`);
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
  "graph.facebook.com",
  "api.whatsapp",
  "wa.me",
  "/messages",
  "/message_templates",
  "sendMessage",
  "send_message",
  "ACCESS_TOKEN",
  "PHONE_NUMBER_ID",
  "TWILIO",
  "WATI",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Disabled WhatsApp customer driver-details send API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assertNoLiveFlags(anonymous, "Anonymous blocked response");
  assertNoLiveFlags(anonymous.preview, "Anonymous blocked preview");
  assertNoLiveFlags(anonymous.readiness, "Anonymous blocked readiness");
  assertBlockedSend(anonymous.send, "Anonymous send result");
  assertBlockedSend(anonymous.result, "Anonymous result");
  assert.equal(anonymous.channel, "whatsapp_customer");
  assert.equal(anonymous.status, "blocked");
  assert.deepEqual(anonymous.readiness.missing_requirements, [
    "booking_reference",
    "pickup_time",
    "route",
    "driver_name",
    "driver_phone",
    "vehicle_type",
    "vehicle_plate",
  ]);

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-WA-SEND-001",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
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
  assert.equal(ready.status, "blocked");
  assertNoLiveFlags(ready, "Ready response");
  assertNoLiveFlags(ready.preview, "Ready preview");
  assertNoLiveFlags(ready.preview.payload, "Ready preview payload");
  assertNoLiveFlags(ready.readiness, "Ready readiness");
  assertBlockedSend(ready.send, "Ready send result");
  assertBlockedSend(ready.result, "Ready result");
  assert.equal(ready.channel, "whatsapp_customer");
  assert.equal(ready.delivery_surface, "whatsapp_disabled");
  assert.equal(ready.preview.customerMessageReady, true);
  assert.equal(ready.readiness.customerMessageReady, true);
  assert.deepEqual(ready.readiness.missing_requirements, []);
  assert.equal(ready.send.booking_reference, "PLO-WA-SEND-001");
  assert.equal(ready.send.event_key, "customer-driver-details-whatsapp-PLO-WA-SEND-001");
  assert.equal(ready.send.notification_type, "customer_driver_details");
  assert.equal(ready.send.disabled_message.external_send, false);
  assert.equal(ready.send.disabled_message.status, "disabled");
  assert.deepEqual(ready.preview.payload, {
    booking_reference: "PLO-WA-SEND-001",
    channel: "whatsapp_customer",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    external_send: false,
    liveSendingEnabled: false,
    pickup_time: "12 Jun 2026, 10:00",
    providerConfigured: false,
    route: "Changi Airport T3 to Raffles Hotel",
    sendingEnabled: false,
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });

  const camelResponse = await harness.route.GET(
    new Request(
      apiUrl({
        bookingReference: "PLO-WA-SEND-002",
        driverName: "Lim Driver",
        driverPhone: "+65 8777 0000",
        pickupTime: "13 Jun 2026, 09:00",
        route: "Marina Bay Sands to Changi Airport T1",
        vehiclePlate: "SLA4321Z",
        vehicleType: "Toyota Alphard",
      }),
      { headers: adminHeaders() },
    ),
  );
  const camel = await camelResponse.json();

  assert.equal(camelResponse.status, 200);
  assertNoLiveFlags(camel, "Camel-case response");
  assertBlockedSend(camel.send, "Camel-case send result");
  assert.equal(camel.preview.payload.booking_reference, "PLO-WA-SEND-002");
  assert.equal(camel.preview.payload.driver_name, "Lim Driver");
  assert.equal(camel.preview.payload.driver_phone, "+65 8777 0000");
  assert.equal(camel.preview.payload.vehicle_type, "Toyota Alphard");
  assert.equal(camel.preview.payload.vehicle_plate, "SLA4321Z");
  assert.deepEqual(camel.readiness.missing_requirements, []);

  const incompleteResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-WA-SEND-003",
        driver_name: "Tan Driver",
      }),
      { headers: adminHeaders() },
    ),
  );
  const incomplete = await incompleteResponse.json();

  assert.equal(incompleteResponse.status, 200);
  assertNoLiveFlags(incomplete, "Incomplete response");
  assertBlockedSend(incomplete.send, "Incomplete send result");
  assert.equal(incomplete.status, "blocked");
  assert.equal(incomplete.readiness.customerMessageReady, false);
  assert.deepEqual(incomplete.readiness.missing_requirements, [
    "pickup_time",
    "route",
    "driver_phone",
    "vehicle_type",
    "vehicle_plate",
  ]);
  assert.equal(incomplete.send.disabled_message.status, "disabled");
  assert.equal(incomplete.send.disabled_message.external_send, false);

  const unsafeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "payment-token",
        driver_name: "driver_payout",
        driver_phone: "billing_amount",
        pickup_time: "10:00",
        route: "internal_finance_note",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes",
        customer_price: "200",
        internal_admin_notes: "Do not leak",
        payment_link: "https://pay.example",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafe = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 200);
  assertNoLiveFlags(unsafe, "Unsafe response");
  assertNoLiveFlags(unsafe.preview, "Unsafe preview");
  assertNoLiveFlags(unsafe.preview.payload, "Unsafe payload");
  assertBlockedSend(unsafe.send, "Unsafe send result");
  assert.equal(unsafe.preview.payload.booking_reference, null);
  assert.equal(unsafe.preview.payload.driver_name, null);
  assert.equal(unsafe.preview.payload.driver_phone, null);
  assert.equal(unsafe.preview.payload.route, null);
  assert.equal(unsafe.send.event_key, "customer-driver-details-whatsapp");
  assert.equal(unsafe.readiness.customerMessageReady, false);
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(unsafe)),
    false,
    "Unsafe disabled WhatsApp customer driver-details send API output must not leak pricing, payout, billing, payment, internal, provider, or token details.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin WhatsApp customer driver details disabled send setup API contract passed");
