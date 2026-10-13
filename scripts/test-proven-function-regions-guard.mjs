import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const config = JSON.parse(readFileSync("vercel.json", "utf8"));
const mappings = {
  "app/api/admin-driver-job-bid-offers/route.ts": "app/api/admin-driver-job-bid-offers/route.ts",
  "app/api/admin-saved-bookings/route.ts": "app/api/admin-saved-bookings/route.ts",
  "app/api/admin-driver-job-links/route.ts": "app/api/admin-driver-job-links/route.ts",
  "app/api/driver-job/*/route.ts": "app/api/driver-job/[token]/route.ts",
  "app/api/driver-job/*/status/route.ts": "app/api/driver-job/[token]/status/route.ts",
};
assert.equal(config.regions, undefined, "Keep the project-wide region unchanged");
assert.deepEqual(Object.keys(config.functions).sort(), Object.keys(mappings).sort(),
  "Only the established four functions and the exact status function may override regions");
const routes = [];
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else if (entry.name === "route.ts") routes.push(file);
  }
}
collect("app/api");
for (const [pattern, expected] of Object.entries(mappings)) {
  assert.deepEqual(config.functions[pattern], { regions: ["sin1"] });
  // A single-star segment must never capture nested status, Calendar or GPS routes.
  const regex = new RegExp("^" + pattern.split("*").map(part =>
    part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
  assert.deepEqual(routes.filter(file => regex.test(file)), [expected],
    `${pattern} must match exactly its established route`);
}
assert.deepEqual(config.crons, [
  { path: "/api/cron/job-message-retention", schedule: "30 19 * * *" },
  { path: "/api/cron/driver-ack-auto-reminders", schedule: "* * * * *" },
  { path: "/api/cron/codex-monthly-invoice-drafts", schedule: "0 0 1 * *" },
  { path: "/api/cron/ots-photo-retention", schedule: "15 19 * * *" },
], "The regional change must preserve every existing cron");
console.log("Proven function region scope guard passed: exact status route added; established regions and crons preserved.");
