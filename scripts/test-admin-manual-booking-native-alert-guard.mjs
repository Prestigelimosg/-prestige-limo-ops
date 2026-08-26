import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dashboard, route, helper, nativeNotifications, adminConfigSource, ledger, preactivation] =
  await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/api/admin-bookings/route.ts", "utf8"),
    readFile("lib/admin-device-push-notification.ts", "utf8"),
    readFile("admin-companion/src/admin-native-notifications.ts", "utf8"),
    readFile("admin-companion/app.json", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  ]);

const adminConfig = JSON.parse(adminConfigSource).expo;
assert.equal(adminConfig.ios.buildNumber, "6", "The repaired Admin binary must advance only to Build 6");

const saveStart = dashboard.indexOf("async function saveBooking()");
const saveEnd = dashboard.indexOf("function bookingRecordReferenceCandidates", saveStart);
assert.ok(saveStart >= 0 && saveEnd > saveStart, "Save + CRM source boundary must remain available");
const saveSource = dashboard.slice(saveStart, saveEnd);

assert.match(
  saveSource,
  /bookingPayload\.legLabel === "outbound"[\s\S]*?"x-prestige-admin-native-alert": "primary-manual-create"/,
  "Only the primary outbound Save + CRM POST may request one manual-create Admin alert.",
);
assert.equal(
  (saveSource.match(/"x-prestige-admin-native-alert": "primary-manual-create"/g) || []).length,
  1,
  "Save + CRM must have one manual-create alert intent and no return-leg duplicate.",
);
assert.match(
  saveSource,
  /lastSuccessfulBookingSave\?\.key === bookingSaveGuardKey[\s\S]*?return lastSuccessfulBookingSave\.record/,
  "The established successful-save retry guard must return before another create request.",
);
assert.match(
  dashboard,
  /recoverAdminBookingAfterPostResponseLoss[\s\S]*?method: "GET"/,
  "Response-loss recovery must remain a read and must not emit a second create alert.",
);

const postStart = route.indexOf("export async function POST");
const patchStart = route.indexOf("export async function PATCH", postStart);
assert.ok(postStart >= 0 && patchStart > postStart, "Admin booking POST/PATCH boundaries must remain available");
const postSource = route.slice(postStart, patchStart);
const patchSource = route.slice(patchStart);

for (const fragment of [
  'request.headers.get("x-prestige-admin-native-alert") === "primary-manual-create"',
  'normalizedToken(booking.source_channel) === "admin_dashboard"',
  "await sendAdminManualBookingCreatedDevicePushAlert(booking)",
  "A saved Admin booking must not fail because native push is unavailable.",
]) {
  assert.ok(route.includes(fragment), `Admin booking route must preserve ${fragment}`);
}
assert.match(
  postSource,
  /createAdminBooking[\s\S]*?if \(!result\.ok\)[\s\S]*?await maybeSendManualBookingCreatedAlert\(request, result\.data\)[\s\S]*?return Response\.json/,
  "The alert must run only after one successful authoritative manual booking create.",
);
assert.doesNotMatch(
  patchSource,
  /sendAdminManualBookingCreatedDevicePushAlert|maybeSendManualBookingCreatedAlert/,
  "Booking amendments must not emit a duplicate manual-create alert.",
);

for (const eventType of ["admin_booking_created", "admin_urgent_booking_created"]) {
  assert.ok(helper.includes(`"${eventType}"`), `Admin sender must accept ${eventType}`);
  assert.ok(nativeNotifications.includes(`"${eventType}"`), `Admin tap parser must accept ${eventType}`);
}
for (const fragment of [
  "sendAdminManualBookingCreatedDevicePushAlert",
  'body: "New job saved. Open Dashboard to review.",',
  'body: "Urgent job saved. Open Dashboard to review.",',
  '? "admin_urgent_booking_created"',
  ': "admin_booking_created"',
]) {
  assert.ok(helper.includes(fragment), `Admin manual-create sender must include ${fragment}`);
}

assert.match(
  dashboard,
  /Push ON registers this device for automatic alerts\. This button does not send an alert\./,
  "The one existing Push switch must explain its automatic-registration purpose on iPhone.",
);
assert.match(ledger, /Admin Manual Save Native Alert And Face ID Acceptance Repair/);
assert.match(ledger, /Admin TestFlight Build 6 Release Checkpoint/);
assert.ok(
  preactivation.includes("scripts/test-admin-manual-booking-native-alert-guard.mjs"),
  "The manual Admin booking native-alert guard must run in preactivation.",
);

console.log("Admin manual booking native alert guard passed.");
