import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken =
  "mock-admin-saved-booking-customer-readiness-audit-session-token";
const unsafeAuditLeakPattern =
  /contact_phone|contact_email|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|service_role|customer_price|rate_amount/i;
const safeApiLeakPattern =
  /mock-admin-saved-booking-customer-readiness-audit-session-token|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-saved-booking-customer-readiness-audit.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-saved-booking-customer-readiness-audits/route.ts",
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Saved booking customer readiness audit admin",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-saved-booking-customer-audit-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    audit: require(path.join(
      tempDir,
      "lib/admin-saved-booking-customer-readiness-audit.js",
    )),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(
      tempDir,
      "app/api/admin-saved-booking-customer-readiness-audits/route.js",
    )),
  };
}

function safePayload(overrides = {}) {
  return {
    saved_bookings: [
      {
        admin_internal_status: "confirmed",
        booking_reference: "SAVED-READY-JUN",
        customer_display_name: "Acme Corporate",
        customer_id: "customer-acme",
        pickup_at: "2026-06-04T10:00:00.000Z",
      },
      {
        admin_internal_status: "confirmed",
        customer_display_name: "Missing Reference Account",
        customer_id: "customer-missing-reference",
        id: "safe-row-missing-reference",
        pickup_at: "2026-06-10T10:00:00.000Z",
      },
      {
        booking_reference: "SAVED-MISSING-ID",
        company_name: "Missing Id Account",
        pickup_datetime: "2026-06-18T10:00:00.000Z",
        status: "assigned",
      },
      {
        booking_reference: "SAVED-MISSING-ACCOUNT",
        company_id: "customer-missing-account",
        pickup_date: "2026-06-20",
        status: "saved",
      },
      {
        booking_reference: "SAVED-MISSING-MONTH-STATUS",
        companies: {
          company_name: "Missing Month Status Account",
          id: "customer-missing-month-status",
        },
      },
    ],
    ...overrides,
  };
}

function requestWithJson(payload, headers = validAdminHeaders()) {
  return new Request("http://localhost/api/admin-saved-booking-customer-readiness-audits", {
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
      audit.adminSavedBookingCustomerReadinessAuditVersion,
      "admin-saved-booking-customer-readiness-audit-v1",
    );

    setEnv(validEnv());

    {
      const response = await route.POST(requestWithJson(safePayload()));
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.version, "admin-saved-booking-customer-readiness-audit-v1");
      assert.deepEqual(body.summary, {
        blocked_count: 4,
        missing_booking_reference_count: 1,
        missing_customer_account_count: 1,
        missing_customer_id_count: 1,
        missing_pickup_month_count: 1,
        missing_saved_status_count: 1,
        ready_count: 1,
        total_saved_count: 5,
      });
      assert.deepEqual(
        body.audit_items.map((item) => ({
          booking_month: item.booking_month,
          booking_reference: item.booking_reference,
          customer_account: item.customer_account,
          customer_id: item.customer_id,
          missing_requirements: item.missing_requirements,
          readiness_status: item.readiness_status,
          saved_status: item.saved_status,
          source: item.source,
        })),
        [
          {
            booking_month: "2026-06",
            booking_reference: "safe-row-missing-reference",
            customer_account: "Missing Reference Account",
            customer_id: "customer-missing-reference",
            missing_requirements: ["booking_reference"],
            readiness_status: "blocked",
            saved_status: "confirmed",
            source: "saved_booking_customer_account",
          },
          {
            booking_month: "2026-06",
            booking_reference: "SAVED-MISSING-ACCOUNT",
            customer_account: null,
            customer_id: "customer-missing-account",
            missing_requirements: ["customer_account"],
            readiness_status: "blocked",
            saved_status: "saved",
            source: "saved_booking_customer_account",
          },
          {
            booking_month: "2026-06",
            booking_reference: "SAVED-MISSING-ID",
            customer_account: "Missing Id Account",
            customer_id: null,
            missing_requirements: ["customer_id"],
            readiness_status: "blocked",
            saved_status: "assigned",
            source: "saved_booking_customer_account",
          },
          {
            booking_month: null,
            booking_reference: "SAVED-MISSING-MONTH-STATUS",
            customer_account: "Missing Month Status Account",
            customer_id: "customer-missing-month-status",
            missing_requirements: ["pickup_month", "saved_status"],
            readiness_status: "blocked",
            saved_status: null,
            source: "saved_booking_customer_account",
          },
          {
            booking_month: "2026-06",
            booking_reference: "SAVED-READY-JUN",
            customer_account: "Acme Corporate",
            customer_id: "customer-acme",
            missing_requirements: [],
            readiness_status: "ready",
            saved_status: "confirmed",
            source: "saved_booking_customer_account",
          },
        ],
      );
      assert.match(
        body.audit_items.find((item) => item.booking_reference === "SAVED-MISSING-MONTH-STATUS")
          ?.safe_reason || "",
        /missing pickup_month, saved_status/i,
      );
      assertNoLeaks(body, "safe saved booking audit response must not leak private fields");
    }

    {
      const response = await route.POST(
        requestWithJson(
          safePayload({
            booking_month: "2026-06",
            saved_bookings: [
              ...safePayload().saved_bookings,
              {
                admin_internal_status: "confirmed",
                booking_reference: "SAVED-READY-JUL",
                company_id: "customer-july",
                company_name: "July Account",
                pickup_at: "2026-07-01T10:00:00.000Z",
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
          "safe-row-missing-reference",
          "SAVED-MISSING-ACCOUNT",
          "SAVED-MISSING-ID",
          "SAVED-MISSING-MONTH-STATUS",
          "SAVED-READY-JUN",
        ],
        "Booking-month filter should keep missing-month saved jobs visible instead of hiding them",
      );
      assertNoLeaks(body, "filtered saved booking audit response must stay safe");
    }

    for (const [label, payload] of [
      [
        "unsafe payout input",
        safePayload({
          saved_bookings: [
            {
              booking_reference: "SAVED-UNSAFE",
              customer_display_name: "Unsafe Account",
              customer_id: "customer-unsafe",
              driver_payout_amount: 90,
              pickup_at: "2026-06-04T10:00:00.000Z",
              status: "confirmed",
            },
          ],
        }),
      ],
      [
        "bad month",
        safePayload({
          booking_month: "2026-13",
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

console.log("Admin saved booking customer readiness audit API contract passed.");
