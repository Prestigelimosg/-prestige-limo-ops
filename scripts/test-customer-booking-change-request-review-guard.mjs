import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = "app/api/customer-booking-change-requests/route.ts";
const portalPath = "app/my-bookings/page.tsx";
const portalAdapterPath = "lib/customer-portal-booking-change-request-adapter.ts";
const adminPagePath = "app/page.tsx";
const adminNotificationPath = "lib/admin-app-notification-persistence.ts";
const savedBookingsReadPath = "lib/customer-saved-bookings-read.ts";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must not include ${fragment}.`);
}

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker after ${start}: ${end}`);

  return source.slice(startIndex, endIndex);
}

const [
  route,
  portal,
  portalAdapter,
  adminPage,
  adminNotification,
  savedBookingsRead,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(portalPath, "utf8"),
  readFile(portalAdapterPath, "utf8"),
  readFile(adminPagePath, "utf8"),
  readFile(adminNotificationPath, "utf8"),
  readFile(savedBookingsReadPath, "utf8"),
]);

for (const fragment of [
  "resolveCustomerSavedBookingsBoundaryForPurpose",
  "customerBookingChangePurposeHeader",
  "customer-booking-change-request",
  "loadCustomerSavedBookings",
  "bookingIsReadOnly",
  "sendAdminBookingChangeRequestEmailAlert",
  "createAdminReviewNoticeForBookingChangeRequest",
  "createCustomerBookingChangeRequestAdminAppNotification",
  "calendar_update: false",
  "crm_update: false",
  "external_send: false",
  "Booking change requests can be submitted only from the customer portal.",
]) {
  assertIncludes(route, fragment, `change request route ${fragment}`);
}

for (const blockedMethod of [
  "export async function GET()",
  "export async function PUT()",
  "export async function PATCH()",
  "export async function DELETE()",
]) {
  assertIncludes(route, blockedMethod, `change request route blocked ${blockedMethod}`);
}

const routePostBlock = route.slice(route.indexOf("export async function POST"));

for (const forbidden of [
  "createAdminBooking(",
  "updateAdminBooking(",
  "syncAdminBookingToGoogleCalendar",
  "sendAdminNewBookingEmailAlert",
  "sendAdminNewBookingDevicePushAlert",
  "sendAdminTelegram",
  "sendSms",
  "sendWhatsApp",
  "stripe",
  "payout",
  "driver_live_location",
  "provider_send",
]) {
  assertExcludes(routePostBlock, forbidden, `customer change route forbidden ${forbidden}`);
}

const routeNoticeBlock = sliceBetween(
  route,
  "async function createAdminReviewNoticeForBookingChangeRequest",
  "export async function GET",
);

assertIncludes(
  routeNoticeBlock,
  "sendAdminBookingChangeRequestEmailAlert(alertInput)",
  "customer change route admin Email alert first",
);
assertIncludes(
  routeNoticeBlock,
  "createCustomerBookingChangeRequestAdminAppNotification(alertInput)",
  "customer change route admin app notification second",
);
assert.equal(
  routeNoticeBlock.indexOf("sendAdminBookingChangeRequestEmailAlert(alertInput)") <
    routeNoticeBlock.indexOf("createCustomerBookingChangeRequestAdminAppNotification(alertInput)"),
  true,
  "Customer amendment route must attempt admin Email before admin app notification.",
);
assertIncludes(
  routeNoticeBlock,
  "Customer amendment intake must not fail because the admin Email alert channel is unavailable.",
  "customer change route email failure safety",
);

assertIncludes(
  savedBookingsRead,
  "export function resolveCustomerSavedBookingsBoundaryForPurpose",
  "saved bookings boundary purpose helper",
);
assertIncludes(
  savedBookingsRead,
  "return resolveCustomerSavedBookingsBoundaryForPurpose(request);",
  "saved bookings route default purpose remains unchanged",
);

for (const fragment of [
  "submitCustomerPortalBookingChangeRequest",
  "data-customer-portal-change-request-form",
  "data-customer-portal-submit-change-request",
  "booking and calendar are unchanged until Prestige confirms",
]) {
  assertIncludes(portal, fragment, `customer portal change request fragment ${fragment}`);
}

for (const fragment of [
  "/api/customer-booking-change-requests",
  '"x-prestige-customer-purpose": "customer-booking-change-request"',
  'credentials: "same-origin"',
  'cache: "no-store"',
  "calendarUpdate: false",
  "crmUpdate: false",
  "externalSend: false",
]) {
  assertIncludes(portalAdapter, fragment, `customer portal change request adapter ${fragment}`);
}

assertExcludes(portal, "fetch(", "customer portal page raw fetch");
assertExcludes(route, "notification_id", "customer route must not expose internal admin notification id");

const adminChangeHelper = sliceBetween(
  adminNotification,
  "export async function createCustomerBookingChangeRequestAdminAppNotification",
  "export async function updateAdminAppNotificationStatus",
);

for (const fragment of [
  'notification_type: "booking_workflow"',
  'safe_title: "Customer booking change request"',
  'workflow_area: "customer_booking_change_request"',
  "Review the requested values, then choose Accept + Cal, Reject, or Dismiss.",
  'delivery_surface: "admin_app"',
  'source_surface: "system"',
]) {
  assertIncludes(adminChangeHelper, fragment, `admin change notification helper ${fragment}`);
}

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
  "stripe",
]) {
  assertExcludes(
    adminChangeHelper.toLowerCase(),
    forbidden,
    `admin change notification helper forbidden ${forbidden}`,
  );
}

for (const fragment of [
  "safe_context?: Record<string, unknown> | null",
  "adminAppNotificationChangeRequestRows",
  "customer_booking_change_request",
  "data-admin-app-notification-change-request",
]) {
  assertIncludes(adminPage, fragment, `admin inbox change request render ${fragment}`);
}

console.log("Customer booking change request review guard passed.");
