import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_DRIVER_JOB_STATUS_PRODUCTION_SAVE_LOAD_APPROVED";
const approvalValue = "stage-driver-job-status-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const fakeBookingReference = "PROD-DRIVER-STATUS-VERIFY-20260607-SAFE-001";
const fakeStatusValue = "driver_otw";
const fakeActorLabel = "stage-driver-job-status-verification";
const fakePickupLocation = "Stage driver status verification pickup";
const fakeDropoffLocation = "Stage driver status verification dropoff";
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-driver-job-status-live-write-attempted.marker",
);
const requiredEnvKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const optionalDefaultOffEnvKeys = [
  "DRIVER_JOB_LINK_MODE",
  "NEXT_PUBLIC_DRIVER_JOB_LINK_MODE",
  "PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED",
];
const sourceFiles = [
  "lib/driver-job-status-workflow.ts",
  "lib/driver-job-link.ts",
  "lib/driver-job-link-contract.ts",
  "lib/driver-job-link-mock-tokens.ts",
  "lib/driver-job-link-mock-store.ts",
  "lib/driver-job-link-mode.ts",
  "lib/driver-job-status-persistence.ts",
  "lib/driver-job-link-production.ts",
  "app/api/driver-job/[token]/route.ts",
  "app/api/driver-job/[token]/status/route.ts",
];
const unsafeEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing|invoice|payment|pdf|stripe|paynow|driver_payout|payout|finance|notification|telegram|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_only|server_secret|internal_admin_note|admin_note|internal_note|manual_extra_charge|raw_token|plain_token|token_value|secret/i;

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

  if (normalizedEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) && !validServerCredential(env.SUPABASE_SERVICE_ROLE_KEY)) {
    invalid.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  if (normalizedEnvValue(env.SUPABASE_URL) && maskedProjectRef !== expectedMaskedProductionProjectRef) {
    invalid.push("SUPABASE_URL");
  }

  if (normalizedEnvValue(env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED) === "true") {
    invalid.push("PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED");
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

  failSafely("driver_job_status_production_env_preflight_failed", {
    checkedEnvCandidates: checked,
    requiredEnvNames: requiredEnvKeys,
  });
}

function applyLoadedEnv(env) {
  for (const key of [...requiredEnvKeys, ...optionalDefaultOffEnvKeys]) {
    const value = normalizedEnvValue(env[key]);

    if (value) {
      process.env[key] = value;
    }
  }
}

function forceDriverJobPersistenceOff() {
  process.env.DRIVER_JOB_LINK_MODE = "mock";
  process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED = "false";
}

function enableDriverJobVerificationProcessOnly() {
  process.env.DRIVER_JOB_LINK_MODE = "production";
  process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED = "true";
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
  const outputSource = transpileTypescript(await readFile(sourcePath, "utf8"), sourcePath);
  const jsPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const tsPath = path.join(tempDir, relativePath);

  await mkdir(path.dirname(jsPath), { recursive: true });
  await writeFile(jsPath, outputSource);
  await writeFile(tsPath, outputSource);
}

async function writeRuntimeModules(tempDir) {
  const tempSupabaseDir = path.join(tempDir, "node_modules/@supabase");
  const workspaceSupabaseDir = path.join(process.cwd(), "node_modules/@supabase");

  await mkdir(tempSupabaseDir, { recursive: true });

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-job-status-live-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    driverLink: require(path.join(tempDir, "lib/driver-job-link.ts")),
    route: require(path.join(tempDir, "app/api/driver-job/[token]/route.js")),
    statusRoute: require(path.join(tempDir, "app/api/driver-job/[token]/status/route.js")),
  };
}

function routeContext(token) {
  return {
    params: Promise.resolve({ token }),
  };
}

async function readResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function getRequest(token) {
  return new Request(`http://localhost/api/driver-job/${encodeURIComponent(token)}`);
}

function patchRequest(token, status) {
  return new Request(`http://localhost/api/driver-job/${encodeURIComponent(token)}/status`, {
    body: JSON.stringify({ status }),
    headers: {
      "content-type": "application/json",
    },
    method: "PATCH",
  });
}

function safeResultName(result) {
  if (result?.status === 200 && result?.body?.ok === true) {
    return "passed";
  }

  return result?.status ? `blocked-${result.status}` : "blocked";
}

function linkPayload(tokenHash) {
  return {
    actor_label: fakeActorLabel,
    actor_role: "system",
    booking_reference: fakeBookingReference,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    link_status: "active",
    safe_link_context: {
      driver_job_payload: {
        assigned_driver: {
          contact: "+65 8000 0000",
          name: "Stage Verification Driver",
          plate: "SLA0001X",
          vehicleModel: "Mercedes V Class",
        },
        booking_type: "TRF",
        dropoff_location: fakeDropoffLocation,
        flight_no: "",
        passenger_name: "Stage Verification Passenger",
        pickup_date: "2026-06-30",
        pickup_location: fakePickupLocation,
        pickup_time: "0900hrs",
        route: `${fakePickupLocation} > ${fakeDropoffLocation}`,
        status: "assigned",
      },
    },
    source_surface: "system",
    token_hash: tokenHash,
  };
}

function safeRecordContainsUnsafeFields(row) {
  return unsafeEvidencePattern.test(JSON.stringify(row));
}

function linkRecordMatchesFake(row) {
  return (
    row?.booking_reference === fakeBookingReference &&
    row?.link_status === "active" &&
    row?.source_surface === "system" &&
    row?.actor_role === "system" &&
    row?.actor_label === fakeActorLabel &&
    row?.safe_link_context?.driver_job_payload?.pickup_location === fakePickupLocation &&
    row?.safe_link_context?.driver_job_payload?.dropoff_location === fakeDropoffLocation
  );
}

function statusEventMatchesFake(row, linkId) {
  return (
    row?.booking_reference === fakeBookingReference &&
    row?.driver_job_link_id === linkId &&
    row?.status_value === fakeStatusValue &&
    row?.status_source === "driver_job_api" &&
    row?.source_surface === "driver_job_api" &&
    row?.actor_role === "driver" &&
    row?.actor_label === "verified_driver_job_link"
  );
}

async function writeLiveAttemptMarker() {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Driver job status controlled live write attempted for ${fakeBookingReference}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_driver_job_status_live_write_already_attempted");
    }

    throw error;
  }
}

function clientFromEnv() {
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

async function loadExactLinkRows(client) {
  const { data, error } = await client
    .from("driver_job_links")
    .select(
      "id, booking_reference, link_status, source_surface, actor_role, actor_label, safe_link_context",
    )
    .eq("booking_reference", fakeBookingReference);

  if (error) {
    failSafely("driver_job_link_preselect_failed_safely", {
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadExactStatusEventRows(client, linkId) {
  const { data, error } = await client
    .from("driver_job_status_events")
    .select(
      "booking_reference, driver_job_link_id, status_value, status_source, safe_status_note, safe_status_context, source_surface, actor_role, actor_label",
    )
    .eq("booking_reference", fakeBookingReference)
    .eq("driver_job_link_id", linkId);

  if (error) {
    failSafely("driver_job_status_event_preselect_failed_safely", {
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function insertFakeLinkRow(client, payload) {
  const { data, error } = await client
    .from("driver_job_links")
    .insert(payload)
    .select("id, booking_reference, link_status, source_surface, actor_role, actor_label, safe_link_context")
    .single();

  if (error || !data || !linkRecordMatchesFake(data) || safeRecordContainsUnsafeFields(data)) {
    failSafely("controlled_driver_job_link_insert_failed_safely", {
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return data;
}

async function cleanupExactFakeRows(client, linkId) {
  const eventRows = await loadExactStatusEventRows(client, linkId);

  if (
    eventRows.length !== 1 ||
    !statusEventMatchesFake(eventRows[0], linkId) ||
    safeRecordContainsUnsafeFields(eventRows[0])
  ) {
    failSafely("controlled_driver_job_status_cleanup_exact_event_match_failed", {
      matchedRows: eventRows.length,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const { data: deletedEvents, error: deleteEventsError } = await client
    .from("driver_job_status_events")
    .delete()
    .eq("booking_reference", fakeBookingReference)
    .eq("driver_job_link_id", linkId)
    .select("booking_reference, driver_job_link_id, status_value");

  if (deleteEventsError || !Array.isArray(deletedEvents) || deletedEvents.length !== 1) {
    failSafely("controlled_driver_job_status_event_cleanup_delete_failed_safely", {
      deletedRows: Array.isArray(deletedEvents) ? deletedEvents.length : 0,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const linkRows = await loadExactLinkRows(client);

  if (linkRows.length !== 1 || linkRows[0]?.id !== linkId || !linkRecordMatchesFake(linkRows[0])) {
    failSafely("controlled_driver_job_link_cleanup_exact_match_failed", {
      matchedRows: linkRows.length,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const { data: deletedLinks, error: deleteLinksError } = await client
    .from("driver_job_links")
    .delete()
    .eq("id", linkId)
    .eq("booking_reference", fakeBookingReference)
    .select("id, booking_reference");

  if (deleteLinksError || !Array.isArray(deletedLinks) || deletedLinks.length !== 1) {
    failSafely("controlled_driver_job_link_cleanup_delete_failed_safely", {
      deletedRows: Array.isArray(deletedLinks) ? deletedLinks.length : 0,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const remainingLinks = await loadExactLinkRows(client);
  const remainingEvents = await loadExactStatusEventRows(client, linkId);

  if (remainingLinks.length !== 0 || remainingEvents.length !== 0) {
    failSafely("controlled_driver_job_status_cleanup_verify_absent_failed", {
      remainingEventRows: remainingEvents.length,
      remainingLinkRows: remainingLinks.length,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return {
    deletedLinkRows: deletedLinks.length,
    deletedStatusEventRows: deletedEvents.length,
    postCleanupDirectLinkRows: remainingLinks.length,
    postCleanupDirectStatusEventRows: remainingEvents.length,
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
  forceDriverJobPersistenceOff();

  const fakeRawToken = `stage-driver-job-status-${randomBytes(24).toString("base64url")}`;
  const harness = await loadHarness();
  const client = clientFromEnv();
  const tokenHash = harness.driverLink.hashDriverJobLinkToken(fakeRawToken);

  try {
    enableDriverJobVerificationProcessOnly();

    const blockedUnknown = await readResponse(
      await harness.route.GET(getRequest(`not-${fakeRawToken}`), routeContext(`not-${fakeRawToken}`)),
    );
    const blockedInvalidStatus = await readResponse(
      await harness.statusRoute.PATCH(
        patchRequest(fakeRawToken, "cancelled"),
        routeContext(fakeRawToken),
      ),
    );

    if (blockedUnknown.status !== 401 || blockedInvalidStatus.status !== 400) {
      failSafely("driver_job_status_route_safety_gate_failed_before_live_write", {
        invalidStatusGate: safeResultName(blockedInvalidStatus),
        unknownTokenGate: safeResultName(blockedUnknown),
        verificationReference: fakeBookingReference,
      });
    }

    const preExistingLinks = await loadExactLinkRows(client);

    if (preExistingLinks.length !== 0) {
      failSafely("driver_job_status_fake_reference_already_exists", {
        matchedRows: preExistingLinks.length,
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    await writeLiveAttemptMarker();

    const linkRow = await insertFakeLinkRow(client, linkPayload(tokenHash));
    const linkId = linkRow.id;
    const initialLoad = await readResponse(
      await harness.route.GET(getRequest(fakeRawToken), routeContext(fakeRawToken)),
    );

    if (
      initialLoad.status !== 200 ||
      initialLoad.body?.ok !== true ||
      initialLoad.body?.mode !== "production" ||
      initialLoad.body?.payload?.reference !== fakeBookingReference ||
      initialLoad.body?.payload?.pickupLocation !== fakePickupLocation ||
      initialLoad.body?.payload?.dropoffLocation !== fakeDropoffLocation ||
      initialLoad.body?.payload?.status !== "assigned" ||
      safeRecordContainsUnsafeFields(initialLoad.body)
    ) {
      failSafely("controlled_driver_job_status_initial_load_failed_safely", {
        productionDbTouched: true,
        status: initialLoad.status,
        verificationReference: fakeBookingReference,
      });
    }

    const saveResult = await readResponse(
      await harness.statusRoute.PATCH(
        patchRequest(fakeRawToken, "OTW"),
        routeContext(fakeRawToken),
      ),
    );

    if (
      saveResult.status !== 200 ||
      saveResult.body?.ok !== true ||
      saveResult.body?.mode !== "production" ||
      saveResult.body?.status !== fakeStatusValue ||
      saveResult.body?.payload?.reference !== fakeBookingReference ||
      saveResult.body?.payload?.status !== fakeStatusValue ||
      safeRecordContainsUnsafeFields(saveResult.body)
    ) {
      failSafely("controlled_driver_job_status_save_failed_safely", {
        productionDbTouched: true,
        status: saveResult.status,
        verificationReference: fakeBookingReference,
      });
    }

    const statusEvents = await loadExactStatusEventRows(client, linkId);

    if (
      statusEvents.length !== 1 ||
      !statusEventMatchesFake(statusEvents[0], linkId) ||
      safeRecordContainsUnsafeFields(statusEvents[0])
    ) {
      failSafely("controlled_driver_job_status_event_match_failed", {
        matchedRows: statusEvents.length,
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    const loadAfterSave = await readResponse(
      await harness.route.GET(getRequest(fakeRawToken), routeContext(fakeRawToken)),
    );

    if (
      loadAfterSave.status !== 200 ||
      loadAfterSave.body?.ok !== true ||
      loadAfterSave.body?.payload?.reference !== fakeBookingReference ||
      loadAfterSave.body?.payload?.status !== fakeStatusValue ||
      safeRecordContainsUnsafeFields(loadAfterSave.body)
    ) {
      failSafely("controlled_driver_job_status_load_after_save_failed_safely", {
        productionDbTouched: true,
        status: loadAfterSave.status,
        verificationReference: fakeBookingReference,
      });
    }

    const cleanupResult = await cleanupExactFakeRows(client, linkId);
    const postCleanupRouteLoad = await readResponse(
      await harness.route.GET(getRequest(fakeRawToken), routeContext(fakeRawToken)),
    );

    if (postCleanupRouteLoad.status !== 401 || postCleanupRouteLoad.body?.reason !== "unauthorized") {
      failSafely("controlled_driver_job_status_post_cleanup_route_load_failed", {
        productionDbTouched: true,
        status: postCleanupRouteLoad.status,
        verificationReference: fakeBookingReference,
      });
    }

    forceDriverJobPersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED) === "true") {
      failSafely("local_env_driver_job_status_default_not_off_after_verification", {
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    emitEvidence({
      cleanupRollback: {
        cleanupDeletedExactFakeRows: true,
        cleanupMethod:
          "Supabase JS exact-reference delete on driver_job_status_events, then driver_job_links",
        cleanupScope: ["booking_reference", "driver_job_link_id", "driver_job_links.id"],
        deletedLinkRows: cleanupResult.deletedLinkRows,
        deletedStatusEventRows: cleanupResult.deletedStatusEventRows,
        envFileChanged: false,
        linkGateDefaultAfter: "off",
        postCleanupDirectLinkRows: cleanupResult.postCleanupDirectLinkRows,
        postCleanupDirectStatusEventRows: cleanupResult.postCleanupDirectStatusEventRows,
        postCleanupRouteResult: "blocked-401",
        processKillSwitchAfter: "off",
      },
      env: {
        checkedEnvCandidates: validation.checked,
        envFileName: validation.envFileName,
        linkGateDefaultBefore: "off",
        requiredEnvNamesPresent: requiredEnvKeys,
        valuesPrinted: false,
      },
      fakeDriverJobStatus: {
        booking_reference: fakeBookingReference,
        link_status: "active",
        rawTokenPrinted: false,
        safeFieldsOnly: true,
        status_value: fakeStatusValue,
        tokenHashPrinted: false,
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingInvoicePaymentPdfPayoutLocationNotificationParserLearning: true,
      noBroadProductionWrites: true,
      noCustomerDriverAuthActivation: true,
      noMigration: true,
      noRawSql: true,
      noRealBookingsCustomersTouched: true,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      ok: true,
      productionDbTouched: true,
      result: {
        apiRouteInitialLoad: safeResultName(initialLoad),
        apiRouteLoadAfterSave: safeResultName(loadAfterSave),
        apiRouteSave: safeResultName(saveResult),
        exactCleanup: "passed",
        invalidStatusGate: safeResultName(blockedInvalidStatus),
        loadedReferenceMatched: true,
        postCleanupLoad: safeResultName(postCleanupRouteLoad),
        rowDataPrinted: false,
        unknownTokenGate: safeResultName(blockedUnknown),
      },
      stage: "driver-job-status-production-verification",
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one direct server-only fake driver_job_links insert for the generated token hash",
        "one production-mode GET load through /api/driver-job/[token]",
        "one production-mode PATCH save through /api/driver-job/[token]/status",
        "one production-mode GET load after save through /api/driver-job/[token]",
        "one exact cleanup delete scoped to the fake driver_job_status_events row",
        "one exact cleanup delete scoped to the fake driver_job_links row",
      ],
      unsafeFieldsWritten: false,
      verificationReference: fakeBookingReference,
      writtenScope: {
        bookings: "none",
        customers: "none",
        driverJobLinks: "one clearly marked fake hashed-token link row only",
        driverJobStatusEvents: "one clearly marked fake driver status event row only",
      },
    });
  } finally {
    forceDriverJobPersistenceOff();
    await harness.cleanup();
  }
}

main().catch((error) => {
  forceDriverJobPersistenceOff();

  if (error instanceof SafeFailure) {
    emitEvidence({
      error: error.code,
      ok: false,
      linkGateDefaultAfter: "off",
      stage: "driver-job-status-production-verification",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    error: "unexpected_driver_job_status_production_save_load_runner_failure_sanitized",
    ok: false,
    linkGateDefaultAfter: "off",
    stage: "driver-job-status-production-verification",
  });
  process.exit(1);
});
