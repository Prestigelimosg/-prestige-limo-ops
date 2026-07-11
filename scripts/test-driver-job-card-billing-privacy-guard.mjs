import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");
const summaryStart = app.indexOf("const dispatchReadableSummaryItems = [");
const summaryEnd = app.indexOf("const customerCopyReadableSummaryItems = [", summaryStart);

assert.notEqual(summaryStart, -1, "Missing Job Card readable summary items.");
assert.notEqual(summaryEnd, -1, "Missing Job Card readable summary boundary.");

const jobCardSummary = app.slice(summaryStart, summaryEnd);

assert.doesNotMatch(
  jobCardSummary,
  /Billing account|dispatchReadableBillingAccount/i,
  "Driver message preview summary must not expose billing-account identity.",
);

assert.match(jobCardSummary, /label: "Passenger"/);
assert.match(jobCardSummary, /label: "Reference"/);
assert.match(jobCardSummary, /label: "Driver"/);
assert.match(jobCardSummary, /label: "Vehicle"/);

console.log("Driver Job Card billing privacy guard passed");
