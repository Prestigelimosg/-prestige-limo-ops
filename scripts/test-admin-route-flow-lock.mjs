import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const adminBookingCalendarEventsRoutePath = "app/api/admin-booking-calendar-events/route.ts";
const adminBookingCalendarSyncStatusesRoutePath =
  "app/api/admin-booking-calendar-sync-statuses/route.ts";
const adminDriverAssignmentDisplayRoutePath =
  "app/api/admin-driver-assignment-display/route.ts";
const adminDriverJobLinksRoutePath = "app/api/admin-driver-job-links/route.ts";
const adminLegacyDataRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const adminBookingPersistencePath = "lib/admin-booking-persistence.ts";
const adminBookingSupabaseAdapterPath = "lib/admin-booking-supabase-adapter.ts";
const adminDriverJobLinkPersistencePath = "lib/admin-driver-job-link-persistence.ts";
const driverJobLinkModePath = "lib/driver-job-link-mode.ts";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(
    source.includes(fragment),
    true,
    `${label} must include ${fragment}.`,
  );
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function extractBlock(source, marker) {
  const start = source.indexOf(marker);

  assert.notEqual(start, -1, `Missing source marker: ${marker}`);

  const openBrace = source.indexOf("{", start);

  assert.notEqual(openBrace, -1, `Missing block start for: ${marker}`);

  let depth = 0;

  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Missing block end for: ${marker}`);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);

  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);

  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const [
  appPage,
  ledger,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  calendarEventsRoute,
  calendarSyncStatusesRoute,
  driverAssignmentDisplayRoute,
  driverJobLinksRoute,
  legacyRoute,
  adminBookingPersistence,
  adminBookingSupabaseAdapter,
  driverJobLinkPersistence,
  driverJobLinkMode,
] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(adminBookingCalendarEventsRoutePath, "utf8"),
  readFile(adminBookingCalendarSyncStatusesRoutePath, "utf8"),
  readFile(adminDriverAssignmentDisplayRoutePath, "utf8"),
  readFile(adminDriverJobLinksRoutePath, "utf8"),
  readFile(adminLegacyDataRoutePath, "utf8"),
  readFile(adminBookingPersistencePath, "utf8"),
  readFile(adminBookingSupabaseAdapterPath, "utf8"),
  readFile(adminDriverJobLinkPersistencePath, "utf8"),
  readFile(driverJobLinkModePath, "utf8"),
]);

const saveBookingBlock = sliceBetween(
  appPage,
  "async function saveBooking",
  "async function loadBookings",
);

assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertIncludes(
  saveBookingBlock,
  '"x-prestige-admin-purpose": "admin-booking-persistence"',
  "Save Booking + CRM purpose header",
);
assertIncludes(
  saveBookingBlock,
  "await autoSyncSavedBookingGoogleCalendar(savedBooking);",
  "Save Booking + CRM Google Calendar auto-sync",
);
assertExcludes(saveBookingBlock, "adminSavedBookingsApiPath", "Save Booking + CRM path");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM path");

const loadBookingsBlock = sliceBetween(
  appPage,
  "async function loadBookings",
  "function loadSelectedBooking",
);

assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "Load Bookings legacy read path",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings legacy read method");
assertIncludes(
  adminSavedBookingsRoute,
  "export async function GET",
  "Admin saved bookings legacy read route",
);
assertIncludes(
  adminSavedBookingsRoute,
  "export async function POST",
  "Admin saved bookings parked legacy create route",
);

const calendarBuildBlock = sliceBetween(
  appPage,
  "async function createAndDownloadCalendarEventPayload",
  "async function createAndDownloadSavedBookingCalendarEvent",
);
const calendarSyncStatusBlock = sliceBetween(
  appPage,
  "async function loadSavedBookingCalendarSyncStatus",
  "async function createAndDownloadCalendarEventPayload",
);

assertIncludes(
  calendarBuildBlock,
  "fetch(adminBookingCalendarEventsApiPath",
  "Create Calendar Event API path",
);
assertIncludes(calendarBuildBlock, "downloadIcsFile", "Create Calendar Event ICS download");
assertIncludes(calendarSyncStatusBlock, 'sync_method: "ics_file_download"', "Calendar sync method");
assertIncludes(calendarEventsRoute, "buildAdminBookingCalendarEvent", "Calendar event route");
assertIncludes(calendarEventsRoute, "ics: result.data.ics", "Calendar event route ICS response");
assertIncludes(
  calendarSyncStatusesRoute,
  "buildAdminBookingCalendarSyncStatus",
  "Calendar sync status route",
);
assertExcludes(
  `${calendarEventsRoute}\n${calendarSyncStatusesRoute}`,
  /google|microsoft|outlook|calendar_provider|external_calendar|liveCalendarSyncEnabled true/i,
  "Calendar event routes",
);

const driverAssignmentLoaderBlock = sliceBetween(
  appPage,
  "async function fetchDriverAssignmentDisplayDriverRecords",
  "async function loadDriverAssignmentDisplayDrivers",
);

assertIncludes(
  driverAssignmentLoaderBlock,
  "fetch(`${adminDriverAssignmentDisplayApiPath}?limit=200`",
  "Driver assignment display typed loader",
);
assertIncludes(driverAssignmentLoaderBlock, 'method: "GET"', "Driver assignment display typed method");
assertExcludes(
  driverAssignmentLoaderBlock,
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data/,
  "Driver assignment display typed loader",
);
assertIncludes(
  driverAssignmentDisplayRoute,
  "export async function GET",
  "Driver assignment display route",
);
assertExcludes(
  driverAssignmentDisplayRoute,
  /export async function (POST|PUT|PATCH|DELETE)/,
  "Driver assignment display route",
);
assertIncludes(
  appPage,
  "driverProfileDisplayDrivers",
  "Driver Database display/search typed display-only state",
);
assertIncludes(
  appPage,
  "function driverDisplayMatchesSearch",
  "Driver Database display/search typed display-only search",
);

const fullDriverProfileLoadBlock = sliceBetween(
  appPage,
  "async function loadDrivers",
  "async function fetchDriverAssignmentDisplayDriverRecords",
);
const saveDriverProfileBlock = sliceBetween(
  appPage,
  "async function saveDriverProfile",
  "async function deactivateDriverProfile",
);
const deleteDriverProfileBlock = sliceBetween(
  appPage,
  "async function deleteDriverProfile",
  "async function saveBooking",
);

assertIncludes(
  fullDriverProfileLoadBlock,
  ".from(adminLegacyTables.drivers)",
  "Full driver profile load parked legacy path",
);
assertIncludes(
  fullDriverProfileLoadBlock,
  "payout_preferences, driver_payout_rules",
  "Full driver profile load parked risk fields",
);
assertIncludes(
  saveDriverProfileBlock,
  ".from(adminLegacyTables.drivers)",
  "Full driver profile save parked legacy path",
);
assertIncludes(
  saveDriverProfileBlock,
  "payout_preferences",
  "Full driver profile save parked payout field",
);
assertIncludes(
  deleteDriverProfileBlock,
  ".from(adminLegacyTables.drivers).delete()",
  "Full driver profile delete parked legacy path",
);

assertIncludes(legacyRoute, "companies: new Set", "Legacy shim companies family");
assertIncludes(legacyRoute, "drivers: new Set", "Legacy shim drivers family");
assertIncludes(legacyRoute, "rate_settings: new Set", "Legacy shim rate_settings family");
assertIncludes(legacyRoute, "travelers: new Set", "Legacy shim travelers family");
assertExcludes(legacyRoute, "bookings: new Set", "Retired legacy bookings shim family");
assertExcludes(appPage, /adminLegacyTables\.bookings/, "Retired app legacy bookings shim family");

const createDriverJobLinkBlock = extractBlock(appPage, "async function createDriverJobLink");

assertIncludes(
  createDriverJobLinkBlock,
  "fetch(adminDriverJobLinksApiPath",
  "Driver job link create API path",
);
assertIncludes(createDriverJobLinkBlock, 'method: "POST"', "Driver job link create method");
assertIncludes(
  driverJobLinksRoute,
  "driverJobUrlFromToken",
  "Driver job link URL builder",
);
assertIncludes(
  driverJobLinksRoute,
  "/driver-job/${encodeURIComponent(token)}",
  "Driver job link token URL",
);
assertIncludes(
  driverJobLinksRoute,
  "token_display_once: true",
  "Driver job link one-time token response",
);
assertIncludes(
  driverJobLinkPersistence,
  "Admin driver job link create payload is malformed.",
  "Driver job link current 400 create reason",
);
assertIncludes(
  driverJobLinkPersistence,
  "Malformed driver job link booking reference rejected.",
  "Driver job link current 400 read reason",
);

assertIncludes(
  appPage,
  '"/api/admin-customer-driver-details-email-send-disabled-setup"',
  "Customer Copy Email disabled send route",
);
assertIncludes(
  appPage,
  '"/api/admin-whatsapp-customer-driver-details-send-disabled-setup"',
  "Customer Copy WhatsApp disabled send route",
);
assertIncludes(
  appPage,
  '"/api/admin-sms-customer-driver-details-send-disabled-setup"',
  "Customer Copy SMS disabled send route",
);
assertIncludes(
  appPage,
  "Setup-only / send disabled, sendingEnabled false, external_send false",
  "Customer Copy disabled send status",
);

assertIncludes(adminBookingsRoute, "export async function GET", "Admin bookings route read");
assertIncludes(adminBookingsRoute, "export async function POST", "Admin bookings route create");
assertIncludes(adminBookingsRoute, "export async function PATCH", "Admin bookings route update");
assertIncludes(
  adminBookingPersistence,
  '"customer_price"',
  "Admin booking forbidden pricing fragment",
);
assertIncludes(
  adminBookingPersistence,
  '"driver_payout"',
  "Admin booking forbidden payout fragment",
);
assertIncludes(
  adminBookingSupabaseAdapter,
  'process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true"',
  "Admin booking persistence kill switch",
);
assertIncludes(
  adminBookingSupabaseAdapter,
  "status: 503",
  "Admin booking persistence expected 503 gate",
);
assertIncludes(
  legacyRoute,
  'return jsonError(safeConfigMessage, 503);',
  "Legacy route expected 503 config gate",
);
assertIncludes(
  driverJobLinkMode,
  'reason: "not_configured"',
  "Driver job production expected not_configured gate",
);

for (const phrase of [
  "## Admin Route Flow Lock",
  "Save Booking + CRM uses `POST /api/admin-bookings` with `x-prestige-admin-purpose=admin-booking-persistence`.",
  "Save Booking + CRM does not POST to `/api/admin-saved-bookings`.",
  "Load Bookings legacy read remains separate at `GET /api/admin-saved-bookings`.",
  "Save Booking + CRM and Update Applied Snapshot auto-sync the saved booking one-way to Google Calendar through the guarded Google sync route; Prestige remains the source of truth.",
  "Create Calendar Event remains the manual ICS/calendar file export path.",
  "Driver assignment display uses `GET /api/admin-driver-assignment-display`.",
  "Driver Database display/search uses typed display-only state.",
  "Full driver profile save/delete remains parked on the legacy `drivers` shim path.",
  "Remaining legacy shim families are only `companies`, `travelers`, `drivers`, and `rate_settings`.",
  "Driver job link creation uses `/api/admin-driver-job-links` and creates `/driver-job/{token}`.",
  "Customer driver-details send buttons remain disabled/setup-only.",
  "Provider/live sending, payment/PDF/payout, auth, location, photo, calendar activation, and risky shim writes remain blocked.",
  "Expected 503 gated families remain documented:",
]) {
  assertIncludes(ledger, phrase, `Ledger route-flow lock phrase: ${phrase}`);
}

console.log("Admin route flow lock guard passed.");
