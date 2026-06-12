import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeFlightEtaResultSetup } from "../lib/flight-eta-result-normalization-setup-foundation.ts";

const source = readFileSync("lib/flight-eta-result-normalization-setup-foundation.ts", "utf8");

assert(!source.includes("fetch("));
assert(!source.includes("process.env"));
assert(!source.includes("supabase"));
assert(!source.includes("setInterval"));
assert(!source.includes("setTimeout"));

const result = normalizeFlightEtaResultSetup({
  provider: "flightaware-aeroapi",
  flightNumber: " sq 317 ",
  serviceType: "MNG",
  rawEstimatedArrivalIso: "2026-06-12T10:30:00.000Z",
  rawScheduledArrivalIso: "2026-06-12T10:00:00.000Z",
  rawStatus: " delayed ",
});

assert.equal(result.setupOnly, true);
assert.equal(result.liveLookupEnabled, false);
assert.equal(result.provider, "flightaware-aeroapi");
assert.equal(result.flightNumber, "SQ 317");
assert.equal(result.serviceType, "MNG");
assert.equal(result.latestEtaIso, "2026-06-12T10:30:00.000Z");
assert.equal(result.scheduledArrivalIso, "2026-06-12T10:00:00.000Z");
assert.equal(result.status, "delayed");
assert.equal(result.customerVisible, false);

console.log("flight ETA result normalization setup foundation contract passed");
