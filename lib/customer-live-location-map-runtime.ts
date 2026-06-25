import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  customerLiveLocationMapScaffoldVersion,
  readCustomerLiveLocationMapGateState,
} from "./customer-live-location-map-scaffold";
import { resolveExactTwoCustomerRuntimeSessionMap } from "./customer-runtime-session-map";

export const customerLiveLocationMapRuntimeVersion =
  "customer-live-location-map-runtime:v1";

type CustomerLiveLocationMapEnv = Record<string, string | undefined>;
type UnknownRecord = Record<string, unknown>;
type CustomerLiveLocationMapClient = Pick<SupabaseClient, "from">;

type CustomerLiveLocationMapBoundary = {
  bookingReferencePresent: boolean;
  ok: boolean;
  sameOrigin: boolean;
  sessionPresent: boolean;
};

const latestPositionsTable = "driver_live_location_latest_positions";
const runtimeSettingsTable = "driver_live_location_runtime_settings";
const runtimeSettingName = "driver_live_location_runtime";
const customerAccessAccountsTable = "customer_access_accounts";
const bookingsTable = "bookings";
const allowedRuntimeModes = new Set(["evidence", "runtime"]);
const eligibleServiceFamilies = new Set(["dep", "departure", "trf", "transfer", "dsp", "hourly"]);
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxRuntimeAllowedReferences = 50;
const maxControlledCustomerRuntimeAllowlistEntries = 5;
const supportedCustomerRuntimeSessionMapEntryCounts = new Set([2, 3, 5]);
const forbiddenSafeTextPattern =
  /api[_ -]?key|billing|cookie|customer[_ -]?email|customer[_ -]?phone|customer[_ -]?price|debug|driver[_ -]?payout|finance|internal|invoice|jwt|parser|password|payment|paynow|payout|pdf|raw[_ -]?token|secret|service[_ -]?role|token[_ -]?hash/i;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;

let customerLiveLocationMapClientForTests: CustomerLiveLocationMapClient | null =
  null;

export function setCustomerLiveLocationMapRuntimeClientForTests(
  client: CustomerLiveLocationMapClient | null,
) {
  customerLiveLocationMapClientForTests = client;
}

function envValue(env: CustomerLiveLocationMapEnv, key: string) {
  return env[key]?.trim() || "";
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed && !placeholderConfigPattern.test(trimmed) ? trimmed : null;
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function cleanText(value: unknown, maxLength = 160) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength || forbiddenSafeTextPattern.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function safeReference(value: unknown) {
  const cleaned = cleanText(value, 120);

  return safeReferencePattern.test(cleaned) ? cleaned : "";
}

function safeUuid(value: unknown) {
  const cleaned = cleanText(value, 80);

  return uuidPattern.test(cleaned) ? cleaned : "";
}

function validServerCredential(value: string | null) {
  if (!value || placeholderConfigPattern.test(value) || value.includes("|") || value.includes(";")) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    value.trim().length >= 24 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public") &&
    !forbiddenSafeTextPattern.test(normalized)
  );
}

function allowedReferencesFromEnv(env: CustomerLiveLocationMapEnv, key: string) {
  return [
    ...new Set(
      envValue(env, key)
        .split(/[,\n\s]+/)
        .map((value) => safeReference(value))
        .filter(Boolean),
    ),
  ];
}

function uniqueSafeReferences(values: unknown[]) {
  return [...new Set(values.map(safeReference).filter(Boolean))].slice(
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

function controlledCustomerRuntimeAccountAllowlist(env: CustomerLiveLocationMapEnv) {
  const raw = configValueOrNull(
    env.PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST,
  );

  if (!raw) {
    return [];
  }

  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((entry) => safeReference(entry))
        .filter(Boolean),
    ),
  ].slice(0, maxControlledCustomerRuntimeAllowlistEntries);
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

function boundedOptionalNumber(value: unknown, min: number, max: number) {
  const numberValue = asFiniteNumber(value);

  if (numberValue === null) {
    return null;
  }

  return numberValue >= min && numberValue <= max ? numberValue : null;
}

function positiveIntegerEnv(
  env: CustomerLiveLocationMapEnv,
  key: string,
  fallback: number,
) {
  const parsed = Number(envValue(env, key));

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function booleanSettingOpen(value: unknown) {
  return value === true || value === "true";
}

function runtimeSettingNumber(value: unknown, min: number, max: number) {
  const parsed = asFiniteNumber(value);

  if (parsed === null || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed >= min && parsed <= max ? parsed : null;
}

function blockedResult(reason: string, status: number) {
  return {
    body: {
      customerVisible: false,
      external_send: false,
      gpsCaptureEnabled: false,
      liveMapEnabled: false,
      locationStorageEnabled: false,
      map_rendered: false,
      marker_count: 0,
      no_op: true,
      ok: false,
      reason,
      version: customerLiveLocationMapRuntimeVersion,
    },
    status,
  };
}

function runtimeGateOpen(env: CustomerLiveLocationMapEnv) {
  const gateState = readCustomerLiveLocationMapGateState(env);
  const driverRuntimeMode = envValue(env, "PRESTIGE_DRIVER_LIVE_LOCATION_MODE").toLowerCase();

  return (
    (gateState.live_map_gate_configured && allowedRuntimeModes.has(gateState.mode)) ||
    driverRuntimeMode === "runtime"
  );
}

function runtimeClient(env: CustomerLiveLocationMapEnv) {
  if (customerLiveLocationMapClientForTests) {
    return {
      client: customerLiveLocationMapClientForTests,
      ok: true,
    } as const;
  }

  const supabaseUrl = envValue(env, "SUPABASE_URL");
  const serviceRoleKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      reason: "customer_live_location_map_runtime_config_not_ready",
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
      reason: "customer_live_location_map_runtime_config_not_ready",
    } as const;
  }
}

function customerHeaders(request: Request) {
  return {
    accountReference:
      safeReference(request.headers.get("x-prestige-customer-account-reference")) ||
      safeReference(request.headers.get("x-prestige-customer-account")),
    bookingReference: safeReference(
      new URL(request.url).searchParams.get("booking_reference"),
    ),
    sessionPresent: Boolean(
      request.headers.get("x-prestige-customer-session-token")?.trim(),
    ),
    sessionToken: request.headers.get("x-prestige-customer-session-token")?.trim() || "",
  };
}

function customerRuntimeGateMode(env: CustomerLiveLocationMapEnv) {
  const gateState = readCustomerLiveLocationMapGateState(env);

  if (gateState.live_map_gate_configured && allowedRuntimeModes.has(gateState.mode)) {
    return gateState.mode;
  }

  if (envValue(env, "PRESTIGE_DRIVER_LIVE_LOCATION_MODE").toLowerCase() === "runtime") {
    return "runtime";
  }

  return "closed";
}

function customerSavedBookingsAuthEnabled(env: CustomerLiveLocationMapEnv) {
  return (
    env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED === "true" &&
    envValue(env, "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE") === "server-session-token"
  );
}

function normalizeLatestPosition(row: UnknownRecord) {
  const latitude = asFiniteNumber(row.latitude);
  const longitude = asFiniteNumber(row.longitude);
  const bookingReference = safeReference(row.booking_reference);
  const sharingState = cleanText(row.sharing_state, 40) || "active";
  const staleAfter = cleanText(row.stale_after, 80);
  const capturedAt = cleanText(row.captured_at, 80) || null;
  const updatedAt = cleanText(row.updated_at, 80) || null;

  if (!bookingReference || latitude === null || longitude === null || !staleAfter) {
    return null;
  }

  const staleAt = new Date(staleAfter).getTime();
  const isStale = Number.isFinite(staleAt) ? Date.now() >= staleAt : true;
  const driverLocationStatus =
    sharingState !== "active" ? "not_sharing" : isStale ? "offline" : "live";

  return {
    accuracy_meters: boundedOptionalNumber(row.accuracy_meters, 0, 10000),
    booking_reference_label: "scoped",
    captured_at: capturedAt,
    driver_location_status: driverLocationStatus,
    heading_degrees: boundedOptionalNumber(row.heading_degrees, 0, 359.99),
    is_stale: isStale,
    latitude,
    longitude,
    sharing_state: sharingState,
    speed_meters_per_second: boundedOptionalNumber(
      row.speed_meters_per_second,
      0,
      120,
    ),
    stale_after: staleAfter,
    updated_at: updatedAt,
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

function assertRuntimeScope({
  accountReference,
  bookingReference,
  env,
}: {
  accountReference: string;
  bookingReference: string;
  env: CustomerLiveLocationMapEnv;
}) {
  const allowedAccounts = allowedReferencesFromEnv(
    env,
    "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ACCOUNT_ALLOWLIST",
  );
  const allowedBookings = allowedReferencesFromEnv(
    env,
    "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_BOOKING_REFERENCES",
  );

  if (allowedAccounts.length === 0 || allowedBookings.length === 0) {
    return {
      ok: false,
      reason: "customer_live_location_map_runtime_config_not_ready",
      status: 503,
    } as const;
  }

  if (
    !accountReference ||
    !bookingReference ||
    !allowedAccounts.includes(accountReference) ||
    !allowedBookings.includes(bookingReference)
  ) {
    return {
      ok: false,
      reason: "customer_live_location_map_scope_blocked",
      status: 403,
    } as const;
  }

  return {
    ok: true,
  } as const;
}

type CustomerLiveLocationRuntimePolicy = {
  accountReference: string;
  allowedBookingReferences: string[];
  source: "app_side_runtime_setting" | "env_evidence";
  staleAfterSeconds: number;
};

type CustomerLiveLocationRuntimePolicyResult =
  | {
      ok: true;
      policy: CustomerLiveLocationRuntimePolicy;
    }
  | {
      ok: false;
      reason: string;
      status: number;
    };

function envEvidenceRuntimePolicy({
  accountReference,
  bookingReference,
  env,
}: {
  accountReference: string;
  bookingReference: string;
  env: CustomerLiveLocationMapEnv;
}): CustomerLiveLocationRuntimePolicyResult {
  const scoped = assertRuntimeScope({
    accountReference,
    bookingReference,
    env,
  });

  if (!scoped.ok) {
    return scoped;
  }

  return {
    ok: true,
    policy: {
      accountReference,
      allowedBookingReferences: allowedReferencesFromEnv(
        env,
        "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_BOOKING_REFERENCES",
      ),
      source: "env_evidence",
      staleAfterSeconds: positiveIntegerEnv(
        env,
        "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_STALE_AFTER_SECONDS",
        300,
      ),
    },
  };
}

async function resolveCustomerRuntimeAccountReference({
  client,
  env,
  request,
}: {
  client: CustomerLiveLocationMapClient;
  env: CustomerLiveLocationMapEnv;
  request: Request;
}): Promise<
  | {
      accountReference: string;
      ok: true;
    }
  | {
      ok: false;
      reason: string;
      status: number;
    }
> {
  if (!customerSavedBookingsAuthEnabled(env)) {
    return {
      ok: false,
      reason: "customer_live_location_map_customer_auth_not_ready",
      status: 403,
    };
  }

  const { sessionToken } = customerHeaders(request);
  const accountAllowlist = controlledCustomerRuntimeAccountAllowlist(env);
  const expectedEntryCount = supportedCustomerRuntimeSessionMapEntryCounts.has(
    accountAllowlist.length,
  )
    ? accountAllowlist.length
    : 2;
  const mappedSession = resolveExactTwoCustomerRuntimeSessionMap({
    expectedEntryCount,
    mapValue: env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP,
    providedToken: sessionToken,
  });

  if (mappedSession.configured) {
    if (!mappedSession.ok) {
      return {
        ok: false,
        reason:
          mappedSession.reason === "invalid_config"
            ? "customer_live_location_map_customer_auth_config_not_ready"
            : "customer_live_location_map_customer_auth_blocked",
        status: mappedSession.reason === "invalid_config" ? 503 : 403,
      };
    }

    if (
      accountAllowlist.length > 0 &&
      !accountAllowlist.includes(mappedSession.customer_account_reference)
    ) {
      return {
        ok: false,
        reason: "customer_live_location_map_customer_auth_blocked",
        status: 403,
      };
    }

    return {
      accountReference: mappedSession.customer_account_reference,
      ok: true,
    };
  }

  const expectedToken = configValueOrNull(
    env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN,
  );
  const authUserId = safeUuid(env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID);

  if (
    !validServerCredential(expectedToken) ||
    !sessionToken ||
    sessionToken !== expectedToken ||
    !authUserId
  ) {
    return {
      ok: false,
      reason: "customer_live_location_map_customer_auth_blocked",
      status: 403,
    };
  }

  const { data, error } = await client
    .from(customerAccessAccountsTable)
    .select("customer_account_reference, account_status")
    .eq("auth_user_id", authUserId)
    .eq("account_status", "active")
    .limit(1);

  if (error) {
    return {
      ok: false,
      reason: "customer_live_location_map_customer_auth_config_not_ready",
      status: 503,
    };
  }

  const accountReference = safeReference(
    asRecord(Array.isArray(data) ? data[0] : null).customer_account_reference,
  );

  if (
    !accountReference ||
    (accountAllowlist.length > 0 && !accountAllowlist.includes(accountReference))
  ) {
    return {
      ok: false,
      reason: "customer_live_location_map_customer_auth_blocked",
      status: 403,
    };
  }

  return {
    accountReference,
    ok: true,
  };
}

async function readAppSideRuntimePolicy({
  client,
  env,
  request,
}: {
  client: CustomerLiveLocationMapClient;
  env: CustomerLiveLocationMapEnv;
  request: Request;
}): Promise<CustomerLiveLocationRuntimePolicyResult> {
  const { bookingReference } = customerHeaders(request);

  if (!bookingReference) {
    return {
      ok: false,
      reason: "customer_live_location_map_scope_blocked",
      status: 403,
    };
  }

  const { data, error } = await client
    .from(runtimeSettingsTable)
    .select(
      "setting_name, setting_status, driver_live_location_capture_enabled, admin_active_jobs_map_enabled, driver_live_location_mode, driver_live_location_allowed_job_references, driver_live_location_stale_after_seconds",
    )
    .eq("setting_name", runtimeSettingName)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: "customer_live_location_map_admin_runtime_config_not_ready",
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
  const allowedBookingReferences = allowedReferencesFromUnknown(
    setting.driver_live_location_allowed_job_references,
  );

  if (
    settingStatus !== "active" ||
    settingMode !== "runtime" ||
    !captureOpen ||
    !adminMapOpen
  ) {
    return {
      ok: false,
      reason: "customer_live_location_map_admin_runtime_gate_closed",
      status: 503,
    };
  }

  if (
    allowedBookingReferences.length === 0 ||
    !allowedBookingReferences.includes(bookingReference)
  ) {
    return {
      ok: false,
      reason: "customer_live_location_map_allowed_booking_blocked",
      status: 403,
    };
  }

  const customerAccount = await resolveCustomerRuntimeAccountReference({
    client,
    env,
    request,
  });

  if (!customerAccount.ok) {
    return customerAccount;
  }

  const bookingScope = await verifyCustomerBookingScope({
    accountReference: customerAccount.accountReference,
    bookingReference,
    client,
  });

  if (!bookingScope.ok) {
    return bookingScope;
  }

  return {
    ok: true,
    policy: {
      accountReference: customerAccount.accountReference,
      allowedBookingReferences,
      source: "app_side_runtime_setting",
      staleAfterSeconds:
        runtimeSettingNumber(
          setting.driver_live_location_stale_after_seconds,
          30,
          3600,
        ) ??
        positiveIntegerEnv(
          env,
          "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_STALE_AFTER_SECONDS",
          300,
        ),
    },
  };
}

function serviceFamily(value: unknown) {
  const cleaned = cleanText(value, 80).toLowerCase();

  return cleaned.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)[0] || "";
}

function serviceEligible(row: UnknownRecord) {
  const family =
    serviceFamily(row.route_type) ||
    serviceFamily(row.service_type);

  return eligibleServiceFamilies.has(family);
}

async function verifyCustomerBookingScope({
  accountReference,
  bookingReference,
  client,
}: {
  accountReference: string;
  bookingReference: string;
  client: CustomerLiveLocationMapClient;
}): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
      status: number;
    }
> {
  const { data, error } = await client
    .from(bookingsTable)
    .select("booking_reference, customer_id, route_type, service_type")
    .eq("booking_reference", bookingReference)
    .limit(5);

  if (error) {
    return {
      ok: false,
      reason: "customer_live_location_map_customer_booking_scope_not_ready",
      status: 503,
    };
  }

  const booking =
    (Array.isArray(data) ? data : [])
      .map(asRecord)
      .find((row) => {
        const matchedBookingReference = safeReference(row.booking_reference);
        const matchedAccountReference = safeReference(row.customer_id);

        return (
          matchedBookingReference === bookingReference &&
          matchedAccountReference === accountReference
        );
      }) || {};
  const matchedBookingReference = safeReference(booking.booking_reference);
  const matchedAccountReference = safeReference(booking.customer_id);

  if (
    matchedBookingReference !== bookingReference ||
    matchedAccountReference !== accountReference
  ) {
    return {
      ok: false,
      reason: "customer_live_location_map_booking_account_scope_blocked",
      status: 403,
    };
  }

  if (!serviceEligible(booking)) {
    return {
      ok: false,
      reason: "customer_live_location_map_service_blocked",
      status: 403,
    };
  }

  return {
    ok: true,
  };
}

export async function handleCustomerLiveLocationMapRuntimeRequest({
  boundary,
  env = process.env,
  request,
}: {
  boundary: CustomerLiveLocationMapBoundary;
  env?: CustomerLiveLocationMapEnv;
  request: Request;
}) {
  if (!boundary.ok || !boundary.sameOrigin || !boundary.sessionPresent) {
    return blockedResult("customer_live_location_map_boundary_blocked", 403);
  }

  if (!runtimeGateOpen(env)) {
    return blockedResult("customer_live_location_map_runtime_gate_closed", 503);
  }

  const { accountReference, bookingReference } = customerHeaders(request);

  const clientResult = runtimeClient(env);

  if (!clientResult.ok) {
    return blockedResult(clientResult.reason, 503);
  }

  const runtimeMode = customerRuntimeGateMode(env);
  const policy =
    runtimeMode === "evidence"
      ? envEvidenceRuntimePolicy({
          accountReference,
          bookingReference,
          env,
        })
      : await readAppSideRuntimePolicy({
          client: clientResult.client,
          env,
          request,
        });

  if (!policy.ok) {
    return blockedResult(policy.reason, policy.status);
  }

  const staleAfterSeconds = policy.policy.staleAfterSeconds;
  const { data, error } = await clientResult.client
    .from(latestPositionsTable)
    .select(
      "accuracy_meters, booking_reference, captured_at, heading_degrees, latitude, longitude, sharing_state, speed_meters_per_second, stale_after, updated_at",
    )
    .eq("booking_reference", bookingReference)
    .in("sharing_state", ["active", "stale"])
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    return blockedResult("customer_live_location_map_runtime_config_not_ready", 503);
  }

  const marker = Array.isArray(data)
    ? data.map(asRecord).map(normalizeLatestPosition).filter(isNormalizedLatestPosition)[0] ||
      null
    : null;

  if (!marker) {
    return {
      body: {
        active_driver_marker: null,
        booking_reference_label: "scoped",
        customerVisible: true,
        external_send: false,
        gpsCaptureEnabled: false,
        liveMapEnabled: true,
        locationStorageEnabled: false,
        map_rendered: false,
        marker_count: 0,
        no_op: false,
        ok: true,
        reason: "customer_live_location_map_no_active_position",
        stale_after_seconds: staleAfterSeconds,
        version: customerLiveLocationMapRuntimeVersion,
      },
      status: 200,
    };
  }

  return {
    body: {
      active_driver_marker: marker,
      booking_reference_label: "scoped",
      customerVisible: true,
      customer_surface: "customer_live_location_map_runtime",
      external_send: false,
      gpsCaptureEnabled: false,
      liveMapEnabled: true,
      locationStorageEnabled: false,
      map_rendered: false,
      marker_count: 1,
      no_op: false,
      ok: true,
      stale_after_seconds: staleAfterSeconds,
      version: customerLiveLocationMapRuntimeVersion,
    },
    status: 200,
  };
}

export const customerLiveLocationMapRuntimeContract = {
  bookingsTable,
  customerAccessAccountsTable,
  latestPositionsTable,
  runtimeVersion: customerLiveLocationMapRuntimeVersion,
  runtimeSettingsTable,
  scaffoldVersion: customerLiveLocationMapScaffoldVersion,
};
