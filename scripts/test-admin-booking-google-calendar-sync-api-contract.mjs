import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledSyncError =
  "Admin Google Calendar sync is not enabled on this server.";
const configSyncError =
  "Admin Google Calendar sync configuration is not ready.";
const providerSyncError =
  "Admin Google Calendar sync provider failed safely.";
const actorSyncError =
  "Admin Google Calendar sync requires a verified admin or dispatcher server session.";
const serverSessionToken = "mock-admin-google-calendar-sync-session-token";
const googleCalendarId =
  "03fe1ea9a0683da03078f207e74b481bcb0e2b565f4e8f51e3f3283f4fc2926d@group.calendar.google.com";
const googleClientEmail =
  "prestige-calendar-sync@prestige-limo-ops-maps.iam.gserviceaccount.com";
const googleAccessToken = "ya29.mock-google-calendar-sync-access-token";
const unsafeLeakPattern =
  /customer_price|customer_rate|quoted_price|rate_amount|driver_payout|driver_notes|paynow|pay_now|invoice|payment|pdf|billing|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification_payload|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|service_role/i;
const safeApiLeakPattern =
  /mock-admin-google-calendar-sync-session-token|ya29\.mock-google-calendar-sync-access-token|BEGIN PRIVATE KEY|PRIVATE KEY-----|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-booking-calendar-policy.ts",
  "lib/admin-booking-calendar-event.ts",
  "lib/admin-booking-google-calendar-sync.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-booking-calendar-google-sync/route.ts",
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
  PRESTIGE_ADMIN_GOOGLE_CALENDAR_SYNC_ENABLED:
    process.env.PRESTIGE_ADMIN_GOOGLE_CALENDAR_SYNC_ENABLED,
  PRESTIGE_GOOGLE_CALENDAR_API_BASE_URL:
    process.env.PRESTIGE_GOOGLE_CALENDAR_API_BASE_URL,
  PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL:
    process.env.PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL,
  PRESTIGE_GOOGLE_CALENDAR_ID: process.env.PRESTIGE_GOOGLE_CALENDAR_ID,
  PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY:
    process.env.PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY,
  PRESTIGE_GOOGLE_CALENDAR_TOKEN_URI:
    process.env.PRESTIGE_GOOGLE_CALENDAR_TOKEN_URI,
  VERCEL_ENV: process.env.VERCEL_ENV,
};
const originalFetch = globalThis.fetch;
const privateKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
}).privateKey.export({
  format: "pem",
  type: "pkcs8",
});

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

function validEnv(overrides = {}) {
  return {
    NODE_ENV: "test",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Google Calendar Sync Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_GOOGLE_CALENDAR_SYNC_ENABLED: "true",
    PRESTIGE_GOOGLE_CALENDAR_API_BASE_URL:
      "https://google-calendar-sync-contract.test/calendar/v3",
    PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL: googleClientEmail,
    PRESTIGE_GOOGLE_CALENDAR_ID: googleCalendarId,
    PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY: String(privateKey),
    PRESTIGE_GOOGLE_CALENDAR_TOKEN_URI:
      "https://google-calendar-sync-contract.test/token",
    VERCEL_ENV: undefined,
    ...overrides,
  };
}

function disabledEnv() {
  return validEnv({
    PRESTIGE_ADMIN_GOOGLE_CALENDAR_SYNC_ENABLED: undefined,
  });
}

function localDevEnv() {
  return {
    NODE_ENV: "test",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined,
    PRESTIGE_ADMIN_GOOGLE_CALENDAR_SYNC_ENABLED: "true",
    PRESTIGE_GOOGLE_CALENDAR_API_BASE_URL:
      "https://google-calendar-sync-contract.test/calendar/v3",
    PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL: googleClientEmail,
    PRESTIGE_GOOGLE_CALENDAR_ID: googleCalendarId,
    PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY: String(privateKey),
    PRESTIGE_GOOGLE_CALENDAR_TOKEN_URI:
      "https://google-calendar-sync-contract.test/token",
    VERCEL_ENV: undefined,
  };
}

function validAdminHeaders(extra = {}) {
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-google-calendar-sync-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    googleSync: require(path.join(tempDir, "lib/admin-booking-google-calendar-sync.js")),
    route: require(path.join(tempDir, "app/api/admin-booking-calendar-google-sync/route.js")),
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
  return new Request("http://localhost/api/admin-booking-calendar-google-sync", {
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

function installFetchMock({ tokenStatus = 200, eventStatuses = [200, 409, 200] } = {}) {
  const calls = [];
  const statuses = [...eventStatuses];

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(String(url));
    const bodyText = options.body instanceof URLSearchParams
      ? options.body.toString()
      : String(options.body || "");
    const call = {
      body: bodyText,
      headers: Object.fromEntries(new Headers(options.headers || {}).entries()),
      method: options.method || "GET",
      searchParams: Object.fromEntries(requestUrl.searchParams.entries()),
      url: requestUrl.origin + requestUrl.pathname,
    };

    calls.push(call);

    if (requestUrl.pathname === "/token") {
      return new Response(
        JSON.stringify({
          access_token: googleAccessToken,
          token_type: "Bearer",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: tokenStatus,
        },
      );
    }

    const status = statuses.shift() ?? 200;

    return new Response(
      JSON.stringify({
        id: "google-calendar-event-id-hidden-from-response",
      }),
      {
        headers: {
          "content-type": "application/json",
        },
        status,
      },
    );
  };

  return calls;
}

function calendarCalls(calls) {
  return calls.filter((call) => call.url.includes("/calendar/v3/calendars/"));
}

function parseJsonBody(call) {
  return JSON.parse(call.body);
}

const harness = await loadHarness();

try {
  const { googleSync, route } = harness;

  assert.equal(
    googleSync.adminBookingGoogleCalendarSyncVersion,
    "admin-booking-google-calendar-sync-v1",
  );

  const helperSource = await readFile("lib/admin-booking-google-calendar-sync.ts", "utf8");
  const routeSource = await readFile("app/api/admin-booking-calendar-google-sync/route.ts", "utf8");
  const appSource = await readFile("app/page.tsx", "utf8");
  const eventIdSource = helperSource.slice(
    helperSource.indexOf("function buildGoogleCalendarEventId"),
    helperSource.indexOf("function buildGoogleCalendarEventResource"),
  );
  const calendarPayloadSource = appSource.slice(
    appSource.indexOf("function buildSavedBookingCalendarEventPayload"),
    appSource.indexOf("function hasSavedCustomerBillingAmountSource"),
  );

  assert.doesNotMatch(
    helperSource,
    /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:googleapis|@googleapis\/calendar)["']|require\(\s*["'](?:googleapis|@googleapis\/calendar)["']\s*\)/i,
  );
  assert.match(helperSource, /sendUpdates", "none"/);
  assert.match(helperSource, /minutes: 120/);
  assert.match(helperSource, /minutes: 30/);
  assert.match(
    eventIdSource,
    /\.update\(event\.booking_reference\.trim\(\)\.toUpperCase\(\)\)/,
    "Google Calendar event IDs must be stable by booking reference.",
  );
  assert.doesNotMatch(
    eventIdSource,
    /starts_at_local|event\.starts|event\.ends/,
    "Google Calendar event IDs must not change when pickup date/time changes.",
  );
  assert.match(routeSource, /allowServerSessionRoleMethodsWithoutRequestToken:\s*\["POST"\]/);
  assert.match(appSource, /adminBookingCalendarGoogleSyncApiPath/);
  assert.doesNotMatch(appSource, /data-operations-calendar-sync-google-loaded="true"/);
  assert.doesNotMatch(appSource, /data-operations-calendar-panel="true"/);
  assert.match(
    appSource,
    /function adminBookingPersistenceRecordToCalendarBookingRecord\(\s*record: AdminBookingPersistenceRecord,/,
  );
  assert.match(
    appSource,
    /async function autoSyncSavedBookingGoogleCalendar\(savedBooking: AdminBookingPersistenceRecord\)/,
  );
  assert.match(
    appSource,
    /const calendarBooking = adminBookingPersistenceRecordToCalendarBookingRecord\(savedBooking\);/,
  );
  assert.match(appSource, /await autoSyncSavedBookingGoogleCalendar\(savedBooking\);/);
  assert.match(appSource, /await autoSyncSavedBookingGoogleCalendar\(updatedBooking\);/);
  assert.doesNotMatch(appSource, /Sync Google is backup\./);
  assert.match(calendarPayloadSource, /const pickupDateTime = clean\(bookingRecord\.pickup_at\) \|\| clean\(bookingRecord\.pickup_datetime\);/);
  assert.match(calendarPayloadSource, /const pickupTime = formatPickupTimeFromRecord\(bookingRecord\);/);
  assert.match(calendarPayloadSource, /const bookingReference = getBookingCalendarReference\(bookingRecord\);/);
  assert.match(calendarPayloadSource, /booking_reference: bookingReference/);
  assert.match(calendarPayloadSource, /id: cleanReferenceText\(bookingRecord\.id\) \|\| bookingReference/);
  assert.match(calendarPayloadSource, /pickup_at: pickupDateTime/);
  assert.match(calendarPayloadSource, /pickup_datetime: pickupDateTime/);
  assert.match(calendarPayloadSource, /pickup_time: pickupTime/);
  assert.doesNotMatch(calendarPayloadSource, /booking_reference: String\(bookingRecord\.id\)/);
  assert.doesNotMatch(calendarPayloadSource, /pickup_time: formatPickupTime\(bookingRecord\.pickup_time\)/);
  assert.doesNotMatch(appSource, /PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY|PRESTIGE_GOOGLE_CALENDAR_CLIENT_EMAIL/);

  {
    setEnv(validEnv());
    const calls = installFetchMock();
    const response = await route.POST(requestWithJson(safePayload()));
    const { body, status } = await readRouteResponse(response);

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.version, "admin-booking-google-calendar-sync-v1");
    assert.equal(body.sync.version, "admin-booking-google-calendar-sync-v1");
    assert.equal(body.sync.calendar_provider, "google_calendar");
    assert.equal(body.sync.connection_mode, "live_provider_sync");
    assert.equal(body.sync.provider_connection, "connected");
    assert.equal(body.sync.live_calendar_provider, "google_calendar");
    assert.equal(body.sync.live_calendar_write_performed, true);
    assert.equal(body.sync.external_provider_write_performed, true);
    assert.equal(body.sync.notification_delivery, "calendar_native_reminders_only");
    assert.equal(body.sync.send_updates, "none");
    assert.equal(body.sync.source_of_truth, "prestige_loaded_bookings");
    assert.equal(body.sync.sync_method, "google_calendar_events_upsert");
    assert.equal(body.sync.event_count, 2);
    assert.equal(body.sync.events_synced, 2);
    assertNoLeaks(body, "successful Google Calendar sync response must not leak secrets or unsafe fields");

    assert.equal(calls[0].url, "https://google-calendar-sync-contract.test/token");
    assert.equal(calls[0].method, "POST");
    assert.match(calls[0].body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
    assert.doesNotMatch(calls[0].body, /BEGIN PRIVATE KEY|PRIVATE KEY-----/);

    const providerCalls = calendarCalls(calls);
    assert.equal(providerCalls.length, 3);
    assert.equal(providerCalls[0].method, "POST");
    assert.equal(providerCalls[1].method, "POST");
    assert.equal(providerCalls[2].method, "PUT");

    for (const call of providerCalls) {
      assert.equal(call.searchParams.sendUpdates, "none");
      assert.match(
        call.url,
        /\/calendar\/v3\/calendars\/03fe1ea9a0683da03078f207e74b481bcb0e2b565f4e8f51e3f3283f4fc2926d%40group\.calendar\.google\.com\/events/,
      );
      assert.equal(call.headers.authorization, `Bearer ${googleAccessToken}`);
      assert.equal(call.headers["content-type"], "application/json");
    }

    const firstEvent = parseJsonBody(providerCalls[0]);
    assert.match(firstEvent.id, /^prestige[0-9a-v]{40,}$/);
    assert.equal(firstEvent.summary, "SLV1234 > Safe Traveler - MNG - Prestige");
    assert.equal(firstEvent.location, "Changi Airport Terminal 3");
    assert.equal(firstEvent.start.dateTime, "2026-06-15T15:30:00");
    assert.equal(firstEvent.end.dateTime, "2026-06-15T17:00:00");
    assert.equal(firstEvent.start.timeZone, "Asia/Singapore");
    assert.equal(firstEvent.end.timeZone, "Asia/Singapore");
    assert.equal(firstEvent.reminders.useDefault, false);
    assert.deepEqual(firstEvent.reminders.overrides, [
      {
        method: "popup",
        minutes: 120,
      },
      {
        method: "popup",
        minutes: 30,
      },
    ]);
    assert.equal(firstEvent.attendees, undefined);
    assert.equal(firstEvent.extendedProperties.private.prestigeBookingReference, "PL-2026-0615-001");
    assert.equal(firstEvent.extendedProperties.private.prestigeSource, "prestige_limo_ops");
    assertNoLeaks(firstEvent, "Google Calendar event request must not include forbidden booking fields");
  }

  for (const calendarCase of [
    {
      actualPickupText: "5 July 2026, 00:01hrs",
      expectedEnd: "2026-07-05T01:00:00",
      expectedStart: "2026-07-04T23:30:00",
      midnight: true,
      pickupAt: "2026-07-05T00:01:00+08:00",
      pickupTime: "0001hrs",
      reference: "PL-MIDNIGHT-0001",
    },
    {
      actualPickupText: "5 July 2026, 03:00hrs",
      expectedEnd: "2026-07-05T01:00:00",
      expectedStart: "2026-07-04T23:30:00",
      midnight: true,
      pickupAt: "2026-07-05T03:00:00+08:00",
      pickupTime: "0300hrs",
      reference: "PL-MIDNIGHT-0300",
    },
    {
      expectedEnd: "2026-07-05T04:31:00",
      expectedStart: "2026-07-05T03:01:00",
      midnight: false,
      pickupAt: "2026-07-05T03:01:00+08:00",
      pickupTime: "0301hrs",
      reference: "PL-NORMAL-0301",
    },
    {
      expectedEnd: "2026-07-05T01:00:00",
      expectedStart: "2026-07-04T23:30:00",
      midnight: false,
      pickupAt: "2026-07-04T23:30:00+08:00",
      pickupTime: "2330hrs",
      reference: "PL-NORMAL-2330",
    },
    {
      actualPickupText: "5 July 2026, 00:00hrs",
      expectedEnd: "2026-07-05T01:00:00",
      expectedStart: "2026-07-04T23:30:00",
      midnight: true,
      pickupAt: "2026-07-05T00:00:00+08:00",
      pickupTime: "0000hrs",
      reference: "PL-MIDNIGHT-0000",
    },
  ]) {
    setEnv(validEnv());
    const sourceBooking = safeBooking({
      booking_reference: calendarCase.reference,
      date: calendarCase.pickupAt.slice(0, 10),
      pickup_at: calendarCase.pickupAt,
      pickup_datetime: calendarCase.pickupAt,
      pickup_time: calendarCase.pickupTime,
      traveler_name: `Safe ${calendarCase.reference}`,
    });
    const originalBooking = JSON.stringify(sourceBooking);
    const calls = installFetchMock({ eventStatuses: [200] });
    const response = await route.POST(
      requestWithJson({
        bookings: [sourceBooking],
        date_label: "midnight-calendar-safety",
      }),
    );
    const { body, status } = await readRouteResponse(response);

    assert.equal(status, 200, calendarCase.reference);
    assert.equal(body.ok, true, calendarCase.reference);
    assert.equal(body.sync.event_count, 1, calendarCase.reference);
    assert.equal(body.sync.events_synced, 1, calendarCase.reference);
    assert.equal(body.sync.send_updates, "none", calendarCase.reference);
    assert.equal(
      JSON.stringify(sourceBooking),
      originalBooking,
      "Google sync must not mutate the saved booking pickup fields",
    );

    const providerCalls = calendarCalls(calls);
    assert.equal(providerCalls.length, 1, calendarCase.reference);
    assert.equal(providerCalls[0].method, "POST", calendarCase.reference);
    assert.equal(providerCalls[0].searchParams.sendUpdates, "none", calendarCase.reference);

    const event = parseJsonBody(providerCalls[0]);
    assert.equal(event.start.dateTime, calendarCase.expectedStart, calendarCase.reference);
    assert.equal(event.end.dateTime, calendarCase.expectedEnd, calendarCase.reference);
    assert.equal(event.start.timeZone, "Asia/Singapore", calendarCase.reference);
    assert.equal(event.end.timeZone, "Asia/Singapore", calendarCase.reference);
    assert.equal(event.attendees, undefined, "Google sync must not add guests");
    assert.equal(
      event.extendedProperties.private.prestigeBookingReference,
      calendarCase.reference,
      calendarCase.reference,
    );

    if (calendarCase.midnight) {
      assert.match(
        event.summary,
        new RegExp(`^MIDNIGHT JOB - SLV1234 > Safe ${calendarCase.reference} - MNG - Prestige`),
      );
      assert.match(
        event.description,
        new RegExp(`MIDNIGHT JOB — actual pickup is ${calendarCase.actualPickupText}\\.`),
      );
    } else {
      assert.doesNotMatch(event.summary, /MIDNIGHT JOB/);
      assert.doesNotMatch(event.description, /MIDNIGHT JOB/);
    }

    assertNoLeaks(
      event,
      `${calendarCase.reference} Google Calendar event request must not include forbidden fields`,
    );
  }

  {
    setEnv(validEnv());
    const calls = installFetchMock({ eventStatuses: [200, 409, 200] });
    const response = await route.POST(
      requestWithJson({
        bookings: [
          safeBooking({
            booking_reference: "PL-EDIT-STABLE-001",
            pickup_time: "1530hrs",
            traveler_name: "Stable Calendar Traveler",
          }),
          safeBooking({
            booking_reference: "PL-EDIT-STABLE-001",
            pickup_time: "1800hrs",
            traveler_name: "Stable Calendar Traveler Updated",
          }),
        ],
        date_label: "stable-edit-check",
      }),
    );
    const { body, status } = await readRouteResponse(response);

    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.sync.events_synced, 2);

    const providerCalls = calendarCalls(calls);
    assert.equal(providerCalls.length, 3);
    assert.equal(providerCalls[0].method, "POST");
    assert.equal(providerCalls[1].method, "POST");
    assert.equal(providerCalls[2].method, "PUT");

    const originalEvent = parseJsonBody(providerCalls[0]);
    const duplicateInsertEvent = parseJsonBody(providerCalls[1]);
    const updatedEvent = parseJsonBody(providerCalls[2]);

    assert.equal(originalEvent.id, duplicateInsertEvent.id);
    assert.equal(originalEvent.id, updatedEvent.id);
    assert.match(providerCalls[2].url, new RegExp(`/events/${originalEvent.id}$`));
    assert.equal(originalEvent.start.dateTime, "2026-06-15T15:30:00");
    assert.equal(updatedEvent.start.dateTime, "2026-06-15T18:00:00");
    assert.equal(updatedEvent.summary, "SLV1234 > Stable Calendar Traveler Updated - MNG - Prestige");
    assert.equal(
      updatedEvent.extendedProperties.private.prestigeBookingReference,
      "PL-EDIT-STABLE-001",
    );
    assertNoLeaks(updatedEvent, "Google Calendar stable edit update must not include forbidden booking fields");
  }

  {
    setEnv(disabledEnv());
    const calls = installFetchMock();
    const response = await route.POST(requestWithJson(safePayload()));
    const { body, status } = await readRouteResponse(response);

    assert.equal(status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.error, disabledSyncError);
    assert.equal(calls.length, 0);
    assertNoLeaks(body, "disabled Google sync response must not leak secrets");
  }

  {
    setEnv(validEnv({ PRESTIGE_GOOGLE_CALENDAR_PRIVATE_KEY: undefined }));
    const calls = installFetchMock();
    const response = await route.POST(requestWithJson(safePayload()));
    const { body, status } = await readRouteResponse(response);

    assert.equal(status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.error, configSyncError);
    assert.equal(calls.length, 0);
    assertNoLeaks(body, "unconfigured Google sync response must not leak secrets");
  }

  {
    setEnv(validEnv());
    const calls = installFetchMock();
    const response = await route.POST(
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
    assert.equal(calls.length, 0);
    assertNoLeaks(body, "unsafe Google sync payload rejection must not leak details");
  }

  {
    setEnv(validEnv());
    const calls = installFetchMock({ tokenStatus: 500 });
    const response = await route.POST(requestWithJson(safePayload()));
    const { body, status } = await readRouteResponse(response);

    assert.equal(status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.error, providerSyncError);
    assert.equal(calls.length, 1);
    assertNoLeaks(body, "provider failure response must not leak provider details");
  }

  {
    setEnv(localDevEnv());
    const calls = installFetchMock();
    const response = await route.POST(requestWithJson(safePayload()));
    const { body, status } = await readRouteResponse(response);

    assert.equal(status, 403);
    assert.equal(body.ok, false);
    assert.equal(body.error, actorSyncError);
    assert.equal(calls.length, 0);
    assertNoLeaks(body, "local-dev actor rejection must not leak secrets");
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
    setEnv(validEnv());
    const calls = installFetchMock();
    const response = await route.POST(request);
    const { body, status } = await readRouteResponse(response);

    assert.equal(status, 403, label);
    assertBlockedResponse(body, label);
    assert.equal(calls.length, 0, label);
  }
} finally {
  restoreEnv();
  globalThis.fetch = originalFetch;
  await harness.cleanup();
}

console.log("Admin booking Google Calendar sync API contract passed.");
