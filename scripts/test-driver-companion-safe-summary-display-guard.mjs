import assert from "node:assert/strict";

import {
  driverSafeStatusLabel,
  formatDriverPickupDateTime,
  loadDriverJobSummary,
  productionOrigin,
} from "../driver-companion/src/driver-job-contract.ts";

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
