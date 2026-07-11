import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [persistence, page] = await Promise.all([
  readFile("lib/driver-job-status-persistence.ts", "utf8"),
  readFile("app/driver-job/[token]/page.tsx", "utf8"),
]);

assert.doesNotMatch(
  persistence,
  /driver_ots_photo_proofs|ots_photo_required/,
  "Driver status persistence must not require an OTS photo before POB.",
);
assert.match(page, /OTS recorded\. Photo to admin is optional\./);
assert.doesNotMatch(page, /Send the OTS photo to admin before POB\./);

console.log("Driver POB optional OTS photo guard passed");
