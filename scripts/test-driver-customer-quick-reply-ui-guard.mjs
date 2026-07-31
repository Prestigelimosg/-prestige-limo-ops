import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, ledger] = await Promise.all([
  readFile("app/driver-job/[token]/page.tsx", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

for (const expected of [
  'data-driver-customer-quick-replies="true"',
  '"driver_on_the_way"',
  '"driver_arrived"',
  '"driver_meet_pickup"',
  '"driver_waiting_nearby"',
  '/quick-replies`,',
  'result?.direction !== "driver_to_customer"',
  '["pob", "completed"].includes(workflowStatus)',
  "The customer receives it in My Bookings and admin can see it.",
]) {
  assert.ok(source.includes(expected), `driver quick-reply UI must retain ${expected}`);
}

assert.ok(!/textarea[\s\S]{0,300}data-driver-customer-quick-repl/.test(source), "driver-to-customer lane must not add free text");

for (const expected of [
  "The owner then approved one exact live Driver → Customer reply for booking `10851`: `I have arrived.`.",
  "the corrected query proved an exact pre-count of zero",
  "`Sent to customer: I have arrived.`",
  "exactly one queued `customer_app` row with safe title `Driver reply`",
  "fixed `driver_arrived` template key",
  "`Driver reply · I have arrived. · 30 Jul 2026, 17:45 SGT`",
  "`Driver → Customer · I have arrived. · 2026-07-30 17:45 SGT`",
  "The reissued link remained unacknowledged",
  "no Save & Acknowledge Job, OTW, OTS, POB, Job Completed, Calendar, live-location, issue-alert, external/provider send, invoice, payment, payout, PayNow, environment, schema, or application-code change occurred.",
]) {
  assert.ok(ledger.includes(expected), `implementation ledger must retain ${expected}`);
}

console.log("Driver/customer quick-reply UI guard passed.");
