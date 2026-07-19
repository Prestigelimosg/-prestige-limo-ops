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
  "function bookingRecordStatusValues",
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
const completedOperationalBody = sliceBetween(
  completedHistoryPanel,
  'data-completed-operational-body={bookingId}',
  'data-completed-operational-actions={bookingId}',
);
const bookingsTabSection = sliceBetween(
  appPage,
  '{activeTab === "bookings" ? (',
  '{activeTab === "completed" ? (',
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
const upcomingPaginationLedgerSection = sectionBetween(
  ledger,
  "### Admin Bookings Upcoming Pickup Order And Pagination (2026-07-19)",
  "\n### ",
);

for (const fragment of [
  "function bookingRecordStatusValues",
  "function bookingRecordIsCompletedStatus",
  "function bookingRecordIsCancelledStatus",
  "function bookingRecordIsEarlierJob",
  "function bookingRecordBelongsInCompletedHistory",
  "function bookingRecordCompletedHistoryMonthKey",
  "function completedHistoryMonthLabel",
  "function sortCompletedHistoryMonthKeysNewestFirst",
  "function defaultCompletedHistoryMonthKey",
  "monthOption.monthKey <= currentMonthKey",
  "function sortBookingHistoryNewestFirst",
  "bookingRecord.admin_internal_status",
  "bookingRecord.customer_facing_status",
  "bookingRecord.cancellation_review_status",
  "[\"cancelled\", \"canceled\"].includes(statusValue)",
  "[\"completed\", \"complete\", \"job completed\", \"job_completed\"].includes(statusValue)",
  "bookingRecordIsCancelledStatus(bookingRecord) ||",
  "dateKey !== \"1970-01-01\" && dateKey < todayKey",
  "return secondDate.localeCompare(firstDate);",
]) {
  assertIncludes(helperSection, fragment, `history helper fragment ${fragment}`);
}

for (const fragment of [
  "bookingRecord.id,",
  "bookingRecord.booking_reference,",
  "bookingRecord.admin_internal_status,",
  "bookingRecord.customer_facing_status,",
  "bookingRecord.cancellation_review_status,",
]) {
  assertIncludes(appPage, fragment, `completed/current local search fragment ${fragment}`);
}

for (const fragment of [
  "const todayKey = toDateKey(new Date());",
  "const bookingRecordBelongsInCompletedHistoryAfterAdminConfirmation = useCallback",
  "const earlierHistoryDashboardBookings = useMemo(",
  ".filter((bookingRecord) => bookingRecordBelongsInCompletedHistoryAfterAdminConfirmation(bookingRecord))",
  ".sort(sortBookingHistoryNewestFirst)",
  "bookingRecord.status,",
  "cancelledCount: number;",
  "Cancelled {monthGroup.cancelledCount}",
]) {
  assertIncludes(appPage, fragment, `booking history source fragment ${fragment}`);
}

for (const fragment of [
  "Find saved jobs",
  'data-bookings-find-toolbar="true"',
  'data-bookings-loaded-filter-summary="true"',
  "Search the loaded admin saved jobs by pickup date, ref, passenger, flight, route, or driver.",
  'data-bookings-upcoming="true"',
  "Upcoming",
  'className="mt-3 overflow-x-auto rounded-md border border-stone-200 bg-white p-2"',
  'className="flex min-w-[56rem] items-center gap-2"',
  'className="relative min-w-72 flex-1"',
  "bookingsShowUpcoming || getBookingDateKey(bookingRecord) === bookingsSelectedDate",
  "Quick search loaded jobs: ref, passenger, flight, route, driver",
]) {
  assertIncludes(appPage, fragment, `bookings find toolbar fragment ${fragment}`);
}
for (const fragment of [
  "const adminUpcomingBookingsPageSize = 20;",
  "function sortBookingPickupEarliestFirst(",
  "bookingRecordPickupDateTimeMs(firstBooking) ?? Number.POSITIVE_INFINITY",
  "bookingRecordPickupDateTimeMs(secondBooking) ?? Number.POSITIVE_INFINITY",
  "const [bookingsUpcomingPage, setBookingsUpcomingPage] = useState(1);",
  ".sort((firstItem, secondItem) =>",
  "sortBookingPickupEarliestFirst(firstItem.bookingRecord, secondItem.bookingRecord)",
  "const bookingsUpcomingPageCount = Math.max(",
  "Math.ceil(filteredRecentBookingDisplayItems.length / adminUpcomingBookingsPageSize)",
  "const visibleRecentBookingDisplayItems = filteredRecentBookingDisplayItems.slice(",
  "bookingsUpcomingPageStartIndex,",
  "bookingsUpcomingPageStartIndex + adminUpcomingBookingsPageSize,",
  "visibleRecentBookingDisplayItems.map",
  'data-bookings-upcoming-pagination="true"',
  'data-bookings-upcoming-page-summary="true"',
  'data-bookings-upcoming-previous-page="true"',
  'data-bookings-upcoming-next-page="true"',
  "Page {bookingsUpcomingCurrentPage} of {bookingsUpcomingPageCount}",
  'className="block truncate text-sm font-bold text-slate-900"',
  '"draft",',
]) {
  assertIncludes(appPage, fragment, `bookings upcoming order/pagination fragment ${fragment}`);
}
assertIncludes(
  currentUpcomingPanel,
  'const showBookingsListStatus = ![',
  "Bookings must keep one explicit status visibility decision in the established Upcoming card lane",
);
assertIncludes(
  currentUpcomingPanel,
  '"draft",',
  "Draft must remain stored but must not render as an Upcoming booking status pill",
);
for (const forbidden of [
  'data-bookings-all-dates="true"',
  ">\n          All dates\n        </button>",
  "setBookingsShowAllDates",
]) {
  assertExcludes(appPage, forbidden, `retired All dates fragment ${forbidden}`);
}
assertExcludes(
  appPage,
  'className="min-w-72 flex-1"',
  "uncontained Bookings quick-search accessible label",
);
for (const fragment of [
  "Load saved bookings and reopen them in Dispatch.",
  "{loading ? \"Loading...\" : \"Load Bookings\"}",
]) {
  assertExcludes(bookingsTabSection, fragment, `Bookings tab redundant header/button fragment ${fragment}`);
}

for (const fragment of [
  "No matching jobs found for {bookingsDateScopeLabel}.",
  'data-current-upcoming-bookings-list="true"',
  'data-current-upcoming-bookings-empty="true"',
  "No active bookings found for {bookingsDateScopeLabel}. Earlier jobs are in Completed / History.",
  'className="mt-1.5 grid gap-2 border-t border-stone-100 px-2 pt-2"',
  'className="grid gap-2 sm:grid-cols-3 xl:w-52 xl:grid-cols-1"',
]) {
  assertIncludes(currentUpcomingPanel, fragment, `current/upcoming panel fragment ${fragment}`);
}
assertExcludes(
  currentUpcomingPanel,
  "!unhandledCustomerBookingRequestKeySet.has(getCustomerBookingRequestQueueKey(bookingRecord))",
  "Bookings saved jobs list must not hide unhandled customer/new booking requests",
);

for (const fragment of [
  'data-completed-history-panel="true"',
  "Completed / Earlier Jobs",
  "Monthly archive by pickup date. Latest current/past month opens first; choose All months for a full search.",
  "Showing {visibleCompletedBookings.length} of {filteredCompletedBookings.length} matching jobs in",
  'data-completed-month-filter="true"',
  "Search passenger, company, flight, route, driver, status",
  "No completed/earlier jobs found for this month/search.",
  'data-completed-history-list="true"',
  'data-completed-history-monthly-list="true"',
  "completedHistoryMonthGroups.map",
  "data-completed-history-month-group={monthGroup.monthKey}",
  "data-completed-history-month-jobs={monthGroup.monthKey}",
  "monthGroup.displayItems.map",
  "const isCompletedStatus = bookingRecordIsCompletedStatus(savedBooking);",
  "const isEarlierHistoryJob = bookingRecordIsEarlierJob(savedBooking, todayKey);",
  "const isDspBooking =",
  "normalizeBookingType(",
  "operationalCard.dropoff_datetime || savedBooking.dropoff_datetime",
  'data-completed-dsp-schedule={isDspBooking ? bookingId : undefined}',
  "? `DSP start: ${formatBookingPickupDateTimeSgt(savedBooking)} · End: ${",
  'dspScheduledEndText || "Not set"',
  "const completedHistoryDisplayStatus = isCancelledStatus",
  "? \"cancelled\"",
  ": isCompletedStatus",
  "const canDeleteCompletedHistoryBooking = bookingRecordCanBeDeletedFromCompletedHistory(savedBooking);",
  "md:grid-cols-[minmax(13rem,1.1fr)_minmax(10rem,0.8fr)_minmax(14rem,1.4fr)_minmax(9rem,0.7fr)_minmax(8rem,auto)]",
  "flex min-w-0 flex-wrap items-center gap-1.5 md:justify-end md:text-right",
  "inline-flex items-center rounded-full",
  "data-completed-history-bucket={",
  "Earlier",
  "{isCompletedStatus ? (",
  "data-completed-undo-booking={bookingId}",
  "{canDeleteCompletedHistoryBooking ? (",
  "data-completed-delete-booking={bookingId}",
  'className="mt-1.5 grid gap-2 border-t border-stone-100 px-2 pt-2"',
  'data-completed-operational-detail-grid={bookingId}',
  'className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"',
  '<OperationalCardSection section="booking" title="Booking">',
  '<OperationalCardSection section="route" title="Route">',
  '<OperationalCardSection section="driver-contact" title="Driver contact">',
  '<OperationalCardSection section="operations" title="Operations">',
  '<OperationalCardSection section="trip-details" title="Trip details">',
  'Contact: {completedDriverContact.contact || "Not set"}',
  '{completedDriverContact.plate || "Not set"}',
  'OTS: {completedOperationalReadiness.otsProof}',
  'Replacement: {completedOperationalReadiness.exceptionReplacement}',
]) {
  assertIncludes(completedHistoryPanel, fragment, `completed/history panel fragment ${fragment}`);
}

for (const retiredDriverJcFallback of ["isDriverCompletedHistoryJob", '"driver-completed"']) {
  assertExcludes(
    completedHistoryPanel,
    retiredDriverJcFallback,
    "driver JC evidence must wait for admin completion before Completed / History",
  );
}

for (const duplicateFragment of [
  "<DispatcherStatusSummaryBlock",
  "<AssignedDriverSummaryBlock",
  "<OperationalReadinessSummaryBlock",
  "<p>Company:",
  "<p>Booker:",
  "<p>Name:",
  '<p className="break-words">Route:',
  "<p>Vehicle:",
  "<p>Pax:",
]) {
  assertExcludes(
    completedOperationalBody,
    duplicateFragment,
    `completed expanded-body duplicate ${duplicateFragment}`,
  );
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
  /driver payout|PayNow payout|payout comparisons|customer price|invoice amount/i,
  /internal admin notes|internal finance notes|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(currentUpcomingPanel, forbiddenPattern, "current/upcoming panel privacy boundary");
  assertExcludes(completedHistoryPanel, forbiddenPattern, "completed/history panel privacy boundary");
  assertExcludes(dashboardSection, forbiddenPattern, "dashboard history handoff privacy boundary");
}

for (const phrase of [
  "Past pickup-date jobs now leave Current / Upcoming and move into Completed / History alongside completed jobs.",
  "Cancelled/revoked jobs also leave Current / Upcoming and stay searchable in Completed / History with a Cancelled status pill.",
  "Completed / History defaults to the latest current/past pickup month so future-dated test rows do not hide live completed jobs; it can switch to `All months` and keeps search available by passenger/company/flight/route/driver/status.",
  "Completed / History rows are grouped under compact monthly headers such as `June 2026`, with known-date months sorted newest first and unknown dates grouped under `Date to confirm`.",
  "The Dashboard no longer renders earlier booking cards; it shows a compact count plus an `Open Completed / History` handoff.",
  "Expanded Current / Upcoming and Completed / History rows use compact detail strips instead of large mini-cards.",
  "Earlier non-completed rows do not show `Undo completed` or `Delete` because they are history rows, not completed-status rows.",
  "This is UI-only grouping/layout on existing loaded booking data; it does not add routes/APIs, DB writes, env changes, provider sends, GPS/live location, billing/payment/PDF/invoice/payout, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-bookings-earlier-history-compact-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

for (const phrase of [
  "The existing Admin Bookings `All dates` control is renamed `Upcoming` in place.",
  "Active booking cards are ordered by their scheduled pickup timestamp, earliest first, after the existing safe typed-display merge.",
  "The existing Bookings list is paginated in browser memory at 20 jobs per page.",
  "Scheduled pickup date and time are bold on the existing admin booking row.",
  "No booking read, monitor pagination, API route, database query, booking writer, status writer, card, panel, or table is added or duplicated.",
]) {
  assertIncludes(
    upcomingPaginationLedgerSection,
    phrase,
    `upcoming pagination ledger phrase: ${phrase}`,
  );
}

assertIncludes(preactivationSuite, guardScript, "preactivation bookings earlier history compact guard registration");

console.log("Bookings earlier history compact guard passed");
