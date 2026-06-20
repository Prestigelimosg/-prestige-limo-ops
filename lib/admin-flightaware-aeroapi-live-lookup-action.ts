import "server-only";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminFlightAwareAeroApiLiveLookupActionVersion =
  "admin-flightaware-aeroapi-live-lookup-action-v1";
export const adminFlightAwareAeroApiLiveLookupActionEnvGateName =
  "PRESTIGE_FLIGHTAWARE_AEROAPI_LIVE_LOOKUP_ENABLED";
export const adminFlightAwareAeroApiRequiredEnvNames = [
  adminFlightAwareAeroApiLiveLookupActionEnvGateName,
  "FLIGHTAWARE_AEROAPI_API_KEY",
  "FLIGHTAWARE_AEROAPI_BASE_URL",
] as const;

type UnknownRecord = Record<string, unknown>;
type LiveLookupStatus = "blocked" | "failed" | "looked_up" | "rejected";
type LiveLookupReason =
  | "admin_session_required"
  | "flight_lookup_gate_closed"
  | "invalid_input"
  | "lookup_succeeded"
  | "provider_failure"
  | "provider_not_configured"
  | "provider_timeout";

export type AdminFlightAwareAeroApiLiveLookupInput = {
  flight_no?: unknown;
  flightNumber?: unknown;
  service_code?: unknown;
  service_type?: unknown;
};

export type AdminFlightAwareAeroApiNormalizedLookup = {
  customerVisible: false;
  estimatedArrivalIso: string | null;
  flightNumber: string;
  provider: "flightaware_aeroapi";
  scheduledArrivalIso: string | null;
  sourceUpdatedAtIso: string | null;
  status: string | null;
};

export type AdminFlightAwareAeroApiLiveLookupResult = {
  customer_update_enabled: false;
  database_persistence_enabled: false;
  delivery_surface: "admin_flightaware_aeroapi_live_lookup_action";
  env_gate_name: typeof adminFlightAwareAeroApiLiveLookupActionEnvGateName;
  error?: string;
  external_request_enabled: boolean;
  lookup: AdminFlightAwareAeroApiNormalizedLookup | null;
  lookup_enabled: boolean;
  no_op: boolean;
  ok: boolean;
  provider: "flightaware_aeroapi";
  provider_request_count: 0 | 1;
  reason: LiveLookupReason;
  required_env_names: typeof adminFlightAwareAeroApiRequiredEnvNames;
  retry_enabled: false;
  scheduler_enabled: false;
  status: LiveLookupStatus;
  version: typeof adminFlightAwareAeroApiLiveLookupActionVersion;
};

export type FlightAwareAeroApiProviderResponse = {
  json?: () => Promise<unknown>;
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
};

export type AdminFlightAwareAeroApiLiveLookupOptions = {
  providerFetch?: (
    url: string,
    init: {
      headers: Record<string, string>;
      method: "GET";
      signal: AbortSignal;
    },
  ) => Promise<FlightAwareAeroApiProviderResponse>;
  timeoutMs?: number;
};

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const safeBlockedError =
  "FlightAware AeroAPI lookup requires a verified admin or dispatcher session.";
const safeInvalidError =
  "FlightAware AeroAPI lookup requires a valid MNG/Arrival flight number.";
const safeProviderConfigError =
  "FlightAware AeroAPI lookup is not configured on this server.";
const safeProviderFailureError = "FlightAware AeroAPI lookup failed safely.";
const safeProviderTimeoutError = "FlightAware AeroAPI lookup timed out safely.";

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function cleanConfigValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function isPlaceholderConfigValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    placeholderConfigPattern.test(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("change_me") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me") ||
    normalized.includes("your-") ||
    normalized.includes("your_") ||
    normalized.includes("<") ||
    normalized.includes(">")
  );
}

function lookupGateOpen() {
  return process.env[adminFlightAwareAeroApiLiveLookupActionEnvGateName] === "true";
}

function actorCanLookup(actor: AdminBookingPersistenceAdapterActor) {
  return Boolean(
    actor &&
      actor.boundary_mode === "server-session-role-surface" &&
      allowedActorRoles.has(actor.actor_role) &&
      actor.source_surface === "admin_api" &&
      textOrNull(actor.actor_label),
  );
}

function normalizeService(value: unknown) {
  return textOrNull(value)?.toUpperCase() || "";
}

function normalizeFlightNumber(value: unknown) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, "").toUpperCase() || "";

  return /^[A-Z0-9]{2,4}\d{1,5}[A-Z]?$/.test(cleaned) ? cleaned : null;
}

function isoOrNull(value: unknown) {
  const text = textOrNull(value);

  if (!text) {
    return null;
  }

  const parsed = Date.parse(text);

  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeStatus(value: unknown) {
  const text = textOrNull(value);

  return text ? text.slice(0, 80) : null;
}

function serviceAllowed(input: AdminFlightAwareAeroApiLiveLookupInput) {
  const service = normalizeService(input.service_code || input.service_type);

  return service === "MNG" || service === "ARRIVAL";
}

function requestedFlightNumber(input: AdminFlightAwareAeroApiLiveLookupInput) {
  return normalizeFlightNumber(input.flight_no || input.flightNumber);
}

function validProviderBaseUrl(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      hostname.length > 0 &&
      !hostname.includes("localhost") &&
      !hostname.includes("example") &&
      !hostname.includes("placeholder")
    );
  } catch {
    return false;
  }
}

function validProviderToken(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  return value.trim().length >= 12;
}

function safeTimeoutMs(value: number | undefined) {
  return Number.isFinite(value) && value && value >= 1000 && value <= 10000 ? value : 5000;
}

function safeResult(
  overrides: Partial<
    Omit<
      AdminFlightAwareAeroApiLiveLookupResult,
      | "customer_update_enabled"
      | "database_persistence_enabled"
      | "delivery_surface"
      | "env_gate_name"
      | "provider"
      | "required_env_names"
      | "retry_enabled"
      | "scheduler_enabled"
      | "version"
    >
  >,
): AdminFlightAwareAeroApiLiveLookupResult {
  return {
    customer_update_enabled: false,
    database_persistence_enabled: false,
    delivery_surface: "admin_flightaware_aeroapi_live_lookup_action",
    env_gate_name: adminFlightAwareAeroApiLiveLookupActionEnvGateName,
    external_request_enabled: false,
    lookup: null,
    lookup_enabled: false,
    no_op: true,
    ok: false,
    provider: "flightaware_aeroapi",
    provider_request_count: 0,
    reason: "flight_lookup_gate_closed",
    required_env_names: adminFlightAwareAeroApiRequiredEnvNames,
    retry_enabled: false,
    scheduler_enabled: false,
    status: "blocked",
    version: adminFlightAwareAeroApiLiveLookupActionVersion,
    ...overrides,
  };
}

function providerUrl(baseUrl: string, flightNumber: string) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");

  url.pathname = `${basePath}/flights/${encodeURIComponent(flightNumber)}`;
  url.searchParams.set("max_pages", "1");

  return url.toString();
}

function firstFlightRecord(payload: unknown) {
  const record = asRecord(payload);
  const flights = asArray(record.flights);
  const data = asArray(record.data);

  return asRecord(flights[0] || data[0] || record.flight || record);
}

function normalizeProviderPayload(
  payload: unknown,
  fallbackFlightNumber: string,
): AdminFlightAwareAeroApiNormalizedLookup {
  const flight = firstFlightRecord(payload);
  const flightNumber =
    normalizeFlightNumber(flight.ident) ||
    normalizeFlightNumber(flight.flight_number) ||
    normalizeFlightNumber(flight.fa_flight_id) ||
    fallbackFlightNumber;

  return {
    customerVisible: false,
    estimatedArrivalIso:
      isoOrNull(flight.estimated_in) ||
      isoOrNull(flight.estimated_arrival) ||
      isoOrNull(asRecord(flight.arrival).estimated) ||
      null,
    flightNumber,
    provider: "flightaware_aeroapi",
    scheduledArrivalIso:
      isoOrNull(flight.scheduled_in) ||
      isoOrNull(flight.scheduled_arrival) ||
      isoOrNull(asRecord(flight.arrival).scheduled) ||
      null,
    sourceUpdatedAtIso:
      isoOrNull(flight.last_updated) ||
      isoOrNull(flight.updated_at) ||
      isoOrNull(flight.actual_in) ||
      null,
    status: safeStatus(flight.status),
  };
}

function isProviderTimeout(error: unknown) {
  const record = asRecord(error);
  const name = textOrNull(record.name)?.toLowerCase() || "";
  const message = textOrNull(record.message)?.toLowerCase() || "";

  return name.includes("abort") || name.includes("timeout") || message.includes("timeout");
}

export async function executeAdminFlightAwareAeroApiLiveLookupAction(
  input: AdminFlightAwareAeroApiLiveLookupInput,
  actor: AdminBookingPersistenceAdapterActor,
  options?: AdminFlightAwareAeroApiLiveLookupOptions,
): Promise<AdminFlightAwareAeroApiLiveLookupResult> {
  if (!lookupGateOpen()) {
    return safeResult({
      error: "FlightAware AeroAPI lookup gate is closed.",
      reason: "flight_lookup_gate_closed",
      status: "blocked",
    });
  }

  if (!actorCanLookup(actor)) {
    return safeResult({
      error: safeBlockedError,
      reason: "admin_session_required",
      status: "blocked",
    });
  }

  const flightNumber = requestedFlightNumber(input);

  if (!flightNumber || !serviceAllowed(input)) {
    return safeResult({
      error: safeInvalidError,
      reason: "invalid_input",
      status: "rejected",
    });
  }

  const providerToken = cleanConfigValue(process.env.FLIGHTAWARE_AEROAPI_API_KEY);
  const baseUrl = cleanConfigValue(process.env.FLIGHTAWARE_AEROAPI_BASE_URL);

  if (!validProviderToken(providerToken) || !validProviderBaseUrl(baseUrl)) {
    return safeResult({
      error: safeProviderConfigError,
      reason: "provider_not_configured",
      status: "blocked",
    });
  }

  const fetchProvider = options?.providerFetch || fetch;
  const signal = AbortSignal.timeout(safeTimeoutMs(options?.timeoutMs));

  try {
    const response = await fetchProvider(providerUrl(baseUrl as string, flightNumber), {
      headers: {
        Accept: "application/json",
        "x-apikey": providerToken as string,
      },
      method: "GET",
      signal,
    });

    if (!response.ok) {
      return safeResult({
        error: safeProviderFailureError,
        external_request_enabled: true,
        provider_request_count: 1,
        reason: "provider_failure",
        status: "failed",
      });
    }

    const payload = response.json ? await response.json() : {};

    return safeResult({
      external_request_enabled: true,
      lookup: normalizeProviderPayload(payload, flightNumber),
      lookup_enabled: true,
      no_op: false,
      ok: true,
      provider_request_count: 1,
      reason: "lookup_succeeded",
      status: "looked_up",
    });
  } catch (error) {
    return safeResult({
      error: isProviderTimeout(error) ? safeProviderTimeoutError : safeProviderFailureError,
      external_request_enabled: true,
      provider_request_count: 1,
      reason: isProviderTimeout(error) ? "provider_timeout" : "provider_failure",
      status: "failed",
    });
  }
}
