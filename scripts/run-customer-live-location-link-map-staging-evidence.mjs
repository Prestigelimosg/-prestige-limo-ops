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

const expectedClosedReason = "customer_live_location_map_scaffold_closed";
const defaultTargetUrl = "https://prestige-limo-ops-staging.vercel.app";
const allowedPhases = new Set(["pre-window", "runtime-window", "post-rollback"]);
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

function requireSafeReferences() {
  const requiredNames = [
    accountReferenceEnvName,
    bookingReferenceEnvName,
    customerSessionTokenEnvName,
  ];
  const missing = requiredNames.filter((name) => !envValue(name));

  if (missing.length > 0) {
    throw new EvidenceFailure("missing_required_customer_live_location_env_names", {
      missing_env_names_only: missing,
    });
  }

  for (const name of [accountReferenceEnvName, bookingReferenceEnvName]) {
    const value = envValue(name);

    if (!safeReferencePattern.test(value) || forbiddenSafeTextPattern.test(value)) {
      throw new EvidenceFailure("customer_live_location_reference_invalid", {
        env_name: name,
      });
    }
  }

  if (envValue(customerSessionTokenEnvName).length < 16) {
    throw new EvidenceFailure("customer_live_location_session_token_invalid", {
      env_name: customerSessionTokenEnvName,
    });
  }
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

async function expectClosed(target, phase) {
  requireSafeReferences();

  const url = new URL("/api/customer-live-location-map", target);
  url.searchParams.set("booking_reference", envValue(bookingReferenceEnvName));

  const anonymous = await fetchJsonOrText(url);
  const customer = await fetchJsonOrText(url, {
    headers: {
      origin: target.origin,
      referer: target.toString(),
      "x-prestige-customer-purpose": "customer-live-location-map-read",
      "x-prestige-customer-session-token": envValue(customerSessionTokenEnvName),
    },
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

async function run() {
  const phase = requireApproval();
  const target = stagingTargetUrl();

  if (phase === "runtime-window") {
    throw new EvidenceFailure("customer_live_location_link_map_runtime_window_not_implemented", {
      blocked_safely: true,
      required_future_proof:
        "driver live row, customer scope, stale/offline, POB/completed stop, cleanup, rollback",
    });
  }

  const proof = await expectClosed(target, phase);

  console.log(
    JSON.stringify(
      {
        customer_live_location_link_map_evidence: {
          phase,
          proof,
          customer_live_map: false,
          db_write: false,
          gps_activation: false,
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
