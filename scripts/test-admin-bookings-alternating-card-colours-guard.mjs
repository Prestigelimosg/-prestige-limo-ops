import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, customerBook, customerPortal, preactivationSuite] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("app/book/page.tsx", "utf8"),
  readFile("app/my-bookings/page.tsx", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

function sliceBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);
  return source.slice(start, end);
}

const activeBookingsList = sliceBetween(
  adminPage,
  'data-current-upcoming-bookings-list="true"',
  "const completedBookingsPanel =",
);

assert.match(
  activeBookingsList,
  /filteredRecentBookingDisplayItems\.map\(\(\{ bookingRecord: savedBooking, operationalCard \}, bookingIndex\)/,
  "Active Bookings must stripe the established visible display order.",
);
assert.match(activeBookingsList, /bookingIndex % 2 === 0 \? "sky" : "violet"/);
assert.match(activeBookingsList, /data-bookings-alternate-colour=\{bookingAlternateColour\}/);
assert.match(activeBookingsList, /border-sky-200 bg-sky-50\/80/);
assert.match(activeBookingsList, /border-violet-200 bg-violet-50\/80/);
assert.match(activeBookingsList, /data-recent-operational-card=\{bookingId\}/);
assert.match(activeBookingsList, /data-recent-operational-details=\{bookingId\}/);
assert.match(activeBookingsList, /data-bookings-calendar-status-value=\{bookingGoogleCalendarStatus\}/);
assert.match(activeBookingsList, /data-bookings-mark-completed=\{bookingId\}/);
assert.match(activeBookingsList, /data-bookings-mark-cancelled=\{bookingId\}/);

assert.doesNotMatch(
  `${customerBook}\n${customerPortal}`,
  /data-bookings-alternate-colour|bg-sky-50\/80|bg-violet-50\/80/,
  "Alternating admin booking colours must not enter customer surfaces.",
);
assert.doesNotMatch(
  activeBookingsList,
  /toUpperCase\(|setBookings\(|fetch\(|localStorage|sessionStorage/,
  "Alternating colours must remain display-only within the existing Bookings card map.",
);
assert.match(
  preactivationSuite,
  /scripts\/test-admin-bookings-alternating-card-colours-guard\.mjs/,
);

console.log("Admin Bookings alternating card colours guard passed.");
