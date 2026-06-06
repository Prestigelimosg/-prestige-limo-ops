import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const closeoutPath = path.join(
  process.cwd(),
  "docs/admin-persistence-production-test-record-closeout-stage4a409.md",
);
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const saveLoadEvidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-production-save-load-stage4a408-evidence.md",
);
const cleanupDecisionPath = path.join(
  process.cwd(),
  "docs/admin-persistence-staging-cleanup-decision.md",
);
const adminBookingsRoutePath = path.join(process.cwd(), "app/api/admin-bookings/route.ts");

const testReference = "PROD-API-VERIFY-4A408-20260606031101-AGKCLT";
const forbiddenLeakPattern =
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i;

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertNotIncludes(text, unexpected, message = `Unexpected text present: ${unexpected}`) {
  assert.ok(!text.includes(unexpected), message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const closeout = await readFile(closeoutPath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const saveLoadEvidence = await readFile(saveLoadEvidencePath, "utf8");
const cleanupDecision = await readFile(cleanupDecisionPath, "utf8");
const adminBookingsRoute = await readFile(adminBookingsRoutePath, "utf8");

for (const requiredText of [
  `Stage 4A-409 reviewed William's cleanup approval for the exact fake Stage 4A-408 test reference only: \`${testReference}\`.`,
  "The stage used existing saved env only and printed variable names and masked target evidence only.",
  "`.env.local` existed but did not contain the required production persistence env names.",
  "`.env.stage4a388.local` existed and contained the required names.",
  "Approved masked production target: `kvv...atm`.",
  "Target/env confirmation mode: preflight-only.",
  "Preflight live DB touch result: no.",
  "Full project reference printed: no.",
  "Env values printed: no.",
  "Persistence default before closeout: OFF.",
  "The exact fake verification record was not deleted in Stage 4A-409.",
  "safe cleanup is not already supported by the existing `/api/admin-bookings` server-only/admin-gated route",
  "The route exposes GET, POST, and PATCH only; it has no DELETE cleanup method.",
  "This stage did not add a new delete route, raw SQL workflow, Supabase CLI command, migration, dashboard fix, or direct production cleanup helper.",
  `Test reference reviewed: \`${testReference}\`.`,
  "Production DB touched in Stage 4A-409: no.",
  "Production rows deleted: no.",
  "Other production rows touched: no.",
  "Cleanup scope executed: none.",
  "Live route invocation executed: none.",
  "Clearly linked test-only child/audit records touched: no.",
  "Rollback required: no cleanup write was executed.",
  "The fake Stage 4A-408 test record remains as verification evidence.",
  "Persistence default after closeout: OFF.",
  "Future cleanup would need a separately approved server-only/admin-gated cleanup route or command",
]) {
  assertIncludes(closeout, requiredText);
}

for (const envName of [
  "`SUPABASE_URL`",
  "`SUPABASE_SERVICE_ROLE_KEY`",
  "`PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`",
  "`PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE`",
  "`PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE`",
  "`PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`",
]) {
  assertIncludes(closeout, envName);
}

for (const boundary of [
  "No broad production write was attempted.",
  "No real customer data was changed.",
  "No Supabase CLI was run.",
  "No raw SQL was run.",
  "No migration was created or applied.",
  "No dashboard quick fix was used.",
  "No customer auth or driver auth was added.",
  "No customer, driver, public, or anon policy was created.",
  "No billing, payment, invoice, PDF, payout, live-location, notification, proof/photo, parser-learning, parser, or app behavior changed.",
  "No secret, token, URL, key prefix, full project reference, row data, stack trace, SQL detail, or Supabase internal was printed or committed.",
]) {
  assertIncludes(closeout, boundary);
}

for (const method of [
  "export async function GET",
  "export async function POST",
  "export async function PATCH",
]) {
  assertIncludes(adminBookingsRoute, method);
}

for (const unsupportedCleanupText of [
  "export async function DELETE",
  "deleteAdminBooking",
  ".delete(",
  "adminRoute.DELETE",
]) {
  assertNotIncludes(adminBookingsRoute, unsupportedCleanupText);
}

for (const cleanupRequirement of [
  "The exact cleanup reference or references.",
  "The exact cleanup command or route.",
  "Stop before cleanup if any of these appear:",
  "The cleanup command requires Supabase CLI without explicit approval.",
  "The cleanup command requires raw SQL without explicit approval.",
  "The cleanup command affects rows outside the exact approved staging references.",
]) {
  assertIncludes(cleanupDecision, cleanupRequirement);
}

for (const saveLoadText of [
  `Test record reference: \`${testReference}\`.`,
  "Production record deleted: no.",
  "deletion was not approved in Stage 4A-408",
]) {
  assertIncludes(saveLoadEvidence, saveLoadText);
}

assertIncludes(
  docsIndex,
  "[Admin Persistence Production Test Record Closeout Stage 4A-409](admin-persistence-production-test-record-closeout-stage4a409.md)",
  "Docs index must point at the Stage 4A-409 closeout evidence.",
);

for (const [label, text] of [
  ["closeout", closeout],
  ["docsIndex", docsIndex],
  ["saveLoadEvidence", saveLoadEvidence],
  ["cleanupDecision", cleanupDecision],
  ["adminBookingsRoute", adminBookingsRoute],
]) {
  assertNotMatches(text, forbiddenLeakPattern, `${label} secret leak`);
}

assertNotMatches(closeout, /```(?:bash|sql)/i, "closeout must not include runnable shell or SQL blocks");

console.log("Admin persistence production test record closeout Stage 4A-409 audit passed.");
