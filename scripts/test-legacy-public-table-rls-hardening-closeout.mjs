import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const closeoutPath = path.join(process.cwd(), "docs/legacy-public-table-rls-hardening-closeout.md");
const stagingEvidencePath = path.join(
  process.cwd(),
  "docs/legacy-public-table-rls-hardening-apply-evidence.md",
);
const productionEvidencePath = path.join(
  process.cwd(),
  "docs/legacy-public-table-rls-production-apply-evidence.md",
);
const hardeningDocPath = path.join(process.cwd(), "docs/legacy-public-table-rls-hardening.md");
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

const closeout = await readFile(closeoutPath, "utf8");
const stagingEvidence = await readFile(stagingEvidencePath, "utf8");
const productionEvidence = await readFile(productionEvidencePath, "utf8");
const hardeningDoc = await readFile(hardeningDocPath, "utf8");
const productionGate = await readFile(productionGatePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");
const migration = await readFile(migrationPath, "utf8");

for (const requiredText of [
  "Stage 4A-402",
  "docs-and-tests closeout only",
  "Legacy public-table RLS hardening evidence is complete for both staging and production.",
  "Production persistence remains OFF and is not approved.",
  "No production booking/customer save-load is approved.",
  "No production write is approved.",
  "No production persistence feature flag change is approved.",
  "Option A - Continue Supabase Persistence/Auth Path",
  "Option B - Pause Supabase And Return To App/Business Workflow Work",
  "must not enable production persistence",
  "run Supabase commands",
]) {
  assertIncludes(closeout, requiredText);
}

for (const table of targetTables) {
  assertIncludes(closeout, `| \`public.${table}\` | RLS enabled | RLS enabled | 0 | 0 |`, `closeout row ${table}`);
  assertIncludes(stagingEvidence, `| \`public.${table}\` | yes | 0 | 0 |`, `staging evidence ${table}`);
  assertIncludes(productionEvidence, `| \`public.${table}\` | yes | 0 | 0 |`, `production evidence ${table}`);
}

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

for (const requiredText of [
  "Stage 4A-402 Closeout",
  "Legacy public-table RLS hardening evidence is complete for staging and production.",
  "continue the Supabase persistence/auth path, or pause Supabase and return to app/business workflow work",
  "Stage 4A-402 does not approve production persistence",
]) {
  assertIncludes(hardeningDoc, requiredText);
}

for (const requiredText of [
  "Stage 4A-402 closes out the legacy public-table RLS hardening evidence for staging and production.",
  "Continue Supabase persistence/auth path with a separate production persistence/auth readiness approval stage.",
  "Pause Supabase and return to app/business workflow work without touching live data.",
  "The legacy public table RLS hardening evidence is complete for staging and production",
]) {
  assertIncludes(productionGate, requiredText);
}

assertIncludes(docsIndex, "legacy-public-table-rls-hardening-closeout.md");

for (const [label, text] of [
  ["closeout", closeout],
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

assertNotMatches(closeout, /npx\s+--yes\s+supabase\s+(?:db|migration)/i, "new Supabase CLI command");
assertNotMatches(closeout, /CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE/i, "raw SQL");
assertNotMatches(closeout, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/i, "database write helpers");

console.log("Legacy public-table RLS hardening closeout audit passed.");
