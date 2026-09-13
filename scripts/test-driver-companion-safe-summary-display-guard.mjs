import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  driverSafeStatusLabel,
  formatDriverPickupDateTime,
  loadDriverJobSummary,
  productionOrigin,
} from "../driver-companion/src/driver-job-contract.ts";

const embeddedDriverPageSource = await readFile(
  new URL("../app/driver-job/[token]/page.tsx", import.meta.url),
  "utf8",
);

assert.match(
  embeddedDriverPageSource,
  /!embeddedDriverApp\s*\?\s*\([\s\S]{0,600}data-driver-job-mobile-web-note="true"[\s\S]{0,400}Mobile web driver card\. Keep this link private and use it only for this assigned job\.[\s\S]{0,100}<\/p>[\s\S]{0,40}\)\s*:\s*null/,
  "The verified embedded app must omit the retired blue note while ordinary browser privacy wording stays unchanged",
);
assert.equal(
  embeddedDriverPageSource.includes("Prestige Driver job card. Keep this link private and use it only for this assigned job."),
  false,
  "The verified embedded app must not restore the retired native blue-note copy",
);
assert.match(
  embeddedDriverPageSource,
  /data-driver-job-current-status="true"[\s\S]{0,100}\{driverSafeStatusLabel\(pageState\.job\.status\)\}/,
  "Browser and embedded job badges must use the same existing safe status labels",
);
assert.match(
  embeddedDriverPageSource,
  /\{embeddedDriverDetailRows\(pageState\.job\)\.map\(\(detail\)/,
  "Browser and embedded job summaries must use the same existing readable details",
);
assert.match(
  embeddedDriverPageSource,
  /function embeddedDriverDetailRows\(job: SafeDriverJobPayload\)[\s\S]*?row\.label === "Date\/time"[\s\S]*?formatDriverPickupDateTime\(row\.value\)/,
  "The existing formatter must remain scoped to summary Date/time only",
);

assert.equal(
  driverSafeStatusLabel("admin_review_required"),
  "Pending dispatch confirmation",
  "Unknown admin workflow values must fail closed to a driver-safe label",
);
assert.equal(driverSafeStatusLabel("assigned"), "Assigned");
assert.equal(driverSafeStatusLabel("confirmed"), "Confirmed");
assert.equal(driverSafeStatusLabel("driver_otw"), "I'm on the way");
assert.equal(driverSafeStatusLabel("ots"), "I've arrived");
assert.equal(driverSafeStatusLabel("pob"), "Passenger on board");
assert.equal(driverSafeStatusLabel("completed"), "Completed");

assert.equal(
  formatDriverPickupDateTime("2026-08-15T11:00"),
  "15 Aug 2026, 1100hrs SGT",
  "Canonical booking pickup keys must render as a driver-readable Singapore time",
);
assert.equal(
  formatDriverPickupDateTime("2026-08-15 11:00:00"),
  "15 Aug 2026, 1100hrs SGT",
  "Current-schema space-separated pickup keys must use the same display",
);
assert.equal(
  formatDriverPickupDateTime("27 May 2026, 1530hrs"),
  "27 May 2026, 1530hrs",
  "Already-readable legacy pickup copy must remain unchanged",
);
assert.equal(
  formatDriverPickupDateTime(""),
  "Pickup time TBC",
  "Missing pickup values must keep the established visible fallback",
);

const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async () => Response.json({
    ok: true,
    payload: {
      passengerName: "Safe Passenger",
      pickupDateTime: "2026-08-15T11:00",
      reference: "10889",
      route: "Hilton Hotel > Airport",
      status: "admin_review_required",
      statusLabel: "admin_review_required",
    },
  });

  const summary = await loadDriverJobSummary({
    jobUrl: `${productionOrigin}/driver-job/${"a".repeat(20)}`,
    origin: productionOrigin,
    token: "a".repeat(20),
  });

  assert.deepEqual(summary, {
    passengerName: "Safe Passenger",
    pickupDateTime: "15 Aug 2026, 1100hrs SGT",
    reference: "10889",
    route: "Hilton Hotel > Airport",
    status: "admin_review_required",
    statusLabel: "Pending dispatch confirmation",
  });
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Driver Companion safe summary display guard passed");
