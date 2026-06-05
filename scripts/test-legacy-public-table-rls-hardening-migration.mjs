import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const migrationRelativePath =
  "supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql";
const migrationPath = path.join(process.cwd(), migrationRelativePath);
const hardeningDocPath = path.join(process.cwd(), "docs/legacy-public-table-rls-hardening.md");
const hardeningApplyDocPath = path.join(
  process.cwd(),
  "docs/legacy-public-table-rls-hardening-apply-evidence.md",
);
const routeHardeningDocPath = path.join(process.cwd(), "docs/legacy-public-table-server-route-hardening.md");
const productionGatePath = path.join(process.cwd(), "docs/admin-persistence-production-readiness-gate.md");
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const browserAccessRetirementTestPath = path.join(
  process.cwd(),
  "scripts/test-legacy-admin-supabase-browser-access-retired.mjs",
);
const stagingTargetRunnerPath = path.join(
  process.cwd(),
  "scripts/check-legacy-public-table-rls-staging-target-and-state.mjs",
);

const targetTables = [
  "bookers",
  "companies",
  "drivers",
  "rate_settings",
  "saved_addresses",
  "travelers",
];

function assertIncludes(text, expected, label = expected) {
  assert.ok(text.includes(expected), `Missing required text: ${label}`);
}

function assertNotMatches(text, pattern, label = String(pattern)) {
  assert.doesNotMatch(text, pattern, `Forbidden pattern present: ${label}`);
}

function sorted(values) {
  return [...values].sort((first, second) => first.localeCompare(second));
}

const migration = await readFile(migrationPath, "utf8");
const hardeningDoc = await readFile(hardeningDocPath, "utf8");
const hardeningApplyDoc = await readFile(hardeningApplyDocPath, "utf8");
const routeHardeningDoc = await readFile(routeHardeningDocPath, "utf8");
const productionGate = await readFile(productionGatePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const stagingTargetRunner = await readFile(stagingTargetRunnerPath, "utf8");
const { verifyCatalogQueryPayload } = await import(pathToFileURL(stagingTargetRunnerPath).href);

const enableMatches = [
  ...migration.matchAll(
    /alter\s+table\s+if\s+exists\s+public\.([a-z_]+)\s+enable\s+row\s+level\s+security\s*;/gi,
  ),
].map((match) => match[1]);

assert.deepEqual(sorted(enableMatches), sorted(targetTables), "migration must enable RLS for exactly six target tables");

for (const table of targetTables) {
  const pattern = new RegExp(
    `alter\\s+table\\s+if\\s+exists\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security\\s*;`,
    "i",
  );

  assert.match(migration, pattern, `Missing RLS enablement for public.${table}`);
  assert.equal(enableMatches.filter((enabledTable) => enabledTable === table).length, 1, `${table} must appear once`);
}

assertNotMatches(migration, /create\s+policy/i, "policy creation");
assertNotMatches(migration, /\banon\b/i, "anon role");
assertNotMatches(migration, /\bgrant\b/i, "grant statement");
assertNotMatches(migration, /drop\s+table/i, "drop table");
assertNotMatches(migration, /delete\s+from/i, "delete from");
assertNotMatches(migration, /insert\s+into/i, "insert into");
assertNotMatches(migration, /update\s+[a-z_]+\s+set/i, "update statement");
assertNotMatches(migration, /\bupsert\b/i, "upsert");
assertNotMatches(migration, /\bdisable\s+row\s+level\s+security\b/i, "disable RLS");

for (const requiredText of [
  "Stage 4A-398",
  "Stage 4A-399",
  "Stage 4A-397 first moved the admin dashboard away from browser-side direct Supabase access",
  "Stage 4A-399 later applied that same migration to the approved staging Supabase project only",
  "Read-only catalog verification showed RLS enabled on all six target tables",
  "Read-only catalog verification showed zero policies and zero public/anon policy count on all six target tables",
  "No public anon policies are added",
  "No data is deleted",
  "Production enablement remains not approved",
  migrationRelativePath,
]) {
  assertIncludes(hardeningDoc, requiredText);
}

for (const table of targetTables) {
  assertIncludes(hardeningDoc, `public.${table}`, `hardening doc table ${table}`);
}

for (const requiredText of [
  "Stage 4A-399",
  "approved staging Supabase project only",
  "Masked linked project reference",
  "No env values, URLs, key prefixes, service-role values, session tokens, row data, stack traces, or Supabase internals were recorded.",
  "No policies were included in the migration.",
  "No rollback was executed in Stage 4A-399.",
  "Pre-apply remote migration ledger showed only `202606050001` pending.",
  "Apply prompt listed only `202606050001_legacy_public_table_rls_hardening.sql`.",
  "npx --yes supabase db push",
  "Post-apply remote migration ledger showed `202606050001` present in both local and remote columns.",
  "Docker-dependent schema dump verification was unavailable",
  "No production project was touched.",
  "No public anon policies were created.",
]) {
  assertIncludes(hardeningApplyDoc, requiredText);
}

for (const table of targetTables) {
  assertIncludes(hardeningApplyDoc, `public.${table}`, `apply doc table ${table}`);
}

assertIncludes(routeHardeningDoc, "Stage 4A-397");
assertIncludes(routeHardeningDoc, "RLS hardening is still a separate backend security stage");
assertIncludes(productionGate, "Stage 4A-398 created a local RLS hardening migration draft");
assertIncludes(productionGate, "Stage 4A-399 applied and verified that draft in approved staging only");
assertIncludes(productionGate, "production still requires separate explicit William approval");
assertIncludes(docsIndex, "legacy-public-table-rls-hardening.md");
assertIncludes(docsIndex, "legacy-public-table-rls-hardening-apply-evidence.md");

for (const requiredText of [
  "parseEnvFile",
  "validateEnv",
  "linked_project_matches_ignored_staging_env",
  "linked_project_matches_prior_apply_target",
  "--verify-catalog-output",
  "public_anon_policy_count",
  "policy_count",
]) {
  assertIncludes(stagingTargetRunner, requiredText);
}

assertNotMatches(stagingTargetRunner, /supabase\s+(?:db|migration)|npx\s+--yes\s+supabase/i, "runner CLI spawn");

for (const [label, text] of [
  ["hardeningDoc", hardeningDoc],
  ["hardeningApplyDoc", hardeningApplyDoc],
  ["stagingTargetRunner", stagingTargetRunner],
]) {
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
    `${label} secret leak`,
  );
}

const mockCatalogVerification = verifyCatalogQueryPayload(
  JSON.stringify({
    rows: targetTables.map((table) => ({
      policy_count: 0,
      public_anon_policy_count: 0,
      rls_enabled: true,
      table_name: table,
    })),
  }),
);

assert.deepEqual(
  mockCatalogVerification.rlsEnabled,
  targetTables.map((table) => `public.${table}`).sort(),
);
assert.equal(mockCatalogVerification.policyCount, 0);
assert.equal(mockCatalogVerification.publicAnonPoliciesCreated, false);

execFileSync(process.execPath, [browserAccessRetirementTestPath], {
  encoding: "utf8",
  stdio: "pipe",
});

console.log("Legacy public-table RLS hardening migration draft audit passed.");
