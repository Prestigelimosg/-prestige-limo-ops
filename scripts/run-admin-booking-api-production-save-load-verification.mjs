import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_ADMIN_BOOKING_PRODUCTION_VERIFICATION_APPROVED";
const approvalValue = "stage-4a-404-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-stage4a404-controlled-production-api-save-load-attempted.marker",
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
  "app/api/customer-booking-requests/route.ts",
];
const unsafeFieldProbe = {
  booking: {
    booking_reference: "PROD-API-VERIFY-4A404-UNSAFE-PROBE",
    contact_phone: "+6500000000",
    customer_display_name: "Stage 4A-404 Unsafe Probe",
    dropoff_location: "Stage 4A-404 Dropoff Probe",
    pickup_datetime: "2026-06-15T09:30:00+08:00",
    pickup_location: "Stage 4A-404 Pickup Probe",
    quoted_price: "1.00",
    route_type: "MNG",
  },
  route_points: [
    {
      location_text: "Stage 4A-404 Pickup Probe",
      point_type: "pickup",
      sequence_number: 1,
    },
    {
      location_text: "Stage 4A-404 Dropoff Probe",
      point_type: "dropoff",
      sequence_number: 2,
    },
  ],
  service_items: [],
};
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
      checked.push({
        envFileName,
        exists: false,
      });
      continue;
    }

    const validation = validateLoadedEnv(parseEnvFile(await readFile(candidatePath, "utf8")), envFileName);

    checked.push({
      envFileName,
      exists: true,
      invalid: validation.invalid,
      maskedProductionProjectRef: validation.maskedProjectRef,
      missing: validation.missing,
      placeholder: validation.placeholder,
    });

    if (validation.ok) {
      return validation;
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

function preflightEvidence(envFileName, maskedProjectRef) {
  return {
    envFileName,
    fullProjectRefPrinted: false,
    liveDbTouched: false,
    maskedProductionProjectRef: maskedProjectRef,
    mode: "production-preflight-only",
    ok: true,
    persistenceDefaultBefore: "off",
    requiredEnvNamesPresent: requiredEnvKeys,
    stage: "4A-404",
    targetMatchesPriorProductionEvidence: maskedProjectRef === expectedMaskedProductionProjectRef,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-stage4a404-production-api-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    adapter: require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js")),
    adminRoute: require(path.join(tempDir, "app/api/admin-bookings/route.js")),
    customerRoute: require(path.join(tempDir, "app/api/customer-booking-requests/route.js")),
    persistence: require(path.join(tempDir, "lib/admin-booking-persistence.js")),
  };
}

function createReference() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(2, 8).toUpperCase();

  return `PROD-API-VERIFY-4A404-${timestamp}-${suffix || "SAFE01"}`;
}

function createSafePayload(reference) {
  return {
    booking: {
      admin_internal_status: "production_verification_only",
      booking_reference: reference,
      cancellation_review_status: "not_requested",
      change_review_status: "not_requested",
      contact_display_name: "Stage 4A-404 Production Verifier",
      contact_email: "stage-4a-404-production@example.invalid",
      contact_phone: "+6500004404",
      customer_display_name: "Stage 4A-404 Controlled Production Customer",
      customer_facing_status: "pending_review",
      dropoff_location: "Stage 4A-404 controlled production dropoff",
      luggage_count: 0,
      parser_source_reference: "stage-4a-404-production-manual-controlled-payload",
      passenger_name: "Stage 4A-404 Production Passenger",
      passenger_phone: "+6500004405",
      pax_count: 1,
      pickup_at: "2026-06-15T09:30:00+08:00",
      pickup_datetime: "2026-06-15T09:30:00+08:00",
      pickup_location: "Stage 4A-404 controlled production pickup",
      request_review_status: "pending_review",
      route_summary: "Stage 4A-404 controlled production pickup > Stage 4A-404 controlled production dropoff",
      route_type: "MNG",
      service_type: "airport_arrival",
      short_notice_review_status: "not_required",
      source_channel: "stage_4a_404_production_controlled_check",
      source_surface: "admin_api",
      vehicle_type_or_category: "AVF",
    },
    route_points: [
      {
        location_text: "Stage 4A-404 controlled production pickup",
        point_type: "pickup",
        sequence_number: 1,
      },
      {
        location_text: "Stage 4A-404 controlled production dropoff",
        point_type: "dropoff",
        sequence_number: 2,
      },
    ],
    service_items: [],
  };
}

function createActor() {
  return {
    actor_label: "Stage 4A-404 William-approved production verifier",
    actor_role: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE === "dispatcher" ? "dispatcher" : "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
}

function adminHeaders(overrides = {}) {
  return {
    "content-type": "application/json",
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
    ...overrides,
  };
}

function customerHeaders(overrides = {}) {
  return {
    "content-type": "application/json",
    origin: "http://localhost",
    referer: "http://localhost/book",
    "x-prestige-customer-purpose": "customer-booking-request",
    ...overrides,
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

function safeRecordMatchesReference(record, reference) {
  return (
    record?.booking_reference === reference &&
    record?.customer_display_name === "Stage 4A-404 Controlled Production Customer" &&
    record?.pickup_location === "Stage 4A-404 controlled production pickup" &&
    record?.dropoff_location === "Stage 4A-404 controlled production dropoff" &&
    record?.source_surface === "admin_api" &&
    Array.isArray(record?.route_points) &&
    record.route_points.length >= 2 &&
    Array.isArray(record?.service_items) &&
    record.service_items.length === 0
  );
}

function safeRecordContainsUnsafeFields(record) {
  return unsafeEvidencePattern.test(JSON.stringify(record));
}

async function assertBlockedApiProbe(label, promise, expectedStatus = 403) {
  const result = await readResponse(await promise);

  if (result.status !== expectedStatus || result.body?.ok !== false || safeRecordContainsUnsafeFields(result.body)) {
    failSafely("api_route_blocked_probe_failed", {
      probe: label,
      status: result.status,
    });
  }

  return safeResultName(result);
}

async function main() {
  if (process.env[approvalEnvName] !== approvalValue) {
    failSafely("missing_explicit_william_approval_env", {
      requiredApprovalEnvName: approvalEnvName,
    });
  }

  const { env, envFileName, maskedProjectRef } = await loadAndValidateEnv();

  applyLoadedEnv(env);

  if (process.argv.includes("--preflight-only")) {
    emitEvidence(preflightEvidence(envFileName, maskedProjectRef));
    return;
  }

  const { adapter, adminRoute, customerRoute, persistence } = await loadHarness();
  const actor = createActor();
  const reference = createReference();
  const safePayload = createSafePayload(reference);
  const parsed = persistence.parseAdminBookingPersistencePayload(safePayload);
  const unsafeProbe = persistence.parseAdminBookingPersistencePayload(unsafeFieldProbe);

  if (!parsed.ok) {
    failSafely("safe_payload_rejected_before_live_api_write", {
      verificationReference: reference,
    });
  }

  if (unsafeProbe.ok) {
    failSafely("unsafe_field_probe_was_not_rejected", {
      verificationReference: reference,
    });
  }

  forcePersistenceOff();
  const killSwitchBefore = await readResponse(
    await adminRoute.POST(
      requestWithJson("http://localhost/api/admin-bookings", safePayload, adminHeaders()),
    ),
  );

  if (killSwitchBefore.status !== 503 || killSwitchBefore.body?.ok !== false) {
    failSafely("api_route_kill_switch_before_probe_failed", {
      verificationReference: reference,
    });
  }

  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

  const readiness = adapter.checkAdminBookingPersistenceStagingConfigReadiness();
  const enableReadiness = adapter.checkAdminBookingPersistenceEnableReadiness(parsed, actor);

  if (!readiness.ok || !enableReadiness.ok) {
    failSafely("production_enablement_preflight_failed", {
      blocked: enableReadiness.blocked || [],
      invalid: readiness.invalid || [],
      maskedProductionProjectRef: maskedProjectRef,
      missing: readiness.missing || [],
      verificationReference: reference,
    });
  }

  const blockedProbeResults = {
    anonymous: await assertBlockedApiProbe(
      "anonymous",
      adminRoute.POST(
        requestWithJson("http://localhost/api/admin-bookings", unsafeFieldProbe, {
          "content-type": "application/json",
        }),
      ),
    ),
    customerReferer: await assertBlockedApiProbe(
      "customer_referer",
      adminRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-bookings",
          unsafeFieldProbe,
          adminHeaders({ referer: "http://localhost/book" }),
        ),
      ),
    ),
    driverReferer: await assertBlockedApiProbe(
      "driver_referer",
      adminRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-bookings",
          unsafeFieldProbe,
          adminHeaders({ referer: "http://localhost/driver-job/mock-token" }),
        ),
      ),
    ),
    publicOrigin: await assertBlockedApiProbe(
      "public_origin",
      adminRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-bookings",
          unsafeFieldProbe,
          adminHeaders({ origin: "https://public.example.invalid" }),
        ),
      ),
    ),
    wrongToken: await assertBlockedApiProbe(
      "wrong_token",
      adminRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-bookings",
          unsafeFieldProbe,
          adminHeaders({ "x-prestige-admin-session-token": "wrong-token" }),
        ),
      ),
    ),
  };

  const customerRouteBlocked = await assertBlockedApiProbe(
    "customer_booking_request_route",
    customerRoute.POST(
      requestWithJson(
        "http://localhost/api/customer-booking-requests",
        {
          companyName: "Stage 4A-404 Customer Route Probe",
          contactNo: "+6500004496",
          dropoffLocation: "Stage 4A-404 Customer Dropoff Probe",
          emailAddress: "stage-4a-404-customer@example.invalid",
          extraStops: "",
          flightNumber: "SQ404",
          luggage: "1",
          passengerCount: "1",
          passengerName: "Stage 4A-404 Customer Passenger",
          pickupDate: "2026-06-15",
          pickupLocation: "Stage 4A-404 Customer Pickup Probe",
          pickupTime: "09:30",
          serviceType: "Airport Arrival",
          vehicleType: "Alphard / Vellfire",
        },
        customerHeaders(),
      ),
    ),
  );

  const unsafeRouteProbe = await readResponse(
    await adminRoute.POST(
      requestWithJson("http://localhost/api/admin-bookings", unsafeFieldProbe, adminHeaders()),
    ),
  );

  if (
    unsafeRouteProbe.status !== 400 ||
    unsafeRouteProbe.body?.ok !== false ||
    safeRecordContainsUnsafeFields(unsafeRouteProbe.body)
  ) {
    failSafely("api_route_unsafe_field_probe_failed", {
      status: unsafeRouteProbe.status,
      verificationReference: reference,
    });
  }

  const preSaveLoadResult = await readResponse(
    await adminRoute.GET(getRequest("http://localhost/api/admin-bookings", adminHeaders())),
  );

  if (preSaveLoadResult.status !== 200 || preSaveLoadResult.body?.ok !== true) {
    failSafely("production_admin_pre_save_load_failed_safely", {
      status: preSaveLoadResult.status,
      verificationReference: reference,
    });
  }

  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Stage 4A-404 controlled production API-route save attempted for ${reference}\n`,
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

  const saveResult = await readResponse(
    await adminRoute.POST(
      requestWithJson("http://localhost/api/admin-bookings", safePayload, adminHeaders()),
    ),
  );

  if (saveResult.status !== 200 || saveResult.body?.ok !== true) {
    failSafely("controlled_production_api_route_save_failed_safely", {
      status: saveResult.status,
      verificationReference: reference,
    });
  }

  if (
    !safeRecordMatchesReference(saveResult.body.booking, reference) ||
    safeRecordContainsUnsafeFields(saveResult.body.booking)
  ) {
    failSafely("controlled_production_api_route_save_safe_field_check_failed", {
      verificationReference: reference,
    });
  }

  const loadResult = await readResponse(
    await adminRoute.GET(getRequest("http://localhost/api/admin-bookings", adminHeaders())),
  );

  if (loadResult.status !== 200 || loadResult.body?.ok !== true || !Array.isArray(loadResult.body.bookings)) {
    failSafely("controlled_production_api_route_load_failed_safely", {
      status: loadResult.status,
      verificationReference: reference,
    });
  }

  const loadedRecord = loadResult.body.bookings.find((record) => record.booking_reference === reference);

  if (!loadedRecord) {
    failSafely("controlled_production_api_route_reference_not_found_in_safe_load", {
      verificationReference: reference,
    });
  }

  if (!safeRecordMatchesReference(loadedRecord, reference) || safeRecordContainsUnsafeFields(loadedRecord)) {
    failSafely("controlled_production_api_route_load_safe_field_check_failed", {
      verificationReference: reference,
    });
  }

  forcePersistenceOff();
  const killSwitchAfter = await readResponse(
    await adminRoute.POST(
      requestWithJson("http://localhost/api/admin-bookings", safePayload, adminHeaders()),
    ),
  );

  if (killSwitchAfter.status !== 503 || killSwitchAfter.body?.ok !== false) {
    failSafely("api_route_kill_switch_after_probe_failed", {
      verificationReference: reference,
    });
  }

  const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), envFileName), "utf8"));

  if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
    failSafely("local_env_persistence_default_not_off_after_verification", {
      verificationReference: reference,
    });
  }

  emitEvidence({
    cleanupRollback: {
      envFileChanged: false,
      persistenceDefaultAfter: "off",
      productionRecordDeleted: false,
      productionRecordDeletionReason: "delete-not-approved",
      processKillSwitchAfter: safeResultName(killSwitchAfter),
    },
    env: {
      envFileName,
      persistenceDefaultBefore: "off",
      requiredEnvNamesPresent: requiredEnvKeys,
    },
    fullProjectRefPrinted: false,
    gateStatus: {
      adminDispatcherGate: "required",
      customerBookingRequestRoute: customerRouteBlocked,
      customerPublicDriverAnonymousPaths: "blocked-by-api-route-preflight-gates",
      killSwitchAfter: safeResultName(killSwitchAfter),
      killSwitchBefore: safeResultName(killSwitchBefore),
      preSaveAdminLoad: "passed-readonly",
      safePayload: "passed",
      unsafeFieldProbe: "rejected-before-api-adapter-use",
      ...blockedProbeResults,
    },
    liveApiRouteVerificationAttemptCount: 1,
    maskedProductionProjectRef: maskedProjectRef,
    noBillingPaymentPdfPayoutLocationNotificationParserLearning: true,
    noCustomerDriverAuthOrPolicies: true,
    noMigration: true,
    noRawSql: true,
    noSecretsPrinted: true,
    noSupabaseCli: true,
    ok: true,
    productionDbTouched: true,
    result: {
      apiRouteLoad: "passed",
      apiRouteSafeFields: "passed",
      apiRouteSave: "passed",
    },
    stage: "4A-404",
    targetMatchesPriorProductionEvidence: true,
    touchScope: [
      "one admin-gated pre-save GET read through /api/admin-bookings",
      "one admin-gated POST save through /api/admin-bookings",
      "one admin-gated post-save GET load through /api/admin-bookings",
    ],
    unsafeFieldsWritten: false,
    verificationReference: reference,
    writtenScope: {
      auditLogs: "one create audit record",
      bookings: "one controlled fake production booking",
      customerContacts: "one controlled fake production contact",
      customers: "one controlled fake production customer if not already present",
      routePoints: "pickup and dropoff only",
      serviceItems: "none",
    },
  });
}

main().catch((error) => {
  forcePersistenceOff();

  if (error instanceof SafeFailure) {
    emitEvidence({
      ok: false,
      error: error.code,
      persistenceDefaultAfter: "off",
      stage: "4A-404",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    ok: false,
    error: "unexpected_production_api_route_runner_failure_sanitized",
    persistenceDefaultAfter: "off",
    stage: "4A-404",
  });
  process.exit(1);
});
