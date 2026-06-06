import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const evidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-production-save-load-verification-evidence.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-booking-api-production-save-load-verification.mjs",
);

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const evidence = await readFile(evidencePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const runner = await readFile(runnerPath, "utf8");

for (const requiredText of [
  "Stage 4A-404 was approved by William only if the existing local env was valid.",
  "Production admin persistence verification is blocked.",
  "Production DB touched: no.",
  "Production admin save/load run: no.",
  "Production write/read scope used: none.",
  "Test record created: no.",
  "Cleanup/delete needed: no.",
  "Runtime rollback status: the verification runner forces the process kill-switch back OFF on failure.",
  "Env-file rollback status: no env file was modified.",
  "`.env.local` existed but did not contain the required production persistence env names.",
  "`.env.stage4a388.local` existed and contained the required names.",
  "`.env.stage4a388.local` proved the approved masked production target: `kvv...atm`.",
  "`PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` was not default OFF",
  "`PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE` did not satisfy the production route's `server-session-token` gate.",
  "Because the default-OFF and auth-mode gates failed, the verification stopped before live DB access.",
  "No production save/load command was run.",
]) {
  assertIncludes(evidence, requiredText);
}

for (const envName of [
  "`SUPABASE_URL`.",
  "`SUPABASE_SERVICE_ROLE_KEY`.",
  "`PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`.",
  "`PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`.",
  "`PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`.",
  "`PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`.",
]) {
  assertIncludes(evidence, envName);
}

for (const blockedScope of [
  "one admin-gated pre-save GET read through `/api/admin-bookings`;",
  "one admin-gated POST save through `/api/admin-bookings`;",
  "one admin-gated post-save GET load through `/api/admin-bookings`;",
  "one fake operational booking/customer/contact only;",
  "no service items;",
  "no deletion unless a separate cleanup stage is approved and documented.",
]) {
  assertIncludes(evidence, blockedScope);
}

for (const boundary of [
  "No Supabase CLI was run.",
  "No raw SQL was run.",
  "No migration was created or applied.",
  "No dashboard quick fix was used.",
  "No broad production write was attempted.",
  "No customer auth or driver auth was added.",
  "No customer, driver, public, or anon policy was created.",
  "No billing, payment, invoice, PDF, payout, live-location, notification, proof/photo, parser-learning, parser, or app behavior changed.",
  "No secret, token, URL, key prefix, full project reference, row data, stack trace, SQL detail, or Supabase internal was printed or committed.",
]) {
  assertIncludes(evidence, boundary);
}

for (const runnerText of [
  'const approvalValue = "stage-4a-404-william-approved";',
  'const expectedMaskedProductionProjectRef = "kvv...atm";',
  'const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];',
  "process.argv.includes(\"--preflight-only\")",
  "forcePersistenceOff();",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "server-session-token",
  "liveAttemptMarkerPath",
  "productionDbTouched: true",
  "productionRecordDeleted: false",
]) {
  assertIncludes(runner, runnerText);
}

assertIncludes(
  docsIndex,
  "[Admin Persistence Production Save-Load Verification Evidence](admin-persistence-production-save-load-verification-evidence.md)",
  "Docs index must point at the Stage 4A-404 evidence.",
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

console.log("Admin persistence production save-load evidence audit passed.");
