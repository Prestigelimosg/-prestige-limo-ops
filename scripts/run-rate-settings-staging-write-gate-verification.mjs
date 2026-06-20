import { constants, existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_RATE_SETTINGS_STAGING_WRITE_VERIFICATION_APPROVED";
const approvalValue = "b3f858e-william-approved";
const rateSettingsGateEnvName = "PRESTIGE_RATE_SETTINGS_WRITE_ENABLED";
const envFilePath = path.join(process.cwd(), ".env.stage4a388.local");
const stagingUrl = "https://prestige-limo-ops-staging.vercel.app";
const stagingRoutePath = "/api/admin-rate-settings-runtime-write-action";
const expectedStagingCommit = "b3f858e774ed63180ab3cd47b026a0238b4f0c30";
const expectedProjectName = "prestige-limo-ops-staging";
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-rate-settings-staging-write-gate-verification-attempted.marker",
);
const dryRun = process.argv.includes("--dry-run");

const sourceFiles = [
  "lib/admin-rate-settings-write-action-disabled-setup.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/admin-rate-settings-runtime-write-action.ts",
  "app/api/admin-rate-settings-runtime-write-action/route.ts",
];
const adapterStubPath = "lib/admin-booking-supabase-adapter.ts";
const requiredEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
];
const allowedScalarFields = [
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
  "extra_stop_payout",
  "extra_stop_surcharge",
  "id",
  "midnight_payout",
  "midnight_surcharge",
];
const writableScalarFields = allowedScalarFields.filter((field) => field !== "id");
const rateSettingsWriteSelect = allowedScalarFields.join(", ");
const forbiddenFieldPattern =
  /customer_rates|driver_payout_rules|customer_price|rate_override|pricing_source|pricing_snapshot|payout_snapshot|paynow|pay_now|payment|billing|invoice|pdf|finance|provider|send_state|send_log|auth_session|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;

function emitEvidence(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function failSafely(code, extra = {}) {
  emitEvidence({
    ok: false,
    error: code,
    ...extra,
  });
  process.exit(1);
}

function parseEnvFile(text) {
  const env = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    let value = match[2].trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
}

function looksPlaceholder(value) {
  return /^(?:|todo|tbd|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example|YOUR_PROJECT_REF|YOUR_SERVICE_ROLE)$/i.test(
    value.trim(),
  );
}

function looksProduction(value) {
  return /(?:^|[-_\s./])(prod|production|live)(?:[-_\s./]|$)/i.test(value.trim());
}

function validateEnv(env) {
  const invalid = [];
  const missing = [];
  const placeholder = [];
  const unsafe = [];

  for (const key of requiredEnvKeys) {
    const value = String(env[key] ?? "").trim();

    if (!value) {
      missing.push(key);
    } else if (looksPlaceholder(value)) {
      placeholder.push(key);
    } else if (looksProduction(value)) {
      unsafe.push(key);
    }
  }

  if (env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE !== "server-session-token") {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE");
  }

  if (!["admin", "dispatcher"].includes(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE)) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE");
  }

  return {
    invalid,
    missing,
    placeholder,
    unsafe,
  };
}

function applyLoadedEnv(env) {
  for (const key of requiredEnvKeys) {
    process.env[key] = String(env[key] ?? "").trim();
  }

  process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL =
    process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL ||
    "Rate settings staging verifier";
  process.env[rateSettingsGateEnvName] = "false";
}

function shortHash(hash) {
  return hash.slice(0, 7);
}

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function classifyDatabaseFailure(error) {
  const values = Object.values(error || {})
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).toLowerCase())
    .join(" ");
  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.status);

  if (status === 401 || code === "401" || values.includes("invalid jwt")) {
    return "auth_or_key_rejected";
  }

  if (
    status === 403 ||
    code === "42501" ||
    values.includes("permission denied") ||
    values.includes("row level security")
  ) {
    return "permission_or_rls_denied";
  }

  if (code === "42p01" || (values.includes("relation") && values.includes("does not exist"))) {
    return "table_unreachable";
  }

  if (code === "42703" || code === "pgrst204" || values.includes("column")) {
    return "column_missing";
  }

  if (code === "pgrst116") {
    return "default_row_missing";
  }

  return "unknown_adapter_failure";
}

function finiteNonNegativeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function canonicalRateSettingsRecord(record) {
  if (!record || String(record.id || "").toLowerCase() !== "default") {
    return null;
  }

  const normalized = {
    id: "default",
  };

  for (const field of writableScalarFields) {
    normalized[field] = finiteNonNegativeNumber(record[field]);
  }

  return normalized;
}

function buildSameValuePayload(record) {
  const payload = {
    id: "default",
  };

  for (const field of writableScalarFields) {
    if (record[field] !== null) {
      payload[field] = record[field];
    }
  }

  return payload;
}

function writableFieldCount(payload) {
  return writableScalarFields.filter((field) => payload[field] !== undefined).length;
}

function assertSafeRateSettingsRecord(record, label) {
  const keys = Object.keys(record || {}).sort();
  const unexpectedKeys = keys.filter((key) => !allowedScalarFields.includes(key));

  if (unexpectedKeys.length > 0 || forbiddenFieldPattern.test(JSON.stringify(record || {}))) {
    failSafely("rate_settings_record_field_check_failed", {
      label,
      unexpectedKeys,
    });
  }
}

function assertSameScalarValues(expected, actual) {
  const mismatchedFields = [];

  for (const field of Object.keys(expected)) {
    if (field === "id") {
      if (actual?.id !== "default") {
        mismatchedFields.push(field);
      }
      continue;
    }

    if (Number(actual?.[field]) !== Number(expected[field])) {
      mismatchedFields.push(field);
    }
  }

  if (mismatchedFields.length > 0) {
    failSafely("rate_settings_same_value_write_mismatch", {
      mismatchedFields,
    });
  }
}

async function verifyStagingTarget() {
  const head = runGit(["rev-parse", "HEAD"]);
  const remoteLine = runGit(["ls-remote", "--heads", "origin", "staging"]);
  const remoteHash = remoteLine.split(/\s+/)[0] || "";
  const projectConfig = JSON.parse(readFileSync(".vercel/project.json", "utf8"));

  if (head !== expectedStagingCommit || remoteHash !== expectedStagingCommit) {
    failSafely("staging_target_commit_mismatch", {
      expected: expectedStagingCommit,
      head: shortHash(head),
      remoteStaging: shortHash(remoteHash),
    });
  }

  if (projectConfig.projectName !== expectedProjectName) {
    failSafely("staging_project_name_mismatch", {
      expectedProjectName,
      projectName: projectConfig.projectName || "missing",
    });
  }

  const rootResponse = await fetch(`${stagingUrl}/`, { method: "GET" });

  if (rootResponse.status !== 200) {
    failSafely("staging_root_safe_get_failed", {
      status: rootResponse.status,
    });
  }

  const getRouteResponse = await fetch(`${stagingUrl}${stagingRoutePath}`, { method: "GET" });

  if (getRouteResponse.status !== 405) {
    failSafely("staging_rate_settings_runtime_route_get_boundary_failed", {
      status: getRouteResponse.status,
    });
  }

  return {
    commit: head,
    projectName: projectConfig.projectName,
    routeGetBoundaryStatus: getRouteResponse.status,
    rootStatus: rootResponse.status,
    url: stagingUrl,
  };
}

async function readExistingRateSettingsDefault() {
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
      },
    },
  );
  const { data, error } = await client
    .from("rate_settings")
    .select(rateSettingsWriteSelect)
    .eq("id", "default")
    .single();

  if (error) {
    failSafely("rate_settings_default_read_failed", {
      category: classifyDatabaseFailure(error),
    });
  }

  const record = canonicalRateSettingsRecord(data);

  if (!record) {
    failSafely("rate_settings_default_row_missing_or_invalid");
  }

  assertSafeRateSettingsRecord(record, "baseline_rate_settings_default");

  const payload = buildSameValuePayload(record);

  if (writableFieldCount(payload) === 0) {
    failSafely("rate_settings_default_has_no_writable_scalar_values");
  }

  return {
    fieldCount: writableFieldCount(payload),
    payload,
  };
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function writeRuntimeModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const tempSupabaseDir = path.join(tempDir, "node_modules/@supabase");
  const workspaceSupabaseDir = path.join(process.cwd(), "node_modules/@supabase");
  const adapterPath = path.join(tempDir, adapterStubPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(tempSupabaseDir, { recursive: true });
  await mkdir(path.dirname(adapterPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    adapterPath,
    [
      "function adminDispatcherBoundaryToPersistenceAdapterActor(context) {",
      "  return {",
      "    actor_label: context.actorLabel || 'Rate settings staging verifier',",
      "    actor_role: context.role === 'dispatcher' ? 'dispatcher' : 'admin',",
      "    boundary_mode: context.mode,",
      "    source_surface: 'admin_api',",
      "  };",
      "}",
      "module.exports = { adminDispatcherBoundaryToPersistenceAdapterActor };",
    ].join("\n"),
  );

  try {
    await symlink(
      path.join(workspaceSupabaseDir, "supabase-js"),
      path.join(tempSupabaseDir, "supabase-js"),
      "dir",
    );
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-rate-settings-staging-write-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    route: require(path.join(
      tempDir,
      "app/api/admin-rate-settings-runtime-write-action/route.js",
    )),
  };
}

function adminHeaders(overrides = {}) {
  return {
    "content-type": "application/json",
    origin: stagingUrl,
    referer: `${stagingUrl}/`,
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
    ...overrides,
  };
}

function requestWithJson(body, headers, method = "POST") {
  return new Request(`${stagingUrl}${stagingRoutePath}`, {
    body: JSON.stringify(body),
    headers,
    method,
  });
}

async function readResponse(response) {
  const text = await response.text();

  return {
    body: text ? JSON.parse(text) : {},
    status: response.status,
  };
}

function safeResultName(result) {
  if (result?.status === 200 && result?.body?.ok === true) {
    return "passed";
  }

  if (result?.status === 400 && result?.body?.ok === false) {
    return "rejected-400";
  }

  if (result?.status === 403 && result?.body?.ok === false) {
    return "blocked-403";
  }

  if (result?.status === 503 && result?.body?.ok === false) {
    return "blocked-503";
  }

  return result?.status ? `unexpected-${result.status}` : "unexpected";
}

function createUnsafePayload() {
  return {
    customer_rates: [{ amount: 250 }],
    driver_payout_rules: [{ amount: 80 }],
    id: "default",
    pricing_source: "manual rate override",
  };
}

async function assertExpected(label, promise, expectedStatus, expectedBody = {}) {
  const result = await readResponse(await promise);

  if (result.status !== expectedStatus) {
    failSafely("unexpected_route_status", {
      expectedStatus,
      label,
      status: result.status,
    });
  }

  for (const [key, value] of Object.entries(expectedBody)) {
    if (result.body?.[key] !== value) {
      failSafely("unexpected_route_body", {
        expected: key,
        label,
      });
    }
  }

  return result;
}

async function assertDeployedClosedGate(payload) {
  const response = await fetch(`${stagingUrl}${stagingRoutePath}`, {
    body: JSON.stringify(payload),
    headers: adminHeaders(),
    method: "POST",
  });
  const result = await readResponse(response);

  if (
    result.status !== 503 ||
    result.body?.reason !== "write_gate_closed" ||
    result.body?.database_client_enabled !== false ||
    result.body?.write_enabled !== false
  ) {
    failSafely("deployed_staging_closed_gate_proof_failed", {
      result: safeResultName(result),
      status: result.status,
    });
  }

  return result;
}

async function createLiveAttemptMarker() {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      "Rate settings staging write gate verification attempted\n",
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_rate_settings_staging_write_already_attempted");
    }

    throw error;
  }
}

async function main() {
  if (!dryRun && process.env[approvalEnvName] !== approvalValue) {
    failSafely("missing_explicit_owner_approval_env", {
      requiredApprovalEnvName: approvalEnvName,
    });
  }

  if (!existsSync(envFilePath)) {
    failSafely("missing_ignored_stage_env_file", {
      requiredEnvFileName: ".env.stage4a388.local",
    });
  }

  const loadedEnv = parseEnvFile(await readFile(envFilePath, "utf8"));
  const envValidation = validateEnv(loadedEnv);

  if (
    envValidation.missing.length > 0 ||
    envValidation.placeholder.length > 0 ||
    envValidation.unsafe.length > 0 ||
    envValidation.invalid.length > 0
  ) {
    failSafely("env_preflight_failed", {
      invalid: envValidation.invalid,
      missing: envValidation.missing,
      placeholder: envValidation.placeholder,
      unsafeProductionLooking: envValidation.unsafe,
    });
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    failSafely("runtime_environment_refused");
  }

  applyLoadedEnv(loadedEnv);

  const stagingTarget = await verifyStagingTarget();
  const { payload, fieldCount } = await readExistingRateSettingsDefault();
  const { route } = await loadHarness();
  const unsafePayload = createUnsafePayload();

  process.env[rateSettingsGateEnvName] = "false";
  const closedGateBefore = await assertExpected(
    "closed_gate_before",
    route.POST(requestWithJson(payload, adminHeaders())),
    503,
    {
      ok: false,
      reason: "write_gate_closed",
    },
  );

  if (closedGateBefore.body?.database_client_enabled !== false) {
    failSafely("closed_gate_created_database_client");
  }

  process.env[rateSettingsGateEnvName] = "true";
  const blockedProbeResults = {
    customerReferer: safeResultName(
      await assertExpected(
        "customer_referer",
        route.POST(
          requestWithJson(
            unsafePayload,
            adminHeaders({
              referer: `${stagingUrl}/book`,
            }),
          ),
        ),
        403,
        {
          ok: false,
        },
      ),
    ),
    publicOrigin: safeResultName(
      await assertExpected(
        "public_origin",
        route.POST(
          requestWithJson(
            unsafePayload,
            adminHeaders({
              origin: "https://public.example.invalid",
            }),
          ),
        ),
        403,
        {
          ok: false,
        },
      ),
    ),
    wrongToken: safeResultName(
      await assertExpected(
        "wrong_token",
        route.POST(
          requestWithJson(
            unsafePayload,
            adminHeaders({
              "x-prestige-admin-session-token": "wrong-token",
            }),
          ),
        ),
        403,
        {
          ok: false,
        },
      ),
    ),
  };

  const unsafeProbe = await assertExpected(
    "unsafe_fields",
    route.POST(requestWithJson(unsafePayload, adminHeaders())),
    400,
    {
      ok: false,
      reason: "unsafe_or_unknown_fields",
    },
  );

  if (unsafeProbe.body?.database_client_enabled !== false) {
    failSafely("unsafe_probe_created_database_client");
  }

  if (dryRun) {
    process.env[rateSettingsGateEnvName] = "false";
    emitEvidence({
      ok: true,
      dryRun: true,
      envValuesPrinted: false,
      gateStatus: {
        closedGateBefore: safeResultName(closedGateBefore),
        unsafeFieldProbe: safeResultName(unsafeProbe),
        ...blockedProbeResults,
      },
      liveDbWriteAttempted: false,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      noRawSql: true,
      noMigration: true,
      noProductionWrite: true,
      safeScalarFieldCount: fieldCount,
      stage: "rate-settings-staging-write-gate-verification-dry-run",
      stagingDbReadForBaseline: true,
      stagingTarget: {
        commit: shortHash(stagingTarget.commit),
        projectName: stagingTarget.projectName,
        routeGetBoundaryStatus: stagingTarget.routeGetBoundaryStatus,
        rootStatus: stagingTarget.rootStatus,
        url: stagingTarget.url,
      },
    });
    return;
  }

  await createLiveAttemptMarker();

  const rateSettingsSave = await assertExpected(
    "rate_settings_same_value_upsert",
    route.POST(requestWithJson(payload, adminHeaders())),
    200,
    {
      ok: true,
      reason: "saved",
    },
  );
  const rateSettingsRecord = canonicalRateSettingsRecord(rateSettingsSave.body?.record);

  assertSafeRateSettingsRecord(rateSettingsRecord, "rate_settings_record");
  assertSameScalarValues(payload, rateSettingsRecord);

  process.env[rateSettingsGateEnvName] = "false";
  const closedGateAfter = await assertExpected(
    "closed_gate_after",
    route.POST(requestWithJson(payload, adminHeaders())),
    503,
    {
      ok: false,
      reason: "write_gate_closed",
    },
  );

  if (closedGateAfter.body?.database_client_enabled !== false) {
    failSafely("closed_gate_after_created_database_client");
  }

  const deployedClosedGateAfter = await assertDeployedClosedGate(payload);

  emitEvidence({
    ok: true,
    dryRun: false,
    envGate: {
      closedAfter: safeResultName(closedGateAfter),
      closedBefore: safeResultName(closedGateBefore),
      deployedClosedAfter: safeResultName(deployedClosedGateAfter),
      gateName: rateSettingsGateEnvName,
      openedInProcessOnly: true,
      valuesPrinted: false,
    },
    gateStatus: {
      unsafeFieldProbe: safeResultName(unsafeProbe),
      ...blockedProbeResults,
    },
    liveDbWriteAttemptCount: 1,
    noSecretsPrinted: true,
    noSupabaseCli: true,
    noRawSql: true,
    noMigration: true,
    noProductionWrite: true,
    result: {
      sameValueDefaultRowUpsert: "passed",
      safeScalarFieldsOnly: true,
      safeScalarFieldCount: fieldCount,
      tablePolicyProof:
        "rate_settings accepted a same-value default-row scalar upsert through the existing admin route helper",
      valuesChanged: false,
    },
    stage: "rate-settings-staging-write-gate-verification",
    stagingTarget: {
      commit: shortHash(stagingTarget.commit),
      projectName: stagingTarget.projectName,
      routeGetBoundaryStatus: stagingTarget.routeGetBoundaryStatus,
      rootStatus: stagingTarget.rootStatus,
      url: stagingTarget.url,
    },
    tablesInApprovedScope: ["rate_settings"],
    unsafeFieldsWritten: false,
  });
}

main().catch(() => {
  failSafely("unexpected_rate_settings_staging_write_gate_runner_failure_sanitized");
});
