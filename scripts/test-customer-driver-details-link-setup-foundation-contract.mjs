import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-driver-details-link-setup-foundation.ts";
const helperPaths = [
  "lib/customer-driver-details-email-setup-foundation.ts",
  helperPath,
];
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Customer driver-details link helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Link setup helper must not use network APIs.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Link setup helper must not define API behavior.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/i.test(source), false, "Link setup helper must not read env/provider secrets.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "Link setup helper must not use DB writes.");
assert.equal(/liveLocation|geolocation|getCurrentPosition|watchPosition|maps\.google|mapbox/i.test(source), false, "Link setup helper must not activate live location behavior.");
assert.equal(
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram|stripe)["']|require\(\s*["'](?:nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram|stripe)["']\s*\)|\b(?:Mailgun|Postmark|Resend|SendGrid|Stripe|TelegramBot|Twilio|Vonage)\b/.test(
    source,
  ),
  false,
  "Link setup helper must not reference provider or payment SDKs.",
);
assert.equal(/sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|client\.messages|publish\s*\(/i.test(source), false, "Link setup helper must not include send operations.");

for (const fragment of [
  "buildCustomerDriverDetailsEmailSetup",
  "customer_driver_details_secure_link",
  "customer_driver_details_link_setup_only",
  "linkEnabled: false",
  "tokenIssued: false",
  "liveAccessEnabled: false",
  "external_send: false",
  "email",
  "whatsapp",
  "sms",
]) {
  assert.ok(source.includes(fragment), `Missing customer driver-details link setup fragment: ${fragment}`);
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

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-details-link-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const pathName of helperPaths) {
    const helperSource = await readFile(pathName, "utf8");
    const outputPath = path.join(tempDir, pathName.replace(/\.ts$/, ".js"));

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transpileTypescript(helperSource, pathName));
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
  };
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
}

const harness = await loadHelper();

try {
  const { buildCustomerDriverDetailsLinkSetup } = harness.helper;
  const ready = buildCustomerDriverDetailsLinkSetup({
    booking_reference: "PLO-LINK-001",
    customer_safe_token_placeholder: "customer-safe-placeholder",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    expiry_label: "Expires 15 minutes after issue",
    pickup_time: "12 Jun 2026, 10:00",
    route: "Changi Airport T3 to Raffles Hotel",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });

  assert.deepEqual(ready, {
    authActivationEnabled: false,
    channel: "customer_driver_details_secure_link",
    channels: ["email", "whatsapp", "sms"],
    customer_safe_token_placeholder: "customer-safe-placeholder",
    dbWriteEnabled: false,
    delivery_surface: "customer_driver_details_link_setup_only",
    external_send: false,
    expiry_label: "Expires 15 minutes after issue",
    linkEnabled: false,
    linkPayloadReady: true,
    liveAccessEnabled: false,
    missing_requirements: [],
    payload: {
      authActivationEnabled: false,
      booking_reference: "PLO-LINK-001",
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
    },
    providerConfigured: false,
    status: "setup_only",
    tokenIssued: false,
    version: "customer-driver-details-link-setup-foundation-v1",
  });
  assertLinkDisabled(ready, "Ready customer driver-details link setup");
  assertLinkDisabled(ready.payload, "Ready customer driver-details link payload");

  const nested = buildCustomerDriverDetailsLinkSetup({
    bookingReference: "PLO-LINK-002",
    channels: ["sms", "whatsapp"],
    driver: {
      name: "Lim Driver",
      phone: "+65 8777 0000",
    },
    pickupTime: "13 Jun 2026, 09:00",
    tokenPlaceholder: "approved-placeholder",
    vehicle: {
      plate: "SLA4321Z",
      type: "Toyota Alphard",
    },
  });

  assert.equal(nested.linkPayloadReady, true);
  assert.deepEqual(nested.channels, ["whatsapp", "sms"]);
  assert.equal(nested.customer_safe_token_placeholder, "approved-placeholder");
  assert.equal(nested.expiry_label, "Short-lived setup placeholder");
  assert.deepEqual(nested.missing_requirements, []);
  assert.deepEqual(nested.payload.driver_details_visibility_flags, {
    booking_reference: true,
    driver_name: true,
    driver_phone: true,
    pickup_time: true,
    route: false,
    vehicle_plate: true,
    vehicle_type: true,
  });
  assertLinkDisabled(nested, "Nested customer driver-details link setup");

  const unsafe = buildCustomerDriverDetailsLinkSetup({
    booking_reference: "payment-token",
    customerSafeTokenPlaceholder: "server_secret placeholder",
    driver_name: "driver_payout",
    driver_phone: "billing_amount",
    expiryLabel: "invoice payment secret",
    pickup_time: "10:00",
    route: "internal_admin_note",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes",
  });

  assert.equal(unsafe.linkPayloadReady, false);
  assertLinkDisabled(unsafe, "Unsafe customer driver-details link setup");
  assertLinkDisabled(unsafe.payload, "Unsafe customer driver-details link payload");
  assert.deepEqual(unsafe.missing_requirements, ["booking_reference"]);
  assert.equal(unsafe.payload.booking_reference, null);
  assert.equal(unsafe.customer_safe_token_placeholder, "customer-safe-placeholder");
  assert.equal(unsafe.expiry_label, "Short-lived setup placeholder");
  assert.deepEqual(unsafe.payload.driver_details_visibility_flags, {
    booking_reference: false,
    driver_name: false,
    driver_phone: false,
    pickup_time: true,
    route: false,
    vehicle_plate: true,
    vehicle_type: true,
  });
  assert.equal(
    /customer_price|driver_payout|billing|payment|paynow|payout|invoice|internal_admin|internal_finance|service_role|secret|stripe/i.test(
      JSON.stringify(unsafe),
    ),
    false,
    "Unsafe customer driver-details link output must not leak pricing, payout, billing, payment, internal, or secret details.",
  );
} finally {
  await harness.cleanup();
}

console.log("Customer driver-details link setup foundation contract tests passed.");
