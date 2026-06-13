import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-customer-driver-details-email-send-disabled-setup/route.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/admin-email-notification-setup-foundation.ts",
  "lib/admin-email-recipient-safety-setup-foundation.ts",
  "lib/admin-email-sender-selection-setup-foundation.ts",
  "lib/admin-email-send-policy-setup-foundation.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/customer-driver-details-email-readiness-setup-foundation.ts",
];
const safeOutputLeakPattern =
  /driver_payout|paynow|pay_now|customer_price|billing|invoice|payment|payout|finance|internal_admin|internal_finance|admin_note|parser|debug|mock_qa|dev_archive|secret|token|smtp|sendgrid|mailgun|postmark|resend/i;
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
  const url = new URL("http://localhost/api/admin-customer-driver-details-email-send-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-email-disabled-send-api-"));
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

for (const fragment of [
  "prepareDisabledAdminEmailSend",
  "buildCustomerDriverDetailsEmailSetup",
  "buildCustomerDriverDetailsEmailReadinessSetup",
  "buildAdminEmailNotificationSetupPayload",
  "buildAdminEmailRecipientSafetySetup",
  "buildAdminEmailSenderSelectionSetup",
  "buildAdminEmailSendPolicySetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "external_send",
  "sendingEnabled",
  "blocked",
]) {
  assert.ok(routeSource.includes(fragment), `Missing disabled send route fragment: ${fragment}`);
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
  "postmark",
  "resend",
  "amazonses",
  "sendMail",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Disabled send API must stay admin-gated.");
  assert.equal(anonymous.external_send, false);
  assert.equal(anonymous.sendingEnabled, false);
  assert.equal(anonymous.status, "blocked");

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-DRV-SEND-001",
        customer_account_label: "Client A",
        customer_email: "EA.Team+ClientA@example.com",
        customer_key: "client-a",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        pickup_time: "12 Jun 2026, 10:00",
        route: "Changi Airport T3 to Raffles Hotel",
        sender_key: "client-a-service",
        sender_label: "Prestige Client A Desk",
        sender_role: "account_service",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.delivery_surface, "email_disabled");
  assert.equal(ready.external_send, false);
  assert.equal(ready.sendingEnabled, false);
  assert.equal(ready.status, "blocked");
  assert.equal(ready.reason, "setup_only_disabled");
  assert.deepEqual(ready.send, {
    delivery_surface: "email_disabled",
    external_send: false,
    payload_preview: {
      booking_reference: "PLO-DRV-SEND-001",
      body_line_count: 6,
      recipient_email: "ea.team+clienta@example.com",
      sender_key: "client-a-service",
      subject: "Assigned driver details for PLO-DRV-SEND-001",
      template_key: "customer_assigned_driver_details",
    },
    reason: "setup_only_disabled",
    sendingEnabled: false,
    status: "blocked",
    version: "admin-email-send-disabled-adapter-v1",
  });
  assert.equal(ready.preview.body_line_count, 6);
  assert.equal(ready.preview.recipient_status, "valid");
  assert.equal(ready.preview.sendingEnabled, false);
  assert.equal(ready.readiness.readyForFutureSetup, true);
  assert.equal(ready.readiness.readyToSend, false);
  assert.equal(ready.readiness.sendingEnabled, false);
  assert.equal(ready.readiness.external_send, false);
  assert.equal(safeOutputLeakPattern.test(JSON.stringify(ready)), false, "Ready output must stay no-op safe.");

  const blockedResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "payment-token",
        customer_email: "customer_price@example.com",
        driver_name: "driver_payout",
        driver_phone: "billing_amount",
        pickup_time: "10:00",
        route: "internal_finance_note",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes",
      }),
      { headers: adminHeaders() },
    ),
  );
  const blocked = await blockedResponse.json();

  assert.equal(blockedResponse.status, 200);
  assert.equal(blocked.ok, true);
  assert.equal(blocked.external_send, false);
  assert.equal(blocked.sendingEnabled, false);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reason, "setup_only_disabled");
  assert.equal(blocked.send.external_send, false);
  assert.equal(blocked.send.sendingEnabled, false);
  assert.equal(blocked.send.status, "blocked");
  assert.equal(blocked.send.reason, "setup_only_disabled");
  assert.equal(blocked.send.payload_preview.booking_reference, null);
  assert.equal(blocked.send.payload_preview.recipient_email, null);
  assert.equal(blocked.send.payload_preview.sender_key, null);
  assert.equal(blocked.send.payload_preview.subject, "Assigned driver details");
  assert.equal(blocked.readiness.readyForFutureSetup, false);
  assert.equal(blocked.readiness.readyToSend, false);
  assert.deepEqual(blocked.readiness.missing_requirements, [
    "customer_driver_details_template",
    "recipient_safety",
    "sender_selection",
    "email_send_policy",
  ]);
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(blocked)),
    false,
    "Blocked output must not leak unsafe send input.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin customer driver details email disabled send setup API contract passed");
