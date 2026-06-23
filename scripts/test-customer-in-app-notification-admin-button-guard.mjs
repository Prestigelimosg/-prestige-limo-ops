import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-in-app-notification-admin-button-guard.mjs";

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

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing source block start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing source block end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end + endFragment.length);
}

const [appPage, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Customer In-App Notification Compact Admin Button Lock",
);
const customerCopyUi = sectionBetween(
  appPage,
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-dispatch-workflow-step="driver-dispatch-copy"',
);
const driverDispatchUi = sectionBetween(
  appPage,
  'data-dispatch-workflow-step="driver-dispatch-copy"',
  'data-dispatch-workflow-step="driver-job-link"',
);
const customerInAppAction = blockBetween(
  appPage,
  "async function sendAdminCustomerDriverDetailsCustomerInAppNotification()",
  "async function sendAdminCustomerDriverDetailsDriverInAppNotification()",
);

for (const phrase of [
  "This is a bounded runtime implementation in the existing Customer Copy section after completed Customer In-App Notification read/table evidence.",
  "It reuses the existing compact Customer Copy action row and does not add a new UI sector, card, provider-send panel, route, helper, or shim.",
  "The compact visible button label is `Send In-App` with an accessible Customer In-App label.",
  "The button is placed beside the existing Customer Copy `Review Email`, `Review WhatsApp`, and `Review SMS` controls.",
  "The button is admin-selected only and sends no automatic fallback, no automatic multi-channel blast, and no provider message.",
  "The button requires a loaded saved booking reference and complete customer copy readiness for the current booking.",
  "The customer target is the currently selected booking's customer app notification surface; no free-form customer selection is introduced.",
  "The first message template is fixed: safe title `Driver details ready` and safe message `Your Prestige Limo driver details are ready in your customer app.`",
  "The created notification uses `delivery_surface: \"customer_app\"`, `notification_type: \"trip_update\"`, `notification_status: \"queued\"`, `priority: \"normal\"`, and `workflow_area: \"customer_app_updates\"`.",
  "The click action uses the existing `POST /api/admin-customer-driver-app-notifications` route and existing `lib/customer-driver-app-notification-persistence.ts` boundary.",
  "The route remains behind the existing admin/dispatcher boundary and admin persistence gate.",
  "No free-text message body, template menu, batch send, retry, polling, scheduler, fallback, or blast is introduced.",
  "No Email, Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, provider-send, or external-call path is introduced.",
  "Customer read remains gated by `/api/customer-app-notifications`; this button only queues the approved safe customer_app notification row.",
  "Guard: `scripts/test-customer-in-app-notification-admin-button-guard.mjs`; suite registration in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `customer in-app admin button ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation suite customer in-app admin button guard registration",
);

for (const fragment of [
  'const adminCustomerDriverAppNotificationsApiPath =\n  "/api/admin-customer-driver-app-notifications";',
  "type AdminCustomerDriverDetailsCustomerInAppActionState",
  "adminCustomerDriverDetailsCustomerInAppFallbackState",
  "sendAdminCustomerDriverDetailsCustomerInAppNotification",
  "dispatchReleaseCustomerCopyReady",
  "adminCustomerDriverDetailsCustomerInAppCanSend",
  'data-admin-customer-driver-details-customer-in-app-send-action="true"',
  'data-admin-customer-driver-details-customer-in-app-send-delivery-surface',
  'data-admin-customer-driver-details-customer-in-app-send-external-send="false"',
  'data-admin-customer-driver-details-customer-in-app-send-no-provider-send="true"',
  'data-admin-customer-driver-details-customer-in-app-send-status="true"',
  "Send In-App",
]) {
  assertIncludes(appPage, fragment, `customer in-app admin button app fragment: ${fragment}`);
}

assert.equal(
  customerCopyUi.indexOf("Review Email") <
    customerCopyUi.indexOf("Review WhatsApp") &&
    customerCopyUi.indexOf("Review WhatsApp") < customerCopyUi.indexOf("Review SMS") &&
    customerCopyUi.indexOf("Review SMS") <
      customerCopyUi.indexOf('data-admin-customer-driver-details-customer-in-app-send-action="true"'),
  true,
  "Customer In-App button must stay in the existing compact Customer Copy action row after review controls.",
);

assertExcludes(
  driverDispatchUi,
  'data-admin-customer-driver-details-customer-in-app-send-action="true"',
  "Driver Dispatch UI must not contain the Customer In-App button",
);

for (const fragment of [
  'body: JSON.stringify({',
  "booking_reference: bookingReference",
  'delivery_surface: "customer_app"',
  "driver_job_link_id: null",
  'event_key: `${bookingReference}:customer-in-app:driver-details-ready`',
  'notification_status: "queued"',
  'notification_type: "trip_update"',
  'priority: "normal"',
  'safe_title: "Driver details ready"',
  'safe_message: "Your Prestige Limo driver details are ready in your customer app."',
  'workflow_area: "customer_app_updates"',
  '"x-prestige-admin-purpose": adminLegacyDataPurpose',
  'method: "POST"',
]) {
  assertIncludes(customerInAppAction, fragment, `customer in-app action payload fragment: ${fragment}`);
}

for (const fragment of [
  "customer_price",
  "pricing",
  "billing",
  "invoice",
  "payment",
  "pdf",
  "payout",
  "PayNow",
  "driver_payout_rules",
  "customer_rates",
  "internal note",
  "admin note",
  "parser",
  "debug",
  "secret",
  "token",
  "raw provider",
  "Save Booking",
  "/api/admin-saved-bookings",
  "live location",
]) {
  assertExcludes(customerInAppAction, fragment, "customer in-app action forbidden content");
}

assertExcludes(
  customerInAppAction,
  /resend|sendMail|api\.telegram\.org|whatsapp|twilio|sms|maps\.googleapis|onemap|FlightAware|AeroAPI/i,
  "customer in-app action provider/external-call surface",
);

assertExcludes(
  customerCopyUi,
  /<div[^>]*(?:giant|provider-send|duplicate)|template menu|textarea[^>]*customer-in-app/i,
  "customer in-app compact UI must not add a giant card, provider panel, free-text body, or template menu",
);

console.log("Customer In-App Notification admin button guard passed");
