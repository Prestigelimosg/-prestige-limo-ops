import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareFlightEtaUpdateSetup } from "../lib/flight-eta-comparison-update-setup-foundation.ts";

const source = readFileSync("lib/flight-eta-comparison-update-setup-foundation.ts", "utf8");

assert(!source.includes("fetch("));
assert(!source.includes("process.env"));
assert(!source.includes("supabase"));
assert(!source.includes("setInterval"));
assert(!source.includes("setTimeout"));
assert(!source.includes("localStorage"));

const changed = compareFlightEtaUpdateSetup({
  flightNumber: " sq 317 ",
  serviceType: "MNG",
  previousLatestEtaIso: "2026-06-12T10:00:00.000Z",
  normalizedLatestEtaIso: "2026-06-12T10:30:00.000Z",
  scheduledArrivalIso: "2026-06-12T10:00:00.000Z",
  status: " delayed ",
});

assert.equal(changed.setupOnly, true);
assert.equal(changed.liveUpdateEnabled, false);
assert.equal(changed.serviceType, "MNG");
assert.equal(changed.flightNumber, "SQ 317");
assert.equal(changed.etaChanged, true);
assert.equal(changed.driverNotificationAllowed, false);
assert.equal(changed.adminAlertAllowed, false);
assert.equal(changed.customerVisible, false);
assert.equal(changed.status, "delayed");

const unchanged = compareFlightEtaUpdateSetup({
  flightNumber: "SQ317",
  serviceType: "MNG",
  previousLatestEtaIso: "2026-06-12T10:30:00.000Z",
  normalizedLatestEtaIso: "2026-06-12T10:30:00.000Z",
});

assert.equal(unchanged.etaChanged, false);

console.log("flight ETA comparison/update setup foundation contract passed");
