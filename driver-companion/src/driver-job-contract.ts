export const productionOrigin = "https://app.prestigelimo.sg";

export type ActiveDriverJob = {
  jobUrl: string;
  origin: typeof productionOrigin;
  token: string;
};

export type DriverJobSummary = {
  passengerName: string;
  pickupDateTime: string;
  reference: string;
  route: string;
  status: string;
  statusLabel: string;
};

export type DriverDetailsInput = {
  contact: string;
  name: string;
  plate: string;
  vehicleModel: string;
};

export type DriverJobStatusAction = "OTW" | "OTS" | "POB" | "Job Completed";

export type DriverJobStatusHistoryItem = {
  occurredAt: string;
  safeNote: string | null;
  status: string;
  statusLabel: string;
};

export type DriverJobDetails = DriverJobSummary & {
  acknowledged: boolean;
  assignedDriver: DriverDetailsInput;
  bookingType: string;
  bookingTypeLabel: string;
  dropoffLocation: string;
  flightNumber: string;
  pickupDate: string;
  pickupLocation: string;
  pickupTime: string;
  statusHistory: DriverJobStatusHistoryItem[];
  waypoints: string[];
};

type UnknownRecord = Record<string, unknown>;

const driverSafeStatusLabels: Readonly<Record<string, string>> = {
  assigned: "Assigned",
  completed: "Completed",
  confirmed: "Confirmed",
  driver_otw: "I'm on the way",
  ots: "I've arrived",
  pending: "Pending",
  pob: "Passenger on board",
};

const pickupMonthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type NativeLocationCapture = {
  coords: {
    accuracy: number | null;
    heading: number | null;
    latitude: number;
    longitude: number;
    speed: number | null;
  };
  timestamp: number;
};

export class DriverJobRequestError extends Error {
  readonly status: number;
  readonly terminal: boolean;

  constructor(message: string, status: number, terminal: boolean) {
    super(message);
    this.name = "DriverJobRequestError";
    this.status = status;
    this.terminal = terminal;
  }
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function driverSafeStatusLabel(value: unknown) {
  const status = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return driverSafeStatusLabels[status] || "Pending dispatch confirmation";
}

export function formatDriverPickupDateTime(value: unknown) {
  const pickupDateTime = cleanText(value);

  if (!pickupDateTime) {
    return "Pickup time TBC";
  }

  const canonicalMatch = pickupDateTime.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/,
  );

  if (!canonicalMatch) {
    return pickupDateTime;
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = canonicalMatch;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const validationDate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day ||
    validationDate.getUTCHours() !== hour ||
    validationDate.getUTCMinutes() !== minute
  ) {
    return "Pickup time TBC";
  }

  return `${day} ${pickupMonthLabels[month - 1]} ${year}, ${hourText}${minuteText}hrs SGT`;
}

function terminalStatus(status: number) {
  return status === 401 || status === 403 || status === 410;
}

async function responseBody(response: Response) {
  return asRecord(await response.json().catch(() => null));
}

function requestError(response: Response, body: UnknownRecord) {
  const reason = cleanText(body.reason, "request_failed");

  return new DriverJobRequestError(
    reason,
    response.status,
    terminalStatus(response.status),
  );
}

function liveLocationUrl(job: ActiveDriverJob) {
  return `${job.origin}/api/driver-job/${encodeURIComponent(job.token)}/live-location`;
}

function driverJobUrl(job: ActiveDriverJob) {
  return `${job.origin}/api/driver-job/${encodeURIComponent(job.token)}`;
}

function driverJobStatusUrl(job: ActiveDriverJob) {
  return `${driverJobUrl(job)}/status`;
}

export function parseDriverJobUrl(value: string): ActiveDriverJob {
  let parsed: URL;

  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Paste a valid private Driver Job URL.");
  }

  if (parsed.origin !== productionOrigin || parsed.username || parsed.password) {
    throw new Error("Use the private Driver Job URL from Prestige only.");
  }

  const match = parsed.pathname.match(/^\/driver-job\/([A-Za-z0-9_-]{20,})\/?$/);

  if (!match || parsed.search || parsed.hash) {
    throw new Error("This is not a valid private Driver Job URL.");
  }

  const token = match[1];

  return {
    jobUrl: `${productionOrigin}/driver-job/${encodeURIComponent(token)}`,
    origin: productionOrigin,
    token,
  };
}

function safeTextList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
}

function safeStatusHistory(value: unknown): DriverJobStatusHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = asRecord(item);
    const status = cleanText(record.status);

    return {
      occurredAt: cleanText(record.occurredAt),
      safeNote: cleanText(record.safeNote) || null,
      status,
      statusLabel: driverSafeStatusLabel(status),
    };
  });
}

function safeDriverJobDetails(value: unknown): DriverJobDetails {
  const payload = asRecord(value);
  const assignedDriver = asRecord(payload.assignedDriver);
  const status = cleanText(payload.status, "assigned");

  return {
    acknowledged: payload.acknowledged === true,
    assignedDriver: {
      contact: cleanText(assignedDriver.contact),
      name: cleanText(assignedDriver.name),
      plate: cleanText(assignedDriver.plate),
      vehicleModel: cleanText(assignedDriver.vehicleModel),
    },
    bookingType: cleanText(payload.bookingType),
    bookingTypeLabel: cleanText(payload.bookingTypeLabel),
    dropoffLocation: cleanText(payload.dropoffLocation),
    flightNumber: cleanText(payload.flightNumber),
    passengerName: cleanText(payload.passengerName, "Passenger TBC"),
    pickupDate: cleanText(payload.pickupDate),
    pickupDateTime: formatDriverPickupDateTime(payload.pickupDateTime),
    pickupLocation: cleanText(payload.pickupLocation),
    pickupTime: cleanText(payload.pickupTime),
    reference: cleanText(payload.reference, "Reference unavailable"),
    route: cleanText(payload.route, "Route TBC"),
    status,
    statusHistory: safeStatusHistory(payload.statusHistory),
    statusLabel: driverSafeStatusLabel(status),
    waypoints: safeTextList(payload.waypoints),
  };
}

async function driverJobRequest(job: ActiveDriverJob, url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await responseBody(response);

  if (!response.ok || body.ok !== true) {
    throw requestError(response, body);
  }

  return safeDriverJobDetails(body.payload);
}

export async function loadDriverJobDetails(job: ActiveDriverJob) {
  return driverJobRequest(job, driverJobUrl(job), {
    headers: { Accept: "application/json" },
    method: "GET",
  });
}

export async function loadDriverJobSummary(job: ActiveDriverJob) {
  const details = await loadDriverJobDetails(job);

  return {
    passengerName: details.passengerName,
    pickupDateTime: details.pickupDateTime,
    reference: details.reference,
    route: details.route,
    status: details.status,
    statusLabel: details.statusLabel,
  } satisfies DriverJobSummary;
}

export async function saveAndAcknowledgeDriverJob(
  job: ActiveDriverJob,
  details: DriverDetailsInput,
) {
  return driverJobRequest(job, driverJobUrl(job), {
    body: JSON.stringify({
      driver_contact: details.contact,
      driver_name: details.name,
      driver_plate_number: details.plate,
      driver_vehicle_model: details.vehicleModel,
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export async function updateDriverJobStatus(
  job: ActiveDriverJob,
  status: DriverJobStatusAction,
) {
  return driverJobRequest(job, driverJobStatusUrl(job), {
    body: JSON.stringify({ status }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
}

export function nextDriverJobStatusAction(
  status: string,
): DriverJobStatusAction | null {
  const normalized = cleanText(status).toLowerCase();

  if (["assigned", "confirmed", "pending"].includes(normalized)) {
    return "OTW";
  }
  if (normalized === "driver_otw") {
    return "OTS";
  }
  if (normalized === "ots") {
    return "POB";
  }
  if (normalized === "pob") {
    return "Job Completed";
  }

  return null;
}

async function liveLocationRequest(
  job: ActiveDriverJob,
  init: RequestInit,
) {
  const response = await fetch(liveLocationUrl(job), init);
  const body = await responseBody(response);

  if (!response.ok || body.ok !== true) {
    throw requestError(response, body);
  }

  if (body.customerVisible !== false || body.external_send !== false) {
    throw new DriverJobRequestError("unsafe_server_response", 502, true);
  }

  return body;
}

export async function checkDriverLocationReadiness(job: ActiveDriverJob) {
  return liveLocationRequest(job, {
    headers: { Accept: "application/json" },
    method: "GET",
  });
}

function optionalBoundedNumber(
  value: number | null,
  minimum: number,
  maximum: number,
) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

export async function postDriverLocation(
  job: ActiveDriverJob,
  location: NativeLocationCapture,
) {
  return liveLocationRequest(job, {
    body: JSON.stringify({
      accuracy_meters: optionalBoundedNumber(location.coords.accuracy, 0, 10000),
      captured_at: new Date(location.timestamp).toISOString(),
      heading_degrees: optionalBoundedNumber(location.coords.heading, 0, 359.99),
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      speed_meters_per_second: optionalBoundedNumber(location.coords.speed, 0, 120),
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function deleteDriverLocation(job: ActiveDriverJob) {
  return liveLocationRequest(job, {
    headers: { Accept: "application/json" },
    method: "DELETE",
  });
}
