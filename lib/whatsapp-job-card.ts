export type WhatsAppJobCardBooking = {
  bookingType?: string | null;
  childSeatCount?: string | null;
  childSeatRequired?: string | null;
  childSeatType?: string | null;
  date?: string | null;
  dropoff?: string | null;
  extraStopCount?: string | null;
  extraStopLocation?: string | null;
  flight?: string | null;
  name?: string | null;
  pax?: string | null;
  pickup?: string | null;
  time?: string | null;
  vehicle?: string | null;
};

function clean(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stripPriceFragments(value: string) {
  return clean(value)
    .replace(/(?:^|\s)S?\$\s*\d+(?:[,.]\d{1,2})?\b/gi, " ")
    .replace(/\bSGD\s*\d+(?:[,.]\d{1,2})?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function compactLocation(value: string, fallback: string) {
  const compacted = stripPriceFragments(value)
    .replace(/\bSingapore\s+\d{6}\b/gi, "Singapore")
    .replace(/,\s*Singapore\b/gi, "")
    .replace(/\s+\d{6}\b/g, "")
    .replace(/\s+#\d{1,3}(?:-\d{1,4})?\b/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*$/g, "")
    .trim();

  return compacted || fallback;
}

export function normalizeWhatsAppJobCardVehicle(value: string | null | undefined) {
  const vehicle = clean(value);

  if (!vehicle) {
    return "E / AVF";
  }

  const normalized = vehicle
    .replace(/\bE[-\s]?Class\b/gi, "E")
    .replace(/\bS[-\s]?Class\b/gi, "S")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();

  if (/^E\s*\/\s*AVF$/i.test(normalized)) {
    return "E / AVF";
  }

  return normalized.toUpperCase() === normalized ? normalized : normalized;
}

export function normalizeWhatsAppJobCardService(value: string | null | undefined) {
  const service = clean(value).toUpperCase();

  if (/\bDWPU\b/.test(service)) {
    return "DWPU";
  }

  if (/\b(?:DEP|DEPARTURE|DROP[-\s]?OFF)\b/.test(service)) {
    return "DEP";
  }

  if (/\b(?:MNG|ARR|ARRIVAL|ARRIVING|MEET\s*(?:AND|&)?\s*GREET|PICK[-\s]?UP)\b/.test(service)) {
    return "MNG";
  }

  if (/\b(?:DSP|DISPOSAL|HOURLY|STANDBY)\b/.test(service)) {
    return "DSP";
  }

  if (/\b(?:TRF|TRANSFER|POINT[-\s]?TO[-\s]?POINT)\b/.test(service)) {
    return "TRF";
  }

  return service || "TRF";
}

function formatWhatsAppDate(value: string | null | undefined) {
  const dateValue = clean(value);

  if (!dateValue) {
    return "Date TBC";
  }

  const parsedDate = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return dateValue;
  }

  const day = new Intl.DateTimeFormat("en-SG", { day: "numeric" }).format(parsedDate);
  const month = new Intl.DateTimeFormat("en-SG", { month: "short" }).format(parsedDate);
  const weekday = new Intl.DateTimeFormat("en-SG", { weekday: "short" }).format(parsedDate);

  return `${day} ${month} (${weekday})`;
}

function formatWhatsAppTime(value: string | null | undefined) {
  const timeValue = clean(value);

  if (!timeValue) {
    return "Time TBC";
  }

  const meridiemMatch = timeValue.match(/^(\d{1,2})(?::|\.)(\d{2})\s*(am|pm)$/i);
  if (meridiemMatch?.[1] && meridiemMatch[2] && meridiemMatch[3]) {
    let hours = Number(meridiemMatch[1]);
    const minutes = meridiemMatch[2];
    const meridiem = meridiemMatch[3].toLowerCase();
    if (meridiem === "pm" && hours < 12) {
      hours += 12;
    }
    if (meridiem === "am" && hours === 12) {
      hours = 0;
    }
    return `${String(hours).padStart(2, "0")}${minutes}hrs`;
  }

  const compactTime = timeValue.match(/^(\d{1,2})(?::|\.)(\d{2})$/);
  if (compactTime?.[1] && compactTime[2]) {
    return `${compactTime[1].padStart(2, "0")}${compactTime[2]}hrs`;
  }

  const digits = timeValue.replace(/\D/g, "");
  if (digits.length === 3 || digits.length === 4) {
    return `${digits.padStart(4, "0")}hrs`;
  }

  return timeValue;
}

function formatWhatsAppDateTime(dateValue: string | null | undefined, timeValue: string | null | undefined) {
  return `${formatWhatsAppDate(dateValue)}, ${formatWhatsAppTime(timeValue)}`;
}

function splitExtraStops(value: string | null | undefined) {
  return clean(value)
    .split(/\s*>\s*/g)
    .map((stop) => compactLocation(stop, ""))
    .filter(Boolean);
}

function formatChildSeatLine(booking: WhatsAppJobCardBooking) {
  if (clean(booking.childSeatRequired).toLowerCase() !== "yes") {
    return "";
  }

  const count = Number(clean(booking.childSeatCount)) || 1;
  const type = clean(booking.childSeatType) || "child seat";

  return `Child seat: ${count} x ${type}`;
}

function formatPaxLine(value: string | null | undefined) {
  const pax = Number(clean(value));

  if (!Number.isInteger(pax) || pax <= 0) {
    return "";
  }

  return `${pax} pax`;
}

function formatRouteLine(booking: WhatsAppJobCardBooking, service: string) {
  const flight = stripPriceFragments(clean(booking.flight));
  const pickup = compactLocation(clean(booking.pickup), "Pickup");
  const dropoff = compactLocation(clean(booking.dropoff), service === "DEP" ? "Changi Airport" : "Drop-off");
  const extraStops = splitExtraStops(booking.extraStopLocation);

  if (service === "DEP") {
    return [pickup, ...extraStops, flight || dropoff || "Changi Airport"].filter(Boolean).join(" > ");
  }

  if (service === "MNG") {
    return [flight || pickup || "Changi Airport", ...extraStops, dropoff].filter(Boolean).join(" > ");
  }

  return [pickup, ...extraStops, dropoff].filter(Boolean).join(" > ");
}

export function formatWhatsAppJobCard(booking: WhatsAppJobCardBooking) {
  const service = normalizeWhatsAppJobCardService(booking.bookingType);
  const header = `${normalizeWhatsAppJobCardVehicle(booking.vehicle)} - ${service}`;
  const passengerName = stripPriceFragments(clean(booking.name));
  const paxLine = formatPaxLine(booking.pax);
  const childSeatLine = formatChildSeatLine(booking);

  return [
    header,
    "",
    formatWhatsAppDateTime(booking.date, booking.time),
    "",
    formatRouteLine(booking, service),
    "",
    passengerName,
    "",
    paxLine,
    childSeatLine,
  ]
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
