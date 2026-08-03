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

type UnknownRecord = Record<string, unknown>;

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

export async function loadDriverJobSummary(job: ActiveDriverJob) {
  const response = await fetch(
    `${job.origin}/api/driver-job/${encodeURIComponent(job.token)}`,
    { headers: { Accept: "application/json" } },
  );
  const body = await responseBody(response);

  if (!response.ok || body.ok !== true) {
    throw requestError(response, body);
  }

  const payload = asRecord(body.payload);

  return {
    passengerName: cleanText(payload.passengerName, "Passenger TBC"),
    pickupDateTime: cleanText(payload.pickupDateTime, "Pickup time TBC"),
    reference: cleanText(payload.reference, "Reference unavailable"),
    route: cleanText(payload.route, "Route TBC"),
    status: cleanText(payload.status, "assigned"),
    statusLabel: cleanText(payload.statusLabel, "Assigned"),
  } satisfies DriverJobSummary;
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
