import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateDspBillableMinutes,
  calculateHourlyBillableMinutes,
  dspBillingMinimumHours,
  dspBillingMinimumMinutes,
  hourlyBillingGraceMinutes,
} from "../lib/hourly-billing.ts";

assert.equal(dspBillingMinimumHours, 2, "DSP must keep a two-hour minimum.");
assert.equal(dspBillingMinimumMinutes, 120, "DSP minimum must remain 120 minutes.");
assert.equal(hourlyBillingGraceMinutes, 15, "DSP must reuse the established 15-minute grace.");

for (const [actualMinutes, expectedBillableMinutes] of [
  [0, 0],
  [1, 120],
  [120, 120],
  [135, 120],
  [136, 180],
  [195, 180],
  [196, 240],
]) {
  assert.equal(
    calculateDspBillableMinutes(actualMinutes),
    expectedBillableMinutes,
    `${actualMinutes} DSP minutes must produce ${expectedBillableMinutes} billable minutes.`,
  );
}

for (const invalidValue of [null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
  assert.equal(calculateDspBillableMinutes(invalidValue), null, "Invalid DSP duration must fail closed.");
}

assert.equal(calculateHourlyBillableMinutes(1), 60, "Existing hourly billing must keep its one-hour minimum.");
assert.equal(calculateHourlyBillableMinutes(75), 60, "Existing hourly billing must keep 15 minutes grace.");
assert.equal(calculateHourlyBillableMinutes(76), 120, "Existing hourly billing must charge from minute 76.");

const ledger = await readFile("docs/current-implementation-ledger.md", "utf8");
assert.ok(
  ledger.includes("### DSP Two-Hour Minimum Calculation Foundation"),
  "Implementation ledger must record the bounded DSP calculation foundation.",
);
assert.ok(
  ledger.includes("not yet wired into invoice, billing-summary, or persistence consumers"),
  "Ledger must prevent this calculation-only step from being mistaken for active billing wiring.",
);

console.log("DSP two-hour minimum billing guard passed");
