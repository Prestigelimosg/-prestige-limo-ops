import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const eventHelperPath = "lib/driver-job-calendar-event.ts";
const googleHelperPath = "lib/driver-google-calendar.ts";
const persistencePath = "lib/admin-driver-job-link-persistence.ts";
const routePath = "app/api/driver-job/[token]/calendar/route.ts";
const callbackPath = "app/api/driver-google-calendar-oauth/callback/route.ts";
const pagePath = "app/driver-job/[token]/page.tsx";
const migrationPath = "supabase/migrations/20260719214500_driver_google_calendar_connection.sql";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-driver-job-calendar-download-guard.mjs";

const [eventHelper, googleHelper, persistence, route, callback, page, migration, ledger, suite] =
  await Promise.all([
    readFile(eventHelperPath, "utf8"),
    readFile(googleHelperPath, "utf8"),
    readFile(persistencePath, "utf8"),
    readFile(routePath, "utf8"),
    readFile(callbackPath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(migrationPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(suitePath, "utf8"),
  ]);

for (const fragment of [
  "buildDriverJobGoogleCalendarEvent",
  'timeZone: "Asia/Singapore"',
  'title: "Open Driver Job"',
  'prestigeSource: "prestige_limo_ops_driver_job"',
  'overrides: [{ method: "popup", minutes: 60 }]',
  "prestige-driver:${driverId}:booking:${reference}",
  "Open Driver Job:",
  "Private driver link - do not share this calendar event.",
]) {
  assert.equal(eventHelper.includes(fragment), true, `Driver event helper must include ${fragment}.`);
}

assert.doesNotMatch(
  eventHelper,
  /MIDNIGHT JOB|23:30|buildMidnightCalendarDisplayAdjustment/,
  "Driver Google event must keep the actual pickup time, not the admin midnight adjustment.",
);
assert.doesNotMatch(
  eventHelper,
  /BEGIN:VCALENDAR|text\/calendar|buildDriverJobCalendarDownload|\.ics\b/,
  "Retired driver ICS creation must not remain as a second calendar path.",
);
assert.doesNotMatch(
  eventHelper,
  /customer_price|billing|invoice|payment|paynow|payout|finance|internal_admin_note|parser_debug|mock_archive|token_hash/i,
  "Driver Google event must exclude driver-forbidden and internal fields.",
);

for (const fragment of [
  'driverGoogleCalendarScope = "https://www.googleapis.com/auth/calendar.events"',
  'access_type", "offline"',
  'code_challenge_method", "S256"',
  'include_granted_scopes", "true"',
  "aes-256-gcm",
  "timingSafeEqual",
  'from("driver_google_calendar_connections")',
  'from("driver_job_links")',
  'from("bookings")',
  '.select("driver_id")',
  "currentDriverId !== driverId",
  'calendars/primary/events/${encodeURIComponent(context.event.event.id)}?sendUpdates=none',
  'google_calendar_event_id: context.event.event.id',
  'google_calendar_revision: context.event.revision',
  'request(eventPath, "PUT")',
  '"POST",',
]) {
  assert.equal(googleHelper.includes(fragment), true, `Driver Google helper must include ${fragment}.`);
}

assert.doesNotMatch(
  googleHelper,
  /auth\/calendar(?!\.events)|userinfo\.email|openid|gmail|attendees|sendUpdates=(?:all|externalOnly)/i,
  "Driver OAuth must use calendar.events only, without identity/email scopes, attendees, or guest sends.",
);

for (const envName of [
  "PRESTIGE_DRIVER_GOOGLE_CALENDAR_SYNC_ENABLED",
  "PRESTIGE_DRIVER_GOOGLE_OAUTH_CLIENT_ID",
  "PRESTIGE_DRIVER_GOOGLE_OAUTH_CLIENT_SECRET",
  "PRESTIGE_DRIVER_GOOGLE_OAUTH_REDIRECT_URI",
  "PRESTIGE_DRIVER_GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY",
]) {
  assert.equal(googleHelper.includes(envName), true, `Driver Google helper must require ${envName}.`);
}

for (const fragment of [
  'from("bookings")',
  '.select("driver_id")',
  "booking_reference: input.booking_reference",
  "Number.isSafeInteger(verifiedDriverId)",
  "driver_id:",
]) {
  assert.equal(persistence.includes(fragment), true, `Existing link issuer must bind verified driver identity with ${fragment}.`);
}

for (const fragment of [
  "readDriverGoogleCalendarStatus",
  "saveOrAuthorizeDriverGoogleCalendar",
  "export async function GET",
  "export async function POST",
  "isProductionDriverJobLinkMode",
  'reason: "not_configured"',
  '"cache-control": "private, no-store, max-age=0"',
  "driverGoogleCalendarOauthCookieName",
  "google_consent_url: result.authorization_url",
  "httpOnly: true",
  'sameSite: "lax"',
]) {
  assert.equal(route.includes(fragment), true, `Existing calendar route must include ${fragment}.`);
}
assert.doesNotMatch(route, /text\/calendar|content-disposition|\.ics|buildDriverJobCalendarDownload/);

for (const fragment of [
  "completeDriverGoogleCalendarOauth",
  "driverGoogleCalendarOauthCookieName",
  'searchParams.get("state")',
  'searchParams.get("code")',
  "cookieStore.delete",
  'searchParams.set("calendar", result.ok ? "saved" : "error")',
  "Response.redirect",
]) {
  assert.equal(callback.includes(fragment), true, `OAuth callback must include ${fragment}.`);
}

for (const fragment of [
  'data-driver-job-calendar-action="true"',
  'data-driver-job-calendar-source="current-driver-job-schedule"',
  'data-driver-job-calendar-saved="true"',
  'fetch(`/api/driver-job/${encodeURIComponent(token)}/calendar`',
  'method: "POST"',
  "safeGoogleConsentUrl",
  'url.hostname === "accounts.google.com"',
  "window.location.assign(googleConsentUrl)",
  "Calendar saved",
  "Add / Update Calendar",
  "no file download",
  "Open Driver Job for OTW, OTS, POB and",
]) {
  assert.equal(page.includes(fragment), true, `Driver Job page must include ${fragment}.`);
}
for (const forbidden of [
  "openDriverCalendarImport",
  "document.createElement(\"a\")",
  "window.URL.createObjectURL",
  ".download =",
  "text/calendar",
  ".ics",
]) {
  assert.equal(page.includes(forbidden), false, `Driver page must not retain download behavior: ${forbidden}.`);
}

for (const fragment of [
  "add column if not exists driver_id bigint references public.drivers(id)",
  "create table if not exists public.driver_google_calendar_connections",
  "booking.booking_reference = link.booking_reference",
  "booking.driver_id is not null",
  "encrypted_refresh_token text not null",
  "enable row level security",
  "revoke all on table public.driver_google_calendar_connections from anon, authenticated",
  "to service_role",
]) {
  assert.equal(migration.includes(fragment), true, `Driver Google migration must include ${fragment}.`);
}
assert.doesNotMatch(migration, /grant .* to (?:anon|authenticated)/i);

assert.equal(
  ledger.includes("### Driver Personal Google Calendar Connection"),
  true,
  "Ledger must record the exact in-place Google Calendar repair.",
);
assert.equal(suite.includes(guardPath), true, "Preactivation suite must keep the focused calendar guard.");

const { buildDriverJobGoogleCalendarEvent } = await import("../lib/driver-job-calendar-event.ts");
const calendarJobUrl = "https://ops.example/driver-job/safe-calendar-token";
const payload = {
  acknowledged: true,
  assignedDriver: { contact: "", name: "Safe Driver", plate: "SLV1234X", vehicleModel: "V Class" },
  bookingType: "MNG",
  bookingTypeLabel: "Arrival",
  dropoffLocation: "Marina Bay Sands",
  flightNumber: "SQ 318",
  passengerName: "Safe Passenger",
  pickupDate: "2026-07-15",
  pickupDateTime: "15 Jul 2026, 00:30",
  pickupLocation: "Changi Airport Terminal 3",
  pickupTime: "0030hrs",
  reference: "ADM-20260715003000",
  route: "Changi Airport Terminal 3 > Marina Bay Sands",
  scheduleUpdatedAt: "2026-07-13T02:52:22.000Z",
  status: "assigned",
  statusHistory: [],
  statusLabel: "Assigned",
  waypoints: [],
};
const initial = buildDriverJobGoogleCalendarEvent(payload, 27, calendarJobUrl);
assert.equal(initial.ok, true);
assert.equal(initial.event.start.dateTime, "2026-07-15T00:30:00+08:00");
assert.equal(initial.event.end.dateTime, "2026-07-15T02:00:00+08:00");
assert.equal(initial.event.location, "Changi Airport Terminal 3");
assert.equal(initial.event.source.url, calendarJobUrl);
assert.equal(initial.event.reminders.overrides[0].minutes, 60);
assert.equal(initial.event.summary.includes("safe-calendar-token"), false);
assert.doesNotMatch(JSON.stringify(initial.event), /customer_price|billing|invoice|payment|paynow|payout/i);

const amended = buildDriverJobGoogleCalendarEvent({
  ...payload,
  pickupDateTime: "15 Jul 2026, 01:00",
  pickupTime: "0100hrs",
  pickupLocation: "Changi Airport Terminal 2",
}, 27, calendarJobUrl);
assert.equal(amended.ok, true);
assert.equal(amended.event.id, initial.event.id, "Amendment must keep one stable Google event ID.");
assert.notEqual(amended.revision, initial.revision, "Amendment must require a new event revision.");
assert.equal(amended.event.start.dateTime, "2026-07-15T01:00:00+08:00");
assert.equal(amended.event.location, "Changi Airport Terminal 2");

const otherDriver = buildDriverJobGoogleCalendarEvent(payload, 28, calendarJobUrl);
assert.equal(otherDriver.ok, true);
assert.notEqual(otherDriver.event.id, initial.event.id, "Different verified drivers must not share event identity.");
assert.equal(buildDriverJobGoogleCalendarEvent(payload, 0, calendarJobUrl).ok, false);
assert.equal(buildDriverJobGoogleCalendarEvent(payload, 27, "javascript:alert(1)").ok, false);

console.log("Driver Job personal Google Calendar guard passed");
