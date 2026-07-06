export const customerPortalDriverTrackingApiPath = "/api/customer-live-location-map";

export type CustomerPortalDriverTrackingResult = {
  accuracyLabel?: string;
  mapEmbedUrl?: string;
  mapUrl?: string;
  message: string;
  status: "available" | "blocked" | "not_ready";
  updatedAt?: string;
};

type UnknownRecord = Record<string, unknown>;
type CustomerPortalDriverTrackingFetch = typeof fetch;

const maxSafeTextLength = 180;
const forbiddenDriverTrackingFragments = [
  "admin_finance",
  "admin_internal_status",
  "admin_note",
  "amount_due",
  "auth_link",
  "billing",
  "contact_email",
  "contact_phone",
  "customer_price",
  "debug",
  "dev_archive",
  "dev_workbench",
  "driver_job_link_id",
  "driver_note",
  "driver_payout",
  "driver_token",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "jwt",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "parser_learning",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "proof",
  "quoted_price",
  "rate_amount",
  "raw_ai",
  "raw_token",
  "refresh_token",
  "secret",
  "server_secret",
  "service_role",
  "session_secret",
  "sms",
  "telegram",
  "token_hash",
  "whatsapp",
];
const driverLiveLocationPendingMessage =
  "Live location appears after the driver presses OTW and shares location.";

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenDriverTrackingFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = maxSafeTextLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned && cleaned.length <= maxLength && !includesForbiddenFragment(cleaned) ? cleaned : "";
}

function boundedCoordinate(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function boundedAccuracy(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10000 ? Math.round(parsed) : null;
}

function validBookingReference(value: string) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(value) && !includesForbiddenFragment(value);
}

export function mapCustomerPortalDriverTrackingPayload(payload: unknown): CustomerPortalDriverTrackingResult {
  const record = asRecord(payload);
  const marker = asRecord(record.active_driver_marker);
  const latitude = boundedCoordinate(marker.latitude, -90, 90);
  const longitude = boundedCoordinate(marker.longitude, -180, 180);
  const markerCount = typeof record.marker_count === "number" ? record.marker_count : Number(record.marker_count);
  const reason = safeText(record.reason, 120);
  const updatedAt = safeText(marker.updated_at, 80) || safeText(marker.captured_at, 80);
  const accuracy = boundedAccuracy(marker.accuracy_meters);

  if (record.ok === true && record.customerVisible === true && markerCount > 0 && latitude !== null && longitude !== null) {
    const query = `${latitude},${longitude}`;

    return {
      accuracyLabel: accuracy === null ? undefined : `Accuracy ${accuracy}m`,
      mapEmbedUrl: `https://www.google.com/maps?q=${query}&z=16&output=embed`,
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${query}`,
      message: "Driver location is available now.",
      status: "available",
      updatedAt: updatedAt || undefined,
    };
  }

  if (record.ok === true && record.customerVisible === true) {
    return {
      message:
        reason === "customer_live_location_map_no_active_position"
          ? "Driver has not shared live location yet."
          : "Driver location is not ready yet.",
      status: "not_ready",
    };
  }

  return {
    message: driverLiveLocationPendingMessage,
    status: "blocked",
  };
}

export async function loadCustomerPortalDriverTracking({
  bookingReference,
  fetcher = fetch,
  signal,
}: {
  bookingReference: string;
  fetcher?: CustomerPortalDriverTrackingFetch;
  signal?: AbortSignal;
}): Promise<CustomerPortalDriverTrackingResult> {
  const safeBookingReference = safeText(bookingReference, 120);

  if (!safeBookingReference || !validBookingReference(safeBookingReference)) {
    return {
      message: "Live location is not available for this booking.",
      status: "blocked",
    };
  }

  try {
    const response = await fetcher(
      `${customerPortalDriverTrackingApiPath}?booking_reference=${encodeURIComponent(safeBookingReference)}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-prestige-customer-purpose": "customer-live-location-map-read",
        },
        signal,
      },
    );

    if (!response.ok) {
      return {
        message: driverLiveLocationPendingMessage,
        status: "blocked",
      };
    }

    return mapCustomerPortalDriverTrackingPayload(await response.json());
  } catch {
    return {
      message: "Live location is not ready yet.",
      status: "not_ready",
    };
  }
}
