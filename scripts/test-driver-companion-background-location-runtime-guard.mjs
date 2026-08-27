import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const trackingPath = "driver-companion/src/tracking.ts";
const taskPath = "driver-companion/src/background-location-task.ts";
const [tracking, task] = await Promise.all([
  readFile(trackingPath, "utf8"),
  readFile(taskPath, "utf8"),
]);

for (const fragment of [
  "deferredUpdatesDistance: 0",
  "distanceInterval: 0",
  "deferredUpdatesInterval: 15000",
  "pausesUpdatesAutomatically: false",
  "showsBackgroundLocationIndicator: true",
]) {
  assert.equal(
    tracking.includes(fragment),
    true,
    `Driver background tracking must preserve time-based freshness without a movement gate: ${fragment}`,
  );
}

assert.doesNotMatch(
  tracking,
  /(?:deferredUpdatesDistance|distanceInterval):\s*(?:[1-9]\d*)/,
  "Driver background tracking must not require movement before refreshing the five-minute server lease.",
);
for (const fragment of [
  "TaskManager.defineTask(DRIVER_LOCATION_TASK_NAME",
  "readActiveJob()",
  "postDriverLocation(job, latestLocation)",
  "stopTrackingAfterTerminalResponse()",
]) {
  assert.equal(task.includes(fragment), true, `Existing background task contract must remain: ${fragment}`);
}
assert.doesNotMatch(`${tracking}\n${task}`, /setInterval|setTimeout|sendBeacon|WebSocket|EventSource/);

console.log("Driver Companion stationary background-location runtime guard passed.");
