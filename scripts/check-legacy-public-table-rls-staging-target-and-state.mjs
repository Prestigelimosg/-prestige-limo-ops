import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  parseEnvFile,
  validateEnv,
} from "./check-admin-booking-staging-readonly-contract.mjs";

const stage = "4A-399";
const migrationRelativePath =
  "supabase/migrations/202606050001_legacy_public_table_rls_hardening.sql";
const migrationPath = path.join(process.cwd(), migrationRelativePath);
const envPath = path.join(process.cwd(), ".env.stage4a388.local");
const linkedProjectRefPath = path.join(process.cwd(), "supabase/.temp/project-ref");
const linkedPoolerUrlPath = path.join(process.cwd(), "supabase/.temp/pooler-url");
const priorApplyDocPath = path.join(process.cwd(), "docs/business-grade-completion-roadmap.md");
const readonlyEvidencePath = path.join(process.cwd(), "docs/admin-persistence-staging-readonly-env-key-confirmed.md");
const serverSaveLoadEvidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-staging-save-load-success-evidence.md",
);
const apiSaveLoadEvidencePath = path.join(
  process.cwd(),
  "docs/admin-persistence-api-staging-save-load-success-evidence.md",
);

const targetTables = [
  "bookers",
  "companies",
  "drivers",
  "rate_settings",
  "saved_addresses",
  "travelers",
];

const placeholderPattern =
  /^(?:|todo|tbd|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example|YOUR_PROJECT_REF|YOUR_SERVICE_ROLE)$/i;
const productionPattern = /(?:^|[-_\s./])(prod|production|live)(?:[-_\s./]|$)/i;

function emit(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function fail(category, extra = {}) {
  emit({
    ok: false,
    stage,
    category,
    ...extra,
  });
  process.exit(1);
}

function maskRef(value) {
  const normalized = String(value || "").trim();

  if (normalized.length <= 6) {
    return "masked";
  }

  return `${normalized.slice(0, 3)}...${normalized.slice(-3)}`;
}

function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const [projectRef, ...rest] = url.hostname.split(".");

    if (rest.join(".") !== "supabase.co") {
      return null;
    }

    return projectRef || null;
  } catch {
    return null;
  }
}

async function readRequiredFile(filePath, category) {
  if (!existsSync(filePath)) {
    fail(category);
  }

  return readFile(filePath, "utf8");
}

function assertNoUnsafeEnv(env) {
  for (const [key, value] of Object.entries(env)) {
    const normalized = String(value || "").trim();

    if (placeholderPattern.test(normalized)) {
      fail("placeholder_env_refused", { variable: key });
    }

    if (productionPattern.test(normalized)) {
      fail("production_env_refused", { variable: key });
    }
  }
}

async function assertStagingTarget() {
  const envText = await readRequiredFile(envPath, "env_missing");
  const env = parseEnvFile(envText);
  const validation = validateEnv(env);

  if (!validation.ok) {
    fail(validation.category || "env_invalid");
  }

  assertNoUnsafeEnv(env);

  const envProjectRef = projectRefFromSupabaseUrl(env.SUPABASE_URL);

  if (!envProjectRef) {
    fail("supabase_url_project_ref_unreadable");
  }

  const linkedProjectRef = (await readRequiredFile(linkedProjectRefPath, "linked_project_ref_missing")).trim();

  if (!linkedProjectRef || placeholderPattern.test(linkedProjectRef) || productionPattern.test(linkedProjectRef)) {
    fail("linked_project_ref_unsafe");
  }

  if (envProjectRef !== linkedProjectRef) {
    fail("staging_target_mismatch");
  }

  if (!existsSync(linkedPoolerUrlPath)) {
    fail("linked_pooler_url_missing");
  }

  const [priorApplyDoc, readonlyEvidence, serverSaveLoadEvidence, apiSaveLoadEvidence] = await Promise.all([
    readRequiredFile(priorApplyDocPath, "prior_apply_doc_missing"),
    readRequiredFile(readonlyEvidencePath, "readonly_evidence_missing"),
    readRequiredFile(serverSaveLoadEvidencePath, "server_save_load_evidence_missing"),
    readRequiredFile(apiSaveLoadEvidencePath, "api_save_load_evidence_missing"),
  ]);

  assert.ok(
    priorApplyDoc.includes(linkedProjectRef),
    "linked project must match the previously documented apply target",
  );
  assert.ok(
    readonlyEvidence.includes("The staging env/key was accepted for read-only server-side Supabase checks."),
    "staging read-only evidence must be present",
  );
  assert.ok(
    serverSaveLoadEvidence.includes("Stage 4A-393 attempted exactly one William-approved controlled staging save-load"),
    "server adapter staging evidence must be present",
  );
  assert.ok(
    apiSaveLoadEvidence.includes("Stage 4A-394 attempted exactly one William-approved controlled staging save-load verification"),
    "API-route staging evidence must be present",
  );

  return {
    envFile: "present_ignored_local_only",
    linkedProjectRef: maskRef(linkedProjectRef),
    stagingEvidence: [
      "env_key_readonly_accepted",
      "server_adapter_staging_save_load_passed",
      "api_route_staging_save_load_passed",
      "linked_project_matches_ignored_staging_env",
      "linked_project_matches_prior_apply_target",
    ],
  };
}

async function auditMigration() {
  const migration = await readRequiredFile(migrationPath, "migration_missing");
  const enableMatches = [
    ...migration.matchAll(
      /alter\s+table\s+if\s+exists\s+public\.([a-z_]+)\s+enable\s+row\s+level\s+security\s*;/gi,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(
    [...enableMatches].sort(),
    [...targetTables].sort(),
    "migration must enable RLS for exactly the six legacy public tables",
  );

  for (const table of targetTables) {
    assert.equal(enableMatches.filter((value) => value === table).length, 1, `${table} must appear once`);
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
    assert.doesNotMatch(migration, forbidden);
  }

  return {
    migration: migrationRelativePath,
    targetTables: targetTables.map((table) => `public.${table}`),
    policiesAdded: false,
    dataOperations: false,
  };
}

function parseJsonObjectFromCliOutput(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    fail("catalog_query_json_missing");
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    fail("catalog_query_json_invalid");
  }
}

export function verifyCatalogQueryPayload(text) {
  const payload = parseJsonObjectFromCliOutput(text);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  assert.deepEqual(
    rows.map((row) => row.table_name).sort(),
    [...targetTables].sort(),
    "catalog query must return exactly the six target tables",
  );

  const missingRls = rows
    .filter((row) => row.rls_enabled !== true)
    .map((row) => `public.${row.table_name}`);
  const publicAnonPolicies = rows
    .filter((row) => Number(row.public_anon_policy_count) !== 0)
    .map((row) => `public.${row.table_name}`);
  const policies = rows
    .filter((row) => Number(row.policy_count) !== 0)
    .map((row) => `public.${row.table_name}`);

  if (missingRls.length > 0) {
    fail("remote_rls_not_enabled", { missingRls });
  }

  if (publicAnonPolicies.length > 0) {
    fail("remote_public_anon_policy_present", { publicAnonPolicies });
  }

  if (policies.length > 0) {
    fail("remote_policy_present", { policies });
  }

  return {
    rlsEnabled: rows.map((row) => `public.${row.table_name}`).sort(),
    policyCount: 0,
    publicAnonPoliciesCreated: false,
  };
}

async function main() {
  const catalogArgIndex = process.argv.indexOf("--verify-catalog-output");
  const mode = catalogArgIndex === -1 ? "target-preflight" : "catalog-output-verify";
  const target = await assertStagingTarget();
  const migration = await auditMigration();

  if (mode === "target-preflight") {
    emit({
      ok: true,
      stage,
      mode,
      target,
      migration,
      rollbackPlan:
        "separate_approved_staging_only_rollback_required_before_any_reverse_rls_change",
      liveSaveLoadAttempted: false,
      productionTouched: false,
      secretsPrinted: false,
    });
    return;
  }

  const catalogOutputPath = process.argv[catalogArgIndex + 1];

  if (!catalogOutputPath) {
    fail("catalog_output_path_missing");
  }

  const catalogOutput = await readRequiredFile(path.resolve(catalogOutputPath), "catalog_output_missing");
  const remote = verifyCatalogQueryPayload(catalogOutput);

  emit({
    ok: true,
    stage,
    mode,
    target,
    migration,
    remote,
    liveSaveLoadAttempted: false,
    productionTouched: false,
    secretsPrinted: false,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  await main();
}
