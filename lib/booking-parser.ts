export type ParsedBooking = {
  success?: boolean;
  company?: string;
  bookingType?: string;
  vehicle?: string;
  date?: string;
  time?: string;
  flight?: string;
  pickup?: string;
  dropoff?: string;
  booker?: string;
  bookerContact?: string;
  bookerEmail?: string;
  name?: string;
  pax?: string;
  childSeatRequired?: string;
  childSeatCount?: string;
  childSeatType?: string;
  extraStopCount?: string;
  extraStopLocation?: string;
  customerPriceOverride?: string;
  customerPriceOverrideReason?: string;
  driverName?: string;
  driverContact?: string;
  standbyUntil?: string;
  returnDestination?: string;
  cleanedLines?: string[];
  extractedBookingsPreview?: Array<{
    passenger?: string;
    date?: string;
    time?: string;
    type?: string;
    flight?: string;
    pickup?: string;
    dropoff?: string;
  }>;
  parserWarning?: string;
  multipleBookingsDetected?: boolean;
};

export type BookingFormState = Required<Omit<ParsedBooking, "success" | "cleanedLines" | "extractedBookingsPreview" | "parserWarning" | "multipleBookingsDetected" | "standbyUntil" | "returnDestination">> & {
  cleanedLines?: string[];
};

type ParseBookingOptions = {
  referenceDate?: Date;
};

export const alsonSq377Sample = `[11/5/26, 13:33:10] Alson Chua UOB: Hi kindly arrange airport pick up to home on 14 May Thursday 0740 SQ377. Thank you
[11/5/26, 13:33:16] Alson Chua UOB: Lim Yeow Beng`;

type WhatsAppTranscript = {
  senderName: string;
  senderCompany: string;
  messages: string[];
};

const monthLookup: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const weekdayLookup: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const knownCompanyTokens = new Set([
  "acme",
  "apollo",
  "bny",
  "citi",
  "dbs",
  "hsbc",
  "ocbc",
  "shiseido",
  "tiger",
  "uob",
]);

const ignoredFlightCodes = new Set(["AT", "BY", "IF", "IN", "IS", "NO", "OF", "ON", "OR", "TO"]);
const flightCodePattern = /\b([A-Z]{2})\s?(\d{1,4})\b/gi;

function clean(value: string | null | undefined) {
  return (value ?? "").trim();
}

function hasParsedValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return clean(value).length > 0;
  }

  return value !== null && value !== undefined;
}

function normaliseEmail(value: string) {
  return clean(value).toLowerCase();
}

function getEmailDomain(value: string) {
  const email = normaliseEmail(value);
  const domain = email.split("@")[1];

  return domain ? domain.replace(/^www\./, "") : "";
}

function firstMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return clean(match[1].replace(/[|,;]+$/g, ""));
    }
  }

  return "";
}

function normalizeFlightCode(value: string | null | undefined) {
  const match = clean(value).match(/^([A-Z]{2})\s?(\d{1,4})$/i);

  if (!match) {
    return "";
  }

  const airlineCode = match[1].toUpperCase();

  if (ignoredFlightCodes.has(airlineCode)) {
    return "";
  }

  return `${airlineCode}${match[2]}`;
}

function detectFlight(text: string) {
  const labeledFlight = firstMatch(text, [
    /\b(?:flight|flt|flight no|flight number)\s*[:=-]?\s*([A-Z]{2}\s?\d{1,4})\b/i,
  ]);
  const normalizedLabeledFlight = normalizeFlightCode(labeledFlight);

  if (normalizedLabeledFlight) {
    return normalizedLabeledFlight;
  }

  if (!/\b(?:airport|arrival|arriving|arrives?|departure|depart|drop\s*off|pick\s*up|pickup|eta|etd|landing|flight|flt|taking)\b|>|->|=>/i.test(text)) {
    return "";
  }

  for (const match of text.matchAll(flightCodePattern)) {
    const beforeMatch = text.slice(Math.max(0, match.index - 24), match.index);
    const afterMatch = text.slice(match.index + match[0].length, match.index + match[0].length + 24);

    if (
      /\b(?:mr|mrs|ms|mdm|miss|dr)\.?\s+[A-Za-z.'-]+\s*$/i.test(beforeMatch) &&
      !/^\s*(?:arriv(?:ing|al|es?)|depart(?:ure|ing)?|eta|etd|landing|to\b|>|$)/i.test(afterMatch)
    ) {
      continue;
    }

    const normalizedFlight = normalizeFlightCode(`${match[1]}${match[2]}`);

    if (normalizedFlight) {
      return normalizedFlight;
    }
  }

  return "";
}

function detectAllFlights(text: string) {
  const flights = new Set<string>();
  const labeledFlight = detectFlight(text);

  if (labeledFlight) {
    flights.add(labeledFlight);
  }

  for (const match of text.matchAll(flightCodePattern)) {
    const beforeMatch = text.slice(Math.max(0, match.index - 24), match.index);
    const afterMatch = text.slice(match.index + match[0].length, match.index + match[0].length + 24);

    if (
      /\b(?:mr|mrs|ms|mdm|miss|dr)\.?\s+[A-Za-z.'-]+\s*$/i.test(beforeMatch) &&
      !/^\s*(?:arriv(?:ing|al|es?)|depart(?:ure|ing)?|eta|etd|landing|to\b|>|$)/i.test(afterMatch)
    ) {
      continue;
    }

    const normalizedFlight = normalizeFlightCode(`${match[1]}${match[2]}`);

    if (normalizedFlight) {
      flights.add(normalizedFlight);
    }
  }

  return Array.from(flights);
}

function extractNamedPassengerLine(line: string) {
  const cleanedLine = clean(line.replace(/^[-*•]\s*/, ""));
  const labeledPassenger = firstMatch(cleanedLine, [
    /^(?:name|passenger|passenger name|guest|guest name|pax name)\s*[:=-]\s*([A-Za-z][A-Za-z.' -]{1,60})$/i,
  ]);

  if (looksLikePersonName(labeledPassenger)) {
    return cleanDetectedName(labeledPassenger);
  }

  if (/^(?:mr|mrs|ms|mdm|miss|dr)\.?\s+[A-Za-z]/i.test(cleanedLine)) {
    return cleanDetectedName(cleanedLine);
  }

  return "";
}

function detectMultipleBookings(text: string, cleanedLines: string[]) {
  const listItems = cleanedLines.filter((line) =>
    /^(?:\d+[.)]\s+|[-*•]\s+)/.test(line),
  );
  const flights = detectAllFlights(text);
  const namedPassengers = Array.from(new Set(
    cleanedLines
      .map((line) => extractNamedPassengerLine(line))
      .filter(Boolean),
  ));
  const multiLegAirportStandby =
    Boolean(detectFlight(text)) &&
    /\b(?:arriv(?:ing|al|es?)|airport|pick\s*up|pickup|landing|ETA)\b/i.test(text) &&
    /\b(?:standby|return|send\s+back|then\s+return|then\s+send\s+back|pickup\s+again)\b/i.test(text);

  return listItems.length > 1 || flights.length > 1 || namedPassengers.length > 1 || multiLegAirportStandby;
}

function buildAirportStandbyPreview(text: string, referenceDate: Date) {
  const flight = detectFlight(text);

  if (!flight || !/\b(?:standby|return|send\s+back|then\s+return|then\s+send\s+back|pickup\s+again)\b/i.test(text)) {
    return [];
  }

  const firstDestination = cleanLocation(firstMatch(text, [
    /\bsend\s+to\s+(.+?)(?=\.|\n|,|$)/i,
    /\bto\s+(.+?)(?=\.|\n|,|$)/i,
  ]));
  const returnDestination = cleanLocation(firstMatch(text, [
    /\bthen\s+return\s+(.+?)(?=\.|\n|,|$)/i,
    /\breturn\s+(.+?)(?=\.|\n|,|$)/i,
    /\bthen\s+send\s+back\s+to\s+(.+?)(?=\.|\n|,|$)/i,
    /\bsend\s+back\s+to\s+(.+?)(?=\.|\n|,|$)/i,
  ]));

  if (!firstDestination || !returnDestination) {
    return [];
  }

  return [
    {
      passenger: "",
      date: parseDateFromText(text, referenceDate),
      time: formatTimeForState(parseTimeFromText(text)),
      type: "MNG",
      flight,
      pickup: "Changi Airport",
      dropoff: firstDestination,
    },
    {
      passenger: "",
      date: "",
      time: "",
      type: "TRF",
      flight: "",
      pickup: firstDestination,
      dropoff: returnDestination,
    },
  ];
}

function splitPotentialBookings(text: string, cleanedLines: string[]) {
  const listLines = cleanedLines
    .filter((line) => /^(?:\d+[.)]\s+|[-*•]\s+)/.test(line))
    .map((line) => clean(line.replace(/^(?:\d+[.)]\s+|[-*•]\s+)/, "")))
    .filter(Boolean);

  if (listLines.length > 1) {
    return listLines;
  }

  const flightLines = cleanedLines.filter((line) => detectFlight(line));

  if (flightLines.length > 1) {
    return flightLines;
  }

  const passengerLines = cleanedLines.filter((line) => extractNamedPassengerLine(line));

  return passengerLines.length > 1 ? passengerLines : cleanedLines;
}

function buildExtractedBookingsPreview(text: string, cleanedLines: string[], referenceDate: Date) {
  const hasExplicitList = cleanedLines.filter((line) => /^(?:\d+[.)]\s+|[-*•]\s+)/.test(line)).length > 1;
  const hasMultipleFlights = detectAllFlights(text).length > 1;
  const airportStandbyPreview = hasExplicitList || hasMultipleFlights ? [] : buildAirportStandbyPreview(text, referenceDate);

  if (airportStandbyPreview.length > 0) {
    return airportStandbyPreview;
  }

  return splitPotentialBookings(text, cleanedLines)
    .map((segment) => {
      const segmentText = normalizeIntentText(segment);
      const flight = detectFlight(segmentText);
      const route = detectRoute(segmentText, flight);
      const type = lineValue(segmentText, ["booking type", "type", "job type"]) ||
        detectBookingType(segmentText, flight, route);
      const date = parseDateFromText(segmentText, referenceDate);
      const rawTime = parseTimeFromText(segmentText);
      const passenger =
        detectStandbyName(segmentText) ||
        detectDrivenPassenger(segmentText) ||
        detectName(segmentText, flight) ||
        "";
      const departureTerminal = flight && type === "DEP" ? airportLocationFromText(segmentText) : "";

      return {
        passenger,
        date,
        time: formatTimeForState(rawTime) || rawTime,
        type,
        flight,
        pickup: route.pickup,
        dropoff: departureTerminal || route.dropoff,
      };
    })
    .filter((preview) => Object.values(preview).some(Boolean));
}

function lineValue(text: string, labels: string[]) {
  const lines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean);

  for (const line of lines) {
    for (const label of labels) {
      const pattern = new RegExp(`^${label}\\s*[:=-]\\s*(.+)$`, "i");
      const match = line.match(pattern);

      if (match?.[1]) {
        return clean(match[1]);
      }
    }
  }

  return "";
}

function cleanedLineValue(text: string, labels: string[]) {
  return cleanLocation(lineValue(text, labels));
}

function cleanVehicle(value: string) {
  return clean(value).replace(/[|,;.]+$/g, "");
}

function detectBookerCompanyContext(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean);
  const contextCandidates = [
    ...lines.filter((line) => /\b(?:booked\s+by|booker|this\s+is|here\s+from|from\b.+\bhere)\b/i.test(line)),
    ...lines,
    clean(text.replace(/\n+/g, " ")),
  ];
  const contextPatterns = [
    /\bbooker\s*[:=-]\s*([A-Za-z][A-Za-z.' -]{1,40})\s+from\s+([A-Za-z][A-Za-z0-9&.' -]{1,50})(?=\.|,|$)/i,
    /\bbooked\s+by\s+([A-Za-z][A-Za-z.' -]{1,40})\s+from\s+([A-Za-z][A-Za-z0-9&.' -]{1,50})(?=\.|,|$)/i,
    /(?:^|,\s*)this\s+is\s+([A-Za-z][A-Za-z.' -]{1,40})\s+from\s+([A-Za-z][A-Za-z0-9&.' -]{1,50})(?=\.|,|$)/i,
    /(?:^|,\s*)([A-Za-z][A-Za-z.' -]{1,40})\s+here\s*,?\s*from\s+([A-Za-z][A-Za-z0-9&.' -]{1,50})(?=\.|,|$)/i,
    /(?:^|,\s*)([A-Za-z][A-Za-z.' -]{1,40})\s+from\s+([A-Za-z][A-Za-z0-9&.' -]{1,50})\s+here(?=\.|,|$)/i,
    /^([A-Za-z][A-Za-z.' -]{1,40})\s+from\s+([A-Za-z][A-Za-z0-9&.' -]{1,50})$/i,
  ];

  for (const candidate of contextCandidates) {
    const match = contextPatterns
      .map((pattern) => candidate.match(pattern))
      .find((result) => result?.[1] && result?.[2]);

    if (!match?.[1] || !match?.[2]) {
      continue;
    }

    const booker = cleanDetectedName(match[1]);
    const company = clean(match[2]).replace(/[|,;.]+$/g, "");

    if (
      !looksLikePersonName(booker) ||
      /\b(?:hotel|airport|home|office|st\s+regis|mbs|marina|raffles|changi)\b/i.test(company)
    ) {
      continue;
    }

    return { booker, company };
  }

  return { booker: "", company: "" };
}

function parseWhatsAppTranscript(text: string): WhatsAppTranscript {
  const messages: string[] = [];
  let senderName = "";
  let senderCompany = "";

  text.split(/\n+/).forEach((rawLine) => {
    const line = clean(rawLine);
    const match = line.match(/^\[[^\]]+\]\s+([^:]+):\s*(.+)$/);

    if (!match) {
      return;
    }

    const sender = clean(match[1]);
    const message = clean(match[2]);
    const senderParts = sender.split(/\s+/);
    const possibleCompany = senderParts[senderParts.length - 1];

    const hasCompanyToken =
      /^[A-Z0-9&]{2,}$/.test(possibleCompany) || knownCompanyTokens.has(possibleCompany.toLowerCase());

    if (!senderName || (!senderCompany && hasCompanyToken)) {
      if (hasCompanyToken) {
        senderCompany = possibleCompany;
        senderName = senderParts.slice(0, -1).join(" ");
      } else {
        senderName = sender;
      }
    }

    if (message) {
      messages.push(message);
    }
  });

  return {
    senderName,
    senderCompany,
    messages,
  };
}

function getWhatsAppCleanedLines(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((rawLine) => {
      const line = clean(rawLine);
      const match = line.match(/^\[[^\]]+\]\s+[^:]+:\s*(.+)$/);

      return clean(match?.[1] || line);
    })
    .filter(Boolean);
}

function detectNameFromCleanedLines(cleanedLines: string[]) {
  const nameLine = cleanedLines
    .map((line) => extractNamedPassengerLine(line))
    .find(Boolean) || "";

  return nameLine ? cleanDetectedName(nameLine) : "";
}

function detectCoupleCompanion(text: string) {
  if (/\b(?:my\s+)?wife\s+and\s+i\b|\bi\s+and\s+(?:my\s+)?wife\b/i.test(text)) {
    return "wife";
  }

  if (/\b(?:my\s+)?husband\s+and\s+i\b|\bi\s+and\s+(?:my\s+)?husband\b/i.test(text)) {
    return "husband";
  }

  return "";
}

function detectNarratedBooker(text: string) {
  const narratedBooker = firstMatch(text, [
    /\bmy\s+name\s+is\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=,|\sand\b|\.|$)/i,
    /\bi\s+am\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=,|\sand\b|\.|$)/i,
  ]);

  return looksLikePersonName(narratedBooker) ? cleanDetectedName(narratedBooker) : "";
}

function detectNarratedTravelerName(text: string) {
  const narratedBooker = detectNarratedBooker(text);
  const companion = detectCoupleCompanion(text);

  if (narratedBooker && companion) {
    return `${narratedBooker} and ${companion}`;
  }

  return "";
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateFromText(text: string, referenceDate: Date = new Date()) {
  const isoMatch = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const numericMatch = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (numericMatch) {
    return `${numericMatch[3]}-${numericMatch[2].padStart(2, "0")}-${numericMatch[1].padStart(
      2,
      "0",
    )}`;
  }

  const monthMatch = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+|-)(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i,
  );
  if (monthMatch) {
    const month = monthLookup[monthMatch[2].toLowerCase()];
    const year = monthMatch[3] || String(referenceDate.getFullYear());

    return `${year}-${month}-${monthMatch[1].padStart(2, "0")}`;
  }

  const lowerText = text.toLowerCase();
  const today = new Date(referenceDate);

  if (/\btoday\b/.test(lowerText)) {
    return toDateKey(today);
  }

  if (/\btomorrow\b/.test(lowerText)) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return toDateKey(tomorrow);
  }

  const weekdayMatch = text.match(
    /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i,
  );

  if (weekdayMatch) {
    const targetWeekday = weekdayLookup[weekdayMatch[1].toLowerCase()];

    if (targetWeekday !== undefined) {
      const currentWeekday = today.getDay();
      let dayOffset = (targetWeekday - currentWeekday + 7) % 7;

      if (/\bthis\s+week\b/i.test(text) && targetWeekday < currentWeekday) {
        return "";
      }

      if (
        /\bnext\s+week\b/i.test(text) ||
        new RegExp(`\\bnext\\s+${weekdayMatch[1]}\\b`, "i").test(text)
      ) {
        dayOffset += dayOffset === 0 ? 7 : 7;
      }

      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + dayOffset);

      return toDateKey(targetDate);
    }
  }

  return "";
}

function normalizeIntentText(text: string) {
  return text
    .replace(/\barpt\b/gi, "airport")
    .replace(/\bp\/?u\b/gi, "pick up")
    .replace(/\bd\/?o\b/gi, "drop off")
    .replace(/\bfrm\b/gi, "from")
    .replace(/\btmr\b/gi, "tomorrow")
    .replace(/\btml\b/gi, "tomorrow")
    .replace(/\barr\b/gi, "arrival")
    .replace(/\bdeprt?\b/gi, "departure")
    .replace(/\bdepature\b/gi, "departure")
    .replace(/\btranfer\b/gi, "transfer")
    .replace(/\bstandy\b/gi, "standby")
    .replace(/\bdisp\b/gi, "disposal");
}

function parseTimeFromText(text: string) {
  const labeledTime = firstMatch(text, [
    /\b(?:pickup\s*time|time|p\/u\s*time|pu\s*time|eta)\s*[:=-]?\s*(\d{1,2}(?::?\d{2})?\s*(?:am|pm|hrs?)?)/i,
  ]);
  const rawTime =
    labeledTime ||
    firstMatch(text, [
      /\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\b/i,
      /\b((?:[01]?\d|2[0-3]):[0-5]\d)\b/i,
      /\b[A-Z]{2}\s?\d{1,4}\s+((?:[01]\d|2[0-3])[0-5]\d)\b/i,
      /\b((?:[01]\d|2[0-3])[0-5]\d)\s+[A-Z]{2}\s?\d{1,4}\b/i,
      /\b((?:[01]\d|2[0-3])[0-5]\d)\s+(?=[A-Za-z].*?(?:>|->|=>))/i,
      /\b((?:[01]\d|2[0-3])[0-5]\d)\s+(?=from\b|to\b|at\b)/i,
      /\b((?:[01]?\d|2[0-3])[ .]?[0-5]\d)\s*(?:hrs?|hours?)\b/i,
      /\b(\d{1,2}\s*(?:am|pm))\b/i,
      /\b(?:at|by|around|pickup|pick\s*up|p\/u|pu|eta|etd|arrival|arriving|departure|departing|taking|standby)\s+((?:[01]\d|2[0-3])[0-5]\d)\b/i,
    ]);

  if (!rawTime) {
    return "";
  }

  const compactTime = rawTime.replace(/\s+/g, "").toLowerCase();
  const amPmMatch = compactTime.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)$/);

  if (amPmMatch) {
    let hour = Number(amPmMatch[1]);
    const minute = amPmMatch[2] || "00";

    if (amPmMatch[3] === "pm" && hour < 12) {
      hour += 12;
    }

    if (amPmMatch[3] === "am" && hour === 12) {
      hour = 0;
    }

    return `${String(hour).padStart(2, "0")}${minute}`;
  }

  const digits = compactTime.replace(/\D/g, "");

  if (digits.length >= 4) {
    return `${digits.slice(0, 2)}${digits.slice(2, 4)}`;
  }

  if (digits.length > 0) {
    return `${digits.padStart(2, "0")}00`;
  }

  return "";
}

function formatTimeForState(value: string) {
  const digits = clean(value).replace(/\D/g, "");

  if (digits.length >= 4) {
    return `${digits.slice(0, 2)}${digits.slice(2, 4)}hrs`;
  }

  if (digits.length > 0) {
    return `${digits.padStart(2, "0")}00hrs`;
  }

  return "";
}

function formatDetectedMoneyAmount(value: number) {
  if (!Number.isFinite(value)) {
    return "";
  }

  const roundedValue = Math.round(value * 100) / 100;

  return Number.isInteger(roundedValue)
    ? String(roundedValue)
    : roundedValue.toFixed(2).replace(/0+$/g, "").replace(/\.$/g, "");
}

function detectQuotedCustomerPrice(cleanedLines: string[]) {
  const priceLines = cleanedLines
    .map((line) => clean(line))
    .filter((line) => /(?:S\$|\$)\s*\d/.test(line));

  for (const line of priceLines) {
    const combinedMatch = line.match(/((?:S\$|\$)\s*\d+(?:\.\d{1,2})?\s*\+\s*(?:S\$|\$)\s*\d+(?:\.\d{1,2})?)/i);

    if (combinedMatch?.[1]) {
      const amounts = Array.from(
        combinedMatch[1].matchAll(/(?:S\$|\$)\s*(\d+(?:\.\d{1,2})?)/gi),
      )
        .map((match) => Number(match[1]))
        .filter((amount) => Number.isFinite(amount));

      if (amounts.length >= 2) {
        return {
          customerPriceOverride: formatDetectedMoneyAmount(amounts.reduce((sum, amount) => sum + amount, 0)),
          customerPriceOverrideReason: `Parsed from message: ${combinedMatch[1].replace(/\s+/g, " ").trim()}`,
        };
      }
    }

    const singleMatch = line.match(/((?:S\$|\$)\s*\d+(?:\.\d{1,2})?)/i);

    if (singleMatch?.[1]) {
      const amount = Number(singleMatch[1].replace(/[^0-9.]/g, ""));

      if (Number.isFinite(amount)) {
        return {
          customerPriceOverride: formatDetectedMoneyAmount(amount),
          customerPriceOverrideReason: `Parsed from message: ${singleMatch[1].replace(/\s+/g, " ").trim()}`,
        };
      }
    }
  }

  return {
    customerPriceOverride: "",
    customerPriceOverrideReason: "",
  };
}

function detectExtraStopDetails(text: string) {
  const labeledExtraStop = cleanLocation(lineValue(text, [
    "extra stop",
    "extra stops",
    "extra stop location",
    "extra stop address",
  ]));
  const narratedExtraStop = cleanLocation(firstMatch(text, [
    /\b(?:one|a|an|\d{1,2})\s+stops?\s+(?:at|to|via)\s+(.+?)(?=\s+(?:with|then|and\s+then|before|after)\b|\.|,|\n|$)/i,
    /\bextra\s+stops?\s+(?:at|to|via)\s+(.+?)(?=\.|,|\n|$)/i,
    /\b(?:via|stopover\s+at)\s+(.+?)(?=\.|,|\n|$)/i,
  ]));
  const extraStopLocation = labeledExtraStop || narratedExtraStop;
  const explicitCount = firstMatch(text, [
    /\b(\d{1,2})\s+extra\s+stops?\b/i,
    /\bextra\s+stops?\s*[:=-]\s*(\d{1,2})\b/i,
  ]);

  return {
    extraStopCount: explicitCount || (extraStopLocation ? "1" : ""),
    extraStopLocation,
  };
}

function detectChildSeatType(text: string) {
  const ageDescriptor = firstMatch(text, [
    /\b(\d{1,2}\s*(?:mth|mths|month|months)\s+old)\s+(?:child|baby|booster|infant|toddler)\s+seat(?:s)?\b/i,
    /\b(\d{1,2}\s*(?:yr|yrs|year|years)\s+old)\s+(?:child|baby|booster|infant|toddler)\s+seat(?:s)?\b/i,
  ]);

  if (ageDescriptor) {
    const normalizedAgeDescriptor = ageDescriptor.replace(/\s+/g, " ");

    if (/(?:mth|mths|month|months)/i.test(normalizedAgeDescriptor)) {
      return `infant seat / ${normalizedAgeDescriptor}`;
    }

    return normalizedAgeDescriptor;
  }

  if (/\bbooster\s+seat(?:s)?\b/i.test(text)) {
    return "booster seat";
  }

  if (/\btoddler\s+seat(?:s)?\b/i.test(text)) {
    return "toddler seat";
  }

  if (/\b(?:infant|baby)\s+seat(?:s)?\b/i.test(text)) {
    return "infant seat";
  }

  if (/\bchild\s+seat(?:s)?\b/i.test(text)) {
    return "customer did not specify";
  }

  return "";
}

function detectChildSeatCount(text: string) {
  const explicitCount = firstMatch(text, [
    /\b(\d{1,2})\s+(?:child|baby|booster|infant|toddler)\s+seat(?:s)?\b/i,
  ]);

  if (explicitCount) {
    return String(Math.max(1, Number(explicitCount)));
  }

  if (/\b(?:a|an|one)\s+(?:child|baby|booster|infant|toddler)\s+seat\b/i.test(text)) {
    return "1";
  }

  if (/\b(?:child|baby|booster|infant|toddler)\s+seat\b/i.test(text)) {
    return "1";
  }

  return "";
}

function cleanDetectedName(value: string) {
  return clean(value)
    .replace(/\s+(?:S\$|\$)\d+(?:\.\d{1,2})?(?:\s*\+\s*(?:S\$|\$)\d+(?:\.\d{1,2})?)*\b.*$/i, "")
    .replace(/\s+\b(?:tomorrow|today|from|to|at|pickup|pick\s*up|arriving|landing|flight|transfer)\b.*$/i, "")
    .replace(/^(?:to|from|at|back|him|her|them)\s+/i, "")
    .replace(/^(?:boss|ceo|traveller|traveler)\s+/i, "")
    .replace(/^(?:mr|mrs|ms|mdm|miss|dr)\.?\s+/i, (prefix) => prefix.replace(/\./g, "").trimEnd() + " ")
    .replace(/\s+(?:pax|passenger|guest|name)$/i, "")
    .replace(/\s+(?:on|at|from|to)$/i, "")
    .replace(/[|,;.]+$/g, "")
    .trim();
}

function looksLikePersonName(value: string) {
  const cleanedValue = cleanDetectedName(value);

  if (!cleanedValue || cleanedValue.length < 2) {
    return false;
  }

  if (/^(?:guest|passenger|pax|traveller|traveler|boss|him|her|them|back|home|tmr|tomorrow|today|morn|morning|pls|please|kindly|pls do|please do)$/i.test(cleanedValue)) {
    return false;
  }

  if (/@|\d{3,}|flight|pickup|drop|airport|terminal|eta|etd|hrs?|pax|arrival|arriving|landing|transfer|tomorrow|today/i.test(cleanedValue)) {
    return false;
  }

  if (!/^(?:mr|mrs|ms|mdm|miss|dr)\.?\s+|^[A-Z]/.test(cleanedValue)) {
    return false;
  }

  return /^[A-Za-z][A-Za-z.' -]{1,60}$/.test(cleanedValue);
}

function detectNameFromNextWhatsAppLine(transcript: WhatsAppTranscript) {
  const bookingLineIndex = transcript.messages.findIndex((message) =>
    /airport\s+pick\s*up|flight|flt|\b[A-Z]{2}\s?\d{1,4}\b/i.test(message),
  );

  if (bookingLineIndex < 0) {
    return "";
  }

  const nextMessage = transcript.messages[bookingLineIndex + 1];

  if (looksLikePersonName(nextMessage)) {
    return cleanDetectedName(nextMessage);
  }

  return "";
}

function detectName(text: string, flight: string) {
  const labeledName = lineValue(text, [
    "name",
    "passenger",
    "passenger name",
    "guest",
    "guest name",
    "pax name",
  ]);

  if (looksLikePersonName(labeledName)) {
    return cleanDetectedName(labeledName);
  }

  const narratedTravelerName = detectNarratedTravelerName(text);

  if (looksLikePersonName(narratedTravelerName)) {
    return narratedTravelerName;
  }

  const inlineName = firstMatch(text, [
    /\bname\s+is\s+([A-Za-z][A-Za-z.' -]{1,60})/i,
    /\b(?:name|passenger|guest|pax name)\s*[:=-]\s*([A-Za-z][A-Za-z.' -]{1,60})/i,
    /\b(?:pax|passenger|guest)\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d|\s+on\b|\s+at\b|\s+from\b|\s+to\b|,|\.|$)/i,
    /\b(?:for|under)\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d|\s+on\b|\s+at\b|\s+from\b|\s+to\b|\s+airport\b|,|\.|$)/i,
    /^((?:mr|mrs|ms|mdm|miss|dr)\.?\s+[A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+from\b)/i,
    /^((?:mr|mrs|ms|mdm|miss|dr)\.?\s+[A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+[A-Z]{2}\s?\d{1,4}\b)/i,
    /^([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d{3,4}\s+[A-Z]{2}\s?\d{1,4}\b)/i,
    /^([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d{3,4}\s+)/i,
  ]);

  if (looksLikePersonName(inlineName)) {
    return cleanDetectedName(inlineName);
  }

  if (!flight) {
    return "";
  }

  const candidateNames = text
    .split(/\n+/)
    .map((line) => cleanDetectedName(line.replace(/^[-*]\s*/, "")))
    .filter(looksLikePersonName);

  const uniqueCandidates = Array.from(new Set(candidateNames));

  return uniqueCandidates.length === 1 ? uniqueCandidates[0] : "";
}

function detectStandbyDriver(text: string) {
  const driver = firstMatch(text, [
    /\bget\s+([A-Za-z][A-Za-z.' -]{1,60})\s+standby\b/i,
    /\bget\s+([A-Za-z][A-Za-z.' -]{1,60}?)\s+to\s+(?:drive|send)\b/i,
    /\bdriver\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+to\b|\s+for\b|,|\.|$)/i,
    /(?:^|,\s*)([A-Za-z][A-Za-z.' -]{1,60}?)\s+familiar\s+with\s+this\s+guest\b/i,
  ]);

  return looksLikePersonName(driver) ? cleanDetectedName(driver) : "";
}

function detectDrivenPassenger(text: string) {
  const name = firstMatch(text, [
    /\bdrive\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d|\s+tomorrow\b|\s+today\b|\s+from\b|\s+to\b|\s+at\b|,|\.|$)/i,
    /\bsend\s+((?:mr|mrs|ms|mdm|miss|dr)\.?\s+[A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d|\s+tomorrow\b|\s+today\b|\s+from\b|\s+to\b|\s+at\b|,|\.|$)/i,
  ]);

  return looksLikePersonName(name) ? cleanDetectedName(name) : "";
}

function detectStandbyName(text: string) {
  const name = firstMatch(text, [
    /\bstandby\s+for\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d|,|\s+there\b|\s+at\b|\.|$)/i,
    /\bfor\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d|,|\s+there\b|\s+at\b|\s+wait\b|\.|$)/i,
  ]);

  return looksLikePersonName(name) ? cleanDetectedName(name) : "";
}

function normalizeLocationName(value: string) {
  const cleanedValue = clean(value);
  const terminalMatch = cleanedValue.match(/^(?:(?:changi\s+)?airport\s*)?(?:t|terminal\s*)([1-4])$/i);

  if (terminalMatch) {
    return `Changi Airport T${terminalMatch[1]}`;
  }

  if (/^(?:changi\s+)?airport$/i.test(cleanedValue)) {
    return "Changi Airport";
  }

  return cleanedValue;
}

function detectTerminal(text: string) {
  const terminalMatch = text.match(/\b(?:terminal\s*|term\s*|t)([1-4])\b/i);

  return terminalMatch?.[1] ? `Changi Airport T${terminalMatch[1]}` : "";
}

function airportLocationFromText(text: string) {
  return detectTerminal(text) || "Changi Airport";
}

function cleanLocation(value: string) {
  return normalizeLocationName(clean(value)
    .replace(/^.*?\b(?:pickup\s+from|pick\s*up\s+from|send\s+from|from)\s+/i, "")
    .replace(/^\s*\d{3,4}\s*hrs?\s+/i, "")
    .replace(/^\s*\d{1,2}(?::?\d{2})?\s*(?:am|pm)\s+/i, "")
    .replace(/^(?:hi|hello|please|kindly|arrange|pickup|pick up|send from|pickup from|pick up from|from|to|at)\s+/i, "")
    .replace(/\s*,?\s*#\d{1,3}[-\w]*.*$/i, "")
    .replace(/\s*,\s*\d{1,4}\s+.+$/i, "")
    .replace(/\s+Singapore\s+\d{6}.*$/i, "")
    .replace(/\s+\d{6}.*$/i, "")
    .replace(/\s+on\s+\d{1,2}\s+[A-Za-z]+.*$/i, "")
    .replace(/\s+\d{3,4}\s+[A-Z]{2}\s?\d{1,4}.*$/i, "")
    .replace(/\s+[A-Z]{2}\s?\d{1,4}.*$/i, "")
    .replace(/\s+(?:taking\s+flight|flight|flt)\s*$/i, "")
    .replace(/\s+(?:taking\s+flight|flight|flt)\s+[A-Z]{2}\s?\d{1,4}.*$/i, "")
    .replace(/\s+(?:at|on)\s+\d{1,2}(?::?\d{2})?\s*(?:am|pm|hrs?)?.*$/i, "")
    .replace(/\s+\d{1,2}(?::?\d{2})?\s*(?:am|pm|hrs?)\b.*$/i, "")
    .replace(/\s+(?:one|a|an|\d{1,2})\s+stops?\s+(?:at|to|via)\s+.*$/i, "")
    .replace(/\s+(?:with|plus)\s+(?:an?\s+|one\s+|\d{1,2}\s+)?(?:child|baby|booster|infant|toddler)\s+seats?\b.*$/i, "")
    .replace(/\s+for\s+(?:dinner|wedding|event|meeting).*/i, "")
    .replace(/\s+for\s+(?:mr|mrs|ms|mdm|miss|dr|pax|passenger|guest)\b.*$/i, "")
    .replace(/\s+(?:pickup|pick\s*up|send)\s+from\b.*$/i, "")
    .replace(/\s+(?:and|then)\s+.*$/i, "")
    .replace(/\s+(?:pls|please|kindly|thanks?|thank you).*$/i, "")
    .replace(/\s+(?:AVF|Alphard|Vellfire|MPV|Sedan|Van|Vito|V-?Class)\s*$/i, "")
    .replace(/[.,;]+$/g, "")
    .trim());
}

function detectStandbyRoute(text: string) {
  const pickup = cleanLocation(
    firstMatch(text, [
      /\bfrom\s+(.+?)\s+to\s+.+?(?=\s+standby\b|\s+wait\b|\s+return\b|\s+send\b|\.|,|\n|$)/i,
      /\bat\s+(.+?)(?=,\s*#|,\s*\d|,\s*Singapore\b|,\s*send\b|,\s*stop\b|,\s*pickup\b|,\s*return\b|\s+wait\b|\s+back\s+to\b|\s+and\s+back\s+to\b|\s+and\s+please\b|\s+and\s+send\b|\.|\n|$)/i,
      /\bpick\s*up\s+again\s+(?:at|from)\s+(.+?)(?=,\s*#|,\s*\d|,\s*Singapore\b|,\s*send\b|,\s*stop\b|,\s*return\b|\s+wait\b|\s+back\s+to\b|\.|\n|$)/i,
    ]),
  );
  const primaryDropoff = cleanLocation(
    firstMatch(text, [
      /\bfrom\s+.+?\s+to\s+(.+?)(?=\s+\d{1,2}(?::?\d{2})?\s*(?:am|pm|hrs?)?\b|\s+then\b|\s+standby\b|\s+wait\b|\s+before\b|\s+return\b|\s+send(?:ing)?\b|\.|,|\n|$)/i,
    ]),
  );
  const returnDestination = cleanLocation(
    firstMatch(text, [
      /\breturn\s+(?:hotel|home)\s+(.+?)(?=\s+after\b|\.|,|$)/i,
      /\breturn\s+to\s+(.+?)(?=\s+after\b|\.|,|$)/i,
      /\bstandby\s+till\s+\d{1,2}(?::?\d{2})?\s*(?:am|pm|hrs?)?.*?\b(?:return|back)\s+(?:to\s+)?(.+?)(?=\.|,|$)/i,
      /\bback\s+to\s+(.+?)(?=\s+after\b|\.|,|$)/i,
      /\bsend\s+back\s+to\s+(.+?)(?=\s+after\b|\.|,|$)/i,
      /\bsend(?:ing)?\s+(?:him|her|them|passenger|guest)\s+back\s+to\s+(.+?)(?=\s+after\b|\.|,|$)/i,
    ]),
  );
  const standbyUntilRaw = firstMatch(text, [
    /\bstandby\s+till\s+(\d{1,2}(?::?\d{2})?\s*(?:am|pm|hrs?)?)\b/i,
    /\bstandby\s+until\s+(\d{1,2}(?::?\d{2})?\s*(?:am|pm|hrs?)?)\b/i,
    /\bwait\s+till\s+(\d{1,2}(?::?\d{2})?\s*(?:am|pm|hrs?)?)\b/i,
    /\bwait\s+until\s+(\d{1,2}(?::?\d{2})?\s*(?:am|pm|hrs?)?)\b/i,
  ]);
  const standbyUntil = standbyUntilRaw
    ? formatTimeForState(parseTimeFromText(standbyUntilRaw) || standbyUntilRaw)
    : "";

  return {
    pickup,
    dropoff: primaryDropoff || returnDestination,
    returnDestination,
    standbyUntil,
  };
}

function isStandbyBooking(text: string) {
  return /\bstandby\b|\bdisposal\b|\bhourly\b|\bdinner\b|\bwedding\b|\bevent\b|\bwait\s+\d+\s*(?:hours?|hrs?)\b|\breturn\s+to\b|\bsend\s+(?:him|her|them|passenger|guest|boss)\s+back\b|\bback\s+to\b/i.test(
    text,
  );
}

function isConversationalRouteText(text: string) {
  return /\b(?:hi|hello|please|kindly|thanks?|thank you|get|standby|there is|dinner|wedding|event|send|arrange)\b/i.test(
    text,
  );
}

function detectBookingType(text: string, flight = "", route: { pickup: string; dropoff: string } = { pickup: "", dropoff: "" }) {
  const upperText = text.toUpperCase();
  const pickup = clean(route.pickup);
  const dropoff = clean(route.dropoff);

  if (/\bDSP\b|\bDISPOSAL\b|\bHOURLY\b/.test(upperText) || isStandbyBooking(text)) {
    return "DSP";
  }

  if (/\bDEP\b|\bDEPARTURE\b|\bDEPART\b/.test(upperText)) {
    return "DEP";
  }

  if (
    /\bARRIV(?:AL|ING|ES?)\b|\bAIRPORT\s+PICK\s*UP\b|\bAIRPORT\s+P\/U\b|\bPICK\s*UP\s+FROM\s+AIRPORT\b|\bETA\b|\bLANDING\b|\bFLIGHT\s+ARRIVES?\b|\bMEET\s*(?:AND|&)\s*GREET\b|\bMNG\b/.test(
      upperText,
    )
  ) {
    return "MNG";
  }

  if (
    /\bDROP\s*OFF\s+(?:AT\s+)?AIRPORT\b|\bAIRPORT\s+DROP\s*OFF\b|\bTO\s+AIRPORT\b|\bETD\b|\bFLIGHT\s+DEPARTURE\b|\bTAKING\s+(?:FLIGHT\s+)?[A-Z]{2}\s?\d{1,4}\b|\bTAKING\s+FLIGHT\b/.test(
      upperText,
    )
  ) {
    return "DEP";
  }

  if (flight) {
    if (/\bairport\s+to\b/i.test(text)) {
      return "MNG";
    }

    const routeMatch = text.match(/(.+?)\s*(?:>|->|=>)\s*(.+)/i);
    const routeLeft = clean(routeMatch?.[1] || "");
    const routeRight = clean(routeMatch?.[2] || "");

    if (normalizeFlightCode(routeLeft.replace(/^.*\n/, "")) === flight) {
      return "MNG";
    }

    if (normalizeFlightCode(routeRight.split(/\s+/)[0]) === flight || /^t(?:erminal\s*)?[1-4]\b/i.test(routeRight)) {
      return "DEP";
    }

    if (/^changi airport/i.test(pickup) || normalizeFlightCode(pickup) === flight) {
      return "MNG";
    }

    if (/^changi airport/i.test(dropoff) || normalizeFlightCode(dropoff) === flight) {
      return "DEP";
    }
  }

  if (/\bTRF\b|\bTRANSFER\b/.test(upperText)) {
    return "TRF";
  }

  if (pickup && dropoff && !flight && !/^changi airport/i.test(pickup) && !/^changi airport/i.test(dropoff)) {
    return "TRF";
  }

  return "";
}

function detectVehicle(text: string) {
  const upperText = text.toUpperCase();

  if (/\bAVF\b|\bALPHARD\b|\bVELLFIRE\b|\bMPV\b/.test(upperText)) {
    return "AVF";
  }

  if (/\bS-?CLASS\b|\bMERC(?:EDES)?\b|\bSEDAN\b|\bLIMO\b/.test(upperText)) {
    return "Sedan";
  }

  if (/\bVITO\b|\bV-?CLASS\b|\bVAN\b|\bMINIBUS\b/.test(upperText)) {
    return "Van";
  }

  return "";
}

function detectBookerValue(text: string, context: { booker: string; company: string }) {
  const labeledBooker = lineValue(text, ["booker", "booked by", "requestor", "requested by"]);

  if (labeledBooker && /\bfrom\b/i.test(labeledBooker)) {
    const inlineContext = detectBookerCompanyContext(`Booker: ${labeledBooker}`);

    if (inlineContext.booker) {
      return inlineContext.booker;
    }
  }

  return labeledBooker || context.booker || detectNarratedBooker(text);
}

function detectRoute(text: string, flight = "") {
  const pickup = cleanedLineValue(text, ["pickup", "pick up", "p/u", "pu", "from", "origin"]);
  const dropoff = cleanedLineValue(text, [
    "dropoff",
    "drop off",
    "drop-off",
    "d/o",
    "do",
    "to",
    "destination",
  ]);

  if (pickup || dropoff) {
    return { pickup, dropoff };
  }

  const routeMatch = text.match(/(.+?)\s*(?:>|->|=>)\s*(.+)/i);
  if (routeMatch?.[1] && routeMatch?.[2]) {
    const routePickup = clean(routeMatch[1].split("\n").pop() || "").replace(/^.*?\b\d{3,4}\s*(?:hrs?)?\s+/, "");
    const routeDropoff = clean(routeMatch[2].split("\n")[0] || "");
    const leftFlight = normalizeFlightCode(routePickup);
    const rightFlight = normalizeFlightCode(routeDropoff);

    if (flight && leftFlight === flight) {
      return {
        pickup: airportLocationFromText(text),
        dropoff: cleanLocation(routeDropoff),
      };
    }

    if (flight && rightFlight === flight) {
      return {
        pickup: cleanLocation(routePickup),
        dropoff: airportLocationFromText(text),
      };
    }

    if (flight && /^t(?:erminal\s*)?[1-4]\b/i.test(routeDropoff)) {
      return {
        pickup: cleanLocation(routePickup),
        dropoff: normalizeLocationName(routeDropoff),
      };
    }

    return {
      pickup: cleanLocation(routePickup),
      dropoff: cleanLocation(routeDropoff),
    };
  }

  if (isStandbyBooking(text)) {
    const standbyRoute = detectStandbyRoute(text);

    if (standbyRoute.pickup || standbyRoute.dropoff) {
      return standbyRoute;
    }
  }

  const fromToMatch = text.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?=\.|,|\n|$)/i);
  if (fromToMatch?.[1] && fromToMatch?.[2]) {
    return {
      pickup: cleanLocation(fromToMatch[1]),
      dropoff: cleanLocation(fromToMatch[2]),
    };
  }

  const pickupToMatch = text.match(
    /\b(?:pick\s*up|pickup)\s+(?:from\s+)?(.+?)\s+to\s+(.+?)(?=\.|,|\n|$)/i,
  );
  if (pickupToMatch?.[1] && pickupToMatch?.[2] && !/\bairport\b/i.test(text)) {
    return {
      pickup: cleanLocation(pickupToMatch[1]),
      dropoff: cleanLocation(pickupToMatch[2]),
    };
  }

  if (
    /\bairport\s+pick\s*up\b|\bairport\s+p\/u\b|\bpick\s*up\s+from\s+airport\b|\barriv(?:al|ing|es?)\b|\blanding\b|\bETA\b/i.test(
      text,
    )
  ) {
    const dropoffAfterAirport = cleanLocation(firstMatch(text, [
      /\bairport\s+pick\s*up\b.*?\bto\s+(.+?)(?=\.|,|\n|$)/i,
      /\bairport\s+pickup\b.*?\bto\s+(.+?)(?=\.|,|\n|$)/i,
      /\bairport\s+p\/u\b.*?\bto\s+(.+?)(?=\.|,|\n|$)/i,
      /\bpick\s*up\s+from\s+airport\b.*?\bto\s+(.+?)(?=\.|,|\n|$)/i,
      /\bairport\s+t(?:erminal\s*)?[1-4]\s+to\s+(.+?)(?=\.|,|\n|$)/i,
      /\b(?:arriv(?:al|ing|es?)|landing|ETA|flight\s+arrives?)\b.*?\bto\s+(.+?)(?=\.|,|\n|$)/i,
      /\b(?:will\s+be\s+|be\s+)?staying\s+at\s+(?:the\s+)?(.+?)(?=\.|,|\n|$)/i,
      /\bstay(?:ing)?\s+at\s+(?:the\s+)?(.+?)(?=\.|,|\n|$)/i,
      /\bstaying\s+in\s+(?:the\s+)?(.+?)(?=\.|,|\n|$)/i,
    ]));

    return {
      pickup: airportLocationFromText(text),
      dropoff: dropoffAfterAirport,
    };
  }

  if (flight && /\bairport\s+to\b/i.test(text)) {
    const airportDestination = cleanLocation(firstMatch(text, [
      /\bairport\s+to\s+(.+?)(?=\.|,|\n|$)/i,
    ]));

    return {
      pickup: airportLocationFromText(text),
      dropoff: airportDestination,
    };
  }

  if (/\b(?:to\s+airport|airport\s+drop\s*off|drop\s*off\s+(?:at\s+)?airport)\b/i.test(text)) {
    const pickupBeforeAirport = cleanLocation(firstMatch(text, [
      /\bfrom\s+(.+?)\s+to\s+(?:changi\s+)?airport\b/i,
      /\bpick\s*up\s+(?:from\s+)?(.+?)\s+to\s+(?:changi\s+)?airport\b/i,
    ]));
    return {
      pickup: pickupBeforeAirport,
      dropoff: airportLocationFromText(text),
    };
  }

  const homeDestination = cleanLocation(firstMatch(text, [
    /\b(?:go|send|head)\s+home\s+(.+?)(?=\.|,|\n|$)/i,
    /\bto\s+home\s+(?!on\b|today\b|tomorrow\b)(.+?)(?=\.|,|\n|$)/i,
  ]));

  if (homeDestination) {
    return {
      pickup: "",
      dropoff: homeDestination,
    };
  }

  const toRouteMatch = text.match(/^(.+?)\s+to\s+(.+)$/i);
  if (
    toRouteMatch?.[1] &&
    toRouteMatch?.[2] &&
    text.length < 80 &&
    !isConversationalRouteText(text)
  ) {
    return {
      pickup: cleanLocation(toRouteMatch[1]),
      dropoff: cleanLocation(toRouteMatch[2]),
    };
  }

  return { pickup: "", dropoff: "" };
}

export function parseBookingMessage(text: string, options: ParseBookingOptions = {}): ParsedBooking | null {
  const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const normalizedText = text.replace(/\r/g, "\n");
  const cleanedLines = getWhatsAppCleanedLines(normalizedText);
  const whatsappTranscript = parseWhatsAppTranscript(normalizedText);
  const operationalText = normalizeIntentText(cleanedLines.length ? cleanedLines.join("\n") : normalizedText);
  const quotedCustomerPrice = detectQuotedCustomerPrice(cleanedLines);
  const multipleBookingsDetected = detectMultipleBookings(operationalText, cleanedLines);
  if (multipleBookingsDetected) {
    const bookerCompanyContext = detectBookerCompanyContext(operationalText);

    return {
      success: false,
      company: bookerCompanyContext.company,
      booker: bookerCompanyContext.booker,
      multipleBookingsDetected: true,
      parserWarning: "Multiple bookings detected. Please select one extracted booking.",
      extractedBookingsPreview: buildExtractedBookingsPreview(operationalText, cleanedLines, referenceDate),
      cleanedLines,
    };
  }

  const email = firstMatch(normalizedText, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i]);
  const domain = getEmailDomain(email);
  const bookerCompanyContext = detectBookerCompanyContext(operationalText);
  const dateText = lineValue(operationalText, ["date", "pickup date", "p/u date", "pu date"]);
  const flight = detectFlight(operationalText);
  const routeValues = detectRoute(operationalText, flight);
  const standbyRouteDetails = isStandbyBooking(operationalText)
    ? detectStandbyRoute(operationalText)
    : { pickup: "", dropoff: "", returnDestination: "", standbyUntil: "" };
  const name =
    detectStandbyName(operationalText) ||
    detectDrivenPassenger(operationalText) ||
    detectName(operationalText, flight) ||
    detectNameFromCleanedLines(cleanedLines) ||
    detectNameFromNextWhatsAppLine(whatsappTranscript) ||
    "";
  const standbyDriver = detectStandbyDriver(operationalText);
  const rawTime = parseTimeFromText(operationalText);
  const childSeatType = detectChildSeatType(operationalText);
  const childSeatCount = detectChildSeatCount(operationalText);
  const extraStopDetails = detectExtraStopDetails(operationalText);
  const bookingType =
    lineValue(operationalText, ["booking type", "type", "job type"]) ||
    detectBookingType(operationalText, flight, routeValues);

  const parsedBooking: ParsedBooking = {
    success: true,
    company:
      lineValue(operationalText, ["company", "client", "account"]) ||
      bookerCompanyContext.company ||
      whatsappTranscript.senderCompany ||
      domain,
    bookingType,
    vehicle:
      cleanVehicle(lineValue(operationalText, ["vehicle", "car", "vehicle type"])) || detectVehicle(operationalText),
    date: parseDateFromText(dateText || operationalText, referenceDate),
    time: formatTimeForState(rawTime) || rawTime,
    flight,
    pickup: routeValues.pickup,
    dropoff: routeValues.dropoff,
    booker:
      detectBookerValue(operationalText, bookerCompanyContext) ||
      whatsappTranscript.senderName,
    bookerEmail: email,
    name,
    pax:
      firstMatch(operationalText, [
        /\b(?:pax|passengers?|persons?)\s*[:=-]?\s*(\d{1,2})\b/i,
        /\b(\d{1,2})\s*(?:pax|passengers?|persons?)\b/i,
      ]) ||
      (detectCoupleCompanion(operationalText) ? "2" : "") ||
      "1",
    driverName: lineValue(operationalText, ["driver", "driver name", "chauffeur"]) || standbyDriver,
    driverContact: lineValue(operationalText, [
      "driver contact",
      "driver phone",
      "chauffeur contact",
    ]),
    ...(quotedCustomerPrice.customerPriceOverride
      ? {
          customerPriceOverride: quotedCustomerPrice.customerPriceOverride,
          customerPriceOverrideReason: quotedCustomerPrice.customerPriceOverrideReason,
        }
      : {}),
    ...(childSeatCount
      ? {
          childSeatRequired: "yes",
          childSeatCount,
        }
      : {}),
    ...(childSeatType ? { childSeatType } : {}),
    ...(extraStopDetails.extraStopCount
      ? {
          extraStopCount: extraStopDetails.extraStopCount,
        }
      : {}),
    ...(extraStopDetails.extraStopLocation
      ? {
          extraStopLocation: extraStopDetails.extraStopLocation,
        }
      : {}),
    ...(standbyRouteDetails.returnDestination &&
    standbyRouteDetails.returnDestination !== routeValues.dropoff
      ? { returnDestination: standbyRouteDetails.returnDestination }
      : {}),
    ...(standbyRouteDetails.standbyUntil ? { standbyUntil: standbyRouteDetails.standbyUntil } : {}),
    bookerContact: lineValue(operationalText, [
      "booker contact",
      "booker whatsapp",
      "booker phone",
      "requestor contact",
      "contact",
      "phone",
      "whatsapp",
    ]),
    cleanedLines,
  };
  const pronounReturnWithoutName =
    /\bsend\s+(?:him|her|them|passenger|guest|boss)\s+back\b/i.test(operationalText) &&
    !parsedBooking.name;
  const missingCriticalFields = [
    pronounReturnWithoutName && !parsedBooking.pickup ? "pickup" : "",
    pronounReturnWithoutName && !parsedBooking.time ? "pickup time" : "",
    pronounReturnWithoutName ? "passenger/name" : "",
    parsedBooking.pickup || parsedBooking.dropoff || parsedBooking.flight ? "" : "route",
  ].filter(Boolean);

  if (missingCriticalFields.length > 0 && (bookingType || name || flight || routeValues.pickup || routeValues.dropoff)) {
    parsedBooking.parserWarning = `Missing critical fields: ${missingCriticalFields.join(", ")}`;
  }

  const detectedFields = Object.values(parsedBooking).filter(hasParsedValue).length;

  return detectedFields > 0 ? parsedBooking : null;
}

export function formatParsedPickupTime(value: string | undefined) {
  const digits = (value ?? "").trim().replace(/\D/g, "");

  if (digits.length >= 4) {
    return `${digits.slice(0, 2)}${digits.slice(2, 4)}hrs`;
  }

  if (digits.length > 0) {
    return `${digits.padStart(2, "0")}00hrs`;
  }

  return value;
}

export function mergeParsedBookingState(
  currentBooking: BookingFormState,
  parsedBooking: ParsedBooking,
) {
  const normalizedParsedBooking: ParsedBooking = {
    ...parsedBooking,
    time: parsedBooking.time ? formatParsedPickupTime(parsedBooking.time) : parsedBooking.time,
  };

  return {
    ...currentBooking,
    ...(Object.fromEntries(
      Object.entries(normalizedParsedBooking).filter(([key, value]) =>
        !["success", "extractedBookingsPreview", "parserWarning", "multipleBookingsDetected", "standbyUntil", "returnDestination"].includes(key) &&
        (key === "time" ? value !== undefined : hasParsedValue(value)),
      ),
    ) as ParsedBooking),
  };
}
