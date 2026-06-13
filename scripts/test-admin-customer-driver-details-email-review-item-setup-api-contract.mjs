import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-customer-driver-details-email-review-item-setup/route.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/driver-ack-customer-message-handoff-setup-foundation.ts",
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

function useLocalAdminBoundary() {
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
  const url = new URL("http://localhost/api/admin-customer-driver-details-email-review-item-setup");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-email-review-item-api-"));
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
  "buildDriverAckCustomerMessageHandoffSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "Customer driver details ready",
  "Review email to customer",
  "adminReviewRequired",
  "customerEmailReady",
  "external_send",
  "sendingEnabled",
]) {
  assert.ok(routeSource.includes(fragment), `Missing review item route fragment: ${fragment}`);
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
  useLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Review item API must stay admin-gated.");
  assert.equal(anonymous.adminReviewRequired, true);
  assert.equal(anonymous.customerEmailReady, false);
  assert.equal(anonymous.external_send, false);
  assert.equal(anonymous.sendingEnabled, false);
  assert.equal(anonymous.reviewItem.actionLabel, "Review email to customer");

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-REVIEW-001",
        customer_email: "EA.Team+ClientA@example.com",
        driver_ack_status: "driver_acknowledged",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.adminReviewRequired, true);
  assert.equal(ready.customerEmailReady, true);
  assert.equal(ready.external_send, false);
  assert.equal(ready.sendingEnabled, false);
  assert.equal(ready.reviewItem.actionLabel, "Review email to customer");
  assert.equal(ready.reviewItem.adminReviewRequired, true);
  assert.equal(ready.reviewItem.customerEmailReady, true);
  assert.equal(ready.reviewItem.external_send, false);
  assert.equal(ready.reviewItem.sendingEnabled, false);
  assert.equal(ready.reviewItem.item_key, "customer_driver_details_email");
  assert.equal(ready.reviewItem.label, "Customer driver details ready");
  assert.equal(ready.reviewItem.readiness_status, "ready");
  assert.equal(ready.reviewItem.disabled_send_status, "blocked");
  assert.deepEqual(ready.reviewItem.missing_requirements, []);
  assert.equal(ready.reviewItem.preview.recipient_status, "valid");
  assert.equal(ready.reviewItem.preview.subject, "Assigned driver details for PLO-REVIEW-001");
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(ready)),
    false,
    "Ready review item output must stay setup-only and customer-safe.",
  );

  const blockedResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "payment-token",
        customer_email: "customer_price@example.com",
        driver_ack_status: "waiting",
        driver_name: "driver_payout",
        driver_phone: "billing_amount",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes",
      }),
      { headers: adminHeaders() },
    ),
  );
  const blocked = await blockedResponse.json();

  assert.equal(blockedResponse.status, 200);
  assert.equal(blocked.ok, true);
  assert.equal(blocked.adminReviewRequired, true);
  assert.equal(blocked.customerEmailReady, false);
  assert.equal(blocked.external_send, false);
  assert.equal(blocked.sendingEnabled, false);
  assert.equal(blocked.reviewItem.actionLabel, "Review email to customer");
  assert.equal(blocked.reviewItem.readiness_status, "blocked");
  assert.equal(blocked.reviewItem.customerEmailReady, false);
  assert.equal(blocked.reviewItem.disabled_send_status, "blocked");
  assert.deepEqual(blocked.reviewItem.missing_requirements, [
    "driver_acknowledged",
    "booking_reference",
    "customer_email",
    "driver_name",
    "driver_phone",
  ]);
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(blocked)),
    false,
    "Blocked review item output must not leak unsafe input.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin customer driver details email review item setup API contract passed");
