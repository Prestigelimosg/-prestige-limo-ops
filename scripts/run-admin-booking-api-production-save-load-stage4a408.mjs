import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_ADMIN_BOOKING_PRODUCTION_SAVE_LOAD_APPROVED";
const approvalValue = "stage-4a-408-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-stage4a408-controlled-production-api-save-load-attempted.marker",
);
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
    mode: "production-save-load-preflight-only",
    ok: true,
    persistenceDefaultBefore: "off",
    requiredEnvNamesPresent: requiredEnvKeys,
    stage: "4A-408",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-stage4a408-production-save-load-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    adapter: require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js")),
    adminRoute: require(path.join(tempDir, "app/api/admin-bookings/route.js")),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(tempDir, "lib/admin-booking-persistence.js")),
  };
}

function createReference() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(2, 8).toUpperCase();

  return `PROD-API-VERIFY-4A408-${timestamp}-${suffix || "SAFE01"}`;
}

function createSafePayload(reference) {
  return {
    booking: {
      admin_internal_status: "needs_review",
      booking_reference: reference,
      cancellation_review_status: "pending_review",
      change_review_status: "pending_review",
      contact_display_name: "Stage 4A-408 Test Dispatcher Contact",
      contact_email: "stage-4a-408-production@example.invalid",
      contact_phone: "+6500004408",
      customer_display_name: "Stage 4A-408 Controlled Production Test Customer",
      customer_facing_status: "pending_review",
      dropoff_location: "Stage 4A-408 controlled production dropoff",
      luggage_count: 0,
      parser_source_reference: "stage-4a-408-production-manual-controlled-payload",
      passenger_name: "Stage 4A-408 Test Passenger",
      passenger_phone: "+6500004409",
      pax_count: 1,
      pickup_at: "2026-06-15T09:30:00+08:00",
      pickup_datetime: "2026-06-15T09:30:00+08:00",
      pickup_location: "Stage 4A-408 controlled production pickup",
      request_review_status: "pending_review",
      route_summary: "Stage 4A-408 controlled production pickup > Stage 4A-408 controlled production dropoff",
      route_type: "MNG",
      service_type: "MNG",
      short_notice_review_status: "not_required",
      source_channel: "stage_4a_408_production_controlled_check",
      source_surface: "admin_api",
      vehicle_type_or_category: "AVF",
    },
    route_points: [
      {
        location_text: "Stage 4A-408 controlled production pickup",
        point_type: "pickup",
        sequence_number: 1,
      },
      {
        location_text: "Stage 4A-408 controlled production dropoff",
        point_type: "dropoff",
        sequence_number: 2,
      },
    ],
    service_items: [],
  };
}

function createActor() {
  return {
    actor_label: "Stage 4A-408 William-approved production verifier",
    actor_role: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE === "dispatcher" ? "dispatcher" : "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
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

function requestWithJson(url, body, headers) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
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

function safeRecordMatchesReference(record, reference) {
  return (
    record?.booking_reference === reference &&
    record?.customer_display_name === "Stage 4A-408 Controlled Production Test Customer" &&
    record?.pickup_location === "Stage 4A-408 controlled production pickup" &&
    record?.dropoff_location === "Stage 4A-408 controlled production dropoff" &&
    (record?.source_surface === "admin_api" ||
      record?.source_surface === "stage_4a_408_production_controlled_check") &&
    Array.isArray(record?.route_points) &&
    record.route_points.length === 2 &&
    Array.isArray(record?.service_items) &&
    record.service_items.length === 0
  );
}

function safeRecordContainsUnsafeFields(record) {
  return unsafeEvidencePattern.test(JSON.stringify(record));
}

function safeResultName(result) {
  if (result?.status === 200 && result?.body?.ok === true) {
    return "passed";
  }

  return result?.status ? `blocked-${result.status}` : "blocked";
}

async function writeLiveAttemptMarker(reference) {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Stage 4A-408 controlled production API-route save attempted for ${reference}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_production_api_route_live_write_already_attempted");
    }

    throw error;
  }
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

  const harness = await loadHarness();
  const reference = createReference();
  const safePayload = createSafePayload(reference);
  const parsed = harness.persistence.parseAdminBookingPersistencePayload(safePayload);
  const actor = createActor();

  try {
    if (!parsed.ok) {
      failSafely("safe_payload_rejected_before_live_api_write", {
        verificationReference: reference,
      });
    }

    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

    const readiness = harness.adapter.checkAdminBookingPersistenceStagingConfigReadiness();
    const enableReadiness = harness.adapter.checkAdminBookingPersistenceEnableReadiness(parsed, actor);

    if (!readiness.ok || !enableReadiness.ok) {
      failSafely("production_enablement_preflight_failed", {
        blocked: enableReadiness.blocked || [],
        invalid: readiness.invalid || [],
        maskedProductionProjectRef: validation.maskedProjectRef,
        missing: readiness.missing || [],
        verificationReference: reference,
      });
    }

    await writeLiveAttemptMarker(reference);

    const saveResult = await readResponse(
      await harness.adminRoute.POST(
        requestWithJson("http://localhost/api/admin-bookings", safePayload, adminHeaders()),
      ),
    );

    if (saveResult.status !== 200 || saveResult.body?.ok !== true) {
      failSafely("controlled_production_api_route_save_failed_safely", {
        productionDbTouched: true,
        status: saveResult.status,
        verificationReference: reference,
      });
    }

    if (
      !safeRecordMatchesReference(saveResult.body.booking, reference) ||
      safeRecordContainsUnsafeFields(saveResult.body.booking)
    ) {
      failSafely("controlled_production_api_route_save_safe_field_check_failed", {
        productionDbTouched: true,
        verificationReference: reference,
      });
    }

    const loadResult = await readResponse(
      await harness.adminRoute.GET(getRequest("http://localhost/api/admin-bookings", adminHeaders())),
    );

    if (loadResult.status !== 200 || loadResult.body?.ok !== true || !Array.isArray(loadResult.body.bookings)) {
      failSafely("controlled_production_api_route_load_failed_safely", {
        productionDbTouched: true,
        status: loadResult.status,
        verificationReference: reference,
      });
    }

    const loadedRecord = loadResult.body.bookings.find((record) => record.booking_reference === reference);

    if (!loadedRecord) {
      failSafely("controlled_production_api_route_reference_not_found_in_safe_load", {
        productionDbTouched: true,
        verificationReference: reference,
      });
    }

    if (!safeRecordMatchesReference(loadedRecord, reference) || safeRecordContainsUnsafeFields(loadedRecord)) {
      failSafely("controlled_production_api_route_load_safe_field_check_failed", {
        productionDbTouched: true,
        verificationReference: reference,
      });
    }

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_save_load_verification", {
        productionDbTouched: true,
        verificationReference: reference,
      });
    }

    emitEvidence({
      cleanupRollback: {
        envFileChanged: false,
        persistenceDefaultAfter: "off",
        productionRecordDeleted: false,
        productionRecordDeletionReason: "delete-not-approved-in-stage-4a-408",
        processKillSwitchAfter: "off",
      },
      env: {
        checkedEnvCandidates: validation.checked,
        envFileName: validation.envFileName,
        persistenceDefaultBefore: "off",
        requiredEnvNamesPresent: requiredEnvKeys,
        valuesPrinted: false,
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingPaymentPdfPayoutLocationNotificationParserLearning: true,
      noBroadProductionWrites: true,
      noCustomerDriverAuthOrPolicies: true,
      noMigration: true,
      noRawSql: true,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      ok: true,
      productionDbTouched: true,
      result: {
        apiRouteLoad: safeResultName(loadResult),
        apiRouteSafeFields: "passed",
        apiRouteSave: safeResultName(saveResult),
        loadedReferenceMatched: true,
        rowDataPrinted: false,
      },
      stage: "4A-408",
      targetMatchesPriorProductionEvidence: true,
      testReference: reference,
      touchScope: [
        "one admin-gated POST save through /api/admin-bookings",
        "one admin-gated GET load through /api/admin-bookings to find only the test reference",
        "no delete",
        "no second write",
      ],
      unsafeFieldsWritten: false,
      writtenScope: {
        auditLogs: "one create audit record",
        bookings: "one clearly marked fake production booking",
        customerContacts: "one clearly marked fake production contact",
        customers: "one clearly marked fake production customer if not already present",
        routePoints: "pickup and dropoff only",
        serviceItems: "none",
      },
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
      stage: "4A-408",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    ok: false,
    error: "unexpected_production_save_load_runner_failure_sanitized",
    persistenceDefaultAfter: "off",
    stage: "4A-408",
  });
  process.exit(1);
});
