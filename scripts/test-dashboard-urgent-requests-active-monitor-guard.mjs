import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const savedBookingReadPath = "lib/admin-saved-booking-read.ts";
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

const [appPage, ledger, preactivationSuite, savedBookingRead] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(savedBookingReadPath, "utf8"),
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
const codexPreparedJobCardsPanel = sliceBetween(
  appPage,
  "const codexPreparedJobCardsPanel = (",
  "const bookingsFindToolbar = (",
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
const bookingStatusUpdateSection = sliceBetween(
  appPage,
  "async function updateBookingStatusOnly(",
  "async function syncBookingCompletedStatusFromDriverReport(",
);
const dashboardOverdueResolutionSection = sliceBetween(
  appPage,
  "async function resolveDashboardOverdueBooking(",
  "async function adminConfirmBookingCompletedByPhone(",
);
const loadBookingsSection = sliceBetween(
  appPage,
  "async function loadBookings(",
  "function rememberHandledCustomerBookingRequest(",
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
  'aria-label="Booking Requests"',
  "{codexPreparedJobCardsPanel}",
);
const ledgerSection = sliceBetween(
  ledger,
  "### Dashboard Booking Requests And One-Window Active Monitor",
  "\n### ",
);

for (const fragment of [
  "function bookingRecordPickupDateTimeMs",
  "function bookingRecordIsPickupWithinNextHours",
  "function bookingRecordIsPickupOverdue",
  "function bookingRecordIsInsideActiveJobMonitorWindow",
  "pickupTimeMs >= currentTimeMs",
  "pickupTimeMs - currentTimeMs < hours * 60 * 60 * 1000",
  "pickupTimeMs < currentTimeMs",
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
  'selectAppTab("dashboard")',
  "dashboard Review handoff stays on Dashboard",
);
assertExcludes(
  customerBookingRequestsReviewHandler,
  'selectAppTab("bookings")',
  "dashboard Review handoff stale Bookings target",
);

for (const fragment of [
  "Codex Prepared Job Cards",
  "Prepared from exact saved requests. Admin reviews every card before calendar action.",
  'data-codex-prepared-job-card-list="true"',
  "customerBookingRequestDisplayItems.map",
  "const passengerText = getLoadBookingsOperationalPassengerDisplay(operationalCard, requestBooking);",
  "{getLoadBookingsOperationalRequestDisplayTitle(operationalCard, requestBooking)}",
  "Passenger: {passengerText}",
  "{routeText}",
  "data-admin-prepared-job-card-close={bookingId}",
  "onClick={() => rememberHandledCustomerBookingRequest(requestBooking)}",
  "Close",
]) {
  assertIncludes(codexPreparedJobCardsPanel, fragment, `Codex prepared queue fragment ${fragment}`);
}
for (const removedFragment of [
  "Calendar changes still require admin action in Dispatch.",
  "Review Job Card",
  "Review Corrected Job Card",
  "loadSelectedBooking(requestBooking, {",
]) {
  assertExcludes(
    codexPreparedJobCardsPanel,
    removedFragment,
    `Codex prepared close-only queue removes ${removedFragment}`,
  );
}

for (const fragment of [
  "Booking Requests",
  "newBookingRequestNotifications.map",
  'data-dashboard-new-booking-request-notification-row={bookingReference || notificationId}',
  'data-dashboard-new-booking-notification-count={String(newBookingRequestNotificationCount)}',
  'data-admin-app-notification-review-new-booking-request="true"',
  'openNewBookingRequestNotificationReview(canOpenExact ? bookingReference : "")',
  'data-admin-app-notification-action="read"',
  '"Done"',
  'data-dashboard-urgent-booking-requests-panel="true"',
  'data-dashboard-urgent-booking-requests-count={String(dashboardUrgentBookingRequestCount)}',
  'data-dashboard-change-cancel-requests-count={String(customerBookingChangeRequestCount)}',
  "New, urgent, Driver TBC, amendment, and cancellation work in one place.",
  "standaloneUrgentBookingRequestDisplayItems.map",
  'data-dashboard-urgent-booking-request-kind=',
  '"customer-request"',
  '"driver-tbc"',
  'data-dashboard-urgent-booking-request-row={bookingId}',
  "const passengerText = getLoadBookingsOperationalPassengerDisplay(operationalCard, bookingRecord);",
  "const isOverdue =",
  "bookingRecordIsPickupOverdue(bookingRecord, currentTimeMs)",
  "{getLoadBookingsOperationalRequestDisplayTitle(operationalCard, bookingRecord)}",
  "Passenger: {passengerText}",
  '"New / Urgent"',
  '"Driver TBC"',
  'isOverdue ? "Overdue" : "Driver TBC under 1h"',
  "loadSelectedBooking(bookingRecord, { focusDriverJobLink: true })",
  'data-dashboard-overdue-booking-actions={bookingId}',
  'data-dashboard-overdue-booking-completed={bookingId}',
  'data-dashboard-overdue-booking-cancel={bookingId}',
  'resolveDashboardOverdueBooking(bookingRecord, "completed")',
  'resolveDashboardOverdueBooking(bookingRecord, "cancelled")',
  '"Completed"',
  '"Cancel"',
  "customerBookingChangeRequestNotifications.map",
  "adminAppNotificationChangeRequestContext(notification)",
  'data-dashboard-change-cancel-request-row={safeRowKey}',
  'data-dashboard-change-cancel-request-action="accept"',
  "handleAdminBookingChangeRequestApply(notification)",
  'data-dashboard-change-cancel-request-action="reject"',
  'handleAdminBookingChangeRequestCloseDecision(notification, "reject")',
  'data-dashboard-change-cancel-request-action="dismiss"',
  'handleAdminBookingChangeRequestCloseDecision(notification, "dismiss")',
  "No new, urgent, amendment, or cancellation requests.",
]) {
  assertIncludes(dashboardUrgentPanel, fragment, `dashboard urgent panel fragment ${fragment}`);
}

for (const fragment of [
  "): Promise<boolean>",
  "return true;",
  "return false;",
]) {
  assertIncludes(bookingStatusUpdateSection, fragment, `booking status result fragment ${fragment}`);
}

for (const fragment of [
  'resolution: "completed" | "cancelled"',
  "Mark this overdue job Completed?",
  "Use Completed only if the trip happened.",
  "Cancel this overdue job?",
  "Use Cancel if the trip did not happen.",
  "window.confirm(",
  "await markBookingCompleted(bookingRecord)",
  "await markBookingCancelled(bookingRecord)",
  "setCompletedMonthFilter(bookingRecordCompletedHistoryMonthKey(bookingRecord))",
  'selectAppTab("completed")',
]) {
  assertIncludes(
    dashboardOverdueResolutionSection,
    fragment,
    `dashboard overdue resolution fragment ${fragment}`,
  );
}
for (const forbidden of [
  "fetch(",
  "setInterval(",
  "autoSyncSavedBookingGoogleCalendar",
  "sendAdmin",
  "notification",
]) {
  assertExcludes(
    dashboardOverdueResolutionSection,
    forbidden,
    `dashboard overdue resolution duplicate side effect ${forbidden}`,
  );
}
assert.equal(
  (appPage.match(/fetch\(adminSavedBookingStatusesApiPath/g) || []).length,
  1,
  "Dashboard overdue actions must reuse the single saved-booking-status writer.",
);
for (const monitorFragment of [
  "setCurrentTimeMs(Date.now());",
  "}, 30 * 1000);",
  'void loadBookings("Bookings synced.", { silent: true }).finally(() => {',
  "}, 3 * 1000);",
  "void refreshDashboardDriverJobStatusRead(bookingReference);",
  "}, 10 * 1000);",
  "syncBookingCompletedStatusFromDriverReport(",
]) {
  assertIncludes(appPage, monitorFragment, `established booking monitor fragment ${monitorFragment}`);
}
for (const fragment of [
  "adminMonitorableBookingListScope",
  "fetchCompleteMonitorableSavedBookingList",
  'scope: adminMonitorableBookingListScope',
  "offset: String(pageIndex * Number(adminLoadBookingsListLimit))",
  "monitorablePage.length < Number(adminLoadBookingsListLimit)",
  "mergeSavedBookingMonitorCoverage",
  "monitorableBookings = monitorableBookingsResult.bookings",
  "if (monitoringCoverageError)",
]) {
  assertIncludes(loadBookingsSection, fragment, `complete monitor coverage fragment ${fragment}`);
}
for (const forbidden of ["setInterval(", "setTimeout(", "PATCH", "POST", "DELETE"] ) {
  assertExcludes(
    loadBookingsSection,
    forbidden,
    `complete monitor coverage duplicate timer or writer ${forbidden}`,
  );
}
for (const fragment of [
  'const allowedListReadQueryParams = new Set(["limit", "offset", "scope"]);',
  'scope: "all" | "monitorable";',
  'scope === "monitorable"',
  "query.or(",
  "`${statusColumn}.is.null,${statusColumn}.not.in.${terminalSavedBookingStatuses}`",
  "return query.range(",
  "parsed.data.offset + parsed.data.limit - 1",
]) {
  assertIncludes(savedBookingRead, fragment, `monitorable saved-booking read fragment ${fragment}`);
}

for (const fragment of [
  'aria-label="Codex Review and Admin App Notifications"',
  'data-admin-app-notification-feed="true"',
  'data-dashboard-codex-system-notices="true"',
  'data-status-panel="global"',
  'aria-label="Booking Requests"',
  "{codexPreparedJobCardsPanel}",
  'data-admin-device-push-panel="true"',
]) {
  assertIncludes(dashboardCommandCentrePanel, fragment, `single Codex workbench fragment ${fragment}`);
}
assertSourceOrder(
  dashboardCommandCentrePanel,
  [
    'data-admin-app-notification-feed="true"',
    'data-dashboard-codex-system-notices="true"',
    'aria-label="Booking Requests"',
    "{codexPreparedJobCardsPanel}",
  ],
  "single Codex workbench order",
);
assertExcludes(
  dashboardCommandCentrePanel,
  'data-dashboard-admin-action-summary="true"',
  "single Codex workbench removes repeated Admin Action summary",
);
assertExcludes(
  dashboardCommandCentrePanel,
  "{statusPanel}",
  "Dashboard must not render a second global feedback panel outside the Codex workbench",
);
assert.equal(
  (dashboardCommandCentrePanel.match(/data-admin-app-notification-feed="true"/g) || []).length,
  1,
  "Dashboard must render exactly one Codex/admin notification feed.",
);

for (const fragment of [
  "const [dispatchLoadFocusTarget, setDispatchLoadFocusTarget] = useState<",
  '"customerCopy" | "driverJobLink" | "jobCard" | null',
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
  'data-driver-job-link-booking-details="true"',
  "<p className=\"font-semibold\">Booking {dispatchReleaseWorkflowBookingReference}</p>",
  "Passenger",
  "Pickup",
  "Route",
  "Assigned driver",
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
    'aria-label="Codex Review and Admin App Notifications"',
    'aria-label="Booking Requests"',
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
  assertExcludes(codexPreparedJobCardsPanel, forbidden, `Codex prepared queue passenger boundary ${forbidden}`);
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
  "Boolean(cleanReferenceText(bookingRecord.booking_reference))",
  "bookingRecordPickupDateTimeMs(bookingRecord) !== null",
  "routePoints.length >= 2",
  "function bookingRecordIsCurrentAssignedActiveJob(",
  "pickupTimeMs >= currentTimeMs - 24 * 60 * 60 * 1000",
]) {
  assertIncludes(appPage, fragment, `assigned active monitor eligibility helper fragment ${fragment}`);
}

for (const fragment of [
  ".filter(bookingRecordIsDispatchActiveJobsMonitorEligible)",
  ".filter((bookingRecord) => bookingRecordIsCurrentAssignedActiveJob(bookingRecord, currentTimeMs))",
  "normaliseTimeForSort(formatPickupTimeFromRecord(firstBooking))",
  "normaliseTimeForSort(formatPickupTimeFromRecord(secondBooking))",
  "const dayOfTripActiveJobVisibleBookings = dayOfTripActiveJobBookings;",
  "const liveDispatchPreparedSlotCount = liveDispatchMapReferenceList.length;",
  "const liveDispatchSlotSummaryLabel =",
  "const activeJobsMapAllowedReferenceKey = adminActiveJobsMapReadState.allowedBookingReferences.join(\"|\");",
  'const todayJobsMonitorIsActive = activeTab === "dashboard";',
  "refreshDashboardDriverJobLinksRead(bookingReferences)",
]) {
  assertIncludes(activeMonitorSource, fragment, `active monitor source fragment ${fragment}`);
}

for (const fragment of [
  "Active Assigned Jobs",
  "All assigned active jobs, including advance and last-minute work. Driver reports refresh automatically.",
  "{dayOfTripActiveJobBookings.length} active",
  "No assigned active jobs to monitor.",
  "Auto-refresh 10s {dashboardDriverJobAutoRefreshEnabled ? \"On\" : \"Off\"}",
  "const activeJobPickupTime = formatPickupTimeFromRecord(activeJobBooking);",
  'data-admin-active-job-passenger="true"',
  'data-admin-active-job-assigned-driver="true"',
  "Latest report: {activeJobDriverStatusLabel}",
  'data-admin-multi-driver-active-job-driver-report-history="true"',
  "History:</span> {activeJobDriverStatusHistory}",
  "{activeJobDriverAcknowledgementState.label}",
  'data-admin-multi-driver-active-job-acknowledgement="true"',
  'data-admin-multi-driver-active-job-acknowledgement-state=',
  'data-admin-multi-driver-active-jobs-waiting-count=',
  'activeJobDriverStatusReferenceList.length === 0',
  '? "0 waiting"',
  "{activeJobDriverAcknowledgementWaitingCount} waiting",
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
  "AdminActiveJobsBrowserMap",
]) {
  assertIncludes(activeMonitorPanel, fragment, `active monitor fragment ${fragment}`);
}

for (const forbidden of [
  "const activeJobsMonitorDefaultVisibleCount = 1;",
  "dayOfTripActiveJobBookings.slice(",
  ".filter(activeJobIsInMonitorWindow)",
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
  assertExcludes(codexPreparedJobCardsPanel, forbiddenPattern, "Codex prepared queue privacy boundary");
  assertExcludes(dashboardUrgentPanel, forbiddenPattern, "dashboard urgent panel privacy boundary");
  assertExcludes(activeMonitorPanel, forbiddenPattern, "active monitor privacy boundary");
}

for (const phrase of [
  "Dashboard has one `Booking Requests` sector inside the single `Codex Review & Admin App Notifications` workbench.",
  "A booking represented by both a new-request notification and the urgent monitor is rendered once as `New / Urgent`; the generic notification list excludes new and change/cancel rows so the same work is not duplicated.",
  "The repeated `Admin actions` summary and sector-level `Open Urgent`/`Review` buttons are removed.",
  "The header has one `Refresh Dashboard` action that reuses the existing booking-load and saved-notification refresh triggers.",
  "Generic admin notification cleanup uses one `Done` action (the existing safe `read` status update), and Device Push Alerts uses one ON/OFF switch backed by the existing enable/disable handlers.",
  "Clearing a loaded Dispatch booking now clears its Driver Job Link handoff reference, and a successful new `Save + CRM` replaces it with the newly saved booking reference before focusing the existing Driver Job Link panel; stale prior-booking notices must not survive the save.",
  "New booking notification rows keep one exact `Open request` action.",
  "The Dashboard `Codex Prepared Job Cards` panel remains the queue for open customer requests outside the 1-hour dispatch window, with row badges separating under-24h-but-not-dispatch-window requests from new non-urgent requests; Bookings remains for saved booking search/load/list work.",
  "Unhandled customer requests are hidden from Current / Upcoming until admin loads them from the Dashboard Codex queue, preventing duplicate cards while preserving the existing post-review booking list.",
  "The isolated Preview preflight found this focused guard still slicing the retired `customerBookingRequestsPanel`; the guard now targets the single established `codexPreparedJobCardsPanel` and protects its current review handoff and privacy boundary instead of failing before those assertions.",
  "Day-of-trip jobs are shown as `Today's Jobs` on Dashboard, replacing the duplicate Today/Upcoming booking summaries while keeping Bookings as the saved-job finder.",
  "`Today's Jobs` driver report auto-refresh is on by default, still uses the guarded admin driver-status read path, and can be switched off by the operator.",
  "The `Today's Jobs` live map control opens the existing admin-only live-location runtime for assigned active jobs and refreshes shared markers every 10 seconds while the sector is open.",
  "The same live map control stays visible at zero assigned jobs, shows the actual active live-map slot count, and stays disabled until at least one assigned active job is available.",
  "The pickup risk monitor defaults off, can be toggled by admin, highlights only the affected driver/job row and marker for no-pin, stale/offline, near-pickup watch, route ETA risk, and route-distance moving-away states, and does not claim route direction/ETA certainty unless guarded pickup approach evidence is ready.",
  "This reuses existing admin live-location runtime, map read paths, and guarded admin map search/route estimate routes for evidence when available; it does not add provider sends, notification sends, customer/driver messages, env changes, DB schema changes, billing/payment/PDF/invoice/payout, calendar sync, parser changes, or shims.",
  "Guard coverage lives in `scripts/test-dashboard-urgent-requests-active-monitor-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase ${phrase}`);
}
assertExcludes(
  ledgerSection,
  "switches to Bookings and focuses the existing `Urgent & New Booking Requests` queue",
  "stale Dashboard review handoff ledger wording",
);

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation dashboard urgent requests active monitor guard registration",
);

console.log("Dashboard urgent requests and active monitor guard passed");
