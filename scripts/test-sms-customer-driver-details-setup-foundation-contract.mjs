import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/sms-customer-driver-details-setup-foundation.ts";
const helperPaths = [
  "lib/customer-driver-details-email-setup-foundation.ts",
  helperPath,
];
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "SMS customer driver-details helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "SMS customer driver-details helper must not use network APIs.");
assert.equal(/twilio|vonage|messagebird|aws-sns|snsClient|publishCommand|plivo|telnyx/i.test(source), false, "SMS customer driver-details helper must not reference SMS provider SDKs.");
assert.equal(/\bprocess\.env\b|SMS_[A-Z_]*|TWILIO_[A-Z_]*|VONAGE_[A-Z_]*|SNS_[A-Z_]*|API_KEY|ACCESS_TOKEN|SECRET_KEY/.test(source), false, "SMS customer driver-details helper must not read env/provider secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "SMS customer driver-details helper must not define API behavior.");
assert.equal(/sendMessage|send_message|messages\.create|client\.messages|publish\s*\(|sendSms|sendSMS|sendText/i.test(source), false, "SMS customer driver-details helper must not include send operations.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "SMS customer driver-details helper must not use DB writes.");
assert.equal(/customer_price|driver_payout|paynow|payment|billing|invoice|payout|internal_admin_note|internal_finance_note|internal_note/i.test(source), false, "SMS customer driver-details helper source must not introduce sensitive output fields.");

for (const fragment of [
  "buildCustomerDriverDetailsEmailSetup",
  "sms_customer",
  "sms_customer_driver_details_setup_only",
  "providerConfigured: false",
  "liveSendingEnabled: false",
  "external_send: false",
  "sendingEnabled: false",
  "customer_assigned_driver_details_sms",
  "secure_details_link",
]) {
  assert.ok(source.includes(fragment), `Missing SMS customer driver-details setup fragment: ${fragment}`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-sms-customer-driver-details-"));
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

function assertNoLiveFlags(value, label) {
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.liveSendingEnabled, false, `${label} must keep liveSendingEnabled false.`);
  assert.equal(value.providerConfigured, false, `${label} must keep providerConfigured false.`);
  assert.equal(value.sendingEnabled, false, `${label} must keep sendingEnabled false.`);
}

const harness = await loadHelper();

try {
  const { buildSmsCustomerDriverDetailsSetup } = harness.helper;
  const ready = buildSmsCustomerDriverDetailsSetup({
    booking_reference: "PLO-SMS-DRV-001",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    pickup_time: "12 Jun 2026, 10:00",
    secure_details_link: "https://prestige.example/customer-driver-details/PLO-SMS-DRV-001",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });

  assert.deepEqual(ready, {
    channel: "sms_customer",
    customerMessageReady: true,
    delivery_surface: "sms_customer_driver_details_setup_only",
    external_send: false,
    liveSendingEnabled: false,
    message: {
      message_key: "customer_assigned_driver_details_sms",
      message_text:
        "Prestige: Booking PLO-SMS-DRV-001. Pickup 12 Jun 2026, 10:00. Driver Tan Driver +65 8888 0000. Vehicle Mercedes V-Class SLA1234X. Details https://prestige.example/customer-driver-details/PLO-SMS-DRV-001.",
      preview_text: "Driver Tan Driver assigned.",
    },
    missing_requirements: [],
    payload: {
      booking_reference: "PLO-SMS-DRV-001",
      channel: "sms_customer",
      driver_name: "Tan Driver",
      driver_phone: "+65 8888 0000",
      external_send: false,
      liveSendingEnabled: false,
      pickup_time: "12 Jun 2026, 10:00",
      providerConfigured: false,
      secure_details_link: "https://prestige.example/customer-driver-details/PLO-SMS-DRV-001",
      sendingEnabled: false,
      vehicle_plate: "SLA1234X",
      vehicle_type: "Mercedes V-Class",
    },
    providerConfigured: false,
    sendingEnabled: false,
    smsMessageReady: true,
    status: "setup_only",
    version: "sms-customer-driver-details-setup-foundation-v1",
  });
  assertNoLiveFlags(ready, "Ready SMS customer driver-details setup");
  assertNoLiveFlags(ready.payload, "Ready SMS customer driver-details payload");

  const nestedInput = buildSmsCustomerDriverDetailsSetup({
    bookingReference: "PLO-SMS-DRV-002",
    detailsLink: "https://prestige.example/customer-driver-details/PLO-SMS-DRV-002",
    driver: {
      name: "Lim Driver",
      phone: "+65 8777 0000",
    },
    pickupTime: "13 Jun 2026, 09:00",
    vehicle: {
      plate: "SLA4321Z",
      type: "Toyota Alphard",
    },
  });

  assert.equal(nestedInput.customerMessageReady, true);
  assert.equal(nestedInput.smsMessageReady, true);
  assert.equal(nestedInput.payload.booking_reference, "PLO-SMS-DRV-002");
  assert.equal(nestedInput.payload.driver_name, "Lim Driver");
  assert.equal(nestedInput.payload.driver_phone, "+65 8777 0000");
  assert.equal(nestedInput.payload.vehicle_type, "Toyota Alphard");
  assert.equal(nestedInput.payload.vehicle_plate, "SLA4321Z");
  assert.equal(
    nestedInput.payload.secure_details_link,
    "https://prestige.example/customer-driver-details/PLO-SMS-DRV-002",
  );
  assert.deepEqual(nestedInput.missing_requirements, []);
  assertNoLiveFlags(nestedInput, "Nested-input SMS customer driver-details setup");

  const incomplete = buildSmsCustomerDriverDetailsSetup({
    booking_reference: "PLO-SMS-DRV-003",
    driver_name: "Tan Driver",
  });

  assert.equal(incomplete.customerMessageReady, false);
  assert.equal(incomplete.smsMessageReady, false);
  assertNoLiveFlags(incomplete, "Incomplete SMS customer driver-details setup");
  assert.deepEqual(incomplete.missing_requirements, [
    "pickup_time",
    "driver_phone",
    "vehicle_type",
    "vehicle_plate",
  ]);
  assert.equal(
    incomplete.message.message_text,
    "Prestige: Booking PLO-SMS-DRV-003. Driver Tan Driver.",
  );

  const unsafe = buildSmsCustomerDriverDetailsSetup({
    booking_reference: "payment-token",
    driver_name: "driver_payout",
    driver_phone: "billing_amount",
    pickup_time: "10:00",
    secure_details_link: "https://prestige.example/customer-driver-details/payment-token",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes",
  });

  assert.equal(unsafe.customerMessageReady, false);
  assert.equal(unsafe.smsMessageReady, false);
  assertNoLiveFlags(unsafe, "Unsafe SMS customer driver-details setup");
  assertNoLiveFlags(unsafe.payload, "Unsafe SMS customer driver-details payload");
  assert.equal(unsafe.payload.booking_reference, null);
  assert.equal(unsafe.payload.driver_name, null);
  assert.equal(unsafe.payload.driver_phone, null);
  assert.equal(unsafe.payload.secure_details_link, null);
  assert.equal(
    unsafe.message.message_text,
    "Prestige: Pickup 10:00. Vehicle Mercedes SLA1234X.",
  );
  assert.equal(
    /customer_price|driver_payout|billing|payment|paynow|payout|invoice|internal_admin|internal_finance|secret|token|twilio|vonage|messagebird/i.test(
      JSON.stringify(unsafe),
    ),
    false,
    "Unsafe SMS customer driver-details output must not leak pricing, payout, billing, payment, internal, provider, or token details.",
  );
} finally {
  await harness.cleanup();
}

console.log("SMS customer driver-details setup foundation contract tests passed.");
