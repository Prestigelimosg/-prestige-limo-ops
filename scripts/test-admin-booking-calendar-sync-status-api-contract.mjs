import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-booking-calendar-sync-status-session-token";
const unsafeLeakPattern =
  /customer_price|customer_rate|quoted_price|rate_amount|driver_payout|driver_notes|paynow|pay_now|invoice|payment|pdf|billing|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|service_role/i;
const safeApiLeakPattern =
  /mock-admin-booking-calendar-sync-status-session-token|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-booking-calendar-event.ts",
  "lib/admin-booking-calendar-sync-status.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-booking-calendar-sync-statuses/route.ts",
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Calendar sync status contract admin",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-booking-calendar-sync-status-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(tempDir, "app/api/admin-booking-calendar-sync-statuses/route.js")),
  };
}

function safeSavedBooking(overrides = {}) {
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

function safeCalendarEvent(overrides = {}) {
  return {
    booking_reference: "PL-2026-0615-001",
    ends_at_local: "2026-06-15T17:00:00",
    filename: "prestige-booking-pl-2026-0615-001.ics",
    location: "Changi Airport Terminal 3",
    starts_at_local: "2026-06-15T15:30:00",
    timezone: "Asia/Singapore",
    title: "Prestige - MNG - Safe Traveler",
    ...overrides,
  };
}

function safePayload(overrides = {}) {
  return {
    calendar_event: safeCalendarEvent(),
    saved_booking: safeSavedBooking(),
    sync_method: "ics_file_download",
    ...overrides,
  };
}

function requestWithJson(payload, headers = validAdminHeaders()) {
  return new Request("http://localhost/api/admin-booking-calendar-sync-statuses", {
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
  const routeSource = await readFile("app/api/admin-booking-calendar-sync-statuses/route.ts", "utf8");
  const harness = await loadHarness();

  try {
    setEnv(validEnv());

    assert.match(routeSource, /allowServerSessionRoleMethodsWithoutRequestToken:\s*\["POST"\]/);

    {
      const response = await harness.route.POST(requestWithJson(safePayload()));
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.version, "admin-booking-calendar-sync-status-v1");
      assert.equal(body.sync_status.booking_reference, "PL-2026-0615-001");
      assert.equal(body.sync_status.status, "calendar_file_current");
      assert.equal(body.sync_status.calendar_file_matches_saved_booking, true);
      assert.equal(body.sync_status.connection_mode, "ics_file_only");
      assert.equal(body.sync_status.provider_connection, "not_connected");
      assert.equal(body.sync_status.live_calendar_provider, "none");
      assert.equal(body.sync_status.live_calendar_write_performed, false);
      assert.equal(body.sync_status.external_calendar_edits_detectable, false);
      assert.equal(body.sync_status.app_updates_from_calendar, false);
      assert.equal(body.sync_status.calendar_updates_from_app, false);
      assert.deepEqual(body.sync_status.mismatched_fields, []);
      assert.match(body.sync_status.safe_message, /calendar edits will not update the app/i);
      assertNoLeaks(body, "safe calendar sync status response must not leak unsafe fields");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(safePayload(), validAdminBrowserHeaders()),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.sync_status.booking_reference, "PL-2026-0615-001");
      assertNoLeaks(body, "browser calendar sync status response must not leak unsafe fields");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            calendar_event: safeCalendarEvent({
              starts_at_local: "2026-06-15T16:30:00",
            }),
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.sync_status.status, "calendar_file_outdated");
      assert.equal(body.sync_status.calendar_file_matches_saved_booking, false);
      assert.deepEqual(body.sync_status.mismatched_fields, ["starts_at_local"]);
      assert.match(body.sync_status.next_admin_action, /Regenerate the calendar file/i);
      assertNoLeaks(body, "outdated calendar sync status response must not leak unsafe fields");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            calendar_event: null,
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.sync_status.status, "calendar_file_not_created");
      assert.equal(body.sync_status.calendar_file_matches_saved_booking, false);
      assertNoLeaks(body, "missing calendar file status response must not leak unsafe fields");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            saved_booking: safeSavedBooking({
              driver_payout_amount: 90,
            }),
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "unsafe saved booking field rejection must not leak payload details");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            calendar_event: safeCalendarEvent({
              provider_event_id: "google-provider-id",
            }),
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "provider event field rejection must not leak payload details");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            sync_method: "google_calendar_api",
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "provider sync method rejection must not leak payload details");
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

console.log("Admin booking calendar sync status API contract passed.");
