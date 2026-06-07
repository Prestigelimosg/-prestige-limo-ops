import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const approvalEnvName =
  "PRESTIGE_ADMIN_MONTHLY_BILLING_GROUPING_PRODUCTION_READ_APPROVED";
const approvalValue = "stage-4a-440-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const requiredEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
];
const sourceFiles = [
  "lib/admin-monthly-billing-grouping-read.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-billing-groups/route.ts",
];
const unsafeEvidencePattern =
  /contact_phone|contact_email|passenger|customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing_amount|billing_rate|invoice|payment|pdf|stripe|paynow|driver_payout|payout|finance|notification|telegram|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note|manual_extra_charge/i;

class SafeFailure extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

function emitEvidence(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function failSafely(code, extra = {}) {
  throw new SafeFailure(code, extra);
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

function normalizedEnvValue(value) {
  return String(value ?? "").trim();
}

function looksPlaceholder(value) {
  return /^(?:|todo|tbd|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example|YOUR_PROJECT_REF|YOUR_SERVICE_ROLE)$/i.test(
    normalizedEnvValue(value),
  );
}

function validServerCredential(value) {
  const normalized = normalizedEnvValue(value).toLowerCase();

  return (
    normalizedEnvValue(value).length >= 24 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public")
  );
}

function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(normalizedEnvValue(value));
    const hostname = url.hostname.toLowerCase();
    const parts = hostname.split(".");

    if (
      url.protocol !== "https:" ||
      parts.length < 3 ||
      parts.at(-2) !== "supabase" ||
      parts.at(-1) !== "co"
    ) {
      return null;
    }

    return parts[0] || null;
  } catch {
    return null;
  }
}

function maskProjectRef(projectRef) {
  if (!projectRef || projectRef.length < 6) {
    return "invalid-mask";
  }

  return `${projectRef.slice(0, 3)}...${projectRef.slice(-3)}`;
}

function envCandidateSummary(envFileName, validation, exists) {
  return {
    envFileName,
    exists,
    invalid: validation?.invalid || [],
    maskedProductionProjectRef: validation?.maskedProjectRef || null,
    missing: validation?.missing || [],
    placeholder: validation?.placeholder || [],
    valuesPrinted: false,
  };
}

function validateLoadedEnv(env, envFileName) {
  const missing = [];
  const placeholder = [];
  const invalid = [];
  const projectRef = projectRefFromSupabaseUrl(env.SUPABASE_URL);
  const maskedProjectRef = maskProjectRef(projectRef);

  for (const key of requiredEnvKeys) {
    const value = normalizedEnvValue(env[key]);

    if (!value) {
      missing.push(key);
    } else if (looksPlaceholder(value)) {
      placeholder.push(key);
    }
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false"
  ) {
    invalid.push("PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE) &&
    normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE) !== "server-session-token"
  ) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE");
  }

  if (
    normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE) &&
    !["admin", "dispatcher"].includes(normalizedEnvValue(env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE))
  ) {
    invalid.push("PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE");
  }

  if (
    normalizedEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) &&
    !validServerCredential(env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    invalid.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (normalizedEnvValue(env.SUPABASE_URL) && maskedProjectRef !== expectedMaskedProductionProjectRef) {
    invalid.push("SUPABASE_URL");
  }

  return {
    env,
    envFileName,
    invalid,
    maskedProjectRef,
    missing,
    ok: missing.length === 0 && placeholder.length === 0 && invalid.length === 0,
    placeholder,
  };
}

async function loadAndValidateEnv() {
  const checked = [];

  for (const envFileName of candidateEnvFileNames) {
    const candidatePath = path.join(process.cwd(), envFileName);

    if (!existsSync(candidatePath)) {
      checked.push(envCandidateSummary(envFileName, null, false));
      continue;
    }

    const validation = validateLoadedEnv(parseEnvFile(await readFile(candidatePath, "utf8")), envFileName);

    checked.push(envCandidateSummary(envFileName, validation, true));

    if (validation.ok) {
      return {
        ...validation,
        checked,
      };
    }
  }

  failSafely("production_env_preflight_failed", {
    checkedEnvCandidates: checked,
    requiredEnvNames: requiredEnvKeys,
  });
}

function applyLoadedEnv(env) {
  for (const key of requiredEnvKeys) {
    process.env[key] = normalizedEnvValue(env[key]);
  }
}

function forcePersistenceOff() {
  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "false";
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

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(tempSupabaseDir, { recursive: true });
  await writeFile(serverOnlyPath, "");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-stage4a440-monthly-billing-read-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    grouping: require(path.join(tempDir, "lib/admin-monthly-billing-grouping-read.js")),
    route: require(path.join(tempDir, "app/api/admin-monthly-billing-groups/route.js")),
  };
}

function adminHeaders() {
  return {
    "content-type": "application/json",
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  };
}

function getRequest(url, headers) {
  return new Request(url, {
    headers,
    method: "GET",
  });
}

async function readResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function responseContainsUnsafeEvidence(body) {
  return unsafeEvidencePattern.test(JSON.stringify(body));
}

function safeResultName(result) {
  if (result?.status === 200 && result?.body?.ok === true) {
    return "passed";
  }

  return result?.status ? `blocked-${result.status}` : "blocked";
}

function safeGroupingSummary(body) {
  const groups = Array.isArray(body?.groups) ? body.groups : [];
  const statusCounts = groups.reduce(
    (counts, group) => {
      const status = group?.safe_readiness_status;

      if (status === "ready" || status === "blocked" || status === "mixed") {
        counts[status] += 1;
      }

      return counts;
    },
    {
      blocked: 0,
      mixed: 0,
      ready: 0,
    },
  );
  const billingMonths = [...new Set(groups.map((group) => group?.billing_month).filter(Boolean))];

  return {
    billingMonthCount: billingMonths.length,
    groupCount: groups.length,
    ok: body?.ok === true,
    returnedPrivateDetails: false,
    statusCounts,
    summary: {
      blockedCount: Number(body?.summary?.blocked_count || 0),
      groupCount: Number(body?.summary?.group_count || 0),
      readyCount: Number(body?.summary?.ready_count || 0),
      totalCount: Number(body?.summary?.total_count || 0),
    },
    versionPresent: typeof body?.version === "string" && body.version.length > 0,
  };
}

async function safeDirectReadDiagnostic(harness) {
  const result = await harness.grouping.loadAdminMonthlyBillingGroups(
    { limit: "25" },
    {
      actor_label: "Stage 4A-440 read-only diagnostic",
      actor_role: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE === "dispatcher" ? "dispatcher" : "admin",
      boundary_mode: "server-session-role-surface",
      source_surface: "admin_api",
    },
  );

  return result.ok
    ? {
        ok: true,
        status: 200,
      }
    : {
        category: result.category || "none",
        ok: false,
        status: result.status,
      };
}

async function main() {
  if (process.env[approvalEnvName] !== approvalValue) {
    failSafely("missing_explicit_william_read_only_approval_env", {
      requiredApprovalEnvName: approvalEnvName,
    });
  }

  const validation = await loadAndValidateEnv();

  applyLoadedEnv(validation.env);
  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

  const harness = await loadHarness();

  try {
    const blockedAnonymous = await readResponse(
      await harness.route.GET(
        getRequest("http://localhost/api/admin-monthly-billing-groups", {
          referer: "http://localhost/",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        }),
      ),
    );
    const blockedCustomerReferer = await readResponse(
      await harness.route.GET(
        getRequest("http://localhost/api/admin-monthly-billing-groups", {
          ...adminHeaders(),
          referer: "http://localhost/book",
        }),
      ),
    );
    const blockedDriverReferer = await readResponse(
      await harness.route.GET(
        getRequest("http://localhost/api/admin-monthly-billing-groups", {
          ...adminHeaders(),
          referer: "http://localhost/driver-job-demo",
        }),
      ),
    );
    const blockedWrongToken = await readResponse(
      await harness.route.GET(
        getRequest("http://localhost/api/admin-monthly-billing-groups", {
          ...adminHeaders(),
          "x-prestige-admin-session-token": "wrong-token",
        }),
      ),
    );

    const readResult = await readResponse(
      await harness.route.GET(
        getRequest("http://localhost/api/admin-monthly-billing-groups?limit=25", adminHeaders()),
      ),
    );
    const unsafeEvidenceExposed = responseContainsUnsafeEvidence(readResult.body);
    const directReadDiagnostic =
      readResult.status === 200 && readResult.body?.ok === true
        ? { ok: true, status: 200 }
        : await safeDirectReadDiagnostic(harness);

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_monthly_billing_grouping_read", {
        productionDbTouched: true,
      });
    }

    if (
      readResult.status !== 200 ||
      readResult.body?.ok !== true ||
      unsafeEvidenceExposed ||
      blockedAnonymous.status !== 403 ||
      blockedCustomerReferer.status !== 403 ||
      blockedDriverReferer.status !== 403 ||
      blockedWrongToken.status !== 403
    ) {
      failSafely("production_monthly_billing_grouping_read_failed_safely", {
        blockedAnonymous: safeResultName(blockedAnonymous),
        blockedCustomerReferer: safeResultName(blockedCustomerReferer),
        blockedDriverReferer: safeResultName(blockedDriverReferer),
        blockedWrongToken: safeResultName(blockedWrongToken),
        fullProjectRefPrinted: false,
        maskedProductionProjectRef: validation.maskedProjectRef,
        noPostPatchPutDelete: true,
        noProductionWrite: true,
        noTestRecord: true,
        persistenceDefaultAfter: "off",
        productionDbTouched: true,
        readStatus: readResult.status,
        rowDataPrinted: false,
        safeDirectReadDiagnostic: directReadDiagnostic,
        unsafeEvidenceExposed,
      });
    }

    emitEvidence({
      env: {
        checkedEnvCandidates: validation.checked,
        envFileName: validation.envFileName,
        persistenceDefaultBefore: "off",
        processPersistenceEnabledOnlyForRead: true,
        requiredEnvNamesPresent: requiredEnvKeys,
        valuesPrinted: false,
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingActivationInvoicePaymentPdfPayoutLocationNotificationParserLearning: true,
      noCustomerDriverAuthOrPolicies: true,
      noMigration: true,
      noPostPatchPutDelete: true,
      noRawSql: true,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      noTestRecord: true,
      ok: true,
      persistenceDefaultAfter: "off",
      productionDbTouched: true,
      readOnlyResult: {
        ...safeGroupingSummary(readResult.body),
        rowDataPrinted: false,
        status: readResult.status,
        unsafeEvidenceExposed,
      },
      routeSafety: {
        anonymousGate: safeResultName(blockedAnonymous),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        driverRefererGate: safeResultName(blockedDriverReferer),
        wrongTokenGate: safeResultName(blockedWrongToken),
      },
      stage: "4A-440",
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one admin-gated GET read through /api/admin-monthly-billing-groups?limit=25",
        "anonymous/customer/driver/wrong-token GET gate checks",
        "no POST",
        "no PATCH",
        "no PUT",
        "no DELETE",
        "no fake row",
        "no production write",
      ],
    });
  } finally {
    forcePersistenceOff();
    await harness.cleanup();
  }
}

main().catch((error) => {
  forcePersistenceOff();

  if (error instanceof SafeFailure) {
    emitEvidence({
      error: error.code,
      ok: false,
      persistenceDefaultAfter: "off",
      stage: "4A-440",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    error: "unexpected_monthly_billing_grouping_read_runner_failure_sanitized",
    ok: false,
    persistenceDefaultAfter: "off",
    stage: "4A-440",
  });
  process.exit(1);
});
