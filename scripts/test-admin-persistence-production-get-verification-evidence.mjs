import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const evidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-production-get-verification-evidence.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-booking-api-production-get-verification.mjs",
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
  "Stage 4A-407 retried only the approved read-only `/api/admin-bookings` GET verification",
  "The stage used existing saved env only",
  "`.env.local` existed but did not contain the required production persistence env names.",
  "`.env.stage4a388.local` existed and contained the required names.",
  "Approved masked production target: `kvv...atm`.",
  "Full project reference printed: no.",
  "Persistence default before verification: OFF.",
  "Values printed: no.",
  "Production DB touched: yes, by one admin-gated GET read through `/api/admin-bookings`.",
  "GET result: passed with status `200` and `ok: true`.",
  "Production write attempted: no.",
  "POST attempted: no.",
  "Test record created: no.",
  "Save/load write verification attempted: no.",
  "Route read limit remained `25` rows.",
  "Bookings summarized by the runner: `11`.",
  "Row data printed: no.",
  "Unsafe fields exposed in the response summary: no.",
  "Process persistence flag after verification: OFF.",
  "Saved env persistence default after verification: OFF.",
  "Cleanup/delete needed: no, because no test record was created.",
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
  "No Supabase CLI was run.",
  "No raw SQL was run.",
  "No migration was created or applied.",
  "No dashboard quick fix was used.",
  "No production POST, save, or broad write was attempted.",
  "No customer auth or driver auth was added.",
  "No customer, driver, public, or anon policy was created.",
  "No billing, payment, invoice, PDF, payout, live-location, notification, proof/photo, parser-learning, parser, or app behavior changed.",
  "No secret, token, URL, key prefix, full project reference, row data, stack trace, SQL detail, or Supabase internal was printed or committed.",
]) {
  assertIncludes(evidence, boundary);
}

for (const runnerText of [
  'const approvalValue = "stage-4a-407-william-approved";',
  'const expectedMaskedProductionProjectRef = "kvv...atm";',
  'const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];',
  "process.argv.includes(\"--preflight-only\")",
  "forcePersistenceOff();",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "server-session-token",
  "harness.adminRoute.GET",
  "noPost: true",
  "noTestRecord: true",
  "rowDataPrinted: false",
]) {
  assertIncludes(runner, runnerText);
}

assertNotMatches(runner, /adminRoute\.POST|requestWithJson|createSafePayload|liveAttemptMarkerPath/);

assertIncludes(
  docsIndex,
  "[Admin Persistence Production GET Verification Evidence](admin-persistence-production-get-verification-evidence.md)",
  "Docs index must point at the Stage 4A-407 GET verification evidence.",
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

console.log("Admin persistence production GET verification evidence audit passed.");
