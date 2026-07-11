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
const customerBookingRequestsReviewHandler = sliceBetween(
  appPage,
  "function openCustomerBookingRequestsReview",
  "function openNewBookingRequestNotificationReview",
);
const clearLoadedBookingSelectionContext = sliceBetween(
  appPage,
  "function clearLoadedBookingSelectionContext",
  "function applyExtractedBooking",
);
const saveBookingSection = sliceBetween(
  appPage,
  "async function saveBooking()",
  "function bookingRecordReferenceCandidates",
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
  "{activeJobsMonitorPanel}",
);
const dashboardUrgentPanel = sliceBetween(
  appPage,
  'aria-label="Urgent and Customer Requests"',
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
  "function getLoadBookingsOperationalPassengerDisplay(",
  "clean(card.traveler_display_name) ||",
  '"Passenger not set"',
  "function getLoadBookingsOperationalRequestDisplayTitle(",
  "getLoadBookingsOperationalDisplayTitle(card)",
]) {
  assertIncludes(appPage, fragment, `booking request passenger display helper fragment ${fragment}`);
}

for (const fragment of [
  "const dashboardCustomerBookingRequestBookings = useMemo(",
  "bookingRecordIsInsideActiveJobMonitorWindow(bookingRecord, currentTimeMs)",
  "const bookingTabCustomerBookingRequestBookings = useMemo(",
  "!bookingRecordIsInsideActiveJobMonitorWindow(bookingRecord, currentTimeMs)",
  "const urgentCustomerBookingRequestBookings = useMemo(",
  "bookingTabCustomerBookingRequestBookings.filter",
  "bookingRecordIsPickupWithinNextHours(bookingRecord, currentTimeMs, 24)",
  "const urgentUnassignedSavedBookingRequests = useMemo(",
  "!bookingRecordIsCustomerBookingRequest(bookingRecord)",
  "!bookingRecordHasDispatchActiveJobsMonitorDriver(bookingRecord)",
  "bookingRecordIsInsideActiveJobMonitorWindow(bookingRecord, currentTimeMs)",
  "const dashboardUrgentBookingRequestBookings = useMemo(",
  "[...dashboardCustomerBookingRequestBookings, ...urgentUnassignedSavedBookingRequests].sort(",
  "const visibleDashboardUrgentBookingRequestBookings = useMemo(",
  "dashboardUrgentBookingRequestBookings.slice(0, 5)",
  "const urgentCustomerBookingRequestKeySet = useMemo(",
  "const dashboardUrgentBookingRequestDisplayItems =",
  "const customerBookingRequestCount = bookingTabCustomerBookingRequestBookings.length;",
  "const dashboardUrgentBookingRequestCount = dashboardUrgentBookingRequestBookings.length;",
]) {
  assertIncludes(derivedRequestSection, fragment, `urgent request derived fragment ${fragment}`);
}
assertExcludes(
  derivedRequestSection,
  "!unhandledCustomerBookingRequestKeySet.has(getCustomerBookingRequestQueueKey(bookingRecord))",
  "Bookings saved jobs list must not hide active customer/new booking requests",
);
assertIncludes(
  customerBookingRequestsReviewHandler,
  'selectAppTab("bookings")',
  "dashboard Review handoff selects Bookings",
);
assertExcludes(
  customerBookingRequestsReviewHandler,
  'selectAppTab("dashboard")',
  "dashboard Review handoff must not remain on Dashboard",
);

for (const fragment of [
  "Urgent &amp; New Booking Requests",
  "Requests outside the 1-hour dispatch window stay here until admin loads them.",
  'data-new-customer-booking-requests-urgent-count={String(urgentCustomerBookingRequestCount)}',
  'data-new-customer-booking-request-urgency={isUrgentRequest ? "urgent" : "new"}',
  "const passengerText = getLoadBookingsOperationalPassengerDisplay(operationalCard, requestBooking);",
  "{getLoadBookingsOperationalRequestDisplayTitle(operationalCard, requestBooking)}",
  "Passenger: {passengerText}",
  "Urgent >1h",
  "New",
  "onClick={() => loadSelectedBooking(requestBooking, { focusDriverJobLink: true })}",
  "Open in Driver Job Link",
]) {
  assertIncludes(bookingsRequestPanel, fragment, `bookings request panel fragment ${fragment}`);
}

for (const fragment of [
  "Urgent / Customer Requests",
  'data-dashboard-urgent-booking-requests-panel="true"',
  'data-dashboard-urgent-booking-requests-count={String(dashboardUrgentBookingRequestCount)}',
  'data-dashboard-change-cancel-requests-count={String(customerBookingChangeRequestCount)}',
  "Open urgent bookings in Driver Job Link, or review customer change/cancel requests.",
  'data-dashboard-open-urgent-driver-job-link="true"',
  "disabled={dashboardUrgentBookingRequestCount === 0}",
  "const firstBooking = dashboardUrgentBookingRequestDisplayItems[0]?.bookingRecord;",
  "loadSelectedBooking(firstBooking, { focusDriverJobLink: true })",
  'data-dashboard-review-new-booking-requests="true"',
  "disabled={customerBookingRequestDisplayItems.length === 0}",
  "onClick={() => openCustomerBookingRequestsReview()}",
  "dashboardUrgentBookingRequestDisplayItems.map",
  'data-dashboard-urgent-booking-request-kind=',
  '"customer-request"',
  '"driver-tbc"',
  'data-dashboard-urgent-booking-request-row={bookingId}',
  "const passengerText = getLoadBookingsOperationalPassengerDisplay(operationalCard, bookingRecord);",
  "{getLoadBookingsOperationalRequestDisplayTitle(operationalCard, bookingRecord)}",
  "Passenger: {passengerText}",
  "Needs driver link |",
  "loadSelectedBooking(bookingRecord, { focusDriverJobLink: true })",
  "customerBookingChangeRequestNotifications.map",
  "adminAppNotificationChangeRequestContext(notification)",
  'data-dashboard-change-cancel-request-row={safeRowKey}',
  'data-dashboard-change-cancel-request-action="accept"',
  "handleAdminBookingChangeRequestApply(notification)",
  'data-dashboard-change-cancel-request-action="reject"',
  'handleAdminBookingChangeRequestCancelDecision(notification, "reject")',
  'data-dashboard-change-cancel-request-action="dismiss"',
  'handleAdminBookingChangeRequestCancelDecision(notification, "dismiss")',
  "No urgent booking requests, Driver TBC jobs, or customer change/cancel requests.",
]) {
  assertIncludes(dashboardUrgentPanel, fragment, `dashboard urgent panel fragment ${fragment}`);
}

for (const fragment of [
  "const [dispatchLoadFocusTarget, setDispatchLoadFocusTarget] = useState<",
  '"customerCopy" | "driverJobLink" | null',
  'const [driverJobLinkHandoffReference, setDriverJobLinkHandoffReference] = useState("");',
  'const driverJobLinkHandoffFocusAppliedRef = useRef("");',
  'dispatchLoadFocusTarget === "driverJobLink"',
  '? "driver-job-link"',
  'data-create-driver-job-link-button="true"',
  'adminDriverJobLinkState.action !== null',
  "driverJobLinkHandoffFocusAppliedRef.current === driverJobLinkHandoffReference",
  'createButton?.scrollIntoView({ behavior: "smooth", block: "center" });',
  '?.focus({ preventScroll: true });',
  'driverJobLinkHandoffFocusAppliedRef.current = "";',
  "driverJobLinkHandoffFocusAppliedRef.current = driverJobLinkHandoffReference;",
  "setDriverJobLinkHandoffReference(options.focusDriverJobLink ? bookingReference : \"\");",
  'data-dispatch-workflow-step="driver-job-link"',
  'data-driver-job-link-handoff-notice="true"',
  "Booking {driverJobLinkHandoffReference} loaded here. Next: Create Link,",
  "Driver Job Link is ready for admin action.",
]) {
  assertIncludes(appPage, fragment, `dispatch driver job link focus fragment ${fragment}`);
}

for (const fragment of [
  'driverJobLinkHandoffFocusAppliedRef.current = "";',
  'setDriverJobLinkHandoffReference("");',
]) {
  assertIncludes(clearLoadedBookingSelectionContext, fragment, `clear stale driver link handoff ${fragment}`);
}

for (const fragment of [
  'driverJobLinkHandoffFocusAppliedRef.current = "";',
  "setDriverJobLinkHandoffReference(primarySavedBookingReference);",
  'setDispatchLoadFocusTarget("driverJobLink");',
]) {
  assertIncludes(saveBookingSection, fragment, `saved booking driver link handoff ${fragment}`);
}

assertSourceOrder(
  dashboardCommandCentrePanel,
  [
    'aria-label="Urgent and Customer Requests"',
    'aria-label="Admin App Notifications"',
  ],
  "dashboard command centre order",
);
assertExcludes(
  dashboardCommandCentrePanel,
  'aria-label="Operations Calendar"',
  "Dashboard must not render the duplicate Operations Calendar panel",
);
assertExcludes(
  dashboardCommandCentrePanel,
  "{activeJobsMonitorPanel}",
  "Dashboard must not render the Dispatch Today's Jobs monitor",
);
assertExcludes(dashboardCommandCentrePanel, "Sync Google", "Dashboard must not show duplicate calendar sync controls");

for (const forbidden of [
  "customerBookingRequestDisplayItems.slice(0, 3)",
  "loadSelectedBooking(firstBooking);",
  "loadSelectedBooking(bookingRecord);",
  "onClick={() => loadSelectedBooking(requestBooking, { focusCustomerCopy: true })}",
  "[...urgentCustomerBookingRequestBookings, ...urgentUnassignedSavedBookingRequests].sort(",
  "operationalCard.traveler_display_name ||\n            operationalCard.customer_display_name",
  "operationalCard.traveler_display_name ||\n                          operationalCard.customer_display_name",
]) {
  assertExcludes(dashboardUrgentPanel, forbidden, `dashboard urgent-only boundary ${forbidden}`);
}

for (const forbidden of [
  "operationalCard.traveler_display_name ||\n            operationalCard.customer_display_name",
  "operationalCard.traveler_display_name ||\n                          operationalCard.customer_display_name",
]) {
  assertExcludes(bookingsRequestPanel, forbidden, `bookings request passenger boundary ${forbidden}`);
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
  "bookingRecordHasDispatchActiveJobsMonitorDriver(bookingRecord)",
  "!bookingRecordIsCustomerBookingRequest(bookingRecord)",
]) {
  assertIncludes(appPage, fragment, `assigned active monitor eligibility helper fragment ${fragment}`);
}

for (const fragment of [
  ".filter(bookingRecordIsDispatchActiveJobsMonitorEligible)",
  "bookingRecordIsInsideActiveJobMonitorWindow(bookingRecord, currentTimeMs)",
  "normaliseTimeForSort(formatPickupTimeFromRecord(firstBooking))",
  "normaliseTimeForSort(formatPickupTimeFromRecord(secondBooking))",
  "const dayOfTripActiveJobVisibleBookings = dayOfTripActiveJobBookings;",
  "const liveDispatchPreparedSlotCount = liveDispatchMapReferenceList.length;",
  "const liveDispatchSlotSummaryLabel =",
  "const activeJobsMapAllowedReferenceKey = adminActiveJobsMapReadState.allowedBookingReferences.join(\"|\");",
  'const todayJobsMonitorIsActive = activeTab === "dashboard";',
]) {
  assertIncludes(activeMonitorSource, fragment, `active monitor source fragment ${fragment}`);
}

for (const fragment of [
  "Today's Jobs",
  "Assigned jobs appear here 1 hour before pickup. Driver reports auto-refresh every 10s.",
  "{dayOfTripActiveJobBookings.length} in window",
  "inside the 1-hour pickup monitor window",
  "No assigned jobs inside the 1-hour pickup monitor window.",
  "Auto-refresh 10s {dashboardDriverJobAutoRefreshEnabled ? \"On\" : \"Off\"}",
  "const activeJobPickupTime = formatPickupTimeFromRecord(activeJobBooking);",
  "(isSelectedActiveJob ? clean(booking.driverName) : \"\")",
  'data-dispatch-live-driver-map="true"',
  "Open Live Dispatch Map",
  "Refresh movement",
  "Close live map",
  'data-dispatch-live-driver-map-slot-count={liveDispatchPreparedSlotCount}',
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
  "Driver reports auto-refresh every 10s.",
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
  "Dashboard request panel is now `Urgent / Customer Requests` and displays open customer requests, saved Driver TBC jobs inside the 1-hour pickup monitor window, and customer change/cancel requests using the existing guarded notification handlers.",
  "Dashboard `Open Urgent` and urgent rows load the selected urgent booking into Dispatch with the existing Driver Job Link panel focused, a visible booking handoff notice, and keyboard focus on `Create Link` so admin can create and copy the driver link before a driver is assigned.",
  "Clearing a loaded Dispatch booking now clears its Driver Job Link handoff reference, and a successful new `Save + CRM` replaces it with the newly saved booking reference before focusing the existing Driver Job Link panel; stale prior-booking notices must not survive the save.",
  "Dashboard keeps a secondary `Review` action that switches to Bookings and focuses the existing `Urgent & New Booking Requests` queue; it does not remain on Dashboard, create a duplicate request lane, or replace the Driver Job Link urgent handoff.",
  "Dashboard `Review` is enabled only when that Bookings request queue contains a real reviewable row; a stale notification without an exact saved request remains disabled as `Missing request` and cannot enable a dead review handoff.",
  "The Dashboard request panel remains the queue for open customer requests outside the 1-hour dispatch window as `Urgent & New Booking Requests`, with row badges separating under-24h-but-not-dispatch-window requests from new non-urgent requests; Bookings remains for saved booking search/load/list work.",
  "Unhandled customer requests are hidden from Current / Upcoming until admin loads them from the Dashboard urgent lane or the Bookings request lane, preventing duplicate cards while preserving the existing post-review booking list.",
  "Day-of-trip jobs are shown as `Today's Jobs` on Dashboard, replacing the duplicate Today/Upcoming booking summaries while keeping Bookings as the saved-job finder.",
  "`Today's Jobs` driver report auto-refresh is on by default, still uses the guarded admin driver-status read path, and can be switched off by the operator.",
  "The `Today's Jobs` live map control opens the existing admin-only live-location runtime for assigned jobs in the monitor window and refreshes shared markers every 10 seconds while the sector is open.",
  "The same live map control stays visible at zero assigned jobs, shows the actual active live-map slot count, and stays disabled until at least one assigned active job enters the 1-hour window.",
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
