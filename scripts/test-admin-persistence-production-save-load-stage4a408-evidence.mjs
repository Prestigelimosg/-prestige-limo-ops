import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const evidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-production-save-load-stage4a408-evidence.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-booking-api-production-save-load-stage4a408.mjs",
);
const adapterPath = path.join(process.cwd(), "lib/admin-booking-supabase-adapter.ts");
const contractPath = path.join(process.cwd(), "scripts/test-admin-booking-supabase-adapter-contract.mjs");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const evidence = await readFile(evidencePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const runner = await readFile(runnerPath, "utf8");
const adapter = await readFile(adapterPath, "utf8");
const contract = await readFile(contractPath, "utf8");

for (const requiredText of [
  "Stage 4A-408 used William's explicit approval for one bounded production admin persistence write/read verification",
  "The stage used existing saved env only",
  "`.env.local` existed but did not contain the required production persistence env names.",
  "`.env.stage4a388.local` existed and contained the required names.",
  "Approved masked production target: `kvv...atm`.",
  "Full project reference printed: no.",
  "Persistence default before verification: OFF.",
  "Values printed: no.",
  "current-first/foundation-fallback insert for the core `bookings` row",
  "Production DB touched: yes.",
  "Test record reference: `PROD-API-VERIFY-4A408-20260606031101-AGKCLT`.",
  "API route save: passed.",
  "API route load: passed.",
  "Loaded reference matched: yes.",
  "Row data printed: no.",
  "Unsafe fields written: no.",
  "Safe fields check: passed.",
  "one admin-gated POST save through `/api/admin-bookings`;",
  "one admin-gated GET load through `/api/admin-bookings` to find only the test reference;",
  "one clearly marked fake production booking;",
  "one clearly marked fake production customer if not already present;",
  "one clearly marked fake production contact;",
  "pickup and dropoff route points only;",
  "no service items;",
  "one create audit record;",
  "no delete;",
  "no second write.",
  "Production record deleted: no.",
  "deletion was not approved in Stage 4A-408",
  "Env file changed: no.",
  "Process persistence flag after verification: OFF.",
  "Saved env persistence default after verification: OFF.",
]) {
  assertIncludes(evidence, requiredText);
}

for (const envName of [
  "`SUPABASE_URL`",
  "`SUPABASE_SERVICE_ROLE_KEY`",
  "`PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`",
  "`PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`",
  "`PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`",
  "`PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`",
]) {
  assertIncludes(evidence, envName);
}

for (const boundary of [
  "No broad production write was attempted.",
  "No real customer booking was created.",
  "No Supabase CLI was run.",
  "No raw SQL was run.",
  "No migration was created or applied.",
  "No dashboard quick fix was used.",
  "No customer auth or driver auth was added.",
  "No customer, driver, public, or anon policy was created.",
  "No billing, payment, invoice, PDF, payout, live-location, notification, proof/photo, parser-learning, parser, or app behavior changed.",
  "No secret, token, URL, key prefix, full project reference, row data, stack trace, SQL detail, or Supabase internal was printed or committed.",
]) {
  assertIncludes(evidence, boundary);
}

for (const runnerText of [
  'const approvalValue = "stage-4a-408-william-approved";',
  'const expectedMaskedProductionProjectRef = "kvv...atm";',
  'const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];',
  "prestige-stage4a408-controlled-production-api-save-load-attempted.marker",
  "process.argv.includes(\"--preflight-only\")",
  "forcePersistenceOff();",
  "harness.adminRoute.POST",
  "harness.adminRoute.GET",
  "productionRecordDeleted: false",
  "delete-not-approved-in-stage-4a-408",
  "no second write",
  "rowDataPrinted: false",
]) {
  assertIncludes(runner, runnerText);
}

for (const adapterText of [
  "function bookingToFoundationDbRow",
  "insertRowAndSelectIdWithFallback(",
  "bookingToFoundationDbRow(input.booking, customerId, actor)",
]) {
  assertIncludes(adapter, adapterText);
}

for (const contractText of [
  "SAFE-FOUNDATION-CREATE-001",
  "schemaMode: \"foundation\"",
  "pickup_datetime",
  "route_type",
  "source_channel",
]) {
  assertIncludes(contract, contractText);
}

assertNotMatches(runner, /\.delete\(|adminRoute\.DELETE|supabase\s+db|create policy|alter policy/i);

assertIncludes(
  docsIndex,
  "[Admin Persistence Production Save-Load Stage 4A-408 Evidence](admin-persistence-production-save-load-stage4a408-evidence.md)",
  "Docs index must point at the Stage 4A-408 save-load evidence.",
);

for (const [label, text] of [
  ["evidence", evidence],
  ["runner", runner],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

assertNotMatches(evidence, /```(?:bash|sql)/i, "evidence must not include runnable shell or SQL blocks");

console.log("Admin persistence production save-load Stage 4A-408 evidence audit passed.");
