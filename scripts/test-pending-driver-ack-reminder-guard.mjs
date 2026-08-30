import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("app/api/admin-driver-job-links/route.ts", "utf8"),
  readFile("lib/admin-driver-ack-reminder.ts", "utf8"),
  readFile("lib/driver-device-push-notification.ts", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

const [app, route, reminder, push, suite, ledger] = files;

function includes(source, value, label) {
  assert.ok(source.includes(value), `Missing ${label}: ${value}`);
}

for (const [source, value, label] of [
  [app, "Remind driver", "pending-row action"],
  [app, 'data-pending-driver-ack-remind={item.linkId}', "exact-link action key"],
  [app, 'action: "remind_ack"', "explicit reminder action"],
  [route, 'parsedAction.data.action === "remind_ack"', "route action discrimination"],
  [reminder, "admin-driver-ack-reminder-v1", "reminder contract version"],
  [reminder, "15 * 60 * 1000", "15-minute minimum age/cooldown"],
  [reminder, "maximumReminderCount = 3", "three-reminder cap"],
  [reminder, 'const reminderWorkflowArea = "pending_driver_ack_reminder"', "audit workflow"],
  [reminder, 'notification_status: "archived"', "audit-only persistence"],
  [reminder, "native_handoff_ciphertext", "opaque native handoff requirement"],
  [push, "sendDriverNativePendingAckReminder", "native-only push helper"],
  [push, "Job acknowledgement needed. Tap to review.", "fixed safe reminder copy"],
  [suite, 'script: "scripts/test-pending-driver-ack-reminder-guard.mjs"', "preactivation registration"],
  [suite, 'script: "scripts/test-admin-driver-ack-reminder-runtime.mjs"', "runtime preactivation registration"],
  [ledger, "Pending Driver ACK Native Reminder", "ledger evidence"],
]) {
  includes(source, value, label);
}

for (const forbidden of [
  "driver_job_token",
  "target_path",
  "Resend",
  "revokeAdminDriverJobLink",
  "authorizeLiveLocationForDriverJobLink",
  "calendar",
  "customer_app",
]) {
  assert.ok(!reminder.includes(forbidden), `Reminder helper must not include ${forbidden}.`);
}

const routePatchStart = route.indexOf("export async function PATCH");
const routePatch = route.slice(routePatchStart);
includes(routePatch, "parseAdminDriverJobLinkActionPayload", "strict PATCH action parser");
includes(routePatch, "remindAdminDriverToAcknowledgeLink", "established-route reminder call");
includes(routePatch, "revokeAdminDriverJobLink", "preserved revoke call");

console.log("Pending Driver ACK native reminder guard passed.");
