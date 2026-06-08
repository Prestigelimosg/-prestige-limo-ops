import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName =
  "PRESTIGE_CUSTOMER_DRIVER_APP_NOTIFICATION_PRODUCTION_SAVE_LOAD_APPROVED";
const approvalValue = "phase-1-customer-driver-app-notification-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const fakeBookingReference = "PROD-CD-APP-NOTIFY-VERIFY-20260608-001";
const fakeEventKey = "PROD-CD-APP-NOTIFY-EVENT-20260608-001";
const fakeDeliverySurface = "driver_app";
const fakeNotificationType = "trip_update";
const fakeNotificationStatus = "queued";
const updatedNotificationStatus = "read";
const fakeNotificationPriority = "normal";
const fakeWorkflowArea = "driver_app_updates";
const fakeSafeTitle = "Dispatch app update verification";
const fakeSafeMessage =
  "Fake driver app update verification row; read, mark read, then remove exact row.";
const fakeSafeContext = {
  cleanup_scope: "exact_event_key_and_reference",
  verification_stage: "customer_driver_app_notification_outbox",
};
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-customer-driver-app-notification-live-write-attempted.marker",
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
  "lib/customer-driver-app-notification-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/driver-job-link.ts",
  "lib/driver-job-status-workflow.ts",
  "lib/driver-job-link-mode.ts",
  "app/api/admin-customer-driver-app-notifications/route.ts",
  "app/api/customer-app-notifications/route.ts",
];
const unsafeEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing_amount|billing_rate|invoice|payment|pdf|stripe|paynow|driver_payout|payout|finance|telegram|whatsapp|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note|manual_extra_charge|raw_token|plain_token|token_value|secret/i;

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

function sanitizedUnexpectedDiagnostic(error) {
  const message = String(error?.message || error || "unknown").replace(
    /https:\/\/[a-z0-9.-]+\.supabase\.co|eyJ[A-Za-z0-9._-]+|[A-Za-z0-9+/=]{32,}/g,
    "[redacted]",
  );

  return {
    message: message.slice(0, 240),
    name: String(error?.name || "Error").slice(0, 80),
  };
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

  failSafely("customer_driver_app_notification_production_env_preflight_failed", {
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
  const output = transpileTypescript(source, sourcePath);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);

  if (relativePath.endsWith(".ts")) {
    const tsOutputPath = path.join(tempDir, relativePath);

    await mkdir(path.dirname(tsOutputPath), { recursive: true });
    await writeFile(tsOutputPath, output);
  }
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-app-notification-live-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    customerRoute: require(path.join(tempDir, "app/api/customer-app-notifications/route.js")),
    notificationPersistence: require(
      path.join(tempDir, "lib/customer-driver-app-notification-persistence.js"),
    ),
    route: require(path.join(tempDir, "app/api/admin-customer-driver-app-notifications/route.js")),
  };
}

function fakePayload() {
  return {
    booking_reference: fakeBookingReference,
    delivery_surface: fakeDeliverySurface,
    event_key: fakeEventKey,
    notification_status: fakeNotificationStatus,
    notification_type: fakeNotificationType,
    priority: fakeNotificationPriority,
    safe_context: fakeSafeContext,
    safe_message: fakeSafeMessage,
    safe_title: fakeSafeTitle,
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

function requestWithJson(url, body, headers, method = "POST") {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method,
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

function safeRecordMatchesFake(row, status = fakeNotificationStatus) {
  return (
    row?.booking_reference === fakeBookingReference &&
    row?.notification_type === fakeNotificationType &&
    row?.notification_status === status &&
    row?.priority === fakeNotificationPriority &&
    row?.workflow_area === fakeWorkflowArea &&
    row?.safe_title === fakeSafeTitle &&
    row?.safe_message === fakeSafeMessage &&
    row?.delivery_surface === fakeDeliverySurface &&
    row?.safe_context?.cleanup_scope === fakeSafeContext.cleanup_scope &&
    row?.safe_context?.verification_stage === fakeSafeContext.verification_stage
  );
}

function directRecordMatchesFake(row, status = updatedNotificationStatus) {
  return (
    safeRecordMatchesFake(row, status) &&
    row?.event_key === fakeEventKey &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role)
  );
}

function safeRecordContainsUnsafeFields(row) {
  return unsafeEvidencePattern.test(JSON.stringify(row));
}

async function writeLiveAttemptMarker() {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Customer/driver app notification controlled live write attempted for ${fakeEventKey}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_customer_driver_app_notification_live_write_already_attempted");
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
    .from("customer_driver_app_notification_outbox")
    .select(
      "id, notification_type, notification_status, priority, delivery_surface, event_key, booking_reference, driver_job_link_id, workflow_area, safe_title, safe_message, safe_context, source_surface, actor_role, actor_label",
    )
    .eq("event_key", fakeEventKey)
    .eq("booking_reference", fakeBookingReference);

  if (error) {
    failSafely("controlled_customer_driver_app_notification_cleanup_preselect_failed_safely", {
      productionDbTouched: true,
      verificationEventKey: fakeEventKey,
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
    !directRecordMatchesFake(rows[0]) ||
    safeRecordContainsUnsafeFields(rows[0])
  ) {
    failSafely("controlled_customer_driver_app_notification_cleanup_exact_match_failed", {
      matchedRows: rows.length,
      productionDbTouched: true,
      verificationEventKey: fakeEventKey,
      verificationReference: fakeBookingReference,
    });
  }

  const { data, error } = await client
    .from("customer_driver_app_notification_outbox")
    .delete()
    .eq("event_key", fakeEventKey)
    .eq("booking_reference", fakeBookingReference)
    .select("event_key, booking_reference, delivery_surface, notification_type, notification_status");

  if (error || !Array.isArray(data) || data.length !== 1) {
    failSafely("controlled_customer_driver_app_notification_cleanup_delete_failed_safely", {
      deletedRows: Array.isArray(data) ? data.length : 0,
      productionDbTouched: true,
      verificationEventKey: fakeEventKey,
      verificationReference: fakeBookingReference,
    });
  }

  const remainingRows = await loadExactCleanupRows(client);

  if (remainingRows.length !== 0) {
    failSafely("controlled_customer_driver_app_notification_cleanup_verify_absent_failed", {
      remainingRows: remainingRows.length,
      productionDbTouched: true,
      verificationEventKey: fakeEventKey,
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
      requiredApprovalValue: approvalValue,
    });
  }

  const validation = await loadAndValidateEnv();

  applyLoadedEnv(validation.env);

  const harness = await loadHarness();

  try {
    const parsed = harness.notificationPersistence.parseCustomerDriverAppNotificationCreatePayload(
      fakePayload(),
    );

    if (!parsed.ok) {
      failSafely("safe_customer_driver_app_notification_payload_rejected_before_live_write", {
        verificationEventKey: fakeEventKey,
        verificationReference: fakeBookingReference,
      });
    }

    const blockedAnonymous = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-customer-driver-app-notifications?booking_reference=${fakeBookingReference}`,
          {},
        ),
      ),
    );
    const blockedCustomerReferer = await readResponse(
      await harness.route.POST(
        requestWithJson("http://localhost/api/admin-customer-driver-app-notifications", fakePayload(), {
          ...adminHeaders(),
          referer: "http://localhost/book",
        }),
      ),
    );
    const blockedDriverReferer = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-customer-driver-app-notifications?booking_reference=${fakeBookingReference}`,
          {
            ...adminHeaders(),
            referer: "http://localhost/driver-job-demo",
          },
        ),
      ),
    );
    const blockedCustomerGet = await readResponse(
      await harness.customerRoute.GET(new Request("http://localhost/api/customer-app-notifications")),
    );
    const blockedCustomerPatch = await readResponse(
      await harness.customerRoute.PATCH(
        requestWithJson(
          "http://localhost/api/customer-app-notifications",
          {
            notification_id: "notification-customer-one",
            notification_status: "read",
          },
          {
            "content-type": "application/json",
          },
          "PATCH",
        ),
      ),
    );

    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

    const unsafePayloadResult = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "http://localhost/api/admin-customer-driver-app-notifications",
          {
            ...fakePayload(),
            safe_message: "Send Telegram payment PDF link.",
          },
          adminHeaders(),
        ),
      ),
    );

    if (
      blockedAnonymous.status !== 403 ||
      blockedCustomerReferer.status !== 403 ||
      blockedDriverReferer.status !== 403 ||
      blockedCustomerGet.status !== 403 ||
      blockedCustomerPatch.status !== 403 ||
      unsafePayloadResult.status !== 400
    ) {
      failSafely("customer_driver_app_notification_route_safety_gate_failed_before_live_write", {
        anonymousGate: safeResultName(blockedAnonymous),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        customerRouteGetGate: safeResultName(blockedCustomerGet),
        customerRoutePatchGate: safeResultName(blockedCustomerPatch),
        driverRefererGate: safeResultName(blockedDriverReferer),
        unsafePayloadGate: safeResultName(unsafePayloadResult),
        verificationEventKey: fakeEventKey,
        verificationReference: fakeBookingReference,
      });
    }

    await writeLiveAttemptMarker();

    const preExistingLoad = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-customer-driver-app-notifications?delivery_surface=${fakeDeliverySurface}&booking_reference=${fakeBookingReference}&notification_type=${fakeNotificationType}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );

    if (
      preExistingLoad.status !== 200 ||
      preExistingLoad.body?.ok !== true ||
      !Array.isArray(preExistingLoad.body.notifications) ||
      preExistingLoad.body.notifications.length !== 0
    ) {
      failSafely("customer_driver_app_notification_fake_reference_already_exists_or_preload_failed", {
        matchedRows: Array.isArray(preExistingLoad.body?.notifications)
          ? preExistingLoad.body.notifications.length
          : null,
        productionDbTouched: true,
        verificationEventKey: fakeEventKey,
        verificationReference: fakeBookingReference,
      });
    }

    const saveResult = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "http://localhost/api/admin-customer-driver-app-notifications",
          fakePayload(),
          adminHeaders(),
        ),
      ),
    );

    if (
      saveResult.status !== 200 ||
      saveResult.body?.ok !== true ||
      !safeRecordMatchesFake(saveResult.body.notification) ||
      safeRecordContainsUnsafeFields(saveResult.body.notification)
    ) {
      failSafely("controlled_customer_driver_app_notification_save_failed_safely", {
        productionDbTouched: true,
        status: saveResult.status,
        verificationEventKey: fakeEventKey,
        verificationReference: fakeBookingReference,
      });
    }

    const loadResult = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-customer-driver-app-notifications?delivery_surface=${fakeDeliverySurface}&booking_reference=${fakeBookingReference}&notification_type=${fakeNotificationType}&notification_status=${fakeNotificationStatus}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );
    const loadedRecord = Array.isArray(loadResult.body?.notifications)
      ? loadResult.body.notifications.find((record) => safeRecordMatchesFake(record))
      : null;

    if (
      loadResult.status !== 200 ||
      loadResult.body?.ok !== true ||
      !loadedRecord ||
      safeRecordContainsUnsafeFields(loadedRecord)
    ) {
      failSafely("controlled_customer_driver_app_notification_load_failed_safely", {
        productionDbTouched: true,
        status: loadResult.status,
        verificationEventKey: fakeEventKey,
        verificationReference: fakeBookingReference,
      });
    }

    const updateResult = await readResponse(
      await harness.route.PATCH(
        requestWithJson(
          "http://localhost/api/admin-customer-driver-app-notifications",
          {
            delivery_surface: fakeDeliverySurface,
            notification_id: saveResult.body.notification.id,
            notification_status: updatedNotificationStatus,
          },
          adminHeaders(),
          "PATCH",
        ),
      ),
    );

    if (
      updateResult.status !== 200 ||
      updateResult.body?.ok !== true ||
      !safeRecordMatchesFake(updateResult.body.notification, updatedNotificationStatus) ||
      safeRecordContainsUnsafeFields(updateResult.body.notification)
    ) {
      failSafely("controlled_customer_driver_app_notification_update_failed_safely", {
        productionDbTouched: true,
        status: updateResult.status,
        verificationEventKey: fakeEventKey,
        verificationReference: fakeBookingReference,
      });
    }

    const updatedLoadResult = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-customer-driver-app-notifications?delivery_surface=${fakeDeliverySurface}&booking_reference=${fakeBookingReference}&notification_type=${fakeNotificationType}&notification_status=${updatedNotificationStatus}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );
    const updatedLoadedRecord = Array.isArray(updatedLoadResult.body?.notifications)
      ? updatedLoadResult.body.notifications.find((record) =>
          safeRecordMatchesFake(record, updatedNotificationStatus)
        )
      : null;

    if (
      updatedLoadResult.status !== 200 ||
      updatedLoadResult.body?.ok !== true ||
      !updatedLoadedRecord ||
      safeRecordContainsUnsafeFields(updatedLoadedRecord)
    ) {
      failSafely("controlled_customer_driver_app_notification_updated_load_failed_safely", {
        productionDbTouched: true,
        status: updatedLoadResult.status,
        verificationEventKey: fakeEventKey,
        verificationReference: fakeBookingReference,
      });
    }

    const cleanupResult = await cleanupExactFakeRow();
    const postCleanupRouteLoad = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-customer-driver-app-notifications?delivery_surface=${fakeDeliverySurface}&booking_reference=${fakeBookingReference}&notification_type=${fakeNotificationType}&notification_status=${updatedNotificationStatus}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );

    if (
      postCleanupRouteLoad.status !== 200 ||
      postCleanupRouteLoad.body?.ok !== true ||
      !Array.isArray(postCleanupRouteLoad.body.notifications) ||
      postCleanupRouteLoad.body.notifications.length !== 0
    ) {
      failSafely("controlled_customer_driver_app_notification_post_cleanup_route_load_failed", {
        matchedRows: Array.isArray(postCleanupRouteLoad.body?.notifications)
          ? postCleanupRouteLoad.body.notifications.length
          : null,
        productionDbTouched: true,
        verificationEventKey: fakeEventKey,
        verificationReference: fakeBookingReference,
      });
    }

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_customer_driver_app_notification_verification", {
        productionDbTouched: true,
        verificationEventKey: fakeEventKey,
        verificationReference: fakeBookingReference,
      });
    }

    emitEvidence({
      cleanupRollback: {
        cleanupDeletedExactFakeRow: true,
        cleanupMethod:
          "Supabase JS exact event_key and booking_reference delete on customer_driver_app_notification_outbox",
        cleanupScope: ["event_key", "booking_reference"],
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
      fakeCustomerDriverAppNotification: {
        booking_reference: fakeBookingReference,
        delivery_surface: fakeDeliverySurface,
        event_key: fakeEventKey,
        notification_status_after_update: updatedNotificationStatus,
        notification_status_before_update: fakeNotificationStatus,
        notification_type: fakeNotificationType,
        priority: fakeNotificationPriority,
        safeFieldsOnly: true,
        workflow_area: fakeWorkflowArea,
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingInvoicePaymentPdfPayoutLocationParserLearning: true,
      noBroadProductionWrites: true,
      noCustomerAuthActivation: true,
      noExternalNotificationSending: true,
      noMigration: true,
      noRawSql: true,
      noRealBookingsCustomersOrChildRowsTouched: true,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      ok: true,
      productionDbTouched: true,
      result: {
        adminApiRouteLoad: safeResultName(loadResult),
        adminApiRouteSave: safeResultName(saveResult),
        adminApiRouteUpdate: safeResultName(updateResult),
        anonymousGate: safeResultName(blockedAnonymous),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        customerRouteGetGate: safeResultName(blockedCustomerGet),
        customerRoutePatchGate: safeResultName(blockedCustomerPatch),
        driverRefererGate: safeResultName(blockedDriverReferer),
        exactCleanup: "passed",
        loadedEventKeyMatched: true,
        postCleanupLoad: safeResultName(postCleanupRouteLoad),
        rowDataPrinted: false,
        unsafePayloadGate: safeResultName(unsafePayloadResult),
        updatedLoad: safeResultName(updatedLoadResult),
      },
      stage: "customer-driver-app-notification-production-verification",
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one admin-gated POST save through /api/admin-customer-driver-app-notifications",
        "one admin-gated GET load through /api/admin-customer-driver-app-notifications for the exact fake booking reference",
        "one admin-gated PATCH update through /api/admin-customer-driver-app-notifications for the exact fake notification id",
        "one exact cleanup delete scoped to customer_driver_app_notification_outbox by event_key and booking_reference",
        "one admin-gated GET load after cleanup to confirm no exact fake reference remains",
      ],
      unsafeFieldsWritten: false,
      verificationEventKey: fakeEventKey,
      verificationReference: fakeBookingReference,
      writtenScope: {
        customerDriverAppNotificationOutbox:
          "one clearly marked fake driver-app in-app notification row only",
        bookings: "none",
        customerContacts: "none",
        customers: "none",
        driverJobLinks: "none",
        externalNotificationSends: "none",
        invoices: "none",
        payments: "none",
        payouts: "none",
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
      stage: "customer-driver-app-notification-production-verification",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    diagnostic: sanitizedUnexpectedDiagnostic(error),
    error: "unexpected_customer_driver_app_notification_production_save_load_runner_failure_sanitized",
    ok: false,
    persistenceDefaultAfter: "off",
    stage: "customer-driver-app-notification-production-verification",
  });
  process.exit(1);
});
