import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const checklistPath = path.join(
  process.cwd(),
  "docs/legacy-public-table-rls-production-target-proof-checklist.md",
);
const productionGatePath = path.join(process.cwd(), "docs/admin-persistence-production-readiness-gate.md");
const docsIndexPath = path.join(process.cwd(), "docs/test-and-safety-docs-index.md");
const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql",
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

const checklist = await readFile(checklistPath, "utf8");
const productionGate = await readFile(productionGatePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const migration = await readFile(migrationPath, "utf8");

for (const requiredText of [
  "Stage 4A-401A",
  "production-target proof planning stage only",
  "Stage 4A-401 stopped before applying because the local Supabase link still matched the masked Stage 4A-399 staging evidence target.",
  "The project display name alone is not production proof.",
  "The local Supabase link points to William's approved production project.",
  "The linked target is not the Stage 4A-399 staging target.",
  "If the staging-vs-production distinction is ambiguous, stop before apply.",
  "the only pending migration is `202606050001_legacy_public_table_rls_hardening.sql`",
  "Any reverse RLS change must be a separate William-approved production rollback stage.",
  "Stage 4A-401A authorizes no Supabase command.",
  "Production target proof remains blocked",
  "Production DB was not touched in Stage 4A-401A.",
]) {
  assertIncludes(checklist, requiredText);
}

for (const table of targetTables) {
  assertIncludes(checklist, `public.${table}`, `checklist table ${table}`);
}

for (const requiredText of [
  "Read-only ledger check before apply: `npx --yes supabase migration list`.",
  "The only migration apply command: `npx --yes supabase db push`.",
  "Read-only ledger check after apply: `npx --yes supabase migration list`.",
  "Sanitized read-only catalog verification for RLS enabled and zero policies on the six target tables.",
]) {
  assertIncludes(checklist, requiredText);
}

for (const requiredText of [
  "must not run `supabase db reset`",
  "raw SQL writes",
  "dashboard quick fixes",
  "data delete",
  "live save/load",
  "production persistence enablement",
  "customer/driver auth or policies",
  "notifications",
  "billing",
  "payment",
  "PDF",
  "payout",
  "live-location",
  "proof/photo",
  "parser-learning",
]) {
  assertIncludes(checklist, requiredText);
}

assertIncludes(
  productionGate,
  "Legacy Public Table RLS Production Target Proof Checklist",
  "production gate target-proof checklist reference",
);
assertIncludes(
  productionGate,
  "Stage 4A-401 stopped before apply because the local Supabase link still matched the masked Stage 4A-399 staging evidence target",
  "production gate stop reason",
);
assertIncludes(
  docsIndex,
  "legacy-public-table-rls-production-target-proof-checklist.md",
  "docs index target-proof checklist reference",
);

const enableMatches = [
  ...migration.matchAll(
    /alter\s+table\s+if\s+exists\s+public\.([a-z_]+)\s+enable\s+row\s+level\s+security\s*;/gi,
  ),
].map((match) => match[1]);

assert.deepEqual(sorted(enableMatches), sorted(targetTables), "migration target table set changed");

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

for (const [label, text] of [
  ["checklist", checklist],
  ["productionGate", productionGate],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
    `${label} secret leak`,
  );
}

assertNotMatches(checklist, /npx\s+--yes\s+supabase\s+db\s+reset/i, "db reset command");
assertNotMatches(checklist, /CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE/i, "raw SQL");
assertNotMatches(checklist, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/i, "database write helpers");

console.log("Legacy public-table RLS production target proof checklist audit passed.");
