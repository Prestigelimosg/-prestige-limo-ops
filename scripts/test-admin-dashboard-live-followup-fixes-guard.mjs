import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-dashboard-live-followup-fixes-guard.mjs";

const appPagePath = "app/page.tsx";
const customersPagePath = "app/customers/page.tsx";
const customerBookingRequestRoutePath = "app/api/customer-booking-requests/route.ts";
const adminAppNotificationPersistencePath = "lib/admin-app-notification-persistence.ts";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must not include ${fragment}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [
  ledger,
  preactivationSuite,
  appPage,
  customersPage,
  customerBookingRequestRoute,
  adminAppNotificationPersistence,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(customersPagePath, "utf8"),
  readFile(customerBookingRequestRoutePath, "utf8"),
  readFile(adminAppNotificationPersistencePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Admin Dashboard Live Follow-up Fixes");

for (const phrase of [
  "Customer `/book` requests now create an internal admin-app inbox item after the booking request is saved.",
  "The admin-app notification payload is safe and template-only: no phone, email, pricing, payout, billing, provider payload, live location, token, parser/debug, or internal note data is included.",
  "Customer Copy and Driver Dispatch keep using the existing active driver job link safe-summary fallback for driver-entered vehicle models, and the fallback read can retry after a driver save instead of getting stuck behind an early stale read.",
  "Dashboard `Today's Jobs` lists all assigned active jobs, including advance and last-minute work, without changing the existing status, OTS-photo, or live-location APIs.",
  "Dashboard Today’s Jobs cards show human-readable passenger, assigned driver, route, latest report, report time, and recent report history.",
  "`Today's Jobs` driver report auto-refresh has an explicit 10-second on/off switch, defaults on, and manual Refresh remains available.",
  "The old Customers mock payment review rows stay removed from the daily Customers page.",
  "No app smoke, provider send, external notification delivery, GPS/live location, billing/payment/PDF/invoice/payout, env, DB schema, parser, calendar, or duplicate workflow sector was added.",
  "Guard coverage lives in `scripts/test-admin-dashboard-live-followup-fixes-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite registration");

assertIncludes(
  customerBookingRequestRoute,
  "createCustomerBookingRequestAdminAppNotification",
  "customer booking request route admin app notification hook",
);
assertIncludes(
  customerBookingRequestRoute,
  "Customer booking intake must not fail because the admin in-app inbox is unavailable.",
  "customer booking request best-effort admin inbox boundary",
);
assertIncludes(
  adminAppNotificationPersistence,
  "createCustomerBookingRequestAdminAppNotification",
  "customer request admin app notification helper",
);
assertIncludes(adminAppNotificationPersistence, 'notification_type: "booking_workflow"', "booking workflow notification type");
assertIncludes(adminAppNotificationPersistence, 'safe_title: "New booking request"', "safe new booking title");
assertIncludes(
  adminAppNotificationPersistence,
  'safe_message: "New booking request received. Review in Dashboard."',
  "safe new booking message",
);

const customerNotificationHelper = adminAppNotificationPersistence.slice(
  adminAppNotificationPersistence.indexOf("export async function createCustomerBookingRequestAdminAppNotification"),
  adminAppNotificationPersistence.indexOf("export async function updateAdminAppNotificationStatus"),
);

for (const forbidden of [
  "contact_phone",
  "contact_email",
  "customer_phone",
  "customer_email",
  "customer_price",
  "driver_payout",
  "paynow",
  "payment",
  "invoice",
  "billing",
  "live_location",
  "token",
  "parser",
  "whatsapp",
  "sms",
  "telegram",
]) {
  assertExcludes(customerNotificationHelper.toLowerCase(), forbidden, `customer notification helper forbidden ${forbidden}`);
}

for (const fragment of [
  "driverJobLinkVehicleFallbackRefreshLastRequestedRef",
  "requestDriverJobLinkVehicleFallbackRefresh",
  "now - lastRequestedAt < 8_000",
  "All assigned active jobs, including advance and last-minute work. Driver reports refresh automatically.",
  "No assigned active jobs to monitor.",
  'data-admin-multi-driver-active-job-driver-report-history="true"',
  "dashboardDriverJobAutoRefreshEnabled",
  "data-admin-multi-driver-active-jobs-auto-refresh-state",
  "Auto-refresh 10s {dashboardDriverJobAutoRefreshEnabled ? \"On\" : \"Off\"}",
  'data-admin-active-job-passenger="true"',
  'data-admin-active-job-assigned-driver="true"',
  'data-admin-multi-driver-active-job-driver-report-history="true"',
  "{activeJobPickup} &gt; {activeJobDropoff}",
]) {
  assertIncludes(appPage, fragment, `app page follow-up fragment ${fragment}`);
}

assertIncludes(
  appPage,
  "setAdminAppNotificationReadRevision((revision) => revision + 1);",
  "admin app notification dashboard refresh interval",
);

for (const forbidden of [
  "setInterval(() => {\n      for (const bookingReference of bookingReferences) {\n        void refreshDashboardDriverJobStatusRead(bookingReference);\n      }\n    }, 10 * 1000);\n\n    return () => window.clearInterval(intervalId);\n  }, [activeTab, activeJobDriverStatusReferenceKey]);",
]) {
  assertExcludes(appPage, forbidden, "old dashboard monitor un-switchable auto-refresh interval");
}

for (const fragment of [
  'data-outstanding-payments-review="true"',
  'data-collection-follow-up-queue="true"',
  'data-monthly-statement-preview="true"',
  'data-customer-debug-tools-drawer="true"',
]) {
  assertExcludes(customersPage, fragment, `removed customer mock review fragment ${fragment}`);
}

console.log("Admin dashboard live follow-up fixes guard passed.");
