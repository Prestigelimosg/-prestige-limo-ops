import "server-only";

import type { AdminBookingResult } from "./admin-booking-persistence";
import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";

export const adminMapRouteEstimateVersion = "stage-admin-map-route-estimate-v2";

export type AdminMapRouteType = "cycle" | "drive" | "walk";
export type AdminMapRouteEstimateProvider = "google_maps_routes";

export type AdminMapRouteCoordinate = {
  label: string | null;
  latitude: number;
  longitude: number;
};

export type AdminMapRouteEstimateInput = {
  destination: AdminMapRouteCoordinate;
  origin: AdminMapRouteCoordinate;
  route_type: AdminMapRouteType;
  safe_route_context: {
    booking_reference?: string;
    source: "admin_map_route_estimate";
  };
};

export type AdminMapRouteEstimateResult = {
  distance_meters: number;
  duration_seconds: number;
  encoded_geometry: string | null;
  provider: AdminMapRouteEstimateProvider;
  route_type: AdminMapRouteType;
  safe_route_context: AdminMapRouteEstimateInput["safe_route_context"] & {
    route_status: "estimated";
  };
  version: typeof adminMapRouteEstimateVersion;
};

type UnknownRecord = Record<string, unknown>;

const googleMapsRoutesEndpoint = "https://routes.googleapis.com/directions/v2:computeRoutes";
const maxLocationLabelLength = 240;
const maxBookingReferenceLength = 120;
const maxMapProviderRouteResponseBytes = 120000;
const singaporeLatitudeMin = 1.1;
const singaporeLatitudeMax = 1.5;
const singaporeLongitudeMin = 103.5;
const singaporeLongitudeMax = 104.2;
const safeMapRouteEstimateDisabledError =
  "Admin map route estimate is not enabled on this server.";
const safeMapRouteEstimateConfigError =
  "Admin map route estimate configuration is not ready.";
const safeMapRouteEstimateActorError =
  "Admin map route estimate requires a verified admin or dispatcher server session.";
const safeMapRouteEstimateProviderError =
  "Admin map route estimate provider failed safely.";
const allowedRouteTypes = new Set<AdminMapRouteType>(["cycle", "drive", "walk"]);
const forbiddenMapRouteEstimateFragments = [
  "amount_due",
  "auth_link",
  "bank_account",
  "card_number",
  "contact_email",
  "contact_phone",
  "customer_auth",
  "customer_charge",
  "customer_email",
  "customer_phone",
  "customer_price",
  "dev_workbench",
  "driver_auth",
  "driver_payout",
  "email_send",
  "fare_amount",
  "finance",
  "finance_note",
  "full_invoice_number",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "invoice_number",
  "invoice_pdf",
  "live_location",
  "mock_archive",
  "mock_qa",
  "notification",
  "paid_amount",
  "passenger_email",
  "passenger_phone",
  "payment",
  "payment_link",
  "payment_status",
  "paynow",
  "pay_now",
  "pdf",
  "pdf_link",
  "payout",
  "payout_comparison",
  "proof",
  "photo",
  "quoted_price",
  "rate_amount",
  "raw_ai",
  "raw_parser_prompt",
  "service_role",
  "server_secret",
  "secret",
  "send_log",
  "send_state",
  "sms_send",
  "stripe",
  "telegram",
  "token",
  "whatsapp_send",
];

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

  const trimmed = String(value).trim();

  return trimmed ? trimmed : null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenMapRouteEstimateFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenMapRouteEstimateFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > maxLength || includesForbiddenMapRouteEstimateFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function optionalSafeText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return safeText(value, maxLength);
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function readGoogleMapsApiKey() {
  return configValueOrNull(process.env.PRESTIGE_GOOGLE_MAPS_API_KEY);
}

function selectedRouteEstimateProvider(): AdminMapRouteEstimateProvider | null {
  const provider = configValueOrNull(process.env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER);

  return provider === "google_maps_routes" ? provider : null;
}

function safeNonNegativeInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function safeFiniteCoordinate(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function validLatitude(value: unknown) {
  const parsed = safeFiniteCoordinate(value);

  return parsed !== null && parsed >= singaporeLatitudeMin && parsed <= singaporeLatitudeMax
    ? parsed
    : null;
}

function validLongitude(value: unknown) {
  const parsed = safeFiniteCoordinate(value);

  return parsed !== null && parsed >= singaporeLongitudeMin && parsed <= singaporeLongitudeMax
    ? parsed
    : null;
}

function validRouteType(value: unknown): AdminMapRouteType | null {
  const cleaned = textOrNull(value)?.toLowerCase();

  return cleaned && allowedRouteTypes.has(cleaned as AdminMapRouteType)
    ? (cleaned as AdminMapRouteType)
    : null;
}

function providerResponseFailure(): AdminBookingResult<AdminMapRouteEstimateResult> {
  return {
    error: safeMapRouteEstimateProviderError,
    ok: false,
    status: 502,
  };
}

function validateActor(
  actor: AdminDispatcherBoundaryContext,
): AdminBookingResult<null> {
  if (
    actor.mode !== "server-session-role-surface" ||
    !["admin", "dispatcher"].includes(actor.role) ||
    !safeText(actor.actorLabel, 160)
  ) {
    return {
      error: safeMapRouteEstimateActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function parseCoordinate(
  record: UnknownRecord,
  prefix: "destination" | "origin",
): AdminMapRouteCoordinate | null {
  const nested = asRecord(record[prefix]);
  const latitude = validLatitude(nested.latitude ?? record[`${prefix}_latitude`]);
  const longitude = validLongitude(nested.longitude ?? record[`${prefix}_longitude`]);
  const label = optionalSafeText(nested.label ?? record[`${prefix}_label`], maxLocationLabelLength);

  if (
    latitude === null ||
    longitude === null ||
    ((nested.label ?? record[`${prefix}_label`]) && !label)
  ) {
    return null;
  }

  return {
    label,
    latitude,
    longitude,
  };
}

export function parseAdminMapRouteEstimatePayload(
  value: unknown,
): AdminBookingResult<AdminMapRouteEstimateInput> {
  const record = asRecord(value);
  const origin = parseCoordinate(record, "origin");
  const destination = parseCoordinate(record, "destination");
  const routeType = validRouteType(record.route_type) || "drive";
  const bookingReference =
    record.booking_reference === undefined ||
    record.booking_reference === null ||
    record.booking_reference === ""
      ? null
      : safeText(record.booking_reference, maxBookingReferenceLength);

  if (
    !origin ||
    !destination ||
    (record.route_type && !validRouteType(record.route_type)) ||
    (record.booking_reference && !bookingReference)
  ) {
    return {
      error: "Admin map route estimate details are malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      destination,
      origin,
      route_type: routeType,
      safe_route_context: {
        ...(bookingReference ? { booking_reference: bookingReference } : {}),
        source: "admin_map_route_estimate",
      },
    },
    ok: true,
  };
}

function parseGoogleDurationSeconds(value: unknown) {
  if (typeof value === "number") {
    return safeNonNegativeInteger(value);
  }

  const text = textOrNull(value);
  const match = text?.match(/^(\d+)s$/);

  return match ? safeNonNegativeInteger(match[1]) : null;
}

function googleTravelMode(routeType: AdminMapRouteType) {
  if (routeType === "walk") {
    return "WALK";
  }

  if (routeType === "cycle") {
    return "TWO_WHEELER";
  }

  return "DRIVE";
}

function normalizeGoogleRouteEstimate(
  input: AdminMapRouteEstimateInput,
  value: unknown,
): AdminBookingResult<AdminMapRouteEstimateResult> {
  const record = asRecord(value);
  const route = asRecord(asArray(record.routes)[0]);
  const distanceMeters = safeNonNegativeInteger(route.distanceMeters);
  const durationSeconds = parseGoogleDurationSeconds(route.duration);
  const polyline = asRecord(route.polyline);

  if (distanceMeters === null || durationSeconds === null) {
    return providerResponseFailure();
  }

  return {
    data: {
      distance_meters: distanceMeters,
      duration_seconds: durationSeconds,
      encoded_geometry: optionalSafeText(polyline.encodedPolyline, 50000),
      provider: "google_maps_routes",
      route_type: input.route_type,
      safe_route_context: {
        ...input.safe_route_context,
        route_status: "estimated",
      },
      version: adminMapRouteEstimateVersion,
    },
    ok: true,
  };
}

async function readProviderJson(response: Response) {
  const text = await response.text();

  if (text.length > maxMapProviderRouteResponseBytes) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function estimateAdminMapRoute(
  input: AdminMapRouteEstimateInput,
  actor: AdminDispatcherBoundaryContext,
): Promise<AdminBookingResult<AdminMapRouteEstimateResult>> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED !== "true") {
    return {
      error: safeMapRouteEstimateDisabledError,
      ok: false,
      status: 503,
    };
  }

  const provider = selectedRouteEstimateProvider();

  if (!provider) {
    return {
      error: safeMapRouteEstimateConfigError,
      ok: false,
      status: 503,
    };
  }

  const googleMapsApiKey = readGoogleMapsApiKey();

  if (!googleMapsApiKey) {
    return {
      error: safeMapRouteEstimateConfigError,
      ok: false,
      status: 503,
    };
  }

  try {
    const url =
      configValueOrNull(process.env.PRESTIGE_GOOGLE_MAPS_ROUTE_ENDPOINT) ||
      googleMapsRoutesEndpoint;
    const response = await fetch(url, {
      body: JSON.stringify({
        computeAlternativeRoutes: false,
        destination: {
          location: {
            latLng: {
              latitude: input.destination.latitude,
              longitude: input.destination.longitude,
            },
          },
        },
        origin: {
          location: {
            latLng: {
              latitude: input.origin.latitude,
              longitude: input.origin.longitude,
            },
          },
        },
        routingPreference: "TRAFFIC_UNAWARE",
        travelMode: googleTravelMode(input.route_type),
        units: "METRIC",
      }),
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": googleMapsApiKey,
        "x-goog-fieldmask":
          "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
      },
      method: "POST",
    });

    if (!response.ok) {
      return providerResponseFailure();
    }

    const providerJson = await readProviderJson(response);

    if (!providerJson) {
      return providerResponseFailure();
    }

    return normalizeGoogleRouteEstimate(input, providerJson);
  } catch {
    return providerResponseFailure();
  }
}
