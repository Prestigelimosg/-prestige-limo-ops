import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const productionGatePath = path.join(process.cwd(), "docs/admin-persistence-production-readiness-gate.md");
const cleanupDecisionPath = path.join(process.cwd(), "docs/admin-persistence-staging-cleanup-decision.md");
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const guardPath = path.join(process.cwd(), "scripts/check-admin-persistence-production-readiness-gate.mjs");

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotIncludes(text, forbidden, message = `Forbidden text present: ${forbidden}`) {
  assert.ok(!text.includes(forbidden), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const productionGate = await readFile(productionGatePath, "utf8");
const cleanupDecision = await readFile(cleanupDecisionPath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const guard = await readFile(guardPath, "utf8");

for (const requiredText of [
  "Stage 4A-395",
  "Stage 4A-393 server-only adapter staging save/load succeeded.",
  "Stage 4A-394 admin API-route staging save/load succeeded.",
  "The staging env/key was accepted by read-only checks in Stage 4A-392.",
  "Production enablement is not approved.",
  "Production writes remain blocked",
  "Production readiness is currently `blocked`.",
  "Staging evidence exists, but production env is not verified.",
  "Production feature flag remains OFF.",
  "Staging verification rows may exist and need a separate cleanup decision.",
  "Production write requires separate explicit William approval.",
  "Any Supabase command requires separate explicit William approval.",
  "Any migration requires separate explicit William approval.",
  "Any staging cleanup write/delete requires separate explicit William approval.",
  "Any dashboard quick fix is forbidden unless separately approved.",
  "Persistence still defaults OFF.",
  "The kill-switch blocks writes.",
  "Admin/dispatcher server-session gating is required.",
  "Customer, public, driver, and anonymous paths remain blocked from admin persistence writes.",
  "Unsafe fields remain rejected before adapter use.",
  "No real customer auth, driver auth, notifications, billing, payment, PDF, payout, live-location, proof/photo, or parser-learning is included.",
]) {
  assertIncludes(productionGate, requiredText);
}

for (const requiredText of [
  "Pricing / quoted price fields.",
  "Driver payout fields.",
  "PayNow payout fields.",
  "Invoice, payment, and PDF fields.",
  "Finance notes.",
  "Parser/debug internals.",
  "Live-location, proof, and photo fields.",
  "Notification-send fields and message delivery state.",
  "Mock archive fields.",
  "Mock workbench and dev workbench fields.",
]) {
  assertIncludes(productionGate, requiredText);
}

for (const requiredText of [
  "public.companies",
  "public.bookers",
  "public.saved_addresses",
  "public.rate_settings",
  "public.travelers",
  "public.drivers",
  "Do not fix those from the dashboard in this stage.",
  "separate approved RLS hardening migration stage",
]) {
  assertIncludes(productionGate, requiredText);
}

for (const requiredText of [
  "admin-persistence-staging-save-load-success-evidence.md",
  "admin-persistence-api-staging-save-load-success-evidence.md",
  "admin-persistence-staging-readonly-env-key-confirmed.md",
  "admin-persistence-staging-command-and-evidence-checklist.md",
  "admin-persistence-staging-verification-packet.md",
  "admin-persistence-real-write-approval-proposal.md",
  "admin-persistence-enable-approval-checklist.md",
  "admin-persistence-staging-cleanup-decision.md",
]) {
  assertIncludes(productionGate, requiredText);
}

assertIncludes(cleanupDecision, "Staging cleanup write/delete is not approved.");
assertIncludes(docsIndex, "admin-persistence-production-readiness-gate.md");
assertIncludes(docsIndex, "admin-persistence-staging-cleanup-decision.md");
assertIncludes(guard, "mode: \"local-readonly\"");
assertIncludes(guard, "liveSaveLoadAttempted: false");
assertIncludes(guard, "productionApproved: false");
assertIncludes(guard, "stagingCleanupApproved: false");
assertIncludes(guard, "legacy_public_table_rls_advisor_requires_separate_approved_stage");
assertNotIncludes(guard, "@supabase/supabase-js");
assertNotIncludes(guard, "createClient");

assertNotIncludes(productionGate, "Production enablement is approved.");
assertNotIncludes(productionGate, "Production writes are approved.");
assertNotIncludes(productionGate, "Staging cleanup write/delete is approved.");
assertNotIncludes(productionGate, "Dashboard quick fix is approved.");
assertNotMatches(
  productionGate,
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
);
assertNotMatches(
  guard,
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|supabase\s+(db|migration)|CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/i,
);

console.log("Admin persistence production-readiness gate audit passed.");
