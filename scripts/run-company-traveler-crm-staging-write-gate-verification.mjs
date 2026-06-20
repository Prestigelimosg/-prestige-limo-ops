import { constants, existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_COMPANY_TRAVELER_CRM_STAGING_WRITE_VERIFICATION_APPROVED";
const approvalValue = "ded13cd-william-approved";
const crmGateEnvName = "PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED";
const envFilePath = path.join(process.cwd(), ".env.stage4a388.local");
const stagingUrl = "https://prestige-limo-ops-staging.vercel.app";
const stagingRoutePath = "/api/admin-company-traveler-crm-runtime-write-action";
const expectedStagingCommit = "ded13cd7af32b18820cc474fac4f5b7ae95448a7";
const expectedProjectName = "prestige-limo-ops-staging";
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-company-traveler-crm-staging-write-gate-verification-attempted.marker",
);
const dryRun = process.argv.includes("--dry-run");

const sourceFiles = [
  "lib/admin-company-traveler-crm-write-readiness-setup-foundation.ts",
  "lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/admin-company-traveler-crm-runtime-write-action.ts",
  "app/api/admin-company-traveler-crm-runtime-write-action/route.ts",
];
const adapterStubPath = "lib/admin-booking-supabase-adapter.ts";
const requiredEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
];
const forbiddenRecordPattern =
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|paynow|pay_now|payment|billing|invoice|pdf|finance|provider|send_state|send_log|auth_session|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;

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
    "Company/traveler CRM staging verifier";
  process.env[crmGateEnvName] = "false";
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
    failSafely("staging_crm_runtime_route_get_boundary_failed", {
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
      "    actor_label: context.actorLabel || 'Company/traveler CRM staging verifier',",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-staging-write-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    route: require(path.join(
      tempDir,
      "app/api/admin-company-traveler-crm-runtime-write-action/route.js",
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

function safeRecordContainsUnsafeFields(record) {
  return forbiddenRecordPattern.test(JSON.stringify(record));
}

function assertNoUnsafeRecord(record, label) {
  if (!record || safeRecordContainsUnsafeFields(record)) {
    failSafely("safe_record_field_check_failed", {
      label,
    });
  }
}

function createReference() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(2, 8).toUpperCase();

  return `CRM-STAGING-${timestamp}-${suffix || "SAFE01"}`;
}

function createCompanyPayload(reference) {
  const domainSuffix = reference.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  return {
    action_type: "company_create",
    company_name: `Prestige CRM Evidence ${reference}`,
    domain: `${domainSuffix}.example`,
  };
}

function createTravelerPayload(reference, companyId) {
  return {
    action_type: "traveler_create",
    booker_contact: "+6500007788",
    booker_email: `crm-${reference.toLowerCase()}@example.invalid`,
    booker_name: "CRM Evidence Booker",
    company_id: companyId,
    default_address: "CRM evidence default address",
    default_dropoff_address: "CRM evidence dropoff address",
    default_pickup_address: "CRM evidence pickup address",
    preferred_vehicle: "Alphard",
    traveler_name: `CRM Evidence Traveler ${reference}`,
  };
}

function createUnsafePayload() {
  return {
    action_type: "traveler_update",
    customer_rates: [{ amount: 250 }],
    driver_payout_rules: [{ amount: 80 }],
    id: 7,
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

async function createLiveAttemptMarker(reference) {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Company/traveler CRM staging write gate verification attempted for ${reference}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_crm_staging_write_already_attempted");
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
  const { route } = await loadHarness();
  const reference = createReference();
  const companyPayload = createCompanyPayload(reference);
  const unsafePayload = createUnsafePayload();

  process.env[crmGateEnvName] = "false";
  const closedGateBefore = await assertExpected(
    "closed_gate_before",
    route.POST(requestWithJson(companyPayload, adminHeaders())),
    503,
    {
      ok: false,
      reason: "write_gate_closed",
    },
  );

  if (closedGateBefore.body?.database_client_enabled !== false) {
    failSafely("closed_gate_created_database_client");
  }

  process.env[crmGateEnvName] = "true";
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
    process.env[crmGateEnvName] = "false";
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
      stage: "company-traveler-crm-staging-write-gate-verification-dry-run",
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

  await createLiveAttemptMarker(reference);

  const companySave = await assertExpected(
    "company_create",
    route.POST(requestWithJson(companyPayload, adminHeaders())),
    200,
    {
      ok: true,
      reason: "saved",
    },
  );
  const companyRecord = companySave.body?.record;

  assertNoUnsafeRecord(companyRecord, "company_record");

  const companyId = Number(companyRecord?.id);

  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    failSafely("company_create_missing_safe_id", {
      verificationReference: reference,
    });
  }

  const travelerPayload = createTravelerPayload(reference, companyId);
  const travelerSave = await assertExpected(
    "traveler_create",
    route.POST(requestWithJson(travelerPayload, adminHeaders())),
    200,
    {
      ok: true,
      reason: "saved",
    },
  );
  const travelerRecord = travelerSave.body?.record;

  assertNoUnsafeRecord(travelerRecord, "traveler_record");

  process.env[crmGateEnvName] = "false";
  const closedGateAfter = await assertExpected(
    "closed_gate_after",
    route.POST(requestWithJson(companyPayload, adminHeaders())),
    503,
    {
      ok: false,
      reason: "write_gate_closed",
    },
  );

  if (closedGateAfter.body?.database_client_enabled !== false) {
    failSafely("closed_gate_after_created_database_client");
  }

  emitEvidence({
    ok: true,
    dryRun: false,
    envGate: {
      closedAfter: safeResultName(closedGateAfter),
      closedBefore: safeResultName(closedGateBefore),
      gateName: crmGateEnvName,
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
      companyCreate: "passed",
      companyRecordId: companyRecord.id,
      safeCompanyFieldsOnly: true,
      safeTravelerFieldsOnly: true,
      tablePolicyProof: "companies and travelers accepted safe identity/contact writes through the existing admin route helper",
      travelerCreate: "passed",
      travelerRecordId: travelerRecord.id,
    },
    stage: "company-traveler-crm-staging-write-gate-verification",
    stagingTarget: {
      commit: shortHash(stagingTarget.commit),
      projectName: stagingTarget.projectName,
      routeGetBoundaryStatus: stagingTarget.routeGetBoundaryStatus,
      rootStatus: stagingTarget.rootStatus,
      url: stagingTarget.url,
    },
    tablesInApprovedScope: ["companies", "travelers"],
    unsafeFieldsWritten: false,
    verificationReference: reference,
  });
}

main().catch(() => {
  failSafely("unexpected_crm_staging_write_gate_runner_failure_sanitized");
});
