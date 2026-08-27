import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, persistence, agents, ledger] = await Promise.all([
  readFile("app/driver-job/[token]/page.tsx", "utf8"),
  readFile("lib/customer-driver-app-notification-persistence.ts", "utf8"),
  readFile("AGENTS.md", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

for (const expected of [
  'data-driver-customer-quick-replies="true"',
  'data-driver-customer-shared-conversation="true"',
  'data-driver-customer-message-composer="true"',
  'data-driver-customer-message-send="true"',
  "client_message_id: clientMessageId",
  "message_text: safeMessage",
  '/quick-replies`,',
  'result?.direction !== "driver_to_customer"',
  '["pob", "completed"].includes(workflowStatus)',
]) {
  assert.ok(source.includes(expected), `driver typed-message UI must retain ${expected}`);
}

assert.match(
  source,
  /<h2 id="driver-customer-message-heading"[\s\S]{0,250}>\s*Message Customer\s*<\/h2>\s*<div[^>]+>\s*<textarea/,
  "Driver Message Customer must leave its retired explanatory area blank and continue directly to the established composer.",
);
assert.equal(
  source.includes("Type a message. The verified Boss and managing PA share this booking conversation, and admin can see it."),
  false,
  "Driver Message Customer must not restore the retired explanatory sentence.",
);

for (const retiredTemplate of ["driver_on_the_way", "driver_arrived", "driver_meet_pickup", "driver_waiting_nearby"]) {
  assert.ok(!source.includes(`\"${retiredTemplate}\"`), `driver typed-message UI must retire fixed template ${retiredTemplate}`);
}

const driverSend = persistence.slice(
  persistence.indexOf("export async function sendDriverQuickReplyToCustomer"),
  persistence.indexOf("export function parseCustomerDriverAppNotificationCreatePayload"),
);
for (const expected of [
  'parseCustomerDriverQuickReplyPayload(rawBody, "driver_to_customer")',
  '"driver_to_customer"',
  "parsed.data.client_message_id",
  'delivery_surface: "customer_app"',
  'direction: "driver_to_customer"',
]) {
  assert.ok(driverSend.includes(expected), `driver typed-message persistence must retain ${expected}`);
}
assert.equal(
  (driverSend.match(/insertQuickReplyNotification\(/g) || []).length,
  1,
  "one Driver typed message must create one existing customer_app outbox row",
);
for (const expected of [
  "One Driver → Customer message creates one existing `customer_app` outbox row that both authorized PA and Boss may read",
  "never duplicate the row per recipient",
]) {
  assert.ok(agents.includes(expected), `AGENTS Driver fan-out contract must retain ${expected}`);
}

for (const expected of [
  "### Typed Shared PA/Boss Customer/Driver Conversation Contract Reconciliation (2026-08-24)",
  "One Driver-to-Customer `customer_app` row is readable by both authorized PA and Boss through that same exact-booking conversation",
  "the persistence layer must never clone the row once per principal or device.",
  "the established Admin message history retains the human Customer → Driver and Driver → Customer directions.",
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

console.log("Driver/customer typed-message UI guard passed.");
