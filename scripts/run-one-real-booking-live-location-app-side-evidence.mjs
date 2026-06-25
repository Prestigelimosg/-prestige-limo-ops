import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName =
  "PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_EVIDENCE_APPROVED";
const expectedApproval =
  "one-real-booking-live-location-evidence-approved";
const driverTokenEnvName =
  "PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_DRIVER_JOB_LINK_TOKEN";
const bookingReferenceEnvName =
  "PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_BOOKING_REFERENCE";
const evidenceReferenceEnvName =
  "PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_EVIDENCE_REFERENCE";
const temporaryDriverLinkApprovalEnvName =
  "PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_TEMP_DRIVER_LINK_APPROVED";
const expectedTemporaryDriverLinkApproval =
  "temporary-driver-job-link-approved";

const runtimeSettingsTable = "driver_live_location_runtime_settings";
const runtimeSettingName = "driver_live_location_runtime";
const driverJobLinkTable = "driver_job_links";
const latestPositionsTable = "driver_live_location_latest_positions";
const auditEventsTable = "driver_live_location_audit_events";
const bookingsTable = "bookings";
const customerAccessAccountsTable = "customer_access_accounts";

const localEnvFiles = [
  "/private/tmp/prestige-one-real-booking-live-location-evidence.env",
  "/private/tmp/prestige-driver-live-location-evidence.env",
  ".env.production.local",
  ".env.local",
  ".env.stage4a388.local",
];

const requiredBaseEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const requiredExistingDriverLinkEnvNames = [
  driverTokenEnvName,
  bookingReferenceEnvName,
];

const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const eligibleServiceFamilies = new Set([
  "dep",
  "departure",
  "trf",
  "transfer",
  "dsp",
  "hourly",
]);
const forbiddenSerializedPattern =
  /api[_ -]?key|billing|cookie|customer[_ -]?email|customer[_ -]?phone|customer[_ -]?price|debug|driver[_ -]?payout|driver_job_link_id|finance|internal|invoice|jwt|parser|password|payment|paynow|payout|pdf|raw[_ -]?booking|raw[_ -]?token|secret|service[_ -]?role|token[_ -]?hash/i;

class EvidenceFailure extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "EvidenceFailure";
    this.code = code;
    this.details = details;
  }
}

function parseEnvFile(source) {
  const parsed = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      parsed[key] = value;
    }
  }

  return parsed;
}

async function loadLocalEnvFiles() {
  for (const filePath of localEnvFiles) {
    if (!existsSync(filePath)) {
      continue;
    }

    const parsed = parseEnvFile(await readFile(filePath, "utf8"));

    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function envValue(name) {
  return process.env[name]?.trim() || "";
}

function requireApproval() {
  if (envValue(approvalEnvName) !== expectedApproval) {
    throw new EvidenceFailure("one_real_booking_live_location_evidence_not_approved", {
      required_env_name: approvalEnvName,
      required_value_name_only: expectedApproval,
    });
  }
}

function temporaryDriverLinkApproved() {
  return envValue(temporaryDriverLinkApprovalEnvName) === expectedTemporaryDriverLinkApproval;
}

function requireRequiredEnvNames({ temporaryDriverLink }) {
  const requiredEnvNames = temporaryDriverLink
    ? requiredBaseEnvNames
    : [...requiredBaseEnvNames, ...requiredExistingDriverLinkEnvNames];
  const missing = requiredEnvNames.filter((name) => !envValue(name));

  if (missing.length > 0) {
    throw new EvidenceFailure("missing_required_one_real_booking_live_location_env_names", {
      missing_env_names_only: missing,
      temporary_driver_link_approved: temporaryDriverLink,
    });
  }
}

function evidenceReference() {
  const configured = envValue(evidenceReferenceEnvName);
  const fallback = `ONE-REAL-BOOKING-LIVE-LOCATION-${new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "")}`;
  const reference = configured || fallback;

  if (!safeReferencePattern.test(reference)) {
    throw new EvidenceFailure("one_real_booking_live_location_evidence_reference_invalid", {
      env_name: evidenceReferenceEnvName,
    });
  }

  return reference;
}

function safeReference(value) {
  const cleaned = String(value || "").trim();

  return safeReferencePattern.test(cleaned) ? cleaned : "";
}

function tokenHash(rawToken) {
  const cleanToken = String(rawToken || "").trim();

  if (cleanToken.length < 16) {
    throw new EvidenceFailure("one_real_booking_live_location_driver_token_invalid", {
      env_name: driverTokenEnvName,
    });
  }

  return createHash("sha256").update(cleanToken, "utf8").digest("hex");
}

function serviceFamily(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)[0];
}

function safePayloadText(value, maxLength = 220) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength || forbiddenSerializedPattern.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function safeDateTimeText(...values) {
  for (const value of values) {
    const cleaned = safePayloadText(value, 80);

    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function safeRouteText(...values) {
  for (const value of values) {
    const cleaned = safePayloadText(value, 1000);

    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function looksLikeEvidenceOrMock(value) {
  return /demo|dummy|evidence|fake|mock|sample|test/i.test(String(value || ""));
}

function activeBookingStatus(row) {
  const statusText = [
    row?.admin_internal_status,
    row?.booking_status,
    row?.customer_facing_status,
    row?.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return !/cancel|closed|complete|declin|deleted|void/.test(statusText);
}

function controlCustomerAccountReference(accountReference) {
  const hash = createHash("sha256")
    .update(accountReference, "utf8")
    .digest("hex")
    .slice(0, 16);

  return `control-${hash}`;
}

function bookingSortTime(row) {
  for (const key of ["pickup_at", "pickup_datetime", "updated_at", "created_at"]) {
    const timestamp = new Date(String(row?.[key] || "")).getTime();

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  return 0;
}

function safeDriverJobPayloadFromBooking(row) {
  const pickupLocation = safePayloadText(row.pickup_location);
  const dropoffLocation = safePayloadText(row.dropoff_location);
  const pickupDateTime = safeDateTimeText(
    row.pickup_datetime,
    row.pickup_at,
    row.pickup_date_time,
    row.pickup_date,
  );
  const bookingType = safePayloadText(row.route_type || row.service_type, 80);
  const route = safeRouteText(
    row.route_summary,
    pickupLocation && dropoffLocation ? `${pickupLocation} to ${dropoffLocation}` : "",
  );

  if (!pickupLocation || !dropoffLocation || !pickupDateTime || !bookingType) {
    return null;
  }

  const payload = {
    booking_type: bookingType,
    dropoff_location: dropoffLocation,
    pickup_datetime: pickupDateTime,
    pickup_location: pickupLocation,
    route: route || `${pickupLocation} to ${dropoffLocation}`,
    status: safePayloadText(row.customer_facing_status || row.status, 80) || "Confirmed",
  };
  const flightNumber = safePayloadText(row.flight_no || row.flight_number, 80);
  const passengerName = safePayloadText(row.passenger_name, 120);
  const pickupDate = safePayloadText(row.pickup_date, 80);
  const pickupTime = safePayloadText(row.pickup_time, 80);

  if (flightNumber) {
    payload.flight_no = flightNumber;
  }

  if (passengerName) {
    payload.passenger_name = passengerName;
  }

  if (pickupDate) {
    payload.pickup_date = pickupDate;
  }

  if (pickupTime) {
    payload.pickup_time = pickupTime;
  }

  return payload;
}

function createSupabaseClient() {
  return createClient(envValue("SUPABASE_URL"), envValue("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function assertStatus(result, expectedStatus, label) {
  if (result.status !== expectedStatus) {
    throw new EvidenceFailure("one_real_booking_live_location_unexpected_status", {
      actual_status: result.status,
      expected_status: expectedStatus,
      label,
      safe_reason: safeReference(result.body?.reason),
    });
  }
}

function assertNoForbiddenCustomerPayload(body, label) {
  const serialized = JSON.stringify(body || {});

  if (forbiddenSerializedPattern.test(serialized)) {
    throw new EvidenceFailure("one_real_booking_live_location_forbidden_payload_field", {
      label,
    });
  }
}

function isRuntimeSettingActive(setting) {
  return (
    setting?.setting_status === "active" &&
    setting?.driver_live_location_mode === "runtime" &&
    setting?.driver_live_location_capture_enabled === true &&
    setting?.admin_active_jobs_map_enabled === true
  );
}

async function readCurrentRuntimeSetting(client) {
  const { data, error } = await client
    .from(runtimeSettingsTable)
    .select("*")
    .eq("setting_name", runtimeSettingName)
    .maybeSingle();

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_runtime_setting_read_failed");
  }

  return data || null;
}

async function restoreRuntimeSetting(client, previousSetting) {
  if (previousSetting) {
    const { error } = await client.from(runtimeSettingsTable).upsert(previousSetting, {
      onConflict: "setting_name",
    });

    if (error) {
      throw new EvidenceFailure("one_real_booking_live_location_runtime_setting_restore_failed");
    }

    return;
  }

  const { error } = await client
    .from(runtimeSettingsTable)
    .delete()
    .eq("setting_name", runtimeSettingName);

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_runtime_setting_cleanup_failed");
  }
}

async function openRuntimeSetting(client, bookingReference) {
  const { error } = await client.from(runtimeSettingsTable).upsert(
    {
      admin_active_jobs_map_enabled: true,
      driver_live_location_allowed_job_references: [bookingReference],
      driver_live_location_capture_enabled: true,
      driver_live_location_mode: "runtime",
      driver_live_location_retention_minutes: 120,
      driver_live_location_stale_after_seconds: 300,
      setting_name: runtimeSettingName,
      setting_status: "active",
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "setting_name",
    },
  );

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_runtime_setting_open_failed");
  }
}

async function readLatestPosition(client, driverJobLinkId) {
  const { data, error } = await client
    .from(latestPositionsTable)
    .select("*")
    .eq("driver_job_link_id", driverJobLinkId)
    .maybeSingle();

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_latest_position_read_failed");
  }

  return data || null;
}

async function restoreLatestPosition(client, driverJobLinkId, previousPosition) {
  if (previousPosition) {
    const { error } = await client.from(latestPositionsTable).upsert(previousPosition, {
      onConflict: "driver_job_link_id",
    });

    if (error) {
      throw new EvidenceFailure("one_real_booking_live_location_latest_position_restore_failed");
    }

    return;
  }

  const { error } = await client
    .from(latestPositionsTable)
    .delete()
    .eq("driver_job_link_id", driverJobLinkId);

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_latest_position_cleanup_failed");
  }
}

async function cleanupEvidenceRows(client, reference, driverJobLinkId) {
  await client.from(auditEventsTable).delete().eq("evidence_reference", reference);
  await client.from(latestPositionsTable).delete().eq("evidence_reference", reference);

  const { error } = await client
    .from(latestPositionsTable)
    .delete()
    .eq("driver_job_link_id", driverJobLinkId)
    .eq("evidence_reference", reference);

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_cleanup_failed");
  }
}

async function countEvidenceRows(client, tableName, reference) {
  const { count, error } = await client
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq("evidence_reference", reference);

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_count_failed", {
      table_name: tableName,
    });
  }

  return count ?? 0;
}

async function countDriverJobLinkById(client, driverJobLinkId) {
  const { count, error } = await client
    .from(driverJobLinkTable)
    .select("id", { count: "exact", head: true })
    .eq("id", driverJobLinkId);

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_temp_driver_link_count_failed");
  }

  return count ?? 0;
}

async function cleanupTemporaryDriverLink(client, driverJobLinkId) {
  if (!driverJobLinkId) {
    return;
  }

  await client
    .from(driverJobLinkTable)
    .update({
      link_status: "revoked",
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", driverJobLinkId);

  const { error } = await client
    .from(driverJobLinkTable)
    .delete()
    .eq("id", driverJobLinkId);

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_temp_driver_link_cleanup_failed");
  }
}

async function resolveExistingDriverLink(client, rawToken, expectedBookingReference) {
  const { data, error } = await client
    .from(driverJobLinkTable)
    .select("id, booking_reference, link_status, expires_at, revoked_at, safe_link_context")
    .eq("token_hash", tokenHash(rawToken))
    .maybeSingle();

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_driver_link_lookup_failed");
  }

  const driverLinkId = safeReference(data?.id);
  const bookingReference = safeReference(data?.booking_reference);

  if (!driverLinkId || !bookingReference) {
    throw new EvidenceFailure("one_real_booking_live_location_existing_driver_link_not_found", {
      required_env_name: driverTokenEnvName,
    });
  }

  if (bookingReference !== expectedBookingReference) {
    throw new EvidenceFailure("one_real_booking_live_location_driver_link_booking_mismatch", {
      booking_reference_env_name: bookingReferenceEnvName,
      driver_token_env_name: driverTokenEnvName,
    });
  }

  const expiresAt = new Date(String(data.expires_at || "")).getTime();

  if (
    data.link_status !== "active" ||
    data.revoked_at ||
    !Number.isFinite(expiresAt) ||
    Date.now() >= expiresAt
  ) {
    throw new EvidenceFailure("one_real_booking_live_location_driver_link_not_active");
  }

  return {
    bookingReference,
    driverJobLinkId,
  };
}

async function resolveBookingAndCustomer(client, bookingReference) {
  const { data: bookingRows, error: bookingError } = await client
    .from(bookingsTable)
    .select("booking_reference, customer_id, route_type, service_type")
    .eq("booking_reference", bookingReference)
    .limit(1);

  if (bookingError) {
    throw new EvidenceFailure("one_real_booking_live_location_booking_lookup_failed");
  }

  const booking = Array.isArray(bookingRows) ? bookingRows[0] : null;
  const accountReference = safeReference(booking?.customer_id);
  const matchedReference = safeReference(booking?.booking_reference);

  if (matchedReference !== bookingReference || !accountReference) {
    throw new EvidenceFailure("one_real_booking_live_location_booking_scope_not_found");
  }

  const family =
    serviceFamily(booking.route_type) || serviceFamily(booking.service_type);

  if (!eligibleServiceFamilies.has(family)) {
    throw new EvidenceFailure("one_real_booking_live_location_booking_service_not_eligible", {
      eligible_service_families: [...eligibleServiceFamilies],
    });
  }

  const { data: accountRows, error: accountError } = await client
    .from(customerAccessAccountsTable)
    .select("auth_user_id, customer_account_reference, account_status")
    .eq("customer_account_reference", accountReference)
    .eq("account_status", "active")
    .limit(1);

  if (accountError) {
    throw new EvidenceFailure("one_real_booking_live_location_customer_account_lookup_failed");
  }

  const accessAccount = Array.isArray(accountRows) ? accountRows[0] : null;
  const authUserId = String(accessAccount?.auth_user_id || "").trim();

  if (!uuidPattern.test(authUserId)) {
    throw new EvidenceFailure("one_real_booking_live_location_customer_access_mapping_missing");
  }

  return {
    accountReference,
    authUserId,
  };
}

async function customerBookingScopeExists(client, bookingReference, accountReference) {
  const { count, error } = await client
    .from(bookingsTable)
    .select("booking_reference", { count: "exact", head: true })
    .eq("booking_reference", bookingReference)
    .eq("customer_id", accountReference);

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_temp_booking_scope_check_failed");
  }

  return (count ?? 0) > 0;
}

async function findApprovedTemporaryDriverLinkTarget(client) {
  const requestedBookingReference = safeReference(envValue(bookingReferenceEnvName));
  const { data: latestRows, error: latestError } = await client
    .from(latestPositionsTable)
    .select("booking_reference")
    .limit(500);

  if (latestError) {
    throw new EvidenceFailure("one_real_booking_live_location_temp_latest_position_scan_failed");
  }

  const bookingReferencesWithLivePositions = new Set(
    (Array.isArray(latestRows) ? latestRows : [])
      .map((row) => safeReference(row?.booking_reference))
      .filter(Boolean),
  );
  const { data: bookingRows, error: bookingError } = await client
    .from(bookingsTable)
    .select("*")
    .limit(500);

  if (bookingError) {
    throw new EvidenceFailure("one_real_booking_live_location_temp_booking_scan_failed");
  }

  const eligibleRows = [];

  for (const row of Array.isArray(bookingRows) ? bookingRows : []) {
    const bookingReference = safeReference(row?.booking_reference);
    const accountReference = safeReference(row?.customer_id);
    const family = serviceFamily(row?.route_type) || serviceFamily(row?.service_type);

    if (
      !bookingReference ||
      (requestedBookingReference && bookingReference !== requestedBookingReference) ||
      looksLikeEvidenceOrMock(bookingReference) ||
      !accountReference ||
      looksLikeEvidenceOrMock(accountReference) ||
      !eligibleServiceFamilies.has(family) ||
      !activeBookingStatus(row) ||
      bookingReferencesWithLivePositions.has(bookingReference) ||
      !safeDriverJobPayloadFromBooking(row)
    ) {
      continue;
    }

    if (!(await customerBookingScopeExists(client, bookingReference, accountReference))) {
      continue;
    }

    eligibleRows.push(row);
  }

  eligibleRows.sort((left, right) => bookingSortTime(right) - bookingSortTime(left));

  const target = eligibleRows[0];

  if (!target) {
    throw new EvidenceFailure("one_real_booking_live_location_temp_target_not_found", {
      requested_booking_reference_present: Boolean(requestedBookingReference),
    });
  }

  const bookingReference = safeReference(target.booking_reference);
  const accountReference = safeReference(target.customer_id);
  const driverJobPayload = safeDriverJobPayloadFromBooking(target);

  if (!bookingReference || !accountReference || !driverJobPayload) {
    throw new EvidenceFailure("one_real_booking_live_location_temp_target_invalid");
  }

  return {
    accountReference,
    authUserId: randomUUID(),
    bookingReference,
    driverJobPayload,
  };
}

async function createTemporaryDriverJobLink(client, reference) {
  const target = await findApprovedTemporaryDriverLinkTarget(client);
  const rawToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
  const tempDriverJobLinkPayload = {
    actor_label: "one-real-booking-live-location-evidence",
    actor_role: "system",
    booking_reference: target.bookingReference,
    expires_at: expiresAt.toISOString(),
    issued_at: now.toISOString(),
    link_status: "active",
    revoked_at: null,
    safe_link_context: {
      driver_job_payload: target.driverJobPayload,
      evidence_reference: reference,
      link_purpose: "temporary_one_real_booking_live_location_evidence",
    },
    source_surface: "system",
    token_hash: tokenHash(rawToken),
    updated_at: now.toISOString(),
  };
  const { data, error } = await client
    .from(driverJobLinkTable)
    .insert(tempDriverJobLinkPayload)
    .select("id, booking_reference")
    .single();

  if (error) {
    throw new EvidenceFailure("one_real_booking_live_location_temp_driver_link_create_failed");
  }

  const driverJobLinkId = safeReference(data?.id);
  const bookingReference = safeReference(data?.booking_reference);

  if (!driverJobLinkId || bookingReference !== target.bookingReference) {
    throw new EvidenceFailure("one_real_booking_live_location_temp_driver_link_create_invalid");
  }

  return {
    bookingAndCustomer: {
      accountReference: target.accountReference,
      authUserId: target.authUserId,
    },
    bookingReference: target.bookingReference,
    driverLink: {
      bookingReference: target.bookingReference,
      driverJobLinkId,
    },
    rawToken,
    temporaryDriverLinkCreated: true,
  };
}

function transpileRuntimeModule(source, replacements = []) {
  let transformed = source.replace(/^import "server-only";\n\n/m, "");

  for (const [pattern, replacement] of replacements) {
    transformed = transformed.replace(pattern, replacement);
  }

  transformed = transformed.replace(
    /^import \{ createClient, type SupabaseClient \} from "@supabase\/supabase-js";\n\n/m,
    'const createClient = () => { throw new Error("unexpected runtime Supabase factory in evidence runner"); };\n\n',
  );

  return ts.transpileModule(transformed, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

async function writeRuntimeHarness() {
  const tempDir = await mkdtemp(join(tmpdir(), "prestige-one-real-live-location-"));
  const files = await Promise.all([
    readFile("lib/driver-job-status-workflow.ts", "utf8"),
    readFile("lib/driver-job-link.ts", "utf8"),
    readFile("lib/driver-live-location-scaffold.ts", "utf8"),
    readFile("lib/driver-live-location-runtime.ts", "utf8"),
    readFile("lib/customer-live-location-map-scaffold.ts", "utf8"),
    readFile("lib/customer-runtime-session-map.ts", "utf8"),
    readFile("lib/customer-live-location-map-runtime.ts", "utf8"),
  ]);
  const [
    driverStatusWorkflow,
    driverJobLink,
    driverScaffold,
    driverRuntime,
    customerScaffold,
    customerSessionMap,
    customerRuntime,
  ] = files;

  await Promise.all([
    writeFile(
      join(tempDir, "driver-job-status-workflow.mjs"),
      transpileRuntimeModule(driverStatusWorkflow),
    ),
    writeFile(
      join(tempDir, "driver-job-link.mjs"),
      transpileRuntimeModule(driverJobLink, [
        [
          /from "\.\/driver-job-status-workflow\.ts";/g,
          'from "./driver-job-status-workflow.mjs";',
        ],
      ]),
    ),
    writeFile(
      join(tempDir, "driver-live-location-scaffold.mjs"),
      transpileRuntimeModule(driverScaffold),
    ),
    writeFile(
      join(tempDir, "driver-live-location-runtime.mjs"),
      transpileRuntimeModule(driverRuntime, [
        [/from "\.\/driver-job-link";/g, 'from "./driver-job-link.mjs";'],
        [
          /from "\.\/driver-live-location-scaffold";/g,
          'from "./driver-live-location-scaffold.mjs";',
        ],
      ]),
    ),
    writeFile(
      join(tempDir, "customer-live-location-map-scaffold.mjs"),
      transpileRuntimeModule(customerScaffold),
    ),
    writeFile(
      join(tempDir, "customer-runtime-session-map.mjs"),
      transpileRuntimeModule(customerSessionMap),
    ),
    writeFile(
      join(tempDir, "customer-live-location-map-runtime.mjs"),
      transpileRuntimeModule(customerRuntime, [
        [
          /from "\.\/customer-live-location-map-scaffold";/g,
          'from "./customer-live-location-map-scaffold.mjs";',
        ],
        [
          /from "\.\/customer-runtime-session-map";/g,
          'from "./customer-runtime-session-map.mjs";',
        ],
      ]),
    ),
  ]);

  return tempDir;
}

function runtimeEnv({
  accountReference,
  authUserId,
  customerSessionToken,
  reference,
  wrongCustomerSessionToken,
}) {
  const controlAuthUserId = randomUUID();
  const controlAccountReference = controlCustomerAccountReference(accountReference);

  return {
    PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED: "true",
    PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST: accountReference,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED: "true",
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE: "server-session-token",
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID: authUserId,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP:
      `${authUserId}|${customerSessionToken}|${accountReference};` +
      `${controlAuthUserId}|${wrongCustomerSessionToken}|${controlAccountReference}`,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN: customerSessionToken,
    PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED: "true",
    PRESTIGE_DRIVER_LIVE_LOCATION_MODE: "runtime",
    PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE: reference,
    SUPABASE_SERVICE_ROLE_KEY: envValue("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_URL: envValue("SUPABASE_URL"),
  };
}

function customerBoundary() {
  return {
    bookingReferencePresent: true,
    ok: true,
    sameOrigin: true,
    sessionPresent: true,
  };
}

function customerRequest({
  accountReference,
  bookingReference,
  origin,
  sessionToken,
}) {
  const headers = {
    origin,
    referer: `${origin}/my-bookings`,
    "x-prestige-customer-purpose": "customer-live-location-map-read",
    "x-prestige-customer-session-token": sessionToken,
  };

  if (accountReference) {
    headers["x-prestige-customer-account-reference"] = accountReference;
  }

  return new Request(
    `${origin}/api/customer-live-location-map?booking_reference=${encodeURIComponent(
      bookingReference,
    )}`,
    {
      headers,
    },
  );
}

function driverShareRequest() {
  return new Request("https://app.prestigelimo.sg/api/driver-job/scoped/live-location", {
    body: JSON.stringify({
      accuracy_meters: 8,
      captured_at: new Date().toISOString(),
      heading_degrees: 90,
      latitude: 1.2948,
      longitude: 103.8545,
      speed_meters_per_second: 0,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

async function runClosedProof({
  customerModule,
  driverModule,
  rawToken,
  bookingReference,
  customerSessionToken,
}) {
  const driverShare = await driverModule.handleDriverLiveLocationRuntimeRequest({
    action: "share",
    env: {},
    request: driverShareRequest(),
    token: rawToken,
  });
  const adminMap = await driverModule.handleAdminActiveJobsMapRuntimeRequest({
    actorRole: "admin",
    env: {},
  });
  const customerMap = await customerModule.handleCustomerLiveLocationMapRuntimeRequest({
    boundary: customerBoundary(),
    env: {},
    request: customerRequest({
      bookingReference,
      origin: "https://app.prestigelimo.sg",
      sessionToken: customerSessionToken,
    }),
  });
  const anonymousCustomerMap = await customerModule.handleCustomerLiveLocationMapRuntimeRequest({
    boundary: {
      bookingReferencePresent: true,
      ok: false,
      sameOrigin: false,
      sessionPresent: false,
    },
    env: {},
    request: customerRequest({
      bookingReference,
      origin: "https://app.prestigelimo.sg",
      sessionToken: "",
    }),
  });

  assertStatus(driverShare, 503, "driver_share_closed");
  assertStatus(adminMap, 503, "admin_map_closed");
  assertStatus(customerMap, 503, "customer_map_closed");
  assertStatus(anonymousCustomerMap, 403, "anonymous_customer_closed");

  return {
    admin_map_status: adminMap.status,
    anonymous_customer_status: anonymousCustomerMap.status,
    customer_map_status: customerMap.status,
    driver_share_status: driverShare.status,
  };
}

async function runRuntimeProof({
  accountReference,
  bookingReference,
  customerModule,
  customerSessionMapModule,
  driverModule,
  env,
  rawToken,
  wrongCustomerSessionToken,
}) {
  const share = await driverModule.handleDriverLiveLocationRuntimeRequest({
    action: "share",
    env,
    request: driverShareRequest(),
    token: rawToken,
  });

  assertStatus(share, 200, "driver_share_runtime");

  if (
    share.body?.ok !== true ||
    share.body?.customerVisible !== false ||
    share.body?.external_send !== false ||
    share.body?.sharing_state !== "active"
  ) {
    throw new EvidenceFailure("one_real_booking_live_location_driver_share_payload_unsafe");
  }

  const adminMap = await driverModule.handleAdminActiveJobsMapRuntimeRequest({
    actorRole: "admin",
    env,
  });

  assertStatus(adminMap, 200, "admin_map_runtime");

  if (
    adminMap.body?.ok !== true ||
    adminMap.body?.customerVisible !== false ||
    adminMap.body?.external_send !== false ||
    adminMap.body?.marker_count !== 1
  ) {
    throw new EvidenceFailure("one_real_booking_live_location_admin_map_payload_unsafe");
  }

  const sessionMapResolution =
    customerSessionMapModule.resolveExactTwoCustomerRuntimeSessionMap({
      expectedEntryCount: 2,
      mapValue: env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP,
      providedToken: env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN,
    });

  if (!sessionMapResolution.ok) {
    throw new EvidenceFailure("one_real_booking_live_location_customer_session_map_not_ready", {
      safe_reason: sessionMapResolution.reason,
    });
  }

  if (sessionMapResolution.customer_account_reference !== accountReference) {
    throw new EvidenceFailure("one_real_booking_live_location_customer_session_scope_mismatch");
  }

  const customerMap = await customerModule.handleCustomerLiveLocationMapRuntimeRequest({
    boundary: customerBoundary(),
    env,
    request: customerRequest({
      accountReference,
      bookingReference,
      origin: "https://app.prestigelimo.sg",
      sessionToken: env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN,
    }),
  });

  assertStatus(customerMap, 200, "customer_map_runtime");

  if (
    customerMap.body?.ok !== true ||
    customerMap.body?.customerVisible !== true ||
    customerMap.body?.external_send !== false ||
    customerMap.body?.marker_count !== 1
  ) {
    throw new EvidenceFailure("one_real_booking_live_location_customer_map_payload_unsafe");
  }

  assertNoForbiddenCustomerPayload(customerMap.body, "customer_map_runtime");

  const wrongCustomer = await customerModule.handleCustomerLiveLocationMapRuntimeRequest({
    boundary: customerBoundary(),
    env,
    request: customerRequest({
      accountReference: controlCustomerAccountReference(accountReference),
      bookingReference,
      origin: "https://app.prestigelimo.sg",
      sessionToken: wrongCustomerSessionToken,
    }),
  });
  const crossOrigin = await customerModule.handleCustomerLiveLocationMapRuntimeRequest({
    boundary: {
      bookingReferencePresent: true,
      ok: false,
      sameOrigin: false,
      sessionPresent: true,
    },
    env,
    request: customerRequest({
      bookingReference,
      origin: "https://evil.example.invalid",
      sessionToken: env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN,
    }),
  });
  const wrongDriver = await driverModule.handleDriverLiveLocationRuntimeRequest({
    action: "stop",
    env,
    request: new Request("https://app.prestigelimo.sg/api/driver-job/wrong/live-location", {
      method: "DELETE",
    }),
    token: `${rawToken}-wrong`,
  });

  assertStatus(wrongCustomer, 403, "wrong_customer_runtime");
  assertStatus(crossOrigin, 403, "cross_origin_customer_runtime");
  assertStatus(wrongDriver, 401, "wrong_driver_runtime");

  const stop = await driverModule.handleDriverLiveLocationRuntimeRequest({
    action: "stop",
    env,
    request: new Request("https://app.prestigelimo.sg/api/driver-job/scoped/live-location", {
      method: "DELETE",
    }),
    token: rawToken,
  });

  assertStatus(stop, 200, "driver_stop_runtime");

  if (
    stop.body?.ok !== true ||
    stop.body?.customerVisible !== false ||
    stop.body?.external_send !== false ||
    stop.body?.sharing_state !== "stopped"
  ) {
    throw new EvidenceFailure("one_real_booking_live_location_driver_stop_payload_unsafe");
  }

  const customerAfterStop = await customerModule.handleCustomerLiveLocationMapRuntimeRequest({
    boundary: customerBoundary(),
    env,
    request: customerRequest({
      accountReference,
      bookingReference,
      origin: "https://app.prestigelimo.sg",
      sessionToken: env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN,
    }),
  });

  assertStatus(customerAfterStop, 200, "customer_map_after_stop");

  if (customerAfterStop.body?.marker_count !== 0) {
    throw new EvidenceFailure("one_real_booking_live_location_customer_map_not_cleared_after_stop");
  }

  return {
    admin_marker_count: adminMap.body.marker_count,
    customer_marker_count: customerMap.body.marker_count,
    customer_marker_count_after_stop: customerAfterStop.body.marker_count,
    cross_origin_status: crossOrigin.status,
    driver_share_status: share.status,
    driver_stop_status: stop.status,
    wrong_customer_status: wrongCustomer.status,
    wrong_driver_status: wrongDriver.status,
  };
}

async function runEvidence() {
  await loadLocalEnvFiles();
  requireApproval();
  const useTemporaryDriverLink = temporaryDriverLinkApproved();
  requireRequiredEnvNames({ temporaryDriverLink: useTemporaryDriverLink });

  const reference = evidenceReference();
  let rawToken = envValue(driverTokenEnvName);
  let bookingReference = safeReference(envValue(bookingReferenceEnvName));

  if (!useTemporaryDriverLink && !bookingReference) {
    throw new EvidenceFailure("one_real_booking_live_location_booking_reference_invalid", {
      env_name: bookingReferenceEnvName,
    });
  }

  const client = createSupabaseClient();
  const tempDir = await writeRuntimeHarness();
  const previousSetting = await readCurrentRuntimeSetting(client);
  let driverLink = null;
  let bookingAndCustomer = null;
  let previousLatestPosition = null;
  let temporaryDriverJobLinkId = "";

  if (isRuntimeSettingActive(previousSetting)) {
    await rm(tempDir, { force: true, recursive: true });
    throw new EvidenceFailure("one_real_booking_live_location_runtime_setting_already_active");
  }

  try {
    if (useTemporaryDriverLink) {
      const temporaryDriverLink = await createTemporaryDriverJobLink(client, reference);
      rawToken = temporaryDriverLink.rawToken;
      bookingReference = temporaryDriverLink.bookingReference;
      driverLink = temporaryDriverLink.driverLink;
      bookingAndCustomer = temporaryDriverLink.bookingAndCustomer;
      temporaryDriverJobLinkId = driverLink.driverJobLinkId;
    } else {
      driverLink = await resolveExistingDriverLink(
        client,
        rawToken,
        bookingReference,
      );
      bookingAndCustomer = await resolveBookingAndCustomer(client, bookingReference);
    }

    previousLatestPosition = await readLatestPosition(
      client,
      driverLink.driverJobLinkId,
    );

    if (previousLatestPosition) {
      throw new EvidenceFailure("one_real_booking_live_location_existing_latest_position_present");
    }

    await cleanupEvidenceRows(client, reference, driverLink.driverJobLinkId);

    const [driverModule, customerModule, customerSessionMapModule] = await Promise.all([
      import(join(tempDir, "driver-live-location-runtime.mjs")),
      import(join(tempDir, "customer-live-location-map-runtime.mjs")),
      import(join(tempDir, "customer-runtime-session-map.mjs")),
    ]);

    driverModule.setDriverLiveLocationRuntimeClientForTests(client);
    customerModule.setCustomerLiveLocationMapRuntimeClientForTests(client);

    const customerSessionToken = randomBytes(32).toString("base64url");
    const wrongCustomerSessionToken = randomBytes(32).toString("base64url");

    const preWindow = await runClosedProof({
      bookingReference,
      customerModule,
      customerSessionToken,
      driverModule,
      rawToken,
    });

    await openRuntimeSetting(client, bookingReference);

    const proof = await runRuntimeProof({
      accountReference: bookingAndCustomer.accountReference,
      bookingReference,
      customerModule,
      customerSessionMapModule,
      driverModule,
      env: runtimeEnv({
        accountReference: bookingAndCustomer.accountReference,
        authUserId: bookingAndCustomer.authUserId,
        customerSessionToken,
        reference,
        wrongCustomerSessionToken,
      }),
      rawToken,
      wrongCustomerSessionToken,
    });

    await cleanupEvidenceRows(client, reference, driverLink.driverJobLinkId);
    await restoreLatestPosition(client, driverLink.driverJobLinkId, previousLatestPosition);
    await cleanupTemporaryDriverLink(client, temporaryDriverJobLinkId);
    await restoreRuntimeSetting(client, previousSetting);

    const latestCount = await countEvidenceRows(client, latestPositionsTable, reference);
    const auditCount = await countEvidenceRows(client, auditEventsTable, reference);
    const temporaryDriverJobLinkRemaining = temporaryDriverJobLinkId
      ? await countDriverJobLinkById(client, temporaryDriverJobLinkId)
      : 0;

    if (latestCount !== 0 || auditCount !== 0 || temporaryDriverJobLinkRemaining !== 0) {
      throw new EvidenceFailure("one_real_booking_live_location_cleanup_zero_row_proof_failed", {
        audit_count: auditCount,
        latest_count: latestCount,
        temporary_driver_job_link_count: temporaryDriverJobLinkRemaining,
      });
    }

    const postRollback = await runClosedProof({
      bookingReference,
      customerModule,
      customerSessionToken,
      driverModule,
      rawToken,
    });

    return {
      app_side_gates_only: true,
      db_write_scope:
        temporaryDriverJobLinkId
          ? "temporary_driver_job_link_runtime_setting_latest_position_audit_rows_cleanup_rollback_only"
          : "runtime_setting_latest_position_audit_rows_cleanup_rollback_only",
      evidence_reference: reference,
      no_private_data_printed: true,
      no_provider_sends: true,
      no_real_gps: true,
      pre_window: preWindow,
      proof,
      post_rollback: postRollback,
      real_booking_count: 1,
      temporary_driver_job_link_created: Boolean(temporaryDriverJobLinkId),
      temporary_rows_remaining: {
        audit_events: auditCount,
        driver_job_links: temporaryDriverJobLinkRemaining,
        latest_positions: latestCount,
      },
      vercel_cli_used: false,
      vercel_env_changed: false,
    };
  } catch (error) {
    try {
      if (driverLink?.driverJobLinkId) {
        await cleanupEvidenceRows(client, reference, driverLink.driverJobLinkId);
        await restoreLatestPosition(client, driverLink.driverJobLinkId, previousLatestPosition);
      }
      await cleanupTemporaryDriverLink(client, temporaryDriverJobLinkId);
      await restoreRuntimeSetting(client, previousSetting);
    } catch {
      // Keep the surfaced error as the source of truth; cleanup failures are not printed with secrets.
    }

    throw error;
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

try {
  const result = await runEvidence();
  console.log(JSON.stringify({ ok: true, result }, null, 2));
} catch (error) {
  if (error instanceof EvidenceFailure) {
    console.error(
      JSON.stringify(
        {
          details: error.details,
          error: error.code,
          ok: false,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.error(
    JSON.stringify(
      {
        error: "one_real_booking_live_location_evidence_failed_safely",
        ok: false,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
