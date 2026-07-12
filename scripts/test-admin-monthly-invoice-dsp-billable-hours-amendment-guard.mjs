import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");
const actualRead = await readFile("lib/admin-driver-job-dsp-actual-time-read.ts", "utf8");
const persistence = await readFile(
  "lib/admin-monthly-invoice-billable-item-price-review-persistence.ts",
  "utf8",
);

for (const required of [
  "calculateDspBillableMinutes(totalMinutes)",
  'bookingType === "DSP"',
  "DSP final billable time must be a positive whole number of hours.",
  "DSP amended billable hours require a safe amendment reason.",
  "ADM-20260712063110",
]) {
  assert.ok(`${actualRead}\n${persistence}`.includes(required), `Missing DSP server lock: ${required}`);
}

for (const required of [
  'data-admin-monthly-invoice-billable-dsp-actual-time-evidence="true"',
  'data-admin-monthly-invoice-dsp-final-billable-hours="true"',
  'data-admin-monthly-invoice-dsp-hours-amendment-reason="true"',
  "calculateDspBillableMinutes(totalMinutes)",
]) {
  assert.ok(app.includes(required), `Missing existing-lane DSP UI lock: ${required}`);
}

console.log("Admin monthly invoice DSP billable-hours amendment guard passed.");
