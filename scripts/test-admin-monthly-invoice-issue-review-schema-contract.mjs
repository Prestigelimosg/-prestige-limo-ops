import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606080003_monthly_invoice_issue_review_foundation.sql",
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
  /create table if not exists public\.monthly_invoice_issue_reviews/,
  "Expected monthly_invoice_issue_reviews table creation",
);

for (const column of [
  "draft_id uuid not null",
  "customer_account text not null",
  "billing_month text not null",
  "draft_status_snapshot text not null",
  "issue_review_status text not null",
  "readiness_status text not null",
  "ready_count integer not null",
  "blocked_count integer not null",
  "total_count integer not null",
  "source_draft_summary jsonb not null",
  "safe_issue_note text",
  "safe_issue_context jsonb not null",
]) {
  assert.equal(normalized.includes(column), true, `Expected safe column: ${column}`);
}

assert.equal(
  normalized.includes("references public.monthly_invoice_drafts(id) on delete cascade"),
  true,
  "Expected issue review to reference the existing monthly invoice draft",
);
assert.equal(
  normalized.includes("total_count = ready_count + blocked_count"),
  true,
  "Expected total count to match ready plus blocked count",
);
assert.equal(
  normalized.includes(
    "issue_review_status in ( 'issue_review_pending', 'manager_review_required', 'manager_reviewed', 'ready_for_future_issue', 'blocked', 'archived' )",
  ),
  true,
  "Expected bounded issue_review_status values",
);
assert.equal(
  normalized.includes("readiness_status in ('ready', 'blocked', 'mixed')"),
  true,
  "Expected bounded readiness_status values",
);
assert.equal(
  normalized.includes("monthly_invoice_issue_reviews_draft_key"),
  true,
  "Expected draft uniqueness index",
);
assert.equal(
  normalized.includes("alter table public.monthly_invoice_issue_reviews enable row level security"),
  true,
  "Expected issue review RLS to be enabled",
);
assert.doesNotMatch(normalized, /\bcreate\s+policy\b/, "Migration must not add broad policies");

for (const forbiddenColumn of forbiddenColumns) {
  assert.equal(
    normalized.includes(forbiddenColumn),
    false,
    `Unexpected forbidden invoice/payment/payout/auth column or behavior: ${forbiddenColumn}`,
  );
}

console.log("Admin monthly invoice issue review schema contract tests passed.");
