import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-booking-receipt-email.ts";
const routePath = "app/api/customer-booking-requests/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-customer-booking-receipt-email-guard.mjs";
const forbiddenCustomerText =
  /driver payout|customer price|paynow|internal admin|parser debug|finance note|payment detail|raw provider/i;

function transpile(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-receipt-"));
  const sourcePath = path.join(process.cwd(), helperPath);
  const outputPath = path.join(tempDir, "lib/customer-booking-receipt-email.js");
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(outputPath, transpile(await readFile(sourcePath, "utf8"), sourcePath));
  await writeFile(serverOnlyPath, "");

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(outputPath)(outputPath),
  };
}

function booking(reference, overrides = {}) {
  return {
    booking_reference: reference,
    contact_email: "william@prestigelimo.sg",
    dropoff_location: "Changi Airport Terminal 3",
    passenger_name: "William Test",
    pickup_datetime: "2026-07-20T10:00:00+08:00",
    pickup_location: "Orchard Hotel",
    route_type: "Airport Departure",
    route_points: [],
    service_items: [],
    ...overrides,
  };
}

function env(overrides = {}) {
  return {
    PRESTIGE_CUSTOMER_BOOKING_RECEIPT_EMAIL_ENABLED: "true",
    PRESTIGE_CUSTOMER_BOOKING_RECEIPT_EMAIL_FROM:
      "Prestige Limo <info@prestigelimo.sg>",
    PRESTIGE_CUSTOMER_BOOKING_RECEIPT_EMAIL_RECIPIENT_ALLOWLIST:
      "william@prestigelimo.sg",
    PRESTIGE_EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_test_key_1234567890",
    ...overrides,
  };
}

const [helperSource, routeSource, ledger, suite] = await Promise.all(
  [helperPath, routePath, ledgerPath, suitePath].map((file) => readFile(file, "utf8")),
);

assert.ok(routeSource.includes("sendCustomerBookingReceiptEmail(savedRequests)"));
assert.ok(routeSource.includes("receipt_status: receipt.status"));
assert.ok(helperSource.includes('"Idempotency-Key"'));
assert.ok(ledger.includes("### Permanent Booker Link, Rebooking Identity, and Request Receipt"));
assert.ok(suite.includes(guardPath));

const harness = await loadHarness();

try {
  let calls = 0;
  const closed = await harness.helper.sendCustomerBookingReceiptEmail(
    [booking("CUST-RECEIPT-001")],
    {
      env: {},
      providerFetch: async () => {
        calls += 1;
        return { ok: true, status: 200 };
      },
    },
  );
  assert.equal(closed.status, "blocked");
  assert.equal(calls, 0);

  const blockedRecipient = await harness.helper.sendCustomerBookingReceiptEmail(
    [booking("CUST-RECEIPT-002", { contact_email: "someone@example.com" })],
    {
      env: env(),
      providerFetch: async () => {
        calls += 1;
        return { ok: true, status: 200 };
      },
    },
  );
  assert.equal(blockedRecipient.reason, "recipient_not_allowed");
  assert.equal(calls, 0);

  const requests = [];
  const sent = await harness.helper.sendCustomerBookingReceiptEmail(
    [booking("CUST-RECEIPT-003-OUT"), booking("CUST-RECEIPT-003-RET")],
    {
      env: env(),
      providerFetch: async (url, init) => {
        requests.push({ init, url });
        return { ok: true, status: 200 };
      },
    },
  );

  assert.equal(sent.status, "sent");
  assert.equal(sent.external_send, true);
  assert.equal(requests.length, 1, "A return request must send one receipt email.");
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  assert.match(
    requests[0].init.headers["Idempotency-Key"],
    /^customer-request-receipt-CUST-RECEIPT-003-OUT-[a-f0-9]{16}$/,
  );

  const body = JSON.parse(requests[0].init.body);
  assert.deepEqual(body.to, ["william@prestigelimo.sg"]);
  assert.equal(body.subject, "Request received: CUST-RECEIPT-003-OUT");
  for (const text of [
    "Request received — pending review",
    "This is not a booking confirmation.",
    "Reference: CUST-RECEIPT-003-OUT",
    "Reference: CUST-RECEIPT-003-RET",
    "Passenger: William Test",
    "Pickup: Orchard Hotel",
    "Drop-off: Changi Airport Terminal 3",
  ]) {
    assert.ok(body.text.includes(text), `Receipt must include ${text}`);
  }
  assert.equal(forbiddenCustomerText.test(body.text), false);
} finally {
  await harness.cleanup();
}

console.log("Customer booking receipt email guard passed.");
