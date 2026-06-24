import { createClient } from "@supabase/supabase-js";

const approvalEnvName = "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_APPROVED";
const expectedApproval = "driver-live-location-table-rls-retention-evidence-approved";
const phaseEnvName = "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_PHASE";
const allowedPhases = new Set(["pre-window", "db-window", "post-rollback"]);
const targetUrlEnvName = "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_TARGET_URL";
const defaultTargetUrl = "https://prestige-limo-ops-staging.vercel.app";
const latestTable = "driver_live_location_latest_positions";
const auditTable = "driver_live_location_audit_events";

const requiredDbWindowEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE",
  "PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_DRIVER_JOB_LINK_ID",
  "PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_BOOKING_REFERENCE",
];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

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
    throw new EvidenceFailure("driver_live_location_table_rls_evidence_not_approved", {
      required_env_name: approvalEnvName,
      required_value_name_only: expectedApproval,
    });
  }

  const phase = envValue(phaseEnvName);

  if (!allowedPhases.has(phase)) {
    throw new EvidenceFailure("driver_live_location_table_rls_evidence_phase_not_approved", {
      required_env_name: phaseEnvName,
      allowed_phases: [...allowedPhases],
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
    throw new EvidenceFailure("driver_live_location_table_rls_target_not_staging", {
      required_env_name: targetUrlEnvName,
      required_host: "prestige-limo-ops-staging.vercel.app",
    });
  }

  return parsed;
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
    body = { text };
  }

  return {
    body,
    status: response.status,
  };
}

function requireDbWindowEnvNames() {
  const missing = requiredDbWindowEnvNames.filter((name) => !envPresent(name));

  if (missing.length > 0) {
    throw new EvidenceFailure("missing_required_driver_live_location_table_rls_env_names", {
      missing_env_names_only: missing,
    });
  }

  if (!safeReferencePattern.test(envValue("PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE"))) {
    throw new EvidenceFailure("driver_live_location_table_rls_evidence_reference_invalid", {
      env_name: "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE",
    });
  }

  if (!uuidPattern.test(envValue("PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_DRIVER_JOB_LINK_ID"))) {
    throw new EvidenceFailure("driver_live_location_driver_job_link_id_must_be_uuid", {
      env_name: "PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_DRIVER_JOB_LINK_ID",
    });
  }

  if (!safeReferencePattern.test(envValue("PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_BOOKING_REFERENCE"))) {
    throw new EvidenceFailure("driver_live_location_booking_reference_invalid", {
      env_name: "PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_BOOKING_REFERENCE",
    });
  }
}

function createSupabaseClient(keyEnvName) {
  return createClient(envValue("SUPABASE_URL"), envValue(keyEnvName), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function expectClosedRoutes(target) {
  const driverToken = "driver-live-location-closed-gate-proof";
  const driverShareUrl = new URL(`/api/driver-job/${driverToken}/live-location`, target);
  const adminMapUrl = new URL("/api/admin-active-jobs-map-locations", target);

  const driverPost = await fetchJsonOrText(driverShareUrl, { method: "POST" });
  if (driverPost.status !== 503) {
    throw new EvidenceFailure("driver_live_location_capture_route_not_closed", {
      expected_status: 503,
      actual_status: driverPost.status,
    });
  }

  const driverDelete = await fetchJsonOrText(driverShareUrl, { method: "DELETE" });
  if (driverDelete.status !== 503) {
    throw new EvidenceFailure("driver_live_location_stop_route_not_closed", {
      expected_status: 503,
      actual_status: driverDelete.status,
    });
  }

  const adminGet = await fetchJsonOrText(adminMapUrl);
  if (adminGet.status !== 403 && adminGet.status !== 503) {
    throw new EvidenceFailure("admin_active_jobs_map_route_not_blocked_or_closed", {
      expected_statuses: [403, 503],
      actual_status: adminGet.status,
    });
  }

  return {
    admin_active_jobs_map_status: adminGet.status,
    driver_capture_status: driverPost.status,
    driver_stop_status: driverDelete.status,
  };
}

async function expectAnonBlocked(anonClient, tableName) {
  const { error } = await anonClient.from(tableName).select("id", { count: "exact", head: true });

  if (!error) {
    throw new EvidenceFailure("driver_live_location_table_anon_access_not_blocked", {
      table_name: tableName,
    });
  }

  return {
    blocked: true,
    table_name: tableName,
  };
}

async function countEvidenceRows(client, tableName, evidenceReference) {
  const { count, error } = await client
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq("evidence_reference", evidenceReference);

  if (error) {
    throw new EvidenceFailure("driver_live_location_evidence_count_failed", {
      table_name: tableName,
    });
  }

  return count ?? 0;
}

async function runDbWindow() {
  requireDbWindowEnvNames();

  const serviceClient = createSupabaseClient("SUPABASE_SERVICE_ROLE_KEY");
  const anonClient = createSupabaseClient("SUPABASE_ANON_KEY");
  const evidenceReference = envValue("PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE");
  const driverJobLinkId = envValue("PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_DRIVER_JOB_LINK_ID");
  const bookingReference = envValue("PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_BOOKING_REFERENCE");
  const capturedAt = new Date().toISOString();
  const staleAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const anonLatestBlocked = await expectAnonBlocked(anonClient, latestTable);
  const anonAuditBlocked = await expectAnonBlocked(anonClient, auditTable);

  await serviceClient.from(auditTable).delete().eq("evidence_reference", evidenceReference);
  await serviceClient.from(latestTable).delete().eq("evidence_reference", evidenceReference);

  const latestPayload = {
    accuracy_meters: 10,
    assigned_job_label: "Evidence active job",
    booking_reference: bookingReference,
    captured_at: capturedAt,
    driver_display_label: "Evidence driver",
    driver_job_link_id: driverJobLinkId,
    evidence_reference: evidenceReference,
    job_status: "driver_otw",
    latitude: 1.2948,
    longitude: 103.8545,
    sharing_state: "active",
    source_surface: "driver_job_api",
    stale_after: staleAfter,
    vehicle_plate_label: "Evidence vehicle",
  };

  const { error: latestInsertError } = await serviceClient
    .from(latestTable)
    .upsert(latestPayload, { onConflict: "driver_job_link_id" });

  if (latestInsertError) {
    throw new EvidenceFailure("driver_live_location_latest_fixture_write_failed");
  }

  const { error: auditInsertError } = await serviceClient.from(auditTable).insert({
    actor_role: "driver",
    booking_reference: bookingReference,
    driver_job_link_id: driverJobLinkId,
    event_type: "position_updated",
    evidence_reference: evidenceReference,
    safe_event_context: {
      evidence_scope: "driver_live_location_table_rls_retention",
      source: "bounded_runner",
    },
    source_surface: "driver_job_api",
  });

  if (auditInsertError) {
    throw new EvidenceFailure("driver_live_location_audit_fixture_write_failed");
  }

  const latestCount = await countEvidenceRows(serviceClient, latestTable, evidenceReference);
  const auditCount = await countEvidenceRows(serviceClient, auditTable, evidenceReference);

  if (latestCount !== 1 || auditCount !== 1) {
    throw new EvidenceFailure("driver_live_location_fixture_count_mismatch", {
      audit_count: auditCount,
      latest_count: latestCount,
    });
  }

  await serviceClient.from(auditTable).delete().eq("evidence_reference", evidenceReference);
  await serviceClient.from(latestTable).delete().eq("evidence_reference", evidenceReference);

  const latestAfterCleanup = await countEvidenceRows(serviceClient, latestTable, evidenceReference);
  const auditAfterCleanup = await countEvidenceRows(serviceClient, auditTable, evidenceReference);

  if (latestAfterCleanup !== 0 || auditAfterCleanup !== 0) {
    throw new EvidenceFailure("driver_live_location_fixture_cleanup_failed", {
      audit_count: auditAfterCleanup,
      latest_count: latestAfterCleanup,
    });
  }

  return {
    anon_blocked: [anonLatestBlocked, anonAuditBlocked],
    cleanup_zero_rows: true,
    fake_audit_rows_written: 1,
    fake_latest_rows_written: 1,
  };
}

async function main() {
  const phase = requireApproval();
  const target = stagingTargetUrl();

  if (phase === "pre-window" || phase === "post-rollback") {
    const routeProof = await expectClosedRoutes(target);

    return {
      db_write: false,
      evidence_run: "driver_live_location_table_rls_route_closed_proof",
      phase,
      provider_send: false,
      route_proof: routeProof,
      secrets_printed: false,
    };
  }

  const dbProof = await runDbWindow();

  return {
    db_write: "fake_evidence_rows_only",
    evidence_run: "driver_live_location_table_rls_retention_db_window",
    phase,
    provider_send: false,
    proof: dbProof,
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
          ok: false,
          error: error.code,
          details: error.details,
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
        ok: false,
        error: "driver_live_location_table_rls_evidence_failed_safely",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
