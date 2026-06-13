import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/customer-driver-details-link-access-disabled-setup/route.ts";
const helperPath = "lib/customer-driver-details-link-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/customer-driver-details-email-setup-foundation.ts",
  helperPath,
];
const unsafeOutputPattern =
  /Tan Driver|\+65 8888 0000|SLA1234X|Mercedes V-Class|Changi Airport|Raffles Hotel|client@example\.com|real-token-do-not-use|driver_payout|customer_price|paynow|payment|billing|invoice|payout|internal_admin|internal_finance|service_role|server_secret|secret|stripe|smtp/i;

function apiUrl(params = {}) {
  const url = new URL("http://localhost/api/customer-driver-details-link-access-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertLinkBlocked(value, label) {
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.linkEnabled, false, `${label} must keep linkEnabled false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
  assert.equal(value.tokenIssued, false, `${label} must keep tokenIssued false.`);

  if (Object.hasOwn(value, "status")) {
    assert.equal(value.status, "blocked", `${label} must stay blocked.`);
  }

  if (Object.hasOwn(value, "no_op")) {
    assert.equal(value.no_op, true, `${label} must stay no-op.`);
  }

  if (Object.hasOwn(value, "providerConfigured")) {
    assert.equal(value.providerConfigured, false, `${label} must keep providerConfigured false.`);
  }
}

function assertNoRevealedDetails(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not reveal driver/customer details or sensitive operational fields.`,
  );
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-details-link-access-"));
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
  "admin-customer-driver-details-link-preview-readiness-setup",
  "export async function GET",
  "customer_driver_details_link_access_disabled_setup_only",
  "customer-safe-placeholder",
  "linkEnabled: false",
  "tokenIssued: false",
  "liveAccessEnabled: false",
  "external_send: false",
  'status: "blocked"',
  "no_op: true",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing disabled customer driver-details link access fragment: ${fragment}`);
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
  "cookies(",
  "headers(",
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
  const blockedResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-LINK-ACCESS-001",
        customer_email: "client@example.com",
        customer_price: "200",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        expiry_label: "Expires 15 minutes after issue",
        internal_admin_notes: "Do not leak",
        pickup_time: "12 Jun 2026, 10:00",
        route: "Changi Airport T3 to Raffles Hotel",
        token: "real-token-do-not-use",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
    ),
  );
  const blocked = await blockedResponse.json();

  assert.equal(blockedResponse.status, 200);
  assert.equal(blocked.ok, true);
  assertLinkBlocked(blocked, "Blocked response");
  assertLinkBlocked(blocked.access, "Blocked access result");
  assertLinkBlocked(blocked.preview, "Blocked preview");
  assertLinkBlocked(blocked.preview.payload, "Blocked preview payload");
  assertLinkBlocked(blocked.readiness, "Blocked readiness");
  assert.equal(blocked.access.no_op, true);
  assert.equal(blocked.reason, "setup_only_disabled");
  assert.equal(blocked.access.reason, "setup_only_disabled");
  assert.equal(blocked.access.result_label, "blocked/no-op");
  assert.equal(blocked.access.customer_safe_token_placeholder, "customer-safe-placeholder");
  assert.equal(blocked.preview.customer_safe_token_placeholder, "customer-safe-placeholder");
  assert.equal(blocked.preview.payload.customer_safe_token_placeholder, "customer-safe-placeholder");
  assert.equal(blocked.access.booking_reference, null);
  assert.equal(blocked.access.customer_details, null);
  assert.equal(blocked.access.driver_details, null);
  assert.equal(blocked.preview.payload.booking_reference, null);
  assert.deepEqual(blocked.access.driver_details_visibility_flags, {
    booking_reference: false,
    driver_name: false,
    driver_phone: false,
    pickup_time: false,
    route: false,
    vehicle_plate: false,
    vehicle_type: false,
  });
  assert.deepEqual(blocked.preview.payload.driver_details_visibility_flags, {
    booking_reference: false,
    driver_name: false,
    driver_phone: false,
    pickup_time: false,
    route: false,
    vehicle_plate: false,
    vehicle_type: false,
  });
  assert.deepEqual(blocked.channels, ["email", "whatsapp", "sms"]);
  assert.equal(
    blocked.preview_readiness_source,
    "admin-customer-driver-details-link-preview-readiness-setup",
  );
  assertNoRevealedDetails(blocked, "Blocked customer driver-details link access response");

  const repeatedResponse = await harness.route.GET(new Request(apiUrl({ token: "server_secret" })));
  const repeated = await repeatedResponse.json();

  assert.equal(repeatedResponse.status, 200);
  assert.equal(repeated.status, "blocked");
  assertLinkBlocked(repeated, "Repeated blocked response");
  assert.equal(repeated.access.customer_safe_token_placeholder, "customer-safe-placeholder");
  assertNoRevealedDetails(repeated, "Repeated blocked customer driver-details link access response");
} finally {
  await harness.cleanup();
}

console.log("customer driver details link access disabled setup API contract passed");
