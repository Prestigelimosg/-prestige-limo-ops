import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");
const messageStart = app.indexOf('data-dispatch-workflow-step="driver-dispatch-copy"');
const linkStart = app.indexOf('data-dispatch-workflow-step="driver-job-link"');
const panelEnd = app.indexOf('data-dispatch-workflow-step="admin-lower-status"', linkStart);

assert.notEqual(messageStart, -1, "Missing existing driver message lane.");
assert.notEqual(linkStart, -1, "Missing existing Driver Job Link lane.");
assert.notEqual(panelEnd, -1, "Missing Driver Job Link boundary.");

const messagePanel = app.slice(messageStart, linkStart);
const linkPanel = app.slice(linkStart, panelEnd);

for (const fragment of [
  'data-driver-message-disclosure="true"',
  "<summary",
  "Manual WhatsApp Copy — Optional",
  "Copy the assigned-driver update, then paste it into WhatsApp manually.",
  'data-copy-edit-button="driverDispatch"',
  'data-copy-copy-button="driverDispatch"',
]) {
  assert.ok(messagePanel.includes(fragment), `Missing manual WhatsApp copy fragment: ${fragment}`);
}
assert.ok(!messagePanel.includes(">Driver Dispatch<"), "Visible Driver Dispatch title must be renamed.");
assert.ok(!messagePanel.includes("Send Driver In-App"), "Dispatch must not retain a second in-app driver send action.");
assert.ok(!messagePanel.includes("Driver In-App status"), "Dispatch must not retain a second in-app driver status panel.");

for (const fragment of [
  'data-driver-job-link-booking-details="true"',
  "clean(dispatchReleaseWorkflowBookingReference)",
  "Booking {dispatchReleaseWorkflowBookingReference}",
  "Passenger",
  "Pickup",
  "Route",
  "Assigned driver",
  'data-driver-job-link-preview-disclosure="true"',
  "open",
  'data-admin-driver-reports-disclosure="true"',
  "Driver Reports",
]) {
  assert.ok(linkPanel.includes(fragment), `Missing human Driver Job Link fragment: ${fragment}`);
}

assert.ok(
  !linkPanel.includes("loaded here. Next: Create Link"),
  "Reference-only machine instruction must be replaced with booking details.",
);

console.log("Manual WhatsApp Copy + human Driver Job Link UI guard passed");
