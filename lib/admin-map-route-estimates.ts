import "server-only";

import type { AdminBookingResult } from "./admin-booking-persistence";
import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";

export const adminMapRouteEstimateVersion = "stage-admin-map-route-estimate-v1";

export type AdminMapRouteEstimateInput = {
  destination: string;
  origin: string;
  safe_route_context: {
    booking_reference?: string;
    source: "admin_map_route_estimate";
  };
  waypoints: string[];
};

export type AdminMapRouteEstimateResult = {
  distance_meters: number;
  duration_seconds: number;
  encoded_polyline: string | null;
  provider: "google_routes";
  safe_route_context: AdminMapRouteEstimateInput["safe_route_context"] & {
    route_status: "estimated";
  };
  static_duration_seconds: number | null;
  version: typeof adminMapRouteEstimateVersion;
};

type UnknownRecord = Record<string, unknown>;

const googleRoutesEndpoint = "https://routes.googleapis.com/directions/v2:computeRoutes";
const maxLocationTextLength = 240;
const maxBookingReferenceLength = 120;
const maxWaypointCount = 6;
const maxGoogleRoutesResponseBytes = 120000;
const safeMapRouteEstimateDisabledError =
  "Admin map route estimate is not enabled on this server.";
const safeMapRouteEstimateConfigError =
  "Admin map route estimate configuration is not ready.";
const safeMapRouteEstimateActorError =
  "Admin map route estimate requires a verified admin or dispatcher server session.";
const safeMapRouteEstimateProviderError =
  "Admin map route estimate provider failed safely.";
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

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function readGoogleMapsKey() {
  return (
    configValueOrNull(process.env.PRESTIGE_GOOGLE_MAPS_API_KEY) ||
    configValueOrNull(process.env.GOOGLE_MAPS_API_KEY)
  );
}

function parseDurationSeconds(value: unknown) {
  const text = textOrNull(value);
  const match = text?.match(/^(\d+(?:\.\d+)?)s$/);

  return match ? Math.round(Number(match[1])) : null;
}

function safeNonNegativeInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
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

export function parseAdminMapRouteEstimatePayload(
  value: unknown,
): AdminBookingResult<AdminMapRouteEstimateInput> {
  const record = asRecord(value);
  const origin = safeText(record.origin, maxLocationTextLength);
  const destination = safeText(record.destination, maxLocationTextLength);
  const waypoints = asArray(record.waypoints)
    .map((waypoint) => safeText(waypoint, maxLocationTextLength))
    .filter((waypoint): waypoint is string => Boolean(waypoint));
  const bookingReference =
    record.booking_reference === undefined ||
    record.booking_reference === null ||
    record.booking_reference === ""
      ? null
      : safeText(record.booking_reference, maxBookingReferenceLength);

  if (
    !origin ||
    !destination ||
    waypoints.length > maxWaypointCount ||
    waypoints.length !== asArray(record.waypoints).length ||
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
      safe_route_context: {
        ...(bookingReference ? { booking_reference: bookingReference } : {}),
        source: "admin_map_route_estimate",
      },
      waypoints,
    },
    ok: true,
  };
}

function googleWaypoint(address: string) {
  return {
    address,
  };
}

function normalizeGoogleRouteEstimate(
  input: AdminMapRouteEstimateInput,
  value: unknown,
): AdminBookingResult<AdminMapRouteEstimateResult> {
  const route = asRecord(asArray(asRecord(value).routes)[0]);
  const distanceMeters = safeNonNegativeInteger(route.distanceMeters);
  const durationSeconds = parseDurationSeconds(route.duration);

  if (distanceMeters === null || durationSeconds === null) {
    return providerResponseFailure();
  }

  const polyline = safeText(asRecord(route.polyline).encodedPolyline, 16000);

  return {
    data: {
      distance_meters: distanceMeters,
      duration_seconds: durationSeconds,
      encoded_polyline: polyline,
      provider: "google_routes",
      safe_route_context: {
        ...input.safe_route_context,
        route_status: "estimated",
      },
      static_duration_seconds: parseDurationSeconds(route.staticDuration),
      version: adminMapRouteEstimateVersion,
    },
    ok: true,
  };
}

async function readProviderJson(response: Response) {
  const text = await response.text();

  if (text.length > maxGoogleRoutesResponseBytes) {
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

  if (process.env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER !== "google_routes") {
    return {
      error: safeMapRouteEstimateConfigError,
      ok: false,
      status: 503,
    };
  }

  const mapsKey = readGoogleMapsKey();

  if (!mapsKey) {
    return {
      error: safeMapRouteEstimateConfigError,
      ok: false,
      status: 503,
    };
  }

  try {
    const response = await fetch(
      configValueOrNull(process.env.PRESTIGE_GOOGLE_MAPS_ROUTES_ENDPOINT) ||
        googleRoutesEndpoint,
      {
        body: JSON.stringify({
          computeAlternativeRoutes: false,
          destination: {
            address: input.destination,
          },
          intermediates: input.waypoints.map(googleWaypoint),
          languageCode: "en",
          origin: {
            address: input.origin,
          },
          routingPreference: "TRAFFIC_AWARE",
          travelMode: "DRIVE",
          units: "METRIC",
        }),
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": mapsKey,
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline",
        },
        method: "POST",
      },
    );

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
