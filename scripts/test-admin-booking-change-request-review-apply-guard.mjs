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
  "adminBookingChangeRequestIsCancellation",
  "adminBookingChangeRequestKindLabel",
  "adminBookingChangeRequestSummaryRows",
  "adminBookingChangeRequestMergeIntoBookingForm",
  "buildAdminBookingCancellationRequestApplyPayload",
  "handleAdminBookingChangeRequestCancelDecision",
  "handleAdminBookingChangeRequestCloseDecision",
  "handleAdminBookingChangeRequestApply",
  'data-admin-booking-change-request-review-actions="true"',
  'data-admin-booking-change-request-review-action="accept"',
  'data-admin-booking-change-request-review-action="reject"',
  'data-admin-booking-change-request-review-action="dismiss"',
  "Accept + Cal",
  'activeChangeRequestAction === "reject" ? "Rejecting..." : "Reject"',
  "Dismiss",
  'data-admin-app-notification-change-request-summary="true"',
  'data-admin-app-notification-clear="safe-inbox-row-only"',
  'aria-label="Clear only this admin notification inbox row"',
  'handleAdminAppNotificationStatusUpdate(notificationId, "read")',
]) {
  assertIncludes(adminPage, fragment, `admin amendment review UI ${fragment}`);
}

for (const forbidden of [
  'data-admin-booking-change-request-review-action="review"',
  'data-admin-booking-change-request-review-action="apply"',
  "Apply + Cal",
  "Cancel + Cal",
  "Reject + Cal",
  "handleAdminBookingChangeRequestReview",
  "handleAdminBookingChangeRequestReject",
]) {
  assertExcludes(adminPage, forbidden, `admin amendment review UI removed duplicate ${forbidden}`);
}

const changeRequestActionsBlock = sliceBetween(
  adminPage,
  'data-admin-booking-change-request-review-actions="true"',
  "!changeRequestContext",
);
const acceptActionIndex = changeRequestActionsBlock.indexOf(
  'data-admin-booking-change-request-review-action="accept"',
);
const rejectActionIndex = changeRequestActionsBlock.indexOf(
  'data-admin-booking-change-request-review-action="reject"',
);
const dismissActionIndex = changeRequestActionsBlock.indexOf(
  'data-admin-booking-change-request-review-action="dismiss"',
);
assert.ok(acceptActionIndex >= 0, "Accept + Cal action must be present in change request actions.");
assert.ok(rejectActionIndex >= 0, "Reject action must be present in change request actions.");
assert.ok(dismissActionIndex >= 0, "Dismiss action must be present in change request actions.");
assert.ok(
  acceptActionIndex < rejectActionIndex && rejectActionIndex < dismissActionIndex,
  "Customer change/cancel request actions must render in order: Accept + Cal, Reject, Dismiss.",
);
assert.equal(
  [...changeRequestActionsBlock.matchAll(/data-admin-booking-change-request-review-action=/g)].length,
  3,
  "Customer change/cancel request rows must expose exactly three review actions.",
);
assertIncludes(
  changeRequestActionsBlock,
  'data-admin-app-notification-clear="safe-inbox-row-only"',
  "Customer change/cancel request row safe Clear inbox action",
);
assertIncludes(
  changeRequestActionsBlock,
  'data-admin-app-notification-action="read"',
  "Customer change/cancel request Clear reuses notification read status",
);
assertIncludes(
  changeRequestActionsBlock,
  'handleAdminAppNotificationStatusUpdate(notificationId, "read")',
  "Customer change/cancel request Clear must not call booking update handlers",
);

for (const fragment of [
  'new URLSearchParams({ limit: "200" })',
  'fetch(`/api/admin-bookings?${params.toString()}`',
  '"x-prestige-admin-purpose": "admin-booking-persistence"',
  'method: "PATCH"',
  "buildAdminBookingPersistencePayload",
  "autoSyncSavedBookingGoogleCalendar(updatedBooking)",
  'updateAdminAppNotificationStatus(notificationId, "archived")',
  "Google Calendar auto-synced on the same booking reference",
  "upsertLoadedBookingFromAdminRecord(updatedBooking)",
  'selectAppTab("bookings")',
  'action: "accept"',
]) {
  assertIncludes(adminPage, fragment, `admin amendment apply path ${fragment}`);
}

for (const fragment of [
  "function upsertLoadedBookingFromAdminRecord(savedRecord: AdminBookingPersistenceRecord)",
  "adminBookingPersistenceRecordToCalendarBookingRecord(savedRecord)",
  "bookingRecordPersistedReference(currentBooking) !== updatedBookingReference",
  "activeChangeRequestAction",
  "Boolean(activeNotificationAction)",
  "Boolean(activeChangeRequestAction)",
  "!changeRequestContext",
  'data-admin-app-notification-action={action.status}',
]) {
  assertIncludes(adminPage, fragment, `admin amendment local UI movement ${fragment}`);
}

for (const fragment of [
  "loadBlockingCustomerInvoicesForAmendment",
  "adminCustomerInvoiceBlocksBookingAmendment",
  "already exists. Use adjustment, credit note, or new invoice review",
  "Booking, invoice, and Google Calendar were not changed.",
  "stopped for ${bookingReference}",
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

for (const fragment of [
  'admin_internal_status: "cancelled"',
  'customer_facing_status: "cancelled"',
  'cancellation_review_status: "cancelled"',
  'request_review_status: "approved"',
  'const actionLabel = "Accept + Cal"',
  "Booking marked cancelled in Completed / History; Google Calendar auto-synced",
  'handleAdminBookingChangeRequestCloseDecision(notification, "reject")',
  'handleAdminBookingChangeRequestCloseDecision(notification, "dismiss")',
  "handleAdminBookingChangeRequestCancelDecision(notification)",
  'selectAppTab("completed")',
]) {
  assertIncludes(adminPage, fragment, `admin cancellation apply safety ${fragment}`);
}

const closeDecisionBlock = sliceBetween(
  adminPage,
  "async function handleAdminBookingChangeRequestCloseDecision",
  "async function handleAdminBookingChangeRequestCancelDecision",
);
for (const fragment of [
  'updateAdminAppNotificationStatus(notificationId, "archived")',
  "Booking and Google Calendar were not changed.",
  "No external message was sent.",
]) {
  assertIncludes(closeDecisionBlock, fragment, `admin request close-only path ${fragment}`);
}
for (const forbidden of [
  'fetch("/api/admin-bookings"',
  "autoSyncSavedBookingGoogleCalendar",
  "buildAdminBookingCancellationRequestApplyPayload",
  "buildAdminBookingPersistencePayload",
  "loadBlockingCustomerInvoicesForAmendment",
  'selectAppTab("completed")',
]) {
  assertExcludes(closeDecisionBlock, forbidden, `admin request close-only path ${forbidden}`);
}

const cancelDecisionBlock = sliceBetween(
  adminPage,
  "async function handleAdminBookingChangeRequestCancelDecision",
  "async function handleAdminBookingChangeRequestApply",
);
for (const forbidden of ['action: "reject"', 'action: "dismiss"', 'action === "reject"']) {
  assertExcludes(cancelDecisionBlock, forbidden, `admin cancellation apply path ${forbidden}`);
}

const changeRequestApplyBlock = sliceBetween(
  adminPage,
  "async function handleAdminBookingChangeRequestApply",
  "const dispatchReleaseWorkflowBookingReference",
);
assertIncludes(
  changeRequestApplyBlock,
  "openDispatch: false",
  "Customer amendment/cancellation apply must not open Dispatch by default.",
);

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
  "Review the requested values, then choose Accept + Cal, Reject, or Dismiss.",
]) {
  assertIncludes(adminChangeHelper, fragment, `existing admin notification helper ${fragment}`);
}

for (const fragment of [
  "adminBookingChangeRequestDisplayMessage",
  "? adminBookingChangeRequestDisplayMessage(changeRequestContext)",
]) {
  assertIncludes(adminPage, fragment, `admin change request display override ${fragment}`);
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
