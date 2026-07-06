import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-load-bookings-crm-fallback-compact-guard.mjs";

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

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const [ledger, appPage, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Admin Load Bookings CRM Fallback And Compact List Fix");

for (const phrase of [
  "Admin `Load Bookings` now keeps typed display hydration at `limit=25`, then uses a bounded same-origin admin booking list read at `limit=100` for Dashboard/Dispatch active-job monitoring.",
  "Both reads use the existing `x-prestige-admin-purpose` browser-admin header and remain GET-only.",
  "Silent dashboard/bookings/dispatch auto-sync skips the legacy saved-bookings read and uses the CRM-safe admin bookings list, so `Save Booking + CRM` cannot accidentally reload through `/api/admin-saved-bookings`.",
  "The fallback is an admin dashboard read fallback only; it does not add public reads, broad writes, DB writes, provider sends, env changes, deploys, parser changes, live GPS/customer-wide live map, billing/payment/PDF/invoice/payout, or shims.",
  "Save Booking + CRM remains on `POST /api/admin-bookings` and is not changed by this fallback.",
  "Recent and Completed booking lists now render compact expandable rows by default so dispatch can scan more bookings at once while keeping existing details and action buttons available.",
  "The Bookings tab now triggers the same safe Load Bookings read automatically the first time it is opened with an empty loaded list.",
  "Open customer booking requests are surfaced on the Dashboard command centre and above Recent Bookings, using the existing customer request source markers with a bounded fallback for open `CUST-` request references when live rows do not carry those markers.",
  "The Dashboard is the default admin landing tab, shows a compact `Urgent Booking Requests` alert only for open customer requests and saved Driver TBC jobs inside the 1-hour pickup monitor window, and routes each row to the existing Dispatch Driver Job Link handoff.",
  "Dashboard initial Load Bookings completion only writes the global status message while the operator is still on Dashboard, so a delayed read cannot overwrite Rates or other tab feedback after navigation.",
  "The Bookings request row is the review handoff point for open customer requests outside the 1-hour dispatch window and can load the selected request into the existing Dispatch form only when the operator chooses `Open in Driver Job Link`; the handoff focuses the existing Driver Job Link section without adding a duplicate write path.",
  "Loading a customer request into Dispatch now records a bounded browser-local handled-request key so that request leaves the Dashboard urgent queue plus the Bookings `Urgent & New Booking Requests` queue and badge on that admin browser, then becomes available in Current / Upcoming.",
  "Loading a saved booking into Dispatch refreshes the typed operational display once immediately and pauses one background sync tick, keeping the existing guarded read set stable while Customer Copy focuses for review.",
  "The Dashboard now uses compact read-only booking summaries plus `Open` handoff buttons; single-booking driver assignment, status, copy, job-card, and completion work stays in Dispatch/Bookings so page purposes do not duplicate.",
  "`Today's Jobs` is shown below the Dispatch `Assigned Driver` sector for multi-driver scanning and is not rendered on Dashboard.",
  "`Today's Jobs` shows assigned operational jobs inside the 1-hour pickup monitor window without a separate expand/collapse toggle.",
  "`Today's Jobs` excludes customer-request rows and unassigned/Driver TBC rows from the live-dispatch queue; unassigned saved jobs inside the 1-hour pickup monitor window stay in the Dashboard `Urgent Booking Requests` panel until admin loads them for driver assignment.",
  "`Today's Jobs` shows a compact saved driver report readout per visible job, using the existing guarded admin `GET /api/admin-driver-job-statuses` path only, with monitor-wide/per-card refresh controls and auto-refresh on by default.",
  "`Today's Jobs` includes compact live-map controls that reuse the existing admin-only live-location runtime for the jobs inside the monitor window.",
  "The lower Dispatch saved-record finder and internal advanced checks stay in the source as an archived `Optional Workflow Tools` block, but the block is hidden from normal operation so it cannot distract dispatch with unused saved-record or readiness panels.",
  "Dispatch internal readiness, handoff, follow-up, day-of-trip monitor, recovery, exception, closeout-review, and billing-prep panels remain colocated under the archived optional workflow block and nested `Advanced Checks` disclosure for guard coverage, while the default operator view stays focused on daily trip work.",
  "The `Today's Jobs` driver report readout is read-only and does not create driver status events, notification rows, provider sends, GPS/live-location records, billing/payment/PDF/invoice/payout records, or a duplicate single-booking Dispatch workflow.",
  "The Bookings tab shows one compact pulsing alert badge/highlight after open customer booking requests or queued customer change/cancel requests are detected. The count combines both existing sources and exposes separate safe data markers for booking-request count, change-request count, and total alert count; no sound, browser notification, polling loop, provider send, or new route is added.",
]) {
  assertIncludes(ledgerSection, phrase, `Load Bookings fallback ledger phrase ${phrase}`);
}

for (const forbidden of [
  "driver payout",
  "PayNow payout",
  "customer price",
  "billing",
  "invoice",
  "payment",
  "internal admin notes",
  "parser/debug",
  "secrets",
  "raw provider payloads",
]) {
  assertIncludes(ledgerSection, forbidden, `Load Bookings fallback forbidden field ${forbidden}`);
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
const dashboardBlock = sliceBetween(
  appPage,
  '{activeTab === "dashboard" ? (',
  "      </div>\n    </main>",
);
const dispatchBlock = sliceBetween(
  appPage,
  '{activeTab === "dispatch" ? (',
  '{activeTab === "bookings" ? (',
);

assertIncludes(appPage, 'const adminBookingsApiPath = "/api/admin-bookings";', "Admin bookings fallback path");
assertIncludes(appPage, 'const adminLoadBookingsListLimit = "100";', "Admin active booking list limit");
assertIncludes(loadBookingsBlock, "function fetchAdminBookingsList", "Admin bookings list fallback helper");
assertIncludes(loadBookingsBlock, "skipSavedBookingsRead?: boolean", "Load Bookings supports silent saved-booking skip");
assertIncludes(loadBookingsBlock, "options?.skipSavedBookingsRead !== true", "Saved bookings read can be skipped");
assertIncludes(
  appPage,
  'void loadBookings("Bookings synced.", { silent: true, skipSavedBookingsRead: true })',
  "Silent auto-sync skips legacy saved bookings read",
);
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "Saved bookings first read",
);
assertIncludes(
  loadBookingsBlock,
  "const adminBookingsResponse = await fetch(`${adminBookingsApiPath}?${searchParams.toString()}`, requestInit);",
  "Admin bookings fallback read",
);
assertIncludes(loadBookingsBlock, '"x-prestige-admin-purpose": adminLegacyDataPurpose', "Admin purpose header");
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings GET-only method");
assertIncludes(loadBookingsBlock, 'source: "admin-saved-bookings"', "Saved bookings source marker");
assertIncludes(loadBookingsBlock, 'source: "admin-bookings"', "Admin bookings fallback source marker");
assertIncludes(loadBookingsBlock, "CRM list fallback used.", "Operator fallback success note");
assertIncludes(loadBookingsBlock, "sortBookingsNewestFirst(bookingsListResult.bookings)", "Fallback list feeds CRM list");
assertIncludes(
  loadBookingsBlock,
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
  "Typed operational display still hydrates before list read",
);
assertIncludes(
  loadBookingsBlock,
  'searchParams.set("limit", adminLoadBookingsListLimit);',
  "Admin active booking list read increases only after typed display hydration",
);

assertIncludes(appPage, "function bookingRecordIsCustomerBookingRequest", "Customer request classifier");
assertIncludes(appPage, "adminHandledCustomerBookingRequestsStorageKey", "Handled customer request storage key");
assertIncludes(appPage, "function getCustomerBookingRequestQueueKey", "Customer request queue key helper");
assertIncludes(
  appPage,
  'clean(bookingRecord.source_channel) === "customer-booking-request"',
  "Customer request source_channel marker",
);
assertIncludes(
  appPage,
  'clean(bookingRecord.source_surface) === "customer_booking_request"',
  "Customer request source_surface marker",
);
assertIncludes(
  appPage,
  'referenceCandidates.some((referenceCandidate) => referenceCandidate.startsWith("CUST-"))',
  "Customer request CUST reference fallback",
);
assertIncludes(appPage, '"confirmed"', "Confirmed customer request exclusion");
assertIncludes(appPage, '"released"', "Released customer request exclusion");
assertIncludes(appPage, "function bookingRecordIsOpenCustomerBookingRequest", "Open customer request classifier");
assertIncludes(appPage, "handledCustomerBookingRequestKeys", "Handled customer request state");
assertIncludes(appPage, "handledCustomerBookingRequestKeySet", "Handled customer request filter set");
assertIncludes(
  appPage,
  "!handledCustomerBookingRequestKeySet.has(getCustomerBookingRequestQueueKey(bookingRecord))",
  "Handled customer request exclusion",
);
assertIncludes(appPage, "function rememberHandledCustomerBookingRequest", "Handled customer request marker");
assertIncludes(
  appPage,
  "rememberHandledCustomerBookingRequest(bookingRecord);",
  "Load this booking marks customer request handled",
);
assertIncludes(
  appPage,
  'export default function Home({ initialTab = "dashboard" }: HomeProps = {})',
  "Dashboard default tab prop",
);
assertIncludes(appPage, "useState<AppTab>(initialTab)", "Dashboard default tab state");
assertIncludes(
  appPage,
  "dashboardBookingsInitialLoadAttemptedRef",
  "Dashboard initial booking request auto-load guard",
);
assertIncludes(
  appPage,
  'activeTab !== "dashboard"',
  "Dashboard initial auto-load tab boundary",
);
assertIncludes(
  appPage,
  "bookings.length > 0 ||\n      loading",
  "Dashboard initial auto-load empty-list boundary",
);
assertIncludes(appPage, "function selectAppTab(nextTab: AppTab)", "Admin tab selection helper");
assertIncludes(appPage, "function openCustomerBookingRequestsReview()", "Dashboard request review handoff helper");
assertIncludes(appPage, 'selectAppTab("bookings");', "Dashboard request handoff opens Bookings");
assertIncludes(
  appPage,
  'querySelector(\'[data-new-customer-booking-requests-panel="true"]\')',
  "Dashboard request handoff scrolls to request panel",
);
assertIncludes(
  appPage,
  'data-bookings-tab-autoload={tab.id === "bookings" ? "true" : undefined}',
  "Bookings tab auto-load marker",
);
assertIncludes(
  appPage,
  'data-bookings-tab-new-requests={showBookingsRequestBadge ? "true" : undefined}',
  "Bookings tab new request highlight marker",
);
assertIncludes(
  appPage,
  'data-bookings-tab-new-booking-requests={isBookingsTab ? String(customerBookingRequestCount) : undefined}',
  "Bookings tab customer booking request count marker",
);
assertIncludes(
  appPage,
  'data-bookings-tab-change-requests={isBookingsTab ? String(customerBookingChangeRequestCount) : undefined}',
  "Bookings tab customer change request count marker",
);
assertIncludes(
  appPage,
  'data-bookings-tab-total-alerts={isBookingsTab ? String(bookingsTabAttentionCount) : undefined}',
  "Bookings tab total attention count marker",
);
assertIncludes(appPage, 'data-bookings-new-request-badge="true"', "Bookings tab new request badge");
assertIncludes(appPage, "const customerBookingRequestCount = bookingTabCustomerBookingRequestBookings.length;", "Bookings badge count");
assertIncludes(
  appPage,
  "const customerBookingChangeRequestCount = adminAppNotificationReadState.notifications.filter((notification) =>",
  "Bookings badge customer change request source",
);
assertIncludes(
  appPage,
  "const bookingsTabAttentionCount = customerBookingRequestCount + customerBookingChangeRequestCount;",
  "Bookings badge combined attention count",
);
assertIncludes(appPage, "animate-pulse rounded-full", "Bookings tab alert badge pulse");
assertIncludes(appPage, "visibleCustomerBookingRequestBookings", "Customer request visible list cap");
assertIncludes(
  appPage,
  '(nextTab === "bookings" || nextTab === "dashboard") && bookings.length === 0 && !loading',
  "Bookings/Dashboard tab auto-load empty-list guard",
);
assertIncludes(appPage, 'void loadBookings("Bookings loaded.");', "Bookings tab visible auto-load");
assertIncludes(appPage, 'void loadBookings("Bookings loaded.", { messageTab: "dashboard" });', "Dashboard tab-scoped initial load");
assertIncludes(appPage, "const activeTabRef = useRef<AppTab>(initialTab);", "Active tab async message ref");
assertIncludes(appPage, "activeTabRef.current === options.messageTab", "Load bookings tab-scoped message guard");

for (const customerRequestFragment of [
  "customerBookingRequestDisplayItems",
  "dashboardUrgentBookingRequestDisplayItems",
  "data-dashboard-urgent-booking-requests-panel",
  "data-dashboard-new-booking-requests-panel",
  "data-dashboard-review-new-booking-requests",
  "data-dashboard-new-booking-request-row",
  "data-new-customer-booking-requests-panel",
  "data-new-customer-booking-request-row",
  "data-new-customer-booking-request-load",
  "Open in Driver Job Link",
  "onClick={() => loadSelectedBooking(requestBooking, { focusDriverJobLink: true })}",
  "dispatchLoadFocusTarget",
  "scrollIntoView({ behavior: \"smooth\", block: \"start\" })",
  "Driver Job Link is ready for admin action.",
  "{customerBookingRequestsPanel}",
]) {
  assertIncludes(appPage, customerRequestFragment, `Customer request auto-load fragment ${customerRequestFragment}`);
}

for (const dashboardCommandCentreHelperFragment of [
  "data-dashboard-command-centre-bookings",
  "data-dashboard-command-centre-row",
  "data-dashboard-open-in-dispatch",
]) {
  assertIncludes(
    appPage,
    dashboardCommandCentreHelperFragment,
    `Dashboard command-centre helper fragment ${dashboardCommandCentreHelperFragment}`,
  );
}

for (const dashboardCommandCentreFragment of [
  "renderDashboardBookingSummaries(todayBookingDisplayItems",
  "renderDashboardBookingSummaries(upcomingBookingDisplayItems",
  'data-dashboard-earlier-history-handoff="true"',
  'data-dashboard-open-completed-history="true"',
  'onClick={() => selectAppTab("completed")}',
]) {
  assertIncludes(
    dashboardBlock,
    dashboardCommandCentreFragment,
    `Dashboard command-centre fragment ${dashboardCommandCentreFragment}`,
  );
}
assertExcludes(
  dashboardBlock,
  "{activeJobsMonitorPanel}",
  "Dashboard must not render Today's Jobs monitor",
);

for (const duplicateDashboardWorkflowFragment of [
  "renderBookingCards(",
  "data-dashboard-action-group",
  "data-dashboard-mark-otw",
  "data-dashboard-mark-pob",
  "data-dashboard-mark-completed",
  "data-dashboard-driver-search-input",
  "data-dashboard-assign-driver",
  "data-dashboard-copy-driver-dispatch",
  "data-dashboard-copy-job-card",
]) {
  assertExcludes(
    dashboardBlock,
    duplicateDashboardWorkflowFragment,
    `Dashboard duplicate workflow fragment ${duplicateDashboardWorkflowFragment}`,
  );
}

assertIncludes(dispatchBlock, "{activeJobsMonitorPanel}", "Dispatch uses shared Today's Jobs monitor");
assertIncludes(dispatchBlock, '<div className="order-[61]">{activeJobsMonitorPanel}</div>', "Dispatch Today's Jobs monitor placement below Assigned Driver");
assert.equal(
  dispatchBlock.indexOf('data-dispatch-workflow-step="driver-assignment"') <
    dispatchBlock.indexOf('<div className="order-[61]">{activeJobsMonitorPanel}</div>'),
  true,
  "Dispatch Today's Jobs monitor must render after the Assigned Driver sector.",
);
assertIncludes(
  dispatchBlock,
  'data-dispatch-optional-workflow-tools="true"',
  "Dispatch optional workflow tools wrapper",
);
assertIncludes(
  dispatchBlock,
  'data-dispatch-optional-workflow-tools-body="true"',
  "Dispatch optional workflow tools body",
);
assertIncludes(dispatchBlock, "Optional Workflow Tools", "Dispatch optional workflow tools summary");

const optionalWorkflowToolsTag = sliceBetween(
  dispatchBlock,
  '<details\n              aria-label="Optional Workflow Tools"',
  ">",
);
assertIncludes(optionalWorkflowToolsTag, 'className="hidden"', "Optional workflow tools hidden from normal operation");
assertIncludes(
  optionalWorkflowToolsTag,
  'data-dispatch-normal-operation-hidden="true"',
  "Optional workflow tools normal-operation archive marker",
);
assertIncludes(optionalWorkflowToolsTag, "\n              hidden", "Optional workflow tools hidden attribute");
assertExcludes(optionalWorkflowToolsTag, /\sopen(?:=|\s|$)/, "Optional workflow tools default disclosure");

const optionalWorkflowToolsBlock = sliceBetween(
  dispatchBlock,
  'data-dispatch-optional-workflow-tools="true"',
  '<aside className="contents">',
);
assertIncludes(
  optionalWorkflowToolsBlock,
  'data-dispatch-compact-panel="saved-booking-records"',
  "Dispatch saved booking records compact panel",
);
assertIncludes(optionalWorkflowToolsBlock, "Saved Booking Records", "Dispatch saved booking records summary");
assertIncludes(
  optionalWorkflowToolsBlock,
  'data-admin-collapsed-sector-body="admin-booking-persistence"',
  "Dispatch saved booking records collapsed body",
);
assertIncludes(
  optionalWorkflowToolsBlock,
  'data-dispatch-workflow-step="advanced-checks"',
  "Dispatch advanced checks workflow step",
);
assertIncludes(optionalWorkflowToolsBlock, 'data-dispatch-advanced-checks="true"', "Dispatch advanced checks wrapper");
assertIncludes(
  optionalWorkflowToolsBlock,
  'data-dispatch-advanced-checks-body="true"',
  "Dispatch advanced checks body",
);
assertIncludes(optionalWorkflowToolsBlock, "Advanced Checks", "Dispatch advanced checks summary");

const advancedChecksTag = sliceBetween(
  dispatchBlock,
  '<details\n              aria-label="Advanced Checks"',
  ">",
);
assertExcludes(advancedChecksTag, /\sopen(?:=|\s|$)/, "Dispatch advanced checks default disclosure");
assertIncludes(advancedChecksTag, "order-[79]", "Dispatch advanced checks stays archived in optional tools");
assertIncludes(
  advancedChecksTag,
  'data-dispatch-normal-operation-hidden="true"',
  "Dispatch advanced checks normal-operation archive marker",
);

const advancedChecksBlock = sliceBetween(
  dispatchBlock,
  'data-dispatch-advanced-checks="true"',
  '<aside className="contents">',
);
const advancedChecksDisclosureTags = [
  ...advancedChecksBlock.matchAll(/<details\n\s+aria-label="([^"]+)"[\s\S]*?>/g),
].map((match) => ({ label: match[1], tag: match[0] }));

assert.equal(
  advancedChecksDisclosureTags.length,
  16,
  "Advanced Checks child panels should all be nested disclosures.",
);

for (const { label, tag } of advancedChecksDisclosureTags) {
  assertExcludes(tag, /\sopen(?:=|\s|$)/, `Advanced Checks ${label} default disclosure`);
}

const driverAcknowledgementFollowUpTag = sliceBetween(
  advancedChecksBlock,
  '<details\n              aria-label="Driver Acknowledgement Follow-up"',
  ">",
);
assertExcludes(
  driverAcknowledgementFollowUpTag,
  /\sopen(?:=|\s|$)/,
  "Driver Acknowledgement Follow-up default disclosure",
);
assertIncludes(
  advancedChecksBlock,
  'data-admin-collapsed-sector-body="driver-acknowledgement-follow-up"',
  "Driver Acknowledgement Follow-up collapsed body",
);
assertExcludes(
  advancedChecksBlock,
  '<section\n              aria-label="Driver Acknowledgement Follow-up"',
  "Driver Acknowledgement Follow-up open section",
);

const dayOfTripDispatchMonitorTag = sliceBetween(
  advancedChecksBlock,
  '<details\n              aria-label="Day-of-Trip Dispatch Monitor"',
  ">",
);
assertExcludes(
  dayOfTripDispatchMonitorTag,
  /\sopen(?:=|\s|$)/,
  "Day-of-Trip Dispatch Monitor default disclosure",
);
assertIncludes(
  advancedChecksBlock,
  'data-admin-collapsed-sector-body="day-of-trip-dispatch-monitor"',
  "Day-of-Trip Dispatch Monitor collapsed body",
);
assertIncludes(
  advancedChecksBlock,
  'data-admin-day-of-trip-dispatch-monitor-legacy-hidden="true"',
  "Legacy Day-of-Trip Dispatch Monitor hidden boundary",
);
assertExcludes(
  advancedChecksBlock,
  /<section\n\s+aria-label="/,
  "Advanced Checks open sections",
);

for (const advancedCheckFragment of [
  'data-admin-dispatch-release-checklist="true"',
  'data-admin-dispatch-release-handoff-packet="true"',
  'data-admin-driver-acknowledgement-readiness="true"',
  'data-admin-driver-acknowledgement-follow-up="true"',
  'data-admin-day-of-trip-exception-escalation="true"',
  'data-admin-dispatch-recovery-replacement-readiness="true"',
  'data-admin-post-recovery-update-readiness="true"',
  'data-admin-day-of-trip-completion-handoff="true"',
  'data-admin-completed-trip-closeout-review="true"',
  'data-admin-closeout-to-billing-preparation-review="true"',
  'data-admin-billing-preparation-exception-review="true"',
  'data-admin-billing-preparation-summary-ready-review="true"',
  'data-admin-monthly-billing-queue-readiness-review="true"',
  'data-admin-monthly-billing-queue-exception-review="true"',
  'data-admin-monthly-billing-month-grouping-review="true"',
]) {
  assertIncludes(advancedChecksBlock, advancedCheckFragment, `Advanced Checks colocated fragment ${advancedCheckFragment}`);
}

assertIncludes(
  dispatchBlock,
  'data-admin-day-of-trip-dispatch-monitor-legacy-hidden="true"',
  "Legacy dispatch day-of-trip monitor stays hidden",
);
assert.equal(
  (appPage.match(/data-admin-multi-driver-active-jobs-monitor="true"/g) || []).length,
  1,
  "Today's Jobs monitor source should be defined once and reused.",
);
assertIncludes(appPage, "const activeJobDashboardSearchTerm = clean(searchTerm);", "Active jobs monitor search term");
assertIncludes(appPage, "const bookingAutoSyncPausedUntilRef = useRef(0);", "Loaded booking sync pause ref");
assertIncludes(appPage, "Date.now() < bookingAutoSyncPausedUntilRef.current", "Loaded booking pauses one auto-sync tick");
assertIncludes(appPage, "const typedDisplaySearchParams = new URLSearchParams({ limit: \"25\" });", "Loaded booking typed refresh params");
assertIncludes(appPage, "fetchLoadBookingsTypedOperationalDisplayResult(typedDisplaySearchParams)", "Loaded booking immediate typed refresh");
assertIncludes(
  appPage,
  "function bookingRecordIsDispatchActiveJobsMonitorEligible",
  "Active jobs monitor assigned operational eligibility helper",
);
assertIncludes(
  appPage,
  "bookingRecordHasDispatchActiveJobsMonitorDriver(bookingRecord) &&\n    !bookingRecordIsCustomerBookingRequest(bookingRecord)",
  "Active jobs monitor excludes customer requests and unassigned rows",
);
assertIncludes(
  appPage,
  "const urgentUnassignedSavedBookingRequests = useMemo(",
  "Dashboard urgent booking queue includes unassigned saved jobs",
);
assertIncludes(
  appPage,
  "operationalBookings\n        .filter((bookingRecord) => !bookingRecordBelongsInCompletedHistoryWithDriverReport(bookingRecord))",
  "Dashboard urgent saved-job queue uses loaded operational bookings independent of dashboard search",
);
assertIncludes(
  appPage,
  "!bookingRecordHasDispatchActiveJobsMonitorDriver(bookingRecord) &&\n            bookingRecordIsInsideActiveJobMonitorWindow(bookingRecord, currentTimeMs)",
  "Dashboard urgent booking queue captures unassigned saved jobs inside the 1-hour pickup window",
);
assertIncludes(
  appPage,
  "const dashboardUrgentBookingRequestBookings = useMemo(",
  "Dashboard urgent booking panel combines customer requests and Driver TBC saved jobs",
);
assertIncludes(
  appPage,
  "const urgentUnassignedSavedBookingIdSet = useMemo(",
  "Dashboard urgent unassigned saved booking id set",
);
assertIncludes(
  appPage,
  "!urgentUnassignedSavedBookingIdSet.has(bookingRecordStableKey(bookingRecord))",
  "Dashboard Today/Upcoming excludes urgent unassigned saved jobs by stable key",
);
assertIncludes(
  appPage,
  ".filter(bookingRecordIsDispatchActiveJobsMonitorEligible)",
  "Active jobs monitor applies assigned operational eligibility",
);
assertIncludes(
  appPage,
  "const dayOfTripActiveJobVisibleBookings = dayOfTripActiveJobBookings;",
  "Active jobs monitor uses the assigned operational row set",
);
assertIncludes(
  appPage,
  "const [dashboardDriverJobAutoRefreshEnabled, setDashboardDriverJobAutoRefreshEnabled] = useState(true);",
  "Today's Jobs driver report auto-refresh defaults on",
);
assertIncludes(
  appPage,
  "aria-label=\"Today's Jobs\"",
  "Dispatch active jobs monitor named Today's Jobs",
);
assertIncludes(
  appPage,
  'aria-label="Urgent Booking Requests"',
  "Dashboard urgent booking panel label",
);
assertIncludes(
  appPage,
  "Open urgent bookings in Driver Job Link, then create and copy the driver link.",
  "Dashboard urgent booking workflow copy points to Driver Job Link",
);
assertIncludes(
  appPage,
  'data-dashboard-urgent-booking-request-kind={',
  "Dashboard urgent booking rows distinguish request and Driver TBC rows",
);
assertIncludes(
  appPage,
  'isCustomerRequest ? "customer-request" : "driver-tbc"',
  "Dashboard urgent booking rows mark Driver TBC jobs",
);
assertIncludes(
  appPage,
  "loadSelectedBooking(bookingRecord, { focusDriverJobLink: true });",
  "Dashboard urgent rows load Dispatch and focus Driver Job Link for assignment",
);
assertExcludes(
  appPage,
  'aria-label="Urgent Driver Assignment"',
  "No separate urgent driver assignment sector",
);
assertIncludes(appPage, 'data-dispatch-live-driver-map="true"', "Dispatch live map panel");
assertIncludes(appPage, "openAdminLiveLocationRuntimeForActiveJobs", "Dispatch opens active jobs in live map");
assertIncludes(appPage, 'data-dispatch-live-driver-map-open="true"', "Dispatch live map open action");
assertIncludes(appPage, 'data-dispatch-live-driver-map-refresh="true"', "Dispatch live map refresh action");
assertIncludes(appPage, 'data-dispatch-live-driver-map-close="true"', "Dispatch live map close action");
assertIncludes(
  appPage,
  "const visibleActiveJobs = activeJobs.filter((job) =>\n        activeJobReferenceSet.has(cleanReferenceText(job.assigned_job_reference)),\n      );",
  "Dispatch live map filters runtime markers to Today's Jobs references",
);
assertIncludes(appPage, "activeJobs: visibleActiveJobs,", "Dispatch live map stores only visible markers");
assertIncludes(appPage, "markerCount: visibleActiveJobs.length,", "Dispatch live map marker count follows visible markers");
assertIncludes(
  appPage,
  "outside Today's Jobs window hidden.",
  "Dispatch live map explains hidden out-of-window shared drivers",
);
assertIncludes(
  appPage,
  "No assigned jobs are inside the 1-hour monitor window; live markers are hidden until a job enters the window.",
  "Dispatch live map clears stale markers when the monitor window is empty",
);
assertIncludes(
  appPage,
  "const activeJobsMapVisibleJobs = adminActiveJobsMapReadState.activeJobs.filter((job) =>\n    activeJobDriverStatusReferenceSet.has(cleanReferenceText(job.assigned_job_reference)),\n  );",
  "Dispatch live map derives visible marker rows from the monitor window",
);
assertIncludes(
  appPage,
  "activeJobs={activeJobsMapVisibleJobs}",
  "Dispatch live map browser renderer receives only visible marker rows",
);
assertIncludes(
  appPage,
  "activeJobDriverStatusReferenceList.length === 0 ||\n                adminActiveJobsMapReadState.runtimeStatus !== \"active\"",
  "Dispatch live map refresh is disabled when no monitor-window job exists",
);
assertIncludes(
  appPage,
  "const liveDispatchPreparedSlotCount = activeJobDriverStatusReferenceList.length;",
  "Dispatch live map slot count follows the actual monitor-window jobs",
);
assertExcludes(
  appPage,
  "activeJobs={adminActiveJobsMapReadState.activeJobs}",
  "Dispatch live map browser renderer raw runtime marker feed",
);
assertExcludes(
  appPage,
  "Math.max(2, activeJobDriverStatusReferenceList.length)",
  "Dispatch live map standby slot floor",
);
assertExcludes(appPage, 'data-dashboard-live-driver-map="true"', "Dashboard live map panel removed");
assertExcludes(appPage, 'data-dashboard-day-of-trip-operations-monitor="true"', "Dashboard active jobs monitor removed");
assertExcludes(appPage, 'data-admin-multi-driver-active-jobs-toggle="true"', "Active jobs monitor expand toggle");
assertExcludes(appPage, '"Show other active jobs"', "Active jobs monitor expand label");
assertExcludes(appPage, '"Show one job"', "Active jobs monitor collapse label");
assertIncludes(appPage, "dashboardDriverJobStatusReadStates", "Dashboard driver report status map");
assertIncludes(
  appPage,
  "dashboardDriverJobStatusAutoRequestedRef",
  "Dispatch driver report auto-read guard",
);
const activeJobDriverStatusStateSelector = sliceBetween(
  appPage,
  "function activeJobDriverStatusReadStateForBooking",
  "function pickupRiskStateForActiveJob",
);
assertIncludes(
  activeJobDriverStatusStateSelector,
  "const selectedDriverStatusState",
  "Today's Jobs selected booking status state",
);
assertIncludes(
  activeJobDriverStatusStateSelector,
  "const dashboardDriverStatusState",
  "Today's Jobs dashboard status state",
);
assertIncludes(
  activeJobDriverStatusStateSelector,
  "dashboardDriverStatusState?.latestStatus && !selectedDriverStatusState?.latestStatus",
  "Today's Jobs fresh dashboard report overrides stale selected empty report",
);
assertIncludes(
  activeJobDriverStatusStateSelector,
  "return selectedDriverStatusState || dashboardDriverStatusState",
  "Today's Jobs selected/dashboard report fallback",
);
assertIncludes(
  appPage,
  "refreshDashboardDriverJobStatusRead",
  "Dispatch driver report refresh helper",
);
assertIncludes(
  appPage,
  "loadAdminDriverJobStatusRead(bookingReference)",
  "Dispatch driver report uses existing guarded status read path",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-jobs-refresh-statuses="true"',
  "Dispatch monitor-wide driver report refresh button",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-jobs-auto-refresh="true"',
  "Today's Jobs driver report auto-refresh indicator",
);
assertIncludes(
  appPage,
  "window.setInterval(() => {\n      for (const bookingReference of bookingReferences) {\n        void refreshDashboardDriverJobStatusRead(bookingReference);\n        void refreshDashboardDriverOtsPhotoProofRead(bookingReference);\n      }\n    }, 10 * 1000);",
  "Dispatch driver report and OTS photo proof read-only auto-refresh interval",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-job-driver-report="true"',
  "Dispatch active job driver report readout",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-job-driver-report-refresh="true"',
  "Dispatch active job driver report refresh button",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-job-driver-report-time="true"',
  "Dispatch active job driver report time",
);
assertIncludes(
  appPage,
  "bookingMatchesLocalSearch(bookingRecord, activeJobDashboardSearchTerm)",
  "Active jobs monitor follows dashboard search",
);
assertIncludes(appPage, "function activeJobDateBucket", "Active jobs monitor date priority helper");
assertIncludes(
  appPage,
  "return dateKey >= todayKey ? 0 : 1;",
  "Active jobs monitor prioritizes current and upcoming jobs before older pending rows",
);
const bookingsBadgeScope =
  sliceBetween(appPage, "const customerBookingChangeRequestCount", "</nav>") +
  sliceBetween(
    appPage,
    'data-dashboard-new-booking-requests-panel="true"',
    '<div className="grid gap-3 border-y border-stone-200 py-4 text-center sm:grid-cols-3">',
  );
assertExcludes(bookingsBadgeScope, "new Audio(", "Bookings badge sound");
assertExcludes(
  bookingsBadgeScope,
  "Notification.requestPermission",
  "Bookings browser notification",
);

const typedOperationalFetchIndex = loadBookingsBlock.indexOf(
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
);
const savedBookingsFetchIndex = loadBookingsBlock.indexOf(
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
);
const adminBookingsFetchIndex = loadBookingsBlock.indexOf(
  "const adminBookingsResponse = await fetch(`${adminBookingsApiPath}?${searchParams.toString()}`, requestInit);",
);
assert.equal(typedOperationalFetchIndex > -1, true, "Typed operational fetch must be present.");
assert.equal(savedBookingsFetchIndex > -1, true, "Saved bookings fetch must be present.");
assert.equal(adminBookingsFetchIndex > -1, true, "Admin bookings fallback fetch must be present.");
assert.equal(
  typedOperationalFetchIndex < savedBookingsFetchIndex && savedBookingsFetchIndex < adminBookingsFetchIndex,
  true,
  "Load Bookings must hydrate typed display, then try saved-bookings, then fall back to admin-bookings.",
);

for (const forbiddenLoadFragment of [
  'method: "POST"',
  'method: "PATCH"',
  'method: "PUT"',
  'method: "DELETE"',
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "createClient",
  ".from(",
  ".insert(",
  ".upsert(",
  ".update(",
  ".delete(",
  "bookingCardPriceLine(savedBooking)",
]) {
  assertExcludes(loadBookingsBlock, forbiddenLoadFragment, `Load Bookings forbidden fragment ${forbiddenLoadFragment}`);
}

assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const compactFragment of [
  "data-recent-operational-details",
  "data-completed-operational-details",
  "<summary className=\"grid cursor-pointer list-none gap-2",
  "data-recent-operational-actions",
  "data-completed-operational-actions",
]) {
  assertIncludes(appPage, compactFragment, `Compact bookings list fragment ${compactFragment}`);
}

assertIncludes(preactivationSuite, guardScript, "Preactivation suite registration");

console.log("Admin Load Bookings CRM fallback and compact list guard passed");
