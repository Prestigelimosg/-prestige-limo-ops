import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const routePath = "app/api/admin-saved-bookings/route.ts";

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

function sliceBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing slice start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing slice end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end);
}

const [appPage, routeSource] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(routePath, "utf8"),
]);

const numericIdHelper = sliceBetween(
  appPage,
  "function bookingRecordNumericSavedBookingId",
  "function compactBookingReference",
);
const deleteResolver = sliceBetween(
  appPage,
  "async function resolveCompletedHistoryDeleteBookingId",
  "async function deleteCompletedHistoryBooking",
);
const deleteAction = sliceBetween(
  appPage,
  "async function deleteCompletedHistoryBooking",
  "function renderBookingCalendarDownloadAction",
);
const completedHistoryPanel = sliceBetween(
  appPage,
  "const completedBookingsPanel = (",
  "const jobCardCopyEditState =",
);

for (const fragment of [
  "cleanReferenceText(bookingRecord.id)",
  "cleanReferenceText(operationalCard?.booking_id)",
  "/^\\d+$/.test(candidate)",
]) {
  assertIncludes(numericIdHelper, fragment, `numeric saved booking id helper fragment ${fragment}`);
}

for (const fragment of [
  "const directBookingId = bookingRecordNumericSavedBookingId(bookingRecord, operationalCard);",
  "bookingRecordPersistedReference(bookingRecord)",
  "cleanReferenceText(operationalCard?.booking_reference)",
  "searchParams.set(\"limit\", adminLoadBookingsListLimit);",
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "method: \"GET\"",
  "Array.isArray(responseBody.bookings)",
  ".filter((candidate) => cleanReferenceText(candidate.booking_reference) === bookingReference)",
  ".map((candidate) => bookingRecordNumericSavedBookingId(candidate))",
  "if (matchingIds.length === 1)",
  "if (matchingIds.length > 1)",
  "multiple saved bookings matched this reference",
]) {
  assertIncludes(deleteResolver, fragment, `completed delete id resolver fragment ${fragment}`);
}

for (const fragment of [
  "bookingRecordStableKey(bookingRecord, operationalCard)",
  "resolveCompletedHistoryDeleteBookingId(bookingRecord, operationalCard)",
  "Delete this job from Completed / History? This cannot be undone.",
  "method: \"DELETE\"",
  "booking_id: deleteBookingId",
  "currentBookingId !== deleteBookingId && currentBookingReference !== deletedBookingReference",
  "await loadBookings(\"Bookings synced.\", { silent: true });",
]) {
  assertIncludes(deleteAction, fragment, `completed delete action fragment ${fragment}`);
}

for (const fragment of [
  "data-completed-delete-booking={bookingId}",
  "onClick={() => deleteCompletedHistoryBooking(savedBooking, operationalCard)}",
]) {
  assertIncludes(completedHistoryPanel, fragment, `completed history delete panel fragment ${fragment}`);
}

assertIncludes(
  routeSource,
  'allowServerSessionRoleMethodsWithoutRequestToken: ["DELETE"]',
  "admin saved bookings DELETE internal-dashboard boundary",
);

for (const forbiddenPattern of [
  /method:\s*"POST"/i,
  /api\.telegram\.org|twilio|sendMail|new\s+Resend/i,
  /navigator\.geolocation|watchPosition|getCurrentPosition/i,
  /customer_price|driver_payout|PayNow payout|payout comparisons/i,
  /invoice|payment|pdf|reserve invoice/i,
]) {
  assertExcludes(deleteResolver, forbiddenPattern, "completed delete id resolver boundary");
  assertExcludes(deleteAction, forbiddenPattern, "completed delete action boundary");
}

console.log("Completed history delete id resolution guard passed");
