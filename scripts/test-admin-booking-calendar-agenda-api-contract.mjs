import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-booking-calendar-agenda-session-token";
const unsafeLeakPattern =
  /customer_price|customer_rate|quoted_price|rate_amount|driver_payout|driver_notes|paynow|pay_now|invoice|payment|pdf|billing|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|service_role/i;
const safeApiLeakPattern =
  /mock-admin-booking-calendar-agenda-session-token|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-booking-calendar-event.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-booking-calendar-agenda/route.ts",
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Calendar agenda contract admin",
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

function validAdminBrowserHeaders(extra = {}) {
  return {
    "content-type": "application/json",
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-booking-calendar-agenda-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(tempDir, "app/api/admin-booking-calendar-agenda/route.js")),
  };
}

function safeBooking(overrides = {}) {
  return {
    booking_reference: "PL-2026-0615-001",
    booking_type: "MNG",
    booker_name: "Safe Booker",
    company_name: "Safe Corporate",
    date: "2026-06-15",
    driver_contact: "+65 9000 0000",
    driver_name: "Safe Driver",
    driver_plate_number: "SLV1234",
    dropoff_address: "Marina Bay Sands",
    flight_no: "SQ 318",
    pax: 2,
    pickup_address: "Changi Airport Terminal 3",
    pickup_time: "1530hrs",
    route: "Changi Airport Terminal 3 > Marina Bay Sands",
    status: "confirmed",
    traveler_name: "Safe Traveler",
    vehicle: "Mercedes V-Class",
    ...overrides,
  };
}

function safePayload(overrides = {}) {
  return {
    bookings: [
      safeBooking(),
      safeBooking({
        booking_reference: "PL-2026-0615-002",
        pickup_time: "1800hrs",
        traveler_name: "Second Safe Traveler",
      }),
    ],
    date_label: "2026-06-15",
    ...overrides,
  };
}

function requestWithJson(payload, headers = validAdminHeaders()) {
  return new Request("http://localhost/api/admin-booking-calendar-agenda", {
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
  assert.doesNotMatch(text, unsafeLeakPattern, label);
}

function assertBlockedResponse(body, label) {
  assert.equal(body.ok, false, label);
  assert.equal(body.error, routeBlockedMessage, label);
  assertNoLeaks(body, label);
}

async function main() {
  const routeSource = await readFile("app/api/admin-booking-calendar-agenda/route.ts", "utf8");
  const harness = await loadHarness();

  try {
    setEnv(validEnv());

    assert.match(routeSource, /allowServerSessionRoleMethodsWithoutRequestToken:\s*\["POST"\]/);

    {
      const response = await harness.route.POST(requestWithJson(safePayload()));
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.version, "admin-booking-calendar-agenda-v1");
      assert.equal(body.agenda.event_count, 2);
      assert.equal(body.agenda.connection_mode, "ics_file_only");
      assert.equal(body.agenda.provider_connection, "not_connected");
      assert.equal(body.agenda.live_calendar_provider, "none");
      assert.equal(body.agenda.live_calendar_write_performed, false);
      assert.equal(body.agenda.source_of_truth, "prestige_loaded_bookings");
      assert.match(body.agenda.filename, /^prestige-ops-calendar-2026-06-15\.ics$/);
      assert.match(body.ics, /BEGIN:VCALENDAR/);
      assert.equal((body.ics.match(/BEGIN:VEVENT/g) || []).length, 2);
      assert.equal((body.ics.match(/BEGIN:VALARM/g) || []).length, 4);
      assert.match(body.ics, /TRIGGER:-PT2H/);
      assert.match(body.ics, /TRIGGER:-PT30M/);
      assert.match(body.ics, /Prestige booking reminder/);
      assert.match(body.ics, /SUMMARY:SLV1234 > Safe Traveler - MNG - Prestige/);
      assert.match(body.ics, /SUMMARY:SLV1234 > Second Safe Traveler - MNG - Prestige/);
      assertNoLeaks(body, "safe calendar agenda response must not leak unsafe fields");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(safePayload(), validAdminBrowserHeaders()),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.agenda.event_count, 2);
      assertNoLeaks(body, "browser calendar agenda response must not leak unsafe fields");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            bookings: [
              safeBooking({
                driver_payout_amount: 90,
              }),
            ],
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "unsafe agenda booking field rejection must not leak payload details");
    }

    {
      const response = await harness.route.POST(requestWithJson({ bookings: [] }));
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "empty agenda rejection must not leak payload details");
    }

    {
      const tooManyBookings = Array.from({ length: 26 }, (_, index) =>
        safeBooking({
          booking_reference: `PL-2026-0615-${String(index + 1).padStart(3, "0")}`,
        }),
      );
      const response = await harness.route.POST(
        requestWithJson(safePayload({ bookings: tooManyBookings })),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "agenda limit rejection must not leak payload details");
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
          referer: "http://localhost/my-bookings",
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
      const response = await harness.route.POST(request);
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

console.log("Admin booking calendar agenda API contract passed.");
