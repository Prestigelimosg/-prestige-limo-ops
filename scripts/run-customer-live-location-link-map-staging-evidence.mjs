import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const approvalEnvName =
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_APPROVED";
const expectedApproval =
  "customer-live-location-link-map-staging-evidence-approved";
const phaseEnvName =
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_PHASE";
const targetUrlEnvName =
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_TARGET_URL";
const customerSessionTokenEnvName =
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_CUSTOMER_SESSION_TOKEN";
const accountReferenceEnvName =
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_ACCOUNT_REFERENCE";
const bookingReferenceEnvName =
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_BOOKING_REFERENCE";
const evidenceReferenceEnvName =
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_REFERENCE";

const expectedClosedReason = "customer_live_location_map_scaffold_closed";
const defaultTargetUrl = "https://prestige-limo-ops-staging.vercel.app";
const allowedPhases = new Set(["pre-window", "runtime-window", "post-rollback"]);
const driverJobLinkTable = "driver_job_links";
const latestPositionsTable = "driver_live_location_latest_positions";
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const forbiddenSafeTextPattern =
  /api[_ -]?key|billing|cookie|customer[_ -]?email|customer[_ -]?phone|customer[_ -]?price|debug|driver[_ -]?payout|finance|internal|invoice|jwt|parser|password|payment|paynow|payout|pdf|raw[_ -]?token|secret|service[_ -]?role|token[_ -]?hash/i;

const requiredRuntimeWindowEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  accountReferenceEnvName,
  bookingReferenceEnvName,
  customerSessionTokenEnvName,
  evidenceReferenceEnvName,
];

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
    throw new EvidenceFailure("customer_live_location_link_map_evidence_not_approved", {
      required_env_name: approvalEnvName,
      required_value_name_only: expectedApproval,
    });
  }

  const phase = envValue(phaseEnvName);

  if (!allowedPhases.has(phase)) {
    throw new EvidenceFailure("customer_live_location_link_map_phase_not_approved", {
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
    throw new EvidenceFailure("customer_live_location_link_map_target_not_staging", {
      required_env_name: targetUrlEnvName,
      required_host: "prestige-limo-ops-staging.vercel.app",
    });
  }

  return parsed;
}

function requireSafeReferences(names) {
  const missing = names.filter((name) => !envValue(name));

  if (missing.length > 0) {
    throw new EvidenceFailure("missing_required_customer_live_location_env_names", {
      missing_env_names_only: missing,
    });
  }

  for (const name of [accountReferenceEnvName, bookingReferenceEnvName, evidenceReferenceEnvName]) {
    if (!names.includes(name)) {
      continue;
    }

    const value = envValue(name);

    if (!safeReferencePattern.test(value) || forbiddenSafeTextPattern.test(value)) {
      throw new EvidenceFailure("customer_live_location_reference_invalid", {
        env_name: name,
      });
    }
  }

  if (
    names.includes(customerSessionTokenEnvName) &&
    envValue(customerSessionTokenEnvName).length < 16
  ) {
    throw new EvidenceFailure("customer_live_location_session_token_invalid", {
      env_name: customerSessionTokenEnvName,
    });
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

function hashEvidenceToken(evidenceReference, bookingReference) {
  return createHash("sha256")
    .update(`${evidenceReference}:${bookingReference}:customer-live-map`, "utf8")
    .digest("hex");
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

function assertNoForbiddenRuntimeFields(body, label) {
  const serialized = JSON.stringify(body || {});

  if (
    /driver_job_link_id|id"|token|token_hash|cookie|jwt|phone|email|price|payout|paynow|billing|invoice|payment|pdf|internal|parser|debug|provider|raw/i.test(
      serialized,
    )
  ) {
    throw new EvidenceFailure("customer_live_location_link_map_forbidden_field_visible", {
      label,
    });
  }
}

function assertSafeClosedBody(result, label) {
  const body = result.body?.result || result.body;

  if (body?.customerVisible !== false || body?.liveMapEnabled !== false) {
    throw new EvidenceFailure("customer_live_location_link_map_visibility_not_closed", {
      label,
    });
  }

  if (
    body?.gpsCaptureEnabled !== false ||
    body?.locationStorageEnabled !== false ||
    body?.external_send !== false
  ) {
    throw new EvidenceFailure("customer_live_location_link_map_side_effect_flags_not_closed", {
      label,
    });
  }

  if (body?.reason !== expectedClosedReason) {
    throw new EvidenceFailure("customer_live_location_link_map_unexpected_closed_reason", {
      label,
    });
  }
}

function customerHeaders(target, accountReference = envValue(accountReferenceEnvName)) {
  return {
    origin: target.origin,
    referer: target.toString(),
    "x-prestige-customer-account-reference": accountReference,
    "x-prestige-customer-purpose": "customer-live-location-map-read",
    "x-prestige-customer-session-token": envValue(customerSessionTokenEnvName),
  };
}

async function expectClosed(target, phase) {
  requireSafeReferences([
    accountReferenceEnvName,
    bookingReferenceEnvName,
    customerSessionTokenEnvName,
  ]);

  const url = new URL("/api/customer-live-location-map", target);
  url.searchParams.set("booking_reference", envValue(bookingReferenceEnvName));

  const anonymous = await fetchJsonOrText(url);
  const customer = await fetchJsonOrText(url, {
    headers: customerHeaders(target),
  });
  const blockedWrite = await fetchJsonOrText(url, {
    method: "POST",
  });

  if (anonymous.status !== 403 || blockedWrite.status !== 403) {
    throw new EvidenceFailure("customer_live_location_link_map_boundary_not_blocked", {
      anonymous_status: anonymous.status,
      expected_status: 403,
      post_status: blockedWrite.status,
    });
  }

  if (customer.status !== 503) {
    throw new EvidenceFailure("customer_live_location_link_map_route_not_closed", {
      customer_status: customer.status,
      expected_status: 503,
    });
  }

  assertSafeClosedBody(customer, phase);

  return {
    anonymous_status: anonymous.status,
    customer_boundary_status: customer.status,
    post_status: blockedWrite.status,
  };
}

async function countEvidenceRows(client, tableName, evidenceReference) {
  const { count, error } = await client
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq("evidence_reference", evidenceReference);

  if (error) {
    throw new EvidenceFailure("customer_live_location_link_map_count_failed", {
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
    throw new EvidenceFailure("customer_live_location_link_map_driver_link_count_failed");
  }

  return count ?? 0;
}

async function cleanupEvidenceRows(client, evidenceReference, bookingReference, linkId = "") {
  await client.from(latestPositionsTable).delete().eq("evidence_reference", evidenceReference);

  if (linkId) {
    await client
      .from(driverJobLinkTable)
      .delete()
      .eq("id", linkId)
      .eq("booking_reference", bookingReference);
  }
}

async function insertEvidenceDriverLink(client, evidenceReference, bookingReference) {
  const existingLinkCount = await countDriverLinksByBookingReference(
    client,
    bookingReference,
  );

  if (existingLinkCount !== 0) {
    throw new EvidenceFailure("customer_live_location_link_map_booking_not_fake_clean", {
      driver_link_count: existingLinkCount,
    });
  }

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from(driverJobLinkTable)
    .insert({
      actor_label: "Customer live-location map staging evidence",
      actor_role: "admin",
      booking_reference: bookingReference,
      expires_at: expiresAt,
      link_status: "active",
      safe_link_context: {
        driver_job_payload: {
          assigned_driver_name: "Evidence driver",
          pickup_location: "Raffles Hotel Singapore",
          route: "Raffles Hotel Singapore > Changi Airport Terminal 2",
          status: "driver_otw",
        },
      },
      source_surface: "admin_api",
      token_hash: hashEvidenceToken(evidenceReference, bookingReference),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new EvidenceFailure("customer_live_location_link_map_driver_link_insert_failed");
  }

  return data.id;
}

async function insertFakeLatestPosition(client, driverJobLinkId, evidenceReference, bookingReference) {
  const capturedAt = new Date().toISOString();
  const staleAfter = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { error } = await client.from(latestPositionsTable).insert({
    accuracy_meters: 9,
    assigned_job_label: "Evidence trip",
    booking_reference: bookingReference,
    captured_at: capturedAt,
    driver_display_label: "Evidence driver",
    driver_job_link_id: driverJobLinkId,
    evidence_reference: evidenceReference,
    heading_degrees: 90,
    job_status: "driver_otw",
    latitude: 1.2948,
    longitude: 103.8545,
    sharing_state: "active",
    source_surface: "system",
    speed_meters_per_second: 0,
    stale_after: staleAfter,
    updated_at: capturedAt,
    vehicle_plate_label: "Evidence vehicle",
  });

  if (error) {
    throw new EvidenceFailure("customer_live_location_link_map_latest_insert_failed");
  }
}

async function callCustomerMap(target, accountReference = envValue(accountReferenceEnvName)) {
  const url = new URL("/api/customer-live-location-map", target);
  url.searchParams.set("booking_reference", envValue(bookingReferenceEnvName));

  return fetchJsonOrText(url, {
    headers: customerHeaders(target, accountReference),
  });
}

async function expectRuntimeWindow(target) {
  requireSafeReferences(requiredRuntimeWindowEnvNames);

  if (!requiredRuntimeWindowEnvNames.every(envPresent)) {
    const missing = requiredRuntimeWindowEnvNames.filter((name) => !envPresent(name));

    throw new EvidenceFailure("missing_required_customer_live_location_runtime_env_names", {
      missing_env_names_only: missing,
    });
  }

  const client = createSupabaseClient();
  const evidenceReference = envValue(evidenceReferenceEnvName);
  const bookingReference = envValue(bookingReferenceEnvName);
  let driverJobLinkId = "";

  try {
    await cleanupEvidenceRows(client, evidenceReference, bookingReference);
    driverJobLinkId = await insertEvidenceDriverLink(
      client,
      evidenceReference,
      bookingReference,
    );
    await insertFakeLatestPosition(
      client,
      driverJobLinkId,
      evidenceReference,
      bookingReference,
    );

    const customer = await callCustomerMap(target);

    if (
      customer.status !== 200 ||
      customer.body?.ok !== true ||
      customer.body?.customerVisible !== true ||
      customer.body?.liveMapEnabled !== true ||
      customer.body?.external_send !== false ||
      customer.body?.gpsCaptureEnabled !== false ||
      customer.body?.marker_count !== 1
    ) {
      throw new EvidenceFailure("customer_live_location_link_map_runtime_read_failed", {
        status: customer.status,
      });
    }

    assertNoForbiddenRuntimeFields(customer.body, "customer-runtime-read");

    const wrongCustomer = await callCustomerMap(target, "wrong-customer-live-map-evidence");
    const anonymous = await fetchJsonOrText(
      new URL(
        `/api/customer-live-location-map?booking_reference=${encodeURIComponent(
          bookingReference,
        )}`,
        target,
      ),
    );
    const crossOrigin = await fetchJsonOrText(
      new URL(
        `/api/customer-live-location-map?booking_reference=${encodeURIComponent(
          bookingReference,
        )}`,
        target,
      ),
      {
        headers: {
          ...customerHeaders(target),
          origin: "https://example.invalid",
          referer: "https://example.invalid/",
        },
      },
    );

    if (
      wrongCustomer.status !== 403 ||
      anonymous.status !== 403 ||
      crossOrigin.status !== 403
    ) {
      throw new EvidenceFailure("customer_live_location_link_map_boundary_block_failed", {
        anonymous_status: anonymous.status,
        cross_origin_status: crossOrigin.status,
        wrong_customer_status: wrongCustomer.status,
      });
    }

    await cleanupEvidenceRows(
      client,
      evidenceReference,
      bookingReference,
      driverJobLinkId,
    );

    const latestAfterCleanup = await countEvidenceRows(
      client,
      latestPositionsTable,
      evidenceReference,
    );
    const driverLinksAfterCleanup = await countDriverLinksByBookingReference(
      client,
      bookingReference,
    );

    if (latestAfterCleanup !== 0 || driverLinksAfterCleanup !== 0) {
      throw new EvidenceFailure("customer_live_location_link_map_cleanup_failed", {
        driver_link_count: driverLinksAfterCleanup,
        latest_count: latestAfterCleanup,
      });
    }

    return {
      anonymous_status: anonymous.status,
      cleanup_zero_rows: true,
      cross_origin_status: crossOrigin.status,
      customer_map_status: customer.status,
      fake_driver_job_link_rows_written: 1,
      fake_latest_position_rows_written: 1,
      marker_count: customer.body.marker_count,
      wrong_customer_status: wrongCustomer.status,
    };
  } catch (error) {
    await cleanupEvidenceRows(
      client,
      evidenceReference,
      bookingReference,
      driverJobLinkId,
    );
    throw error;
  }
}

async function run() {
  const phase = requireApproval();
  const target = stagingTargetUrl();

  if (phase === "runtime-window") {
    const proof = await expectRuntimeWindow(target);

    console.log(
      JSON.stringify(
        {
          customer_live_location_link_map_evidence: {
            customer_live_map: "fake_staging_runtime_window_only",
            db_write: "fake_evidence_fixtures_only",
            gps_activation: false,
            phase,
            proof,
            provider_send: false,
            real_gps: false,
            secrets_printed: false,
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const proof = await expectClosed(target, phase);

  console.log(
    JSON.stringify(
      {
        customer_live_location_link_map_evidence: {
          customer_live_map: false,
          db_write: false,
          gps_activation: false,
          phase,
          proof,
          provider_send: false,
          secrets_printed: false,
        },
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  const body =
    error instanceof EvidenceFailure
      ? {
          code: error.code,
          details: error.details,
          status: "blocked",
        }
      : {
          code: "customer_live_location_link_map_evidence_failed_safely",
          status: "blocked",
        };

  console.log(JSON.stringify(body, null, 2));
  process.exitCode = 1;
});
