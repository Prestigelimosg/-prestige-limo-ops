import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-driver-details-email-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Customer driver-details email helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Customer driver-details email helper must not use network APIs.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|amazonses|sesClient/i.test(source), false, "Customer driver-details email helper must not reference email providers.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Customer driver-details email helper must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Customer driver-details email helper must not define API behavior.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-email-"));
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(outputPath, transpileTypescript(source, helperPath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(outputPath),
  };
}

const harness = await loadHelper();

try {
  const { buildCustomerDriverDetailsEmailSetup } = harness.helper;
  const result = buildCustomerDriverDetailsEmailSetup({
    booking_reference: "PLO-DRV-001",
    customer_email: "EA.Team+ClientA@example.com",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    pickup_time: "12 Jun 2026, 10:00",
    route: "Changi Airport T3 to Raffles Hotel",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });

  assert.deepEqual(result, {
    delivery_surface: "customer_driver_details_email_setup_only",
    external_send: false,
    payload: {
      booking_reference: "PLO-DRV-001",
      customer_email: "ea.team+clienta@example.com",
      driver_name: "Tan Driver",
      driver_phone: "+65 8888 0000",
      pickup_time: "12 Jun 2026, 10:00",
      route: "Changi Airport T3 to Raffles Hotel",
      vehicle_plate: "SLA1234X",
      vehicle_type: "Mercedes V-Class",
    },
    recipient_status: "valid",
    sendingEnabled: false,
    status: "setup_only",
    template: {
      body_lines: [
        "Booking: PLO-DRV-001",
        "Pickup: 12 Jun 2026, 10:00",
        "Route: Changi Airport T3 to Raffles Hotel",
        "Driver: Tan Driver",
        "Driver phone: +65 8888 0000",
        "Vehicle: Mercedes V-Class / SLA1234X",
      ],
      preview_text: "Your assigned driver is Tan Driver.",
      subject: "Assigned driver details for PLO-DRV-001",
      template_key: "customer_assigned_driver_details",
    },
    version: "customer-driver-details-email-setup-foundation-v1",
  });

  const invalidRecipient = buildCustomerDriverDetailsEmailSetup({
    booking_reference: "PLO-DRV-002",
    customer_email: "not-an-email",
    driver_name: "Tan Driver",
  });

  assert.equal(invalidRecipient.external_send, false, "Invalid recipient must still never send.");
  assert.equal(invalidRecipient.sendingEnabled, false, "Email setup must remain disabled.");
  assert.equal(invalidRecipient.recipient_status, "blocked");
  assert.equal(invalidRecipient.payload.customer_email, null);

  const unsafe = buildCustomerDriverDetailsEmailSetup({
    booking_reference: "payment-token",
    customer_email: "customer_price@example.com",
    driver_name: "driver_payout",
    driver_phone: "billing_amount",
    pickup_time: "10:00",
    route: "internal_finance_note",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes",
    customer_price: 200,
    driver_payout_amount: 90,
    internal_admin_notes: "Do not leak",
    payment_link: "https://pay.example",
  });

  assert.equal(unsafe.external_send, false, "Unsafe setup must still never send.");
  assert.equal(unsafe.sendingEnabled, false, "Unsafe setup must remain disabled.");
  assert.equal(unsafe.recipient_status, "blocked");
  assert.equal(unsafe.payload.booking_reference, null);
  assert.equal(unsafe.payload.customer_email, null);
  assert.equal(unsafe.payload.driver_name, null);
  assert.equal(unsafe.payload.driver_phone, null);
  assert.equal(unsafe.payload.route, null);
  assert.equal(
    /customer_price|driver_payout|billing|payment|payout|internal_admin|internal_finance|token/i.test(
      JSON.stringify(unsafe),
    ),
    false,
    "Unsafe pricing, billing, payment, payout, and internal fields must not leak.",
  );
} finally {
  await harness.cleanup();
}

console.log("Customer driver-details email setup foundation contract tests passed.");
