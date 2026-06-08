import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606080005_monthly_invoice_draft_item_review_foundation.sql",
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
  /create table if not exists public\.monthly_invoice_draft_item_reviews/,
  "Expected monthly_invoice_draft_item_reviews table creation",
);

for (const column of [
  "draft_id uuid not null",
  "draft_trip_link_id uuid",
  "booking_reference text not null",
  "item_review_status text not null",
  "trip_detail_review_status text not null",
  "extra_charge_review_status text not null",
  "billing_item_decision text not null",
  "source_trip_summary jsonb not null",
  "safe_item_review_note text",
  "safe_item_review_context jsonb not null",
  "source_surface text not null",
  "actor_role text not null",
  "actor_label text",
]) {
  assert.equal(normalized.includes(column), true, `Expected safe column: ${column}`);
}

assert.equal(
  normalized.includes(
    "item_review_status in ( 'pending_review', 'reviewed', 'needs_correction', 'blocked', 'archived' )",
  ),
  true,
  "Expected bounded item_review_status values",
);
assert.equal(
  normalized.includes(
    "trip_detail_review_status in ( 'pending_review', 'reviewed', 'needs_correction', 'blocked' )",
  ),
  true,
  "Expected bounded trip detail review values",
);
assert.equal(
  normalized.includes(
    "extra_charge_review_status in ( 'pending_review', 'reviewed', 'none', 'needs_correction', 'blocked' )",
  ),
  true,
  "Expected bounded extra charge review values",
);
assert.equal(
  normalized.includes(
    "billing_item_decision in ( 'hold_for_review', 'include_in_draft', 'exclude_from_draft', 'needs_manager_review', 'blocked' )",
  ),
  true,
  "Expected bounded billing item decision values",
);
assert.equal(
  normalized.includes("monthly_invoice_draft_item_reviews_draft_booking_key"),
  true,
  "Expected draft/booking uniqueness index",
);
assert.equal(
  normalized.includes(
    "alter table public.monthly_invoice_draft_item_reviews enable row level security",
  ),
  true,
  "Expected item review RLS to be enabled",
);
assert.doesNotMatch(normalized, /\bcreate\s+policy\b/, "Migration must not add broad policies");

for (const forbiddenColumn of forbiddenColumns) {
  assert.equal(
    normalized.includes(forbiddenColumn),
    false,
    `Unexpected forbidden invoice/payment/payout/auth column or behavior: ${forbiddenColumn}`,
  );
}

console.log("Admin monthly invoice draft item review schema contract tests passed.");
