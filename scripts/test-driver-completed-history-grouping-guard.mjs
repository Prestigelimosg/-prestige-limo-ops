import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-completed-history-grouping-guard.mjs";

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

const [appPage, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const helperSection = sliceBetween(
  appPage,
  "function bookingRecordIsCompletedStatus",
  "function bookingRecordIsCustomerBookingRequest",
);
const groupingSection = sliceBetween(
  appPage,
  "const bookingRecordHasCompletedDriverReport = useCallback",
  "function update(field: keyof BookingForm, value: string)",
);
const completedHistoryPanel = sliceBetween(
  appPage,
  "const completedBookingsPanel = (",
  "const jobCardCopyEditState =",
);
const activeMonitorSource = sliceBetween(
  appPage,
  "const activeJobDashboardSearchTerm = clean(searchTerm);",
  "const activeJobsMonitorPanel = (",
);
const ledgerSection = sliceBetween(
  ledger,
  "### Driver Completed History Grouping Lock",
  "\n### ",
);

for (const fragment of [
  "function getBookingDriverJobStatusReference",
  "function adminDriverJobStatusReadStateIsCompleted",
  "clean(readState?.latestStatus?.status_value).toLowerCase() === \"completed\"",
]) {
  assertIncludes(helperSection, fragment, `driver completed helper fragment ${fragment}`);
}

for (const fragment of [
  "const bookingRecordHasCompletedDriverReport = useCallback",
  "adminDriverJobStatusReadState.bookingReference === bookingReference",
  "dashboardDriverJobStatusReadStates[bookingReference] || null",
  "adminDriverJobStatusReadStateIsCompleted(selectedDriverStatusState)",
  "adminDriverJobStatusReadStateIsCompleted(dashboardDriverStatusState)",
  "const bookingRecordBelongsInCompletedHistoryWithDriverReport = useCallback",
  "bookingRecordBelongsInCompletedHistory(bookingRecord, todayKey)",
  "bookingRecordHasCompletedDriverReport(bookingRecord)",
  "!bookingRecordBelongsInCompletedHistoryWithDriverReport(bookingRecord)",
  "bookingRecordBelongsInCompletedHistoryWithDriverReport(bookingRecord)",
]) {
  assertIncludes(groupingSection, fragment, `driver completed grouping fragment ${fragment}`);
}

for (const fragment of [
  "async function syncBookingCompletedStatusFromDriverReport",
  'patchBookingStatusReference(bookingStatusReference, "completed")',
  "driverCompletedBookingStatusSyncRequestedRef.current.add(bookingStatusReference)",
]) {
  assertIncludes(appPage, fragment, `driver completed status sync fragment ${fragment}`);
}

for (const fragment of [
  "const isDriverCompletedHistoryJob =",
  "!isCompletedStatus && !isCancelledStatus && bookingRecordHasCompletedDriverReport(savedBooking)",
  "const completedHistoryDisplayStatus = isDriverCompletedHistoryJob ? \"completed\" : savedBooking.status;",
  "bookingStatusLabel(completedHistoryDisplayStatus)",
  "isDriverCompletedHistoryJob",
  "\"driver-completed\"",
  "const canDeleteCompletedHistoryBooking = bookingRecordCanBeDeletedFromCompletedHistory(savedBooking);",
  "{canDeleteCompletedHistoryBooking ? (",
  "data-completed-delete-booking={bookingId}",
]) {
  assertIncludes(completedHistoryPanel, fragment, `completed history driver fragment ${fragment}`);
}

for (const forbiddenFragment of [
  "Driver completed {monthGroup.driverCompletedCount}",
  ">Driver completed<",
]) {
  assertExcludes(completedHistoryPanel, forbiddenFragment, "completed history visible driver-completed label");
}

for (const fragment of [
  "!bookingRecordHasCompletedDriverReport(bookingRecord)",
  "return getBookingDriverJobStatusReference(bookingRecord);",
]) {
  assertIncludes(activeMonitorSource, fragment, `active monitor driver-completed exclusion ${fragment}`);
}

for (const forbiddenPattern of [
  /POST\s*\/api|method:\s*"POST"|method:\s*"PATCH"|method:\s*"DELETE"/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio/i,
  /navigator\.geolocation|watchPosition|getCurrentPosition/i,
  /driver payout|PayNow payout|payout comparisons|customer price/i,
  /internal admin notes|internal finance notes|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(groupingSection, forbiddenPattern, "driver completed grouping privacy boundary");
  assertExcludes(completedHistoryPanel, forbiddenPattern, "completed history driver privacy boundary");
  assertExcludes(activeMonitorSource, forbiddenPattern, "active monitor driver privacy boundary");
}

for (const phrase of [
  "Saved driver `Job Completed` reports now persist the saved booking status as `completed`, moving the loaded booking out of Today/Upcoming and `Today's Jobs` and into Completed / History.",
  "The booking row status is updated through the existing guarded saved-booking-status API only; no booking details, customer data, route data, prices, or driver payout fields are overwritten by the driver status read.",
  "Driver-completed fallback rows display as `Completed` in Completed / History while the status sync lands; the old visible `Pending` plus `Driver completed` double-label is not shown.",
  "Completed / History exposes Delete only for archived `completed` or `cancelled` rows, plus driver-completed fallback rows after a guarded status sync to `completed`; it does not become a general active-booking delete path.",
  "This is status-only sync on the existing route; it does not add routes/APIs, DB schema changes, provider sends, notification sends, GPS/live location, billing/payment/PDF/invoice/payout, calendar sync, env changes, deploy activation, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-driver-completed-history-grouping-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation driver completed grouping guard registration");

console.log("Driver completed history grouping guard passed");
