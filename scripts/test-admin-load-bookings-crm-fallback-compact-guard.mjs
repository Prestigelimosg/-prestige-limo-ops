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
  "Admin `Load Bookings` now tries same-origin admin `GET /api/admin-saved-bookings?limit=25` first and falls back to same-origin admin `GET /api/admin-bookings` when the saved-bookings read fails or returns a malformed list.",
  "Both reads use the existing `x-prestige-admin-purpose` browser-admin header and remain GET-only.",
  "Silent dashboard/bookings/dispatch auto-sync skips the legacy saved-bookings read and uses the CRM-safe admin bookings list, so `Save Booking + CRM` cannot accidentally reload through `/api/admin-saved-bookings`.",
  "The fallback is an admin dashboard read fallback only; it does not add public reads, broad writes, DB writes, provider sends, env changes, deploys, parser changes, live GPS/customer-wide live map, billing/payment/PDF/invoice/payout, or shims.",
  "Save Booking + CRM remains on `POST /api/admin-bookings` and is not changed by this fallback.",
  "Recent and Completed booking lists now render compact expandable rows by default so dispatch can scan more bookings at once while keeping existing details and action buttons available.",
  "The Bookings tab now triggers the same safe Load Bookings read automatically the first time it is opened with an empty loaded list.",
  "Open customer booking requests are surfaced on the Dashboard command centre and above Recent Bookings, using the existing customer request source markers with a bounded fallback for open `CUST-` request references when live rows do not carry those markers.",
  "The Dashboard is the default admin landing tab, shows a compact `Urgent Booking Requests` alert for open customer requests with pickup under 24 hours, and routes request clicks to the existing Bookings review area instead of loading Dispatch directly.",
  "Dashboard initial Load Bookings completion only writes the global status message while the operator is still on Dashboard, so a delayed read cannot overwrite Rates or other tab feedback after navigation.",
  "The Bookings request row is the review handoff point and can load the selected request into the existing Dispatch form only when the operator chooses `Load this booking`; the handoff focuses the existing Customer Copy section for admin review/send preparation without adding a duplicate write path.",
  "Loading a customer request into Dispatch now records a bounded browser-local handled-request key so that request leaves the Dashboard urgent queue plus the Bookings `Urgent & New Booking Requests` queue and badge on that admin browser while remaining available in Recent/Active booking lists.",
  "Loading a saved booking into Dispatch refreshes the typed operational display once immediately and pauses one background sync tick, keeping the existing guarded read set stable while Customer Copy focuses for review.",
  "The Dashboard now uses compact read-only booking summaries plus `Open` handoff buttons; single-booking driver assignment, status, copy, job-card, and completion work stays in Dispatch/Bookings so page purposes do not duplicate.",
  "The shared `Today's Jobs` sector is shown on the Dashboard command centre and at the top of Dispatch for multi-driver scanning.",
  "`Today's Jobs` shows all loaded active jobs inside the 1-hour pickup monitor window without a separate expand/collapse toggle.",
  "`Today's Jobs` shows a compact saved driver report readout per visible job, using the existing guarded admin `GET /api/admin-driver-job-statuses` path only, with monitor-wide/per-card refresh controls and auto-refresh on by default.",
  "`Today's Jobs` includes compact live-map controls that reuse the existing admin-only live-location runtime for the jobs inside the monitor window.",
  "The Dashboard driver report readout is read-only and does not create driver status events, notification rows, provider sends, GPS/live-location records, billing/payment/PDF/invoice/payout records, or a duplicate single-booking Dispatch workflow.",
  "The Bookings tab shows a compact new-request badge/highlight after open customer requests are detected; no sound, browser notification, polling loop, provider send, or new route is added.",
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
assertIncludes(loadBookingsBlock, "const adminBookingsResponse = await fetch(adminBookingsApiPath, requestInit);", "Admin bookings fallback read");
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
assertIncludes(appPage, 'data-bookings-new-request-badge="true"', "Bookings tab new request badge");
assertIncludes(appPage, "const customerBookingRequestCount = customerBookingRequestBookings.length;", "Bookings badge count");
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
  "urgentCustomerBookingRequestDisplayItems",
  "data-dashboard-urgent-booking-requests-panel",
  "data-dashboard-new-booking-requests-panel",
  "data-dashboard-review-new-booking-requests",
  "data-dashboard-new-booking-request-row",
  "data-new-customer-booking-requests-panel",
  "data-new-customer-booking-request-row",
  "data-new-customer-booking-request-load",
  "Load this booking",
  "onClick={() => loadSelectedBooking(requestBooking, { focusCustomerCopy: true })}",
  "dispatchLoadFocusTarget",
  "scrollIntoView({ behavior: \"smooth\", block: \"start\" })",
  "Customer Copy is ready for admin review.",
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
  "{activeJobsMonitorPanel}",
]) {
  assertIncludes(
    dashboardBlock,
    dashboardCommandCentreFragment,
    `Dashboard command-centre fragment ${dashboardCommandCentreFragment}`,
  );
}

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
  "const dayOfTripActiveJobVisibleBookings = dayOfTripActiveJobBookings;",
  "Active jobs monitor shows all active rows",
);
assertIncludes(
  appPage,
  "const [dashboardDriverJobAutoRefreshEnabled, setDashboardDriverJobAutoRefreshEnabled] = useState(true);",
  "Today's Jobs driver report auto-refresh defaults on",
);
assertIncludes(
  appPage,
  "aria-label=\"Today's Jobs\"",
  "Shared active jobs monitor renamed to Today's Jobs",
);
assertIncludes(appPage, 'data-dashboard-live-driver-map="true"', "Dashboard live map panel");
assertIncludes(appPage, "openAdminLiveLocationRuntimeForActiveJobs", "Dashboard opens active jobs in live map");
assertIncludes(appPage, 'data-dashboard-live-driver-map-open="true"', "Dashboard live map open action");
assertIncludes(appPage, 'data-dashboard-live-driver-map-refresh="true"', "Dashboard live map refresh action");
assertIncludes(appPage, 'data-dashboard-live-driver-map-close="true"', "Dashboard live map close action");
assertExcludes(appPage, 'data-admin-multi-driver-active-jobs-toggle="true"', "Active jobs monitor expand toggle");
assertExcludes(appPage, '"Show other active jobs"', "Active jobs monitor expand label");
assertExcludes(appPage, '"Show one job"', "Active jobs monitor collapse label");
assertIncludes(appPage, "dashboardDriverJobStatusReadStates", "Dashboard driver report status map");
assertIncludes(
  appPage,
  "dashboardDriverJobStatusAutoRequestedRef",
  "Dashboard driver report auto-read guard",
);
assertIncludes(
  appPage,
  "refreshDashboardDriverJobStatusRead",
  "Dashboard driver report refresh helper",
);
assertIncludes(
  appPage,
  "loadAdminDriverJobStatusRead(bookingReference)",
  "Dashboard driver report uses existing guarded status read path",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-jobs-refresh-statuses="true"',
  "Dashboard monitor-wide driver report refresh button",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-jobs-auto-refresh="true"',
  "Today's Jobs driver report auto-refresh indicator",
);
assertIncludes(
  appPage,
  "window.setInterval(() => {\n      for (const bookingReference of bookingReferences) {\n        void refreshDashboardDriverJobStatusRead(bookingReference);\n      }\n    }, 10 * 1000);",
  "Dashboard driver report read-only auto-refresh interval",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-job-driver-report="true"',
  "Dashboard active job driver report readout",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-job-driver-report-refresh="true"',
  "Dashboard active job driver report refresh button",
);
assertIncludes(
  appPage,
  'data-admin-multi-driver-active-job-driver-report-time="true"',
  "Dashboard active job driver report time",
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
  sliceBetween(appPage, "const showBookingsRequestBadge", "</nav>") +
  sliceBetween(
    appPage,
    'data-dashboard-new-booking-requests-panel="true"',
    '<div className="mb-4">{activeJobsMonitorPanel}</div>',
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
  "const adminBookingsResponse = await fetch(adminBookingsApiPath, requestInit);",
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
