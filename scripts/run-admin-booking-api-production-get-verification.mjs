import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_ADMIN_BOOKING_PRODUCTION_GET_APPROVED";
const approvalValue = "stage-4a-407-william-approved";
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
  "lib/admin-booking-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-bookings/route.ts",
];
const unsafeEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing|invoice|payment|pdf|stripe|paynow|driver_payout|payout|finance|notification|telegram|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note/i;

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

    if (url.protocol !== "https:" || parts.length < 3 || parts.at(-2) !== "supabase" || parts.at(-1) !== "co") {
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

  if (normalizedEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) && !validServerCredential(env.SUPABASE_SERVICE_ROLE_KEY)) {
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

function preflightEvidence(validation) {
  return {
    checkedEnvCandidates: validation.checked,
    envFileName: validation.envFileName,
    fullProjectRefPrinted: false,
    liveDbTouched: false,
    maskedProductionProjectRef: validation.maskedProjectRef,
    mode: "production-get-preflight-only",
    ok: true,
    persistenceDefaultBefore: "off",
    requiredEnvNamesPresent: requiredEnvKeys,
    stage: "4A-407",
    targetMatchesPriorProductionEvidence: validation.maskedProjectRef === expectedMaskedProductionProjectRef,
    valuesPrinted: false,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-stage4a407-production-get-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    adminRoute: require(path.join(tempDir, "app/api/admin-bookings/route.js")),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
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

function summarizeBooking(record) {
  const routePoints = Array.isArray(record?.route_points) ? record.route_points : [];
  const serviceItems = Array.isArray(record?.service_items) ? record.service_items : [];

  return {
    hasBookingReference: typeof record?.booking_reference === "string" && record.booking_reference.length > 0,
    hasCurrentOrFoundationPickup: Boolean(record?.pickup_at || record?.pickup_datetime),
    hasCurrentOrFoundationService: Boolean(record?.service_type || record?.route_type),
    routePointCount: routePoints.length,
    serviceItemCount: serviceItems.length,
  };
}

function responseContainsUnsafeFields(body) {
  return unsafeEvidencePattern.test(JSON.stringify(body));
}

async function main() {
  if (process.env[approvalEnvName] !== approvalValue) {
    failSafely("missing_explicit_william_approval_env", {
      requiredApprovalEnvName: approvalEnvName,
    });
  }

  const validation = await loadAndValidateEnv();

  applyLoadedEnv(validation.env);

  if (process.argv.includes("--preflight-only")) {
    emitEvidence(preflightEvidence(validation));
    return;
  }

  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

  const harness = await loadHarness();

  try {
    const getResult = await readResponse(
      await harness.adminRoute.GET(getRequest("http://localhost/api/admin-bookings", adminHeaders())),
    );
    const bookings = Array.isArray(getResult.body?.bookings) ? getResult.body.bookings : [];
    const unsafeFieldsExposed = responseContainsUnsafeFields(getResult.body);

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_get_verification", {
        status: getResult.status,
      });
    }

    if (getResult.status !== 200 || getResult.body?.ok !== true || unsafeFieldsExposed) {
      failSafely("production_admin_get_failed_safely", {
        bookingsCount: bookings.length,
        fullProjectRefPrinted: false,
        maskedProductionProjectRef: validation.maskedProjectRef,
        noPost: true,
        noProductionWrite: true,
        noTestRecord: true,
        persistenceDefaultAfter: "off",
        productionDbTouched: true,
        rowDataPrinted: false,
        status: getResult.status,
        unsafeFieldsExposed,
      });
    }

    emitEvidence({
      env: {
        checkedEnvCandidates: validation.checked,
        envFileName: validation.envFileName,
        persistenceDefaultBefore: "off",
        requiredEnvNamesPresent: requiredEnvKeys,
        valuesPrinted: false,
      },
      fullProjectRefPrinted: false,
      getResult: {
        bookingsCount: bookings.length,
        firstBookingShape: bookings.length > 0 ? summarizeBooking(bookings[0]) : null,
        ok: true,
        rowDataPrinted: false,
        status: getResult.status,
        unsafeFieldsExposed,
      },
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingPaymentPdfPayoutLocationNotificationParserLearning: true,
      noCustomerDriverAuthOrPolicies: true,
      noMigration: true,
      noPost: true,
      noRawSql: true,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      noTestRecord: true,
      ok: true,
      persistenceDefaultAfter: "off",
      productionDbTouched: true,
      stage: "4A-407",
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one admin-gated GET read through /api/admin-bookings",
        "no POST",
        "no test record",
        "no production write",
        "route limit remains 25 rows",
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
      ok: false,
      error: error.code,
      persistenceDefaultAfter: "off",
      stage: "4A-407",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    ok: false,
    error: "unexpected_production_get_runner_failure_sanitized",
    persistenceDefaultAfter: "off",
    stage: "4A-407",
  });
  process.exit(1);
});
