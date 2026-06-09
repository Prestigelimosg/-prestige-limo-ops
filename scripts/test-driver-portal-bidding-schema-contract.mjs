import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606090002_driver_portal_bidding_foundation.sql",
);

const migration = await readFile(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();

function assertIncludes(value, label = value) {
  assert.ok(normalized.includes(value.toLowerCase()), `Missing driver bidding contract: ${label}`);
}

function assertMatches(pattern, label) {
  assert.match(migration, pattern, `Missing driver bidding pattern: ${label}`);
}

function assertNotMatches(pattern, label) {
  assert.doesNotMatch(migration, pattern, `Forbidden driver bidding pattern: ${label}`);
}

for (const requiredText of [
  "do not apply without explicit approval",
  "create table if not exists public.driver_job_bid_offers",
  "create table if not exists public.driver_job_bids",
  "booking_reference text not null",
  "offer_status text not null default 'open'",
  "pickup_at timestamptz not null",
  "safe_pickup_area text not null",
  "safe_dropoff_area text not null",
  "safe_offer_context jsonb not null default '{}'::jsonb",
  "driver_job_bid_offer_id uuid not null references public.driver_job_bid_offers(id) on delete cascade",
  "driver_reference text not null",
  "bid_status text not null default 'pending'",
  "bid_source text not null default 'driver_portal_api'",
  "safe_bid_context jsonb not null default '{}'::jsonb",
  "submitted_at timestamptz not null default now()",
  "driver_job_bids_offer_driver_key",
  "driver_job_bids_one_accepted_bid_per_offer_key",
  "alter table public.driver_job_bid_offers enable row level security",
  "alter table public.driver_job_bids enable row level security",
  "without public, anonymous, broad authenticated",
  "before runtime production bidding reads or writes are enabled",
  "A bid is not a day-of acknowledgement",
  "Status history is retained until a separately approved cleanup or retention policy is created",
]) {
  assertIncludes(requiredText);
}

for (const offerStatus of ["draft", "open", "closed", "assigned", "cancelled", "expired"]) {
  assertIncludes(`'${offerStatus}'`, `offer status ${offerStatus}`);
}

for (const bidStatus of ["pending", "accepted", "declined", "withdrawn", "expired"]) {
  assertIncludes(`'${bidStatus}'`, `bid status ${bidStatus}`);
}

for (const sourceSurface of [
  "'driver_portal_api'",
  "'admin_api'",
  "'admin_dashboard'",
  "'migration'",
  "'system'",
]) {
  assertIncludes(sourceSurface, `source surface ${sourceSurface}`);
}

for (const requiredConstraint of [
  "constraint driver_job_bid_offers_reference_not_blank check",
  "constraint driver_job_bid_offers_status_check check",
  "constraint driver_job_bid_offers_pickup_area_not_blank check",
  "constraint driver_job_bid_offers_dropoff_area_not_blank check",
  "constraint driver_job_bid_offers_context_object check",
  "constraint driver_job_bids_reference_not_blank check",
  "constraint driver_job_bids_driver_reference_not_blank check",
  "constraint driver_job_bids_status_check check",
  "constraint driver_job_bids_source_check check",
  "constraint driver_job_bids_note_length check",
  "constraint driver_job_bids_context_object check",
]) {
  assertIncludes(requiredConstraint, requiredConstraint);
}

assertMatches(
  /constraint driver_job_bid_offers_context_object check \(\s*jsonb_typeof\(safe_offer_context\) = 'object'\s*\)/,
  "offer context must be a JSON object",
);
assertMatches(
  /constraint driver_job_bids_context_object check \(\s*jsonb_typeof\(safe_bid_context\) = 'object'\s*\)/,
  "bid context must be a JSON object",
);
assertMatches(
  /constraint driver_job_bids_note_length check \(\s*safe_bid_note is null or length\(safe_bid_note\) <= 1000\s*\)/,
  "bid note must be bounded",
);
assertMatches(
  /create unique index if not exists driver_job_bids_offer_driver_key\s+on public\.driver_job_bids \(driver_job_bid_offer_id, driver_reference\)/,
  "one driver can bid once per offered job",
);
assertMatches(
  /create unique index if not exists driver_job_bids_one_accepted_bid_per_offer_key\s+on public\.driver_job_bids \(driver_job_bid_offer_id\)\s+where bid_status = 'accepted'/,
  "only one accepted bid per offered job",
);
assertMatches(
  /create index if not exists driver_job_bids_driver_reference_submitted_idx\s+on public\.driver_job_bids \(driver_reference, submitted_at desc\)/,
  "driver portal can list multiple bid records by submitted time",
);

assertNotMatches(/\bcreate\s+policy\b/i, "no RLS policies created in foundation stage");
assertNotMatches(/\balter\s+policy\b/i, "no RLS policy edits in foundation stage");
assertNotMatches(/\bgrant\b/i, "no grants in foundation stage");
assertNotMatches(/\busing\s*\(\s*true\s*\)/i, "no broad RLS using true");
assertNotMatches(/\bwith\s+check\s*\(\s*true\s*\)/i, "no broad RLS check true");
assertNotMatches(/references\s+public\.bookings\s*\(\s*id\s*\)/i, "no bookings.id type coupling");
assertNotMatches(/references\s+public\.drivers\s*\(\s*id\s*\)/i, "no drivers.id type coupling");
assertNotMatches(/\bauth\.users\b/i, "no direct auth.users coupling before driver auth activation");
assertNotMatches(/\braw_token\b|\btoken\s+text\b|\btoken_value\b|\bplain_token\b/i, "no raw tokens");
assertNotMatches(/\backnowledged_at\b|\bdriver_acknowledged\b|\backnowledge_status\b/i, "bids must not replace day-of acknowledgement");
assertNotMatches(
  /create unique index[^\n]+driver_reference[^\n]+(?:pickup_at|date_trunc|pickup_date|service_date)/i,
  "driver bids must not be limited to one job per day",
);
assertNotMatches(/\bdelete\s+from\s+public\.driver_job_status_events\b/i, "no status history deletion");
assertNotMatches(/\bdrop\s+table\b/i, "no destructive schema behavior");

for (const forbiddenColumn of [
  "customer_price",
  "customer_charge",
  "quoted_price",
  "rate_amount",
  "fare_amount",
  "amount_due",
  "billing",
  "billing_amount",
  "invoice",
  "invoice_number",
  "payment",
  "payment_link",
  "pdf",
  "pdf_link",
  "stripe",
  "paynow",
  "pay_now",
  "driver_payout",
  "payout",
  "payout_comparison",
  "finance",
  "finance_note",
  "internal_admin_note",
  "internal_finance_note",
  "notification",
  "notification_delivery",
  "send_state",
  "send_log",
  "whatsapp_send",
  "sms_send",
  "email_send",
  "telegram",
  "proof",
  "photo",
  "live_location",
  "auth_link",
  "customer_auth",
  "driver_auth",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "parser_learning",
  "parser_debug",
  "mock_archive",
  "mock_qa",
  "dev_workbench",
  "service_role",
  "server_secret",
]) {
  assertNotMatches(
    new RegExp(`(?:add column if not exists\\s+|^\\s*)${forbiddenColumn}\\b\\s+(?:text|jsonb|uuid|bigint|integer|numeric|boolean|timestamptz)`, "im"),
    `forbidden driver bidding column ${forbiddenColumn}`,
  );
}

console.log("Driver portal bidding schema contract remains closed, bid-only, and backend-safe.");
