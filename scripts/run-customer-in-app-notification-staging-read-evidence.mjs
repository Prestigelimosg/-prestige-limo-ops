import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const approvalEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_APPROVED";
const expectedApproval = "customer-in-app-notification-staging-read-approved";
const phaseEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_PHASE";
const allowedPhases = new Set(["pre-window", "read-window", "post-rollback"]);
const targetUrlEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_TARGET_URL";
const defaultStagingTarget = "https://prestige-limo-ops-staging.vercel.app";
const customerNotificationTable = "customer_driver_app_notification_outbox";
const customerNotificationReadPurpose = "customer-in-app-notification-read";
const stagingReferenceEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE";

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

const safeReadNotificationFields = new Set([
  "booking_reference",
  "created_at",
  "delivery_surface",
  "notification_status",
  "notification_type",
  "priority",
  "safe_context",
  "safe_message",
  "safe_title",
  "updated_at",
  "workflow_area",
]);

const allowedPayloadKeys = new Set([
  "booking_reference",
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
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function envValue(name) {
  return process.env[name]?.trim() || "";
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

  if (envValue("PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED") !== "true") {
    throw new EvidenceFailure("admin_booking_persistence_gate_not_open_for_read_window", {
      env_name: "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
    });
  }

  if (envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED") !== "true") {
    throw new EvidenceFailure("customer_saved_bookings_auth_gate_not_open_for_read_window", {
      env_name: "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
    });
  }

  if (envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE") !== "server-session-token") {
    throw new EvidenceFailure("customer_saved_bookings_auth_mode_not_server_session_token", {
      env_name: "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
    });
  }

  if (!uuidPattern.test(envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID"))) {
    throw new EvidenceFailure("customer_saved_bookings_auth_user_id_must_be_uuid", {
      env_name: "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
    });
  }

  if (envValue("PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED") !== "true") {
    throw new EvidenceFailure("customer_in_app_notification_read_gate_not_open_for_read_window", {
      env_name: "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED",
    });
  }

  if (envValue("PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE") !== "staging") {
    throw new EvidenceFailure("customer_in_app_notification_read_mode_not_staging", {
      env_name: "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE",
    });
  }

  if (!safeReferencePattern.test(envValue(stagingReferenceEnvName))) {
    throw new EvidenceFailure("customer_in_app_notification_staging_reference_invalid", {
      env_name: stagingReferenceEnvName,
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

function createSupabaseClient() {
  try {
    return createClient(envValue("SUPABASE_URL"), envValue("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false,
      },
    });
  } catch {
    throw new EvidenceFailure("supabase_client_init_failed_safely");
  }
}

function dbFailureCategory(error) {
  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.status);
  const message = String(error?.message || "").toLowerCase();

  if (status === 401 || code === "401" || message.includes("jwt")) {
    return "auth_or_key_rejected";
  }

  if (status === 403 || code === "42501" || message.includes("row level security")) {
    return "permission_or_rls_denied";
  }

  if (code === "42p01" || message.includes("does not exist")) {
    return "table_unreachable";
  }

  if (code === "42703" || code === "pgrst204" || message.includes("column")) {
    return "column_missing";
  }

  return "database_operation_failed_safely";
}

function assertNoDbError(error, label) {
  if (error) {
    throw new EvidenceFailure("database_operation_failed_safely", {
      category: dbFailureCategory(error),
      label,
    });
  }
}

async function cleanupEvidenceRows(client, fixture) {
  if (!fixture?.bookingReference || !fixture?.eventKey) {
    return {
      delete_ok: false,
      skipped: true,
    };
  }

  const deleteResult = await client
    .from(customerNotificationTable)
    .delete()
    .eq("delivery_surface", "customer_app")
    .eq("booking_reference", fixture.bookingReference)
    .eq("event_key", fixture.eventKey);

  assertNoDbError(deleteResult.error, "cleanup fake customer_app notification");

  return {
    delete_ok: true,
  };
}

async function verifyZeroMatchingRows(client, fixture) {
  const { count, error } = await client
    .from(customerNotificationTable)
    .select("booking_reference", { count: "exact", head: true })
    .eq("delivery_surface", "customer_app")
    .eq("booking_reference", fixture.bookingReference)
    .eq("event_key", fixture.eventKey);

  assertNoDbError(error, "verify fake customer_app notification cleanup");

  return {
    matching_rows_remaining: count || 0,
    zero_matching_rows: (count || 0) === 0,
  };
}

async function createFakeCustomerNotificationFixture(client, bookingReference) {
  const eventKey = `customer-in-app-read-${randomUUID()}`;
  const payload = {
    ...fakeCustomerAppNotificationPayload,
    actor_label: "customer in-app staging read evidence",
    actor_role: "system",
    booking_reference: bookingReference,
    event_key: eventKey,
    safe_context: {
      booking_reference: bookingReference,
      evidence: "customer_in_app_notification_read",
      workflow_area: "customer_app_updates",
    },
    source_surface: "system",
    updated_at: new Date().toISOString(),
  };

  assertSafeNotificationPayload({
    booking_reference: payload.booking_reference,
    delivery_surface: payload.delivery_surface,
    notification_status: payload.notification_status,
    notification_type: payload.notification_type,
    priority: payload.priority,
    safe_context: payload.safe_context,
    safe_message: payload.safe_message,
    safe_title: payload.safe_title,
    workflow_area: payload.workflow_area,
  });

  const insertResult = await client
    .from(customerNotificationTable)
    .insert(payload)
    .select("booking_reference")
    .single();

  assertNoDbError(insertResult.error, "create fake customer_app notification");

  return {
    bookingReference,
    eventKey,
    insert_ok: true,
  };
}

function assertNoUnsafeReadPayload(value, label) {
  const text = JSON.stringify(value);
  const forbidden = forbiddenPayloadFragments.find((fragment) =>
    text.toLowerCase().includes(fragment.toLowerCase()),
  );

  if (forbidden) {
    throw new EvidenceFailure("customer_in_app_notification_read_payload_forbidden_field", {
      forbidden_fragment: forbidden,
      label,
    });
  }
}

function validateCustomerNotificationRows(rows, bookingReference) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new EvidenceFailure("expected_exactly_one_customer_app_notification_row", {
      row_count: Array.isArray(rows) ? rows.length : null,
    });
  }

  const row = rows[0] || {};
  const rowKeys = Object.keys(row).sort();
  const unsafeKeys = rowKeys.filter((key) => !safeReadNotificationFields.has(key));

  if (unsafeKeys.length > 0) {
    throw new EvidenceFailure("customer_app_notification_response_included_unsafe_fields", {
      unsafe_field_count: unsafeKeys.length,
    });
  }

  if (row.delivery_surface !== "customer_app" || row.booking_reference !== bookingReference) {
    throw new EvidenceFailure("customer_app_notification_response_scope_mismatch");
  }

  assertNoUnsafeReadPayload(row, "customer_app notification read row");

  return {
    field_count: rowKeys.length,
    safe_fields_only: true,
  };
}

async function verifyBlockedReadRequest(target, label, headers = {}) {
  const routeUrl = new URL("/api/customer-app-notifications", target);
  routeUrl.searchParams.set("booking_reference", envValue(stagingReferenceEnvName));
  routeUrl.searchParams.set("limit", "1");

  const result = await fetchJsonOrText(routeUrl, {
    headers,
    method: "GET",
  });

  if (result.status !== 403) {
    throw new EvidenceFailure("customer_app_notifications_boundary_not_blocked", {
      expected_status: 403,
      label,
      status: result.status,
    });
  }

  assertNoUnsafeReadPayload(result.body || {}, label);

  return {
    label,
    status: result.status,
  };
}

async function readCorrectCustomerNotification(target, bookingReference) {
  const routeUrl = new URL("/api/customer-app-notifications", target);
  routeUrl.searchParams.set("booking_reference", bookingReference);
  routeUrl.searchParams.set("limit", "1");

  const result = await fetchJsonOrText(routeUrl, {
    headers: {
      origin: target.origin,
      referer: new URL("/my-bookings", target).toString(),
      "x-prestige-customer-purpose": customerNotificationReadPurpose,
      "x-prestige-customer-session-token": envValue(
        "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
      ),
    },
    method: "GET",
  });

  if (result.status !== 200) {
    throw new EvidenceFailure("customer_app_notification_read_failed_safely", {
      expected_status: 200,
      status: result.status,
    });
  }

  assertNoUnsafeReadPayload(result.body || {}, "correct customer_app notification read");

  return {
    body: result.body,
    status: result.status,
  };
}

async function runReadWindow() {
  requireReadWindowEnvNames();
  assertSafeNotificationPayload(fakeCustomerAppNotificationPayload);
  const target = stagingTargetUrl();
  const precheck = await runBlockedProof("read-window-precheck");
  const client = createSupabaseClient();
  const bookingReference = envValue(stagingReferenceEnvName);
  let fixture = null;

  try {
    const anonymousBlocked = await verifyBlockedReadRequest(target, "anonymous customer_app read");
    const missingSessionBlocked = await verifyBlockedReadRequest(target, "missing-session customer_app read", {
      origin: target.origin,
      referer: new URL("/my-bookings", target).toString(),
      "x-prestige-customer-purpose": customerNotificationReadPurpose,
    });
    const wrongSessionBlocked = await verifyBlockedReadRequest(target, "wrong-session customer_app read", {
      origin: target.origin,
      referer: new URL("/my-bookings", target).toString(),
      "x-prestige-customer-purpose": customerNotificationReadPurpose,
      "x-prestige-customer-session-token": "staging-safe-wrong-session-token",
    });
    const crossOriginBlocked = await verifyBlockedReadRequest(target, "cross-origin customer_app read", {
      origin: "https://customer.example.invalid",
      referer: new URL("/my-bookings", target).toString(),
      "x-prestige-customer-purpose": customerNotificationReadPurpose,
      "x-prestige-customer-session-token": envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN"),
    });
    const wrongRefererBlocked = await verifyBlockedReadRequest(target, "wrong-referer customer_app read", {
      origin: target.origin,
      referer: new URL("/book", target).toString(),
      "x-prestige-customer-purpose": customerNotificationReadPurpose,
      "x-prestige-customer-session-token": envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN"),
    });

    fixture = await createFakeCustomerNotificationFixture(client, bookingReference);

    const read = await readCorrectCustomerNotification(target, bookingReference);
    const projection = validateCustomerNotificationRows(read.body?.notifications, bookingReference);

    const wrongReferenceUrl = new URL("/api/customer-app-notifications", target);
    wrongReferenceUrl.searchParams.set("booking_reference", `${bookingReference}-OTHER`);
    wrongReferenceUrl.searchParams.set("limit", "1");
    const wrongReference = await fetchJsonOrText(wrongReferenceUrl, {
      headers: {
        origin: target.origin,
        referer: new URL("/my-bookings", target).toString(),
        "x-prestige-customer-purpose": customerNotificationReadPurpose,
        "x-prestige-customer-session-token": envValue(
          "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
        ),
      },
      method: "GET",
    });

    if (wrongReference.status !== 403) {
      throw new EvidenceFailure("wrong_customer_reference_was_not_blocked", {
        expected_status: 403,
        status: wrongReference.status,
      });
    }

    const cleanup = await cleanupEvidenceRows(client, fixture);
    const zeroRows = await verifyZeroMatchingRows(client, fixture);

    if (!zeroRows.zero_matching_rows) {
      throw new EvidenceFailure("customer_app_notification_cleanup_zero_row_proof_failed", zeroRows);
    }

    return {
      audit_proof: {
        read_route_does_not_write_audit_rows: true,
        secret_output_allowed: false,
      },
      boundary_proof: {
        anonymous_status: anonymousBlocked.status,
        cross_origin_status: crossOriginBlocked.status,
        missing_session_status: missingSessionBlocked.status,
        wrong_referer_status: wrongRefererBlocked.status,
        wrong_session_status: wrongSessionBlocked.status,
      },
      cleanup,
      cleanup_proof: zeroRows,
      customer_data_used: false,
      db_write: "one_fake_customer_app_notification_fixture_cleaned_up",
      external_provider_send: false,
      isolation_proof: {
        wrong_customer_reference_status: wrongReference.status,
      },
      phase: "read-window",
      precheck,
      projection,
      provider_calls: false,
      read_proof: {
        response_status: read.status,
        row_count: read.body?.notification_count,
      },
      result: "customer_in_app_notification_staging_read_window_evidence_passed",
      rollback_proof_required_after_this_runner: true,
      secrets_exposed: false,
    };
  } finally {
    if (fixture) {
      await cleanupEvidenceRows(client, fixture);
    }
  }
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
