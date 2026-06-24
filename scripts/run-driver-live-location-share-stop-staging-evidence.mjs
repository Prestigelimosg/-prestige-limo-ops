import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const approvalEnvName =
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_APPROVED";
const expectedApproval =
  "driver-live-location-share-stop-staging-evidence-approved";
const phaseEnvName =
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_PHASE";
const allowedPhases = new Set(["pre-window", "runtime-window", "post-rollback"]);
const targetUrlEnvName =
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_TARGET_URL";
const defaultTargetUrl = "https://prestige-limo-ops-staging.vercel.app";
const evidenceReferenceEnvName =
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_REFERENCE";
const driverTokenEnvName =
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_DRIVER_JOB_LINK_TOKEN";
const bookingReferenceEnvName =
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_BOOKING_REFERENCE";
const adminSessionTokenEnvName = "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN";

const runtimeSettingsTable = "driver_live_location_runtime_settings";
const runtimeSettingName = "driver_live_location_runtime";
const driverJobLinkTable = "driver_job_links";
const latestPositionsTable = "driver_live_location_latest_positions";
const auditEventsTable = "driver_live_location_audit_events";

const requiredRuntimeWindowEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  adminSessionTokenEnvName,
  evidenceReferenceEnvName,
  driverTokenEnvName,
  bookingReferenceEnvName,
];

const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const forbiddenSafeTextPattern =
  /api[_ -]?key|billing|cookie|customer[_ -]?email|customer[_ -]?phone|customer[_ -]?price|debug|driver[_ -]?payout|finance|internal|invoice|jwt|parser|password|payment|paynow|payout|pdf|raw[_ -]?token|secret|service[_ -]?role|token[_ -]?hash/i;

class EvidenceFailure extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "EvidenceFailure";
    this.code = code;
    this.details = details;
  }
}

function envValue(name) {
  return process.env[name]?.trim() || "";
}

function envPresent(name) {
  return envValue(name).length > 0;
}

function requireApproval() {
  if (envValue(approvalEnvName) !== expectedApproval) {
    throw new EvidenceFailure("driver_live_location_share_stop_staging_evidence_not_approved", {
      required_env_name: approvalEnvName,
      required_value_name_only: expectedApproval,
    });
  }

  const phase = envValue(phaseEnvName);

  if (!allowedPhases.has(phase)) {
    throw new EvidenceFailure("driver_live_location_share_stop_staging_phase_not_approved", {
      allowed_phases: [...allowedPhases],
      required_env_name: phaseEnvName,
    });
  }

  return phase;
}

function stagingTargetUrl() {
  const parsed = new URL(envValue(targetUrlEnvName) || defaultTargetUrl);

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "prestige-limo-ops-staging.vercel.app"
  ) {
    throw new EvidenceFailure("driver_live_location_share_stop_target_not_staging", {
      required_env_name: targetUrlEnvName,
      required_host: "prestige-limo-ops-staging.vercel.app",
    });
  }

  return parsed;
}

function requireRuntimeWindowEnvNames() {
  const missing = requiredRuntimeWindowEnvNames.filter((name) => !envPresent(name));

  if (missing.length > 0) {
    throw new EvidenceFailure("missing_required_driver_live_location_share_stop_env_names", {
      missing_env_names_only: missing,
    });
  }

  for (const name of [evidenceReferenceEnvName, bookingReferenceEnvName]) {
    const value = envValue(name);

    if (!safeReferencePattern.test(value) || forbiddenSafeTextPattern.test(value)) {
      throw new EvidenceFailure("driver_live_location_share_stop_reference_invalid", {
        env_name: name,
      });
    }
  }
}

function createSupabaseClient() {
  return createClient(envValue("SUPABASE_URL"), envValue("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function tokenHash(rawToken) {
  const cleanToken = String(rawToken || "").trim();

  if (cleanToken.length < 16) {
    throw new EvidenceFailure("driver_live_location_share_stop_token_invalid", {
      env_name: driverTokenEnvName,
    });
  }

  return createHash("sha256").update(cleanToken, "utf8").digest("hex");
}

async function fetchJsonOrText(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { text: text.slice(0, 120) };
  }

  return {
    body,
    status: response.status,
  };
}

async function expectPreOrPostClosed(target) {
  const proofToken = "driver-live-location-share-stop-closed-proof";
  const driverUrl = new URL(`/api/driver-job/${proofToken}/live-location`, target);
  const adminMapUrl = new URL("/api/admin-active-jobs-map-locations", target);

  const driverPost = await fetchJsonOrText(driverUrl, {
    body: JSON.stringify({
      accuracy_meters: 10,
      latitude: 1.2948,
      longitude: 103.8545,
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
  const driverDelete = await fetchJsonOrText(driverUrl, {
    method: "DELETE",
  });
  const adminGet = await fetchJsonOrText(adminMapUrl);

  if (driverPost.status !== 503 || driverDelete.status !== 503) {
    throw new EvidenceFailure("driver_live_location_share_stop_routes_not_closed", {
      delete_status: driverDelete.status,
      expected_status: 503,
      post_status: driverPost.status,
    });
  }

  if (adminGet.status !== 403 && adminGet.status !== 503) {
    throw new EvidenceFailure("driver_live_location_share_stop_admin_route_not_blocked", {
      actual_status: adminGet.status,
      expected_statuses: [403, 503],
    });
  }

  return {
    admin_active_jobs_map_status: adminGet.status,
    driver_share_status: driverPost.status,
    driver_stop_status: driverDelete.status,
  };
}

async function readCurrentRuntimeSetting(client) {
  const { data, error } = await client
    .from(runtimeSettingsTable)
    .select("*")
    .eq("setting_name", runtimeSettingName)
    .maybeSingle();

  if (error) {
    throw new EvidenceFailure("driver_live_location_share_stop_setting_read_failed");
  }

  return data || null;
}

async function restoreRuntimeSetting(client, previousSetting) {
  if (previousSetting) {
    const { error } = await client.from(runtimeSettingsTable).upsert(previousSetting, {
      onConflict: "setting_name",
    });

    if (error) {
      throw new EvidenceFailure("driver_live_location_share_stop_setting_restore_failed");
    }

    return;
  }

  const { error } = await client
    .from(runtimeSettingsTable)
    .delete()
    .eq("setting_name", runtimeSettingName);

  if (error) {
    throw new EvidenceFailure("driver_live_location_share_stop_setting_cleanup_failed");
  }
}

async function cleanupEvidenceRows(client, evidenceReference, bookingReference, driverJobLinkId = "") {
  await client.from(auditEventsTable).delete().eq("evidence_reference", evidenceReference);
  await client.from(latestPositionsTable).delete().eq("evidence_reference", evidenceReference);

  if (driverJobLinkId) {
    await client
      .from(driverJobLinkTable)
      .delete()
      .eq("id", driverJobLinkId)
      .eq("booking_reference", bookingReference);
  }
}

async function countEvidenceRows(client, tableName, evidenceReference) {
  const { count, error } = await client
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq("evidence_reference", evidenceReference);

  if (error) {
    throw new EvidenceFailure("driver_live_location_share_stop_count_failed", {
      table_name: tableName,
    });
  }

  return count ?? 0;
}

async function countDriverLinksByBookingReference(client, bookingReference) {
  const { count, error } = await client
    .from(driverJobLinkTable)
    .select("id", { count: "exact", head: true })
    .eq("booking_reference", bookingReference);

  if (error) {
    throw new EvidenceFailure("driver_live_location_share_stop_driver_link_count_failed");
  }

  return count ?? 0;
}

async function insertEvidenceDriverLink(client, rawToken, bookingReference) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from(driverJobLinkTable)
    .insert({
      actor_label: "Driver live-location Share Stop staging evidence",
      actor_role: "admin",
      booking_reference: bookingReference,
      expires_at: expiresAt,
      link_status: "active",
      safe_link_context: {
        driver_job_payload: {
          assigned_driver_name: "Evidence driver",
          driver_plate_number: "Evidence vehicle",
          pickup_location: "Raffles Hotel Singapore",
          route: "Raffles Hotel Singapore > Changi Airport Terminal 2",
          status: "driver_otw",
        },
      },
      source_surface: "admin_api",
      token_hash: tokenHash(rawToken),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new EvidenceFailure("driver_live_location_share_stop_driver_link_insert_failed");
  }

  return data.id;
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
    throw new EvidenceFailure("driver_live_location_share_stop_setting_open_failed");
  }
}

async function callDriverShare(target, rawToken) {
  const url = new URL(`/api/driver-job/${encodeURIComponent(rawToken)}/live-location`, target);
  const result = await fetchJsonOrText(url, {
    body: JSON.stringify({
      accuracy_meters: 10,
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

  if (result.status !== 200 || result.body?.ok !== true) {
    throw new EvidenceFailure("driver_live_location_share_stop_share_failed", {
      status: result.status,
    });
  }

  if (
    result.body?.customerVisible !== false ||
    result.body?.external_send !== false ||
    result.body?.sharing_state !== "active"
  ) {
    throw new EvidenceFailure("driver_live_location_share_stop_share_unsafe_payload");
  }

  return {
    customer_visible: false,
    external_send: false,
    sharing_state: "active",
    status: result.status,
  };
}

async function callDriverStop(target, rawToken) {
  const url = new URL(`/api/driver-job/${encodeURIComponent(rawToken)}/live-location`, target);
  const result = await fetchJsonOrText(url, {
    method: "DELETE",
  });

  if (result.status !== 200 || result.body?.ok !== true) {
    throw new EvidenceFailure("driver_live_location_share_stop_stop_failed", {
      status: result.status,
    });
  }

  if (
    result.body?.customerVisible !== false ||
    result.body?.external_send !== false ||
    result.body?.sharing_state !== "stopped"
  ) {
    throw new EvidenceFailure("driver_live_location_share_stop_stop_unsafe_payload");
  }

  return {
    customer_visible: false,
    external_send: false,
    sharing_state: "stopped",
    status: result.status,
  };
}

async function callAdminMap(target, expectedMarkerCount) {
  const adminMapUrl = new URL("/api/admin-active-jobs-map-locations", target);
  const result = await fetchJsonOrText(adminMapUrl, {
    headers: {
      origin: target.origin,
      referer: `${target.origin}/`,
      "x-prestige-admin-purpose": "admin-booking-persistence",
      "x-prestige-admin-session-token": envValue(adminSessionTokenEnvName),
    },
  });

  if (result.status !== 200 || result.body?.ok !== true) {
    throw new EvidenceFailure("driver_live_location_share_stop_admin_map_failed", {
      status: result.status,
    });
  }

  if (
    result.body?.customerVisible !== false ||
    result.body?.external_send !== false ||
    result.body?.marker_count !== expectedMarkerCount
  ) {
    throw new EvidenceFailure("driver_live_location_share_stop_admin_map_unsafe_payload");
  }

  return {
    customer_visible: false,
    external_send: false,
    marker_count: result.body.marker_count,
    status: result.status,
  };
}

async function expectBlockedBoundaries(target, rawToken) {
  const adminMapUrl = new URL("/api/admin-active-jobs-map-locations", target);
  const wrongOrigin = await fetchJsonOrText(adminMapUrl, {
    headers: {
      origin: "https://example.invalid",
      referer: "https://example.invalid/",
      "x-prestige-admin-purpose": "admin-booking-persistence",
      "x-prestige-admin-session-token": envValue(adminSessionTokenEnvName),
    },
  });
  const missingAdmin = await fetchJsonOrText(adminMapUrl);
  const wrongDriver = await fetchJsonOrText(
    new URL(`/api/driver-job/${encodeURIComponent(`${rawToken}-wrong`)}/live-location`, target),
    {
      method: "DELETE",
    },
  );

  if (wrongOrigin.status !== 403 || missingAdmin.status !== 403 || wrongDriver.status !== 401) {
    throw new EvidenceFailure("driver_live_location_share_stop_boundary_block_failed", {
      missing_admin_status: missingAdmin.status,
      wrong_driver_status: wrongDriver.status,
      wrong_origin_status: wrongOrigin.status,
    });
  }

  return {
    missing_admin_status: missingAdmin.status,
    wrong_driver_status: wrongDriver.status,
    wrong_origin_status: wrongOrigin.status,
  };
}

async function runRuntimeWindow(target) {
  requireRuntimeWindowEnvNames();

  const client = createSupabaseClient();
  const evidenceReference = envValue(evidenceReferenceEnvName);
  const rawToken = envValue(driverTokenEnvName);
  const bookingReference = envValue(bookingReferenceEnvName);
  const previousSetting = await readCurrentRuntimeSetting(client);
  let driverJobLinkId = "";

  try {
    await cleanupEvidenceRows(client, evidenceReference, bookingReference);
    driverJobLinkId = await insertEvidenceDriverLink(client, rawToken, bookingReference);
    await openRuntimeSetting(client, bookingReference);

    const shareProof = await callDriverShare(target, rawToken);
    const adminMapAfterShare = await callAdminMap(target, 1);
    const blockedProof = await expectBlockedBoundaries(target, rawToken);
    const stopProof = await callDriverStop(target, rawToken);
    const adminMapAfterStop = await callAdminMap(target, 0);

    await cleanupEvidenceRows(client, evidenceReference, bookingReference, driverJobLinkId);
    await restoreRuntimeSetting(client, previousSetting);

    const latestAfterCleanup = await countEvidenceRows(
      client,
      latestPositionsTable,
      evidenceReference,
    );
    const auditAfterCleanup = await countEvidenceRows(
      client,
      auditEventsTable,
      evidenceReference,
    );
    const driverLinksAfterCleanup = await countDriverLinksByBookingReference(
      client,
      bookingReference,
    );

    if (
      latestAfterCleanup !== 0 ||
      auditAfterCleanup !== 0 ||
      driverLinksAfterCleanup !== 0
    ) {
      throw new EvidenceFailure("driver_live_location_share_stop_cleanup_failed", {
        audit_count: auditAfterCleanup,
        driver_link_count: driverLinksAfterCleanup,
        latest_count: latestAfterCleanup,
      });
    }

    return {
      admin_map_after_share: adminMapAfterShare,
      admin_map_after_stop: adminMapAfterStop,
      blocked: blockedProof,
      cleanup_zero_rows: true,
      fake_driver_job_link_rows_written: 1,
      runtime_setting_restored: true,
      share: shareProof,
      stop: stopProof,
    };
  } catch (error) {
    await cleanupEvidenceRows(client, evidenceReference, bookingReference, driverJobLinkId);
    await restoreRuntimeSetting(client, previousSetting);
    throw error;
  }
}

async function main() {
  const phase = requireApproval();
  const target = stagingTargetUrl();

  if (phase === "pre-window" || phase === "post-rollback") {
    return {
      customer_live_map: false,
      db_write: false,
      evidence_run: "driver_live_location_share_stop_closed_proof",
      phase,
      provider_send: false,
      real_gps: false,
      route_proof: await expectPreOrPostClosed(target),
      secrets_printed: false,
    };
  }

  return {
    customer_live_map: false,
    db_write: "fake_share_stop_evidence_rows_only",
    evidence_run: "driver_live_location_share_stop_runtime_window",
    phase,
    proof: await runRuntimeWindow(target),
    provider_send: false,
    real_gps: false,
    secrets_printed: false,
  };
}

try {
  const result = await main();
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
        error: "driver_live_location_share_stop_evidence_failed_safely",
        ok: false,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
