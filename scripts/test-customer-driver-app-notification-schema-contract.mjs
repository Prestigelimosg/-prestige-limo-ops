import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606080001_customer_driver_app_notification_outbox_foundation.sql",
);
const sql = await readFile(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

function assertIncludes(value, label) {
  assert.ok(normalized.includes(value.toLowerCase()), `Missing migration contract: ${label}`);
}

function assertNotIncludes(value, label) {
  assert.equal(normalized.includes(value.toLowerCase()), false, `Forbidden migration contract: ${label}`);
}

assertIncludes(
  "create table if not exists public.customer_driver_app_notification_outbox",
  "customer/driver notification outbox table",
);
assertIncludes("delivery_surface in ('customer_app', 'driver_app')", "customer and driver delivery surfaces");
assertIncludes(
  "notification_status in ('queued', 'read', 'dismissed', 'archived', 'blocked')",
  "safe notification lifecycle statuses",
);
assertIncludes("driver_job_link_id uuid references public.driver_job_links", "driver link scoped column");
assertIncludes("booking_reference text", "booking reference scoped column");
assertIncludes("safe_title text not null", "safe title column");
assertIncludes("safe_message text not null", "safe message column");
assertIncludes("safe_context jsonb not null", "safe context column");
assertIncludes(
  "alter table public.customer_driver_app_notification_outbox enable row level security",
  "RLS enabled",
);
assertIncludes("without public, anonymous, broad authenticated", "no broad RLS access comment");
assertIncludes("driver access must go through the server-only hashed-token api", "driver token boundary comment");
assertIncludes("customer access must wait for customer auth", "customer auth boundary comment");

for (const forbidden of [
  "telegram_chat_id",
  "whatsapp_payload",
  "sms_payload",
  "email_payload",
  "invoice_number",
  "payment_link",
  "payout_amount",
  "driver_payout",
  "paynow_payout",
  "token_hash text",
  "raw_token",
  "parser_debug",
  "live_location",
  "proof_photo",
]) {
  assertNotIncludes(forbidden, forbidden);
}

console.log("Customer/driver app notification schema contract tests passed.");
