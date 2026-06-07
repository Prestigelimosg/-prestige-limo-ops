import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName =
  "PRESTIGE_ADMIN_COMPLETED_BOOKING_CLOSEOUT_PRODUCTION_SAVE_LOAD_APPROVED";
const approvalValue = "stage-4a-437-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const fakeBookingReference = "PROD-CLOSEOUT-VERIFY-4A437-20260607-001";
const fakeCloseoutStatus = "ready_for_billing_prep";
const fakeCompletedJobStatus = "completed";
const fakeDspActualHoursReadiness = "ready";
const fakeExtraChargesReadiness = "none";
const fakeBillingPrepReadiness = "ready";
const fakeSafeCloseoutNote =
  "Stage 4A-437 fake completed closeout save/load verification only.";
const fakeCloseoutSummary = "Stage 4A-437 fake completed closeout verification.";
const fakeNextAction = "Verify load-back, then exact-reference cleanup.";
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-stage4a437-completed-closeout-live-write-attempted.marker",
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
  "lib/admin-completed-booking-closeout-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-completed-booking-closeouts/route.ts",
];
const unsafeEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing_amount|billing_rate|invoice|payment|pdf|stripe|paynow|driver_payout|payout|finance|notification|telegram|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note/i;

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-stage4a437-completed-closeout-live-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    closeoutPersistence: require(path.join(
      tempDir,
      "lib/admin-completed-booking-closeout-persistence.js",
    )),
    route: require(path.join(tempDir, "app/api/admin-completed-booking-closeouts/route.js")),
  };
}

function fakePayload() {
  return {
    billing_prep_readiness: fakeBillingPrepReadiness,
    booking_reference: fakeBookingReference,
    closeout_status: fakeCloseoutStatus,
    completed_job_status: fakeCompletedJobStatus,
    dsp_actual_hours_readiness: fakeDspActualHoursReadiness,
    extra_charges_readiness: fakeExtraChargesReadiness,
    safe_closeout_context: {
      closeout_summary: fakeCloseoutSummary,
      next_action: fakeNextAction,
    },
    safe_closeout_note: fakeSafeCloseoutNote,
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

function safeResultName(result) {
  if (result?.status === 200 && result?.body?.ok === true) {
    return "passed";
  }

  return result?.status ? `blocked-${result.status}` : "blocked";
}

function closeoutRecordMatchesFake(row) {
  return (
    row?.booking_reference === fakeBookingReference &&
    row?.closeout_status === fakeCloseoutStatus &&
    row?.completed_job_status === fakeCompletedJobStatus &&
    row?.dsp_actual_hours_readiness === fakeDspActualHoursReadiness &&
    row?.extra_charges_readiness === fakeExtraChargesReadiness &&
    row?.billing_prep_readiness === fakeBillingPrepReadiness &&
    row?.safe_closeout_note === fakeSafeCloseoutNote &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role) &&
    row?.safe_closeout_context?.closeout_summary === fakeCloseoutSummary &&
    row?.safe_closeout_context?.next_action === fakeNextAction
  );
}

function safeRecordContainsUnsafeFields(row) {
  return unsafeEvidencePattern.test(JSON.stringify(row));
}

async function writeLiveAttemptMarker() {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Stage 4A-437 controlled completed closeout live write attempted for ${fakeBookingReference}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_completed_closeout_live_write_already_attempted");
    }

    throw error;
  }
}

function cleanupClientFromEnv() {
  return createClient(
    normalizedEnvValue(process.env.SUPABASE_URL),
    normalizedEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

async function loadExactCleanupRows(client) {
  const { data, error } = await client
    .from("completed_booking_closeouts")
    .select(
      "booking_reference, closeout_status, completed_job_status, dsp_actual_hours_readiness, extra_charges_readiness, billing_prep_readiness, safe_closeout_note, safe_closeout_context, source_surface, actor_role",
    )
    .eq("booking_reference", fakeBookingReference);

  if (error) {
    failSafely("controlled_completed_closeout_cleanup_preselect_failed_safely", {
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function cleanupExactFakeRow() {
  const client = cleanupClientFromEnv();
  const rows = await loadExactCleanupRows(client);

  if (
    rows.length !== 1 ||
    !closeoutRecordMatchesFake(rows[0]) ||
    safeRecordContainsUnsafeFields(rows[0])
  ) {
    failSafely("controlled_completed_closeout_cleanup_exact_match_failed", {
      matchedRows: rows.length,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const { data, error } = await client
    .from("completed_booking_closeouts")
    .delete()
    .eq("booking_reference", fakeBookingReference)
    .select("booking_reference, closeout_status, completed_job_status");

  if (error || !Array.isArray(data) || data.length !== 1) {
    failSafely("controlled_completed_closeout_cleanup_delete_failed_safely", {
      deletedRows: Array.isArray(data) ? data.length : 0,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const remainingRows = await loadExactCleanupRows(client);

  if (remainingRows.length !== 0) {
    failSafely("controlled_completed_closeout_cleanup_verify_absent_failed", {
      remainingRows: remainingRows.length,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return {
    deletedRows: data.length,
    postCleanupDirectRows: remainingRows.length,
  };
}

async function main() {
  if (process.env[approvalEnvName] !== approvalValue) {
    failSafely("missing_explicit_william_approval_env", {
      requiredApprovalEnvName: approvalEnvName,
    });
  }

  const validation = await loadAndValidateEnv();

  applyLoadedEnv(validation.env);

  const harness = await loadHarness();

  try {
    const parsed = harness.closeoutPersistence.parseAdminCompletedBookingCloseoutSavePayload(
      fakePayload(),
    );

    if (!parsed.ok) {
      failSafely("safe_completed_closeout_payload_rejected_before_live_write", {
        verificationReference: fakeBookingReference,
      });
    }

    const blockedAnonymous = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-completed-booking-closeouts?booking_reference=${fakeBookingReference}`,
          {},
        ),
      ),
    );
    const blockedCustomerReferer = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "http://localhost/api/admin-completed-booking-closeouts",
          fakePayload(),
          {
            ...adminHeaders(),
            referer: "http://localhost/book",
          },
        ),
      ),
    );
    const blockedDriverReferer = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-completed-booking-closeouts?booking_reference=${fakeBookingReference}`,
          {
            ...adminHeaders(),
            referer: "http://localhost/driver-job-demo",
          },
        ),
      ),
    );

    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

    const unsafePayloadResult = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "http://localhost/api/admin-completed-booking-closeouts",
          {
            ...fakePayload(),
            safe_closeout_note: "Send payment PDF link.",
          },
          adminHeaders(),
        ),
      ),
    );

    if (
      blockedAnonymous.status !== 403 ||
      blockedCustomerReferer.status !== 403 ||
      blockedDriverReferer.status !== 403 ||
      unsafePayloadResult.status !== 400
    ) {
      failSafely("completed_closeout_route_safety_gate_failed_before_live_write", {
        anonymousGate: safeResultName(blockedAnonymous),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        driverRefererGate: safeResultName(blockedDriverReferer),
        unsafePayloadGate: safeResultName(unsafePayloadResult),
        verificationReference: fakeBookingReference,
      });
    }

    await writeLiveAttemptMarker();

    const preExistingLoad = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-completed-booking-closeouts?booking_reference=${fakeBookingReference}`,
          adminHeaders(),
        ),
      ),
    );

    if (
      preExistingLoad.status !== 200 ||
      preExistingLoad.body?.ok !== true ||
      preExistingLoad.body.closeout !== null
    ) {
      failSafely("completed_closeout_fake_reference_already_exists_or_preload_failed", {
        matchedRows: preExistingLoad.body?.closeout ? 1 : null,
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    const saveResult = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "http://localhost/api/admin-completed-booking-closeouts",
          fakePayload(),
          adminHeaders(),
        ),
      ),
    );

    if (
      saveResult.status !== 200 ||
      saveResult.body?.ok !== true ||
      !closeoutRecordMatchesFake(saveResult.body.closeout) ||
      safeRecordContainsUnsafeFields(saveResult.body.closeout)
    ) {
      failSafely("controlled_completed_closeout_save_failed_safely", {
        productionDbTouched: true,
        status: saveResult.status,
        verificationReference: fakeBookingReference,
      });
    }

    const loadResult = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-completed-booking-closeouts?booking_reference=${fakeBookingReference}`,
          adminHeaders(),
        ),
      ),
    );

    if (
      loadResult.status !== 200 ||
      loadResult.body?.ok !== true ||
      !closeoutRecordMatchesFake(loadResult.body.closeout) ||
      safeRecordContainsUnsafeFields(loadResult.body.closeout)
    ) {
      failSafely("controlled_completed_closeout_load_failed_safely", {
        productionDbTouched: true,
        status: loadResult.status,
        verificationReference: fakeBookingReference,
      });
    }

    const cleanupResult = await cleanupExactFakeRow();
    const postCleanupRouteLoad = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-completed-booking-closeouts?booking_reference=${fakeBookingReference}`,
          adminHeaders(),
        ),
      ),
    );

    if (
      postCleanupRouteLoad.status !== 200 ||
      postCleanupRouteLoad.body?.ok !== true ||
      postCleanupRouteLoad.body.closeout !== null
    ) {
      failSafely("controlled_completed_closeout_post_cleanup_route_load_failed", {
        matchedRows: postCleanupRouteLoad.body?.closeout ? 1 : null,
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_completed_closeout_verification", {
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    emitEvidence({
      cleanupRollback: {
        cleanupDeletedExactFakeRow: true,
        cleanupMethod: "Supabase JS exact-reference delete on completed_booking_closeouts",
        cleanupScope: ["booking_reference"],
        deletedRows: cleanupResult.deletedRows,
        envFileChanged: false,
        persistenceDefaultAfter: "off",
        postCleanupDirectRows: cleanupResult.postCleanupDirectRows,
        postCleanupRouteLoadMatchedRows: 0,
        processKillSwitchAfter: "off",
      },
      env: {
        checkedEnvCandidates: validation.checked,
        envFileName: validation.envFileName,
        persistenceDefaultBefore: "off",
        requiredEnvNamesPresent: requiredEnvKeys,
        valuesPrinted: false,
      },
      fakeCompletedCloseout: {
        billing_prep_readiness: fakeBillingPrepReadiness,
        booking_reference: fakeBookingReference,
        closeout_status: fakeCloseoutStatus,
        completed_job_status: fakeCompletedJobStatus,
        dsp_actual_hours_readiness: fakeDspActualHoursReadiness,
        extra_charges_readiness: fakeExtraChargesReadiness,
        safeFieldsOnly: true,
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingActivationInvoicePaymentPdfPayoutLocationNotificationParserLearning: true,
      noBroadProductionWrites: true,
      noCustomerDriverAuthOrPolicies: true,
      noMigration: true,
      noRawSql: true,
      noRealBookingsCustomersOrChildRowsTouched: true,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      ok: true,
      productionDbTouched: true,
      result: {
        anonymousGate: safeResultName(blockedAnonymous),
        apiRouteLoad: safeResultName(loadResult),
        apiRouteSave: safeResultName(saveResult),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        driverRefererGate: safeResultName(blockedDriverReferer),
        exactCleanup: "passed",
        loadedReferenceMatched: true,
        postCleanupLoad: safeResultName(postCleanupRouteLoad),
        rowDataPrinted: false,
        unsafePayloadGate: safeResultName(unsafePayloadResult),
      },
      stage: "4A-437",
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one admin-gated POST save through /api/admin-completed-booking-closeouts",
        "one admin-gated GET load through /api/admin-completed-booking-closeouts for the exact fake reference",
        "one exact-reference cleanup delete scoped to completed_booking_closeouts only",
        "one admin-gated GET load after cleanup to confirm no exact fake reference remains",
      ],
      unsafeFieldsWritten: false,
      verificationReference: fakeBookingReference,
      writtenScope: {
        bookings: "none",
        completedBookingCloseouts: "one clearly marked fake completed closeout row only",
        customerContacts: "none",
        customers: "none",
        routePoints: "none",
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
      error: error.code,
      ok: false,
      persistenceDefaultAfter: "off",
      stage: "4A-437",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    error: "unexpected_completed_closeout_production_save_load_runner_failure_sanitized",
    ok: false,
    persistenceDefaultAfter: "off",
    stage: "4A-437",
  });
  process.exit(1);
});
