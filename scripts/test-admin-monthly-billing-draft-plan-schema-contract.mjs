import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606070002_monthly_billing_draft_planning_foundation.sql",
);
const migration = await readFile(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const forbiddenColumns = [
  "invoice_number",
  "invoice_url",
  "pdf_url",
  "payment_link",
  "payment_status",
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
  /create table if not exists public\.monthly_billing_draft_plans/,
  "Expected monthly_billing_draft_plans table creation",
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
]) {
  assert.equal(normalized.includes(column), true, `Expected safe column: ${column}`);
}

assert.equal(
  normalized.includes("total_count = ready_count + blocked_count"),
  true,
  "Expected total count to match ready plus blocked count",
);
assert.equal(
  normalized.includes("draft_status in ( 'planning', 'blocked', 'ready_for_billing_draft_review', 'archived' )"),
  true,
  "Expected bounded draft_status values",
);
assert.equal(
  normalized.includes("readiness_status in ('ready', 'blocked', 'mixed')"),
  true,
  "Expected bounded readiness_status values",
);
assert.equal(
  normalized.includes("monthly_billing_draft_plans_account_month_key"),
  true,
  "Expected account/month uniqueness index",
);
assert.equal(
  normalized.includes("alter table public.monthly_billing_draft_plans enable row level security"),
  true,
  "Expected RLS to be enabled",
);
assert.doesNotMatch(normalized, /\bcreate\s+policy\b/, "Migration must not add broad policies");

for (const forbiddenColumn of forbiddenColumns) {
  assert.equal(
    normalized.includes(forbiddenColumn),
    false,
    `Unexpected forbidden billing/payment/payout/auth column or behavior: ${forbiddenColumn}`,
  );
}

console.log("Admin monthly billing draft plan schema contract tests passed.");
