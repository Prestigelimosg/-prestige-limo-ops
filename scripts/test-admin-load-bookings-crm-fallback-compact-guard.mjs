import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-load-bookings-crm-fallback-compact-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const [ledger, appPage, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Admin Load Bookings CRM Fallback And Compact List Fix");

for (const phrase of [
  "Admin `Load Bookings` now tries same-origin admin `GET /api/admin-saved-bookings?limit=25` first and falls back to same-origin admin `GET /api/admin-bookings` when the saved-bookings read fails or returns a malformed list.",
  "Both reads use the existing `x-prestige-admin-purpose` browser-admin header and remain GET-only.",
  "The fallback is an admin dashboard read fallback only; it does not add public reads, broad writes, DB writes, provider sends, env changes, deploys, parser changes, live GPS/customer-wide live map, billing/payment/PDF/invoice/payout, or shims.",
  "Save Booking + CRM remains on `POST /api/admin-bookings` and is not changed by this fallback.",
  "Recent and Completed booking lists now render compact expandable rows by default so dispatch can scan more bookings at once while keeping existing details and action buttons available.",
  "The Bookings tab now triggers the same safe Load Bookings read automatically the first time it is opened with an empty loaded list.",
  "Open customer booking requests are surfaced above Recent Bookings and use the existing customer request source markers only.",
  "The request row reuses `loadSelectedBooking`, so `Review in Dispatch` loads the selected request into the existing Dispatch form without adding a duplicate write path.",
]) {
  assertIncludes(ledgerSection, phrase, `Load Bookings fallback ledger phrase ${phrase}`);
}

for (const forbidden of [
  "driver payout",
  "PayNow payout",
  "customer price",
  "billing",
  "invoice",
  "payment",
  "internal admin notes",
  "parser/debug",
  "secrets",
  "raw provider payloads",
]) {
  assertIncludes(ledgerSection, forbidden, `Load Bookings fallback forbidden field ${forbidden}`);
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");

assertIncludes(appPage, 'const adminBookingsApiPath = "/api/admin-bookings";', "Admin bookings fallback path");
assertIncludes(loadBookingsBlock, "function fetchAdminBookingsList", "Admin bookings list fallback helper");
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "Saved bookings first read",
);
assertIncludes(loadBookingsBlock, "const adminBookingsResponse = await fetch(adminBookingsApiPath, requestInit);", "Admin bookings fallback read");
assertIncludes(loadBookingsBlock, '"x-prestige-admin-purpose": adminLegacyDataPurpose', "Admin purpose header");
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings GET-only method");
assertIncludes(loadBookingsBlock, 'source: "admin-saved-bookings"', "Saved bookings source marker");
assertIncludes(loadBookingsBlock, 'source: "admin-bookings"', "Admin bookings fallback source marker");
assertIncludes(loadBookingsBlock, "CRM list fallback used.", "Operator fallback success note");
assertIncludes(loadBookingsBlock, "sortBookingsNewestFirst(bookingsListResult.bookings)", "Fallback list feeds CRM list");
assertIncludes(
  loadBookingsBlock,
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
  "Typed operational display still hydrates before list read",
);

assertIncludes(appPage, "function bookingRecordIsCustomerBookingRequest", "Customer request classifier");
assertIncludes(
  appPage,
  'clean(bookingRecord.source_channel) === "customer-booking-request"',
  "Customer request source_channel marker",
);
assertIncludes(
  appPage,
  'clean(bookingRecord.source_surface) === "customer_booking_request"',
  "Customer request source_surface marker",
);
assertIncludes(appPage, "function bookingRecordIsOpenCustomerBookingRequest", "Open customer request classifier");
assertIncludes(appPage, "function selectAppTab(nextTab: AppTab)", "Admin tab selection helper");
assertIncludes(
  appPage,
  'data-bookings-tab-autoload={tab.id === "bookings" ? "true" : undefined}',
  "Bookings tab auto-load marker",
);
assertIncludes(
  appPage,
  'nextTab === "bookings" && bookings.length === 0 && !loading',
  "Bookings tab auto-load empty-list guard",
);
assertIncludes(appPage, 'void loadBookings("Bookings loaded.");', "Bookings tab visible auto-load");

for (const customerRequestFragment of [
  "customerBookingRequestDisplayItems",
  "data-new-customer-booking-requests-panel",
  "data-new-customer-booking-request-row",
  "data-new-customer-booking-request-load",
  "Review in Dispatch",
  "onClick={() => loadSelectedBooking(requestBooking)}",
  "{customerBookingRequestsPanel}",
]) {
  assertIncludes(appPage, customerRequestFragment, `Customer request auto-load fragment ${customerRequestFragment}`);
}

const typedOperationalFetchIndex = loadBookingsBlock.indexOf(
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
);
const savedBookingsFetchIndex = loadBookingsBlock.indexOf(
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
);
const adminBookingsFetchIndex = loadBookingsBlock.indexOf(
  "const adminBookingsResponse = await fetch(adminBookingsApiPath, requestInit);",
);
assert.equal(typedOperationalFetchIndex > -1, true, "Typed operational fetch must be present.");
assert.equal(savedBookingsFetchIndex > -1, true, "Saved bookings fetch must be present.");
assert.equal(adminBookingsFetchIndex > -1, true, "Admin bookings fallback fetch must be present.");
assert.equal(
  typedOperationalFetchIndex < savedBookingsFetchIndex && savedBookingsFetchIndex < adminBookingsFetchIndex,
  true,
  "Load Bookings must hydrate typed display, then try saved-bookings, then fall back to admin-bookings.",
);

for (const forbiddenLoadFragment of [
  'method: "POST"',
  'method: "PATCH"',
  'method: "PUT"',
  'method: "DELETE"',
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "createClient",
  ".from(",
  ".insert(",
  ".upsert(",
  ".update(",
  ".delete(",
  "bookingCardPriceLine(savedBooking)",
]) {
  assertExcludes(loadBookingsBlock, forbiddenLoadFragment, `Load Bookings forbidden fragment ${forbiddenLoadFragment}`);
}

assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const compactFragment of [
  "data-recent-operational-details",
  "data-completed-operational-details",
  "<summary className=\"grid cursor-pointer list-none gap-2",
  "data-recent-operational-actions",
  "data-completed-operational-actions",
]) {
  assertIncludes(appPage, compactFragment, `Compact bookings list fragment ${compactFragment}`);
}

assertIncludes(preactivationSuite, guardScript, "Preactivation suite registration");

console.log("Admin Load Bookings CRM fallback and compact list guard passed");
