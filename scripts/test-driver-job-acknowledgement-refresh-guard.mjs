import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [link, persistence, page] = await Promise.all([
  readFile("lib/driver-job-link.ts", "utf8"),
  readFile("lib/driver-job-status-persistence.ts", "utf8"),
  readFile("app/driver-job/[token]/page.tsx", "utf8"),
]);

assert.match(link, /acknowledged:\s*boolean/);
assert.match(link, /driver_acknowledged_at/);
assert.match(persistence, /driver_acknowledged_at:\s*safeTextFromDb\(context\.driver_acknowledged_at/);
assert.match(page, /setAcknowledged\(result\.payload\.acknowledged\)/);
assert.match(
  page,
  /setSavedDriverDetails\(result\.payload\.acknowledged\s*\?\s*loadedDriverDetails\s*:\s*null\)/,
);

console.log("Driver job acknowledgement refresh guard passed");
