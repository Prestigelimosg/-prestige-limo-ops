import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appPage, ledger, preactivationSuite] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end after ${startFragment}: ${endFragment}`);
  return source.slice(start, end);
}

const activeAssignedJobsPanel = sectionBetween(
  appPage,
  'aria-label="Active Assigned Jobs"',
  'data-dispatch-live-driver-map="true"',
);
const manualWhatsAppPanel = sectionBetween(
  appPage,
  'data-dispatch-workflow-step="driver-dispatch-copy"',
  'data-dispatch-workflow-step="driver-job-link"',
);

for (const fragment of [
  "Active Assigned Jobs",
  'data-admin-active-job-driver-message="true"',
  'data-admin-active-job-message-history="true"',
  'data-admin-active-job-driver-message-input="true"',
  'data-admin-active-job-driver-message-send="true"',
  "Send to Driver",
  "sendAdminTodayJobMessage",
  'delivery_surface: "driver_app"',
  'workflow_area: "admin_driver_job_messages"',
  "Queued to Driver Job page at ${adminDriverJobStatusTimeLabel(new Date().toISOString())}.",
]) {
  assert.ok(activeAssignedJobsPanel.includes(fragment) || appPage.includes(fragment), `Missing single driver message lane fragment: ${fragment}`);
}

for (const fragment of [
  "Manual WhatsApp Copy — Optional",
  "Copy the assigned-driver update, then paste it into WhatsApp manually.",
  'data-copy-edit-button="driverDispatch"',
  'data-copy-copy-button="driverDispatch"',
  'data-copy-preview="driverDispatch"',
]) {
  assert.ok(manualWhatsAppPanel.includes(fragment), `Missing manual WhatsApp fallback fragment: ${fragment}`);
}

for (const removed of [
  "Send Driver In-App",
  "Driver In-App status",
  'data-admin-customer-driver-details-driver-in-app-send-action="true"',
  "sendAdminCustomerDriverDetailsDriverInAppNotification",
  "adminCustomerDriverDetailsDriverInAppFallbackState",
  "AdminCustomerDriverDetailsDriverInAppActionState",
]) {
  assert.equal(appPage.includes(removed), false, `Removed duplicate Driver In-App lane must exclude: ${removed}`);
}

assert.ok(
  ledger.includes("### Admin Driver Messaging Single-Lane Simplification"),
  "Missing single-lane messaging implementation ledger section.",
);
assert.ok(
  preactivationSuite.includes("scripts/test-driver-in-app-notification-admin-button-guard.mjs"),
  "Single-lane messaging guard must remain registered in the preactivation suite.",
);

console.log("Admin driver messaging single-lane guard passed");
