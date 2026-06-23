import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const approvalEnvName = "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED";
const approvalValue = "small-live-customer-runtime-window-approved";
const phaseEnvName = "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE";
const preflightPhase = "preflight-only";
const executePhase = "execute-window";
const deployApprovalEnvName =
  "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_DEPLOY_APPROVED";
const deployApprovalValue = "small-live-customer-runtime-window-deploy-approved";
const targetUrlEnvName = "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_TARGET_URL";
const expectedMaskedProductionProjectRef = "kvv...atm";
const exactAllowlistSize = 2;
const exactThreeApprovalEnvName =
  "PRESTIGE_EXACT3_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED";
const exactThreeApprovalValue = "exact-3-small-live-customer-runtime-window-approved";
const exactThreePhaseEnvName =
  "PRESTIGE_EXACT3_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE";
const exactThreeDeployApprovalEnvName =
  "PRESTIGE_EXACT3_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_DEPLOY_APPROVED";
const exactThreeDeployApprovalValue =
  "exact-3-small-live-customer-runtime-window-deploy-approved";
const exactThreeTargetUrlEnvName =
  "PRESTIGE_EXACT3_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_TARGET_URL";
const exactThreeAllowlistSize = 3;
const exactFiveApprovalEnvName =
  "PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED";
const exactFiveApprovalValue = "exact-5-small-live-customer-runtime-window-approved";
const exactFivePhaseEnvName =
  "PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE";
const exactFiveDeployApprovalEnvName =
  "PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_DEPLOY_APPROVED";
const exactFiveDeployApprovalValue =
  "exact-5-small-live-customer-runtime-window-deploy-approved";
const exactFiveTargetUrlEnvName =
  "PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_TARGET_URL";
const exactFiveAllowlistSize = 5;
const candidateEnvFileNames = [".env.production.local", ".env.local", ".env.stage4a388.local"];
const notificationTable = "customer_driver_app_notification_outbox";
const customerPortalPurpose = "customer-saved-bookings-read";
const customerInAppPurpose = "customer-in-app-notification-read";
const adminPersistencePurpose = "admin-booking-persistence";
const fixedCustomerInAppTitle = "Driver details ready";
const fixedCustomerInAppMessage =
  "Your Prestige Limo driver details are ready in your customer app.";

const requiredBaseEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
];

const requiredProductionGateEnvNames = [
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST",
];

const requiredProofChecklist = [
  "production root health proof before window",
  "exactly two hidden active production customer account references approved privately",
  "exactly two customer sessions mapped privately with no token values printed",
  "exactly two private customer sessions to exactly two allowlisted customer accounts",
  "one latest active booking per allowlisted customer account",
  "customer portal read proof for both allowlisted customers",
  "customer in-app read proof for both allowlisted customers",
  "admin Send In-App fixed-template proof for both allowlisted customers",
  "anonymous, missing-session, wrong-session, wrong-customer, cross-origin, and wrong-referer block proof",
  "audit or access-log proof without private values",
  "monitoring proof during the window",
  "rollback proof with gates closed",
  "post-rollback blocked/no-read proof",
];
const exactThreeRequiredProofChecklist = [
  "production root health proof before window",
  "exactly three hidden active production customer account references approved privately",
  "exactly three customer sessions mapped privately with no token values printed",
  "exactly three private customer sessions to exactly three allowlisted customer accounts",
  "one latest active booking per allowlisted customer account",
  "customer portal read proof for all three allowlisted customers",
  "customer in-app read proof for all three allowlisted customers",
  "admin Send In-App fixed-template proof for all three allowlisted customers",
  "anonymous, missing-session, wrong-session, wrong-customer, cross-origin, and wrong-referer block proof",
  "audit or access-log proof without private values",
  "monitoring proof during the window",
  "rollback proof with gates closed",
  "post-rollback blocked/no-read proof",
];
const exactFiveRequiredProofChecklist = [
  "production root health proof before window",
  "exactly five hidden active production customer account references approved privately",
  "exactly five customer sessions mapped privately with no token values printed",
  "exactly five private customer sessions to exactly five allowlisted customer accounts",
  "one latest active booking per allowlisted customer account",
  "customer portal read proof for all five allowlisted customers",
  "customer in-app read proof for all five allowlisted customers",
  "admin Send In-App fixed-template proof for all five allowlisted customers",
  "anonymous, missing-session, wrong-session, wrong-customer, cross-origin, and wrong-referer block proof",
  "audit or access-log proof without private values",
  "monitoring proof during the window",
  "rollback proof with gates closed",
  "post-rollback blocked/no-read proof",
];

const safeCustomerVisibleFields = [
  "booking reference",
  "customer-facing booking status",
  "service type",
  "pickup date/time",
  "pickup location",
  "drop-off location",
  "passenger name",
  "created/updated/month grouping",
  "customer-app notification title",
  "customer-app notification message",
  "customer-app notification status",
  "customer-app notification workflow area",
];

const forbiddenSurfaces = [
  "provider sends",
  "Email/Resend",
  "Telegram",
  "WhatsApp",
  "SMS",
  "Google Maps",
  "OneMap",
  "FlightAware",
  "billing/payment/PDF/invoice",
  "pricing/rates/customer_rates",
  "payout/PayNow/driver_payout_rules",
  "parser/debug/internal/admin notes",
  "secrets/tokens/cookies/JWTs",
  "raw provider payloads",
  "Save Booking internals",
  "/api/admin-saved-bookings internals",
  "live-location/driver GPS",
  "OTS/photo/storage",
  "free-form customer messages",
  "fallback/blast/scheduler/retry",
  "all-customer activation",
];

function exactThreeProfileRequested() {
  return Boolean(
    process.env[exactThreeApprovalEnvName] ||
      process.env[exactThreePhaseEnvName] ||
      process.env[exactThreeDeployApprovalEnvName] ||
      process.env[exactThreeTargetUrlEnvName],
  );
}

function exactFiveProfileRequested() {
  return Boolean(
    process.env[exactFiveApprovalEnvName] ||
      process.env[exactFivePhaseEnvName] ||
      process.env[exactFiveDeployApprovalEnvName] ||
      process.env[exactFiveTargetUrlEnvName],
  );
}

function activeApprovalEnvName() {
  if (exactFiveProfileRequested()) {
    return exactFiveApprovalEnvName;
  }

  return exactThreeProfileRequested() ? exactThreeApprovalEnvName : approvalEnvName;
}

function activeApprovalValue() {
  if (exactFiveProfileRequested()) {
    return exactFiveApprovalValue;
  }

  return exactThreeProfileRequested() ? exactThreeApprovalValue : approvalValue;
}

function activePhaseEnvName() {
  if (exactFiveProfileRequested()) {
    return exactFivePhaseEnvName;
  }

  return exactThreeProfileRequested() ? exactThreePhaseEnvName : phaseEnvName;
}

function activeDeployApprovalEnvName() {
  if (exactFiveProfileRequested()) {
    return exactFiveDeployApprovalEnvName;
  }

  return exactThreeProfileRequested() ? exactThreeDeployApprovalEnvName : deployApprovalEnvName;
}

function activeDeployApprovalValue() {
  if (exactFiveProfileRequested()) {
    return exactFiveDeployApprovalValue;
  }

  return exactThreeProfileRequested() ? exactThreeDeployApprovalValue : deployApprovalValue;
}

function activeTargetUrlEnvName() {
  if (exactFiveProfileRequested()) {
    return exactFiveTargetUrlEnvName;
  }

  return exactThreeProfileRequested() ? exactThreeTargetUrlEnvName : targetUrlEnvName;
}

function activeExactAllowlistSize() {
  if (exactFiveProfileRequested()) {
    return exactFiveAllowlistSize;
  }

  return exactThreeProfileRequested() ? exactThreeAllowlistSize : exactAllowlistSize;
}

function activeNumberWord() {
  if (exactFiveProfileRequested()) {
    return "five";
  }

  return exactThreeProfileRequested() ? "three" : "two";
}

function activeTargetScope() {
  return `${activeNumberWord()} hidden active production customer accounts`;
}

function activeBookingScope() {
  return `exactly ${activeNumberWord()} latest active hidden production customer bookings`;
}

function activeProofChecklist() {
  if (exactFiveProfileRequested()) {
    return exactFiveRequiredProofChecklist;
  }

  return exactThreeProfileRequested() ? exactThreeRequiredProofChecklist : requiredProofChecklist;
}

function activePreflightStage() {
  if (exactFiveProfileRequested()) {
    return "exact-5-small-live-customer-runtime-production-window-preflight";
  }

  return exactThreeProfileRequested()
    ? "exact-3-small-live-customer-runtime-production-window-preflight"
    : "small-live-customer-runtime-production-window-preflight";
}

function activeExecuteStage() {
  if (exactFiveProfileRequested()) {
    return "exact-5-small-live-customer-runtime-production-window-execute";
  }

  return exactThreeProfileRequested()
    ? "exact-3-small-live-customer-runtime-production-window-execute"
    : "small-live-customer-runtime-production-window-execute";
}

function activeEvidencePrefix() {
  if (exactFiveProfileRequested()) {
    return "EXACT-5-SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW";
  }

  return exactThreeProfileRequested()
    ? "EXACT-3-SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW"
    : "SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW";
}

const safePortalFields = new Set([
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
const safeCustomerNotificationFields = new Set([
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
const inactiveBookingStatusPattern = /cancel|declin|complet|archiv|void|no_show|noshow/i;
const businessCustomerLabelPattern =
  /hotel|resort|carlton|ritz|raffles|hyatt|hilton|marriott|mandarin|capella|shangri|four seasons|st regis|westin|conrad|pan pacific|fullerton|sentosa|pte|ltd|llp|llc|inc|corp|corporation|company|group|bank|capital|travel|tours|agency|aviation|logistics|concierge|club|properties|holdings|partners|sg\b/i;
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;
const forbiddenPayloadPattern =
  /pricing|customer_price|quoted_price|fare_amount|rate_amount|payout|paynow|driver_payout|driver_payout_rules|customer_rates|billing|payment|invoice|pdf|internal|admin_note|finance|parser|debug|secret|token|cookie|jwt|raw_provider|raw_google|provider_payload|live_location|driver_gps|photo|ots|admin-saved-bookings|save booking internals/i;

class SafeFailure extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

function emit(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function failSafely(code, details = {}) {
  throw new SafeFailure(code, details);
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

function validateLoadedEnv(env, envFileName) {
  const missing = [];
  const placeholder = [];
  const invalid = [];
  const projectRef = projectRefFromSupabaseUrl(env.SUPABASE_URL);
  const maskedProjectRef = maskProjectRef(projectRef);

  for (const key of requiredBaseEnvKeys) {
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
      checked.push({ envFileName, exists: false });
      continue;
    }

    const validation = validateLoadedEnv(parseEnvFile(await readFile(candidatePath, "utf8")), envFileName);

    checked.push({
      envFileName,
      exists: true,
      invalid: validation.invalid,
      maskedProductionProjectRef: validation.maskedProjectRef,
      missing: validation.missing,
      placeholder: validation.placeholder,
      valuesPrinted: false,
    });

    if (validation.ok) {
      return {
        ...validation,
        checked,
      };
    }
  }

  failSafely("small_live_customer_runtime_window_env_preflight_failed", {
    checkedEnvCandidates: checked,
    requiredEnvNames: requiredBaseEnvKeys,
  });
}

function createSupabaseClientFromEnv(env) {
  return createClient(normalizedEnvValue(env.SUPABASE_URL), normalizedEnvValue(env.SUPABASE_SERVICE_ROLE_KEY), {
    auth: {
      persistSession: false,
    },
  });
}

function safeIdentifier(value, maxLength = 180) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();

  return cleaned && cleaned.length <= maxLength && safeReferencePattern.test(cleaned) ? cleaned : null;
}

function safeDateValue(row) {
  const values = [row.pickup_at, row.pickup_datetime, row.updated_at, row.created_at]
    .map((value) => Date.parse(String(value || "")))
    .filter((value) => Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) : 0;
}

function bookingIsActive(row) {
  const status = `${row.customer_facing_status || ""} ${row.admin_internal_status || ""}`;

  return !inactiveBookingStatusPattern.test(status);
}

function assertNoUnsafePayload(value, label) {
  const text = JSON.stringify(value);

  if (forbiddenPayloadPattern.test(text)) {
    failSafely("small_live_customer_runtime_window_forbidden_payload", {
      label,
    });
  }
}

function assertSafePortalProjection(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    failSafely("small_live_customer_portal_expected_exactly_one_safe_booking", {
      rowCount: Array.isArray(rows) ? rows.length : null,
    });
  }

  const unsafeKeys = Object.keys(rows[0] || {}).filter((key) => !safePortalFields.has(key));

  if (unsafeKeys.length > 0) {
    failSafely("small_live_customer_portal_projection_unsafe_field", {
      unsafeFieldCount: unsafeKeys.length,
    });
  }

  assertNoUnsafePayload(rows[0], "small live customer portal safe booking projection");

  return {
    field_count: Object.keys(rows[0] || {}).length,
    safe_fields_only: true,
  };
}

function assertSafeCustomerNotificationProjection(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    failSafely("small_live_customer_in_app_expected_exactly_one_safe_row", {
      rowCount: Array.isArray(rows) ? rows.length : null,
    });
  }

  const unsafeKeys = Object.keys(rows[0] || {}).filter((key) => !safeCustomerNotificationFields.has(key));

  if (unsafeKeys.length > 0) {
    failSafely("small_live_customer_in_app_projection_unsafe_field", {
      unsafeFieldCount: unsafeKeys.length,
    });
  }

  assertNoUnsafePayload(rows[0], "small live customer in-app safe notification projection");

  return {
    field_count: Object.keys(rows[0] || {}).length,
    safe_fields_only: true,
  };
}

async function queryOrFail(query, label) {
  const { data, error } = await query;

  if (error) {
    failSafely("small_live_customer_runtime_window_db_query_failed_safely", {
      label,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function selectLiveWindowTargets(client, exactSize, targetScope) {
  const customerCandidates = await queryOrFail(
    client
      .from("customers")
      .select("id, display_name, account_code, status, customer_type")
      .limit(2000),
    "select hidden production customer candidates",
  );

  const rankedTargets = [];

  for (const customer of customerCandidates) {
    const customerAccountReference = safeIdentifier(customer.id);
    const label = `${customer.display_name || ""} ${customer.account_code || ""} ${
      customer.customer_type || ""
    }`;

    if (!customerAccountReference || /inactive|archived|blocked/i.test(String(customer.status || ""))) {
      continue;
    }

    if (businessCustomerLabelPattern.test(label)) {
      continue;
    }

    const bookingRows = await queryOrFail(
      client
        .from("bookings")
        .select(
          "booking_reference, customer_id, customer_facing_status, admin_internal_status, pickup_at, pickup_datetime, created_at, updated_at, service_type, pickup_location, dropoff_location, passenger_name",
        )
        .eq("customer_id", customerAccountReference)
        .limit(25),
      "select hidden customer active booking candidates",
    );
    const activeBookings = bookingRows.filter((row) => safeIdentifier(row.booking_reference) && bookingIsActive(row));

    if (activeBookings.length === 0) {
      continue;
    }

    activeBookings.sort((left, right) => safeDateValue(right) - safeDateValue(left));

    const latestBooking = activeBookings[0];
    const latestBookingReference = safeIdentifier(latestBooking.booking_reference);

    if (!latestBookingReference) {
      continue;
    }

    const existingCustomerAppRows = await client
      .from(notificationTable)
      .select("booking_reference", { count: "exact", head: true })
      .eq("delivery_surface", "customer_app")
      .eq("booking_reference", latestBookingReference);

    if (existingCustomerAppRows.error || (existingCustomerAppRows.count || 0) > 0) {
      continue;
    }

    assertNoUnsafePayload(
      {
        customer_facing_status: latestBooking.customer_facing_status,
        dropoff_location: latestBooking.dropoff_location,
        passenger_name: latestBooking.passenger_name,
        pickup_location: latestBooking.pickup_location,
        service_type: latestBooking.service_type,
      },
      "selected hidden production customer booking safe field scan",
    );

    rankedTargets.push({
      bookingReference: latestBookingReference,
      customerAccountReference,
      latestTimestamp: safeDateValue(latestBooking),
    });
  }

  rankedTargets.sort((left, right) => right.latestTimestamp - left.latestTimestamp);

  if (rankedTargets.length < exactSize) {
    failSafely("small_live_customer_runtime_window_target_not_found", {
      exactAllowlistSize: exactSize,
      target_scope: targetScope,
    });
  }

  return rankedTargets.slice(0, exactSize);
}

async function selectExactTwoLiveWindowTargets(client) {
  return selectLiveWindowTargets(
    client,
    exactAllowlistSize,
    "two hidden active production customer accounts",
  );
}

async function selectExactThreeLiveWindowTargets(client) {
  return selectLiveWindowTargets(
    client,
    exactThreeAllowlistSize,
    "three hidden active production customer accounts",
  );
}

async function selectExactFiveLiveWindowTargets(client) {
  return selectLiveWindowTargets(
    client,
    exactFiveAllowlistSize,
    "five hidden active production customer accounts",
  );
}

async function selectActiveLiveWindowTargets(client) {
  if (exactFiveProfileRequested()) {
    return selectExactFiveLiveWindowTargets(client);
  }

  return exactThreeProfileRequested()
    ? selectExactThreeLiveWindowTargets(client)
    : selectExactTwoLiveWindowTargets(client);
}

function buildFixtures(targets) {
  const customerAccountAllowlist = targets
    .map((target) => target.customerAccountReference)
    .join(",");

  return targets.map((target) => ({
    authUserId: randomUUID(),
    bookingReference: target.bookingReference,
    customerAccountAllowlist,
    customerAccountReference: target.customerAccountReference,
    eventKey: `small-live-customer-runtime-window-${randomUUID()}`,
    issueToken: `small-live-issue-${randomUUID()}-${randomUUID()}`,
    sessionToken: `small-live-session-${randomUUID()}-${randomUUID()}`,
  }));
}

function buildSessionMap(fixtures) {
  return fixtures
    .map((fixture) =>
      [
        fixture.authUserId,
        fixture.sessionToken,
        fixture.customerAccountReference,
      ].join("|"),
    )
    .join(";");
}

function deploymentEnvOverrides(validation, fixtures, open) {
  const primary = fixtures[0];
  const customerAccountAllowlist = fixtures
    .map((fixture) => fixture.customerAccountReference)
    .join(",");

  if (!primary) {
    failSafely("small_live_customer_runtime_window_missing_fixture");
  }

  return open
    ? {
        PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
        PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
        PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: normalizedEnvValue(
          validation.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
        ),
        PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: normalizedEnvValue(
          validation.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
        ),
        PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST: customerAccountAllowlist,
        PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED: "true",
        PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE: "small-allowlist",
        PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST: customerAccountAllowlist,
        PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED: "true",
        PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE: "small-allowlist",
        PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED: "false",
        PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE: "server-session-token",
        PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN: primary.issueToken,
        PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED: "true",
        PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE: "server-session-token",
        PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID: primary.authUserId,
        PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP: buildSessionMap(fixtures),
        PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN: primary.sessionToken,
        SUPABASE_SERVICE_ROLE_KEY: normalizedEnvValue(validation.env.SUPABASE_SERVICE_ROLE_KEY),
        SUPABASE_URL: normalizedEnvValue(validation.env.SUPABASE_URL),
      }
    : {
        PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
        PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED: "false",
        PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED: "false",
        PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED: "false",
        PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED: "false",
        SUPABASE_SERVICE_ROLE_KEY: normalizedEnvValue(validation.env.SUPABASE_SERVICE_ROLE_KEY),
        SUPABASE_URL: normalizedEnvValue(validation.env.SUPABASE_URL),
      };
}

function redactionValues(values) {
  return values
    .map((value) => normalizedEnvValue(value))
    .filter((value) => value.length >= 12);
}

function redactText(text, values) {
  let redacted = String(text || "");

  for (const value of values) {
    redacted = redacted.split(value).join("[redacted]");
  }

  return redacted.replace(
    /https:\/\/[a-z0-9.-]+\.supabase\.co|eyJ[A-Za-z0-9._-]+|[A-Za-z0-9+/=]{32,}/g,
    "[redacted]",
  );
}

function buildVercelArgs(envOverrides) {
  const args = ["--yes", "vercel", "--prod", "--force", "--yes"];

  for (const [key, value] of Object.entries(envOverrides)) {
    args.push("-b", `${key}=${value}`, "-e", `${key}=${value}`);
  }

  return args;
}

async function runVercelDeploy(envOverrides, label) {
  const redactions = redactionValues(Object.values(envOverrides));

  return new Promise((resolve, reject) => {
    const child = spawn("npx", buildVercelArgs(envOverrides), {
      env: {
        ...process.env,
        NPM_CONFIG_CACHE: "/private/tmp/prestige-npm-cache",
        VERCEL_NO_UPDATE_NOTIFIER: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(
        new SafeFailure("small_live_customer_runtime_window_deploy_failed_safely", {
          deploy_label: label,
          diagnostic: redactText(error.message, redactions).slice(0, 160),
        }),
      );
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new SafeFailure("small_live_customer_runtime_window_deploy_failed_safely", {
            deploy_label: label,
            exit_code: code,
            stderr_tail: redactText(stderr, redactions).slice(-240),
            stdout_tail: redactText(stdout, redactions).slice(-240),
          }),
        );
        return;
      }

      resolve({
        deploy_label: label,
        secret_values_printed: false,
        status: "completed",
      });
    });
  });
}

function normalizedTargetUrl() {
  const targetEnvName = activeTargetUrlEnvName();
  const raw = normalizedEnvValue(process.env[targetEnvName]);

  if (!raw) {
    failSafely("small_live_customer_runtime_window_target_url_missing", {
      required_env_name: targetEnvName,
    });
  }

  try {
    const parsed = new URL(raw);

    if (parsed.protocol !== "https:" || /vercel\.app$/i.test(parsed.hostname)) {
      failSafely("small_live_customer_runtime_window_target_url_not_production_safe", {
        required_env_name: targetEnvName,
      });
    }

    return parsed.origin;
  } catch {
    failSafely("small_live_customer_runtime_window_target_url_invalid", {
      required_env_name: targetEnvName,
    });
  }
}

async function fetchJsonOrText(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");

  assertNoUnsafePayload(body, "deployed route response body");

  return {
    body,
    status: response.status,
  };
}

async function expectStatus(promise, expected, label) {
  const result = await promise;

  if (result.status !== expected) {
    failSafely("small_live_customer_runtime_window_unexpected_status", {
      expected,
      label,
      status: result.status,
    });
  }

  return result;
}

function customerPortalHeaders(fixture) {
  return {
    origin: normalizedTargetUrl(),
    referer: `${normalizedTargetUrl()}/my-bookings`,
    "x-prestige-customer-purpose": customerPortalPurpose,
    "x-prestige-customer-session-token": fixture.sessionToken,
  };
}

function customerInAppHeaders(fixture) {
  return {
    origin: normalizedTargetUrl(),
    referer: `${normalizedTargetUrl()}/my-bookings`,
    "x-prestige-customer-purpose": customerInAppPurpose,
    "x-prestige-customer-session-token": fixture.sessionToken,
  };
}

function adminHeaders(validation) {
  return {
    "content-type": "application/json",
    origin: normalizedTargetUrl(),
    referer: `${normalizedTargetUrl()}/`,
    "x-prestige-admin-purpose": adminPersistencePurpose,
    "x-prestige-admin-session-token": normalizedEnvValue(
      validation.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
    ),
  };
}

function runtimeNotificationPayload(fixture) {
  return {
    booking_reference: fixture.bookingReference,
    delivery_surface: "customer_app",
    event_key: fixture.eventKey,
    notification_status: "queued",
    notification_type: "trip_update",
    priority: "normal",
    safe_context: {
      workflow_area: "customer_app_updates",
    },
    safe_message: fixedCustomerInAppMessage,
    safe_title: fixedCustomerInAppTitle,
    workflow_area: "customer_app_updates",
  };
}

async function verifyRootHealth(targetOrigin) {
  const response = await fetch(`${targetOrigin}/`);
  const title = await response
    .text()
    .then((html) => /<title>\s*Prestige Limo Ops\s*<\/title>/i.test(html))
    .catch(() => false);

  if (response.status !== 200 || !title) {
    failSafely("small_live_customer_runtime_window_root_health_failed_safely", {
      http_status: response.status,
      title_ok: title,
    });
  }

  return {
    http_status: response.status,
    title: "Prestige Limo Ops",
  };
}

async function provePreWindowBlocked(targetOrigin) {
  const portal = await expectStatus(
    fetchJsonOrText(`${targetOrigin}/api/customer-saved-bookings?limit=1&page=1`, {
      method: "GET",
    }),
    403,
    "pre-window customer portal blocked",
  );
  const inApp = await expectStatus(
    fetchJsonOrText(`${targetOrigin}/api/customer-app-notifications?limit=1`, {
      method: "GET",
    }),
    403,
    "pre-window customer in-app blocked",
  );

  return {
    customer_in_app_status: inApp.status,
    customer_portal_status: portal.status,
  };
}

async function runFixtureProof({ fixture, targetOrigin, validation, wrongFixture }) {
  await expectStatus(
    fetchJsonOrText(
      `${targetOrigin}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        fixture.bookingReference,
      )}&limit=1&page=1`,
      {
        headers: {
          origin: targetOrigin,
          referer: `${targetOrigin}/my-bookings`,
          "x-prestige-customer-purpose": customerPortalPurpose,
        },
        method: "GET",
      },
    ),
    403,
    "missing customer session blocked",
  );
  await expectStatus(
    fetchJsonOrText(
      `${targetOrigin}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        fixture.bookingReference,
      )}&limit=1&page=1`,
      {
        headers: customerPortalHeaders(wrongFixture),
        method: "GET",
      },
    ),
    403,
    "wrong customer session blocked",
  );
  await expectStatus(
    fetchJsonOrText(
      `${targetOrigin}/api/customer-app-notifications?booking_reference=${encodeURIComponent(
        fixture.bookingReference,
      )}&limit=1`,
      {
        headers: {
          ...customerInAppHeaders(fixture),
          origin: "https://example.invalid",
          referer: "https://example.invalid/",
        },
        method: "GET",
      },
    ),
    403,
    "cross-origin customer in-app blocked",
  );

  const portalRead = await fetchJsonOrText(
    `${targetOrigin}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
      fixture.bookingReference,
    )}&limit=1&page=1`,
    {
      headers: customerPortalHeaders(fixture),
      method: "GET",
    },
  );

  if (portalRead.status !== 200 || portalRead.body?.ok !== true) {
    failSafely("small_live_customer_runtime_window_portal_read_failed_safely", {
      status: portalRead.status,
    });
  }

  const portalProjection = assertSafePortalProjection(portalRead.body.saved_bookings);
  const adminPost = await fetchJsonOrText(
    `${targetOrigin}/api/admin-customer-driver-app-notifications`,
    {
      body: JSON.stringify(runtimeNotificationPayload(fixture)),
      headers: adminHeaders(validation),
      method: "POST",
    },
  );

  if (adminPost.status !== 200 || adminPost.body?.ok !== true) {
    failSafely("small_live_customer_runtime_window_admin_send_in_app_failed_safely", {
      status: adminPost.status,
    });
  }

  const inAppRead = await fetchJsonOrText(
    `${targetOrigin}/api/customer-app-notifications?booking_reference=${encodeURIComponent(
      fixture.bookingReference,
    )}&limit=1`,
    {
      headers: customerInAppHeaders(fixture),
      method: "GET",
    },
  );

  if (inAppRead.status !== 200 || inAppRead.body?.ok !== true) {
    failSafely("small_live_customer_runtime_window_customer_in_app_read_failed_safely", {
      status: inAppRead.status,
    });
  }

  const customerInAppProjection = assertSafeCustomerNotificationProjection(
    inAppRead.body.notifications,
  );

  return {
    admin_send_in_app_status: adminPost.status,
    customer_in_app_projection: customerInAppProjection,
    customer_in_app_read_status: inAppRead.status,
    portal_projection: portalProjection,
    portal_read_status: portalRead.status,
  };
}

async function cleanupLiveWindowRows(client, fixture) {
  const notificationDelete = await client
    .from(notificationTable)
    .delete()
    .eq("delivery_surface", "customer_app")
    .eq("booking_reference", fixture.bookingReference)
    .eq("event_key", fixture.eventKey);

  if (notificationDelete.error) {
    failSafely("small_live_customer_runtime_window_notification_cleanup_failed_safely");
  }
}

async function verifyZeroNotificationRows(client, fixture) {
  const notificationCount = await client
    .from(notificationTable)
    .select("booking_reference", { count: "exact", head: true })
    .eq("delivery_surface", "customer_app")
    .eq("booking_reference", fixture.bookingReference)
    .eq("event_key", fixture.eventKey);

  if (notificationCount.error) {
    failSafely("small_live_customer_runtime_window_notification_zero_row_check_failed_safely");
  }

  return {
    notification_rows_remaining: notificationCount.count || 0,
    zero_matching_rows: (notificationCount.count || 0) === 0,
  };
}

async function provePostRollbackBlocked(targetOrigin, fixture) {
  const portal = await expectStatus(
    fetchJsonOrText(
      `${targetOrigin}/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        fixture.bookingReference,
      )}&limit=1&page=1`,
      {
        headers: customerPortalHeaders(fixture),
        method: "GET",
      },
    ),
    403,
    "post-rollback customer portal blocked",
  );
  const inApp = await expectStatus(
    fetchJsonOrText(
      `${targetOrigin}/api/customer-app-notifications?booking_reference=${encodeURIComponent(
        fixture.bookingReference,
      )}&limit=1`,
      {
        headers: customerInAppHeaders(fixture),
        method: "GET",
      },
    ),
    403,
    "post-rollback customer in-app blocked",
  );

  return {
    customer_in_app_status: inApp.status,
    customer_portal_status: portal.status,
  };
}

function runPreflightOnly() {
  emit({
    ok: true,
    stage: activePreflightStage(),
    activation_run: false,
    exact_allowlist_size: activeExactAllowlistSize(),
    target_scope: activeTargetScope(),
    booking_scope: "one latest active booking per allowlisted customer",
    supported_phases: [preflightPhase, executePhase],
    execute_window_requires: [
      activeDeployApprovalEnvName(),
      activeTargetUrlEnvName(),
      "existing local production Supabase/admin env names",
    ],
    required_production_gate_env_names: requiredProductionGateEnvNames,
    customer_visible_fields: safeCustomerVisibleFields,
    fixed_customer_in_app_template: {
      safe_message: fixedCustomerInAppMessage,
      safe_title: fixedCustomerInAppTitle,
    },
    proof_checklist: activeProofChecklist(),
    rollback_plan: [
      "deploy closed Customer Portal runtime gate",
      "deploy closed Customer In-App runtime gate",
      "confirm allowlist no longer grants customer reads",
      "confirm customer-app notifications no longer read",
      "record no-secret evidence only",
    ],
    stop_conditions: [
      "any customer outside exact allowlist can read",
      "wrong customer can read another customer booking or notification",
      "any forbidden field appears",
      "any provider send is attempted",
      "any billing/payment/PDF/payout surface activates",
      "any secret, token, ID, booking reference, contact, or private customer data would be printed",
      "rollback cannot be proven immediately",
    ],
    forbidden_surfaces: forbiddenSurfaces,
    secrets_printed: false,
    private_customer_data_printed: false,
    db_write: false,
    provider_send: false,
    deploy: false,
    env_changed_by_runner: false,
  });
}

async function runExecuteWindow() {
  const activeDeployEnvName = activeDeployApprovalEnvName();
  const activeDeployValue = activeDeployApprovalValue();

  if (process.env[activeDeployEnvName] !== activeDeployValue) {
    failSafely("small_live_customer_runtime_window_deploy_not_approved", {
      required_env_name: activeDeployEnvName,
      required_value_name_only: activeDeployValue,
    });
  }

  const targetOrigin = normalizedTargetUrl();
  const validation = await loadAndValidateEnv();
  const client = createSupabaseClientFromEnv(validation.env);
  const targets = await selectActiveLiveWindowTargets(client);
  const fixtures = buildFixtures(targets);
  const openOverrides = deploymentEnvOverrides(validation, fixtures, true);
  const closedOverrides = deploymentEnvOverrides(validation, fixtures, false);
  const proofs = [];
  const cleanups = [];
  const rollbackProofs = [];

  await verifyRootHealth(targetOrigin);
  const preWindowBlocked = await provePreWindowBlocked(targetOrigin);

  try {
    await runVercelDeploy(openOverrides, "open-small-live-window");
    await verifyRootHealth(targetOrigin);

    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture = fixtures[index];
      const wrongFixture = fixtures[(index + 1) % fixtures.length];

      const proof = await runFixtureProof({
        fixture,
        targetOrigin,
        validation,
        wrongFixture,
      });
      proofs.push(proof);

      await cleanupLiveWindowRows(client, fixture);
      const cleanup = await verifyZeroNotificationRows(client, fixture);
      cleanups.push(cleanup);

      if (!cleanup.zero_matching_rows) {
        failSafely("small_live_customer_runtime_window_cleanup_zero_row_failed");
      }
    }
  } finally {
    let rollbackError = null;

    await runVercelDeploy(closedOverrides, "close-small-live-window").catch((error) => {
      rollbackError = error;
    });

    for (const fixture of fixtures) {
      await cleanupLiveWindowRows(client, fixture).catch(() => undefined);
    }

    if (rollbackError) {
      throw rollbackError;
    }
  }

  for (const fixture of fixtures) {
    rollbackProofs.push(await provePostRollbackBlocked(targetOrigin, fixture));
  }

  emit({
    booking_scope: activeBookingScope(),
    cleanup: {
      all_zero_matching_rows: cleanups.every((cleanup) => cleanup.zero_matching_rows),
      checked_customer_count: cleanups.length,
      total_notification_rows_remaining: cleanups.reduce(
        (sum, cleanup) => sum + cleanup.notification_rows_remaining,
        0,
      ),
    },
    db_write_scope: [
      "one temporary customer_app notification row per allowlisted customer",
      "cleanup deletes only matching temporary event keys",
    ],
    deployment_window: {
      closed_after: true,
      env_files_edited: false,
      gate_overrides_only: true,
      opened_by_runner: true,
      persistent_vercel_env_changed: false,
    },
    docs_evidence_record_required_after_success: true,
    env: {
      checkedEnvCandidates: validation.checked,
      envFileName: validation.envFileName,
      requiredBaseEnvNames: requiredBaseEnvKeys,
      requiredProductionGateEnvNames,
      valuesPrinted: false,
    },
    evidence_reference: `${activeEvidencePrefix()}-${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14)}`,
    fullProjectRefPrinted: false,
    gates_closed_after: true,
    google_maps_onemap_flightaware_calls: false,
    maskedProductionProjectRef: validation.maskedProjectRef,
    noBillingPaymentPdfPayout: true,
    noCustomerPrivateDataPrinted: true,
    noProviderSends: true,
    noRealCustomerRowsDeleted: true,
    noSecretsPrinted: true,
    ok: true,
    pre_window_blocked: preWindowBlocked,
    productionDbTouched: true,
    providerSends: false,
    proof: {
      admin_send_in_app_statuses: proofs.map((proof) => proof.admin_send_in_app_status),
      customer_count: proofs.length,
      customer_in_app_read_statuses: proofs.map((proof) => proof.customer_in_app_read_status),
      portal_read_statuses: proofs.map((proof) => proof.portal_read_status),
      post_rollback_statuses: rollbackProofs,
      safe_customer_in_app_projection: proofs.every(
        (proof) => proof.customer_in_app_projection?.safe_fields_only === true,
      ),
      safe_portal_projection: proofs.every(
        (proof) => proof.portal_projection?.safe_fields_only === true,
      ),
    },
    rowIdsPrinted: false,
    stage: activeExecuteStage(),
    target_label: `${activeNumberWord()} hidden active production customers`,
  });
}

async function main() {
  const activeApprovalName = activeApprovalEnvName();
  const activeApprovalRequiredValue = activeApprovalValue();
  const activePhaseName = activePhaseEnvName();

  if (process.env[activeApprovalName] !== activeApprovalRequiredValue) {
    failSafely("small_live_customer_runtime_window_not_approved", {
      required_env_name: activeApprovalName,
      required_value_name_only: activeApprovalRequiredValue,
      supported_phase: preflightPhase,
    });
  }

  const phase = process.env[activePhaseName];

  if (phase === preflightPhase) {
    runPreflightOnly();
    return;
  }

  if (phase === executePhase) {
    await runExecuteWindow();
    return;
  }

  failSafely("small_live_customer_runtime_window_phase_not_allowed", {
    required_env_name: activePhaseName,
    supported_phases: [preflightPhase, executePhase],
  });
}

main().catch((error) => {
  if (error instanceof SafeFailure) {
    emit({
      error: error.code,
      gates_closed_after: true,
      no_op: true,
      ok: false,
      private_customer_data_printed: false,
      secrets_printed: false,
      stage: "small-live-customer-runtime-production-window",
      ...error.extra,
    });
    process.exit(1);
  }

  emit({
    diagnostic: {
      message: redactText(String(error?.message || error || "unknown"), []).slice(0, 240),
      name: String(error?.name || "Error").slice(0, 80),
    },
    error: "unexpected_small_live_customer_runtime_window_failure_sanitized",
    gates_closed_after: true,
    ok: false,
    private_customer_data_printed: false,
    secrets_printed: false,
    stage: "small-live-customer-runtime-production-window",
  });
  process.exit(1);
});
