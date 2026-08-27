import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, persistence, agents, ledger] = await Promise.all([
  readFile("app/my-bookings/page.tsx", "utf8"),
  readFile("lib/customer-driver-app-notification-persistence.ts", "utf8"),
  readFile("AGENTS.md", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

for (const expected of [
  "data-customer-shared-conversation=",
  "data-customer-driver-message-composer=",
  "data-customer-driver-message-send=",
  "client_message_id: clientMessageId",
  "message_text: typedMessage",
  'fetch("/api/customer-driver-quick-replies"',
  '"x-prestige-customer-purpose": "customer-driver-quick-reply"',
  'result?.direction !== "customer_to_driver"',
  "customerQuickRepliesClosed",
]) {
  assert.ok(source.includes(expected), `customer typed-message UI must retain ${expected}`);
}

assert.match(
  source,
  /<h3 className="text-sm font-semibold text-sky-950">Message Driver<\/h3>\s*<textarea/,
  "Customer Message Driver must leave its retired explanatory area blank and continue directly to the established composer.",
);
assert.equal(
  source.includes("Boss and managing PA share this booking conversation. The driver sees the verified Boss name."),
  false,
  "Customer Message Driver must not restore the retired explanatory sentence.",
);

for (const retiredTemplate of ["customer_at_lobby", "customer_running_late", "customer_wait_pickup", "customer_cannot_find_car"]) {
  assert.ok(!source.includes(`\"${retiredTemplate}\"`), `customer typed-message UI must retire fixed template ${retiredTemplate}`);
}

for (const expected of [
  "Ordinary Customer ↔ Driver messages use the existing bounded typed `client_message_id + message_text` payload",
  "Separate verified PA and Boss credentials share one exact-booking conversation on the same Customer screen",
  "One Driver → Customer message creates one existing `customer_app` outbox row that both authorized PA and Boss may read",
  "The existing fixed `Acknowledge driver details` Customer action remains a separate `template_key`-only Customer-to-Admin acknowledgement",
]) {
  assert.ok(agents.includes(expected), `AGENTS messaging contract must retain ${expected}`);
}

const customerSend = persistence.slice(
  persistence.indexOf("export async function sendCustomerQuickReplyToDriver"),
  persistence.indexOf("export async function sendDriverQuickReplyToCustomer"),
);
for (const expected of [
  'parseCustomerDriverQuickReplyPayload(rawBody, "customer_to_driver")',
  "actual_sender_principal_id: scope.data.actual_sender_principal_id",
  "actual_sender_role: scope.data.actual_sender_role",
  "customer_display_sender_name: scope.data.verifiedBossName",
  "isDriverDetailsAcknowledgement",
  "customerDriverDetailsAcknowledgementInput",
]) {
  assert.ok(customerSend.includes(expected), `customer typed-message persistence must retain ${expected}`);
}
assert.equal(
  (customerSend.match(/insertQuickReplyNotification\(/g) || []).length,
  1,
  "customer ordinary message and fixed acknowledgement must reuse one established outbox insert call",
);

for (const expected of [
  "### Typed Shared PA/Boss Customer/Driver Conversation Contract Reconciliation (2026-08-24)",
  "PA and Boss keep separate verified credentials and authorization scopes but use the same My Bookings screen and exact-booking conversation.",
  "Either authorized principal may send to the Driver.",
  "The Driver sees only the verified Boss name for Customer-authored ordinary messages.",
  "The existing fixed `Acknowledge driver details` control remains a separate `template_key: customer_driver_details_acknowledged` Customer-to-Admin acknowledgement",
  "The owner approved one exact live Customer → Driver reply for booking `10851`: `I am at the lobby.`.",
  "The exact reply count moved from zero to one queued `driver_app` row",
  "The null `driver_job_link_id` initially triggered a stop-and-inspect",
  "the established driver-token read intentionally accepts exact-booking rows with either no link ID or its exact active link ID",
  "The owner then approved exactly one reissued Driver Job Link.",
  "`10851 · Reissued · Link issued 17:33`",
  "three active links, zero revoked links, and exactly one reply row",
  "`Passenger reply · I am at the lobby.`",
  "`Customer → Driver · I am at the lobby. · 2026-07-30 17:18 SGT`",
  "No Driver Job acknowledgement, driver reply, OTW, OTS, POB, Job Completed, Calendar, live-location, issue-alert, external/provider send, invoice, payment, payout, PayNow, environment, schema, or application-code change occurred.",
]) {
  assert.ok(ledger.includes(expected), `implementation ledger must retain ${expected}`);
}

console.log("Customer/driver typed-message UI guard passed.");
