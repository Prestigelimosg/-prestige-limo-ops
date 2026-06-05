import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql",
);
const productionEvidencePath = path.join(
  process.cwd(),
  "docs/legacy-public-table-rls-production-apply-evidence.md",
);
const hardeningDocPath = path.join(process.cwd(), "docs/legacy-public-table-rls-hardening.md");
const productionGatePath = path.join(process.cwd(), "docs/admin-persistence-production-readiness-gate.md");
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");

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
const productionEvidence = await readFile(productionEvidencePath, "utf8");
const hardeningDoc = await readFile(hardeningDocPath, "utf8");
const productionGate = await readFile(productionGatePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");

const enableMatches = [
  ...migration.matchAll(
    /alter\s+table\s+if\s+exists\s+public\.([a-z_]+)\s+enable\s+row\s+level\s+security\s*;/gi,
  ),
].map((match) => match[1]);

assert.deepEqual(sorted(enableMatches), sorted(targetTables), "migration target table set changed");

for (const table of targetTables) {
  assert.equal(enableMatches.filter((value) => value === table).length, 1, `${table} must appear once`);
  assertIncludes(productionEvidence, `| \`public.${table}\` | yes | 0 | 0 |`, `production evidence ${table}`);
}

for (const forbidden of [
  /create\s+policy/i,
  /\banon\b/i,
  /\bgrant\b/i,
  /drop\s+table/i,
  /delete\s+from/i,
  /insert\s+into/i,
  /update\s+[a-z_]+\s+set/i,
  /\bupsert\b/i,
  /\bdisable\s+row\s+level\s+security\b/i,
]) {
  assertNotMatches(migration, forbidden, `migration ${forbidden}`);
}

for (const requiredText of [
  "Stage 4A-401C",
  "proven production Supabase project",
  "Masked production project reference: `kvv...atm`.",
  "The full production project reference was not recorded.",
  "No policies were included in the migration.",
  "No insert, update, delete, upsert, drop table, grant, or dashboard quick fix was included.",
  "No rollback was executed in Stage 4A-401C.",
  "npx --yes supabase migration list",
  "The production ledger already showed `202606050001` present in both local and remote columns.",
  "The expected pending-migration gate was therefore not met.",
  "No production migration apply command was run in Stage 4A-401C.",
  "The apply command `npx --yes supabase db push` was intentionally not run because the target migration was already present remotely.",
  "Production DB was touched only by read-only migration ledger and read-only catalog verification.",
  "No production persistence enablement was performed.",
]) {
  assertIncludes(productionEvidence, requiredText);
}

for (const requiredText of [
  "Stage 4A-401C Production Result",
  "Read-only production migration ledger verification showed `202606050001` already present remotely.",
  "No production migration apply command was run in Stage 4A-401C because the migration was already present remotely.",
  "Read-only production catalog verification showed zero policies and zero public/anon policy count on all six target tables.",
  "legacy-public-table-rls-production-apply-evidence.md",
]) {
  assertIncludes(hardeningDoc, requiredText);
}

assertIncludes(
  productionGate,
  "Stage 4A-401C proved the approved production target with masked prefix/suffix evidence",
  "production gate Stage 4A-401C result",
);
assertIncludes(
  productionGate,
  "Production persistence enablement remains blocked even though the legacy public-table RLS hardening evidence is now recorded.",
  "production persistence remains blocked",
);
assertIncludes(
  docsIndex,
  "legacy-public-table-rls-production-apply-evidence.md",
  "docs index production evidence reference",
);

for (const [label, text] of [
  ["productionEvidence", productionEvidence],
  ["hardeningDoc", hardeningDoc],
  ["productionGate", productionGate],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
    `${label} secret leak`,
  );
  assertNotMatches(text, /kvvsg[a-z0-9]+hxatm/i, `${label} full project ref leak`);
}

assertNotMatches(productionEvidence, /npx\s+--yes\s+supabase\s+db\s+reset/i, "db reset command");
assertNotMatches(
  productionEvidence,
  /\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)\b[\s\S]{0,120};/i,
  "raw SQL statement in evidence",
);
assertNotMatches(productionEvidence, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/i, "database write helpers");

console.log("Legacy public-table RLS production evidence audit passed.");
