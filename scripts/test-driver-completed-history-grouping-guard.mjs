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
  "async function refreshAdminTodayJobMessageHistory",
);
const todayJobsActiveFilter = sliceBetween(
  appPage,
  "const dayOfTripActiveJobBookings = operationalBookings",
  "const liveDispatchMapEligibleBookings = operationalBookings",
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
  "const bookingRecordBelongsInCompletedHistoryAfterAdminConfirmation = useCallback",
  "bookingRecordBelongsInCompletedHistory(bookingRecord, todayKey)",
  "bookingRecordBelongsInCompletedHistoryAfterAdminConfirmation(bookingRecord)",
]) {
  assertIncludes(groupingSection, fragment, `driver completed grouping fragment ${fragment}`);
}

assertExcludes(
  groupingSection,
  "bookingRecordBelongsInCompletedHistory(bookingRecord, todayKey) ||\n      bookingRecordHasCompletedDriverReport(bookingRecord)",
  "driver JC evidence must remain outside Completed / History until admin confirmation",
);
assertExcludes(
  appPage,
  "syncBookingCompletedStatusFromDriverReport",
  "driver JC evidence must not auto-sync the booking completed status",
);

for (const fragment of [
  "Delete this job from Completed / History? This cannot be undone.",
  "Deleting job...",
  "Job deleted.",
  "Delete job failed",
]) {
  assertIncludes(appPage, fragment, `completed history delete feedback fragment ${fragment}`);
}

for (const fragment of [
  "const completedHistoryDisplayStatus = isCancelledStatus",
  "? \"cancelled\"",
  ": isCompletedStatus",
  "bookingStatusLabel(completedHistoryDisplayStatus)",
  "md:grid-cols-[minmax(13rem,1.1fr)_minmax(10rem,0.8fr)_minmax(14rem,1.4fr)_minmax(9rem,0.7fr)_minmax(8rem,auto)]",
  "flex min-w-0 flex-wrap items-center gap-1.5 md:justify-end md:text-right",
  "const canDeleteCompletedHistoryBooking = bookingRecordCanBeDeletedFromCompletedHistory(savedBooking);",
  "{canDeleteCompletedHistoryBooking ? (",
  "data-completed-delete-booking={bookingId}",
]) {
  assertIncludes(completedHistoryPanel, fragment, `completed history driver fragment ${fragment}`);
}

for (const forbiddenFragment of [
  "Driver completed {monthGroup.driverCompletedCount}",
  ">Driver completed<",
  "isDriverCompletedHistoryJob",
  '"driver-completed"',
]) {
  assertExcludes(completedHistoryPanel, forbiddenFragment, "completed history visible driver-completed label");
}

for (const fragment of [
  "return getBookingDriverJobStatusReference(bookingRecord);",
]) {
  assertIncludes(activeMonitorSource, fragment, `active monitor driver-completed exclusion ${fragment}`);
}

assertExcludes(
  todayJobsActiveFilter,
  "!bookingRecordHasCompletedDriverReport(bookingRecord)",
  "active monitor must retain driver JC evidence until admin confirmation",
);

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

assertIncludes(
  ledger,
  "### Driver JC Evidence Retention Until Admin Confirmation",
  "ledger must record the repaired admin confirmation boundary",
);

assertIncludes(preactivationSuite, guardScript, "preactivation driver completed grouping guard registration");

console.log("Driver completed history grouping guard passed");
