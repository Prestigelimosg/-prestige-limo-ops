import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
} from "./driver-job-link";
import {
  driverLiveLocationScaffoldVersion,
  readDriverLiveLocationScaffoldGateState,
} from "./driver-live-location-scaffold";

export const driverLiveLocationRuntimeVersion =
  "driver-live-location-runtime:v1";

type DriverLiveLocationEnv = Record<string, string | undefined>;
type UnknownRecord = Record<string, unknown>;
type DriverLiveLocationAction = "readiness" | "share" | "stop";
type DriverLiveLocationBlockedReason =
  | "admin_active_jobs_map_gate_closed"
  | "driver_live_location_admin_runtime_config_not_ready"
  | "driver_live_location_admin_runtime_gate_closed"
  | "driver_live_location_capture_gate_closed"
  | "driver_live_location_config_not_ready"
  | "driver_live_location_invalid_position"
  | "driver_live_location_job_not_allowlisted"
  | "driver_live_location_runtime_mode_closed"
  | "driver_live_location_token_expired"
  | "driver_live_location_token_revoked"
  | "driver_live_location_token_unauthorized"
  | "driver_live_location_write_failed";

type DriverLiveLocationClient = Pick<SupabaseClient, "from">;

type DriverJobLinkRow = {
  booking_reference: string;
  expires_at: string;
  id: string;
  link_status: "active" | "expired" | "revoked";
  revoked_at: string | null;
  safe_link_context: UnknownRecord;
};

type DriverLiveLocationPosition = {
  accuracy_meters: number | null;
  captured_at: string;
  heading_degrees: number | null;
  latitude: number;
  longitude: number;
  speed_meters_per_second: number | null;
};

const latestPositionsTable = "driver_live_location_latest_positions";
const auditEventsTable = "driver_live_location_audit_events";
const driverJobLinkTable = "driver_job_links";
const runtimeSettingsTable = "driver_live_location_runtime_settings";
const runtimeSettingName = "driver_live_location_runtime";
const allowedRuntimeModes = new Set(["runtime", "evidence"]);
const allowedPositionFields = new Set([
  "accuracy_meters",
  "captured_at",
  "heading_degrees",
  "latitude",
  "longitude",
  "speed_meters_per_second",
]);
const maxSafeLabelLength = 160;
const maxRuntimeAllowedReferences = 50;
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

let driverLiveLocationClientForTests: DriverLiveLocationClient | null = null;

export function setDriverLiveLocationRuntimeClientForTests(
  client: DriverLiveLocationClient | null,
) {
  driverLiveLocationClientForTests = client;
}

function cleanText(value: unknown, maxLength = maxSafeLabelLength) {
  if (typeof value !== "string") {
    return "";
  }

  const cleaned = value.replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength || hasForbiddenSafeText(cleaned)) {
    return "";
  }

  return cleaned;
}

function hasForbiddenSafeText(value: string) {
  return /api[_ -]?key|billing|cookie|customer[_ -]?email|customer[_ -]?phone|customer[_ -]?price|debug|driver[_ -]?payout|finance|internal|invoice|jwt|parser|password|payment|paynow|payout|pdf|raw[_ -]?token|secret|service[_ -]?role|token[_ -]?hash/i.test(
    value,
  );
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function readNestedDriverJobPayload(context: UnknownRecord) {
  const nested = asRecord(context.driver_job_payload);

  return Object.keys(nested).length > 0 ? nested : context;
}

function firstNonEmptyRecord(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);

    if (Object.keys(record).length > 0) {
      return record;
    }
  }

  return {};
}

function readFirstSafeText(source: UnknownRecord, keys: string[], maxLength = maxSafeLabelLength) {
  for (const key of keys) {
    const cleaned = cleanText(source[key], maxLength);

    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}

function safeIdentifier(value: unknown) {
  const cleaned = cleanText(value, 120);

  return safeReferencePattern.test(cleaned) ? cleaned : "";
}

function asFiniteNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function boundedOptionalNumber(
  value: unknown,
  min: number,
  max: number,
) {
  const numberValue = asFiniteNumber(value);

  if (numberValue === null) {
    return null;
  }

  return numberValue >= min && numberValue <= max ? numberValue : null;
}

function envValue(env: DriverLiveLocationEnv, key: string) {
  return env[key]?.trim() || "";
}

function positiveIntegerEnv(env: DriverLiveLocationEnv, key: string, fallback: number) {
  const parsed = Number(envValue(env, key));

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function runtimeModeOpen(env: DriverLiveLocationEnv) {
  return allowedRuntimeModes.has(
    readDriverLiveLocationScaffoldGateState(env).mode,
  );
}

function allowedJobReferences(env: DriverLiveLocationEnv) {
  return allowedReferencesFromUnknown(
    envValue(env, "PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES"),
  );
}

function evidenceReference(env: DriverLiveLocationEnv) {
  const value = envValue(
    env,
    "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE",
  );

  return value && safeReferencePattern.test(value) ? value : null;
}

function blockedResult(reason: DriverLiveLocationBlockedReason, status: number) {
  return {
    body: {
      customerVisible: false,
      external_send: false,
      no_op: true,
      ok: false,
      reason,
      version: driverLiveLocationRuntimeVersion,
    },
    status,
  };
}

function uniqueSafeReferences(values: unknown[]) {
  return [...new Set(values.map(safeIdentifier).filter(Boolean))].slice(
    0,
    maxRuntimeAllowedReferences,
  );
}

function allowedReferencesFromUnknown(value: unknown) {
  if (Array.isArray(value)) {
    return uniqueSafeReferences(value);
  }

  if (typeof value === "string") {
    return uniqueSafeReferences(value.split(/[,\n\s]+/));
  }

  return [];
}

function booleanSettingOpen(value: unknown) {
  return value === true || value === "true";
}

function runtimeSettingNumber(
  value: unknown,
  min: number,
  max: number,
) {
  const parsed = asFiniteNumber(value);

  if (parsed === null || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed >= min && parsed <= max ? parsed : null;
}

type DriverLiveLocationRuntimePolicyPurpose = "admin_map" | "capture";

type DriverLiveLocationRuntimePolicy = {
  allowedJobReferences: string[];
  retentionMinutes: number;
  source: "admin_runtime_setting" | "env_evidence";
  staleAfterSeconds: number;
};

type DriverLiveLocationRuntimePolicyResult =
  | {
      ok: true;
      policy: DriverLiveLocationRuntimePolicy;
    }
  | {
      ok: false;
      reason: DriverLiveLocationBlockedReason;
      status: number;
    };

function envEvidenceRuntimePolicy(
  env: DriverLiveLocationEnv,
): DriverLiveLocationRuntimePolicyResult {
  const allowedReferences = allowedJobReferences(env);

  if (allowedReferences.length === 0) {
    return {
      ok: false,
      reason: "driver_live_location_config_not_ready",
      status: 503,
    };
  }

  return {
    ok: true,
    policy: {
      allowedJobReferences: allowedReferences,
      retentionMinutes: positiveIntegerEnv(
        env,
        "PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES",
        120,
      ),
      source: "env_evidence",
      staleAfterSeconds: positiveIntegerEnv(
        env,
        "PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS",
        300,
      ),
    },
  };
}

async function readAdminControlledRuntimePolicy({
  client,
  env,
  purpose,
}: {
  client: DriverLiveLocationClient;
  env: DriverLiveLocationEnv;
  purpose: DriverLiveLocationRuntimePolicyPurpose;
}): Promise<DriverLiveLocationRuntimePolicyResult> {
  const gateState = readDriverLiveLocationScaffoldGateState(env);

  if (gateState.mode === "evidence") {
    return envEvidenceRuntimePolicy(env);
  }

  if (gateState.mode !== "runtime") {
    return {
      ok: false,
      reason: "driver_live_location_runtime_mode_closed",
      status: 503,
    };
  }

  const { data, error } = await client
    .from(runtimeSettingsTable)
    .select(
      "setting_name, setting_status, driver_live_location_capture_enabled, admin_active_jobs_map_enabled, driver_live_location_mode, driver_live_location_allowed_job_references, driver_live_location_stale_after_seconds, driver_live_location_retention_minutes",
    )
    .eq("setting_name", runtimeSettingName)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: "driver_live_location_admin_runtime_config_not_ready",
      status: 503,
    };
  }

  const setting = asRecord(data);
  const settingStatus = cleanText(setting.setting_status, 40);
  const settingMode = cleanText(setting.driver_live_location_mode, 40);
  const captureOpen = booleanSettingOpen(
    setting.driver_live_location_capture_enabled,
  );
  const adminMapOpen = booleanSettingOpen(setting.admin_active_jobs_map_enabled);
  const allowedReferences = allowedReferencesFromUnknown(
    setting.driver_live_location_allowed_job_references,
  );

  if (
    settingStatus !== "active" ||
    settingMode !== "runtime" ||
    (purpose === "capture" && !captureOpen) ||
    (purpose === "admin_map" && !adminMapOpen)
  ) {
    return {
      ok: false,
      reason: "driver_live_location_admin_runtime_gate_closed",
      status: 503,
    };
  }

  if (allowedReferences.length === 0) {
    return {
      ok: false,
      reason: "driver_live_location_admin_runtime_config_not_ready",
      status: 503,
    };
  }

  return {
    ok: true,
    policy: {
      allowedJobReferences: allowedReferences,
      retentionMinutes:
        runtimeSettingNumber(
          setting.driver_live_location_retention_minutes,
          5,
          1440,
        ) ??
        positiveIntegerEnv(
          env,
          "PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES",
          120,
        ),
      source: "admin_runtime_setting",
      staleAfterSeconds:
        runtimeSettingNumber(
          setting.driver_live_location_stale_after_seconds,
          30,
          3600,
        ) ??
        positiveIntegerEnv(
          env,
          "PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS",
          300,
        ),
    },
  };
}

function runtimeClient(env: DriverLiveLocationEnv) {
  if (driverLiveLocationClientForTests) {
    return {
      client: driverLiveLocationClientForTests,
      ok: true,
    } as const;
  }

  const supabaseUrl = envValue(env, "SUPABASE_URL");
  const serviceRoleKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      reason: "driver_live_location_config_not_ready",
    } as const;
  }

  try {
    return {
      client: createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }),
      ok: true,
    } as const;
  } catch {
    return {
      ok: false,
      reason: "driver_live_location_config_not_ready",
    } as const;
  }
}

function normalizeDriverJobLinkRow(row: UnknownRecord): DriverJobLinkRow | null {
  const id = safeIdentifier(row.id);
  const bookingReference = safeIdentifier(row.booking_reference);
  const linkStatus = cleanText(row.link_status, 40);
  const expiresAt = cleanText(row.expires_at, 80);
  const revokedAt = cleanText(row.revoked_at, 80) || null;

  if (
    !id ||
    !bookingReference ||
    !expiresAt ||
    !["active", "expired", "revoked"].includes(linkStatus)
  ) {
    return null;
  }

  return {
    booking_reference: bookingReference,
    expires_at: expiresAt,
    id,
    link_status: linkStatus as DriverJobLinkRow["link_status"],
    revoked_at: revokedAt,
    safe_link_context: asRecord(row.safe_link_context),
  };
}

async function resolveDriverJobLink({
  client,
  token,
}: {
  client: DriverLiveLocationClient;
  token: string;
}) {
  let tokenHash = "";

  try {
    tokenHash = hashDriverJobLinkToken(token);
  } catch {
    return blockedResult("driver_live_location_token_unauthorized", 401);
  }

  const { data, error } = await client
    .from(driverJobLinkTable)
    .select("id, booking_reference, link_status, expires_at, revoked_at, safe_link_context")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    return blockedResult("driver_live_location_config_not_ready", 503);
  }

  const link = normalizeDriverJobLinkRow(asRecord(data));

  if (!link) {
    return blockedResult("driver_live_location_token_unauthorized", 401);
  }

  if (link.link_status === "revoked" || link.revoked_at) {
    return blockedResult("driver_live_location_token_revoked", 403);
  }

  if (
    link.link_status === "expired" ||
    isDriverJobLinkExpired(link.expires_at) ||
    isDriverJobLinkExpiryOutsideAllowedWindow(link.expires_at)
  ) {
    return blockedResult("driver_live_location_token_expired", 410);
  }

  return {
    link,
    ok: true,
  } as const;
}

async function safeJsonBody(request: Request) {
  try {
    return asRecord(await request.json());
  } catch {
    return {};
  }
}

function parsePositionPayload(body: UnknownRecord): DriverLiveLocationPosition | null {
  for (const key of Object.keys(body)) {
    if (!allowedPositionFields.has(key)) {
      return null;
    }
  }

  const latitude = asFiniteNumber(body.latitude);
  const longitude = asFiniteNumber(body.longitude);

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const capturedAt =
    cleanText(body.captured_at, 80) && Number.isFinite(new Date(String(body.captured_at)).getTime())
      ? new Date(String(body.captured_at)).toISOString()
      : new Date().toISOString();

  return {
    accuracy_meters: boundedOptionalNumber(body.accuracy_meters, 0, 10000),
    captured_at: capturedAt,
    heading_degrees: boundedOptionalNumber(body.heading_degrees, 0, 359.99),
    latitude,
    longitude,
    speed_meters_per_second: boundedOptionalNumber(
      body.speed_meters_per_second,
      0,
      120,
    ),
  };
}

function labelsFromLink(link: DriverJobLinkRow) {
  const source = readNestedDriverJobPayload(link.safe_link_context);
  const driver = firstNonEmptyRecord(source.assigned_driver, source.assignedDriver);
  const driverDisplayLabel =
    readFirstSafeText(source, ["assigned_driver_name", "driver_name", "driverName"]) ||
    cleanText(driver.name) ||
    "Assigned driver";
  const routeLabel =
    readFirstSafeText(source, ["route", "route_summary", "routeSummary"], 220) ||
    readFirstSafeText(source, ["pickup_location", "pickupLocation"], 120) ||
    "Assigned job";

  return {
    assigned_job_label: routeLabel,
    driver_display_label: driverDisplayLabel,
    job_status: readFirstSafeText(source, ["status", "status_value", "statusValue"], 80) || "assigned",
    vehicle_plate_label:
      readFirstSafeText(source, ["assigned_driver_plate", "driver_plate_number", "plate"], 80) ||
      cleanText(driver.plate, 80) ||
      null,
  };
}

async function insertAuditEvent({
  actorRole,
  bookingReference,
  client,
  driverJobLinkId,
  env,
  eventType,
  sourceSurface,
}: {
  actorRole: "admin" | "dispatcher" | "driver" | "system";
  bookingReference: string;
  client: DriverLiveLocationClient;
  driverJobLinkId: string | null;
  env: DriverLiveLocationEnv;
  eventType: "admin_read" | "position_updated" | "share_stopped";
  sourceSurface: "admin_api" | "driver_job_api";
}) {
  const { error } = await client.from(auditEventsTable).insert({
    actor_role: actorRole,
    booking_reference: bookingReference,
    driver_job_link_id: driverJobLinkId,
    event_type: eventType,
    evidence_reference: evidenceReference(env),
    safe_event_context: {
      source: "bounded_driver_live_location_runtime",
    },
    source_surface: sourceSurface,
  });

  return !error;
}

export function driverLiveLocationRuntimeGateOpen(env: DriverLiveLocationEnv = process.env) {
  const gateState = readDriverLiveLocationScaffoldGateState(env);

  return gateState.capture_gate_configured && runtimeModeOpen(env);
}

export function adminActiveJobsMapRuntimeGateOpen(env: DriverLiveLocationEnv = process.env) {
  const gateState = readDriverLiveLocationScaffoldGateState(env);

  return gateState.active_jobs_map_gate_configured && runtimeModeOpen(env);
}

export async function handleDriverLiveLocationRuntimeRequest({
  action,
  env = process.env,
  request,
  token,
}: {
  action: DriverLiveLocationAction;
  env?: DriverLiveLocationEnv;
  request: Request;
  token: string;
}) {
  if (!driverLiveLocationRuntimeGateOpen(env)) {
    return blockedResult(
      readDriverLiveLocationScaffoldGateState(env).capture_gate_configured
        ? "driver_live_location_runtime_mode_closed"
        : "driver_live_location_capture_gate_closed",
      503,
    );
  }

  const clientResult = runtimeClient(env);

  if (!clientResult.ok) {
    return blockedResult(clientResult.reason, 503);
  }

  const runtimePolicy = await readAdminControlledRuntimePolicy({
    client: clientResult.client,
    env,
    purpose: "capture",
  });

  if (!runtimePolicy.ok) {
    return blockedResult(runtimePolicy.reason, runtimePolicy.status);
  }

  const resolved = await resolveDriverJobLink({
    client: clientResult.client,
    token,
  });

  if ("status" in resolved) {
    return resolved;
  }

  if (
    !runtimePolicy.policy.allowedJobReferences.includes(
      resolved.link.booking_reference,
    )
  ) {
    return blockedResult("driver_live_location_job_not_allowlisted", 403);
  }

  if (action === "stop") {
    const { error: deleteError } = await clientResult.client
      .from(latestPositionsTable)
      .delete()
      .eq("driver_job_link_id", resolved.link.id);

    if (deleteError) {
      return blockedResult("driver_live_location_write_failed", 503);
    }

    const auditInserted = await insertAuditEvent({
      actorRole: "driver",
      bookingReference: resolved.link.booking_reference,
      client: clientResult.client,
      driverJobLinkId: resolved.link.id,
      env,
      eventType: "share_stopped",
      sourceSurface: "driver_job_api",
    });

    if (!auditInserted) {
      return blockedResult("driver_live_location_write_failed", 503);
    }

    return {
      body: {
        action,
        customerVisible: false,
        external_send: false,
        ok: true,
        sharing_state: "stopped",
        version: driverLiveLocationRuntimeVersion,
      },
      status: 200,
    };
  }

  const position = parsePositionPayload(await safeJsonBody(request));

  if (!position) {
    return blockedResult("driver_live_location_invalid_position", 400);
  }

  const staleAfterSeconds = runtimePolicy.policy.staleAfterSeconds;
  const staleAfter = new Date(
    new Date(position.captured_at).getTime() + staleAfterSeconds * 1000,
  ).toISOString();
  const labels = labelsFromLink(resolved.link);

  const { error } = await clientResult.client.from(latestPositionsTable).upsert(
    {
      ...labels,
      ...position,
      booking_reference: resolved.link.booking_reference,
      driver_job_link_id: resolved.link.id,
      evidence_reference: evidenceReference(env),
      sharing_state: "active",
      source_surface: "driver_job_api",
      stale_after: staleAfter,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "driver_job_link_id",
    },
  );

  if (error) {
    return blockedResult("driver_live_location_write_failed", 503);
  }

  const auditInserted = await insertAuditEvent({
    actorRole: "driver",
    bookingReference: resolved.link.booking_reference,
    client: clientResult.client,
    driverJobLinkId: resolved.link.id,
    env,
    eventType: "position_updated",
    sourceSurface: "driver_job_api",
  });

  if (!auditInserted) {
    return blockedResult("driver_live_location_write_failed", 503);
  }

  return {
    body: {
      action,
      customerVisible: false,
      external_send: false,
      last_shared_at: position.captured_at,
      ok: true,
      sharing_state: "active",
      stale_after: staleAfter,
      version: driverLiveLocationRuntimeVersion,
    },
    status: 200,
  };
}

export async function handleDriverLiveLocationReadinessRuntimeRequest({
  env = process.env,
  token,
}: {
  env?: DriverLiveLocationEnv;
  token: string;
}) {
  if (!driverLiveLocationRuntimeGateOpen(env)) {
    return blockedResult(
      readDriverLiveLocationScaffoldGateState(env).capture_gate_configured
        ? "driver_live_location_runtime_mode_closed"
        : "driver_live_location_capture_gate_closed",
      503,
    );
  }

  const clientResult = runtimeClient(env);

  if (!clientResult.ok) {
    return blockedResult(clientResult.reason, 503);
  }

  const runtimePolicy = await readAdminControlledRuntimePolicy({
    client: clientResult.client,
    env,
    purpose: "capture",
  });

  if (!runtimePolicy.ok) {
    return blockedResult(runtimePolicy.reason, runtimePolicy.status);
  }

  const resolved = await resolveDriverJobLink({
    client: clientResult.client,
    token,
  });

  if ("status" in resolved) {
    return resolved;
  }

  if (
    !runtimePolicy.policy.allowedJobReferences.includes(
      resolved.link.booking_reference,
    )
  ) {
    return blockedResult("driver_live_location_job_not_allowlisted", 403);
  }

  const { data, error } = await clientResult.client
    .from(latestPositionsTable)
    .select(
      "accuracy_meters, assigned_job_label, booking_reference, driver_display_label, driver_job_link_id, heading_degrees, job_status, latitude, longitude, sharing_state, speed_meters_per_second, stale_after, updated_at, vehicle_plate_label",
    )
    .eq("driver_job_link_id", resolved.link.id)
    .maybeSingle();

  if (error) {
    return blockedResult("driver_live_location_config_not_ready", 503);
  }

  const latestPosition = normalizeLatestPosition(asRecord(data));
  const sharingState =
    latestPosition?.sharing_state === "active" && !latestPosition.is_stale
      ? "active"
      : latestPosition?.sharing_state === "active" && latestPosition.is_stale
        ? "stale"
        : "inactive";

  return {
    body: {
      action: "readiness",
      booking_reference: resolved.link.booking_reference,
      customerVisible: false,
      external_send: false,
      last_shared_at: latestPosition?.updated_at || null,
      ok: true,
      sharing_state: sharingState,
      stale_after: latestPosition?.stale_after || null,
      version: driverLiveLocationRuntimeVersion,
    },
    status: 200,
  };
}

function normalizeLatestPosition(row: UnknownRecord) {
  const latitude = asFiniteNumber(row.latitude);
  const longitude = asFiniteNumber(row.longitude);
  const driverJobLinkId = safeIdentifier(row.driver_job_link_id);
  const bookingReference = safeIdentifier(row.booking_reference);

  if (!driverJobLinkId || !bookingReference || latitude === null || longitude === null) {
    return null;
  }

  const staleAfter = cleanText(row.stale_after, 80);
  const staleAfterTime = new Date(staleAfter).getTime();
  const isStale = Number.isFinite(staleAfterTime) ? Date.now() >= staleAfterTime : true;

  return {
    accuracy_meters: boundedOptionalNumber(row.accuracy_meters, 0, 10000),
    assigned_job_label: cleanText(row.assigned_job_label) || "Assigned job",
    assigned_job_reference: bookingReference,
    driver_display_label: cleanText(row.driver_display_label) || "Assigned driver",
    heading_degrees: boundedOptionalNumber(row.heading_degrees, 0, 359.99),
    is_stale: isStale,
    job_status: cleanText(row.job_status, 80) || "assigned",
    latitude,
    longitude,
    sharing_state: cleanText(row.sharing_state, 40) || "active",
    speed_meters_per_second: boundedOptionalNumber(row.speed_meters_per_second, 0, 120),
    stale_after: staleAfter || null,
    updated_at: cleanText(row.updated_at, 80) || null,
    vehicle_plate_label: cleanText(row.vehicle_plate_label, 80) || null,
  };
}

type NormalizedLatestPosition = NonNullable<
  ReturnType<typeof normalizeLatestPosition>
>;

function isNormalizedLatestPosition(
  value: ReturnType<typeof normalizeLatestPosition>,
): value is NormalizedLatestPosition {
  return value !== null;
}

export async function handleAdminActiveJobsMapRuntimeRequest({
  actorRole,
  env = process.env,
}: {
  actorRole: "admin" | "dispatcher" | "local-dev-admin";
  env?: DriverLiveLocationEnv;
}) {
  if (!adminActiveJobsMapRuntimeGateOpen(env)) {
    return blockedResult(
      readDriverLiveLocationScaffoldGateState(env).active_jobs_map_gate_configured
        ? "driver_live_location_runtime_mode_closed"
        : "admin_active_jobs_map_gate_closed",
      503,
    );
  }

  const clientResult = runtimeClient(env);

  if (!clientResult.ok) {
    return blockedResult(clientResult.reason, 503);
  }

  const runtimePolicy = await readAdminControlledRuntimePolicy({
    client: clientResult.client,
    env,
    purpose: "admin_map",
  });

  if (!runtimePolicy.ok) {
    return blockedResult(runtimePolicy.reason, runtimePolicy.status);
  }

  const allowedReferences = runtimePolicy.policy.allowedJobReferences;

  const { data, error } = await clientResult.client
    .from(latestPositionsTable)
    .select(
      "accuracy_meters, assigned_job_label, booking_reference, driver_display_label, driver_job_link_id, heading_degrees, job_status, latitude, longitude, sharing_state, speed_meters_per_second, stale_after, updated_at, vehicle_plate_label",
    )
    .in("booking_reference", allowedReferences)
    .in("sharing_state", ["active", "stale"])
    .limit(50);

  if (error) {
    return blockedResult("driver_live_location_config_not_ready", 503);
  }

  const activeJobs = Array.isArray(data)
    ? data.map(asRecord).map(normalizeLatestPosition).filter(isNormalizedLatestPosition)
    : [];

  if (activeJobs.length > 0) {
    const auditInserted = await insertAuditEvent({
      actorRole: actorRole === "dispatcher" ? "dispatcher" : "admin",
      bookingReference: activeJobs[0]?.assigned_job_reference || allowedReferences[0],
      client: clientResult.client,
      driverJobLinkId: null,
      env,
      eventType: "admin_read",
      sourceSurface: "admin_api",
    });

    if (!auditInserted) {
      return blockedResult("driver_live_location_write_failed", 503);
    }
  }

  return {
    body: {
      active_jobs: activeJobs,
      allowed_booking_references: allowedReferences,
      customerVisible: false,
      external_send: false,
      map_rendered: false,
      marker_count: activeJobs.length,
      ok: true,
      version: driverLiveLocationRuntimeVersion,
    },
    status: 200,
  };
}

export const driverLiveLocationRuntimeContract = {
  adminActiveJobsMapRuntimeGateOpen,
  driverLiveLocationRuntimeGateOpen,
  latestPositionsTable,
  auditEventsTable,
  driverJobLinkTable,
  scaffoldVersion: driverLiveLocationScaffoldVersion,
  runtimeSettingsTable,
};
