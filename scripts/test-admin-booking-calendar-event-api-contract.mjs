import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-booking-calendar-event-session-token";
const unsafeLeakPattern =
  /customer_price|customer_rate|quoted_price|rate_amount|driver_payout|driver_notes|paynow|pay_now|invoice|payment|pdf|billing|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|service_role/i;
const safeApiLeakPattern =
  /mock-admin-booking-calendar-event-session-token|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-booking-calendar-event.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-booking-calendar-events/route.ts",
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Calendar event contract admin",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-booking-calendar-event-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(tempDir, "app/api/admin-booking-calendar-events/route.js")),
  };
}

function safePayload(overrides = {}) {
  return {
    booking_reference: "PL-2026-0615-001",
    booking_type: "MNG",
    bookers: {
      booker_name: "Safe Booker",
    },
    companies: {
      company_name: "Safe Corporate",
    },
    driver_contact: "+65 9000 0000",
    driver_name: "Safe Driver",
    driver_plate_number: "SLV1234",
    dropoff_address: "Marina Bay Sands",
    flight_no: "SQ 318",
    job_card: "Booking\n15 Jun 2026\nSafe operational text",
    pax: 2,
    pickup_address: "Changi Airport Terminal 3",
    pickup_time: "1530hrs",
    route: "Changi Airport Terminal 3 > Marina Bay Sands",
    status: "confirmed",
    travelers: {
      traveler_name: "Safe Traveler",
    },
    vehicle: "Mercedes V-Class",
    ...overrides,
  };
}

function requestWithJson(payload, headers = validAdminHeaders()) {
  return new Request("http://localhost/api/admin-booking-calendar-events", {
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
  const routeSource = await readFile("app/api/admin-booking-calendar-events/route.ts", "utf8");
  const appSource = await readFile("app/page.tsx", "utf8");
  const calendarPayloadSource = appSource.slice(
    appSource.indexOf("function buildSavedBookingCalendarEventPayload"),
    appSource.indexOf("function hasSavedCustomerBillingAmountSource"),
  );
  const harness = await loadHarness();

  try {
    setEnv(validEnv());

    assert.match(routeSource, /allowServerSessionRoleMethodsWithoutRequestToken:\s*\["POST"\]/);
    assert.match(appSource, /function getBookingCalendarReference\(bookingRecord: BookingRecord\)/);
    assert.match(
      appSource,
      /async function downloadSavedBookingCalendarEvent\([\s\S]*?const bookingId = getBookingCalendarReference\(bookingRecord\);/,
    );
    assert.match(
      appSource,
      /function renderBookingCalendarDownloadAction\([\s\S]*?const bookingId = getBookingCalendarReference\(bookingRecord\);/,
    );
    assert.match(calendarPayloadSource, /booking_reference: bookingReference/);
    assert.match(calendarPayloadSource, /id: cleanReferenceText\(bookingRecord\.id\) \|\| bookingReference/);
    assert.doesNotMatch(calendarPayloadSource, /booking_reference: String\(bookingRecord\.id\)/);

    {
      const response = await harness.route.POST(requestWithJson(safePayload()));
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.version, "admin-booking-calendar-event-v1");
      assert.equal(body.calendar_event.booking_reference, "PL-2026-0615-001");
      assert.equal(body.calendar_event.starts_at_local, "2026-06-15T15:30:00");
      assert.equal(body.calendar_event.ends_at_local, "2026-06-15T17:00:00");
      assert.equal(body.calendar_event.timezone, "Asia/Singapore");
      assert.equal(body.calendar_event.filename, "prestige-booking-pl-2026-0615-001.ics");
      assert.match(body.calendar_event.title, /Prestige - MNG - Safe Traveler/);
      assert.match(body.calendar_event.description, /Booking: PL-2026-0615-001/);
      assert.match(body.calendar_event.description, /Pickup: Changi Airport Terminal 3/);
      assert.match(body.calendar_event.description, /Driver: Safe Driver \/ SLV1234 \/ \+65 9000 0000/);
      assert.match(body.ics, /BEGIN:VCALENDAR/);
      assert.match(body.ics, /BEGIN:VEVENT/);
      assert.match(body.ics, /DTSTART:20260615T153000/);
      assert.match(body.ics, /DTEND:20260615T170000/);
      assert.match(body.ics, /SUMMARY:Prestige - MNG - Safe Traveler/);
      assert.equal((body.ics.match(/BEGIN:VALARM/g) || []).length, 2);
      assert.match(body.ics, /ACTION:DISPLAY/);
      assert.match(body.ics, /TRIGGER:-PT2H/);
      assert.match(body.ics, /TRIGGER:-PT30M/);
      assert.match(body.ics, /Prestige booking reminder/);
      assert.match(body.ics, /END:VCALENDAR/);
      assertNoLeaks(body, "safe calendar event response must not leak unsafe fields");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(safePayload(), validAdminBrowserHeaders()),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.calendar_event.booking_reference, "PL-2026-0615-001");
      assertNoLeaks(body, "browser calendar event response must not leak unsafe fields");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            driver_payout_amount: 90,
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "unsafe payout field rejection must not leak payload details");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            bookers: {
              booker_name: "Safe Booker",
              email: "safe@example.test",
            },
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "nested contact fields must be rejected safely");
    }

    {
      const payload = safePayload();
      delete payload.booking_reference;
      const response = await harness.route.POST(requestWithJson(payload));
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "missing saved booking reference rejection must be safe");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            job_card: "Booking without a date",
            pickup_time: "",
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "missing pickup date/time rejection must be safe");
    }

    {
      const response = await harness.route.POST(
        requestWithJson(
          safePayload({
            calendar_provider: "google",
          }),
        ),
      );
      const { body, status } = await readRouteResponse(response);

      assert.equal(status, 400);
      assert.equal(body.ok, false);
      assertNoLeaks(body, "unknown provider field must be rejected safely");
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

console.log("Admin booking calendar event API contract passed.");
