import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-in-app-notification-admin-button-guard.mjs";

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
  "### Driver In-App Notification Compact Admin Button Lock",
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
const driverInAppAction = blockBetween(
  appPage,
  "async function sendAdminCustomerDriverDetailsDriverInAppNotification()",
  "const adminCustomerDriverDetailsEmailDisabledSendStateMatchesReference",
);

for (const phrase of [
  "This is a bounded runtime implementation in the existing Driver Dispatch section.",
  "It reuses the existing compact Driver Dispatch action row and does not add a new UI sector, card, provider-send panel, route, helper, or shim.",
  "The compact button label is `Send Driver In-App`.",
  "The button is placed beside the existing Driver Dispatch `Edit` and `Copy` controls.",
  "The button is admin-selected only and sends no automatic fallback, no automatic multi-channel blast, and no provider message.",
  "The button requires a loaded saved booking reference and an active saved driver job link for that booking.",
  "The driver target is the currently selected booking's active driver job link; no free-form driver selection is introduced.",
  "The first message template is fixed: safe title `Dispatch update` and safe message `Please review this assigned trip in your Driver Job page.`",
  "The created notification uses `delivery_surface: \"driver_app\"`, `notification_type: \"trip_update\"`, `notification_status: \"queued\"`, `priority: \"normal\"`, and `workflow_area: \"driver_app_updates\"`.",
  "The click action uses the existing `POST /api/admin-customer-driver-app-notifications` route and existing `lib/customer-driver-app-notification-persistence.ts` boundary.",
  "The route remains behind the existing admin/dispatcher boundary and admin persistence gate.",
  "Customer in-app notification write/read remains blocked until customer auth/portal proof is separately approved.",
  "No free-text message body, template menu, batch send, retry, polling, scheduler, fallback, or blast is introduced.",
  "No Email, Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live-location, provider-send, or external-call path is introduced.",
  "Guard: `scripts/test-driver-in-app-notification-admin-button-guard.mjs`; suite registration in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `driver in-app admin button ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation suite driver in-app admin button guard registration",
);

for (const fragment of [
  'const adminCustomerDriverAppNotificationsApiPath =\n  "/api/admin-customer-driver-app-notifications";',
  "type AdminCustomerDriverDetailsDriverInAppActionState",
  "adminCustomerDriverDetailsDriverInAppFallbackState",
  "sendAdminCustomerDriverDetailsDriverInAppNotification",
  "activeAdminDriverJobLink?.id",
  "adminCustomerDriverDetailsDriverInAppCanSend",
  'data-admin-customer-driver-details-driver-in-app-send-action="true"',
  'data-admin-customer-driver-details-driver-in-app-send-delivery-surface',
  'data-admin-customer-driver-details-driver-in-app-send-external-send="false"',
  'data-admin-customer-driver-details-driver-in-app-send-no-provider-send="true"',
  'data-admin-customer-driver-details-driver-in-app-send-status="true"',
  "Send Driver In-App",
]) {
  assertIncludes(appPage, fragment, `driver in-app admin button app fragment: ${fragment}`);
}

assert.equal(
  driverDispatchUi.indexOf('data-copy-edit-button="driverDispatch"') <
    driverDispatchUi.indexOf('data-copy-copy-button="driverDispatch"') &&
    driverDispatchUi.indexOf('data-copy-copy-button="driverDispatch"') <
      driverDispatchUi.indexOf("Send Driver In-App"),
  true,
  "Driver In-App button must stay in the existing compact Driver Dispatch action row after Edit/Copy.",
);

assertExcludes(
  customerCopyUi,
  "Send Driver In-App",
  "Customer Copy UI must not contain the Driver In-App button",
);

for (const fragment of [
  'body: JSON.stringify({',
  'booking_reference: bookingReference',
  'delivery_surface: "driver_app"',
  'driver_job_link_id: driverJobLinkId',
  'notification_status: "queued"',
  'notification_type: "trip_update"',
  'priority: "normal"',
  'safe_title: "Dispatch update"',
  'safe_message: "Please review this assigned trip in your Driver Job page."',
  'workflow_area: "driver_app_updates"',
  '"x-prestige-admin-purpose": adminLegacyDataPurpose',
  'method: "POST"',
]) {
  assertIncludes(driverInAppAction, fragment, `driver in-app action payload fragment: ${fragment}`);
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
  assertExcludes(driverInAppAction, fragment, "driver in-app action forbidden content");
}

assertExcludes(
  driverInAppAction,
  /resend|sendMail|api\.telegram\.org|whatsapp|twilio|sms|maps\.googleapis|onemap|FlightAware|AeroAPI/i,
  "driver in-app action provider/external-call surface",
);

assertExcludes(
  driverDispatchUi,
  /<div[^>]*(?:giant|provider-send|duplicate)|template menu|textarea[^>]*driver-in-app/i,
  "driver in-app compact UI must not add a giant card, provider panel, free-text body, or template menu",
);

console.log("Driver In-App Notification admin button guard passed");
