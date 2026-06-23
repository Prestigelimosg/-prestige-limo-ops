const approvalEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_APPROVED";
const expectedApproval = "customer-in-app-notification-staging-read-approved";
const phaseEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_PHASE";
const allowedPhases = new Set(["pre-window", "read-window", "post-rollback"]);
const targetUrlEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_TARGET_URL";
const defaultStagingTarget = "https://prestige-limo-ops-staging.vercel.app";

const requiredReadWindowEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE",
];

const fakeCustomerAppNotificationPayload = {
  delivery_surface: "customer_app",
  notification_type: "trip_update",
  notification_status: "queued",
  priority: "normal",
  safe_title: "Trip update",
  safe_message: "Your Prestige Limo booking update is ready.",
  safe_context: {
    booking_reference: "STAGING-CUSTOMER-IN-APP-NOTIFICATION-EVIDENCE",
    workflow_area: "customer_app_updates",
  },
  workflow_area: "customer_app_updates",
};

const allowedPayloadKeys = new Set([
  "delivery_surface",
  "notification_type",
  "notification_status",
  "priority",
  "safe_title",
  "safe_message",
  "safe_context",
  "workflow_area",
]);

const forbiddenPayloadFragments = [
  "pricing",
  "price",
  "payout",
  "paynow",
  "customer_rates",
  "driver_payout_rules",
  "billing",
  "payment",
  "pdf",
  "invoice",
  "internal",
  "admin notes",
  "parser",
  "debug",
  "secret",
  "token",
  "cookie",
  "jwt",
  "provider payload",
  "raw provider",
  "live location",
  "driver gps",
  "photo",
  "ots",
  "admin-saved-bookings",
  "save booking internals",
];

class EvidenceFailure extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "EvidenceFailure";
    this.code = code;
    this.details = details;
  }
}

function envNamePresent(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function requireApproval() {
  if (process.env[approvalEnvName] !== expectedApproval) {
    throw new EvidenceFailure("customer_in_app_notification_read_evidence_not_approved", {
      required_env_name: approvalEnvName,
      required_value_name_only: expectedApproval,
    });
  }

  const phase = process.env[phaseEnvName];

  if (!allowedPhases.has(phase)) {
    throw new EvidenceFailure("customer_in_app_notification_read_evidence_phase_not_approved", {
      required_env_name: phaseEnvName,
      allowed_phases: [...allowedPhases],
    });
  }

  return phase;
}

function stagingTargetUrl() {
  const rawTarget = process.env[targetUrlEnvName] || defaultStagingTarget;
  const parsed = new URL(rawTarget);

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "prestige-limo-ops-staging.vercel.app"
  ) {
    throw new EvidenceFailure("customer_in_app_notification_target_not_staging", {
      required_env_name: targetUrlEnvName,
      required_host: "prestige-limo-ops-staging.vercel.app",
    });
  }

  return parsed;
}

function requireReadWindowEnvNames() {
  const missing = requiredReadWindowEnvNames.filter((name) => !envNamePresent(name));

  if (missing.length > 0) {
    throw new EvidenceFailure("missing_required_read_window_env_names_safely", {
      missing_env_names_only: missing,
    });
  }
}

function flattenPayloadValues(value) {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenPayloadValues(item));
  }

  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, nestedValue]) => [
      key,
      ...flattenPayloadValues(nestedValue),
    ]);
  }

  return [];
}

function assertSafeNotificationPayload(payload) {
  for (const key of Object.keys(payload)) {
    if (!allowedPayloadKeys.has(key)) {
      throw new EvidenceFailure("customer_in_app_notification_payload_key_not_allowed", {
        field_name: key,
      });
    }
  }

  const joinedPayload = flattenPayloadValues(payload).join(" ").toLowerCase();
  const forbidden = forbiddenPayloadFragments.find((fragment) =>
    joinedPayload.includes(fragment.toLowerCase()),
  );

  if (forbidden) {
    throw new EvidenceFailure("customer_in_app_notification_payload_forbidden_field", {
      forbidden_fragment: forbidden,
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
    body = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
    text_length: text.length,
  };
}

async function verifyBlockedCustomerNotificationRoute(target, label) {
  const routeUrl = new URL("/api/customer-app-notifications", target);
  const getResult = await fetchJsonOrText(routeUrl);
  const patchResult = await fetchJsonOrText(routeUrl, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  if (getResult.status !== 403 || patchResult.status !== 403) {
    throw new EvidenceFailure("customer_app_notifications_route_not_fail_closed", {
      proof_label: label,
      expected_status: 403,
      get_status: getResult.status,
      patch_status: patchResult.status,
    });
  }

  return {
    proof_label: label,
    anonymous_get_blocked: getResult.status === 403,
    anonymous_patch_blocked: patchResult.status === 403,
    notifications_read: false,
    notification_row_write: false,
  };
}

async function verifyStagingRoot(target) {
  const rootResult = await fetchJsonOrText(new URL("/", target), {
    headers: { accept: "text/html" },
  });

  if (rootResult.status !== 200) {
    throw new EvidenceFailure("staging_root_not_ready", {
      expected_status: 200,
      status: rootResult.status,
    });
  }

  return {
    status: rootResult.status,
  };
}

async function runBlockedProof(phase) {
  const target = stagingTargetUrl();
  const root = await verifyStagingRoot(target);
  const route = await verifyBlockedCustomerNotificationRoute(
    target,
    `${phase} customer-app-notifications blocked boundary`,
  );

  return {
    phase,
    root,
    route,
    customer_route_fail_closed: true,
    db_read: false,
    db_write: false,
    provider_send: false,
  };
}

async function createFakeCustomerNotificationFixture() {
  return {
    future_scope: "one fake staging customer_app notification row only",
    cleanup_required: "cleanup/zero-row proof required",
  };
}

async function verifyAnonymousBlocked() {
  return {
    anonymous_blocked_proof_required: true,
    missing_session_blocked_proof_required: true,
  };
}

async function verifyWrongCustomerBlocked() {
  return {
    wrong_session_blocked_proof_required: true,
    wrong_customer_blocked_proof_required: true,
  };
}

async function verifyCustomerRowIsolation() {
  return {
    row_isolation_proof_required: true,
    cross_customer_read_allowed: false,
  };
}

async function verifyAuditProof() {
  return {
    audit_proof_required: true,
    secret_output_allowed: false,
  };
}

async function cleanupEvidenceRows() {
  return {
    required_result: "zero_matching_rows",
  };
}

async function runReadWindow() {
  requireReadWindowEnvNames();
  assertSafeNotificationPayload(fakeCustomerAppNotificationPayload);
  const precheck = await runBlockedProof("read-window-precheck");

  const fixture = await createFakeCustomerNotificationFixture();
  const anonymousBlocked = await verifyAnonymousBlocked();
  const wrongCustomerBlocked = await verifyWrongCustomerBlocked();
  const rowIsolation = await verifyCustomerRowIsolation();
  const auditProof = await verifyAuditProof();
  const cleanup = await cleanupEvidenceRows();

  throw new EvidenceFailure("customer_in_app_notification_read_path_not_implemented_safely", {
    precheck,
    fixture,
    anonymousBlocked,
    wrongCustomerBlocked,
    rowIsolation,
    auditProof,
    cleanup,
    required_future_change:
      "separately approved gated customer notification read route/helper before evidence execution",
    fake_row_only: true,
    no_broad_read: true,
    zero_matching_rows_required: true,
  });
}

async function main() {
  const phase = requireApproval();
  let result;

  if (phase === "pre-window" || phase === "post-rollback") {
    result = await runBlockedProof(phase);
  } else {
    result = await runReadWindow();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        evidence: "customer_in_app_notification_staging_read",
        result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof EvidenceFailure) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          evidence: "customer_in_app_notification_staging_read",
          result: error.code,
          details: error.details,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.error(
    JSON.stringify(
      {
        ok: false,
        evidence: "customer_in_app_notification_staging_read",
        result: "unexpected_runner_failure",
        message: error instanceof Error ? error.message : "Unknown failure",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
