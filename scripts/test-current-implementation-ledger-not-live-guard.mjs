import assert from "node:assert/strict";
import fs from "node:fs";

const ledgerPath = "docs/current-implementation-ledger.md";

assert.equal(fs.existsSync(ledgerPath), true, "Current implementation ledger must exist.");

const ledger = fs.readFileSync(ledgerPath, "utf8");
const notLiveHeading = "## Not Live / Not Implemented";

assert.ok(ledger.includes(notLiveHeading), "Ledger must keep a Not Live / Not Implemented section.");

const requiredNotLiveItems = [
  "External flight API call",
  "Live ETA lookup",
  "Real driver ETA notification sending",
  "Real GPS/live map",
  "Real OTS photo upload/storage",
  "Customer/driver auth activation",
  "Invoice PDF generation",
  "Payment links",
  "Payout automation",
  "Production deployment activation",
];

for (const item of requiredNotLiveItems) {
  assert.ok(ledger.includes(`- ${item}.`), `Ledger must keep not-live item: ${item}.`);
}

console.log("current implementation ledger not-live guard passed");
