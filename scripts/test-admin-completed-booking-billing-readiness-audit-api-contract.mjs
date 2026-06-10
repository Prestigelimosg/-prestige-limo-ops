import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken =
  "mock-admin-completed-booking-billing-readiness-audit-session-token";
const unsafeAuditLeakPattern =
  /contact_phone|contact_email|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|service_role|customer_price_amount|customer_rate_override/i;
const safeApiLeakPattern =
  /mock-admin-completed-booking-billing-readiness-audit-session-token|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-completed-booking-billing-readiness-audit.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-completed-booking-billing-readiness-audits/route.ts",
];
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL:
    process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  VERCEL_ENV: process.env.VERCEL_ENV,
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

function setEnv(overrides) {
  restoreEnv();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function validEnv() {
  return {
    NODE_ENV: "test",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Completed billing readiness audit admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    VERCEL_ENV: undefined,
  };
}

function validAdminHeaders(extra = {}) {
  return {
    "content-type": "application/json",
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
    ...extra,
  };
}

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

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function writeMockModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-completed-billing-readiness-audit-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    audit: require(path.join(
      tempDir,
      "lib/admin-completed-booking-billing-readiness-audit.js",
    )),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(
      tempDir,
      "app/api/admin-completed-booking-billing-readiness-audits/route.js",
    )),
  };
}

function safePayload(overrides = {}) {
  return {
    completed_bookings: [
      {
        booking_reference: "AUDIT-READY-JUN",
        company_id: "customer-acme",
        customer_display_name: "Acme Corporate",
        customer_price_amount: 125,
        pickup_at: "2026-06-04T10:00:00.000Z",
        status: "completed",
      },
      {
        admin_internal_status: "completed",
        booking_reference: "AUDIT-MISSING-CUSTOMER",
        pickup_datetime: "2026-06-18T10:00:00.000Z",
        pricing_source: "default_rate_table",
      },
      {
        booking_reference: "AUDIT-MISSING-MONTH",
        company_name: "Month Review Account",
        completed_job_status: "completed",
        customer_rate: 95,
      },
      {
        booking_reference: "AUDIT-MISSING-AMOUNT",
        companies: {
          company_name: "Price Review Account",
          id: "customer-price-review",
        },
        date: "2026-06-20",
        status: "completed",
      },
      {
        booking_reference: "AUDIT-NOT-COMPLETED",
        company_name: "Future Account",
        customer_rate: 85,
        date: "2026-06-21",
        status: "assigned",
      },
    ],
    ...overrides,
  };
}

function requestWithJson(payload, headers = validAdminHeaders()) {
  return new Request("http://localhost/api/admin-completed-booking-billing-readiness-audits", {
    body: JSON.stringify(payload),
    headers,
    method: "POST",
  });
}

async function readRouteResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoLeaks(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, safeApiLeakPattern, label);
  assert.doesNotMatch(text, unsafeAuditLeakPattern, label);
  assert.doesNotMatch(text, /125|95|85/, label);
}

function assertBlockedResponse(body, label) {
  assert.equal(body.ok, false, label);
  assert.equal(body.error, routeBlockedMessage, label);
  assertNoLeaks(body, label);
}

async function main() {
  const harness = await loadHarness();

  try {
    const { audit, route } = harness;

    assert.equal(
      audit.adminCompletedBookingBillingReadinessAuditVersion,
      "admin-completed-booking-billing-readiness-audit-v1",
    );

    setEnv(validEnv());

    {
      const response = await route.POST(requestWithJson(safePayload()));
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.version, "admin-completed-booking-billing-readiness-audit-v1");
      assert.deepEqual(body.summary, {
        blocked_count: 3,
        missing_billable_amount_source_count: 1,
        missing_billing_month_count: 1,
        missing_customer_account_count: 1,
        non_completed_skipped_count: 1,
        ready_count: 1,
        total_completed_count: 4,
      });
      assert.deepEqual(
        body.audit_items.map((item) => ({
          billing_month: item.billing_month,
          booking_reference: item.booking_reference,
          customer_account: item.customer_account,
          customer_id: item.customer_id,
          missing_requirements: item.missing_requirements,
          readiness_status: item.readiness_status,
          source: item.source,
        })),
        [
          {
            billing_month: "2026-06",
            booking_reference: "AUDIT-MISSING-AMOUNT",
            customer_account: "Price Review Account",
            customer_id: "customer-price-review",
            missing_requirements: ["billable_amount_source"],
            readiness_status: "blocked",
            source: "completed_saved_booking",
          },
          {
            billing_month: "2026-06",
            booking_reference: "AUDIT-MISSING-CUSTOMER",
            customer_account: null,
            customer_id: null,
            missing_requirements: ["customer_account"],
            readiness_status: "blocked",
            source: "completed_saved_booking",
          },
          {
            billing_month: null,
            booking_reference: "AUDIT-MISSING-MONTH",
            customer_account: "Month Review Account",
            customer_id: null,
            missing_requirements: ["billing_month"],
            readiness_status: "blocked",
            source: "completed_saved_booking",
          },
          {
            billing_month: "2026-06",
            booking_reference: "AUDIT-READY-JUN",
            customer_account: "Acme Corporate",
            customer_id: "customer-acme",
            missing_requirements: [],
            readiness_status: "ready",
            source: "completed_saved_booking",
          },
        ],
      );
      assert.match(
        body.audit_items.find((item) => item.booking_reference === "AUDIT-MISSING-MONTH")?.safe_reason || "",
        /missing billing_month/i,
      );
      assertNoLeaks(body, "safe audit response must not leak amounts, private finance, send, or secret fields");
    }

    {
      const response = await route.POST(
        requestWithJson(
          safePayload({
            billing_month: "2026-06",
            completed_bookings: [
              ...safePayload().completed_bookings,
              {
                booking_reference: "AUDIT-READY-JUL",
                company_name: "July Account",
                customer_rate: 120,
                pickup_at: "2026-07-01T10:00:00.000Z",
                status: "completed",
              },
            ],
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.deepEqual(
        body.audit_items.map((item) => item.booking_reference),
        [
          "AUDIT-MISSING-AMOUNT",
          "AUDIT-MISSING-CUSTOMER",
          "AUDIT-MISSING-MONTH",
          "AUDIT-READY-JUN",
        ],
        "Billing-month filter should keep missing-month completed jobs visible instead of hiding them",
      );
      assertNoLeaks(body, "filtered audit response must not leak amounts or private fields");
    }

    for (const [label, payload] of [
      [
        "unsafe payout input",
        safePayload({
          completed_bookings: [
            {
              booking_reference: "AUDIT-UNSAFE",
              company_name: "Unsafe Account",
              driver_payout_amount: 90,
              pickup_at: "2026-06-04T10:00:00.000Z",
              status: "completed",
            },
          ],
        }),
      ],
      [
        "bad month",
        safePayload({
          billing_month: "2026-13",
        }),
      ],
    ]) {
      const response = await route.POST(requestWithJson(payload));
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400, label);
      assert.equal(body.ok, false, label);
      assertNoLeaks(body, `${label}: rejection must stay safe`);
    }

    for (const [label, request] of [
      [
        "anonymous",
        requestWithJson(safePayload(), {
          "content-type": "application/json",
        }),
      ],
      [
        "customer referer",
        requestWithJson(safePayload(), {
          ...validAdminHeaders(),
          referer: "http://localhost/customers/ubs",
        }),
      ],
      [
        "driver referer",
        requestWithJson(safePayload(), {
          ...validAdminHeaders(),
          referer: "http://localhost/driver-job/mock-token",
        }),
      ],
    ]) {
      const response = await route.POST(request);
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 403, label);
      assertBlockedResponse(body, label);
    }
  } finally {
    restoreEnv();
    await harness.cleanup();
  }
}

await main();

console.log("Admin completed booking billing readiness audit API contract passed.");
