import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606080004_monthly_invoice_issue_record_foundation.sql",
);
const migration = await readFile(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const forbiddenColumnsOrBehaviors = [
  "amount_due",
  "balance_due",
  "bank_account",
  "card_number",
  "customer_auth",
  "customer_price",
  "driver_auth",
  "driver_payout",
  "external_send",
  "internal_admin_note",
  "internal_finance_note",
  "invoice_pdf_url",
  "paid_amount",
  "payment_amount",
  "payment_link",
  "paynow",
  "pdf_link",
  "pdf_url",
  "payout_amount",
  "proof_photo",
  "stripe_session",
  "telegram",
  "whatsapp",
];

assert.match(
  normalized,
  /create table if not exists public\.monthly_invoice_issue_records/,
  "Expected monthly_invoice_issue_records table creation",
);
assert.equal(
  normalized.includes("references public.monthly_invoice_issue_reviews(id) on delete restrict"),
  true,
  "Expected issue record to reference monthly invoice issue review safely",
);
assert.equal(
  normalized.includes("references public.monthly_invoice_drafts(id) on delete restrict"),
  true,
  "Expected issue record to reference monthly invoice draft safely",
);

for (const column of [
  "issue_review_id uuid not null",
  "draft_id uuid not null",
  "customer_account text not null",
  "billing_month text not null",
  "issue_record_status text not null",
  "draft_lock_status text not null",
  "invoice_number text",
  "invoice_number_status text not null",
  "pdf_generation_status text not null",
  "invoice_delivery_status text not null",
  "payment_record_status text not null",
  "source_issue_review_summary jsonb not null",
  "safe_issue_record_note text",
  "safe_issue_record_context jsonb not null",
]) {
  assert.equal(normalized.includes(column), true, `Expected safe column: ${column}`);
}

for (const status of [
  "draft_locked",
  "invoice_number_reserved",
  "pdf_generation_ready",
  "pdf_generated_not_sent",
  "sent_manually",
  "unpaid",
  "paid",
  "locked_for_issue",
  "ready_to_reserve",
  "reserved",
  "ready_to_generate",
  "generated_not_sent",
  "not_recorded",
  "manual_review",
]) {
  assert.equal(normalized.includes(status), true, `Expected bounded status: ${status}`);
}

assert.equal(
  normalized.includes("monthly_invoice_issue_records_review_key"),
  true,
  "Expected issue-review uniqueness index",
);
assert.equal(
  normalized.includes("monthly_invoice_issue_records_invoice_number_key"),
  true,
  "Expected invoice number uniqueness index",
);
assert.equal(
  normalized.includes("monthly_invoice_issue_records_reserved_number_present"),
  true,
  "Expected reserved invoice number consistency check",
);
assert.equal(
  normalized.includes("monthly_invoice_issue_records_payment_after_manual_send"),
  true,
  "Expected manual send before unpaid/paid consistency check",
);
assert.equal(
  normalized.includes("alter table public.monthly_invoice_issue_records enable row level security"),
  true,
  "Expected issue record RLS to be enabled",
);
assert.doesNotMatch(normalized, /\bcreate\s+policy\b/, "Migration must not add broad policies");

for (const forbidden of forbiddenColumnsOrBehaviors) {
  assert.equal(
    normalized.includes(forbidden),
    false,
    `Unexpected forbidden invoice/payment/PDF/payout/auth behavior: ${forbidden}`,
  );
}

console.log("Admin monthly invoice issue record schema contract tests passed.");
