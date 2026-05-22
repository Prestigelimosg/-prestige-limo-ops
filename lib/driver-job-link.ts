import { createHash, randomBytes } from "node:crypto";

export const defaultDriverJobLinkTokenByteLength = 32;
export const defaultDriverJobLinkTtlHours = 48;

export type DriverJobStatusUpdate = "driver_otw" | "ots" | "pob" | "completed";

export type DriverJobBookingLike = Record<string, unknown>;

export type SafeDriverJobPayload = {
  reference: string;
  pickupDate: string;
  pickupTime: string;
  pickupDateTime: string;
  bookingType: string;
  bookingTypeLabel: string;
  pickupLocation: string;
  dropoffLocation: string;
  route: string;
  waypoints: string[];
  flightNumber: string;
  passengerName: string;
  status: string;
  statusLabel: string;
  assignedDriver: {
    name: string;
    contact: string;
    plate: string;
    vehicleModel: string;
  };
};

const bookingTypeLabels: Record<string, string> = {
  DEP: "Departure",
  DSP: "Hourly",
  MNG: "Arrival",
  TRF: "City Transfer",
};

const statusLabels: Record<string, string> = {
  assigned: "Assigned",
  completed: "Job Completed",
  confirmed: "Confirmed",
  driver_otw: "OTW",
  ots: "OTS",
  pob: "POB",
};

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

export function validateDriverJobStatusUpdate(value: string): DriverJobStatusUpdate | null {
  const normalized = clean(value).toLowerCase().replace(/[\s-]+/g, "_");

  if (normalized === "otw" || normalized === "driver_otw" || normalized === "on_the_way") {
    return "driver_otw";
  }

  if (normalized === "ots" || normalized === "on_the_spot") {
    return "ots";
  }

  if (normalized === "pob" || normalized === "passenger_on_board") {
    return "pob";
  }

  if (normalized === "job_completed" || normalized === "completed" || normalized === "job_done") {
    return "completed";
  }

  return null;
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
    reference: stringField(booking, "public_reference", "driver_job_reference", "reference"),
    pickupDate,
    pickupTime,
    pickupDateTime,
    bookingType,
    bookingTypeLabel: bookingTypeLabels[bookingType] || bookingType,
    pickupLocation,
    dropoffLocation,
    route: safeRoute,
    waypoints: safeRoutePoints.length >= 3 ? safeRoutePoints.slice(1, -1) : [],
    flightNumber: stringField(booking, "flight_no", "flightNumber", "flight"),
    passengerName: getPassengerName(booking, jobCard),
    status,
    statusLabel: statusLabels[status.toLowerCase()] || status,
    assignedDriver: {
      name: stringField(booking, "driver_name", "driverName"),
      contact: stringField(booking, "driver_contact", "driverContact"),
      plate: stringField(booking, "driver_plate_number", "driverPlate", "plate"),
      vehicleModel: stringField(booking, "driver_vehicle_model", "driverVehicleModel"),
    },
  };
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
