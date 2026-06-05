import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql",
);
const applyEvidencePath = path.join(
  process.cwd(),
  "docs/legacy-public-table-rls-hardening-apply-evidence.md",
);
const decisionPacketPath = path.join(
  process.cwd(),
  "docs/legacy-public-table-rls-production-decision-packet.md",
);
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
const applyEvidence = await readFile(applyEvidencePath, "utf8");
const decisionPacket = await readFile(decisionPacketPath, "utf8");
const productionGate = await readFile(productionGatePath, "utf8");
const docsIndex = await readFile(docsIndexPath, "utf8");

const enableMatches = [
  ...migration.matchAll(
    /alter\s+table\s+if\s+exists\s+public\.([a-z_]+)\s+enable\s+row\s+level\s+security\s*;/gi,
  ),
].map((match) => match[1]);

assert.deepEqual(sorted(enableMatches), sorted(targetTables), "migration must only enable RLS on target tables");

for (const table of targetTables) {
  assert.equal(enableMatches.filter((value) => value === table).length, 1, `${table} must appear once`);
  assertIncludes(applyEvidence, `| \`public.${table}\` | yes | 0 | 0 |`, `apply evidence ${table}`);
  assertIncludes(decisionPacket, `| \`public.${table}\` | yes | 0 | 0 |`, `decision packet ${table}`);
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
  "Stage 4A-400",
  "post-apply review packet only",
  "Production decision: `blocked`.",
  "Production RLS apply is not approved.",
  "Production reads are not approved.",
  "Production writes are not approved.",
  "Production dashboard fixes are not approved.",
  "The Stage 4A-399 staging result is useful evidence, but it is not permission to apply the migration to production.",
  "No Supabase CLI command was run.",
  "No raw SQL was run.",
  "No production project was touched.",
  "No live save/load was run.",
  "No staging row deletion was run.",
  "No env files were printed or committed.",
]) {
  assertIncludes(decisionPacket, requiredText);
}

for (const requiredText of [
  "Confirm the exact production Supabase project without printing URLs, keys, tokens, or env values.",
  "Confirm the production rollback plan before any production apply.",
  "Confirm a production verification plan that checks RLS enabled and no public anon policies without printing sensitive details.",
  "Confirm the admin dashboard still uses the server-only admin route for legacy public-table access.",
  "Confirm `npm run test:safe` passes before and after any future production stage.",
]) {
  assertIncludes(decisionPacket, requiredText);
}

assertIncludes(productionGate, "Stage 4A-400 reviewed the staging evidence and keeps production decision `blocked`.");
assertIncludes(
  productionGate,
  "Stage 4A-400 is a decision packet only; it does not approve production apply, production reads, production writes, dashboard fixes, raw SQL, or live save/load.",
);
assertIncludes(docsIndex, "legacy-public-table-rls-production-decision-packet.md");

for (const [label, text] of [
  ["applyEvidence", applyEvidence],
  ["decisionPacket", decisionPacket],
  ["productionGate", productionGate],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}/,
    `${label} secret leak`,
  );
}

assertNotMatches(decisionPacket, /npx\s+--yes\s+supabase|supabase\s+(?:db|migration)/i, "Stage 4A-400 CLI command text");

console.log("Legacy public-table RLS production decision packet audit passed.");
