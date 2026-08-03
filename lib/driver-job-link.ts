import { createHash, randomBytes } from "node:crypto";
import { driverJobStatusDisplayLabels } from "./driver-job-status-workflow.ts";

export {
  guardDriverJobStatusTransition,
  validateDriverJobStatusUpdate,
  type DriverJobStatusTransitionGuardResult,
  type DriverJobStatusUpdate,
} from "./driver-job-status-workflow.ts";

export const defaultDriverJobLinkTokenByteLength = 32;
export const defaultDriverJobLinkTtlHours = 96;
export const defaultDriverJobLinkMaxFutureHours = defaultDriverJobLinkTtlHours;

export type DriverJobBookingLike = Record<string, unknown>;

export type SafeDriverJobPayload = {
  acknowledged: boolean;
  reference: string;
  pickupDate: string;
  pickupTime: string;
  pickupDateTime: string;
  bookingType: string;
  bookingTypeLabel: string;
  pickupLocation: string;
  dropoffLocation: string;
  route: string;
  scheduleUpdatedAt?: string;
  waypoints: string[];
  flightNumber: string;
  passengerName: string;
  status: string;
  statusHistory: SafeDriverJobStatusHistoryItem[];
  statusLabel: string;
  assignedDriver: {
    name: string;
    contact: string;
    plate: string;
    vehicleModel: string;
  };
};

export type SafeDriverJobStatusHistoryItem = {
  occurredAt: string;
  safeNote: string | null;
  status: string;
  statusLabel: string;
};

const bookingTypeLabels: Record<string, string> = {
  DEP: "Departure",
  DSP: "Hourly",
  MNG: "Arrival",
  TRF: "City Transfer",
};

const statusLabels: Record<string, string> = {
  assigned: "Assigned",
  confirmed: "Confirmed",
  ...driverJobStatusDisplayLabels,
};
const unsafeStatusHistoryFragments = [
  "amount_due",
  "billing",
  "customer_charge",
  "customer_price",
  "debug",
  "driver_payout",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_note",
  "invoice",
  "live_location",
  "mock_archive",
  "payment",
  "pay_now",
  "paynow",
  "pdf",
  "photo",
  "payout",
  "proof",
  "quoted_price",
  "rate_amount",
  "secret",
  "service_role",
  "token",
];

export function generateDriverJobLinkToken(byteLength = defaultDriverJobLinkTokenByteLength) {
  if (!Number.isInteger(byteLength) || byteLength < 16) {
    throw new Error("Driver job link token must use at least 16 random bytes.");
  }

  return randomBytes(byteLength).toString("base64url");
}

export function hashDriverJobLinkToken(token: string) {
  const cleanToken = clean(token);

  if (!cleanToken) {
    throw new Error("Driver job link token is required before hashing.");
  }

  return createHash("sha256").update(cleanToken, "utf8").digest("hex");
}

export function getDriverJobLinkExpiresAt(
  createdAt: Date | string | number = new Date(),
  ttlHours = defaultDriverJobLinkTtlHours,
) {
  const createdTime = new Date(createdAt).getTime();

  if (!Number.isFinite(createdTime)) {
    throw new Error("Driver job link expiry requires a valid created-at time.");
  }

  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error("Driver job link TTL must be greater than zero hours.");
  }

  return new Date(createdTime + ttlHours * 60 * 60 * 1000);
}

export function isDriverJobLinkExpired(
  expiresAt: Date | string | number,
  now: Date | string | number = new Date(),
) {
  const expiresTime = new Date(expiresAt).getTime();
  const nowTime = new Date(now).getTime();

  if (!Number.isFinite(expiresTime) || !Number.isFinite(nowTime)) {
    return true;
  }

  return nowTime >= expiresTime;
}

export function isDriverJobLinkExpiryOutsideAllowedWindow(
  expiresAt: Date | string | number,
  now: Date | string | number = new Date(),
  maxFutureHours = defaultDriverJobLinkMaxFutureHours,
) {
  const expiresTime = new Date(expiresAt).getTime();
  const nowTime = new Date(now).getTime();

  if (
    !Number.isFinite(expiresTime) ||
    !Number.isFinite(nowTime) ||
    !Number.isFinite(maxFutureHours) ||
    maxFutureHours <= 0
  ) {
    return true;
  }

  return expiresTime - nowTime > maxFutureHours * 60 * 60 * 1000;
}

export function mapBookingToSafeDriverJobPayload(booking: DriverJobBookingLike): SafeDriverJobPayload {
  const jobCard = rawStringField(booking, "job_card", "jobCard");
  const routeFromRecord = stringField(booking, "route");
  const routeFromJobCard = getJobCardRouteLine(jobCard);
  const route = routeFromRecord || routeFromJobCard;
  const routePoints = splitRoutePoints(route);
  const pickupLocation =
    stringField(booking, "pickup_address", "pickupLocation", "pickup") || routePoints[0] || "";
  const dropoffLocation =
    stringField(booking, "dropoff_address", "dropoffLocation", "dropoff") ||
    routePoints[routePoints.length - 1] ||
    "";
  const fallbackRoute = [pickupLocation, dropoffLocation].filter(Boolean).join(" > ");
  const safeRoute = route || fallbackRoute;
  const safeRoutePoints = splitRoutePoints(safeRoute);
  const pickupDate = stringField(booking, "pickup_date", "pickupDate", "date");
  const pickupTime = stringField(booking, "pickup_time", "pickupTime", "time");
  const pickupDateTime =
    stringField(booking, "pickup_datetime", "pickupDateTime") ||
    getJobCardDateTimeLine(jobCard) ||
    [pickupDate, pickupTime].filter(Boolean).join(", ");
  const bookingType = stringField(booking, "booking_type", "bookingType").toUpperCase();
  const status = stringField(booking, "status") || "pending";

  return {
    acknowledged: Boolean(stringField(booking, "driver_acknowledged_at", "driverAcknowledgedAt")),
    reference: stringField(booking, "public_reference", "driver_job_reference", "reference"),
    pickupDate,
    pickupTime,
    pickupDateTime,
    bookingType,
    bookingTypeLabel: bookingTypeLabels[bookingType] || bookingType,
    pickupLocation,
    dropoffLocation,
    route: safeRoute,
    scheduleUpdatedAt: stringField(
      booking,
      "schedule_updated_at",
      "scheduleUpdatedAt",
      "updated_at",
      "updatedAt",
    ),
    waypoints: safeRoutePoints.length >= 3 ? safeRoutePoints.slice(1, -1) : [],
    flightNumber: stringField(booking, "flight_no", "flightNumber", "flight"),
    passengerName: getPassengerName(booking, jobCard),
    status,
    statusHistory: safeStatusHistory(booking.statusHistory),
    statusLabel: statusLabels[status.toLowerCase()] || status,
    assignedDriver: {
      name: stringField(booking, "driver_name", "driverName"),
      contact: stringField(booking, "driver_contact", "driverContact"),
      plate: stringField(booking, "driver_plate_number", "driverPlate", "plate"),
      vehicleModel: stringField(booking, "driver_vehicle_model", "driverVehicleModel"),
    },
  };
}

function safeStatusHistory(value: unknown): SafeDriverJobStatusHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const status = safeStatusHistoryText(item.status, 80).toLowerCase();
      const statusLabel =
        safeStatusHistoryText(item.statusLabel, 80) ||
        statusLabels[status] ||
        "";

      return {
        occurredAt: safeStatusHistoryText(item.occurredAt, 80),
        safeNote: safeStatusHistoryText(item.safeNote, 500) || null,
        status,
        statusLabel,
      };
    })
    .filter((item) => item.status && item.statusLabel && item.occurredAt)
    .slice(0, 10);
}

function safeStatusHistoryText(value: unknown, maxLength: number) {
  const cleaned = clean(value);
  const normalized = cleaned
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();

  if (
    !cleaned ||
    cleaned.length > maxLength ||
    unsafeStatusHistoryFragments.some((fragment) => normalized.includes(fragment))
  ) {
    return "";
  }

  return cleaned;
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringField(record: DriverJobBookingLike, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const cleanedValue = clean(value);

    if (cleanedValue) {
      return cleanedValue;
    }
  }

  return "";
}

function rawStringField(record: DriverJobBookingLike, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (value !== null && value !== undefined) {
      const text = String(value).trim();

      if (text) {
        return text;
      }
    }
  }

  return "";
}

function nestedStringField(record: DriverJobBookingLike, objectKey: string, valueKey: string) {
  const nestedRecord = asRecord(record[objectKey]);

  return nestedRecord ? stringField(nestedRecord, valueKey) : "";
}

function splitRoutePoints(route: string) {
  return route
    .split(/\s*>\s*/)
    .map((point) => clean(point))
    .filter(Boolean);
}

function getJobCardRouteLine(jobCard: string) {
  return jobCard
    .split(/\r?\n/)
    .map((line) => clean(line))
    .find((line) => line.includes(">")) || "";
}

function getJobCardDateTimeLine(jobCard: string) {
  const lines = jobCard
    .split(/\r?\n/)
    .map((line) => clean(line))
    .filter(Boolean);

  return lines[1] || "";
}

function getPassengerName(booking: DriverJobBookingLike, jobCard: string) {
  const directPassenger =
    stringField(booking, "passenger_name", "passengerName", "name") ||
    nestedStringField(booking, "travelers", "traveler_name");

  if (directPassenger) {
    return directPassenger;
  }

  const jobCardName = jobCard.match(/^\s*(?:name|passenger)\s*:\s*(.+)$/im);

  return clean(jobCardName?.[1]);
}
