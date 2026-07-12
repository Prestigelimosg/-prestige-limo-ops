import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("app/page.tsx", "utf8");

for (const expected of [
  "refreshAdminTodayJobMessageHistory",
  'data-admin-active-job-message-history="true"',
  'message.workflow_area === "customer_driver_quick_replies"',
  'message.workflow_area === "admin_driver_job_messages"',
  '"Customer → Driver"',
  '"Driver → Customer"',
  '"Admin → Driver"',
  "void refreshAdminTodayJobMessageHistory(bookingReference);",
]) {
  assert.ok(source.includes(expected), `Today’s Jobs message history must retain ${expected}`);
}

console.log("Today’s Jobs message history guard passed.");
