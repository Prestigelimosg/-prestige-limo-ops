import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_ADMIN_BOOKING_WORKFLOW_STATUS_PRODUCTION_SAVE_LOAD_APPROVED";
const approvalValue = "stage-4a-430-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const fakeBookingReference = "PROD-WF-VERIFY-4A430-20260606-001";
const fakeWorkflowArea = "dispatch_release";
const fakeStatusValue = "ready";
const fakeStatusLabel = "Stage 4A-430 fake workflow status verification";
const fakeSafeNote = "Stage 4A-430 fake workflow status save/load verification only.";
const fakeNextAction = "Verify load-back, then exact-reference cleanup if supported.";
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-stage4a430-workflow-status-live-write-attempted.marker",
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
  "lib/admin-booking-workflow-status-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-booking-workflow-statuses/route.ts",
];
const unsafeEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing|invoice|payment|pdf|stripe|paynow|driver_payout|payout|finance|notification|telegram|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note|manual_extra_charge/i;

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-stage4a430-workflow-status-live-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(tempDir, "app/api/admin-booking-workflow-statuses/route.js")),
    workflowStatusPersistence: require(path.join(tempDir, "lib/admin-booking-workflow-status-persistence.js")),
  };
}

function fakePayload() {
  return {
    booking_reference: fakeBookingReference,
    safe_status_context: {
      next_action: fakeNextAction,
      safe_note: fakeSafeNote,
    },
    status_label: fakeStatusLabel,
    status_value: fakeStatusValue,
    workflow_area: fakeWorkflowArea,
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

function statusRecordMatchesFake(row) {
  return (
    row?.booking_reference === fakeBookingReference &&
    row?.workflow_area === fakeWorkflowArea &&
    row?.status_value === fakeStatusValue &&
    row?.status_label === fakeStatusLabel &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role) &&
    row?.safe_status_context?.safe_note === fakeSafeNote &&
    row?.safe_status_context?.next_action === fakeNextAction
  );
}

function safeRecordContainsUnsafeFields(row) {
  return unsafeEvidencePattern.test(JSON.stringify(row));
}

async function writeLiveAttemptMarker() {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Stage 4A-430 controlled workflow status live write attempted for ${fakeBookingReference}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_workflow_status_live_write_already_attempted");
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
    .from("booking_workflow_statuses")
    .select(
      "booking_reference, workflow_area, status_value, status_label, source_surface, actor_role, safe_status_context",
    )
    .eq("booking_reference", fakeBookingReference)
    .eq("workflow_area", fakeWorkflowArea);

  if (error) {
    failSafely("controlled_workflow_status_cleanup_preselect_failed_safely", {
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function cleanupExactFakeRow() {
  const client = cleanupClientFromEnv();
  const rows = await loadExactCleanupRows(client);

  if (rows.length !== 1 || !statusRecordMatchesFake(rows[0]) || safeRecordContainsUnsafeFields(rows[0])) {
    failSafely("controlled_workflow_status_cleanup_exact_match_failed", {
      matchedRows: rows.length,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const { data, error } = await client
    .from("booking_workflow_statuses")
    .delete()
    .eq("booking_reference", fakeBookingReference)
    .eq("workflow_area", fakeWorkflowArea)
    .select("booking_reference, workflow_area, status_value, status_label");

  if (error || !Array.isArray(data) || data.length !== 1) {
    failSafely("controlled_workflow_status_cleanup_delete_failed_safely", {
      deletedRows: Array.isArray(data) ? data.length : 0,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const remainingRows = await loadExactCleanupRows(client);

  if (remainingRows.length !== 0) {
    failSafely("controlled_workflow_status_cleanup_verify_absent_failed", {
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
    const parsed = harness.workflowStatusPersistence.parseAdminBookingWorkflowStatusSavePayload(fakePayload());

    if (!parsed.ok) {
      failSafely("safe_workflow_status_payload_rejected_before_live_write", {
        verificationReference: fakeBookingReference,
      });
    }

    const blockedAnonymous = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-booking-workflow-statuses?booking_reference=${fakeBookingReference}`,
          {},
        ),
      ),
    );
    const blockedCustomerReferer = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "http://localhost/api/admin-booking-workflow-statuses",
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
          `http://localhost/api/admin-booking-workflow-statuses?booking_reference=${fakeBookingReference}`,
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
          "http://localhost/api/admin-booking-workflow-statuses",
          {
            ...fakePayload(),
            safe_status_context: {
              safe_note: "Send payment PDF link.",
            },
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
      failSafely("workflow_status_route_safety_gate_failed_before_live_write", {
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
          `http://localhost/api/admin-booking-workflow-statuses?booking_reference=${fakeBookingReference}&workflow_area=${fakeWorkflowArea}`,
          adminHeaders(),
        ),
      ),
    );

    if (
      preExistingLoad.status !== 200 ||
      preExistingLoad.body?.ok !== true ||
      !Array.isArray(preExistingLoad.body.statuses) ||
      preExistingLoad.body.statuses.length !== 0
    ) {
      failSafely("workflow_status_fake_reference_already_exists_or_preload_failed", {
        matchedRows: Array.isArray(preExistingLoad.body?.statuses) ? preExistingLoad.body.statuses.length : null,
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    const saveResult = await readResponse(
      await harness.route.POST(
        requestWithJson("http://localhost/api/admin-booking-workflow-statuses", fakePayload(), adminHeaders()),
      ),
    );

    if (
      saveResult.status !== 200 ||
      saveResult.body?.ok !== true ||
      !statusRecordMatchesFake(saveResult.body.status) ||
      safeRecordContainsUnsafeFields(saveResult.body.status)
    ) {
      failSafely("controlled_workflow_status_save_failed_safely", {
        productionDbTouched: true,
        status: saveResult.status,
        verificationReference: fakeBookingReference,
      });
    }

    const loadResult = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-booking-workflow-statuses?booking_reference=${fakeBookingReference}&workflow_area=${fakeWorkflowArea}`,
          adminHeaders(),
        ),
      ),
    );
    const loadedRecord = Array.isArray(loadResult.body?.statuses)
      ? loadResult.body.statuses.find((record) => statusRecordMatchesFake(record))
      : null;

    if (
      loadResult.status !== 200 ||
      loadResult.body?.ok !== true ||
      !loadedRecord ||
      safeRecordContainsUnsafeFields(loadedRecord)
    ) {
      failSafely("controlled_workflow_status_load_failed_safely", {
        productionDbTouched: true,
        status: loadResult.status,
        verificationReference: fakeBookingReference,
      });
    }

    const cleanupResult = await cleanupExactFakeRow();
    const postCleanupRouteLoad = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-booking-workflow-statuses?booking_reference=${fakeBookingReference}&workflow_area=${fakeWorkflowArea}`,
          adminHeaders(),
        ),
      ),
    );

    if (
      postCleanupRouteLoad.status !== 200 ||
      postCleanupRouteLoad.body?.ok !== true ||
      !Array.isArray(postCleanupRouteLoad.body.statuses) ||
      postCleanupRouteLoad.body.statuses.length !== 0
    ) {
      failSafely("controlled_workflow_status_post_cleanup_route_load_failed", {
        matchedRows: Array.isArray(postCleanupRouteLoad.body?.statuses)
          ? postCleanupRouteLoad.body.statuses.length
          : null,
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_workflow_status_verification", {
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    emitEvidence({
      cleanupRollback: {
        cleanupDeletedExactFakeRow: true,
        cleanupMethod: "Supabase JS exact-reference delete on booking_workflow_statuses",
        cleanupScope: ["booking_reference", "workflow_area"],
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
      fakeWorkflowStatus: {
        booking_reference: fakeBookingReference,
        safeFieldsOnly: true,
        status_label: fakeStatusLabel,
        status_value: fakeStatusValue,
        workflow_area: fakeWorkflowArea,
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingPaymentPdfPayoutLocationNotificationParserLearning: true,
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
      stage: "4A-430",
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one admin-gated POST save through /api/admin-booking-workflow-statuses",
        "one admin-gated GET load through /api/admin-booking-workflow-statuses for the exact fake reference",
        "one exact-reference cleanup delete scoped to booking_workflow_statuses only",
        "one admin-gated GET load after cleanup to confirm no exact fake reference remains",
      ],
      unsafeFieldsWritten: false,
      verificationReference: fakeBookingReference,
      writtenScope: {
        bookingWorkflowStatuses: "one clearly marked fake workflow status row only",
        bookings: "none",
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
      stage: "4A-430",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    error: "unexpected_workflow_status_production_save_load_runner_failure_sanitized",
    ok: false,
    persistenceDefaultAfter: "off",
    stage: "4A-430",
  });
  process.exit(1);
});
