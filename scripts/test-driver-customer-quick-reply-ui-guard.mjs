import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("app/driver-job/[token]/page.tsx", "utf8");

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

console.log("Driver/customer quick-reply UI guard passed.");
