import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const retryEvidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-production-save-load-retry-evidence.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const retryEvidence = await readFile(retryEvidencePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");

for (const requiredText of [
  "Stage 4A-405 was a bounded retry after William approved correcting non-secret local env gate settings.",
  "Only two non-secret local gate values were corrected",
  "`PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` was set back to the default OFF posture before verification.",
  "`PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE` was set to the accepted `server-session-token` mode.",
  "No secret value was changed.",
  "No env file was committed.",
  "The local preflight passed after the gate fix.",
  "Env candidate used: `.env.stage4a388.local`.",
  "Persistence default before verification: OFF.",
  "Approved masked production target: `kvv...atm`.",
  "No live DB was touched during the preflight.",
  "Production DB touched: yes, by one admin-gated pre-save GET read attempt through `/api/admin-bookings`.",
  "Production write attempted: no.",
  "Production save attempted: no.",
  "Production post-save load attempted: no.",
  "Test record created: no.",
  "Verification reference reserved by the runner: `PROD-API-VERIFY-4A404-20260606023111-JH08QZ`.",
  "Pre-save admin load result: safe failure, status `500`.",
  "Cleanup/delete status: not needed; no test record was created.",
  "Production record deletion: not attempted and not approved.",
  "Process rollback: the runner forced `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` OFF after failure.",
  "Saved env rollback: `.env.stage4a388.local` remains default OFF after the retry.",
]) {
  assertIncludes(retryEvidence, requiredText);
}

for (const boundary of [
  "No Supabase CLI was run.",
  "No `supabase db reset` was run.",
  "No migration was created or applied.",
  "No raw SQL was run.",
  "No dashboard quick fix was used.",
  "No broad production write was attempted.",
  "No customer auth or driver auth was added.",
  "No customer, driver, public, or anon policy was created.",
  "No billing, payment, invoice, PDF, payout, live-location, notification, proof/photo, parser-learning, parser, package-script, `test:safe`, public UI, customer UI, or driver UI behavior changed.",
]) {
  assertIncludes(retryEvidence, boundary);
}

assertIncludes(
  docsIndex,
  "[Admin Persistence Production Save-Load Retry Evidence](admin-persistence-production-save-load-retry-evidence.md)",
  "Docs index must point at the Stage 4A-405 retry evidence.",
);

for (const [label, text] of [
  ["retryEvidence", retryEvidence],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

assertNotMatches(retryEvidence, /```(?:bash|sql)/i, "retry evidence must not include runnable shell or SQL blocks");

console.log("Admin persistence production save-load retry evidence audit passed.");
