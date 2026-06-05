import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const retryFailureEvidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-staging-save-load-retry-failure-evidence.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const runnerPath = path.join(
  process.cwd(),
  "scripts/run-admin-booking-staging-save-load-verification.mjs",
);
const adapterPath = path.join(process.cwd(), "lib/admin-booking-supabase-adapter.ts");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const retryFailureEvidence = await readFile(retryFailureEvidencePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const runner = await readFile(runnerPath, "utf8");
const adapter = await readFile(adapterPath, "utf8");

for (const requiredText of [
  "Stage 4A-390",
  "effe59b Diagnose controlled staging persistence save failure",
  "PRESTIGE_ADMIN_BOOKING_STAGING_WRITE_VERIFICATION_APPROVED=stage-4a-390-william-approved node scripts/run-admin-booking-staging-save-load-verification.mjs",
  "STAGING-VERIFY-4A390-20260605072200-KAC4OT",
  "controlled_save_failed_safely",
  "Safe failure status: `500`.",
  "The live retry command was not rerun.",
  "current-schema payloads first",
  "cumulative compatibility payloads only after a safe insert failure",
  "Local mocked contract tests now cover both the current migration shape and the cumulative migration shape.",
  "No Supabase CLI command was run.",
  "No migration was created.",
  "No raw SQL write was performed.",
  "No production write was performed.",
  "No environment file was committed.",
  "No secret, token, URL, key prefix, service-role key, or environment value was printed or committed.",
  "Persistence still defaults OFF.",
  "The kill-switch remains `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`.",
  "Admin/dispatcher server-session gating remains required.",
  "Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.",
  "Unsafe fields continue to be rejected before adapter use.",
  "Any future live retry needs a new explicit William approval.",
]) {
  assertIncludes(retryFailureEvidence, requiredText);
}

assertIncludes(docsIndex, "admin-persistence-staging-save-load-retry-failure-evidence.md");
assertIncludes(runner, 'const approvalValue = "stage-4a-390-william-approved";');
assertIncludes(runner, "STAGING-VERIFY-4A390-");
assertIncludes(runner, "prestige-stage4a390-controlled-live-write-attempted.marker");
assertIncludes(runner, 'stage: "4A-390"');
assertIncludes(adapter, "insertRowAndSelectIdWithFallback");
assertIncludes(adapter, "insertRowsWithFallback");
assertIncludes(adapter, "routePointToCurrentDbRow");
assertIncludes(adapter, "routePointToCumulativeDbRow");
assertIncludes(adapter, "serviceItemToCurrentDbRow");
assertIncludes(adapter, "serviceItemToCumulativeDbRow");

assertNotMatches(
  retryFailureEvidence,
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
);

console.log("Admin persistence staging save-load retry evidence audit passed.");
