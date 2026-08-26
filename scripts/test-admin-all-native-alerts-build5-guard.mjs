import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  helper,
  nativeNotifications,
  adminConfigSource,
  customerConfigSource,
  driverConfigSource,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile("lib/admin-device-push-notification.ts", "utf8"),
  readFile("admin-companion/src/admin-native-notifications.ts", "utf8"),
  readFile("admin-companion/app.json", "utf8"),
  readFile("customer-companion/app.json", "utf8"),
  readFile("driver-companion/app.json", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

const allAdminNativeAlertTypes = [
  "admin_booking_created",
  "admin_urgent_booking_created",
  "new_booking_request",
  "urgent_booking_request",
  "customer_booking_amendment",
  "customer_booking_cancellation",
  "customer_driver_details_acknowledged",
  "customer_to_driver_reply",
  "driver_acknowledged",
  "driver_completed",
  "driver_issue",
  "driver_ots",
  "driver_ots_photo",
  "driver_otw",
  "driver_pob",
  "driver_to_customer_reply",
  "email_booking_amendment",
  "email_booking_cancellation",
  "email_confirmed_booking",
];

function sourceSlice(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `Missing source boundary: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source boundary: ${end}`);
  return source.slice(startIndex, endIndex);
}

const helperEventTypeBoundary = sourceSlice(
  helper,
  "export type AdminDevicePushEventType =",
  "export type AdminDevicePushSender",
);
const nativeAppEventTypeBoundary = sourceSlice(
  nativeNotifications,
  "type AdminNativeNotificationType =",
  "export type AdminNativeNotificationOpenRequest",
);

for (const eventType of allAdminNativeAlertTypes) {
  assert.equal(
    helperEventTypeBoundary.includes(`"${eventType}"`),
    true,
    `Admin native sender must accept ${eventType}`,
  );
  assert.equal(
    nativeAppEventTypeBoundary.includes(`"${eventType}"`),
    true,
    `Admin native app tap parser must accept ${eventType}`,
  );
}

for (const fragment of [
  'body: "Urgent booking request received. Open Dashboard to review.",',
  'title: "Urgent booking request",',
  'booking.short_notice_review_status',
  '"Admin Review Required"',
  '? "urgent_booking_request"',
  ': "new_booking_request"',
  "nativeSubscriptionCount === 1",
  'open_target: "/"',
  'title: "Prestige Limo Ops"',
]) {
  assert.equal(helper.includes(fragment), true, `Admin all-alert helper must include ${fragment}`);
}

const admin = JSON.parse(adminConfigSource).expo;
const customer = JSON.parse(customerConfigSource).expo;
const driver = JSON.parse(driverConfigSource).expo;
assert.equal(admin.ios.buildNumber, "6", "Admin acceptance repair requires Build 6");
assert.equal(customer.ios.buildNumber, "9", "Customer Build 9 must remain unchanged");
assert.equal(driver.ios.buildNumber, "16", "Driver Build 16 must remain unchanged");

for (const phrase of [
  "Admin All Native Alerts And Badge Build 5",
  "New Job",
  "Urgent Job",
  "Job Changed",
  "Job Cancelled",
  "one alert and one badge increment",
  "Customer Build 9 and Driver Build 16 remain unchanged",
  "No real notification",
]) {
  assert.equal(ledger.includes(phrase), true, `Implementation ledger must include ${phrase}`);
}

assert.equal(
  preactivationSuite.includes("scripts/test-admin-all-native-alerts-build5-guard.mjs"),
  true,
  "Admin all-native-alert Build 5 guard must be registered",
);

console.log("Admin all-native-alert Build 5 guard passed.");
