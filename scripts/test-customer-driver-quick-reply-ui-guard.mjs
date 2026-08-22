import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [source, ledger] = await Promise.all([
  readFile("app/my-bookings/page.tsx", "utf8"),
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
  "Boss and managing PA share this booking conversation.",
]) {
  assert.ok(source.includes(expected), `customer typed-message UI must retain ${expected}`);
}

for (const retiredTemplate of ["customer_at_lobby", "customer_running_late", "customer_wait_pickup", "customer_cannot_find_car"]) {
  assert.ok(!source.includes(`\"${retiredTemplate}\"`), `customer typed-message UI must retire fixed template ${retiredTemplate}`);
}

for (const expected of [
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
