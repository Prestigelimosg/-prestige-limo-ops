import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const files = {
  adminRoute: "app/api/admin-bookings/route.ts",
  apiEvidence: "docs/admin-persistence-api-staging-save-load-success-evidence.md",
  cleanupDecision: "docs/admin-persistence-staging-cleanup-decision.md",
  cleanupTest: "scripts/test-admin-persistence-staging-cleanup-decision.mjs",
  docsIndex: "docs/test-and-safety-docs-index.md",
  productionGate: "docs/admin-persistence-production-readiness-gate.md",
  productionRlsEvidence: "docs/legacy-public-table-rls-production-apply-evidence.md",
  productionTest: "scripts/test-admin-persistence-production-readiness-gate.mjs",
  readonlyEnvEvidence: "docs/admin-persistence-staging-readonly-env-key-confirmed.md",
  serverAdapter: "lib/admin-booking-supabase-adapter.ts",
  serverAuth: "lib/admin-dispatcher-auth-boundary.ts",
  serverEvidence: "docs/admin-persistence-staging-save-load-success-evidence.md",
};

const forbiddenLeakPattern =
  /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/;
const forbiddenCommandPattern =
  /supabase\s+(?:db|migration)|CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/i;

async function readWorkspaceFile(relativePath) {
  return readFile(path.join(process.cwd(), relativePath), "utf8");
}

function assertIncludes(text, expected, label = expected) {
  assert.ok(text.includes(expected), `Missing production-readiness gate text: ${label}`);
}

function assertNotMatches(text, pattern, label) {
  assert.doesNotMatch(text, pattern, `Forbidden production-readiness gate pattern: ${label}`);
}

const contents = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, relativePath]) => [key, await readWorkspaceFile(relativePath)]),
  ),
);

for (const expected of [
  "Stage 4A-393 server-only adapter staging save/load succeeded.",
  "Stage 4A-394 admin API-route staging save/load succeeded.",
  "Production enablement is not approved.",
  "Production readiness is currently `blocked`.",
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
  "Staging evidence exists, but production env is not verified.",
  "Production feature flag remains OFF.",
  "Staging verification rows may exist and need a separate cleanup decision.",
  "Stage 4A-401C proved the approved production target with masked prefix/suffix evidence",
  "Production persistence enablement remains blocked even though the legacy public-table RLS hardening evidence is now recorded.",
]) {
  assertIncludes(contents.productionGate, expected);
}

for (const expected of [
  "public.companies",
  "public.bookers",
  "public.saved_addresses",
  "public.rate_settings",
  "public.travelers",
  "public.drivers",
]) {
  assertIncludes(contents.productionGate, expected);
}

for (const expected of [
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
  assertIncludes(contents.productionGate, expected);
}

for (const expected of [
  "Staging cleanup write/delete is not approved.",
  "No staging row deletion was performed in Stage 4A-395.",
  "Cleanup is not required to prove the local production-readiness gate.",
  "Any future staging cleanup workflow requires separate explicit William approval before any write/delete is attempted.",
]) {
  assertIncludes(contents.cleanupDecision, expected);
}

assertIncludes(contents.serverEvidence, "Stage 4A-393");
assertIncludes(contents.apiEvidence, "Stage 4A-394");
assertIncludes(contents.readonlyEnvEvidence, "Stage 4A-392");
assertIncludes(contents.productionRlsEvidence, "Stage 4A-401C");
assertIncludes(contents.productionRlsEvidence, "No production persistence enablement was performed.");
assertIncludes(contents.docsIndex, "admin-persistence-production-readiness-gate.md");
assertIncludes(contents.docsIndex, "admin-persistence-staging-cleanup-decision.md");
assertIncludes(contents.adminRoute, "requireAdminDispatcherBoundary");
assertIncludes(contents.serverAuth, "server-session-token");
assertIncludes(contents.serverAdapter, "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === \"true\"");
assertIncludes(contents.productionTest, "Production enablement is not approved.");
assertIncludes(contents.cleanupTest, "Staging cleanup write/delete is not approved.");

for (const [label, text] of Object.entries(contents)) {
  assertNotMatches(text, forbiddenLeakPattern, `${label} leak scan`);
}

for (const [label, text] of Object.entries({
  cleanupDecision: contents.cleanupDecision,
  productionGate: contents.productionGate,
  productionTest: contents.productionTest,
  cleanupTest: contents.cleanupTest,
})) {
  assertNotMatches(text, forbiddenCommandPattern, `${label} command/write scan`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: "local-readonly",
      stage: "4A-395",
      liveSaveLoadAttempted: false,
      productionApproved: false,
      productionWritesApproved: false,
      stagingCleanupApproved: false,
      supabaseCliApproved: false,
      migrationsApproved: false,
      rawSqlWritesApproved: false,
      dashboardFixApproved: false,
      blockers: [
        "production_env_not_verified",
        "production_feature_flag_off",
        "production_persistence_enablement_requires_separate_approval",
        "staging_cleanup_requires_separate_approval_if_desired",
      ],
      evidence: [
        "stage_4a_392_readonly_env_key_confirmed",
        "stage_4a_393_server_adapter_save_load_passed",
        "stage_4a_394_admin_api_route_save_load_passed",
        "stage_4a_401c_legacy_public_table_rls_production_evidence_recorded",
      ],
    },
    null,
    2,
  ),
);
