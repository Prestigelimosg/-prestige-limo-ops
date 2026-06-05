import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const evidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-staging-readonly-env-key-confirmed.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const runnerPath = path.join(process.cwd(), "scripts/check-admin-booking-staging-readonly-contract.mjs");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const evidence = await readFile(evidencePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const runner = await readFile(runnerPath, "utf8");
const forbiddenWritePattern = new RegExp(
  [
    ["supabase", "(?:db|migration)"].join(" "),
    ["CREATE", "TABLE"].join(" "),
    ["ALTER", "TABLE"].join(" "),
    ["INSERT", "INTO"].join(" "),
    ["UPDATE", "[A-Za-z_]"].join(" "),
    ["DELETE", "FROM"].join(" "),
    ["DROP", "TABLE"].join(" "),
  ].join("|"),
  "i",
);

for (const requiredText of [
  "Stage 4A-392",
  "fce145d Add staging persistence readonly diagnostics",
  "node scripts/check-admin-booking-staging-readonly-contract.mjs",
  "Final sanitized diagnostic category: `no_partial_rows_found`.",
  "The staging env/key was accepted for read-only server-side Supabase checks.",
  "Read-only table reachability checks passed.",
  "Read-only adapter column contract checks passed with the current write/load shape.",
  "Read-only embedded load contract check passed.",
  "Read-only prior-reference count checks passed with `no_partial_rows_found`.",
  "No live save-load retry was attempted.",
  "No insert, update, delete, or upsert was performed.",
  "No Supabase CLI command was run.",
  "No migration was created.",
  "No raw SQL write was performed.",
  "No staging row deletion was performed.",
  "No production write was performed.",
  "`.env.stage4a388.local` remained ignored and uncommitted.",
  "No secret, token, URL, key prefix, service-role key, or environment value was printed or committed.",
  "Persistence still defaults OFF.",
  "The kill-switch remains `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`.",
  "Admin/dispatcher server-session gating remains required.",
  "Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.",
  "Unsafe fields continue to be rejected before adapter use.",
]) {
  assertIncludes(evidence, requiredText);
}

assertIncludes(docsIndex, "admin-persistence-staging-readonly-env-key-confirmed.md");
assertIncludes(runner, 'mode: "readonly"');
assertIncludes(runner, "liveSaveLoadRetryAttempted: false");
assertIncludes(runner, "no_partial_rows_found");

assertNotMatches(runner, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
assertNotMatches(
  evidence,
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
);
assertNotMatches(evidence, forbiddenWritePattern);

console.log("Admin persistence staging read-only env/key confirmation evidence audit passed.");
