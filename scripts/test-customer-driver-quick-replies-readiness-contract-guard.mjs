import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-customer-driver-quick-replies-readiness-contract-guard.mjs";
const channelGuardPath =
  "scripts/test-customer-driver-in-app-notification-channel-contract-guard.mjs";
const statusCustomerInAppGuardPath =
  "scripts/test-driver-status-customer-in-app-readiness-contract-guard.mjs";
const customerReadGuardPath =
  "scripts/test-customer-in-app-notification-read-table-rls-evidence-contract-guard.mjs";
const pobAutoStopGuardPath =
  "scripts/test-driver-live-location-pob-auto-stop-readiness-contract-guard.mjs";
const notificationPersistencePath = "lib/customer-driver-app-notification-persistence.ts";
const adminNotificationRoutePath = "app/api/admin-customer-driver-app-notifications/route.ts";
const customerNotificationRoutePath = "app/api/customer-app-notifications/route.ts";
const driverNotificationRoutePath = "app/api/driver-job/[token]/notifications/route.ts";
const driverStatusWorkflowPath = "lib/driver-job-status-workflow.ts";

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
  channelGuard,
  statusCustomerInAppGuard,
  customerReadGuard,
  pobAutoStopGuard,
  notificationPersistence,
  adminNotificationRoute,
  customerNotificationRoute,
  driverNotificationRoute,
  driverStatusWorkflow,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(channelGuardPath, "utf8"),
  readFile(statusCustomerInAppGuardPath, "utf8"),
  readFile(customerReadGuardPath, "utf8"),
  readFile(pobAutoStopGuardPath, "utf8"),
  readFile(notificationPersistencePath, "utf8"),
  readFile(adminNotificationRoutePath, "utf8"),
  readFile(customerNotificationRoutePath, "utf8"),
  readFile(driverNotificationRoutePath, "utf8"),
  readFile(driverStatusWorkflowPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Customer/Driver Quick Replies Readiness Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for future Customer/Driver Quick Replies.",
  "This lock does not implement runtime quick replies, notification writes, DB writes, provider sends, Email/Telegram/WhatsApp/SMS, free-form chat, auth/session changes, env changes, deploys, GPS/location activation, billing/payment/PDF/payout, or production activation.",
  "Future Customer -> Driver quick replies are limited to exactly four fixed templates: `I am at the lobby.`, `I am running 5 minutes late.`, `Please wait at pickup point.`, and `I cannot find the car.`",
  "Future Driver -> Customer quick replies are limited to exactly four fixed templates: `I am on the way.`, `I have arrived.`, `Please meet me at pickup point.`, and `I am waiting nearby.`",
  "Quick replies must be in-app only.",
  "Quick replies must be job-token scoped for the driver side.",
  "Quick replies must be customer/account scoped for the customer side.",
  "Quick replies must be scoped to the correct booking and must not cross bookings, customers, accounts, drivers, or driver job links.",
  "Quick replies must be visible to admin/dispatch through approved admin surfaces.",
  "Quick replies must be audited with safe operational metadata only.",
  "Quick replies must be disabled automatically at POB for that job.",
  "Quick replies must not expose customer or driver phone numbers, email addresses, chat IDs, device identifiers, or private contact details.",
  "No free-form customer-driver text is approved until a later explicit owner approval.",
  "No provider send is approved for quick replies; quick replies are not Email, Resend, Telegram, WhatsApp, SMS, SMTP, IMAP, push provider, fallback, scheduler, retry, polling, or blast.",
  "Future Customer -> Driver quick replies must be visible only through the driver job token notification/read path or a separately approved equivalent driver-token-scoped in-app path.",
  "Future Driver -> Customer quick replies must be visible only through the customer in-app read path and customer/account isolation.",
  "Future quick-reply evidence must prove customer-to-driver send/read, driver-to-customer send/read, admin/dispatch visibility, audit proof, wrong-customer blocked, wrong-driver blocked, wrong-booking blocked, anonymous blocked, post-POB blocked, cleanup/zero-row proof, and rollback disabled proof.",
  "Forbidden fields remain pricing, payout, PayNow, payout preferences, payout comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/GPS coordinates, OTS/photo/storage, calendar, customer/driver phone numbers, customer/driver private contact data, chat IDs, device identifiers, and mock QA/dev archive fields.",
  "This guard adds `scripts/test-customer-driver-quick-replies-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `quick replies ledger phrase: ${phrase}`);
}

for (const forbidden of [
  "runtime quick replies are active now",
  "quick replies are live now",
  "free-form customer-driver chat is approved",
  "phone numbers may be exposed",
  "WhatsApp quick replies are approved",
  "Telegram quick replies are approved",
  "SMS quick replies are approved",
  "Email quick replies are approved",
  "all customers can message all drivers",
  "driver can see every customer message",
  "customer can see every driver message",
  "quick replies may continue after POB",
  "pricing may be included",
  "payout may be included",
  "PayNow payout may be included",
  "driver_payout_rules may be included",
  "customer_rates may be included",
  "billing/payment/PDF may be included",
]) {
  assertExcludes(ledgerSection, forbidden, "forbidden quick replies activation phrase");
}

for (const registeredGuard of [
  guardScript,
  channelGuardPath,
  statusCustomerInAppGuardPath,
  customerReadGuardPath,
  pobAutoStopGuardPath,
]) {
  assertIncludes(preactivationSuite, registeredGuard, `preactivation guard ${registeredGuard}`);
}

for (const fragment of [
  "Admin must explicitly choose exactly one channel/action",
  "No provider send is approved for in-app notifications",
  "Customer/driver in-app messages must exclude pricing, payout",
]) {
  assertIncludes(channelGuard, fragment, `in-app channel guard fragment ${fragment}`);
}

for (const fragment of [
  "POB must stop any future pre-POB customer-driver quick replies for that job.",
  "Customer-driver quick replies are a later separate lane, not implemented by this guard.",
  "Future quick replies must be in-app only, job-token scoped, customer/account scoped, visible to admin/dispatch, audited, disabled automatically at POB, and must not expose phone numbers.",
]) {
  assertIncludes(statusCustomerInAppGuard, fragment, `status customer in-app guard fragment ${fragment}`);
}

for (const fragment of [
  "Future evidence must prove customer row isolation so the fake customer sees only the fake `customer_app` notification row and cannot see another customer/account row.",
  "Future evidence must prove anonymous, missing-session, wrong-session, wrong-customer",
  "Customer-safe notification payload fields remain limited",
]) {
  assertIncludes(customerReadGuard, fragment, `customer read isolation guard fragment ${fragment}`);
}

for (const fragment of [
  "Future auto-stop may stop sharing when the resolved assigned job reaches persisted `pob` or `completed`",
  "Future auto-stop must be scoped to the resolved driver job token and assigned job only",
]) {
  assertIncludes(pobAutoStopGuard, fragment, `POB auto-stop guard fragment ${fragment}`);
}

for (const fragment of [
  'export type DriverJobStatusUpdate = "driver_otw" | "ots" | "pob" | "completed"',
  '{ label: "POB", value: "pob" }',
  "guardDriverJobStatusTransition",
]) {
  assertIncludes(driverStatusWorkflow, fragment, `driver status workflow fragment ${fragment}`);
}

for (const fragment of [
  'customerDriverAppNotificationSurfaces = ["customer_app", "driver_app"]',
  "customer_driver_app_notification_outbox",
  "driver_job_link_id",
  "safe_title",
  "safe_message",
  "safe_context",
  "toSafeRecord",
]) {
  assertIncludes(notificationPersistence, fragment, `notification persistence fragment ${fragment}`);
}

for (const fragment of [
  "loadDriverAppNotificationsForToken",
  "updateDriverAppNotificationStatusForToken",
  'delivery_surface: "driver_app"',
]) {
  assertIncludes(driverNotificationRoute, fragment, `driver notification route fragment ${fragment}`);
}

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  "createCustomerDriverAppNotification",
  "loadCustomerDriverAppNotifications",
]) {
  assertIncludes(adminNotificationRoute, fragment, `admin notification route fragment ${fragment}`);
}

for (const fragment of [
  "readCustomerAppNotificationsForControlledRuntime",
  "readCustomerAppNotificationsForStagingEvidence",
  "customerAppNotificationsRequireAuthResult",
]) {
  assertIncludes(customerNotificationRoute, fragment, `customer notification route fragment ${fragment}`);
}

const runtimeSource = `${notificationPersistence}\n${adminNotificationRoute}\n${customerNotificationRoute}\n${driverNotificationRoute}`;

for (const template of [
  "I am at the lobby.",
  "I am running 5 minutes late.",
  "Please wait at pickup point.",
  "I cannot find the car.",
  "I am on the way.",
  "I have arrived.",
  "Please meet me at pickup point.",
  "I am waiting nearby.",
]) {
  assertExcludes(runtimeSource, template, "quick reply template must not be live in runtime yet");
}

for (const forbiddenPattern of [
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']|require\(\s*["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']\s*\)|new\s+Resend|sendMail\s*\(|messages\.send|client\.messages\.create|fetch\s*\(\s*["']https?:\/\/(?:api\.telegram\.org|[^"']*twilio|[^"']*whatsapp)/i,
  /textarea|freeform|free-form|chat_box|chatBox|messageComposer/i,
]) {
  assertExcludes(runtimeSource, forbiddenPattern, "quick replies runtime source");
}

console.log("Customer/Driver Quick Replies readiness contract guard passed");
