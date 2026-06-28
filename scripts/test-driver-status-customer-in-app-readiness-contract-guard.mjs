import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-status-customer-in-app-readiness-contract-guard.mjs";
const driverStatusWorkflowPath = "lib/driver-job-status-workflow.ts";
const driverStatusPersistencePath = "lib/driver-job-status-persistence.ts";
const driverStatusRoutePath = "app/api/driver-job/[token]/status/route.ts";
const notificationPersistencePath = "lib/customer-driver-app-notification-persistence.ts";
const adminNotificationRoutePath = "app/api/admin-customer-driver-app-notifications/route.ts";
const customerNotificationRoutePath = "app/api/customer-app-notifications/route.ts";
const channelGuardPath =
  "scripts/test-customer-driver-in-app-notification-channel-contract-guard.mjs";
const customerReadGuardPath =
  "scripts/test-customer-in-app-notification-read-table-rls-evidence-contract-guard.mjs";
const pobAutoStopGuardPath =
  "scripts/test-driver-live-location-pob-auto-stop-readiness-contract-guard.mjs";

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

const [
  ledger,
  preactivationSuite,
  driverStatusWorkflow,
  driverStatusPersistence,
  driverStatusRoute,
  notificationPersistence,
  adminNotificationRoute,
  customerNotificationRoute,
  channelGuard,
  customerReadGuard,
  pobAutoStopGuard,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(driverStatusWorkflowPath, "utf8"),
  readFile(driverStatusPersistencePath, "utf8"),
  readFile(driverStatusRoutePath, "utf8"),
  readFile(notificationPersistencePath, "utf8"),
  readFile(adminNotificationRoutePath, "utf8"),
  readFile(customerNotificationRoutePath, "utf8"),
  readFile(channelGuardPath, "utf8"),
  readFile(customerReadGuardPath, "utf8"),
  readFile(pobAutoStopGuardPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Status to Customer In-App Automatic Notification Readiness Contract Guard Lock",
);

for (const phrase of [
  "Driver Status -> Customer In-App automatic notification fanout is implemented through the verified driver job status route only.",
  "The fanout runs after a persisted `driver_job_status_events` update is accepted for the verified driver job token and queues one fixed safe `customer_app` notification for the same booking/customer scope.",
  "Fanout is best-effort; a customer notification insert failure must not undo or hide the accepted driver status event.",
  "OTW status queues exactly one safe `customer_app` notification scoped to the correct customer/account/booking.",
  "OTW title: `Driver is on the way`.",
  "OTW message: `Your Prestige Limo driver is on the way to pickup.`",
  "OTS status queues exactly one safe `customer_app` notification scoped to the correct customer/account/booking.",
  "OTS title: `Driver has arrived`.",
  "OTS message: `Your Prestige Limo driver is at the pickup location.`",
  "POB status queues exactly one safe `customer_app` notification scoped to the correct customer/account/booking.",
  "POB title: `Passenger on board`.",
  "POB message: `Your trip has started.`",
  "Job Completed status queues exactly one safe `customer_app` notification scoped to the correct customer/account/booking.",
  "Job Completed title: `Trip completed`.",
  "Job Completed message: `Your trip is completed. Thank you for choosing Prestige Limo.`",
  "Status-triggered customer notifications must be template-only.",
  "Status-triggered customer notifications must use the guarded driver status workflow `driver_otw -> ots -> pob -> completed`.",
  "Status-triggered customer notifications must use persisted status evidence and must not rely on local/demo/mock UI state, customer-visible status text, localStorage, or untrusted browser-submitted status history.",
  "Customer-visible reads must stay behind the existing Customer In-App read path and customer/account isolation.",
  "The customer must see only their own booking notification.",
  "Admin/dispatch must be able to see the status-triggered in-app notification/audit trail through approved admin surfaces.",
  "POB must stop any future pre-POB customer-driver quick replies for that job.",
  "No phone number exposure is approved.",
  "No Email, Resend, Telegram, WhatsApp, SMS, SMTP, IMAP, push provider, fallback, scheduler, retry, or blast is approved by this lock.",
  "The Dashboard driver report readout keeps the existing guarded 10-second polling fallback while driver status writes and customer-app fanout happen server-side when the driver presses OTW, OTS, POB, or Job Completed.",
  "Customer-driver quick replies are a later separate lane, not implemented by this guard.",
  "Future customer-to-driver quick reply templates are limited to `I am at the lobby.`, `I am running 5 minutes late.`, `Please wait at pickup point.`, and `I cannot find the car.` unless separately approved.",
  "Future driver-to-customer quick reply templates are limited to `I am on the way.`, `I have arrived.`, `Please meet me at pickup point.`, and `I am waiting nearby.` unless separately approved.",
  "Future quick replies must be in-app only, job-token scoped, customer/account scoped, visible to admin/dispatch, audited, disabled automatically at POB, and must not expose phone numbers.",
  "No free-form customer-driver text is approved until a later explicit approval.",
  "Forbidden fields remain pricing, payout, PayNow, payout preferences, payout comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/GPS coordinates, OTS/photo/storage, calendar, customer/driver phone numbers, customer/driver private contact data, and mock QA/dev archive fields.",
  "This guard adds `scripts/test-driver-status-customer-in-app-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `driver status customer in-app ledger phrase: ${phrase}`);
}

for (const forbidden of [
  "docs/test-only guard for future Driver Status",
  "This lock does not implement runtime notification writes",
  "status-triggered customer notifications are live for all customers",
  "free-form customer-driver chat is approved",
  "quick replies are live now",
  "phone numbers may be exposed",
  "WhatsApp fallback is approved",
  "Telegram fallback is approved",
  "SMS fallback is approved",
  "Email fallback is approved",
  "all customers can see all notifications",
  "pricing may be included",
  "payout may be included",
  "PayNow payout may be included",
  "driver_payout_rules may be included",
  "customer_rates may be included",
  "billing/payment/PDF may be included",
]) {
  assertExcludes(ledgerSection, forbidden, "forbidden status customer in-app activation phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation suite driver status customer in-app readiness registration",
);

for (const relatedGuard of [
  channelGuardPath,
  customerReadGuardPath,
  pobAutoStopGuardPath,
  "scripts/test-driver-reporting-status-contract.mjs",
]) {
  assertIncludes(preactivationSuite, relatedGuard, `related guard registration ${relatedGuard}`);
}

for (const fragment of [
  'export type DriverJobStatusUpdate = "driver_otw" | "ots" | "pob" | "completed"',
  '{ label: "OTW", value: "driver_otw" }',
  '{ label: "OTS", value: "ots" }',
  '{ label: "POB", value: "pob" }',
  '{ label: "Job Completed", value: "completed" }',
  "guardDriverJobStatusTransition",
  "nextStatusIndex !== currentStatusIndex + 1",
]) {
  assertIncludes(driverStatusWorkflow, fragment, `driver status workflow fragment ${fragment}`);
}

for (const fragment of [
  "applyProductionDriverJobStatusUpdate",
  "applyDriverJobStatusUpdateContract",
  "blockedStatusByReason",
  "customer_notification",
  "PATCH(request: Request",
]) {
  assertIncludes(driverStatusRoute, fragment, `driver status route fragment ${fragment}`);
}

for (const fragment of [
  "queueDriverStatusCustomerInAppNotification",
  "customerInAppNotificationSkippedResult",
  "customer_notification: customerNotification",
  "bookingReference: resolvedLink.link.booking_reference",
  "driverJobLinkId: resolvedLink.link.id",
  "status: nextStatus",
  ".from(\"driver_job_status_events\")",
  ".insert(eventRow)",
]) {
  assertIncludes(
    driverStatusPersistence,
    fragment,
    `driver status persistence fanout fragment ${fragment}`,
  );
}

for (const fragment of [
  "customerDriverAppNotificationSurfaces = [\"customer_app\", \"driver_app\"]",
  "driverStatusCustomerInAppTemplates",
  "queueDriverStatusCustomerInAppNotification",
  "loadCustomerAccountReferenceForBooking",
  "insertQuickReplyNotification",
  "event_key: `driver_status_customer_in_app:${bookingReference}:${status}`",
  "workflow_area: \"driver_status_customer_in_app\"",
  "\"driver_status\"",
  "customerAppNotificationsRequireAuthResult",
  "readCustomerAppNotificationsForControlledRuntime",
  "delivery_surface: \"customer_app\"",
  "external_send: false",
  "provider_send: false",
  "safe_title",
  "safe_message",
  "notification_type",
  "workflow_area",
]) {
  assertIncludes(
    notificationPersistence,
    fragment,
    `notification persistence customer in-app fragment ${fragment}`,
  );
}

for (const runtimeTemplate of [
  "Driver is on the way",
  "Your Prestige Limo driver is on the way to pickup.",
  "Driver has arrived",
  "Your Prestige Limo driver is at the pickup location.",
  "Passenger on board",
  "Your trip has started.",
  "Trip completed",
  "Your trip is completed. Thank you for choosing Prestige Limo.",
]) {
  assertIncludes(
    notificationPersistence,
    runtimeTemplate,
    `runtime status-triggered notification template ${runtimeTemplate}`,
  );
}

for (const fragment of [
  "Admin must explicitly choose exactly one channel/action",
  "No provider send is approved for in-app notifications",
  "Customer/driver in-app messages must exclude pricing, payout",
]) {
  assertIncludes(channelGuard, fragment, `customer/driver in-app channel guard fragment ${fragment}`);
}

for (const fragment of [
  "Future evidence must prove customer row isolation so the fake customer sees only the fake `customer_app` notification row and cannot see another customer/account row.",
  "Future evidence must prove anonymous, missing-session, wrong-session, wrong-customer",
  "Customer-safe notification payload fields remain limited",
]) {
  assertIncludes(customerReadGuard, fragment, `customer in-app read guard fragment ${fragment}`);
}

for (const fragment of [
  "Future auto-stop may stop sharing when the resolved assigned job reaches persisted `pob` or `completed`",
  "Future auto-stop must be scoped to the resolved driver job token and assigned job only",
]) {
  assertIncludes(pobAutoStopGuard, fragment, `POB auto-stop guard fragment ${fragment}`);
}

const runtimeSource = `${adminNotificationRoute}\n${customerNotificationRoute}\n${driverStatusRoute}\n${notificationPersistence}`;

for (const forbiddenPattern of [
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']|require\(\s*["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']\s*\)|new\s+Resend|sendMail\s*\(|messages\.send|client\.messages\.create|fetch\s*\(\s*["']https?:\/\/(?:api\.telegram\.org|[^"']*twilio|[^"']*whatsapp)/i,
]) {
  assertExcludes(runtimeSource, forbiddenPattern, "status/customer in-app runtime source");
}

console.log("Driver Status -> Customer In-App automatic notification readiness guard passed");
