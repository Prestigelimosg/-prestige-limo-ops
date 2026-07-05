import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";

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

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function extractBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);

  assert.notEqual(start, -1, `Missing ${label} start marker.`);
  assert.notEqual(end, -1, `Missing ${label} end marker.`);

  return source.slice(start, end);
}

const appPage = await readFile(appPagePath, "utf8");
const confirmHelper = extractBetween(
  appPage,
  "async function adminConfirmBookingCompletedByPhone(",
  "async function undoBookingCompleted(",
  "admin confirm completed helper",
);
const statusPatchHelper = extractBetween(
  appPage,
  "function bookingRecordStatusReference(",
  "async function updateBookingStatusOnly(",
  "booking status patch helper",
);
const todayJobsActiveFilter = extractBetween(
  appPage,
  "const dayOfTripActiveJobBookings = operationalBookings",
  "function getActiveJobBookingReference(",
  "Today's Jobs active-job filter",
);
const todayJobsCard = extractBetween(
  appPage,
  "data-admin-multi-driver-active-job={",
  "data-dispatch-live-driver-map=\"true\"",
  "Today's Jobs active-job card",
);

for (const fragment of [
  "window.confirm(",
  "Confirm this job is completed?",
  "Use this only after you confirmed with the driver.",
  "This marks the booking Completed, not Cancelled.",
  '"completed"',
  "Admin confirming completion...",
  "Admin confirmed completed by phone. Booking moved to Completed / History.",
  "Admin confirm completed failed",
  "updateBookingStatusOnly(",
]) {
  assertIncludes(confirmHelper, fragment, `confirm helper fragment ${fragment}`);
}

for (const forbidden of [
  /revokeDriverJobLink/,
  /"cancelled"/,
  /invoice/i,
  /payment/i,
  /payout/i,
  /paynow/i,
  /telegram/i,
  /whatsapp/i,
  /sms/i,
  /gps/i,
  /live[_-]?location/i,
  /parser/i,
]) {
  assertExcludes(confirmHelper, forbidden, "admin confirm completed helper side effects");
}

for (const fragment of [
  'data-admin-active-job-actions="true"',
  "data-admin-active-job-confirm-completed={",
  "adminConfirmBookingCompletedByPhone(activeJobBooking",
  "Admin confirm completed",
  "Use only after the driver confirms the trip is finished.",
  "data-admin-active-job-confirm-completed-message={",
]) {
  assertIncludes(todayJobsCard, fragment, `Today's Jobs card fragment ${fragment}`);
}

for (const fragment of [
  "!bookingRecordIsCompletedStatus(bookingRecord)",
  "!bookingRecordIsCancelledStatus(bookingRecord)",
  "!bookingRecordHasCompletedDriverReport(bookingRecord)",
]) {
  assertIncludes(todayJobsActiveFilter, fragment, `Today's Jobs active filter fragment ${fragment}`);
}

assertExcludes(
  todayJobsActiveFilter,
  'normalizedStatus !== "completed"',
  "Today's Jobs active filter must use shared completed-status helper",
);

assert.equal(
  countOccurrences(appPage, "data-admin-active-job-confirm-completed={"),
  1,
  "Today Jobs admin confirm completed button must appear once.",
);
assert.equal(
  countOccurrences(appPage, "adminConfirmBookingCompletedByPhone(activeJobBooking"),
  1,
  "Today Jobs admin confirm completed handler must be wired once.",
);

for (const fragment of [
  "function bookingRecordStatusReferenceCandidates(",
  "bookingRecordStableKey(bookingRecord)",
  "bookingRecordStatusReferenceCandidates(bookingRecord).includes(cleanedReference)",
  "sourceBookingRecord?: BookingRecord",
  "responseBookingReference",
  "bookingRecordStatusReferenceCandidates(sourceBookingRecord, [",
]) {
  assertIncludes(statusPatchHelper, fragment, `status patch helper fragment ${fragment}`);
}

for (const fragment of [
  "patchBookingStatusReference(\n        bookingStatusReference,\n        nextStatus,\n        bookingRecord,",
  "patchBookingStatusReference(\n      bookingStatusReference,\n      \"completed\",\n      matchingBooking,",
  "const driverJobLinkBookingRecord = findLoadedBookingRecordByReference(",
  "driverJobLinkBookingRecord ?? undefined",
]) {
  assertIncludes(appPage, fragment, `status update source-record fragment ${fragment}`);
}

console.log("Admin active-job confirm completed guard passed");
