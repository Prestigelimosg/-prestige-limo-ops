import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606070005_admin_app_notification_outbox_foundation.sql",
);
const migration = await readFile(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const forbiddenColumns = [
  "customer_price",
  "driver_payout",
  "paynow",
  "invoice_number",
  "invoice_url",
  "payment_link",
  "payment_status",
  "pdf_url",
  "payout_amount",
  "telegram_chat_id",
  "telegram_token",
  "whatsapp_payload",
  "sms_payload",
  "email_payload",
  "customer_auth",
  "driver_auth",
  "live_location",
  "proof_photo",
  "parser_debug",
  "internal_finance_note",
  "internal_admin_note",
  "service_role",
  "raw_token",
  "token_hash",
];

assert.match(
  normalized,
  /create table if not exists public\.admin_app_notification_outbox/,
  "Expected admin_app_notification_outbox table creation",
);

for (const column of [
  "notification_type text not null",
  "notification_status text not null",
  "priority text not null",
  "delivery_surface text not null",
  "event_key text",
  "booking_reference text",
  "workflow_area text",
  "safe_title text not null",
  "safe_message text not null",
  "safe_context jsonb not null",
]) {
  assert.equal(normalized.includes(column), true, `Expected safe column: ${column}`);
}

for (const boundedCheck of [
  "notification_type in ( 'booking_workflow', 'driver_status', 'completed_closeout', 'monthly_billing', 'system_notice' )",
  "notification_status in ('queued', 'read', 'dismissed', 'archived', 'blocked')",
  "priority in ('low', 'normal', 'high', 'urgent')",
  "delivery_surface in ('admin_app')",
]) {
  assert.equal(normalized.includes(boundedCheck), true, `Expected bounded check: ${boundedCheck}`);
}

assert.equal(
  normalized.includes("admin_app_notification_outbox_event_key_key"),
  true,
  "Expected optional event_key uniqueness index",
);
assert.equal(
  normalized.includes("alter table public.admin_app_notification_outbox enable row level security"),
  true,
  "Expected RLS to be enabled",
);
assert.doesNotMatch(normalized, /\bcreate\s+policy\b/, "Migration must not add broad policies");

for (const forbiddenColumn of forbiddenColumns) {
  assert.equal(
    normalized.includes(forbiddenColumn),
    false,
    `Unexpected forbidden notification/payment/payout/auth/secret column or behavior: ${forbiddenColumn}`,
  );
}

console.log("Admin app notification schema contract tests passed.");
