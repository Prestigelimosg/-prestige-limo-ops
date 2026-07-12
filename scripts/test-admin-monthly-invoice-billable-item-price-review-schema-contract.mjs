import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606100002_monthly_invoice_billable_item_price_review.sql",
);

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertMatches(text, pattern, message = `Missing required pattern: ${pattern}`) {
  assert.match(text, pattern, message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const migration = await readFile(migrationPath, "utf8");
const dspAmendmentMigration = await readFile(
  path.join(process.cwd(), "supabase/migrations/202607120001_dsp_billable_hours_amendment.sql"),
  "utf8",
);

for (const requiredText of [
  "do not apply without explicit approval",
  "create table if not exists public.monthly_invoice_billable_item_price_reviews",
  "draft_id uuid not null references public.monthly_invoice_drafts(id) on delete cascade",
  "draft_trip_link_id uuid references public.monthly_invoice_draft_trip_links(id) on delete set null",
  "item_review_id uuid not null references public.monthly_invoice_draft_item_reviews(id) on delete cascade",
  "booking_reference text not null",
  "booking_type text not null",
  "billing_item_type text not null default 'base_trip'",
  "calculation_basis text not null",
  "price_review_status text not null default 'pending_review'",
  "price_decision text not null default 'hold_for_review'",
  "reviewed_customer_amount_cents integer",
  "currency text not null default 'SGD'",
  "dsp_total_minutes integer",
  "dsp_billable_minutes integer",
  "source_price_context jsonb not null default '{}'::jsonb",
  "safe_price_review_context jsonb not null default '{}'::jsonb",
  "monthly_invoice_billable_item_price_reviews_item_type_key",
  "alter table public.monthly_invoice_billable_item_price_reviews enable row level security",
  "without public, customer, driver, anonymous, or",
  "broad authenticated policies",
]) {
  assertIncludes(migration, requiredText);
}

for (const bookingType of [
  "MNG",
  "DEP",
  "TRF",
  "DSP",
  "arrival",
  "departure",
  "transfer",
  "hourly",
  "seaport_transfer",
]) {
  assertIncludes(migration, `'${bookingType}'`);
}

for (const calculationBasis of [
  "fixed_trip",
  "dsp_actual_time",
  "manual_review",
  "extra_charge",
  "waived",
]) {
  assertIncludes(migration, `'${calculationBasis}'`);
}

for (const priceReviewStatus of [
  "pending_review",
  "reviewed",
  "needs_correction",
  "blocked",
  "approved_for_invoice_draft",
]) {
  assertIncludes(migration, `'${priceReviewStatus}'`);
}

for (const priceDecision of [
  "hold_for_review",
  "include_in_invoice",
  "exclude_from_invoice",
  "needs_manager_review",
  "waived",
  "blocked",
]) {
  assertIncludes(migration, `'${priceDecision}'`);
}

for (const sourceSurface of ["'admin_api'", "'admin_dashboard'", "'migration'", "'system'"]) {
  assertIncludes(migration, sourceSurface);
}

for (const actorRole of ["'admin'", "'dispatcher'", "'system'"]) {
  assertIncludes(migration, actorRole);
}

for (const requiredConstraint of [
  "constraint monthly_invoice_billable_item_price_reviews_reference_not_blank check",
  "constraint monthly_invoice_billable_item_price_reviews_booking_type_check check",
  "constraint monthly_invoice_billable_item_price_reviews_item_type_check check",
  "constraint monthly_invoice_billable_item_price_reviews_calculation_basis_check check",
  "constraint monthly_invoice_billable_item_price_reviews_status_check check",
  "constraint monthly_invoice_billable_item_price_reviews_decision_check check",
  "constraint monthly_invoice_billable_item_price_reviews_amount_check check",
  "constraint monthly_invoice_billable_item_price_reviews_dsp_minutes_check check",
  "constraint monthly_invoice_billable_item_price_reviews_dsp_basis_check check",
  "constraint monthly_invoice_billable_item_price_reviews_include_requires_amount check",
  "constraint monthly_invoice_billable_item_price_reviews_approved_requires_include check",
  "constraint monthly_invoice_billable_item_price_reviews_source_context_object check",
  "constraint monthly_invoice_billable_item_price_reviews_safe_context_object check",
  "constraint monthly_invoice_billable_item_price_reviews_note_length check",
]) {
  assertIncludes(migration, requiredConstraint);
}

assertMatches(
  migration,
  /reviewed_customer_amount_cents is null or reviewed_customer_amount_cents >= 0/,
  "Reviewed customer amount must be non-negative when present.",
);
assertMatches(
  migration,
  /price_decision <> 'include_in_invoice'\s+or reviewed_customer_amount_cents is not null/,
  "Including a billable item in invoice review must require a reviewed amount.",
);
assertMatches(
  migration,
  /price_review_status <> 'approved_for_invoice_draft'\s+or price_decision = 'include_in_invoice'/,
  "Approved price review must be explicitly included for invoice draft.",
);
assertMatches(
  migration,
  /calculation_basis <> 'dsp_actual_time'\s+or booking_type in \('DSP', 'hourly'\)/,
  "DSP actual-time calculation must be limited to DSP/hourly booking types.",
);
assertMatches(
  migration,
  /dsp_billable_minutes >= 0\s+and dsp_billable_minutes <= dsp_total_minutes/,
  "DSP billable minutes must stay within actual total minutes.",
);
assertMatches(
  migration,
  /constraint monthly_invoice_billable_item_price_reviews_source_context_object check \(\s*jsonb_typeof\(source_price_context\) = 'object'\s*\)/,
  "Source price context must be a JSON object.",
);
assertMatches(
  migration,
  /constraint monthly_invoice_billable_item_price_reviews_safe_context_object check \(\s*jsonb_typeof\(safe_price_review_context\) = 'object'\s*\)/,
  "Safe price review context must be a JSON object.",
);

assertNotMatches(migration, /\bcreate\s+policy\b/i);
assertNotMatches(migration, /\balter\s+policy\b/i);
assertNotMatches(migration, /\bgrant\b/i);
assertNotMatches(migration, /\busing\s*\(\s*true\s*\)/i);
assertNotMatches(migration, /\bwith\s+check\s*\(\s*true\s*\)/i);
assertIncludes(dspAmendmentMigration, "do not apply without explicit owner approval");
assertIncludes(
  dspAmendmentMigration,
  "drop constraint if exists monthly_invoice_billable_item_price_reviews_dsp_minutes_check",
);
assertMatches(
  dspAmendmentMigration,
  /booking_type = 'hourly'\s+or dsp_billable_minutes % 60 = 0/,
  "DSP compatibility migration must allow minimum billing above actual time while requiring whole hours.",
);
assertNotMatches(
  dspAmendmentMigration,
  /dsp_billable_minutes\s*<=\s*dsp_total_minutes/,
  "DSP compatibility migration must remove the obsolete billable-at-most-actual constraint.",
);

for (const forbiddenColumn of [
  "invoice_sent_at",
  "invoice_send_status",
  "invoice_pdf_url",
  "pdf_url",
  "payment_link",
  "payment_status",
  "paid_amount",
  "balance_due",
  "driver_payout",
  "payout_amount",
  "payout_status",
  "paynow",
  "pay_now",
  "stripe_session",
  "notification_status",
  "whatsapp_send",
  "sms_send",
  "email_send",
  "telegram",
  "live_location",
  "proof",
  "photo",
  "customer_auth",
  "driver_auth",
  "parser_debug",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "mock_archive",
  "mock_qa",
  "service_role",
  "server_secret",
]) {
  assertNotMatches(
    migration,
    new RegExp(`(?:add column if not exists\\s+|^\\s*)${forbiddenColumn}\\b\\s+(?:text|jsonb|uuid|bigint|integer|numeric|boolean|timestamptz)`, "im"),
    `Forbidden send/payment/payout/auth column present: ${forbiddenColumn}`,
  );
}

console.log("Admin monthly invoice billable item price review schema contract tests passed.");
