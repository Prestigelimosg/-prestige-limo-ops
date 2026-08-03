import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, customerPage, persistence, tripUpdates, route, ledger, bookingBrowser, appBrowser] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("app/my-bookings/page.tsx", "utf8"),
  readFile("lib/customer-driver-app-notification-persistence.ts", "utf8"),
  readFile("lib/customer-portal-trip-updates-adapter.ts", "utf8"),
  readFile("app/api/customer-driver-quick-replies/route.ts", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-booking-ui-browser.mjs", "utf8"),
  readFile("scripts/test-app-smoke-browser.mjs", "utf8"),
]);

for (const expected of [
  '"customer_driver_details_acknowledged"',
  'delivery_surface: "customer_app"',
  'direction: "customer_to_admin"',
  'safe_title: "Driver details acknowledged"',
  'safe_message: "Driver details acknowledged."',
  'workflow_area: "customer_driver_details_acknowledgements"',
  "assertCustomerDriverDetailsReadyForAcknowledgement",
  "existingCustomerDriverDetailsAcknowledgement",
]) {
  assert.ok(persistence.includes(expected), `acknowledgement persistence must retain ${expected}`);
}
const acknowledgementInput = persistence.slice(
  persistence.indexOf("function customerDriverDetailsAcknowledgementInput"),
  persistence.indexOf("function existingCustomerDriverDetailsAcknowledgement"),
);
assert.ok(
  !acknowledgementInput.includes('delivery_surface: "driver_app"'),
  "driver-details acknowledgement must never be written to the driver surface",
);

for (const expected of [
  "data-customer-driver-details-acknowledgement=",
  "Acknowledge driver details",
  "Acknowledging...",
  "Acknowledged",
  'result?.direction !== "customer_to_admin"',
  "driverDetailsSentUpdate",
  "latestDriverDetailsDeliveryUpdate",
  "driverDetailsAcknowledgedUpdate",
  "driverDetailsAcknowledgedTime",
  "compactSingaporeTimeLabel",
  "loadTripUpdatesForBooking(booking)",
]) {
  assert.ok(customerPage.includes(expected), `customer acknowledgement UI must retain ${expected}`);
}

assert.ok(
  customerPage.indexOf("data-customer-portal-driver-details-card=") <
    customerPage.indexOf("data-customer-driver-details-acknowledgement="),
  "customer acknowledgement must stay inside the established driver-details card",
);
assert.ok(
  customerPage.indexOf("data-customer-driver-details-acknowledgement=") <
    customerPage.indexOf("data-customer-driver-quick-replies="),
  "customer acknowledgement must remain separate from the driver-visible quick replies",
);

for (const expected of [
  "workflowArea: string",
  "workflow_area",
]) {
  assert.ok(tripUpdates.includes(expected), `customer trip updates must preserve ${expected}`);
}

for (const expected of [
  "bookingDriverDetailsDeliveryStatuses",
  "loadBookingDriverDetailsDeliveryStatuses",
  "formatAdminBookingDriverDetailsStatusTime",
  'data-bookings-driver-details-status={bookingId}',
  'data-bookings-driver-details-status-value=',
  '"Detail sent"',
  '"Acknowledged"',
  'workflow_area === "customer_app_updates"',
  'workflow_area === "customer_driver_details_acknowledgements"',
]) {
  assert.ok(adminPage.includes(expected), `Bookings status indicator must retain ${expected}`);
}

assert.equal(
  (route.match(/export async function POST/g) || []).length,
  1,
  "the established customer quick-reply route must remain the only POST lane",
);
assert.equal(
  (route.match(/export async function PATCH/g) || []).length,
  0,
  "customer acknowledgement must not activate a second PATCH lane",
);
assert.ok(
  !/setInterval[\s\S]{0,500}customer_driver_details_acknowledg/.test(adminPage),
  "Bookings acknowledgement status must not add a polling timer",
);
assert.ok(
  ledger.includes("### Customer Driver Details Explicit Acknowledgement"),
  "the implementation ledger must record the explicit acknowledgement lane",
);
for (const expected of [
  '"Detail sent 09:01"',
  '"Acknowledged 09:02"',
  'request.method !== "GET"',
  "__prestigeCustomerDriverAppNotifications",
]) {
  assert.ok(bookingBrowser.includes(expected), `booking browser evidence must retain ${expected}`);
}
for (const expected of [
  '"Acknowledge driver details"',
  '"Acknowledged 09:02"',
  'template_key: "customer_driver_details_acknowledged"',
  'direction: "customer_to_admin"',
  "__customerPortalDriverDetailsAcknowledgementCalls",
]) {
  assert.ok(appBrowser.includes(expected), `customer browser evidence must retain ${expected}`);
}

console.log("Customer driver-details acknowledgement guard passed.");
