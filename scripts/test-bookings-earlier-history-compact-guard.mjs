import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-bookings-earlier-history-compact-guard.mjs";

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

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end);
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
const currentUpcomingPanel = sliceBetween(
  appPage,
  "const recentBookingsPanel = operationalBookings.length > 0 ?",
  "const completedEmptyState =",
);
const completedHistoryPanel = sliceBetween(
  appPage,
  "const completedBookingsPanel = (",
  "const jobCardCopyEditState =",
);
const dashboardSection = sliceBetween(
  appPage,
  '{activeTab === "dashboard" ? (',
  "      </div>\n    </main>",
);
const completedTabSection = sliceBetween(
  appPage,
  '{activeTab === "completed" ? (',
  '{activeTab === "drivers" ? (',
);
const ledgerSection = sectionBetween(
  ledger,
  "### Bookings Earlier Jobs Completed History Compact",
  "\n### ",
);

for (const fragment of [
  "function bookingRecordIsCompletedStatus",
  "function bookingRecordIsEarlierJob",
  "function bookingRecordBelongsInCompletedHistory",
  "function sortBookingHistoryNewestFirst",
  "return bookingRecordIsCompletedStatus(bookingRecord) || bookingRecordIsEarlierJob(bookingRecord, todayKey);",
  "dateKey !== \"1970-01-01\" && dateKey < todayKey",
  "return secondDate.localeCompare(firstDate);",
]) {
  assertIncludes(helperSection, fragment, `history helper fragment ${fragment}`);
}

for (const fragment of [
  "const todayKey = toDateKey(new Date());",
  "const activeDashboardBookings = useMemo(",
  "const earlierHistoryDashboardBookings = useMemo(",
  ".filter((bookingRecord) => !bookingRecordBelongsInCompletedHistory(bookingRecord, todayKey))",
  ".filter((bookingRecord) => bookingRecordBelongsInCompletedHistory(bookingRecord, todayKey))",
  ".sort(sortBookingHistoryNewestFirst)",
  "const todayBookings = activeDashboardBookings.filter(",
  "const upcomingBookings = activeDashboardBookings.filter(",
  "getBookingDateKey(bookingRecord) === todayKey",
  "getBookingDateKey(bookingRecord) > todayKey",
  "bookingRecord.status,",
]) {
  assertIncludes(appPage, fragment, `booking history source fragment ${fragment}`);
}

for (const fragment of [
  "Current / Upcoming Bookings",
  "Earlier pickup dates are moved to Completed / History.",
  "Search current/upcoming passenger, company, flight, route, driver",
  "No matching current/upcoming bookings found.",
  'data-current-upcoming-bookings-list="true"',
  'data-current-upcoming-bookings-empty="true"',
  "No current/upcoming bookings in this search. Earlier jobs are in Completed / History.",
  'className="mt-1.5 grid gap-2 border-t border-stone-100 px-2 pt-2"',
  'className="grid gap-2 sm:grid-cols-3"',
]) {
  assertIncludes(currentUpcomingPanel, fragment, `current/upcoming panel fragment ${fragment}`);
}

for (const fragment of [
  'data-completed-history-panel="true"',
  "Completed / Earlier Jobs",
  "Completed jobs and earlier pickup dates live here, newest first.",
  "Search completed/earlier passenger, company, flight, route, driver, status",
  "No matching completed/earlier jobs found.",
  'data-completed-history-list="true"',
  "const isCompletedStatus = bookingRecordIsCompletedStatus(savedBooking);",
  "const isEarlierHistoryJob = bookingRecordIsEarlierJob(savedBooking, todayKey);",
  "data-completed-history-bucket={",
  "isCompletedStatus ? \"completed\" : isEarlierHistoryJob ? \"earlier\" : \"history\"",
  "Earlier",
  "{isCompletedStatus ? (",
  "data-completed-undo-booking={bookingId}",
  "data-completed-delete-booking={bookingId}",
  'className="mt-1.5 grid gap-2 border-t border-stone-100 px-2 pt-2"',
  'className="grid gap-2 sm:grid-cols-3"',
]) {
  assertIncludes(completedHistoryPanel, fragment, `completed/history panel fragment ${fragment}`);
}

for (const forbidden of [
  "otherBookings",
  "otherBookingDisplayItems",
  "Earlier Bookings",
  "renderDashboardBookingSummaries(otherBookingDisplayItems",
]) {
  assertExcludes(appPage, forbidden, `old dashboard earlier list ${forbidden}`);
}

for (const fragment of [
  "History",
  "{earlierHistoryDashboardBookings.length}",
  'data-dashboard-earlier-history-handoff="true"',
  "Earlier Jobs",
  "moved to Completed / History.",
  'data-dashboard-open-completed-history="true"',
  'onClick={() => selectAppTab("completed")}',
  "Open Completed / History",
]) {
  assertIncludes(dashboardSection, fragment, `dashboard history handoff fragment ${fragment}`);
}

for (const fragment of [
  "Completed / History",
  "Review completed jobs and earlier pickup dates in one compact searchable page.",
  "{completedBookingsPanel}",
]) {
  assertIncludes(completedTabSection, fragment, `completed tab fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /fetch\(|\/api\/|createClient|service_role|process\.env/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio/i,
  /navigator\.geolocation|watchPosition|getCurrentPosition/i,
  /driver payout|PayNow payout|payout comparisons|customer price/i,
  /internal admin notes|internal finance notes|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(currentUpcomingPanel, forbiddenPattern, "current/upcoming panel privacy boundary");
  assertExcludes(completedHistoryPanel, forbiddenPattern, "completed/history panel privacy boundary");
  assertExcludes(dashboardSection, forbiddenPattern, "dashboard history handoff privacy boundary");
}

for (const phrase of [
  "Past pickup-date jobs now leave Current / Upcoming and move into Completed / History alongside completed jobs.",
  "Completed / History is searchable by passenger/company/flight/route/driver/status and sorted newest first.",
  "The Dashboard no longer renders earlier booking cards; it shows a compact count plus an `Open Completed / History` handoff.",
  "Expanded Current / Upcoming and Completed / History rows use compact detail strips instead of large mini-cards.",
  "Earlier non-completed rows do not show `Undo completed` or `Delete` because they are history rows, not completed-status rows.",
  "This is UI-only grouping/layout on existing loaded booking data; it does not add routes/APIs, DB writes, env changes, provider sends, GPS/live location, billing/payment/PDF/invoice/payout, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-bookings-earlier-history-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation bookings earlier history compact guard registration");

console.log("Bookings earlier history compact guard passed");
