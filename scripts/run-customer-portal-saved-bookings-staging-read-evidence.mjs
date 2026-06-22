import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const approvalEnvName = "PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_READ_EVIDENCE_APPROVED";
const expectedApproval = "customer-portal-saved-bookings-staging-read-approved";
const phaseEnvName = "PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_READ_EVIDENCE_PHASE";
const allowedPhases = new Set(["pre-window", "read-window", "post-rollback"]);
const targetUrlEnvName = "PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_STAGING_TARGET_URL";
const defaultStagingTarget = "https://prestige-limo-ops-staging.vercel.app";
const requiredReadWindowEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN",
];
const safeSavedBookingFields = new Set([
  "booking_month",
  "booking_reference",
  "created_at",
  "customer_facing_status",
  "dropoff_location",
  "passenger_name",
  "pickup_at",
  "pickup_location",
  "service_type",
  "updated_at",
]);
const forbiddenPayloadPattern =
  /pricing|customer_price|quoted_price|fare_amount|rate_amount|payout|paynow|pay_now|driver_payout|driver_payout_rules|customer_rates|billing|payment|invoice|pdf|internal|admin_note|finance|parser|debug|secret|token|cookie|jwt|raw_provider|raw_google|provider_payload|live_location|photo|ots|admin-saved-bookings/i;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

class EvidenceFailure extends Error {
  constructor(reason, details = {}) {
    super(reason);
    this.details = details;
    this.reason = reason;
  }
}

function fail(reason, details = {}) {
  throw new EvidenceFailure(reason, details);
}

function pass(payload) {
  console.log(
    JSON.stringify(
      {
        ...payload,
        ok: true,
      },
      null,
      2,
    ),
  );
}

function envValue(name) {
  return process.env[name]?.trim() || "";
}

function validateStagingTarget(rawTarget) {
  let parsed;

  try {
    parsed = new URL((rawTarget || defaultStagingTarget).replace(/\/+$/, ""));
  } catch {
    fail("invalid_staging_target_url", { env_name: targetUrlEnvName });
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "prestige-limo-ops-staging.vercel.app"
  ) {
    fail("staging_target_must_be_prestige_limo_ops_staging", {
      env_name: targetUrlEnvName,
    });
  }

  return parsed.toString().replace(/\/+$/, "");
}

function requireApprovalAndPhase() {
  const approval = envValue(approvalEnvName);
  const phase = envValue(phaseEnvName);

  if (approval !== expectedApproval) {
    fail("missing_explicit_customer_portal_saved_bookings_read_evidence_approval", {
      env_name: approvalEnvName,
    });
  }

  if (!allowedPhases.has(phase)) {
    fail("invalid_customer_portal_saved_bookings_read_evidence_phase", {
      allowed_phases: [...allowedPhases],
      env_name: phaseEnvName,
    });
  }

  return phase;
}

function requireReadWindowEnv() {
  const missingNames = requiredReadWindowEnvNames.filter((name) => !envValue(name));

  if (missingNames.length > 0) {
    fail("missing_required_read_window_env_names", {
      missing_env_names: missingNames,
    });
  }

  if (envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED") !== "true") {
    fail("customer_saved_bookings_auth_gate_not_open_for_read_window", {
      env_name: "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
    });
  }

  if (envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE") !== "server-session-token") {
    fail("customer_saved_bookings_auth_mode_not_server_session_token", {
      env_name: "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
    });
  }

  if (envValue("PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED") !== "true") {
    fail("customer_portal_session_issue_gate_not_open_for_read_window", {
      env_name: "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
    });
  }

  if (envValue("PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE") !== "server-session-token") {
    fail("customer_portal_session_issue_mode_not_server_session_token", {
      env_name: "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE",
    });
  }

  const authUserId = envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID");

  if (!uuidPattern.test(authUserId)) {
    fail("customer_saved_bookings_auth_user_id_must_be_uuid", {
      env_name: "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
    });
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function assertNoUnsafePayload(value, label) {
  const text = JSON.stringify(value);

  if (forbiddenPayloadPattern.test(text)) {
    fail("unsafe_customer_portal_saved_bookings_payload", { label });
  }
}

function safeCustomerReferenceValue(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  if (!safeReferencePattern.test(cleaned) || forbiddenPayloadPattern.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeCustomerAccountReference(value) {
  const safeValue = safeCustomerReferenceValue(value);

  return safeValue === null ? null : String(safeValue);
}

function assertStatus(actual, expected, label) {
  if (actual !== expected) {
    fail("unexpected_http_status", { actual, expected, label });
  }
}

function assertBlockedStatus(actual, label) {
  if (![403, 503].includes(actual)) {
    fail("expected_blocked_customer_portal_read_status", { actual, label });
  }
}

async function runBlockedProof(baseUrl, phase) {
  const rootResponse = await fetch(`${baseUrl}/`, { method: "GET" });
  const rootText = await rootResponse.text();

  assertStatus(rootResponse.status, 200, `${phase} staging root`);

  const anonymousResponse = await fetch(`${baseUrl}/api/customer-saved-bookings?limit=1&page=1`, {
    method: "GET",
  });
  const anonymousBody = await readJson(anonymousResponse);

  assertBlockedStatus(anonymousResponse.status, `${phase} anonymous saved bookings`);
  assertNoUnsafePayload(anonymousBody, `${phase} anonymous saved bookings`);

  const wrongRefererResponse = await fetch(
    `${baseUrl}/api/customer-saved-bookings?limit=1&page=1`,
    {
      headers: {
        referer: `${baseUrl}/book`,
        "x-prestige-customer-purpose": "customer-saved-bookings-read",
      },
      method: "GET",
    },
  );
  const wrongRefererBody = await readJson(wrongRefererResponse);

  assertBlockedStatus(wrongRefererResponse.status, `${phase} wrong referer saved bookings`);
  assertNoUnsafePayload(wrongRefererBody, `${phase} wrong referer saved bookings`);

  pass({
    blocked_proof: {
      anonymous_status: anonymousResponse.status,
      wrong_referer_status: wrongRefererResponse.status,
    },
    customer_data_used: false,
    db_write: false,
    email_send: false,
    external_provider_send: false,
    phase,
    provider_calls: false,
    result: `customer_portal_saved_bookings_${phase}_blocked_proof_passed`,
    root: {
      has_title: /<title>Prestige Limo Ops<\/title>/i.test(rootText),
      status: rootResponse.status,
    },
    secrets_exposed: false,
  });
}

function createSupabaseClient() {
  try {
    return createClient(envValue("SUPABASE_URL"), envValue("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false,
      },
    });
  } catch {
    fail("supabase_client_init_failed_safely");
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
    fail("database_operation_failed_safely", {
      category: dbFailureCategory(error),
      label,
    });
  }
}

async function cleanupEvidenceRows(client, fixture) {
  const cleanupResults = {};

  if (fixture.bookingReference) {
    const bookingDelete = await client
      .from("bookings")
      .delete()
      .eq("booking_reference", fixture.bookingReference);

    assertNoDbError(bookingDelete.error, "cleanup bookings");
    cleanupResults.booking_delete_ok = true;
  }

  if (fixture.customerAccountReference && fixture.authUserId) {
    const auditDelete = await client
      .from("customer_driver_access_audit_events")
      .delete()
      .eq("account_surface", "customer")
      .eq("account_reference", fixture.customerAccountReference)
      .eq("auth_user_id", fixture.authUserId)
      .eq("event_type", "session_started");

    assertNoDbError(auditDelete.error, "cleanup customer access audit events");
    cleanupResults.audit_delete_ok = true;

    const accountDelete = await client
      .from("customer_access_accounts")
      .delete()
      .eq("auth_user_id", fixture.authUserId)
      .eq("customer_account_reference", fixture.customerAccountReference);

    assertNoDbError(accountDelete.error, "cleanup customer access account");
    cleanupResults.account_delete_ok = true;
  }

  if (fixture.customerId) {
    const customerDelete = await client
      .from("customers")
      .delete()
      .eq("id", fixture.customerId);

    assertNoDbError(customerDelete.error, "cleanup staging customer");
    cleanupResults.customer_delete_ok = true;
  }

  return cleanupResults;
}

async function countRows(query, label) {
  const { count, error } = await query;

  assertNoDbError(error, label);

  return count || 0;
}

async function verifyCleanup(client, fixture) {
  const bookingCount = await countRows(
    client
      .from("bookings")
      .select("booking_reference", { count: "exact", head: true })
      .eq("booking_reference", fixture.bookingReference),
    "cleanup verify bookings",
  );
  const accountCount = await countRows(
    client
      .from("customer_access_accounts")
      .select("customer_account_reference", { count: "exact", head: true })
      .eq("auth_user_id", fixture.authUserId)
      .eq("customer_account_reference", fixture.customerAccountReference),
    "cleanup verify customer access account",
  );
  const auditCount = await countRows(
    client
      .from("customer_driver_access_audit_events")
      .select("event_type", { count: "exact", head: true })
      .eq("account_surface", "customer")
      .eq("account_reference", fixture.customerAccountReference)
      .eq("auth_user_id", fixture.authUserId)
      .eq("event_type", "session_started"),
    "cleanup verify customer access audit events",
  );
  const customerCount = await countRows(
    client
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("id", fixture.customerId),
    "cleanup verify staging customer",
  );

  return {
    account_rows_remaining: accountCount,
    audit_rows_remaining: auditCount,
    booking_rows_remaining: bookingCount,
    customer_rows_remaining: customerCount,
    zero_matching_rows: bookingCount + accountCount + auditCount + customerCount === 0,
  };
}

async function createEvidenceFixture(client, evidenceReference, fixture) {
  const authUserId = envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID");
  const wrongAuthUserId = randomUUID();
  const pickupAt = "2026-07-02T09:30:00.000Z";
  const customerDisplayName = "Staging Portal Evidence Customer";
  const passengerName = "Staging Portal Passenger";

  fixture.authUserId = authUserId;
  fixture.bookingReference = evidenceReference;

  const wrongAccountCount = await countRows(
    client
      .from("customer_access_accounts")
      .select("customer_account_reference", { count: "exact", head: true })
      .eq("auth_user_id", wrongAuthUserId)
      .eq("account_status", "active"),
    "wrong auth user isolation account count",
  );

  if (wrongAccountCount !== 0) {
    fail("wrong_auth_user_unexpectedly_has_active_customer_account", {
      wrong_account_rows: wrongAccountCount,
    });
  }

  const customerInsert = await client
    .from("customers")
    .insert({
      account_code: evidenceReference,
      customer_type: "other",
      display_name: customerDisplayName,
      status: "active",
    })
    .select("id")
    .single();

  assertNoDbError(customerInsert.error, "create staging customer");

  fixture.customerId = safeCustomerReferenceValue(customerInsert.data?.id);
  fixture.customerAccountReference = safeCustomerAccountReference(customerInsert.data?.id);

  if (!fixture.customerId || !fixture.customerAccountReference) {
    fail("created_staging_customer_reference_invalid_safely");
  }

  const accessInsert = await client.from("customer_access_accounts").insert({
    account_status: "active",
    auth_provider: "supabase_auth",
    auth_user_id: authUserId,
    customer_account_reference: fixture.customerAccountReference,
    safe_display_label: "Staging Portal Evidence Customer",
    source_surface: "system",
  });

  assertNoDbError(accessInsert.error, "create customer access account");

  const bookingInsert = await client.from("bookings").insert({
    admin_internal_status: "confirmed",
    booking_reference: fixture.bookingReference,
    customer_display_name: customerDisplayName,
    customer_facing_status: "confirmed",
    customer_id: fixture.customerId,
    dropoff_location: "Changi Airport Terminal 2",
    passenger_name: passengerName,
    pickup_at: pickupAt,
    pickup_location: "Raffles Hotel Singapore",
    service_type: "arrival",
    source_surface: "admin_api",
  });

  assertNoDbError(bookingInsert.error, "create safe staging booking");

  const auditInsert = await client.from("customer_driver_access_audit_events").insert({
    account_reference: fixture.customerAccountReference,
    account_surface: "customer",
    actor_label: "customer portal saved-bookings staging evidence",
    actor_role: "customer",
    auth_user_id: authUserId,
    event_type: "session_started",
    safe_event_context: {
      booking_reference: evidenceReference,
      evidence: "customer_portal_saved_bookings_read",
      safe_projection_only: true,
    },
    source_surface: "customer_api",
  });

  assertNoDbError(auditInsert.error, "create safe customer portal access audit event");

  return {
    fixture,
    wrong_account_rows: wrongAccountCount,
  };
}

function validateSavedBookingRows(rows, evidenceReference) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    fail("expected_exactly_one_saved_booking_row", {
      row_count: Array.isArray(rows) ? rows.length : null,
    });
  }

  const row = rows[0] || {};
  const rowKeys = Object.keys(row).sort();
  const unsafeKeys = rowKeys.filter((key) => !safeSavedBookingFields.has(key));

  if (unsafeKeys.length > 0) {
    fail("saved_booking_response_included_unsafe_fields", {
      unsafe_field_count: unsafeKeys.length,
    });
  }

  if (row.booking_reference !== evidenceReference) {
    fail("saved_booking_response_reference_mismatch");
  }

  assertNoUnsafePayload(row, "customer saved-bookings safe projection");

  return {
    field_count: rowKeys.length,
    safe_fields_only: true,
  };
}

async function issueCustomerPortalSessionCookie(baseUrl) {
  const response = await fetch(`${baseUrl}/api/customer-portal-sessions`, {
    headers: {
      origin: baseUrl,
      referer: `${baseUrl}/my-bookings`,
      "x-prestige-customer-purpose": "customer-portal-session-issue",
      "x-prestige-customer-session-issue-token": envValue(
        "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN",
      ),
    },
    method: "POST",
  });
  const body = await readJson(response);

  assertStatus(response.status, 200, "customer portal session issue");
  assertNoUnsafePayload(body, "customer portal session issue");

  const cookieHeader = response.headers.get("set-cookie") || "";
  const cookiePair = cookieHeader.split(";")[0]?.trim();

  if (!cookiePair || cookiePair.length < 20) {
    fail("customer_portal_session_cookie_not_issued_safely");
  }

  return cookiePair;
}

async function runReadWindowEvidence(baseUrl) {
  requireReadWindowEnv();

  const client = createSupabaseClient();
  const evidenceReference = `CUSTOMER-PORTAL-SAVED-BOOKINGS-STAGING-${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}`;
  const created = {
    authUserId: envValue("PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID"),
    bookingReference: evidenceReference,
    customerAccountReference: "",
    customerId: "",
  };
  let fixtureCreated = false;

  try {
    const anonymousResponse = await fetch(
      `${baseUrl}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        evidenceReference,
      )}&limit=1&page=1`,
      {
        method: "GET",
      },
    );
    const anonymousBody = await readJson(anonymousResponse);

    assertStatus(anonymousResponse.status, 403, "anonymous customer saved-bookings boundary");
    assertNoUnsafePayload(anonymousBody, "anonymous customer saved-bookings boundary");

    const missingSessionResponse = await fetch(
      `${baseUrl}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        evidenceReference,
      )}&limit=1&page=1`,
      {
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/my-bookings`,
          "x-prestige-customer-purpose": "customer-saved-bookings-read",
        },
        method: "GET",
      },
    );
    const missingSessionBody = await readJson(missingSessionResponse);

    assertStatus(missingSessionResponse.status, 403, "missing customer session boundary");
    assertNoUnsafePayload(missingSessionBody, "missing customer session boundary");

    const wrongSessionResponse = await fetch(
      `${baseUrl}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        evidenceReference,
      )}&limit=1&page=1`,
      {
        headers: {
          origin: baseUrl,
          referer: `${baseUrl}/my-bookings`,
          "x-prestige-customer-purpose": "customer-saved-bookings-read",
          "x-prestige-customer-session-token": "staging-safe-wrong-session-token",
        },
        method: "GET",
      },
    );
    const wrongSessionBody = await readJson(wrongSessionResponse);

    assertStatus(wrongSessionResponse.status, 403, "wrong customer session boundary");
    assertNoUnsafePayload(wrongSessionBody, "wrong customer session boundary");

    const crossOriginResponse = await fetch(
      `${baseUrl}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        evidenceReference,
      )}&limit=1&page=1`,
      {
        headers: {
          origin: "https://customer.example.invalid",
          referer: `${baseUrl}/my-bookings`,
          "x-prestige-customer-purpose": "customer-saved-bookings-read",
          "x-prestige-customer-session-token": envValue(
            "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
          ),
        },
        method: "GET",
      },
    );
    const crossOriginBody = await readJson(crossOriginResponse);

    assertStatus(crossOriginResponse.status, 403, "cross-origin customer boundary");
    assertNoUnsafePayload(crossOriginBody, "cross-origin customer boundary");

    fixtureCreated = true;

    const setup = await createEvidenceFixture(client, evidenceReference, created);

    created.customerId = setup.fixture.customerId;
    created.customerAccountReference = setup.fixture.customerAccountReference;

    const cookiePair = await issueCustomerPortalSessionCookie(baseUrl);
    const readResponse = await fetch(
      `${baseUrl}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        evidenceReference,
      )}&limit=1&page=1`,
      {
        headers: {
          cookie: cookiePair,
          origin: baseUrl,
          referer: `${baseUrl}/my-bookings`,
          "x-prestige-customer-purpose": "customer-saved-bookings-read",
        },
        method: "GET",
      },
    );
    const readBody = await readJson(readResponse);

    assertStatus(readResponse.status, 200, "authenticated customer saved-bookings read");
    assertNoUnsafePayload(readBody, "authenticated customer saved-bookings read");

    const projection = validateSavedBookingRows(readBody.saved_bookings, evidenceReference);
    const unmatchedReferenceResponse = await fetch(
      `${baseUrl}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        `${evidenceReference}-OTHER`,
      )}&limit=1&page=1`,
      {
        headers: {
          cookie: cookiePair,
          origin: baseUrl,
          referer: `${baseUrl}/my-bookings`,
          "x-prestige-customer-purpose": "customer-saved-bookings-read",
        },
        method: "GET",
      },
    );
    const unmatchedReferenceBody = await readJson(unmatchedReferenceResponse);

    assertStatus(unmatchedReferenceResponse.status, 200, "unmatched booking reference isolation");
    assertNoUnsafePayload(unmatchedReferenceBody, "unmatched booking reference isolation");

    if (!Array.isArray(unmatchedReferenceBody.saved_bookings) || unmatchedReferenceBody.saved_bookings.length !== 0) {
      fail("unmatched_booking_reference_returned_rows", {
        row_count: Array.isArray(unmatchedReferenceBody.saved_bookings)
          ? unmatchedReferenceBody.saved_bookings.length
          : null,
      });
    }

    const cleanup = await cleanupEvidenceRows(client, created);
    const cleanupProof = await verifyCleanup(client, created);

    if (!cleanupProof.zero_matching_rows) {
      fail("cleanup_zero_row_proof_failed", cleanupProof);
    }

    pass({
      audit_proof: {
        safe_audit_event_written: true,
      },
      boundary_proof: {
        anonymous_status: anonymousResponse.status,
        cross_origin_status: crossOriginResponse.status,
        missing_session_status: missingSessionResponse.status,
        wrong_session_status: wrongSessionResponse.status,
      },
      cleanup,
      cleanup_proof: cleanupProof,
      customer_data_used: false,
      db_write: "one_staging_safe_customer_account_booking_and_audit_fixture_cleaned_up",
      email_send: false,
      evidence_reference: evidenceReference,
      external_provider_send: false,
      isolation_proof: {
        unmatched_booking_reference_rows: unmatchedReferenceBody.saved_bookings.length,
        wrong_auth_user_active_account_rows: setup.wrong_account_rows,
      },
      phase: "read-window",
      projection,
      provider_calls: false,
      read_proof: {
        response_status: readResponse.status,
        row_count: readBody.saved_bookings.length,
      },
      result: "customer_portal_saved_bookings_read_window_evidence_passed",
      rollback_proof_required_after_this_runner: true,
      secrets_exposed: false,
    });
  } finally {
    if (fixtureCreated) {
      await cleanupEvidenceRows(client, created);
    }
  }
}

async function main() {
  const phase = requireApprovalAndPhase();
  const baseUrl = validateStagingTarget(envValue(targetUrlEnvName));

  if (phase === "read-window") {
    await runReadWindowEvidence(baseUrl);
  } else {
    await runBlockedProof(baseUrl, phase);
  }
}

try {
  await main();
} catch (error) {
  const reason =
    error instanceof EvidenceFailure
      ? error.reason
      : "customer_portal_saved_bookings_staging_read_evidence_failed_safely";
  const details = error instanceof EvidenceFailure ? error.details : {};

  console.log(
    JSON.stringify(
      {
        details,
        ok: false,
        reason,
        result: "customer_portal_saved_bookings_staging_read_evidence_blocked",
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
