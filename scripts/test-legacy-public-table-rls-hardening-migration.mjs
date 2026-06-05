import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationRelativePath =
  "supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql";
const migrationPath = path.join(process.cwd(), migrationRelativePath);
const hardeningDocPath = path.join(process.cwd(), "docs/legacy-public-table-rls-hardening.md");
const routeHardeningDocPath = path.join(process.cwd(), "docs/legacy-public-table-server-route-hardening.md");
const productionGatePath = path.join(process.cwd(), "docs/admin-persistence-production-readiness-gate.md");
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const browserAccessRetirementTestPath = path.join(
  process.cwd(),
  "scripts/test-legacy-admin-supabase-browser-access-retired.mjs",
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
const routeHardeningDoc = await readFile(routeHardeningDocPath, "utf8");
const productionGate = await readFile(productionGatePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");

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
  "Stage 4A-397 first moved the admin dashboard away from browser-side direct Supabase access",
  "it has not been applied to any Supabase project",
  "Supabase command/apply requires separate explicit William approval",
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

assertIncludes(routeHardeningDoc, "Stage 4A-397");
assertIncludes(routeHardeningDoc, "RLS hardening is still a separate backend security stage");
assertIncludes(productionGate, "Stage 4A-398 created a local RLS hardening migration draft");
assertIncludes(productionGate, "it has not been applied");
assertIncludes(productionGate, "Supabase command/apply still requires separate explicit William approval");
assertIncludes(docsIndex, "legacy-public-table-rls-hardening.md");

execFileSync(process.execPath, [browserAccessRetirementTestPath], {
  encoding: "utf8",
  stdio: "pipe",
});

console.log("Legacy public-table RLS hardening migration draft audit passed.");
