import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("app/my-bookings/page.tsx", "utf8");

for (const expected of [
  "data-customer-driver-quick-replies=",
  '"customer_at_lobby"',
  '"customer_running_late"',
  '"customer_wait_pickup"',
  '"customer_cannot_find_car"',
  'fetch("/api/customer-driver-quick-replies"',
  '"x-prestige-customer-purpose": "customer-driver-quick-reply"',
  'result?.direction !== "customer_to_driver"',
  "tripStatusStopsCustomerTracking ||",
  "admin can see it.",
]) {
  assert.ok(source.includes(expected), `customer quick-reply UI must retain ${expected}`);
}

assert.ok(!/textarea[\s\S]{0,300}data-customer-driver-quick-repl/.test(source), "customer-to-driver lane must not add free text");

console.log("Customer/driver quick-reply UI guard passed.");
