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
  "Driver Message",
  "Short update or manual fallback for the assigned driver.",
]) {
  assert.ok(messagePanel.includes(fragment), `Missing collapsed Driver Message fragment: ${fragment}`);
}
assert.ok(!messagePanel.includes(">Driver Dispatch<"), "Visible Driver Dispatch title must be renamed.");

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

console.log("Driver Message + human Driver Job Link UI guard passed");
