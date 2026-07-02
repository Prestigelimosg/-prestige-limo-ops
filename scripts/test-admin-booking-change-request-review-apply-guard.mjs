import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminPagePath = "app/page.tsx";
const customerRoutePath = "app/api/customer-booking-change-requests/route.ts";
const adminNotificationPath = "lib/admin-app-notification-persistence.ts";

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

const [adminPage, customerRoute, adminNotification] = await Promise.all([
  readFile(adminPagePath, "utf8"),
  readFile(customerRoutePath, "utf8"),
  readFile(adminNotificationPath, "utf8"),
]);

for (const fragment of [
  "AdminBookingChangeRequestReviewAction",
  "adminAppNotificationChangeRequestContext",
  "adminBookingChangeRequestMergeIntoBookingForm",
  "handleAdminBookingChangeRequestReview",
  "handleAdminBookingChangeRequestReject",
  "handleAdminBookingChangeRequestApply",
  'data-admin-booking-change-request-review-actions="true"',
  'data-admin-booking-change-request-review-action="review"',
  'data-admin-booking-change-request-review-action="reject"',
  'data-admin-booking-change-request-review-action="apply"',
  "Apply + Cal",
]) {
  assertIncludes(adminPage, fragment, `admin amendment review UI ${fragment}`);
}

for (const fragment of [
  'new URLSearchParams({ limit: "200" })',
  'fetch(`/api/admin-bookings?${params.toString()}`',
  '"x-prestige-admin-purpose": "admin-booking-persistence"',
  'method: "PATCH"',
  "buildAdminBookingPersistencePayload",
  "autoSyncSavedBookingGoogleCalendar(updatedBooking)",
  'updateAdminAppNotificationStatus(notificationId, "archived")',
  "Google Calendar auto-synced on the same booking reference",
]) {
  assertIncludes(adminPage, fragment, `admin amendment apply path ${fragment}`);
}

for (const fragment of [
  "loadBlockingCustomerInvoicesForAmendment",
  "adminCustomerInvoiceBlocksBookingAmendment",
  "already exists. Use adjustment, credit note, or new invoice review",
  "Booking, invoice, and Google Calendar were not changed.",
]) {
  assertIncludes(adminPage, fragment, `admin amendment invoice safety ${fragment}`);
}

for (const fragment of [
  "adminBookingChangeRequestServiceTypeChanged",
  "Service Change Price Review required for",
  "Confirm price review in Dispatch, then use Update + Cal",
  "Amendment notification remains pending.",
]) {
  assertIncludes(adminPage, fragment, `admin amendment service-type safety ${fragment}`);
}

const customerRoutePostBlock = customerRoute.slice(customerRoute.indexOf("export async function POST"));

for (const forbidden of [
  "updateAdminBooking(",
  "createAdminBooking(",
  "syncAdminBookingToGoogleCalendar",
  "adminBookingChangeRequestMergeIntoBookingForm",
  "loadBlockingCustomerInvoicesForAmendment",
  "sendEmail",
  "sendSms",
  "sendWhatsApp",
  "sendTelegram",
  "stripe",
  "payout",
  "driver_live_location",
]) {
  assertExcludes(customerRoutePostBlock, forbidden, `customer amendment route forbidden ${forbidden}`);
}

const adminChangeHelper = sliceBetween(
  adminNotification,
  "export async function createCustomerBookingChangeRequestAdminAppNotification",
  "export async function updateAdminAppNotificationStatus",
);

for (const fragment of [
  'workflow_area: "customer_booking_change_request"',
  'delivery_surface: "admin_app"',
  "Load the booking, review the requested values, then use Update + Cal only after approval.",
]) {
  assertIncludes(adminChangeHelper, fragment, `existing admin notification helper ${fragment}`);
}

for (const forbidden of [
  "contact_email",
  "contact_phone",
  "customer_price",
  "driver_payout",
  "invoice",
  "payment",
  "paynow",
  "token",
  "parser",
  "telegram",
  "whatsapp",
  "sms",
]) {
  assertExcludes(
    adminChangeHelper.toLowerCase(),
    forbidden,
    `admin notification helper must not leak ${forbidden}`,
  );
}

console.log("Admin booking change request review/apply guard passed.");
