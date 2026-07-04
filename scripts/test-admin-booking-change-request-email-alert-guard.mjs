import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-booking-change-request-email-alert.ts";
const routePath = "app/api/customer-booking-change-requests/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-admin-booking-change-request-email-alert-guard.mjs";
const forbiddenPattern =
  /driver_payout|driver_payout_rules|customer_rates|paynow|pay_now|invoice|payment|billing|payout|pricing|parser|debug|internal admin|raw_provider|secret|token|gps|live location|photo/i;

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-booking-change-email-"));
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

function safeChangeRequest(overrides = {}) {
  return {
    booking_reference: "ADM-CHANGE-001",
    current_dropoff_location: "Changi Airport Terminal 3",
    current_pickup_at: "2026-07-04T14:00:00+08:00",
    current_pickup_location: "Orchard Hotel",
    current_service_type: "Departure",
    passenger_name: "William Test",
    request_kind: "amendment",
    request_note: "Please change pickup time.",
    requested_dropoff_location: "Changi Airport Terminal 2",
    requested_pickup_date: "2026-07-04",
    requested_pickup_location: "Raffles Hotel",
    requested_pickup_time: "15:00",
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
  "admin_booking_change_request_email_alert",
  "batch_send_enabled: false",
  "database_write_enabled: false",
  "scheduler_enabled: false",
  "gps_enabled: false",
  "billing_email_enabled: false",
  "calendar_sync_enabled: false",
]) {
  assert.equal(helperSource.includes(required), true, `Change email helper must include ${required}.`);
}

assert.equal(
  /from\s+["'](?:resend|nodemailer|postmark|@sendgrid\/mail|mailgun\.js)["']/.test(helperSource),
  false,
  "Change email helper must not import provider SDKs.",
);
assert.equal(
  routeSource.includes("sendAdminBookingChangeRequestEmailAlert"),
  true,
  "Customer change route must call the booking change email alert helper.",
);
const routeNoticeBlock = routeSource.slice(
  routeSource.indexOf("async function createAdminReviewNoticeForBookingChangeRequest"),
  routeSource.indexOf("export async function GET"),
);
assert.equal(
  routeNoticeBlock.includes("sendAdminBookingChangeRequestEmailAlert") &&
    routeNoticeBlock.includes("createCustomerBookingChangeRequestAdminAppNotification") &&
    routeNoticeBlock.indexOf("sendAdminBookingChangeRequestEmailAlert") <
      routeNoticeBlock.indexOf("createCustomerBookingChangeRequestAdminAppNotification"),
  true,
  "Customer change route must attempt admin Email before creating the admin app notification.",
);
assert.equal(
  routeSource.includes("Customer amendment intake must not fail because the admin Email alert channel is unavailable."),
  true,
  "Customer change route must not fail customer amendment intake when Email alert fails.",
);
assert.equal(
  routeSource.includes("sendAdminNewBookingEmailAlert"),
  false,
  "Customer change route must not reuse the new-booking subject/body helper for amendments.",
);
assert.equal(
  ledger.includes("### Admin Customer Amendment Email Alert Runtime Gate") &&
    ledger.includes("server-side admin Email alert now runs before the admin app notification") &&
    ledger.includes("PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_ENABLED") &&
    ledger.includes("no customer Email auto-reply"),
  true,
  "Ledger must lock the server-side booking change email alert behavior and no-customer-email boundary.",
);
assert.equal(
  preactivationSuite.includes(guardPath),
  true,
  "Preactivation suite must register the booking change email alert guard.",
);

const harness = await loadHelperHarness();

try {
  let providerCalls = 0;
  const closed = await harness.helper.sendAdminBookingChangeRequestEmailAlert(safeChangeRequest(), {
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

  const missingConfig = await harness.helper.sendAdminBookingChangeRequestEmailAlert(
    safeChangeRequest(),
    {
      env: alertEnv({ RESEND_API_KEY: "change_me" }),
      providerFetch: async () => {
        providerCalls += 1;
        return { ok: true, status: 200 };
      },
    },
  );

  assert.equal(missingConfig.status, "blocked");
  assert.equal(missingConfig.reason, "provider_not_configured");
  assert.equal(providerCalls, 0, "Missing config must not call provider.");

  const providerRequests = [];
  const sent = await harness.helper.sendAdminBookingChangeRequestEmailAlert(safeChangeRequest(), {
    env: alertEnv(),
    providerFetch: async (url, init) => {
      providerRequests.push({ init, url });
      return {
        json: async () => ({ id: "email_change_123" }),
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
  assert.equal(
    providerRequests[0].init.headers["Idempotency-Key"],
    "booking-change-request-amendment-ADM-CHANGE-001",
  );

  const body = JSON.parse(providerRequests[0].init.body);

  assert.deepEqual(body.to, ["ops@example.com"]);
  assert.equal(body.subject, "Booking amendment request: ADM-CHANGE-001");
  for (const safeText of [
    "Customer booking amendment request received.",
    "Reference: ADM-CHANGE-001",
    "Passenger: William Test",
    "Current service: Departure",
    "Current pickup: Orchard Hotel",
    "Current drop-off: Changi Airport Terminal 3",
    "Requested date: 2026-07-04",
    "Requested time: 15:00",
    "Requested pickup: Raffles Hotel",
    "Requested drop-off: Changi Airport Terminal 2",
    "Customer note: Please change pickup time.",
    "Amendment must be reviewed in Prestige before changes are confirmed.",
    "Open dashboard: https://app.prestigelimo.sg/",
  ]) {
    assert.equal(body.text.includes(safeText), true, `Email body must include ${safeText}.`);
  }
  assert.equal(forbiddenPattern.test(body.text), false, "Email body must not include forbidden fields.");

  const cancellationRequest = await harness.helper.sendAdminBookingChangeRequestEmailAlert(
    safeChangeRequest({ request_kind: "cancellation" }),
    {
      env: alertEnv(),
      providerFetch: async (url, init) => {
        providerRequests.push({ init, url });
        return {
          json: async () => ({ id: "email_cancel_123" }),
          ok: true,
          status: 200,
        };
      },
    },
  );

  assert.equal(cancellationRequest.status, "sent");
  const cancellationBody = JSON.parse(providerRequests.at(-1).init.body);
  assert.equal(cancellationBody.subject, "Booking cancellation request: ADM-CHANGE-001");
  assert.equal(
    cancellationBody.text.includes("Customer booking cancellation request received."),
    true,
    "Cancellation email body must clearly identify cancellation.",
  );

  const failed = await harness.helper.sendAdminBookingChangeRequestEmailAlert(safeChangeRequest(), {
    env: alertEnv(),
    providerFetch: async () => ({ ok: false, status: 500 }),
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "provider_failure");
  assert.equal(failed.provider_request_count, 1);

  const invalid = await harness.helper.sendAdminBookingChangeRequestEmailAlert(
    safeChangeRequest({ booking_reference: "token-secret-debug" }),
    {
      env: alertEnv(),
      providerFetch: async () => {
        throw new Error("must not call provider for invalid request");
      },
    },
  );

  assert.equal(invalid.status, "blocked");
  assert.equal(invalid.reason, "invalid_request");
  assert.equal(invalid.provider_request_count, 0);
} finally {
  await harness.cleanup();
}

console.log("Admin booking change request email alert guard passed.");
