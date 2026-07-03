import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-dashboard-urgent-requests-active-monitor-guard.mjs";

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

function assertSourceOrder(source, fragments, label) {
  let previousIndex = -1;

  for (const fragment of fragments) {
    const index = source.indexOf(fragment);

    assert.notEqual(index, -1, `${label} missing ordered fragment ${fragment}.`);
    assert.ok(index > previousIndex, `${label} expected ${fragment} after prior fragment.`);
    previousIndex = index;
  }
}

const [appPage, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const helperSection = sliceBetween(
  appPage,
  "function bookingRecordPickupDateTimeMs",
  "function sortBookingHistoryNewestFirst",
);
const derivedRequestSection = sliceBetween(
  appPage,
  "const customerBookingRequestBookings = useMemo(",
  "function update(field: keyof BookingForm, value: string)",
);
const bookingsRequestPanel = sliceBetween(
  appPage,
  "const customerBookingRequestsPanel =",
  "const recentBookingsPanel =",
);
const activeMonitorSource = sliceBetween(
  appPage,
  "const activeJobDashboardSearchTerm = clean(searchTerm);",
  "const activeJobsMonitorPanel = (",
);
const activeMonitorPanel = sliceBetween(
  appPage,
  "const activeJobsMonitorPanel = (",
  "const dayOfTripExceptionEscalationClosed =",
);
const dashboardCommandCentrePanel = sliceBetween(
  appPage,
  'data-operations-dashboard="true"',
  '<div className="grid gap-3 border-y border-stone-200 py-4 text-center sm:grid-cols-3">',
);
const dashboardUrgentPanel = sliceBetween(
  appPage,
  'aria-label="Urgent Booking Requests"',
  "<section\n            aria-label=\"Admin App Notifications\"",
);
const ledgerSection = sliceBetween(
  ledger,
  "### Dashboard Urgent Requests And One-Window Active Monitor",
  "\n### ",
);

for (const fragment of [
  "function bookingRecordPickupDateTimeMs",
  "function bookingRecordIsPickupWithinNextHours",
  "function bookingRecordIsInsideActiveJobMonitorWindow",
  "pickupTimeMs >= currentTimeMs",
  "pickupTimeMs - currentTimeMs < hours * 60 * 60 * 1000",
  "const monitorWindowStartMs = pickupTimeMs - 60 * 60 * 1000;",
  "const monitorWindowEndMs = pickupTimeMs + 24 * 60 * 60 * 1000;",
]) {
  assertIncludes(helperSection, fragment, `time-window helper fragment ${fragment}`);
}

for (const fragment of [
  "const urgentCustomerBookingRequestBookings = useMemo(",
  "bookingRecordIsPickupWithinNextHours(bookingRecord, currentTimeMs, 24)",
  "const visibleUrgentCustomerBookingRequestBookings = useMemo(",
  "urgentCustomerBookingRequestBookings.slice(0, 3)",
  "const urgentCustomerBookingRequestKeySet = useMemo(",
  "const urgentCustomerBookingRequestDisplayItems =",
  "const urgentCustomerBookingRequestCount = urgentCustomerBookingRequestBookings.length;",
]) {
  assertIncludes(derivedRequestSection, fragment, `urgent request derived fragment ${fragment}`);
}

for (const fragment of [
  "Urgent &amp; New Booking Requests",
  "Urgent means pickup is under 24 hours; new stays here until reviewed.",
  'data-new-customer-booking-requests-urgent-count={String(urgentCustomerBookingRequestCount)}',
  'data-new-customer-booking-request-urgency={isUrgentRequest ? "urgent" : "new"}',
  "Urgent <24h",
  "New",
  "onClick={() => loadSelectedBooking(requestBooking, { focusCustomerCopy: true })}",
]) {
  assertIncludes(bookingsRequestPanel, fragment, `bookings request panel fragment ${fragment}`);
}

for (const fragment of [
  "Urgent Booking Requests",
  'data-dashboard-urgent-booking-requests-panel="true"',
  'data-dashboard-urgent-booking-requests-count={String(urgentCustomerBookingRequestCount)}',
  "Pickup under 24 hours only. Review urgent requests in Bookings before loading Dispatch.",
  "disabled={urgentCustomerBookingRequestCount === 0}",
  "urgentCustomerBookingRequestDisplayItems.map",
  'data-dashboard-urgent-booking-request-row={bookingId}',
  "No urgent booking requests inside 24 hours loaded.",
]) {
  assertIncludes(dashboardUrgentPanel, fragment, `dashboard urgent panel fragment ${fragment}`);
}

assertSourceOrder(
  dashboardCommandCentrePanel,
  [
    'aria-label="Urgent Booking Requests"',
    'aria-label="Admin App Notifications"',
    'aria-label="Operations Calendar"',
    "{activeJobsMonitorPanel}",
  ],
  "dashboard live-ops order",
);
assertIncludes(
  dashboardCommandCentrePanel,
  "auto-syncs; Sync Google is backup.",
  "calendar panel auto-sync operator copy",
);

for (const forbidden of [
  "customerBookingRequestDisplayItems.slice(0, 3)",
  "customerBookingRequestCount === 0",
]) {
  assertExcludes(dashboardUrgentPanel, forbidden, `dashboard urgent-only boundary ${forbidden}`);
}

assertIncludes(
  appPage,
  "const [dashboardDriverJobAutoRefreshEnabled, setDashboardDriverJobAutoRefreshEnabled] = useState(true);",
  "dashboard auto-refresh on by default state",
);
assertIncludes(
  appPage,
  "const [adminPickupRiskMonitorEnabled, setAdminPickupRiskMonitorEnabled] = useState(false);",
  "admin pickup risk monitor defaults off",
);
assertIncludes(
  appPage,
  "setAdminPickupApproachEvidenceByReference",
  "admin pickup approach evidence cache state",
);

for (const fragment of [
  "type AdminPickupRiskLevel =",
  "type AdminPickupApproachEvidenceState =",
  "function adminPickupApproachRequestKey",
  "function adminPickupApproachTrend",
  "function computeAdminPickupRiskState",
  "function adminPickupRiskBadgeClass",
  "function adminPickupRiskCardClass",
  "approachEvidence?: AdminPickupApproachEvidenceState | null",
  "Pickup approach evidence",
  "Route ETA",
  "Moving away",
  "activeJobsMapLocationsByReference",
  "activeJobPickupApproachTargetKey",
  "activeJobPickupRiskRows",
  "activeJobPickupRiskByReference",
  "activeJobPickupRiskSummaryLabel",
  "loadAdminMapLocationSearchFirstMatch(pickupQuery)",
  "loadAdminMapRouteEstimate",
  "Route-direction checks need pickup GPS/ETA evidence.",
]) {
  assertIncludes(appPage, fragment, `pickup risk helper fragment ${fragment}`);
}

for (const fragment of [
  "bookingRecordIsInsideActiveJobMonitorWindow(bookingRecord, currentTimeMs)",
  "normaliseTimeForSort(formatPickupTimeFromRecord(firstBooking))",
  "normaliseTimeForSort(formatPickupTimeFromRecord(secondBooking))",
  "const dayOfTripActiveJobVisibleBookings = dayOfTripActiveJobBookings;",
  "const liveDispatchPreparedSlotCount = Math.max(2, activeJobDriverStatusReferenceList.length);",
  "const liveDispatchStandbySlotCount = Math.max(",
  "const liveDispatchSlotSummaryLabel =",
  "const activeJobsMapAllowedReferenceKey = adminActiveJobsMapReadState.allowedBookingReferences.join(\"|\");",
  'const todayJobsMonitorIsActive = activeTab === "dashboard" || activeTab === "dispatch";',
]) {
  assertIncludes(activeMonitorSource, fragment, `active monitor source fragment ${fragment}`);
}

for (const fragment of [
  "Today's Jobs",
  "All loaded jobs appear here 1 hour before pickup. Driver reports auto-refresh every 10s.",
  "{dayOfTripActiveJobBookings.length} in window",
  "inside the 1-hour pickup monitor window",
  "Auto-refresh 10s {dashboardDriverJobAutoRefreshEnabled ? \"On\" : \"Off\"}",
  "const activeJobPickupTime = formatPickupTimeFromRecord(activeJobBooking);",
  "(isSelectedActiveJob ? clean(booking.driverName) : \"\")",
  'data-dashboard-live-driver-map="true"',
  "Open Live Dispatch Map",
  "Refresh movement",
  "Close live map",
  'data-dashboard-live-driver-map-slot-count={liveDispatchPreparedSlotCount}',
  "liveDispatchSlotSummaryLabel",
  "Pickup risk {adminPickupRiskMonitorEnabled ? \"On\" : \"Off\"}",
  'data-admin-pickup-risk-monitor-toggle="true"',
  'data-admin-pickup-risk-monitor-state={adminPickupRiskMonitorEnabled ? "on" : "off"}',
  'data-admin-pickup-risk-card-state=',
  'data-admin-pickup-risk-state={activeJobPickupRiskState.level}',
  'data-admin-pickup-risk-detail="true"',
  'data-admin-pickup-risk-monitor-summary="true"',
  'data-admin-pickup-risk-marker-state=',
  'data-admin-pickup-approach-evidence-state=',
  'data-admin-pickup-approach-evidence-summary="true"',
  'data-admin-pickup-approach-evidence-marker-state=',
  "Wrong-direction/ETA alerts use guarded pickup geocode and route evidence when available; otherwise the row says evidence unavailable.",
  "driver locations refresh automatically while Today&apos;s Jobs is open.",
  "AdminActiveJobsBrowserMap",
]) {
  assertIncludes(activeMonitorPanel, fragment, `active monitor fragment ${fragment}`);
}

for (const forbidden of [
  "const activeJobsMonitorDefaultVisibleCount = 1;",
  "slice(0, 4)",
  "first four active jobs",
  "Show all active jobs",
  "Show other active jobs",
  "Show one job",
  "Show less",
]) {
  assertExcludes(activeMonitorPanel, forbidden, `active monitor one-window boundary ${forbidden}`);
}

for (const forbiddenPattern of [
  /fetch\(|\/api\/|createClient|service_role|process\.env/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio/i,
  /navigator\.geolocation|watchPosition|getCurrentPosition/i,
  /driver payout|PayNow payout|payout comparisons|customer price/i,
  /internal admin notes|internal finance notes|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(bookingsRequestPanel, forbiddenPattern, "bookings request panel privacy boundary");
  assertExcludes(dashboardUrgentPanel, forbiddenPattern, "dashboard urgent panel privacy boundary");
  assertExcludes(activeMonitorPanel, forbiddenPattern, "active monitor privacy boundary");
}

for (const phrase of [
  "Dashboard request panel is now `Urgent Booking Requests` and only displays open customer requests with pickup under 24 hours.",
  "The Bookings page request panel remains the full queue as `Urgent & New Booking Requests`, with row badges separating urgent under-24h requests from new non-urgent requests.",
  "Day-of-trip jobs are now shown as `Today's Jobs`; the shared sector shows all loaded active jobs inside the 1-hour-before-pickup monitor window on Dashboard and Dispatch.",
  "`Today's Jobs` driver report auto-refresh is on by default, still uses the guarded admin driver-status read path, and can be switched off by the operator.",
  "The `Today's Jobs` live map control opens the existing admin-only live-location runtime for the jobs in the monitor window and refreshes shared markers every 10 seconds while the sector is open.",
  "The same live map control keeps a two-slot readiness signal; when fewer than two active job references are in the 1-hour window, standby slots remain ready for upcoming jobs as they enter that window.",
  "The pickup risk monitor defaults off, can be toggled by admin, highlights only the affected driver/job row and marker for no-pin, stale/offline, near-pickup watch, route ETA risk, and route-distance moving-away states, and does not claim route direction/ETA certainty unless guarded pickup approach evidence is ready.",
  "This reuses existing admin live-location runtime, map read paths, and guarded admin map search/route estimate routes for evidence when available; it does not add provider sends, notification sends, customer/driver messages, env changes, DB schema changes, billing/payment/PDF/invoice/payout, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-dashboard-urgent-requests-active-monitor-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation dashboard urgent requests active monitor guard registration",
);

console.log("Dashboard urgent requests and active monitor guard passed");
