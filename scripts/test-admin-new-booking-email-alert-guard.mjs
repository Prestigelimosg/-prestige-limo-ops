import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-new-booking-email-alert.ts";
const routePath = "app/api/customer-booking-requests/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-admin-new-booking-email-alert-guard.mjs";
const forbiddenPattern =
  /driver_payout|driver_payout_rules|customer_rates|paynow|pay_now|invoice|payment|billing|payout|pricing|parser|debug|internal admin|raw_provider|secret|token|gps|live location|calendar/i;

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function loadHelperHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-new-booking-email-"));
  const sourcePath = path.join(process.cwd(), helperPath);
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const helperSource = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(helperSource, sourcePath));
  await writeFile(serverOnlyPath, "");

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(outputPath)(outputPath),
  };
}

function safeBooking(overrides = {}) {
  return {
    booking_reference: "CUST-ALERT-001",
    contact_phone: "91234567",
    customer_display_name: "Prestige Test Customer",
    dropoff_location: "Changi Airport Terminal 3",
    passenger_name: "William Test",
    pickup_datetime: "2026-06-28T02:00:00+08:00",
    pickup_location: "Orchard Hotel",
    route_type: "DEP",
    route_points: [],
    service_items: [],
    ...overrides,
  };
}

function alertEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_ENABLED: "true",
    PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_TO: "ops@example.com",
    PRESTIGE_EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_test_key_1234567890",
    ...overrides,
  };
}

const [helperSource, routeSource, ledger, preactivationSuite] = await Promise.all(
  [helperPath, routePath, ledgerPath, preactivationSuitePath].map((file) =>
    readFile(path.join(process.cwd(), file), "utf8"),
  ),
);

for (const required of [
  "server-only",
  "PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_ENABLED",
  "PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_TO",
  "PRESTIGE_EMAIL_PROVIDER",
  "RESEND_API_KEY",
  "https://api.resend.com/emails",
  "batch_send_enabled: false",
  "database_write_enabled: false",
  "scheduler_enabled: false",
  "gps_enabled: false",
  "billing_email_enabled: false",
  "calendar_sync_enabled: false",
]) {
  assert.equal(helperSource.includes(required), true, `Email alert helper must include ${required}.`);
}

assert.equal(
  /from\s+["'](?:resend|nodemailer|postmark|@sendgrid\/mail|mailgun\.js)["']/.test(helperSource),
  false,
  "Email alert helper must not import provider SDKs.",
);
assert.equal(
  routeSource.includes("sendAdminNewBookingEmailAlert") &&
    /try\s*\{[\s\S]+sendAdminNewBookingEmailAlert[\s\S]+catch\s*\{[\s\S]+must not fail/i.test(
      routeSource,
    ),
  true,
  "/book route must call the alert after save and must not fail customer intake when alert fails.",
);
assert.equal(
  ledger.includes("### Admin New Booking Email Alert Runtime Gate") &&
    ledger.includes("server-side admin Email alert can run after a customer `/book` request is saved") &&
    ledger.includes("Mac being open") &&
    ledger.includes("PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_ENABLED") &&
    ledger.includes("PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_TO"),
  true,
  "Ledger must lock the server-side new booking email alert behavior and env-name-only controls.",
);
assert.equal(
  preactivationSuite.includes(guardPath),
  true,
  "Preactivation suite must register the admin new booking email alert guard.",
);

const harness = await loadHelperHarness();

try {
  let providerCalls = 0;
  const closed = await harness.helper.sendAdminNewBookingEmailAlert(safeBooking(), {
    env: {},
    providerFetch: async () => {
      providerCalls += 1;
      return { ok: true, status: 200 };
    },
  });

  assert.equal(closed.status, "blocked");
  assert.equal(closed.reason, "alert_gate_closed");
  assert.equal(closed.provider_request_count, 0);
  assert.equal(providerCalls, 0, "Closed gate must not call provider.");

  const missingConfig = await harness.helper.sendAdminNewBookingEmailAlert(safeBooking(), {
    env: alertEnv({ RESEND_API_KEY: "change_me" }),
    providerFetch: async () => {
      providerCalls += 1;
      return { ok: true, status: 200 };
    },
  });

  assert.equal(missingConfig.status, "blocked");
  assert.equal(missingConfig.reason, "provider_not_configured");
  assert.equal(providerCalls, 0, "Missing config must not call provider.");

  const providerRequests = [];
  const sent = await harness.helper.sendAdminNewBookingEmailAlert(safeBooking(), {
    env: alertEnv(),
    providerFetch: async (url, init) => {
      providerRequests.push({ init, url });
      return {
        json: async () => ({ id: "email_123" }),
        ok: true,
        status: 200,
      };
    },
  });

  assert.equal(sent.ok, true);
  assert.equal(sent.status, "sent");
  assert.equal(sent.reason, "send_succeeded");
  assert.equal(sent.external_send, true);
  assert.equal(sent.provider_request_count, 1);
  assert.equal(providerRequests.length, 1);
  assert.equal(providerRequests[0].url, "https://api.resend.com/emails");
  assert.equal(providerRequests[0].init.method, "POST");
  assert.equal(providerRequests[0].init.headers["Content-Type"], "application/json");
  assert.equal(providerRequests[0].init.headers["Idempotency-Key"], "new-booking-CUST-ALERT-001");

  const body = JSON.parse(providerRequests[0].init.body);

  assert.deepEqual(body.to, ["ops@example.com"]);
  assert.equal(body.subject, "New booking request: CUST-ALERT-001");
  for (const safeText of [
    "New booking request received.",
    "Reference: CUST-ALERT-001",
    "Customer/account: Prestige Test Customer",
    "Passenger: William Test",
    "Contact: 91234567",
    "Pickup: Orchard Hotel",
    "Drop-off: Changi Airport Terminal 3",
    "Open dashboard: https://app.prestigelimo.sg/",
  ]) {
    assert.equal(body.text.includes(safeText), true, `Email body must include ${safeText}.`);
  }
  assert.equal(forbiddenPattern.test(body.text), false, "Email body must not include forbidden fields.");

  const failed = await harness.helper.sendAdminNewBookingEmailAlert(safeBooking(), {
    env: alertEnv(),
    providerFetch: async () => ({ ok: false, status: 500 }),
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "provider_failure");
  assert.equal(failed.provider_request_count, 1);

  const invalid = await harness.helper.sendAdminNewBookingEmailAlert(
    safeBooking({ booking_reference: "token-secret-debug" }),
    {
      env: alertEnv(),
      providerFetch: async () => {
        throw new Error("must not call provider for invalid booking");
      },
    },
  );

  assert.equal(invalid.status, "blocked");
  assert.equal(invalid.reason, "invalid_booking");
  assert.equal(invalid.provider_request_count, 0);
} finally {
  await harness.cleanup();
}

console.log("Admin new booking email alert guard passed.");
