import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_ADMIN_DRIVER_BID_OFFER_PRODUCTION_SAVE_LOAD_APPROVED";
const approvalValue = "stage-driver-bid-offer-william-approved";
const candidateEnvFileNames = [".env.local", ".env.stage4a388.local"];
const expectedMaskedProductionProjectRef = "kvv...atm";
const fakeBookingReference = "PROD-DRIVER-BID-OFFER-VERIFY-20260610-001";
const fakeOfferStatus = "open";
const fakeClosedOfferStatus = "closed";
const fakePickupAt = "2026-06-12T02:30:00.000Z";
const fakeClosesAt = "2026-06-11T14:30:00.000Z";
const fakeSafePickupArea = "Marina Bay verification pickup";
const fakeSafeDropoffArea = "Changi Airport verification dropoff";
const fakeSafeVehicleLabel = "Alphard verification";
const fakeSafeTripSummary =
  "Fake admin driver bid offer verification row; load, close, then remove exact row.";
const fakeSafeOfferContext = {
  next_action: "Exact cleanup after load-back verification",
  offer_summary: "Controlled fake driver bid offer verification only",
};
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-admin-driver-bid-offer-live-write-attempted.marker",
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
  "lib/driver-portal-bidding-persistence.ts",
  "app/api/admin-driver-job-bid-offers/route.ts",
];
const unsafeEvidencePattern =
  /customer_price|customer_charge|quoted_price|rate_amount|fare_amount|amount_due|billing_amount|billing_rate|invoice|payment|pdf|stripe|paynow|driver_payout|payout|finance|telegram|whatsapp|sms_send|email_send|proof|photo|live_location|auth_link|customer_auth|driver_auth|raw_ai_prompt|raw_parser_prompt|parser_learning|parser_debug|service_role|server_secret|internal_admin_note|admin_note|internal_note|raw_token|plain_token|token_value|secret/i;

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

  failSafely("admin_driver_bid_offer_production_env_preflight_failed", {
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-driver-bid-offer-live-"));

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    biddingPersistence: require(path.join(tempDir, "lib/driver-portal-bidding-persistence.js")),
    route: require(path.join(tempDir, "app/api/admin-driver-job-bid-offers/route.js")),
  };
}

function fakePayload() {
  return {
    booking_reference: fakeBookingReference,
    closes_at: fakeClosesAt,
    offer_status: fakeOfferStatus,
    pickup_at: fakePickupAt,
    safe_dropoff_area: fakeSafeDropoffArea,
    safe_offer_context: fakeSafeOfferContext,
    safe_pickup_area: fakeSafePickupArea,
    safe_trip_summary: fakeSafeTripSummary,
    safe_vehicle_label: fakeSafeVehicleLabel,
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

function requestWithJson(method, url, body, headers) {
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

function bidOfferRecordMatchesFake(row, expectedStatus = fakeOfferStatus) {
  return (
    row?.booking_reference === fakeBookingReference &&
    row?.offer_status === expectedStatus &&
    row?.pickup_at === fakePickupAt &&
    row?.safe_pickup_area === fakeSafePickupArea &&
    row?.safe_dropoff_area === fakeSafeDropoffArea &&
    row?.safe_vehicle_label === fakeSafeVehicleLabel &&
    row?.safe_trip_summary === fakeSafeTripSummary &&
    row?.source_surface === "admin_api" &&
    ["admin", "dispatcher"].includes(row?.actor_role) &&
    row?.safe_offer_context?.next_action === fakeSafeOfferContext.next_action &&
    row?.safe_offer_context?.offer_summary === fakeSafeOfferContext.offer_summary
  );
}

function safeRecordContainsUnsafeFields(row) {
  return unsafeEvidencePattern.test(JSON.stringify(row));
}

async function writeLiveAttemptMarker() {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      `Admin driver bid offer controlled live write attempted for ${fakeBookingReference}\n`,
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("controlled_admin_driver_bid_offer_live_write_already_attempted");
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

async function loadExactBidOfferRows(client) {
  const { data, error } = await client
    .from("driver_job_bid_offers")
    .select(
      "id, booking_reference, offer_status, pickup_at, safe_pickup_area, safe_dropoff_area, safe_vehicle_label, safe_trip_summary, safe_offer_context, source_surface, actor_role, actor_label",
    )
    .eq("booking_reference", fakeBookingReference);

  if (error) {
    failSafely("controlled_admin_driver_bid_offer_cleanup_offer_preselect_failed_safely", {
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function loadExactBidRows(client, offerId = null) {
  let query = client
    .from("driver_job_bids")
    .select(
      "id, driver_job_bid_offer_id, booking_reference, driver_reference, bid_status, bid_source, safe_driver_label, safe_bid_note, safe_bid_context",
    )
    .eq("booking_reference", fakeBookingReference);

  if (offerId) {
    query = query.eq("driver_job_bid_offer_id", offerId);
  }

  const { data, error } = await query;

  if (error) {
    failSafely("controlled_admin_driver_bid_offer_cleanup_bid_preselect_failed_safely", {
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function cleanupExactFakeRows(insertedOfferId) {
  const client = cleanupClientFromEnv();
  const offerRows = await loadExactBidOfferRows(client);
  const matchingOfferRows = offerRows.filter((row) => row?.id === insertedOfferId);

  if (
    offerRows.length !== 1 ||
    matchingOfferRows.length !== 1 ||
    !bidOfferRecordMatchesFake(matchingOfferRows[0], fakeClosedOfferStatus) ||
    safeRecordContainsUnsafeFields(matchingOfferRows[0])
  ) {
    failSafely("controlled_admin_driver_bid_offer_cleanup_exact_offer_match_failed", {
      matchedRows: offerRows.length,
      matchedInsertedRows: matchingOfferRows.length,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const bidRows = await loadExactBidRows(client, insertedOfferId);

  if (bidRows.some((row) => safeRecordContainsUnsafeFields(row))) {
    failSafely("controlled_admin_driver_bid_offer_cleanup_exact_bid_match_failed", {
      matchedRows: bidRows.length,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const { data: deletedBidRows, error: bidDeleteError } = await client
    .from("driver_job_bids")
    .delete()
    .eq("booking_reference", fakeBookingReference)
    .eq("driver_job_bid_offer_id", insertedOfferId)
    .select("id, booking_reference, driver_job_bid_offer_id");

  if (bidDeleteError || !Array.isArray(deletedBidRows)) {
    failSafely("controlled_admin_driver_bid_offer_cleanup_bid_delete_failed_safely", {
      deletedRows: Array.isArray(deletedBidRows) ? deletedBidRows.length : 0,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const { data: deletedOfferRows, error: offerDeleteError } = await client
    .from("driver_job_bid_offers")
    .delete()
    .eq("id", insertedOfferId)
    .eq("booking_reference", fakeBookingReference)
    .select("id, booking_reference, offer_status");

  if (offerDeleteError || !Array.isArray(deletedOfferRows) || deletedOfferRows.length !== 1) {
    failSafely("controlled_admin_driver_bid_offer_cleanup_offer_delete_failed_safely", {
      deletedRows: Array.isArray(deletedOfferRows) ? deletedOfferRows.length : 0,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  const postCleanupDirectBidOfferRows = await loadExactBidOfferRows(client);
  const postCleanupDirectBidRows = await loadExactBidRows(client, insertedOfferId);

  if (postCleanupDirectBidOfferRows.length !== 0 || postCleanupDirectBidRows.length !== 0) {
    failSafely("controlled_admin_driver_bid_offer_cleanup_verify_absent_failed", {
      postCleanupDirectBidOfferRows: postCleanupDirectBidOfferRows.length,
      postCleanupDirectBidRows: postCleanupDirectBidRows.length,
      productionDbTouched: true,
      verificationReference: fakeBookingReference,
    });
  }

  return {
    deletedBidRows: deletedBidRows.length,
    deletedOfferRows: deletedOfferRows.length,
    postCleanupDirectBidOfferRows: postCleanupDirectBidOfferRows.length,
    postCleanupDirectBidRows: postCleanupDirectBidRows.length,
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
    const parsed = harness.biddingPersistence.parseAdminDriverJobBidOfferSavePayload(fakePayload());

    if (!parsed.ok) {
      failSafely("safe_admin_driver_bid_offer_payload_rejected_before_live_write", {
        verificationReference: fakeBookingReference,
      });
    }

    const blockedAnonymous = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-driver-job-bid-offers?booking_reference=${fakeBookingReference}`,
          {},
        ),
      ),
    );
    const blockedCustomerReferer = await readResponse(
      await harness.route.POST(
        requestWithJson("POST", "http://localhost/api/admin-driver-job-bid-offers", fakePayload(), {
          ...adminHeaders(),
          referer: "http://localhost/book",
        }),
      ),
    );
    const blockedDriverReferer = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-driver-job-bid-offers?booking_reference=${fakeBookingReference}`,
          {
            ...adminHeaders(),
            referer: "http://localhost/driver-job-demo",
          },
        ),
      ),
    );

    const unsafePayloadResult = await readResponse(
      await harness.route.POST(
        requestWithJson(
          "POST",
          "http://localhost/api/admin-driver-job-bid-offers",
          {
            ...fakePayload(),
            safe_trip_summary: "Fake bid offer with PayNow payout details.",
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
      failSafely("admin_driver_bid_offer_route_safety_gate_failed_before_live_write", {
        anonymousGate: safeResultName(blockedAnonymous),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        driverRefererGate: safeResultName(blockedDriverReferer),
        unsafePayloadGate: safeResultName(unsafePayloadResult),
        verificationReference: fakeBookingReference,
      });
    }

    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";

    const cleanupClient = cleanupClientFromEnv();
    const preExistingDirectBidOfferRows = await loadExactBidOfferRows(cleanupClient);
    const preExistingDirectBidRows = await loadExactBidRows(cleanupClient);

    if (preExistingDirectBidOfferRows.length !== 0 || preExistingDirectBidRows.length !== 0) {
      failSafely("admin_driver_bid_offer_fake_reference_already_exists_direct_preflight_failed", {
        matchedBidOfferRows: preExistingDirectBidOfferRows.length,
        matchedBidRows: preExistingDirectBidRows.length,
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    const preExistingRouteLoad = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-driver-job-bid-offers?booking_reference=${fakeBookingReference}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );

    if (
      preExistingRouteLoad.status !== 200 ||
      preExistingRouteLoad.body?.ok !== true ||
      !Array.isArray(preExistingRouteLoad.body.bid_offers) ||
      preExistingRouteLoad.body.bid_offers.length !== 0
    ) {
      failSafely("admin_driver_bid_offer_fake_reference_already_exists_or_preload_failed", {
        matchedRows: Array.isArray(preExistingRouteLoad.body?.bid_offers)
          ? preExistingRouteLoad.body.bid_offers.length
          : null,
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    await writeLiveAttemptMarker();

    const saveResult = await readResponse(
      await harness.route.POST(
        requestWithJson("POST", "http://localhost/api/admin-driver-job-bid-offers", fakePayload(), adminHeaders()),
      ),
    );
    const insertedOfferId = saveResult.body?.bid_offer?.id;

    if (
      saveResult.status !== 200 ||
      saveResult.body?.ok !== true ||
      !insertedOfferId ||
      !bidOfferRecordMatchesFake(saveResult.body.bid_offer) ||
      safeRecordContainsUnsafeFields(saveResult.body.bid_offer)
    ) {
      failSafely("controlled_admin_driver_bid_offer_save_failed_safely", {
        productionDbTouched: true,
        status: saveResult.status,
        verificationReference: fakeBookingReference,
      });
    }

    const loadResult = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-driver-job-bid-offers?booking_reference=${fakeBookingReference}&offer_status=${fakeOfferStatus}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );
    const loadedRecord = Array.isArray(loadResult.body?.bid_offers)
      ? loadResult.body.bid_offers.find((record) => record?.id === insertedOfferId)
      : null;

    if (
      loadResult.status !== 200 ||
      loadResult.body?.ok !== true ||
      !loadedRecord ||
      !bidOfferRecordMatchesFake(loadedRecord) ||
      safeRecordContainsUnsafeFields(loadedRecord)
    ) {
      failSafely("controlled_admin_driver_bid_offer_load_failed_safely", {
        productionDbTouched: true,
        status: loadResult.status,
        verificationReference: fakeBookingReference,
      });
    }

    const closeResult = await readResponse(
      await harness.route.PATCH(
        requestWithJson(
          "PATCH",
          "http://localhost/api/admin-driver-job-bid-offers",
          {
            bid_offer_id: insertedOfferId,
            offer_status: fakeClosedOfferStatus,
          },
          adminHeaders(),
        ),
      ),
    );

    if (
      closeResult.status !== 200 ||
      closeResult.body?.ok !== true ||
      !bidOfferRecordMatchesFake(closeResult.body.bid_offer, fakeClosedOfferStatus) ||
      safeRecordContainsUnsafeFields(closeResult.body.bid_offer)
    ) {
      failSafely("controlled_admin_driver_bid_offer_close_failed_safely", {
        productionDbTouched: true,
        status: closeResult.status,
        verificationReference: fakeBookingReference,
      });
    }

    const closedLoadResult = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-driver-job-bid-offers?booking_reference=${fakeBookingReference}&offer_status=${fakeClosedOfferStatus}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );
    const closedLoadedRecord = Array.isArray(closedLoadResult.body?.bid_offers)
      ? closedLoadResult.body.bid_offers.find((record) => record?.id === insertedOfferId)
      : null;

    if (
      closedLoadResult.status !== 200 ||
      closedLoadResult.body?.ok !== true ||
      !closedLoadedRecord ||
      !bidOfferRecordMatchesFake(closedLoadedRecord, fakeClosedOfferStatus) ||
      safeRecordContainsUnsafeFields(closedLoadedRecord)
    ) {
      failSafely("controlled_admin_driver_bid_offer_closed_load_failed_safely", {
        productionDbTouched: true,
        status: closedLoadResult.status,
        verificationReference: fakeBookingReference,
      });
    }

    const cleanupResult = await cleanupExactFakeRows(insertedOfferId);
    const postCleanupRouteLoad = await readResponse(
      await harness.route.GET(
        getRequest(
          `http://localhost/api/admin-driver-job-bid-offers?booking_reference=${fakeBookingReference}&limit=10&page=1`,
          adminHeaders(),
        ),
      ),
    );

    if (
      postCleanupRouteLoad.status !== 200 ||
      postCleanupRouteLoad.body?.ok !== true ||
      !Array.isArray(postCleanupRouteLoad.body.bid_offers) ||
      postCleanupRouteLoad.body.bid_offers.length !== 0
    ) {
      failSafely("controlled_admin_driver_bid_offer_post_cleanup_route_load_failed", {
        matchedRows: Array.isArray(postCleanupRouteLoad.body?.bid_offers)
          ? postCleanupRouteLoad.body.bid_offers.length
          : null,
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    forcePersistenceOff();

    const finalEnv = parseEnvFile(await readFile(path.join(process.cwd(), validation.envFileName), "utf8"));

    if (normalizedEnvValue(finalEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) !== "false") {
      failSafely("local_env_persistence_default_not_off_after_admin_driver_bid_offer_verification", {
        productionDbTouched: true,
        verificationReference: fakeBookingReference,
      });
    }

    emitEvidence({
      cleanupRollback: {
        cleanupDeletedExactFakeRows: true,
        cleanupMethod:
          "Supabase JS exact id and booking_reference delete on driver_job_bid_offers plus exact linked driver_job_bids cleanup",
        cleanupScope: ["driver_job_bid_offers.id", "booking_reference", "driver_job_bids.driver_job_bid_offer_id"],
        deletedBidRows: cleanupResult.deletedBidRows,
        deletedOfferRows: cleanupResult.deletedOfferRows,
        envFileChanged: false,
        persistenceDefaultAfter: "off",
        postCleanupDirectBidOfferRows: cleanupResult.postCleanupDirectBidOfferRows,
        postCleanupDirectBidRows: cleanupResult.postCleanupDirectBidRows,
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
      fakeAdminDriverBidOffer: {
        booking_reference: fakeBookingReference,
        closed_offer_status: fakeClosedOfferStatus,
        offer_status: fakeOfferStatus,
        pickup_at: fakePickupAt,
        safeFieldsOnly: true,
      },
      fullProjectRefPrinted: false,
      liveApiRouteVerificationAttemptCount: 1,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingInvoicePaymentPdfPayoutLocationParserLearning: true,
      noBroadProductionWrites: true,
      noCustomerDriverAuthActivation: true,
      noExternalNotificationSending: true,
      noMigration: true,
      noRawSql: true,
      noRealBookingsCustomersOrChildRowsTouched: true,
      noRuntimeDriverBidWrite: true,
      noSecretsPrinted: true,
      noSupabaseCli: true,
      ok: true,
      productionDbTouched: true,
      result: {
        anonymousGate: safeResultName(blockedAnonymous),
        apiRouteClose: safeResultName(closeResult),
        apiRouteClosedLoad: safeResultName(closedLoadResult),
        apiRouteLoad: safeResultName(loadResult),
        apiRouteSave: safeResultName(saveResult),
        customerRefererGate: safeResultName(blockedCustomerReferer),
        driverRefererGate: safeResultName(blockedDriverReferer),
        exactCleanup: "passed",
        loadedBookingReferenceMatched: true,
        postCleanupLoad: safeResultName(postCleanupRouteLoad),
        rowDataPrinted: false,
        unsafePayloadGate: safeResultName(unsafePayloadResult),
      },
      stage: "admin-driver-bid-offer-production-verification",
      targetMatchesPriorProductionEvidence: true,
      touchScope: [
        "one admin-gated POST save through /api/admin-driver-job-bid-offers",
        "one admin-gated GET load through /api/admin-driver-job-bid-offers for the exact fake booking reference",
        "one admin-gated PATCH close through /api/admin-driver-job-bid-offers for the exact fake offer id",
        "one exact cleanup delete scoped to driver_job_bid_offers by inserted id and booking_reference",
        "one exact linked cleanup delete scoped to driver_job_bids by inserted offer id and booking_reference",
        "one admin-gated GET load after cleanup to confirm no exact fake reference remains",
      ],
      unsafeFieldsWritten: false,
      verificationReference: fakeBookingReference,
      writtenScope: {
        bookings: "none",
        customerContacts: "none",
        customers: "none",
        driverJobBidOffers: "one clearly marked fake admin bid offer row only",
        driverJobBids: "none expected; exact linked fake cleanup verifies zero remaining",
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
      stage: "admin-driver-bid-offer-production-verification",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    error: "unexpected_admin_driver_bid_offer_production_save_load_runner_failure_sanitized",
    ok: false,
    persistenceDefaultAfter: "off",
    stage: "admin-driver-bid-offer-production-verification",
  });
  process.exit(1);
});
