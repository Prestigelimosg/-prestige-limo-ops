import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const evidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-staging-readonly-diagnostics-evidence.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const runnerPath = path.join(process.cwd(), "scripts/check-admin-booking-staging-readonly-contract.mjs");
const runnerTestPath = path.join(process.cwd(), "scripts/test-admin-booking-staging-readonly-contract.mjs");
const adapterPath = path.join(process.cwd(), "lib/admin-booking-supabase-adapter.ts");
const forbiddenStage390Approval = [
  "PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED",
  "stage-4a-390-william-approved",
].join("=");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const evidence = await readFile(evidencePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const runner = await readFile(runnerPath, "utf8");
const runnerTest = await readFile(runnerTestPath, "utf8");
const adapter = await readFile(adapterPath, "utf8");

for (const requiredText of [
  "Stage 4A-391",
  "8c13a3d Record controlled staging persistence save load retry",
  "node scripts/check-admin-booking-staging-readonly-contract.mjs",
  "Final sanitized diagnostic category: `auth_or_key_rejected`.",
  "The Supabase client initialized server-side.",
  "Read-only table reachability checks were blocked by `auth_or_key_rejected`.",
  "Read-only adapter column contract checks were blocked by `auth_or_key_rejected`.",
  "Read-only embedded load contract check was blocked by `auth_or_key_rejected`.",
  "Read-only prior-reference count checks were blocked by `auth_or_key_rejected`.",
  "No live save-load retry was attempted.",
  "No insert, update, delete, or upsert was performed.",
  "No Supabase CLI command was run.",
  "No migration was created.",
  "No raw SQL write was performed.",
  "No staging row deletion was performed.",
  "No production write was performed.",
  "No environment file was committed.",
  "No secret, token, URL, key prefix, service-role key, or environment value was printed or committed.",
  "Persistence still defaults OFF.",
  "The kill-switch remains `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`.",
  "Admin/dispatcher server-session gating remains required.",
  "Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.",
  "Unsafe fields continue to be rejected before adapter use.",
]) {
  assertIncludes(evidence, requiredText);
}

assertIncludes(docsIndex, "admin-persistence-staging-readonly-diagnostics-evidence.md");
assertIncludes(runner, 'mode: "readonly"');
assertIncludes(runner, "readonlyFetchTimeoutMs");
assertIncludes(runner, "auth_or_key_rejected");
assertIncludes(runner, "column_missing");
assertIncludes(runner, "permission_or_rls_denied");
assertIncludes(runner, "table_unreachable");
assertIncludes(runnerTest, "Admin booking staging read-only diagnostic contract tests passed.");
assertIncludes(adapter, "classifyAdapterDatabaseFailure");
assertIncludes(adapter, "safeAdapterFailure");

assertNotMatches(runner, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
assert.ok(!runner.includes(forbiddenStage390Approval));
assertNotMatches(
  evidence,
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
);

console.log("Admin persistence staging read-only diagnostics evidence audit passed.");
