import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/whatsapp-customer-driver-details-setup-foundation.ts";
const helperPaths = [
  "lib/admin-whatsapp-message-disabled-adapter.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  helperPath,
];
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "WhatsApp customer driver-details helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "WhatsApp customer driver-details helper must not use network APIs.");
assert.equal(/graph\.facebook\.com|whatsapp\.com|wa\.me|api\.whatsapp|\/messages\b|\/message_templates\b/i.test(source), false, "WhatsApp customer driver-details helper must not include WhatsApp API URLs or endpoints.");
assert.equal(/sendMessage|send_message|getUpdates|webhook|polling|message_templates|createTemplate|sendTemplate/i.test(source), false, "WhatsApp customer driver-details helper must not include send, polling, webhook, or provider-template operations.");
assert.equal(/\bprocess\.env\b|ACCESS_TOKEN|PHONE_NUMBER_ID|WATI|TWILIO|META|bot[_-]?token/i.test(source), false, "WhatsApp customer driver-details helper must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "WhatsApp customer driver-details helper must not define API behavior.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "WhatsApp customer driver-details helper must not use DB writes.");
assert.equal(/customer_price|driver_payout|paynow|payment|billing|invoice|payout|internal_admin_note|internal_finance_note|internal_note/i.test(source), false, "WhatsApp customer driver-details helper source must not introduce sensitive output fields.");

for (const fragment of [
  "buildCustomerDriverDetailsEmailSetup",
  "prepareDisabledAdminWhatsAppMessage",
  "whatsapp_customer",
  "providerConfigured: false",
  "liveSendingEnabled: false",
  "external_send: false",
  "sendingEnabled: false",
  "customer_assigned_driver_details_whatsapp",
]) {
  assert.ok(source.includes(fragment), `Missing WhatsApp customer driver-details setup fragment: ${fragment}`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-whatsapp-customer-driver-details-"));
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
  const { buildWhatsAppCustomerDriverDetailsSetup } = harness.helper;
  const ready = buildWhatsAppCustomerDriverDetailsSetup({
    booking_reference: "PLO-WA-DRV-001",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    pickup_time: "12 Jun 2026, 10:00",
    route: "Changi Airport T3 to Raffles Hotel",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });

  assert.deepEqual(ready, {
    adminReviewRequired: true,
    channel: "whatsapp_customer",
    customerMessageReady: true,
    delivery_surface: "whatsapp_customer_driver_details_setup_only",
    disabled_message: {
      delivery_surface: "whatsapp_disabled",
      event_key: "customer-driver-details-whatsapp-PLO-WA-DRV-001",
      external_send: false,
      notification_type: "customer_driver_details",
      preview: {
        safe_message:
          "Prestige update: assigned driver details. Booking: PLO-WA-DRV-001 Pickup: 12 Jun 2026, 10:00 Route: Changi Airport T3 to Raffles Hotel Driver: Tan Driver Driver phone: +65 8888 0000 Vehicle: Mercedes V-Class / SLA1234X",
        safe_title: "Assigned driver details",
      },
      status: "disabled",
      version: "admin-whatsapp-message-disabled-adapter-v1",
    },
    external_send: false,
    liveSendingEnabled: false,
    message: {
      body_lines: [
        "Booking: PLO-WA-DRV-001",
        "Pickup: 12 Jun 2026, 10:00",
        "Route: Changi Airport T3 to Raffles Hotel",
        "Driver: Tan Driver",
        "Driver phone: +65 8888 0000",
        "Vehicle: Mercedes V-Class / SLA1234X",
      ],
      message_key: "customer_assigned_driver_details_whatsapp",
      message_text: [
        "Prestige update: assigned driver details.",
        "Booking: PLO-WA-DRV-001",
        "Pickup: 12 Jun 2026, 10:00",
        "Route: Changi Airport T3 to Raffles Hotel",
        "Driver: Tan Driver",
        "Driver phone: +65 8888 0000",
        "Vehicle: Mercedes V-Class / SLA1234X",
      ].join("\n"),
      preview_text: "Your assigned driver is Tan Driver.",
    },
    missing_requirements: [],
    payload: {
      booking_reference: "PLO-WA-DRV-001",
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
    },
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "whatsapp-customer-driver-details-setup-foundation-v1",
  });
  assertNoLiveFlags(ready, "Ready WhatsApp customer driver-details setup");
  assertNoLiveFlags(ready.payload, "Ready WhatsApp customer driver-details payload");
  assert.equal(ready.disabled_message.external_send, false);
  assert.equal(ready.disabled_message.status, "disabled");

  const nestedInput = buildWhatsAppCustomerDriverDetailsSetup({
    bookingReference: "PLO-WA-DRV-002",
    driver: {
      name: "Lim Driver",
      phone: "+65 8777 0000",
    },
    pickupTime: "13 Jun 2026, 09:00",
    route: "Marina Bay Sands to Changi Airport T1",
    vehicle: {
      plate: "SLA4321Z",
      type: "Toyota Alphard",
    },
  });

  assert.equal(nestedInput.customerMessageReady, true);
  assert.equal(nestedInput.payload.booking_reference, "PLO-WA-DRV-002");
  assert.equal(nestedInput.payload.driver_name, "Lim Driver");
  assert.equal(nestedInput.payload.driver_phone, "+65 8777 0000");
  assert.equal(nestedInput.payload.vehicle_type, "Toyota Alphard");
  assert.equal(nestedInput.payload.vehicle_plate, "SLA4321Z");
  assert.deepEqual(nestedInput.missing_requirements, []);
  assertNoLiveFlags(nestedInput, "Nested-input WhatsApp customer driver-details setup");

  const incomplete = buildWhatsAppCustomerDriverDetailsSetup({
    booking_reference: "PLO-WA-DRV-003",
    driver_name: "Tan Driver",
  });

  assert.equal(incomplete.customerMessageReady, false);
  assertNoLiveFlags(incomplete, "Incomplete WhatsApp customer driver-details setup");
  assert.deepEqual(incomplete.missing_requirements, [
    "pickup_time",
    "route",
    "driver_phone",
    "vehicle_type",
    "vehicle_plate",
  ]);
  assert.equal(incomplete.disabled_message.status, "disabled");
  assert.equal(incomplete.disabled_message.external_send, false);

  const unsafe = buildWhatsAppCustomerDriverDetailsSetup({
    booking_reference: "payment-token",
    driver_name: "driver_payout",
    driver_phone: "billing_amount",
    pickup_time: "10:00",
    route: "internal_finance_note",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes",
    customer_price: 200,
    internal_admin_notes: "Do not leak",
    payment_link: "https://pay.example",
  });

  assert.equal(unsafe.customerMessageReady, false);
  assertNoLiveFlags(unsafe, "Unsafe WhatsApp customer driver-details setup");
  assertNoLiveFlags(unsafe.payload, "Unsafe WhatsApp customer driver-details payload");
  assert.equal(unsafe.payload.booking_reference, null);
  assert.equal(unsafe.payload.driver_name, null);
  assert.equal(unsafe.payload.driver_phone, null);
  assert.equal(unsafe.payload.route, null);
  assert.equal(unsafe.disabled_message.external_send, false);
  assert.equal(unsafe.disabled_message.status, "disabled");
  assert.equal(
    /customer_price|driver_payout|billing|payment|paynow|payout|invoice|internal_admin|internal_finance|secret|token|graph\.facebook|api\.whatsapp|whatsapp\.com|wa\.me/i.test(
      JSON.stringify(unsafe),
    ),
    false,
    "Unsafe WhatsApp customer driver-details output must not leak pricing, payout, billing, payment, internal, provider, or token details.",
  );
} finally {
  await harness.cleanup();
}

console.log("WhatsApp customer driver-details setup foundation contract tests passed.");
