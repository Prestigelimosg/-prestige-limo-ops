import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [persistence, statusRoute, page] = await Promise.all([
  readFile("lib/driver-job-status-persistence.ts", "utf8"),
  readFile("app/api/driver-job/[token]/status/route.ts", "utf8"),
  readFile("app/driver-job/[token]/page.tsx", "utf8"),
]);

const proofCheck = persistence.indexOf('if (nextStatus === "pob")');
const eventInsert = persistence.indexOf('.from("driver_job_status_events")\n    .insert(eventRow)', proofCheck);

assert.notEqual(proofCheck, -1, "Missing server-side POB photo-proof check.");
assert.notEqual(eventInsert, -1, "Missing status event insert after POB proof check.");
assert.ok(proofCheck < eventInsert, "POB proof check must run before status insertion.");
assert.match(persistence.slice(proofCheck, eventInsert), /driver_ots_photo_proofs/);
assert.match(persistence.slice(proofCheck, eventInsert), /booking_reference/);
assert.match(persistence.slice(proofCheck, eventInsert), /ots_photo_required/);
assert.match(statusRoute, /ots_photo_required:\s*409/);
assert.match(page, /Send the OTS photo to admin before POB\./);

console.log("Driver POB requires OTS photo guard passed");
