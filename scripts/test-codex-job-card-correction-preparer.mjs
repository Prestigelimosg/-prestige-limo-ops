import assert from "node:assert/strict";
import { prepareCodexJobCardCorrection } from "../lib/codex-job-card-correction.ts";

const savedBooking = {
  bookingType: "MNG",
  date: "2026-07-18",
  dropoff: "Marina Bay Sands",
  flight: "SQ12",
  pax: "2",
  pickup: "Changi Airport",
  time: "09:00",
  vehicle: "E-Class",
};

const pickupTimeCorrection = prepareCodexJobCardCorrection(
  savedBooking,
  "Pickup time: 14:30",
);

assert.equal(pickupTimeCorrection.status, "ready");
assert.equal(pickupTimeCorrection.correctedBooking.time, "14:30");
assert.equal(pickupTimeCorrection.correctedBooking.flight, "SQ12");
assert.deepEqual(pickupTimeCorrection.changedFields, ["Pickup time: 09:00 → 14:30"]);
assert.equal(savedBooking.time, "09:00", "The saved booking input must never be mutated.");

const multipleCorrections = prepareCodexJobCardCorrection(
  savedBooking,
  "Pickup time: 9:45 pm\nFlight number: SQ 318",
);

assert.equal(multipleCorrections.status, "ready");
assert.equal(multipleCorrections.correctedBooking.time, "21:45");
assert.equal(multipleCorrections.correctedBooking.flight, "SQ 318");
assert.deepEqual(multipleCorrections.changedFields, [
  "Pickup time: 09:00 → 21:45",
  "Flight number: SQ12 → SQ 318",
]);

const removeFlight = prepareCodexJobCardCorrection(
  savedBooking,
  "Flight number: none",
);

assert.equal(removeFlight.status, "ready");
assert.equal(removeFlight.correctedBooking.flight, "");
assert.deepEqual(removeFlight.changedFields, ["Flight number: SQ12 → removed"]);

for (const [instruction, expectedReason] of [
  ["wrong pickup time", "Use exact format: Pickup time: 14:30"],
  ["missing flight number", "Use exact format: Flight number: SQ123"],
  ["Pickup time: 29:90", "Pickup time must be a valid time"],
  ["Flight number: SQ123\nCustomer price: 80", "Only pickup time and flight number corrections are supported"],
  ["Pickup time: 09:00", "Enter a value different from the saved booking"],
]) {
  const result = prepareCodexJobCardCorrection(savedBooking, instruction);

  assert.equal(result.status, "needs_exact_value", instruction);
  assert.equal(result.reason.includes(expectedReason), true, `${instruction}: ${result.reason}`);
  assert.deepEqual(
    result.correctedBooking,
    savedBooking,
    `${instruction}: rejected instructions must not partially change the preview`,
  );
  assert.deepEqual(result.changedFields, []);
}

const inactive = prepareCodexJobCardCorrection(savedBooking, "");
assert.equal(inactive.status, "inactive");
assert.deepEqual(inactive.correctedBooking, savedBooking);

console.log("Codex job-card correction preparer tests passed.");
