import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const cleanupDecisionPath = path.join(process.cwd(), "docs/admin-persistence-staging-cleanup-decision.md");
const productionGatePath = path.join(process.cwd(), "docs/admin-persistence-production-readiness-gate.md");
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotIncludes(text, forbidden, message = `Forbidden text present: ${forbidden}`) {
  assert.ok(!text.includes(forbidden), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const cleanupDecision = await readFile(cleanupDecisionPath, "utf8");
const productionGate = await readFile(productionGatePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");

for (const requiredText of [
  "Stage 4A-395",
  "Staging cleanup write/delete is not approved.",
  "No staging row deletion was performed in Stage 4A-395.",
  "Cleanup is not required to prove the local production-readiness gate.",
  "deleting or modifying staging rows is still a database write.",
  "Any future staging cleanup workflow requires separate explicit William approval before any write/delete is attempted.",
  "The exact staging-only target.",
  "The exact cleanup reference or references.",
  "Whether a Supabase command is approved; default is not approved.",
  "Whether a migration is approved; default is not approved.",
  "Whether raw SQL is approved; default is not approved.",
  "The no-production-access boundary.",
  "Staging cleanup needed now: `no`.",
  "Staging cleanup approved now: `no`.",
  "Staging row deletion performed: `no`.",
  "Staging cleanup write/delete requires separate explicit William approval: `yes`.",
  "Production enablement remains not approved.",
]) {
  assertIncludes(cleanupDecision, requiredText);
}

for (const requiredText of [
  "STAGING-VERIFY-4A393-20260605092213-5VT0IV",
  "STAGING-API-VERIFY-4A394-20260605095158-LV1NVT",
  "Stage 4A-393 server-only adapter staging save/load succeeded.",
  "Stage 4A-394 admin API-route staging save/load succeeded.",
  "Both stages used fake staging booking/customer data only.",
  "Both stages confirmed the kill-switch blocks writes.",
  "Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.",
  "Unsafe fields remain rejected before adapter use.",
]) {
  assertIncludes(cleanupDecision, requiredText);
}

for (const requiredText of [
  "The target is production, unknown, or ambiguous.",
  "Supabase CLI without explicit approval.",
  "raw SQL without explicit approval.",
  "migration without explicit approval.",
  "rows outside the exact approved staging references.",
  "customer auth, driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, parser-learning",
]) {
  assertIncludes(cleanupDecision, requiredText);
}

assertIncludes(productionGate, "Staging verification rows may exist and need a separate cleanup decision.");
assertIncludes(productionGate, "Any staging cleanup write/delete requires separate explicit William approval.");
assertIncludes(docsIndex, "admin-persistence-staging-cleanup-decision.md");

assertNotIncludes(cleanupDecision, "Staging cleanup write/delete is approved.");
assertNotIncludes(cleanupDecision, "Staging row deletion performed: `yes`.");
assertNotIncludes(cleanupDecision, "Production enablement is approved.");
assertNotMatches(
  cleanupDecision,
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|supabase\s+(db|migration)|CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/i,
);

console.log("Admin persistence staging cleanup decision audit passed.");
