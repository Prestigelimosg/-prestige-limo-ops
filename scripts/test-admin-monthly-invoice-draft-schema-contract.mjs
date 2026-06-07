import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606070003_monthly_invoice_draft_foundation.sql",
);
const migration = await readFile(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const forbiddenColumns = [
  "invoice_number",
  "full_invoice_number",
  "final_invoice_number",
  "issued_invoice_number",
  "invoice_pdf_url",
  "pdf_url",
  "payment_link",
  "payment_status",
  "paid_amount",
  "balance_due",
  "payout_amount",
  "driver_payout",
  "notification_status",
  "stripe_session",
  "paynow",
  "customer_auth",
  "driver_auth",
  "live_location",
  "parser_debug",
  "internal_finance_note",
  "internal_admin_note",
];

assert.match(
  normalized,
  /create table if not exists public\.monthly_invoice_drafts/,
  "Expected monthly_invoice_drafts table creation",
);
assert.match(
  normalized,
  /create table if not exists public\.monthly_invoice_draft_trip_links/,
  "Expected monthly_invoice_draft_trip_links table creation",
);

for (const column of [
  "customer_account text not null",
  "customer_id text",
  "billing_month text not null",
  "draft_status text not null",
  "readiness_status text not null",
  "ready_count integer not null",
  "blocked_count integer not null",
  "total_count integer not null",
  "source_grouping_summary jsonb not null",
  "safe_draft_note text",
  "safe_draft_context jsonb not null",
  "booking_reference text not null",
  "trip_readiness_status text not null",
  "safe_trip_context jsonb not null",
]) {
  assert.equal(normalized.includes(column), true, `Expected safe column: ${column}`);
}

assert.equal(
  normalized.includes("total_count = ready_count + blocked_count"),
  true,
  "Expected total count to match ready plus blocked count",
);
assert.equal(
  normalized.includes(
    "draft_status in ( 'draft_planning', 'pending_admin_review', 'admin_reviewed', 'manager_approval_needed', 'manager_approved', 'blocked', 'archived' )",
  ),
  true,
  "Expected bounded draft_status values",
);
assert.equal(
  normalized.includes("readiness_status in ('ready', 'blocked', 'mixed')"),
  true,
  "Expected bounded readiness_status values",
);
assert.equal(
  normalized.includes("trip_readiness_status in ('ready', 'blocked')"),
  true,
  "Expected bounded trip_readiness_status values",
);
assert.equal(
  normalized.includes("monthly_invoice_drafts_account_month_key"),
  true,
  "Expected account/month uniqueness index",
);
assert.equal(
  normalized.includes("monthly_invoice_draft_trip_links_draft_booking_key"),
  true,
  "Expected draft/booking uniqueness index",
);
assert.equal(
  normalized.includes("alter table public.monthly_invoice_drafts enable row level security"),
  true,
  "Expected draft RLS to be enabled",
);
assert.equal(
  normalized.includes("alter table public.monthly_invoice_draft_trip_links enable row level security"),
  true,
  "Expected trip-link RLS to be enabled",
);
assert.doesNotMatch(normalized, /\bcreate\s+policy\b/, "Migration must not add broad policies");

for (const forbiddenColumn of forbiddenColumns) {
  assert.equal(
    normalized.includes(forbiddenColumn),
    false,
    `Unexpected forbidden invoice/payment/payout/auth column or behavior: ${forbiddenColumn}`,
  );
}

console.log("Admin monthly invoice draft schema contract tests passed.");
