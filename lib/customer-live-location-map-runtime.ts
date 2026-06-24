import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  customerLiveLocationMapScaffoldVersion,
  readCustomerLiveLocationMapGateState,
} from "./customer-live-location-map-scaffold";

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
const allowedRuntimeModes = new Set(["evidence", "runtime"]);
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const forbiddenSafeTextPattern =
  /api[_ -]?key|billing|cookie|customer[_ -]?email|customer[_ -]?phone|customer[_ -]?price|debug|driver[_ -]?payout|finance|internal|invoice|jwt|parser|password|payment|paynow|payout|pdf|raw[_ -]?token|secret|service[_ -]?role|token[_ -]?hash/i;

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

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function cleanText(value: unknown, maxLength = 160) {
  if (typeof value !== "string") {
    return "";
  }

  const cleaned = value.replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength || forbiddenSafeTextPattern.test(cleaned)) {
    return "";
  }

  return cleaned;
}

function safeReference(value: unknown) {
  const cleaned = cleanText(value, 120);

  return safeReferencePattern.test(cleaned) ? cleaned : "";
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

  return (
    gateState.live_map_gate_configured && allowedRuntimeModes.has(gateState.mode)
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
  };
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
  const scoped = assertRuntimeScope({
    accountReference,
    bookingReference,
    env,
  });

  if (!scoped.ok) {
    return blockedResult(scoped.reason, scoped.status);
  }

  const clientResult = runtimeClient(env);

  if (!clientResult.ok) {
    return blockedResult(clientResult.reason, 503);
  }

  const staleAfterSeconds = positiveIntegerEnv(
    env,
    "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_STALE_AFTER_SECONDS",
    300,
  );
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
  latestPositionsTable,
  runtimeVersion: customerLiveLocationMapRuntimeVersion,
  scaffoldVersion: customerLiveLocationMapScaffoldVersion,
};
