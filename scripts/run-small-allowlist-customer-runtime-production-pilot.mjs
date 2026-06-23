import { constants, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const approvalEnvName = "PRESTIGE_SMALL_ALLOWLIST_CUSTOMER_PRODUCTION_PILOT_APPROVED";
const approvalValue = "small-allowlist-customer-production-pilot-approved";
const expectedMaskedProductionProjectRef = "kvv...atm";
const candidateEnvFileNames = [".env.production.local", ".env.local", ".env.stage4a388.local"];
const liveAttemptMarkerPath = path.join(
  os.tmpdir(),
  "prestige-small-allowlist-customer-runtime-production-pilot-attempted-v3.marker",
);
const targetLabel = "small allowlist customer";
const minSmallAllowlistSize = 2;
const maxSmallAllowlistSize = 2;
const customerPortalPurpose = "customer-saved-bookings-read";
const customerInAppPurpose = "customer-in-app-notification-read";
const customerPortalSessionIssuePurpose = "customer-portal-session-issue";
const adminPersistencePurpose = "admin-booking-persistence";
const notificationTable = "customer_driver_app_notification_outbox";
const requiredBaseEnvKeys = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
];
const runtimeGateEnvNames = [
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
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
const sourceFiles = [
  "lib/admin-booking-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/customer-driver-app-notification-persistence.ts",
  "lib/customer-portal-session-issue.ts",
  "lib/customer-saved-bookings-read.ts",
  "lib/driver-job-link.ts",
  "lib/driver-job-link-mode.ts",
  "lib/driver-job-status-workflow.ts",
  "app/api/admin-customer-driver-app-notifications/route.ts",
  "app/api/customer-app-notifications/route.ts",
  "app/api/customer-portal-sessions/route.ts",
  "app/api/customer-saved-bookings/route.ts",
];
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
const forbiddenPayloadPattern =
  /pricing|customer_price|quoted_price|fare_amount|rate_amount|payout|paynow|driver_payout|driver_payout_rules|customer_rates|billing|payment|invoice|pdf|internal|admin_note|finance|parser|debug|secret|token|cookie|jwt|raw_provider|raw_google|provider_payload|live_location|driver_gps|photo|ots|admin-saved-bookings|save booking internals/i;
const inactiveBookingStatusPattern = /cancel|declin|complet|archiv|void|no_show|noshow/i;
const businessCustomerLabelPattern =
  /hotel|resort|carlton|ritz|raffles|hyatt|hilton|marriott|mandarin|capella|shangri|four seasons|st regis|westin|conrad|pan pacific|fullerton|sentosa|pte|ltd|llp|llc|inc|corp|corporation|company|group|bank|capital|travel|tours|agency|aviation|logistics|concierge|club|properties|holdings|partners|sg\b/i;
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;

class SafeFailure extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}

function emitEvidence(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function failSafely(code, extra = {}) {
  throw new SafeFailure(code, extra);
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

  failSafely("small_allowlist_customer_production_pilot_env_preflight_failed", {
    checkedEnvCandidates: checked,
    requiredEnvNames: requiredBaseEnvKeys,
  });
}

function applyBaseEnv(env) {
  for (const key of requiredBaseEnvKeys) {
    process.env[key] = normalizedEnvValue(env[key]);
  }
}

function closeRuntimeGates() {
  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "false";
  process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED = "false";
  process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED = "false";
  process.env.PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED = "false";
  process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED = "false";
}

function openRuntimeGates({
  authUserId,
  customerAccountAllowlist,
  customerAccountReference,
  issueToken,
  sessionToken,
}) {
  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";
  process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED = "true";
  process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE = "server-session-token";
  process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID = authUserId;
  process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN = sessionToken;
  process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED = "true";
  process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE = "server-session-token";
  process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN = issueToken;
  process.env.PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED = "true";
  process.env.PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE = "small-allowlist";
  process.env.PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST =
    customerAccountAllowlist || customerAccountReference;
  process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED = "true";
  process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE = "small-allowlist";
  process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST =
    customerAccountAllowlist || customerAccountReference;
}

function createSupabaseClientFromEnv() {
  return createClient(
    normalizedEnvValue(process.env.SUPABASE_URL),
    normalizedEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");
  const output = transpileTypescript(source, sourcePath);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);

  if (relativePath.endsWith(".ts")) {
    const tsOutputPath = path.join(tempDir, relativePath);

    await mkdir(path.dirname(tsOutputPath), { recursive: true });
    await writeFile(tsOutputPath, output);
  }
}

async function writeRuntimeModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const tempSupabaseDir = path.join(tempDir, "node_modules/@supabase");
  const workspaceSupabaseDir = path.join(process.cwd(), "node_modules/@supabase");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(tempSupabaseDir, { recursive: true });
  await writeFile(serverOnlyPath, "");

  try {
    await symlink(
      path.join(workspaceSupabaseDir, "supabase-js"),
      path.join(tempSupabaseDir, "supabase-js"),
      "dir",
    );
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  }
}

async function loadHarness() {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "prestige-small-allowlist-customer-runtime-pilot-"),
  );

  await writeRuntimeModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    adminNotificationRoute: require(
      path.join(tempDir, "app/api/admin-customer-driver-app-notifications/route.js"),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    customerAppRoute: require(path.join(tempDir, "app/api/customer-app-notifications/route.js")),
    customerPortalRoute: require(path.join(tempDir, "app/api/customer-saved-bookings/route.js")),
    customerSessionRoute: require(path.join(tempDir, "app/api/customer-portal-sessions/route.js")),
  };
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
    failSafely("small_allowlist_customer_production_pilot_forbidden_payload", {
      label,
    });
  }
}

function assertSafePortalProjection(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    failSafely("small_allowlist_customer_portal_expected_exactly_one_safe_booking", {
      rowCount: Array.isArray(rows) ? rows.length : null,
    });
  }

  const unsafeKeys = Object.keys(rows[0] || {}).filter((key) => !safePortalFields.has(key));

  if (unsafeKeys.length > 0) {
    failSafely("small_allowlist_customer_portal_projection_unsafe_field", {
      unsafeFieldCount: unsafeKeys.length,
    });
  }

  assertNoUnsafePayload(rows[0], "portal safe booking projection");

  return {
    field_count: Object.keys(rows[0] || {}).length,
    safe_fields_only: true,
  };
}

function assertSafeCustomerNotificationProjection(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) {
    failSafely("small_allowlist_customer_customer_in_app_expected_exactly_one_safe_row", {
      rowCount: Array.isArray(rows) ? rows.length : null,
    });
  }

  const unsafeKeys = Object.keys(rows[0] || {}).filter((key) => !safeCustomerNotificationFields.has(key));

  if (unsafeKeys.length > 0) {
    failSafely("small_allowlist_customer_customer_in_app_projection_unsafe_field", {
      unsafeFieldCount: unsafeKeys.length,
    });
  }

  assertNoUnsafePayload(rows[0], "customer in-app safe notification projection");

  return {
    field_count: Object.keys(rows[0] || {}).length,
    safe_fields_only: true,
  };
}

function readJson(response) {
  return response.json().catch(() => ({}));
}

function adminHeaders() {
  return {
    "content-type": "application/json",
    origin: "http://localhost",
    referer: "http://localhost/",
    "x-prestige-admin-purpose": adminPersistencePurpose,
    "x-prestige-admin-session-token": process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  };
}

function customerHeaders(sessionToken) {
  return {
    origin: "http://localhost",
    referer: "http://localhost/my-bookings",
    "x-prestige-customer-purpose": customerPortalPurpose,
    "x-prestige-customer-session-token": sessionToken,
  };
}

function customerInAppHeaders(sessionToken) {
  return {
    origin: "http://localhost",
    referer: "http://localhost/my-bookings",
    "x-prestige-customer-purpose": customerInAppPurpose,
    "x-prestige-customer-session-token": sessionToken,
  };
}

function requestJson(url, body, headers, method = "POST") {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method,
  });
}

async function expectStatus(responsePromise, expected, label) {
  const response = await responsePromise;
  const body = await readJson(response);

  assertNoUnsafePayload(body, label);

  if (response.status !== expected) {
    failSafely("small_allowlist_customer_production_pilot_unexpected_status", {
      expected,
      label,
      status: response.status,
    });
  }

  return {
    body,
    status: response.status,
  };
}

async function queryOrFail(query, label) {
  const { data, error } = await query;

  if (error) {
    failSafely("small_allowlist_customer_production_pilot_db_query_failed_safely", {
      label,
    });
  }

  return Array.isArray(data) ? data : [];
}

async function findSmallAllowlistTargets(client) {
  const customerCandidates = await queryOrFail(
    client
      .from("customers")
      .select("id, display_name, account_code, status, customer_type")
      .limit(2000),
    "select hidden customer candidate labels",
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

    const existingAccessMappings = await queryOrFail(
      client
        .from("customer_access_accounts")
        .select("customer_account_reference")
        .eq("customer_account_reference", customerAccountReference)
        .limit(1),
      "select existing customer access mapping guard",
    );

    if (existingAccessMappings.length > 0) {
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
      "select hidden customer booking candidates",
    );
    const activeBookings = bookingRows.filter((row) => safeIdentifier(row.booking_reference) && bookingIsActive(row));

    if (activeBookings.length === 0) {
      continue;
    }

    activeBookings.sort((left, right) => safeDateValue(right) - safeDateValue(left));

    rankedTargets.push({
      booking: activeBookings[0],
      customerAccountReference,
      latestTimestamp: safeDateValue(activeBookings[0]),
    });
  }

  rankedTargets.sort((left, right) => right.latestTimestamp - left.latestTimestamp);

  if (rankedTargets.length < minSmallAllowlistSize) {
    failSafely("small_allowlist_customer_production_pilot_target_not_found", {
      minSmallAllowlistSize,
      targetLabel,
    });
  }

  return rankedTargets.slice(0, maxSmallAllowlistSize).map((selected) => {
    const bookingReference = safeIdentifier(selected.booking.booking_reference);

    if (!bookingReference) {
      failSafely("small_allowlist_customer_production_pilot_booking_reference_not_safe");
    }

    assertNoUnsafePayload(
      {
        customer_facing_status: selected.booking.customer_facing_status,
        dropoff_location: selected.booking.dropoff_location,
        passenger_name: selected.booking.passenger_name,
        pickup_location: selected.booking.pickup_location,
        service_type: selected.booking.service_type,
      },
      "selected hidden customer booking safe field scan",
    );

    return {
      bookingReference,
      customerAccountReference: selected.customerAccountReference,
    };
  });
}

async function cleanupPilotRows(client, fixture) {
  const notificationDelete = await client
    .from(notificationTable)
    .delete()
    .eq("delivery_surface", "customer_app")
    .eq("booking_reference", fixture.bookingReference)
    .eq("event_key", fixture.eventKey);

  if (notificationDelete.error) {
    failSafely("small_allowlist_customer_notification_cleanup_failed_safely");
  }

  const accountDelete = await client
    .from("customer_access_accounts")
    .delete()
    .eq("auth_user_id", fixture.authUserId)
    .eq("customer_account_reference", fixture.customerAccountReference);

  if (accountDelete.error) {
    failSafely("small_allowlist_customer_access_mapping_cleanup_failed_safely");
  }
}

async function verifyZeroRows(client, fixture) {
  const notificationCount = await client
    .from(notificationTable)
    .select("booking_reference", { count: "exact", head: true })
    .eq("delivery_surface", "customer_app")
    .eq("booking_reference", fixture.bookingReference)
    .eq("event_key", fixture.eventKey);

  if (notificationCount.error) {
    failSafely("small_allowlist_customer_notification_zero_row_check_failed_safely");
  }

  const accountCount = await client
    .from("customer_access_accounts")
    .select("customer_account_reference", { count: "exact", head: true })
    .eq("auth_user_id", fixture.authUserId)
    .eq("customer_account_reference", fixture.customerAccountReference);

  if (accountCount.error) {
    failSafely("small_allowlist_customer_access_mapping_zero_row_check_failed_safely");
  }

  return {
    access_mapping_rows_remaining: accountCount.count || 0,
    notification_rows_remaining: notificationCount.count || 0,
    zero_matching_rows: (notificationCount.count || 0) + (accountCount.count || 0) === 0,
  };
}

async function createAccessMapping(client, fixture) {
  const insert = await client.from("customer_access_accounts").insert({
    account_status: "active",
    auth_provider: "supabase_auth",
    auth_user_id: fixture.authUserId,
    customer_account_reference: fixture.customerAccountReference,
    safe_display_label: "Small allowlist customer controlled production pilot",
    source_surface: "system",
  });

  if (insert.error) {
    failSafely("small_allowlist_customer_access_mapping_create_failed_safely");
  }
}

async function writeLiveAttemptMarker() {
  try {
    await writeFile(
      liveAttemptMarkerPath,
      "Controlled small allowlist customer runtime production pilot attempted.\n",
      {
        flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        mode: 0o600,
      },
    );
  } catch (error) {
    if (error?.code === "EEXIST") {
      failSafely("small_allowlist_customer_production_pilot_already_attempted");
    }

    throw error;
  }
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
      booking_reference: fixture.bookingReference,
      pilot: "small_allowlist_customer_runtime",
      workflow_area: "customer_app_updates",
    },
    safe_message: "Your Prestige Limo driver details are ready in your customer app.",
    safe_title: "Driver details ready",
    workflow_area: "customer_app_updates",
  };
}

async function issueSessionCookie(harness, issueToken) {
  const response = await harness.customerSessionRoute.POST(
    new Request("http://localhost/api/customer-portal-sessions", {
      headers: {
        origin: "http://localhost",
        referer: "http://localhost/my-bookings",
        "x-prestige-customer-purpose": customerPortalSessionIssuePurpose,
        "x-prestige-customer-session-issue-token": issueToken,
      },
      method: "POST",
    }),
  );
  const body = await readJson(response);

  assertNoUnsafePayload(body, "session issue body");

  if (response.status !== 200 || body?.ok !== true) {
    failSafely("small_allowlist_customer_customer_session_issue_failed_safely", {
      status: response.status,
    });
  }

  const cookiePair = (response.headers.get("set-cookie") || "").split(";")[0]?.trim();

  if (!cookiePair || cookiePair.length < 20) {
    failSafely("small_allowlist_customer_customer_session_cookie_missing_safely");
  }

  return cookiePair;
}

async function runRouteProofs(harness, fixture) {
  await expectStatus(
    harness.customerPortalRoute.GET(
      new Request(
        `http://localhost/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
          fixture.bookingReference,
        )}&limit=1&page=1`,
      ),
    ),
    403,
    "pre-window customer portal blocked",
  );
  await expectStatus(
    harness.customerAppRoute.GET(new Request("http://localhost/api/customer-app-notifications")),
    403,
    "pre-window customer in-app blocked",
  );

  openRuntimeGates(fixture);

  await expectStatus(
    harness.customerPortalRoute.GET(
      new Request(
        `http://localhost/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
          fixture.bookingReference,
        )}&limit=1&page=1`,
        {
          headers: {
            origin: "http://localhost",
            referer: "http://localhost/my-bookings",
            "x-prestige-customer-purpose": customerPortalPurpose,
          },
          method: "GET",
        },
      ),
    ),
    403,
    "missing customer session blocked",
  );
  await expectStatus(
    harness.customerPortalRoute.GET(
      new Request(
        `http://localhost/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
          fixture.bookingReference,
        )}&limit=1&page=1`,
        {
          headers: {
            ...customerHeaders("wrong-production-pilot-session-token"),
          },
          method: "GET",
        },
      ),
    ),
    403,
    "wrong customer session blocked",
  );

  const cookiePair = await issueSessionCookie(harness, fixture.issueToken);
  const portalRead = await harness.customerPortalRoute.GET(
    new Request(
      `http://localhost/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        fixture.bookingReference,
      )}&limit=1&page=1`,
      {
        headers: {
          cookie: cookiePair,
          origin: "http://localhost",
          referer: "http://localhost/my-bookings",
          "x-prestige-customer-purpose": customerPortalPurpose,
        },
        method: "GET",
      },
    ),
  );
  const portalBody = await readJson(portalRead);

  assertNoUnsafePayload(portalBody, "hidden customer portal read");

  if (portalRead.status !== 200 || portalBody?.ok !== true) {
    failSafely("small_allowlist_customer_portal_read_failed_safely", {
      status: portalRead.status,
    });
  }

  const portalProjection = assertSafePortalProjection(portalBody.saved_bookings);
  const outOfScopeRead = await harness.customerPortalRoute.GET(
    new Request(
      `http://localhost/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
        `${fixture.bookingReference}-OTHER`,
      )}&limit=1&page=1`,
      {
        headers: {
          cookie: cookiePair,
          origin: "http://localhost",
          referer: "http://localhost/my-bookings",
          "x-prestige-customer-purpose": customerPortalPurpose,
        },
        method: "GET",
      },
    ),
  );
  const outOfScopeBody = await readJson(outOfScopeRead);

  assertNoUnsafePayload(outOfScopeBody, "hidden customer out-of-scope portal read");

  if (
    outOfScopeRead.status !== 200 ||
    !Array.isArray(outOfScopeBody.saved_bookings) ||
    outOfScopeBody.saved_bookings.length !== 0
  ) {
    failSafely("small_allowlist_customer_out_of_scope_portal_read_failed_safely", {
      status: outOfScopeRead.status,
    });
  }

  const adminPost = await harness.adminNotificationRoute.POST(
    requestJson(
      "http://localhost/api/admin-customer-driver-app-notifications",
      runtimeNotificationPayload(fixture),
      adminHeaders(),
    ),
  );
  const adminPostBody = await readJson(adminPost);

  assertNoUnsafePayload(adminPostBody, "hidden customer admin Send In-App response");

  if (adminPost.status !== 200 || adminPostBody?.ok !== true) {
    failSafely("small_allowlist_customer_admin_customer_in_app_write_failed_safely", {
      status: adminPost.status,
    });
  }

  const customerNotificationRead = await harness.customerAppRoute.GET(
    new Request(
      `http://localhost/api/customer-app-notifications?booking_reference=${encodeURIComponent(
        fixture.bookingReference,
      )}&limit=1`,
      {
        headers: customerInAppHeaders(fixture.sessionToken),
        method: "GET",
      },
    ),
  );
  const customerNotificationBody = await readJson(customerNotificationRead);

  assertNoUnsafePayload(customerNotificationBody, "hidden customer in-app read");

  if (customerNotificationRead.status !== 200 || customerNotificationBody?.ok !== true) {
    failSafely("small_allowlist_customer_customer_in_app_read_failed_safely", {
      status: customerNotificationRead.status,
    });
  }

  const customerNotificationProjection = assertSafeCustomerNotificationProjection(
    customerNotificationBody.notifications,
  );

  closeRuntimeGates();

  await expectStatus(
    harness.customerPortalRoute.GET(
      new Request(
        `http://localhost/api/customer-saved-bookings?booking_reference=${encodeURIComponent(
          fixture.bookingReference,
        )}&limit=1&page=1`,
        {
          headers: customerHeaders(fixture.sessionToken),
          method: "GET",
        },
      ),
    ),
    403,
    "post-rollback customer portal blocked",
  );
  await expectStatus(
    harness.customerAppRoute.GET(
      new Request(
        `http://localhost/api/customer-app-notifications?booking_reference=${encodeURIComponent(
          fixture.bookingReference,
        )}&limit=1`,
        {
          headers: customerInAppHeaders(fixture.sessionToken),
          method: "GET",
        },
      ),
    ),
    403,
    "post-rollback customer in-app blocked",
  );

  return {
    admin_send_in_app_status: adminPost.status,
    customer_in_app_projection: customerNotificationProjection,
    customer_in_app_read_status: customerNotificationRead.status,
    out_of_scope_portal_rows: outOfScopeBody.saved_bookings.length,
    portal_projection: portalProjection,
    portal_read_status: portalRead.status,
  };
}

function safeUnexpectedDiagnostic(error) {
  const message = String(error?.message || error || "unknown").replace(
    /https:\/\/[a-z0-9.-]+\.supabase\.co|eyJ[A-Za-z0-9._-]+|[A-Za-z0-9+/=]{32,}/g,
    "[redacted]",
  );

  return {
    message: message.slice(0, 240),
    name: String(error?.name || "Error").slice(0, 80),
  };
}

async function main() {
  if (process.env[approvalEnvName] !== approvalValue) {
    failSafely("small_allowlist_customer_production_pilot_not_approved", {
      requiredApprovalEnvName: approvalEnvName,
      requiredApprovalValue: approvalValue,
    });
  }

  const validation = await loadAndValidateEnv();
  applyBaseEnv(validation.env);
  closeRuntimeGates();

  const client = createSupabaseClientFromEnv();
  const targets = await findSmallAllowlistTargets(client);
  const customerAccountAllowlist = targets
    .map((target) => target.customerAccountReference)
    .join(",");
  const fixtures = targets.map((target) => ({
    authUserId: randomUUID(),
    bookingReference: target.bookingReference,
    customerAccountAllowlist,
    customerAccountReference: target.customerAccountReference,
    eventKey: `small-allowlist-customer-production-${randomUUID()}`,
    issueToken: `small-allowlist-issue-${randomUUID()}-${randomUUID()}`,
    sessionToken: `small-allowlist-session-${randomUUID()}-${randomUUID()}`,
  }));
  const createdFixtures = [];
  const harness = await loadHarness();

  try {
    await writeLiveAttemptMarker();

    const proofs = [];
    const cleanups = [];

    for (const fixture of fixtures) {
      await createAccessMapping(client, fixture);
      createdFixtures.push(fixture);

      const proof = await runRouteProofs(harness, fixture);
      proofs.push(proof);
      await cleanupPilotRows(client, fixture);
      const cleanup = await verifyZeroRows(client, fixture);
      cleanups.push(cleanup);

      if (!cleanup.zero_matching_rows) {
        failSafely("small_allowlist_customer_production_pilot_cleanup_zero_row_failed");
      }
    }

    emitEvidence({
      booking_scope: "exactly two latest active small-allowlist production customer bookings",
      cleanup: {
        all_zero_matching_rows: cleanups.every((cleanup) => cleanup.zero_matching_rows),
        checked_customer_count: cleanups.length,
        total_access_mapping_rows_remaining: cleanups.reduce(
          (sum, cleanup) => sum + cleanup.access_mapping_rows_remaining,
          0,
        ),
        total_notification_rows_remaining: cleanups.reduce(
          (sum, cleanup) => sum + cleanup.notification_rows_remaining,
          0,
        ),
      },
      db_write_scope: [
        "one temporary customer_access_accounts mapping per allowlisted customer",
        "one temporary customer_app notification row per allowlisted customer",
      ],
      env: {
        checkedEnvCandidates: validation.checked,
        envFileName: validation.envFileName,
        requiredBaseEnvNames: requiredBaseEnvKeys,
        runtimeGateEnvNames,
        valuesPrinted: false,
      },
      evidence_reference: `SMALL-ALLOWLIST-CUSTOMER-PRODUCTION-PILOT-${new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, "")
        .slice(0, 14)}`,
      fullProjectRefPrinted: false,
      gates_closed_after: true,
      gates_opened_in_process_only: true,
      google_maps_onemap_flightaware_calls: false,
      maskedProductionProjectRef: validation.maskedProjectRef,
      noBillingPaymentPdfPayout: true,
      noCustomerPrivateDataPrinted: true,
      noProviderSends: true,
      noRealCustomerRowsDeleted: true,
      noSecretsPrinted: true,
      ok: true,
      productionDbTouched: true,
      providerSends: false,
      proof: {
        admin_send_in_app_statuses: proofs.map((proof) => proof.admin_send_in_app_status),
        customer_in_app_read_statuses: proofs.map((proof) => proof.customer_in_app_read_status),
        customer_count: proofs.length,
        out_of_scope_portal_rows_total: proofs.reduce(
          (sum, proof) => sum + proof.out_of_scope_portal_rows,
          0,
        ),
        portal_read_statuses: proofs.map((proof) => proof.portal_read_status),
        safe_customer_in_app_projection: proofs.every(
          (proof) => proof.customer_in_app_projection?.safe_fields_only === true,
        ),
        safe_portal_projection: proofs.every(
          (proof) => proof.portal_projection?.safe_fields_only === true,
        ),
      },
      rowIdsPrinted: false,
      stage: "small-allowlist-customer-runtime-production-pilot",
      target_label: targetLabel,
    });
  } finally {
    closeRuntimeGates();
    for (const fixture of createdFixtures) {
      await cleanupPilotRows(client, fixture).catch(() => undefined);
    }
    await harness.cleanup();
  }
}

main().catch((error) => {
  closeRuntimeGates();

  if (error instanceof SafeFailure) {
    emitEvidence({
      error: error.code,
      gates_closed_after: true,
      ok: false,
      stage: "small-allowlist-customer-runtime-production-pilot",
      ...error.extra,
    });
    process.exit(1);
  }

  emitEvidence({
    diagnostic: safeUnexpectedDiagnostic(error),
    error: "unexpected_small_allowlist_customer_production_pilot_failure_sanitized",
    gates_closed_after: true,
    ok: false,
    stage: "small-allowlist-customer-runtime-production-pilot",
  });
  process.exit(1);
});
