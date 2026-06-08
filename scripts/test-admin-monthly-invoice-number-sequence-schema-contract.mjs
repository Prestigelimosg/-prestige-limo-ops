import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606080006_monthly_invoice_number_sequence_foundation.sql",
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
  /create table if not exists public\.customer_invoice_sequences/,
  "Expected customer_invoice_sequences table creation",
);

for (const column of [
  "customer_account text not null",
  "invoice_prefix text not null",
  "next_sequence_number integer not null",
  "last_reserved_sequence_number integer",
  "last_reserved_invoice_number text",
  "last_reserved_at timestamptz",
  "sequence_status text not null",
  "safe_sequence_note text",
]) {
  assert.equal(normalized.includes(column), true, `Expected sequence column: ${column}`);
}

for (const column of [
  "add column if not exists invoice_prefix text",
  "add column if not exists invoice_sequence_number integer",
  "add column if not exists invoice_number_reserved_at timestamptz",
]) {
  assert.equal(
    normalized.includes(column),
    true,
    `Expected issue-record reservation column: ${column}`,
  );
}

assert.equal(
  normalized.includes("customer_invoice_sequences_account_key"),
  true,
  "Expected one sequence row per customer/account",
);
assert.equal(
  normalized.includes("customer_invoice_sequences_prefix_key"),
  true,
  "Expected globally unique account invoice prefixes",
);
assert.equal(
  normalized.includes("monthly_invoice_issue_records_prefix_sequence_key"),
  true,
  "Expected invoice prefix plus running number uniqueness",
);
assert.equal(
  normalized.includes("alter table public.customer_invoice_sequences enable row level security"),
  true,
  "Expected sequence RLS to be enabled",
);
assert.doesNotMatch(normalized, /\bcreate\s+policy\b/, "Migration must not add broad policies");
assert.equal(
  normalized.includes("reserve_monthly_invoice_number_for_issue_record"),
  true,
  "Expected transaction-safe reservation RPC",
);
assert.equal(
  normalized.includes("for update"),
  true,
  "Expected sequence row lock during reservation",
);
assert.equal(
  normalized.includes("invoice_prefix_mismatch"),
  true,
  "Expected fixed-prefix mismatch protection",
);
assert.equal(
  normalized.includes("issue_record_not_reservable"),
  true,
  "Expected exact issue-record reservation guard",
);
assert.equal(
  normalized.includes("lpad(v_sequence_number::text, 4, '0')"),
  true,
  "Expected four-digit minimum running number format",
);

for (const forbidden of forbiddenColumnsOrBehaviors) {
  assert.equal(
    normalized.includes(forbidden),
    false,
    `Unexpected forbidden invoice/PDF/payment/payout/auth behavior: ${forbidden}`,
  );
}

console.log("Admin monthly invoice number sequence schema contract tests passed.");
