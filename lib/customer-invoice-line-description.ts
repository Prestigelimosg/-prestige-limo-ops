export type CustomerInvoiceLineDescriptionInput = {
  dspEndedAt?: string | null;
  dspStartedAt?: string | null;
  dropoffLocation?: string | null;
  flightNumber?: string | null;
  passengerName?: string | null;
  pickupAt?: string | null;
  pickupLocation?: string | null;
  publicReference?: string | null;
  route?: string | null;
  serviceType?: string | null;
  vehicleType?: string | null;
};

const nilLabel = "NIL";

export type CustomerInvoiceDspLineTimeRange = {
  actualMinutes: number;
  endTime: string;
  startTime: string;
};

function normalizedInvoiceDescriptionClock(value: string) {
  const match = value.trim().match(/^(\d{1,2}):?(\d{2})$/);

  if (!match) {
    return "";
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function invoiceDescriptionClockMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);

  return hour * 60 + minute;
}

export function parseCustomerInvoiceDspLineTimeRange(
  description: string | null | undefined,
): CustomerInvoiceDspLineTimeRange | null {
  const normalizedDescription = String(description ?? "").trim();

  if (!/^(?:DSP|HOURLY)(?:\s*\/\s*DISPOSAL)?\s*\|/i.test(normalizedDescription)) {
    return null;
  }

  const timeRangeMatch = normalizedDescription.match(
    /,\s*(\d{1,2}:?\d{2})\s*(?:\/|-|\bTO\b)\s*(\d{1,2}:?\d{2})\s*(?:\||$)/i,
  );

  if (!timeRangeMatch) {
    return null;
  }

  const startTime = normalizedInvoiceDescriptionClock(timeRangeMatch[1]);
  const endTime = normalizedInvoiceDescriptionClock(timeRangeMatch[2]);
  const sameDayMinutes =
    invoiceDescriptionClockMinutes(endTime) -
    invoiceDescriptionClockMinutes(startTime);
  const actualMinutes =
    sameDayMinutes > 0 ? sameDayMinutes : sameDayMinutes + 24 * 60;

  return startTime && endTime && actualMinutes
    ? {
        actualMinutes,
        endTime,
        startTime,
      }
    : null;
}

export function normalizeCustomerInvoiceDspLineTimeRange(
  description: string | null | undefined,
) {
  const normalizedDescription = String(description ?? "").trim();
  const timeRange = parseCustomerInvoiceDspLineTimeRange(normalizedDescription);

  if (!timeRange) {
    return normalizedDescription;
  }

  const compactStartTime = timeRange.startTime.replace(":", "");
  const compactEndTime = timeRange.endTime.replace(":", "");

  return normalizedDescription.replace(
    /,\s*\d{1,2}:?\d{2}\s*(?:\/|-|\bTO\b)\s*\d{1,2}:?\d{2}\s*(?=\||$)/i,
    `, ${compactStartTime} - ${compactEndTime} `,
  );
}

function invoiceDescriptionText(value: unknown) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();

  return cleaned ? cleaned.toUpperCase() : nilLabel;
}

function invoiceDescriptionDateTime(value: unknown) {
  const cleaned = String(value ?? "").trim();
  const parsed = cleaned ? new Date(cleaned) : null;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return nilLabel;
  }

  const date = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
    year: "numeric",
  })
    .format(parsed)
    .replace(/,/g, "")
    .toUpperCase();
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(parsed);

  return `${date}, ${time}`;
}

function invoiceDescriptionTime(value: unknown) {
  const cleaned = String(value ?? "").trim();
  const parsed = cleaned ? new Date(cleaned) : null;

  if (!parsed || Number.isNaN(parsed.getTime())) {
    return nilLabel;
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(parsed);
}

function invoiceDescriptionService(value: unknown) {
  const serviceType = invoiceDescriptionText(value);

  if (serviceType === "MNG") return "ARRIVAL";
  if (serviceType === "DEP") return "DEPARTURE";
  if (serviceType === "TRF") return "CITY TRANSFER";
  if (serviceType === "DSP" || serviceType === "HOURLY") return "HOURLY";

  return serviceType;
}

function invoiceDescriptionVehicle(value: unknown) {
  const vehicleType = invoiceDescriptionText(value);
  const fullVehicleLabels: Record<string, string> = {
    AVF: "ALPHARD",
    COMBI: "HI-ROOF MINIBUS",
    E: "MERCEDES E-CLASS",
    "E / AVF": "MERCEDES E-CLASS / ALPHARD",
    "E-CLASS": "MERCEDES E-CLASS",
    S: "MERCEDES S-CLASS",
    "S-CLASS": "MERCEDES S-CLASS",
    VVV: "MERCEDES VIANO / V-CLASS",
  };

  return fullVehicleLabels[vehicleType] || vehicleType;
}

export function formatCustomerInvoiceLineDescription(input: CustomerInvoiceLineDescriptionInput) {
  const normalizedService = invoiceDescriptionText(input.serviceType);
  const service = invoiceDescriptionService(normalizedService);
  const vehicle = invoiceDescriptionVehicle(input.vehicleType);
  const passenger = invoiceDescriptionText(input.passengerName);
  const reference = invoiceDescriptionText(input.publicReference);

  if (normalizedService === "DSP" || normalizedService === "HOURLY") {
    return [
      service,
      `${invoiceDescriptionDateTime(input.dspStartedAt)} / ${invoiceDescriptionTime(input.dspEndedAt)}`,
      vehicle,
      passenger,
      `REF ${reference}`,
    ].join(" | ");
  }

  const firstLine =
    normalizedService === "MNG"
      ? [
          service,
          invoiceDescriptionDateTime(input.pickupAt),
          invoiceDescriptionText(input.flightNumber),
          invoiceDescriptionText(input.dropoffLocation),
        ].join(" | ")
      : normalizedService === "DEP"
        ? [
            service,
            invoiceDescriptionDateTime(input.pickupAt),
            invoiceDescriptionText(input.flightNumber),
            invoiceDescriptionText(input.pickupLocation),
          ].join(" | ")
        : [
            service,
            invoiceDescriptionDateTime(input.pickupAt),
            `${invoiceDescriptionText(input.pickupLocation)} > ${invoiceDescriptionText(input.dropoffLocation)}`,
          ].join(" | ");

  return `${firstLine}\n${[vehicle, passenger, `REF ${reference}`].join(" | ")}`;
}
