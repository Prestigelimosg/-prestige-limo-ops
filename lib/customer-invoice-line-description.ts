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

  if (serviceType === "MNG") return "AIRPORT ARRIVAL";
  if (serviceType === "DEP") return "AIRPORT DEPARTURE";
  if (serviceType === "TRF") return "CITY TRANSFER";
  if (serviceType === "DSP" || serviceType === "HOURLY") return "HOURLY / DISPOSAL";

  return serviceType;
}

function invoiceDescriptionVehicle(value: unknown) {
  const vehicleType = invoiceDescriptionText(value);
  const fullVehicleLabels: Record<string, string> = {
    AVF: "ALPHARD / VELLFIRE",
    COMBI: "HI-ROOF MINIBUS",
    E: "MERCEDES E-CLASS",
    "E / AVF": "MERCEDES E-CLASS / ALPHARD / VELLFIRE",
    "E-CLASS": "MERCEDES E-CLASS",
    S: "MERCEDES S-CLASS",
    "S-CLASS": "MERCEDES S-CLASS",
    VVV: "MERCEDES VIANO / V-CLASS",
  };

  return fullVehicleLabels[vehicleType] || vehicleType;
}

function invoiceDescriptionRoute(input: CustomerInvoiceLineDescriptionInput) {
  const savedRoute = String(input.route ?? "").replace(/\s+/g, " ").trim();
  const pickupLocation = String(input.pickupLocation ?? "").trim();
  const dropoffLocation = String(input.dropoffLocation ?? "").trim();

  return savedRoute && pickupLocation && dropoffLocation
    ? savedRoute.toUpperCase()
    : `${invoiceDescriptionText(input.pickupLocation)} > ${invoiceDescriptionText(input.dropoffLocation)}`;
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
      `${invoiceDescriptionDateTime(input.dspStartedAt)}-${invoiceDescriptionTime(input.dspEndedAt)}`,
      vehicle,
      passenger,
      `REF ${reference}`,
    ].join(" | ");
  }

  const firstLine =
    normalizedService === "MNG" || normalizedService === "DEP"
      ? [
          service,
          invoiceDescriptionText(input.flightNumber),
          invoiceDescriptionDateTime(input.pickupAt),
          invoiceDescriptionRoute(input),
        ].join(" | ")
      : [service, invoiceDescriptionDateTime(input.pickupAt), invoiceDescriptionRoute(input)].join(" | ");

  return `${firstLine}\n${[vehicle, passenger, `REF ${reference}`].join(" | ")}`;
}
