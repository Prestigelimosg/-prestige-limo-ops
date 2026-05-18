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
    company?: string;
    booker?: string;
    vehicle?: string;
    date?: string;
    time?: string;
    type?: string;
    flight?: string;
    pickup?: string;
    dropoff?: string;
    pax?: string;
    extraStopCount?: string;
    extraStopLocation?: string;
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

type MultiStopItineraryStop = {
  location: string;
  time: string;
  timeQualifier: "at" | "by";
};

type MultiStopItineraryDetails = {
  pickup: string;
  dropoff: string;
  pickupTime: string;
  extraStopCount: string;
  extraStopLocation: string;
};

type TerminalFlightLineDetails = {
  passenger: string;
  flight: string;
  pickup: string;
  time: string;
  pax: string;
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
const publicEmailDomains = new Set([
  "126.com",
  "163.com",
  "aol.com",
  "daum.net",
  "fastmail.com",
  "gmail.com",
  "gmx.com",
  "gmx.net",
  "googlemail.com",
  "hanmail.net",
  "hey.com",
  "hotmail.com",
  "icloud.com",
  "kakao.com",
  "live.com",
  "mac.com",
  "mail.com",
  "me.com",
  "msn.com",
  "naver.com",
  "outlook.com",
  "pm.me",
  "proton.me",
  "protonmail.com",
  "qq.com",
  "rediffmail.com",
  "rocketmail.com",
  "sina.com",
  "tutanota.com",
  "tutamail.com",
  "yahoo.com",
  "yahoo.com.sg",
  "yandex.com",
  "yandex.ru",
  "ymail.com",
  "zoho.com",
]);
const internalPrestigeEmailDomains = new Set([
  "prestige-limo.sg",
  "prestigelimo.sg",
  "prestigetransport.sg",
]);
const ownCompanyNames = new Set(["prestige transport"]);
const countryCodeSecondLevelDomains = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "org",
]);

const ignoredFlightCodes = new Set(["AT", "BY", "IF", "IN", "IS", "NO", "OF", "ON", "OR", "TO"]);
const flightCodePattern = /\b([A-Z]{2})\s?(\d{1,4})\b/gi;
const whatsAppSenderLinePattern = /^\[\d[^\]]*\/[^\]]+\]\s+([^:]+):\s*(.+)$/;

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

function isIgnoredAccountEmailDomain(value: string) {
  return publicEmailDomains.has(value) || internalPrestigeEmailDomains.has(value);
}

function getEmailDomain(value: string) {
  const email = normaliseEmail(value);
  const domain = email.split("@")[1];

  if (!domain) {
    return "";
  }

  const normalizedDomain = domain.replace(/^www\./, "");

  if (isIgnoredAccountEmailDomain(normalizedDomain)) {
    return "";
  }

  const domainParts = normalizedDomain.split(".").filter(Boolean);
  const suffix = domainParts[domainParts.length - 1] || "";
  const secondLevel = domainParts[domainParts.length - 2] || "";
  const organization =
    domainParts.length >= 3 && suffix.length === 2 && countryCodeSecondLevelDomains.has(secondLevel)
      ? domainParts[domainParts.length - 3]
      : domainParts.length > 1 ? secondLevel : domainParts[0];

  return organization ? organization.toUpperCase() : "";
}

function getEmailBooker(value: string) {
  const localPart = normaliseEmail(value).split("@")[0] || "";
  const firstToken = localPart.split(/[._+-]/)[0] || "";

  return firstToken;
}

function cleanCompanyAccount(value: string) {
  const company = clean(value).replace(/[|,;.]+$/g, "");

  return ownCompanyNames.has(company.toLowerCase()) ? "" : company;
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

  if (!/\b(?:airport|arrival|arriving|arrives?|departure|depart|drop\s*off|pick\s*up|pickup|eta|etd|landing|flight|flt|taking|mng)\b|>|->|=>/i.test(text)) {
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
    /^(?:name|passenger|passenger name|guest|guest name|pax name|principal|traveller|traveler)\s*[:=-]\s*([A-Za-z][A-Za-z.' -]{1,60})$/i,
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
  const structuredBookingForm = /\bbooking\s+form\s+name\s*[:=-]|\broute\s+name\s*[:=-]|\bclient\s+details\s*:/i.test(text);
  const listItems = structuredBookingForm
    ? []
    : cleanedLines.filter((line) => /^(?:\d+[.)]\s+|[-*•]\s+)/.test(line));
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

  if (detectNumberedDriverItinerary(text)) {
    return false;
  }

  return hasCrewTransferRequestSections(text) ||
    listItems.length > 1 ||
    flights.length > 1 ||
    namedPassengers.length > 1 ||
    multiLegAirportStandby;
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

function detectSharedArrivalDropoff(text: string) {
  return cleanLocation(firstMatch(text, [
    /\btotal\s+\d+\s+pickups?\s+from\s+.+?\s+to\s+(.+?)(?=\s+below:?|\n|$)/i,
    /\bpickups?\s+from\s+.+?\s+to\s+(.+?)(?=\s+below:?|\n|$)/i,
  ]));
}

function detectTerminalFlightLineDetails(text: string, selectedFlight = ""): TerminalFlightLineDetails | null {
  const lines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(?:changi\s+airport\s*)?(?:t|terminal\s*)([1-4])\s*[:=-]\s*([A-Z]{2}\s?\d{1,4})\b/i);

    if (!match?.[1] || !match[2]) {
      continue;
    }

    const flight = normalizeFlightCode(match[2]);

    if (!flight || (selectedFlight && flight !== selectedFlight)) {
      continue;
    }

    const passengerList = firstMatch(line, [
      /\(\s*\d{1,2}\s*passengers?\s*[-–]\s*([^)]+)\)/i,
      /\bpassengers?\s*[-–]\s*([^)]+)\)/i,
    ]);
    const passenger = cleanDetectedName(passengerList.split(",")[0] || passengerList);

    return {
      passenger: looksLikePersonName(passenger) ? passenger : "",
      flight,
      pickup: `Changi Airport T${match[1]}`,
      time: formatTimeForState(parseTimeFromText(line)),
      pax: detectExplicitPax(line),
    };
  }

  return null;
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

function detectSignatureBooker(text: string) {
  const signatureName = firstMatch(text, [
    /\b(?:thank\s+you|thanks(?:\s+and\s+regards)?|regards|best),?\s*\n+\s*([A-Z][A-Za-z.' -]{2,60})(?=\n|$)/i,
  ]);

  return looksLikePersonName(signatureName) ? cleanDetectedName(signatureName) : "";
}

function splitCrewTransferRequestSections(text: string) {
  const sectionMatches = Array.from(text.matchAll(/(?:^|\n)\s*For\s+([^:\n]+):\s*/gi));

  if (sectionMatches.length < 2) {
    return [];
  }

  return sectionMatches
    .map((match, index) => {
      const nextMatch = sectionMatches[index + 1];
      const segment = text.slice(match.index ?? 0, nextMatch?.index ?? text.length);

      return clean(segment);
    })
    .filter((segment) =>
      /\bcrew\s+name\s*(?:\([^)]+\))?\s*:/i.test(segment) &&
      /\bnumber\s+of\s+crew\s*:/i.test(segment) &&
      /\bpick\s*up\s*time\s*:/i.test(segment),
    );
}

function hasCrewTransferRequestSections(text: string) {
  return splitCrewTransferRequestSections(text).length > 1;
}

function normalizeCrewCount(value: string) {
  const count = Number(firstMatch(value, [/\b0*(\d{1,2})\b/]));

  return Number.isFinite(count) && count > 0 ? String(count) : "";
}

function normalizeParenthesizedAddress(value: string) {
  return clean(value)
    .replace(/\s*\(\s*([^)]+?)\s*\)\s*$/g, ", $1")
    .replace(/\bAve\./gi, "Ave")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function detectSharedTransferRequestContext(text: string) {
  const email = firstMatch(text, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i]);
  const company = cleanCompanyAccount(lineValue(text, ["company", "client", "account"])) || getEmailDomain(email);
  const passenger = detectName(text, "") || cleanDetectedName(lineValue(text, ["passenger", "passenger name"]));
  const booker = detectBookerValue(text, { booker: "", company }) || detectSignatureBooker(text);
  const vehicle = cleanVehicle(lineValue(text, ["vehicle type", "vehicle", "car", "vehicle name"])) || detectVehicle(text);

  return {
    company,
    passenger: looksLikePersonName(passenger) ? cleanDetectedName(passenger) : "",
    booker,
    vehicle,
  };
}

function buildCrewTransferRequestPreview(text: string, referenceDate: Date) {
  const crewSections = splitCrewTransferRequestSections(text);

  if (crewSections.length < 2) {
    return [];
  }

  const sharedContext = detectSharedTransferRequestContext(text);

  return crewSections.map((section) => {
    const pickupTimeText = lineValue(section, ["pick up time", "pickup time", "p/u time", "pu time", "time"]);
    const rawRoute = detectRoute(section, "");
    const passenger = clean(lineValue(section, ["crew name (s)", "crew name(s)", "crew names", "crew name"]));
    const pax = normalizeCrewCount(lineValue(section, ["number of crew", "crew count"]));
    const vehicle = cleanVehicle(lineValue(section, ["vehicle type", "vehicle", "car", "vehicle name"])) ||
      detectVehicle(section) ||
      sharedContext.vehicle;
    const rawTime = parseTimeFromText(pickupTimeText || section);
    const type = detectBookingType(section, "", rawRoute) || "TRF";

    return {
      passenger,
      company: sharedContext.company,
      booker: sharedContext.booker,
      vehicle,
      date: parseDateFromText(pickupTimeText || section, referenceDate),
      time: formatTimeForState(rawTime) || rawTime,
      type,
      flight: "",
      pickup: rawRoute.pickup,
      dropoff: rawRoute.dropoff,
      ...(pax ? { pax } : {}),
    };
  });
}

function buildSeparatedTransferRequestPreview(text: string, referenceDate: Date) {
  if (!/\n\s*={3,}\s*\n/.test(text)) {
    return [];
  }

  const rawSegments = text
    .split(/\n\s*={3,}\s*\n/g)
    .map((segment) => clean(segment))
    .filter(Boolean);

  if (rawSegments.length < 2) {
    return [];
  }

  const sharedContext = detectSharedTransferRequestContext(text);
  const bookingSegments = rawSegments
    .map((segment, index) => {
      if (index === 0) {
        const pickupDateIndex = segment.search(/\bpickup\s+date\s*[:=-]/i);

        return pickupDateIndex >= 0 ? segment.slice(pickupDateIndex) : segment;
      }

      return segment
        .replace(/\n+\s*(?:thank\s+you|thanks|regards|best),?\s*\n+[\s\S]*$/i, "")
        .trim();
    })
    .filter((segment) => /\bpickup\s+date\s*[:=-]/i.test(segment));

  if (bookingSegments.length < 2) {
    return [];
  }

  return bookingSegments.map((segment) => {
    const segmentText = normalizeIntentText(segment);
    const flight = detectFlight(segmentText);
    const rawRoute = detectRoute(segmentText, flight);
    const route = {
      pickup: normalizeParenthesizedAddress(rawRoute.pickup),
      dropoff: normalizeParenthesizedAddress(rawRoute.dropoff),
    };
    const type = lineValue(segmentText, ["booking type", "type", "job type"]) ||
      detectBookingType(segmentText, flight, route);
    const dateText = lineValue(segmentText, ["pickup date", "date"]);
    const rawTime = parseTimeFromText(segmentText);

    return {
      passenger: sharedContext.passenger,
      company: sharedContext.company,
      booker: sharedContext.booker,
      vehicle: sharedContext.vehicle,
      date: parseDateFromText(dateText || segmentText, referenceDate),
      time: formatTimeForState(rawTime) || rawTime,
      type,
      flight,
      pickup: route.pickup,
      dropoff: route.dropoff,
    };
  });
}

function buildExtractedBookingsPreview(text: string, cleanedLines: string[], referenceDate: Date) {
  const hasExplicitList = cleanedLines.filter((line) => /^(?:\d+[.)]\s+|[-*•]\s+)/.test(line)).length > 1;
  const hasMultipleFlights = detectAllFlights(text).length > 1;
  const airportStandbyPreview = hasExplicitList || hasMultipleFlights ? [] : buildAirportStandbyPreview(text, referenceDate);
  const crewTransferPreview = buildCrewTransferRequestPreview(text, referenceDate);
  const separatedTransferPreview = buildSeparatedTransferRequestPreview(text, referenceDate);
  const contextDate = parseDateFromText(text, referenceDate);
  const sharedArrivalDropoff = detectSharedArrivalDropoff(text);

  if (crewTransferPreview.length > 0) {
    return crewTransferPreview;
  }

  if (separatedTransferPreview.length > 0) {
    return separatedTransferPreview;
  }

  if (airportStandbyPreview.length > 0) {
    return airportStandbyPreview;
  }

  return splitPotentialBookings(text, cleanedLines)
    .map((segment) => {
      const segmentText = normalizeIntentText(segment);
      const flight = detectFlight(segmentText);
      const terminalFlightDetails = detectTerminalFlightLineDetails(segmentText, flight);
      const route = detectRoute(segmentText, flight);
      const type = lineValue(segmentText, ["booking type", "type", "job type"]) ||
        detectBookingType(segmentText, flight, route);
      const date = parseDateFromText(segmentText, referenceDate) || contextDate;
      const rawTime = terminalFlightDetails?.time || parseTimeFromText(segmentText);
      const passenger =
        terminalFlightDetails?.passenger ||
        detectStandbyName(segmentText) ||
        detectDrivenPassenger(segmentText) ||
        detectName(segmentText, flight) ||
        "";
      const departureTerminal = flight && type === "DEP" ? airportLocationFromText(segmentText) : "";
      const dropoff = route.dropoff || (terminalFlightDetails ? sharedArrivalDropoff : "");
      const pax = terminalFlightDetails?.pax || detectExplicitPax(segmentText);

      return {
        passenger,
        date,
        time: formatTimeForState(rawTime) || rawTime,
        type,
        flight,
        pickup: terminalFlightDetails?.pickup || route.pickup,
        dropoff: departureTerminal || dropoff,
        ...(pax ? { pax } : {}),
        ...(terminalFlightDetails ? { extraStopCount: "0", extraStopLocation: "" } : {}),
      };
    })
    .filter((preview) => Object.values(preview).some(Boolean));
}

function lineValue(text: string, labels: string[]) {
  const lines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";

    for (const label of labels) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`^${escapedLabel}(?:\\s*[:=-]\\s*|\\t+)(.*)$`, "i");
      const match = line.match(pattern);

      if (match?.[1]) {
        return clean(match[1]);
      }

      if (match && !match[1]) {
        const nextLine = lines[index + 1] || "";

        if (nextLine && !/^[A-Za-z][A-Za-z0-9 /&().'-]{0,50}\s*[:=-]/.test(nextLine)) {
          return clean(nextLine);
        }
      }

      if (/\s/.test(label) && new RegExp(`^${escapedLabel}\\s*$`, "i").test(line)) {
        const nextLine = lines[index + 1] || "";

        if (nextLine && !/^[A-Za-z][A-Za-z0-9 /&().'-]{0,50}(?:\s*[:=-]|\t)/.test(nextLine)) {
          return clean(nextLine);
        }
      }
    }
  }

  return "";
}

function cleanedLineValue(text: string, labels: string[]) {
  return cleanLocation(lineValue(text, labels));
}

function cleanStructuredListLocation(value: string) {
  const cleanedValue = clean(value).replace(/^\d+[.)]\s*/, "");
  const koreanSingaporeMatch = cleanedValue.match(/^(.*?),?\s*싱가포르\s+(.+)$/i);

  if (koreanSingaporeMatch?.[1] && koreanSingaporeMatch[2]) {
    const beforeKorean = clean(koreanSingaporeMatch[1]).replace(/,\s*$/g, "");
    const afterKorean = clean(koreanSingaporeMatch[2]);

    if (afterKorean.toLowerCase().startsWith(beforeKorean.toLowerCase())) {
      return normalizeLocationName(afterKorean);
    }

    return normalizeLocationName(`${beforeKorean}, ${afterKorean}`);
  }

  const repeatedSingaporeAddressMatch = cleanedValue.match(/^(.+?\bSingapore)\s+(.+\bSingapore\b(?:\s+\d{5,6})?.*)$/i);

  if (repeatedSingaporeAddressMatch?.[1] && repeatedSingaporeAddressMatch[2]) {
    const firstAddress = clean(repeatedSingaporeAddressMatch[1]);
    const secondAddress = clean(repeatedSingaporeAddressMatch[2]);
    const normalizedFirst = normalizeAddressForComparison(firstAddress);
    const normalizedSecond = normalizeAddressForComparison(secondAddress);

    if (normalizedFirst.length >= 8 && normalizedSecond.startsWith(normalizedFirst)) {
      return normalizeLocationName(secondAddress);
    }
  }

  return normalizeLocationName(cleanedValue);
}

function structuredListLocations(text: string, labels: string[]) {
  const lines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean);
  const sortedLabels = [...labels].sort((left, right) => right.length - left.length);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";

    for (const label of sortedLabels) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const labeledLineMatch = line.match(new RegExp(`^${escapedLabel}(?:\\s*[:=-]\\s*|\\t+)?(.*)$`, "i"));

      if (!labeledLineMatch) {
        continue;
      }

      const values = [];
      const inlineValue = clean(labeledLineMatch[1] || "");

      if (inlineValue) {
        values.push(inlineValue);
      }

      for (let valueIndex = index + 1; valueIndex < lines.length; valueIndex += 1) {
        const valueLine = lines[valueIndex] || "";

        if (
          /^[A-Za-z][A-Za-z0-9 /&().'-]{0,50}(?:\s*[:=-]|\t)/.test(valueLine) ||
          /^[A-Z][A-Z0-9 /&().'-]{1,60}$/.test(valueLine)
        ) {
          break;
        }

        values.push(valueLine);
      }

      return values
        .map((value) => cleanStructuredListLocation(value))
        .filter(Boolean)
        .join(" > ");
    }
  }

  return "";
}

function normalizeAddressForComparison(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/\broad\b/g, "rd")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
    const match = line.match(whatsAppSenderLinePattern);

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
      const match = line.match(whatsAppSenderLinePattern);

      return clean(match?.[2] || line);
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

  const shortNumericMatch = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/);
  if (shortNumericMatch) {
    return `20${shortNumericMatch[3]}-${shortNumericMatch[2].padStart(2, "0")}-${shortNumericMatch[1].padStart(
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

  const monthFirstMatch = text.match(
    /\b(?:(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s*,\s*)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(20\d{2}))?\b/i,
  );
  if (monthFirstMatch) {
    const month = monthLookup[monthFirstMatch[1].toLowerCase()];
    const year = monthFirstMatch[3] || String(referenceDate.getFullYear());

    return `${year}-${month}-${monthFirstMatch[2].padStart(2, "0")}`;
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
    .replace(/\bm\s*&\s*g\b/gi, "MNG")
    .replace(/\bmeet(?:\s|-)*(?:and|&)(?:\s|-)*greet\b/gi, "MNG")
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
  const labeledDateTime = firstMatch(text, [
    /\bpickup\s+date\s+and\s+time(?:\s*[:=-]\s*|\s+)\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s+(\d{1,2}:\d{2}\s*(?:am|pm|hrs?)?)/i,
  ]);
  const labeledDatePipeTime = firstMatch(text, [
    /\b(?:pick\s*up|pickup)\s+time\s*[:=-]?\s*(?:\d{1,2}\s+[A-Za-z]{3,9}\s*\|\s*)?((?:[01]\d|2[0-3])[0-5]\d)\s*(?:LT|SGT|hrs?)?\b/i,
  ]);
  const labeledTime = firstMatch(text, [
    /\b(?:pickup\s*time|time|p\/u\s*time|pu\s*time|eta)\s*[:=-]?\s*(\d{1,2}(?:(?::|\.)?\d{2})?\s*(?:am|pm|hrs?)?)/i,
  ]);
  const rawTime =
    labeledDateTime ||
    labeledDatePipeTime ||
    labeledTime ||
    firstMatch(text, [
      /\b(\d{1,2}[.:]\d{2}\s*(?:am|pm))\b/i,
      /\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\b/i,
      /\b((?:[01]?\d|2[0-3]):[0-5]\d)\b/i,
      /\b[A-Z]{2}\s?\d{1,4}\s+((?:[01]\d|2[0-3])[0-5]\d)\b/i,
      /\b((?:[01]\d|2[0-3])[0-5]\d)\s+[A-Z]{2}\s?\d{1,4}\b/i,
      /\|\s*((?:[01]\d|2[0-3])[0-5]\d)\s*(?:LT|SGT|hrs?)?\b/i,
      /\b((?:[01]\d|2[0-3])[0-5]\d)\s*(?:LT|SGT)\b/i,
      /\b((?:[01]\d|2[0-3])[0-5]\d)\s+(?=[A-Za-z].*?(?:>|->|=>))/i,
      /\b((?:[01]\d|2[0-3])[0-5]\d)\s+(?=from\b|to\b|at\b)/i,
      /\b((?:[01]?\d|2[0-3])[ .]?[0-5]\d)\s*(?:hrs?|hours?)\b/i,
      /\b(\d{1,2}\s*(?:am|pm))\b/i,
      /\b(?:at|by|around|pickup|pick\s*up|p\/u|pu|eta|arrival|arriving|departure|departing|taking|standby)\s+((?:[01]\d|2[0-3])[0-5]\d)\b/i,
    ]);

  if (!rawTime) {
    return "";
  }

  const compactTime = rawTime.replace(/\s+/g, "").toLowerCase();
  const amPmMatch = compactTime.match(/^(\d{1,2})(?:(?::|\.)(\d{2})|(\d{2}))?(am|pm)$/);

  if (amPmMatch) {
    let hour = Number(amPmMatch[1]);
    const minute = amPmMatch[2] || amPmMatch[3] || "00";

    if (hour < 1 || hour > 12) {
      return "";
    }

    if (amPmMatch[4] === "pm" && hour < 12) {
      hour += 12;
    }

    if (amPmMatch[4] === "am" && hour === 12) {
      hour = 0;
    }

    return `${String(hour).padStart(2, "0")}${minute}`;
  }

  const digits = compactTime.replace(/\D/g, "");
  const colonTimeMatch = compactTime.match(/^(\d{1,2}):(\d{2})$/);

  if (colonTimeMatch) {
    const hour = Number(colonTimeMatch[1]);

    if (hour < 0 || hour > 23) {
      return "";
    }

    return `${String(hour).padStart(2, "0")}${colonTimeMatch[2]}`;
  }

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
    .filter((line) => /\d/.test(line) && /(?:S\$|\$|\bSGD\b|\bquoted\s+price\b|\bnett\b)/i.test(line));

  for (const line of priceLines) {
    const combinedMatch = line.match(/((?:(?:S\$|\$|SGD)\s*)?\d+(?:\.\d{1,2})?\s*\+\s*(?:(?:S\$|\$|SGD)\s*)?\d+(?:\.\d{1,2})?)/i);

    if (combinedMatch?.[1]) {
      const amounts = Array.from(
        combinedMatch[1].matchAll(/(?:S\$|\$|SGD)?\s*(\d+(?:\.\d{1,2})?)/gi),
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

    const singleMatch = line.match(/((?:S\$|\$|SGD)\s*\d+(?:\.\d{1,2})?|\b\d+(?:\.\d{1,2})?\s+nett\b)/i);

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
  const freeformMultiLocationTransfer = detectFreeformMultiLocationTransfer(text);

  if (freeformMultiLocationTransfer) {
    return {
      extraStopCount: freeformMultiLocationTransfer.extraStopCount,
      extraStopLocation: freeformMultiLocationTransfer.extraStopLocation,
    };
  }

  const structuredRouteLocation = structuredListLocations(text, [
    "route location",
    "route locations",
  ]);
  const labeledExtraStop = cleanLocation(lineValue(text, [
    "extra stop",
    "extra stops",
    "extra stop location",
    "extra stop address",
  ]));
  const narratedExtraStop = cleanLocation(firstMatch(text, [
    /\b(?:one|a|an|\d{1,2})\s+stops?\s+(?:at|to|via)\s+(.+?)(?=\s+(?:with|then|and\s+then|before|after)\b|\.|,|\n|$)/i,
    /\bextra\s+stops?\s+(?:at|to|via)\s+(.+?)(?=\.|,|\n|$)/i,
    /\bdrop\s+by\s+(.+?)(?=\.|,|\n|$)/i,
    /\b(?:via|stopover\s+at)\s+(.+?)(?=\.|,|\n|$)/i,
  ]));
  const extraStopLocation = structuredRouteLocation || labeledExtraStop || narratedExtraStop;
  const structuredRouteLocationCount = structuredRouteLocation
    ? structuredRouteLocation.split(/\s*>\s*/g).filter(Boolean).length
    : 0;
  const explicitCount = firstMatch(text, [
    /\b(\d{1,2})[ \t]+extra[ \t]+stops?\b/i,
    /\bextra[ \t]+stops?[ \t]*[:=-][ \t]*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*x\s+waypoints?\b/i,
  ]);

  return {
    extraStopCount: structuredRouteLocationCount ? String(structuredRouteLocationCount) : explicitCount || (extraStopLocation ? "1" : ""),
    extraStopLocation,
  };
}

function detectFreeformMultiLocationTransfer(text: string) {
  if (isStandbyBooking(text) || /\b(?:airport|flight|arriv(?:al|ing|es?)|departure|depart|eta|etd|mng)\b/i.test(text)) {
    return null;
  }

  const match = text.match(
    /\bpick\s*up\s+([A-Za-z][A-Za-z.'-]*)\s+(.+?)\s+send\s+(?:him|her|them|passenger|guest)\s+to\s+(.+?)\s+pick\s*up\s+[A-Za-z][A-Za-z.'-]*\s+follow(?:ed)?\s+by\s+(.+?)\s+then\s+to\s+(.+?)(?=\.|,|\n|$)/i,
  );

  if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5]) {
    return null;
  }

  const pickup = cleanNumberedItineraryLocation(match[2]);
  const firstStop = cleanNumberedItineraryLocation(match[3]);
  const secondStop = cleanNumberedItineraryLocation(match[4]);
  const dropoff = cleanNumberedItineraryLocation(match[5]);
  const stops = [firstStop, secondStop].filter(Boolean);

  if (!pickup || !dropoff || stops.length < 2) {
    return null;
  }

  return {
    passenger: cleanNumberedItineraryLocation(match[1]),
    pickup,
    dropoff,
    extraStopCount: String(stops.length),
    extraStopLocation: stops.join(" > "),
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

  if (/\bneed\s+\d{1,2}\s+baby\s+seat(?:s)?\b/i.test(text)) {
    return "baby seat";
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
    /\b(\d{1,2})\s*x\s*(?:child|baby|booster|infant|toddler)\s+seat(?:s)?\b/i,
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

function detectAdultChildPax(text: string) {
  const match = text.match(
    /\b(\d{1,2})\s*adults?\s*(?:\+|and)?\s*(\d{1,2})\s*(?:children|child|kids?)\b/i,
  ) || text.match(
    /\b(\d{1,2})\s*(?:children|child|kids?)\s*(?:\+|and)?\s*(\d{1,2})\s*adults?\b/i,
  );

  if (!match?.[1] || !match[2]) {
    return "";
  }

  const pax = Number(match[1]) + Number(match[2]);

  return Number.isFinite(pax) && pax > 0 ? String(pax) : "";
}

function detectExplicitPax(text: string) {
  return detectAdultChildPax(text) || firstMatch(text, [
    /\b(?:pax|passengers?|passangers|persons?)\s*(?:[:=-]|\t)?\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*(?:pax|passengers?|passangers|persons?)\b/i,
  ]) ||
    (detectCoupleCompanion(text) ? "2" : "");
}

function detectPax(text: string) {
  return detectExplicitPax(text) || "1";
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

function detectStructuredClientName(text: string) {
  const firstName = lineValue(text, ["first name"]);
  const lastName = lineValue(text, ["last name"]);
  const fullName = cleanDetectedName(`${firstName} ${lastName}`);

  return looksLikePersonName(fullName) ? fullName : "";
}

function detectPaxNameAndNumber(text: string) {
  const paxName = firstMatch(text, [
    /\b(?:pax|passenger)\s+name\s+and\s+number\s*[:=-]\s*([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s*,\s*\+?\d|\s+\+?\d|\n|$)/i,
  ]);

  return looksLikePersonName(paxName) ? cleanDetectedName(paxName) : "";
}

function detectLabeledTravelerName(text: string) {
  const labeledName = lineValue(text, [
    "passenger name",
    "guest name",
    "pax name",
    "principal",
    "traveller",
    "traveler",
  ]);

  return looksLikePersonName(labeledName) ? cleanDetectedName(labeledName) : "";
}

function detectTripOrganizerDetails(text: string) {
  const match = text.match(/\btrip\s+organizer\s*[:=-]\s*([^\n(]+?)(?:\s*\(([^)]*)\))?(?=\n|$)/i);
  const booker = cleanDetectedName(match?.[1] ?? "");
  const contactText = match?.[2] || match?.[0] || "";
  const contact = firstMatch(contactText, [/(\+?\d[\d\s-]{6,}\d)/]);

  return {
    booker,
    contact,
  };
}

function detectUnlabeledPlusContact(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => clean(line));

  for (const line of lines) {
    if (!/^\+\d[\d ]+\d$/.test(line)) {
      continue;
    }

    const digitCount = line.replace(/\D/g, "").length;

    if (digitCount >= 7) {
      return line;
    }
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
    "principal",
    "traveller",
    "traveler",
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
    /\b(?:name|passenger|guest|pax name|principal|traveller|traveler)\s*[:=-]\s*([A-Za-z][A-Za-z.' -]{1,60})/i,
    /\b(?:pax|passenger|guest)\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d|\s+on\b|\s+at\b|\s+from\b|\s+to\b|,|\.|$)/i,
    /\b(?:for|under)\s+([A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+\d|\s+on\b|\s+at\b|\s+from\b|\s+to\b|\s+date\b|\s+time\b|\s+flight\b|\s+pickup\b|\s+drop\b|\s+airport\b|,|\.|$)/i,
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
    /\bpick\s*up\s+((?:mr|mrs|ms|mdm|miss|dr)\.?\s+[A-Za-z][A-Za-z.' -]{1,60}?)(?=\s+from\b)/i,
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

  if (/^(?:singapore\s+)?(?:changi\s+)?airport$/i.test(cleanedValue)) {
    return "Changi Airport";
  }

  return cleanedValue;
}

function detectTerminal(text: string) {
  const terminalMatch = text.match(/\b(?:terminal|term|t)\s*[:=-]?\s*([1-4])\b/i);

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
    .replace(/\s+below:?$/i, "")
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

function cleanItineraryLocation(value: string) {
  return clean(value)
    .replace(/^\s*(?:from|to|at)\s+/i, "")
    .replace(/\s*\(\s*(?:by|at)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*\)\s*$/i, "")
    .replace(/\s+(?:by|at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*$/i, "")
    .replace(/[.;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTimedScheduleLocation(value: string) {
  return cleanItineraryLocation(value)
    .replace(/\s*,?\s*#\s*[a-z0-9]+(?:[-/][a-z0-9]+)?\s*,?\s*/gi, ", ")
    .replace(/\s*,\s*Singapore\s+\d{5,6}\b/gi, "")
    .replace(/\s+Singapore\s+\d{5,6}\b/gi, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/^,\s*|\s*,\s*$/g, "")
    .trim();
}

function cleanNumberedItineraryLocation(value: string) {
  const location = cleanLocation(value);

  return location
    .split(/\s+/)
    .map((word) => {
      if (/^[A-Z0-9#]+$/.test(word)) {
        return word;
      }

      if (/^[A-Za-z]$/.test(word)) {
        return word.toUpperCase();
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function pushUniqueLocation(locations: string[], location: string) {
  const normalizedLocation = clean(location);

  if (
    normalizedLocation &&
    locations[locations.length - 1]?.toLowerCase() !== normalizedLocation.toLowerCase()
  ) {
    locations.push(normalizedLocation);
  }
}

function detectNumberedDriverItinerary(text: string): MultiStopItineraryDetails | null {
  if (!/\b(?:following\s+locations\s+below|proceed\s+following\s+locations|schedule\s+as\s+follow|itinerary)\b/i.test(text)) {
    return null;
  }

  const numberedRouteLines = text
    .split(/\n+/)
    .map((line) => clean(line))
    .filter((line) => /^\d+[.)]\s+.*\b(?:depart|arrive)\b/i.test(line));

  if (numberedRouteLines.length < 2) {
    return null;
  }

  const locations: string[] = [];

  for (const line of numberedRouteLines) {
    const routeMatch = line.match(
      /^\d+[.)]\s+.*?\bdepart\s+(.+?)\s*@?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*\/\/\s*arrive\s+(.+?)\s*@?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i,
    );

    if (!routeMatch?.[1] || !routeMatch[2]) {
      continue;
    }

    pushUniqueLocation(locations, cleanNumberedItineraryLocation(routeMatch[1]));
    pushUniqueLocation(locations, cleanNumberedItineraryLocation(routeMatch[2]));
  }

  const explicitPickup = cleanLocation(firstMatch(text, [
    /\bpick\s*up\s+.+?\s+from\s+(.+?)(?=\s+then\s+proceed\b|\s+then\b|,|\n|$)/i,
  ]));

  if ((!explicitPickup && locations.length < 2) || (explicitPickup && locations.length < 1)) {
    return null;
  }

  const pickup = explicitPickup || locations[0] || "";
  const dropoff = locations[locations.length - 1] || "";
  const extraStopLocations = explicitPickup ? locations.slice(0, -1) : locations.slice(1, -1);
  const pickupTime = parseTimeFromText(text);

  if (!pickup || !dropoff || !pickupTime) {
    return null;
  }

  return {
    pickup,
    dropoff,
    pickupTime,
    extraStopCount: extraStopLocations.length ? String(extraStopLocations.length) : "",
    extraStopLocation: extraStopLocations.join(" > "),
  };
}

function formatItineraryDisplayTime(value: string) {
  return clean(value).replace(/\s+/g, "").toLowerCase();
}

function formatItineraryStop(stop: MultiStopItineraryStop) {
  const displayTime = formatItineraryDisplayTime(stop.time);

  return displayTime ? `${stop.location} ${stop.timeQualifier} ${displayTime}` : stop.location;
}

function extractTimedScheduleStops(text: string) {
  return text
    .split(";")
    .map((rawSegment) => clean(rawSegment))
    .map((segment): MultiStopItineraryStop | null => {
      const stopMatch = segment.match(/(?:^|[:\s])(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(.+)$/i);

      if (!stopMatch?.[1] || !stopMatch[2]) {
        return null;
      }

      const location = cleanTimedScheduleLocation(stopMatch[2]);

      if (!location) {
        return null;
      }

      return {
        location,
        time: stopMatch[1],
        timeQualifier: "at",
      };
    })
    .filter((stop): stop is MultiStopItineraryStop => Boolean(stop));
}

function detectMultiStopItinerary(text: string): MultiStopItineraryDetails | null {
  const numberedDriverItinerary = detectNumberedDriverItinerary(text);

  if (numberedDriverItinerary) {
    return numberedDriverItinerary;
  }

  const normalizedText = clean(text.replace(/\n+/g, " "));
  const timedSegmentCount = (normalizedText.match(/(?:^|;)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi) ?? []).length;
  const hasScheduleCue = /\b(?:schedule|itinerary)\b/i.test(normalizedText);
  const looksLikeSchedule = hasScheduleCue || timedSegmentCount >= 2;

  if (!looksLikeSchedule || !/;\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(normalizedText)) {
    return null;
  }

  const firstRouteMatch = normalizedText.match(
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?:\s*\(\s*by\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*\))?(?=;|\.|\n|$)/i,
  );

  if (!firstRouteMatch?.[1] || !firstRouteMatch[2]) {
    if (!hasScheduleCue) {
      return null;
    }

    const timedStops = extractTimedScheduleStops(normalizedText);

    if (timedStops.length < 2) {
      return null;
    }

    const pickup = timedStops[0]?.location || "";
    const dropoff = timedStops[timedStops.length - 1]?.location || "";
    const pickupTime = parseTimeFromText(timedStops[0]?.time || "");

    if (!pickup || !dropoff || !pickupTime) {
      return null;
    }

    const middleStops = timedStops.slice(1, -1).map((stop) => stop.location).filter(Boolean);

    return {
      pickup,
      dropoff,
      pickupTime,
      extraStopCount: String(Math.max(timedStops.length - 1, 0)),
      extraStopLocation: middleStops.join(" > "),
    };
  }

  const pickup = cleanLocation(firstRouteMatch[1]);
  const firstStopLocation = cleanItineraryLocation(firstRouteMatch[2]);
  const firstStopTime = firstRouteMatch[3] || firstMatch(firstRouteMatch[2], [
    /\bby\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
  ]);
  const stops: MultiStopItineraryStop[] = [];

  if (firstStopLocation) {
    stops.push({
      location: firstStopLocation,
      time: firstStopTime,
      timeQualifier: firstStopTime ? "by" : "at",
    });
  }

  const afterFirstRoute = normalizedText.slice((firstRouteMatch.index ?? 0) + firstRouteMatch[0].length);
  for (const rawSegment of afterFirstRoute.split(";")) {
    const segment = clean(rawSegment);
    const stopMatch = segment.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(.+)$/i);

    if (!stopMatch?.[1] || !stopMatch[2]) {
      continue;
    }

    const location = cleanItineraryLocation(stopMatch[2]);

    if (!location) {
      continue;
    }

    stops.push({
      location,
      time: stopMatch[1],
      timeQualifier: "at",
    });
  }

  if (!pickup || stops.length < 2) {
    return null;
  }

  const pickupTime = parseTimeFromText(stops[0].time);
  const dropoff = stops[stops.length - 1]?.location || "";

  return {
    pickup,
    dropoff,
    pickupTime,
    extraStopCount: String(stops.length),
    extraStopLocation: stops.map(formatItineraryStop).join(" > "),
  };
}

function detectStandbyRoute(text: string) {
  const pickup = cleanedLineValue(text, ["venue"]) || cleanLocation(
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

function isPrivateJetAirportLocation(value: string) {
  const location = clean(value);

  return /\b(?:seletar|wssl|jet\s+av(?:ia|ai)ation|fbo)\b/i.test(location);
}

function detectBookingType(text: string, flight = "", route: { pickup: string; dropoff: string } = { pickup: "", dropoff: "" }) {
  const upperText = text.toUpperCase();
  const pickup = clean(route.pickup);
  const dropoff = clean(route.dropoff);
  const hardDspEvidence = /\bDSP\b|\bDISPOSAL\b|\bHOURLY\b|\bSTANDBY\b|\bWAIT\s+\d+\s*(?:HOURS?|HRS?)\b/.test(
    upperText,
  );

  if (hardDspEvidence) {
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

  if (pickup && dropoff && !flight) {
    const pickupPrivateAirport = isPrivateJetAirportLocation(pickup);
    const dropoffPrivateAirport = isPrivateJetAirportLocation(dropoff);

    if (pickupPrivateAirport && !dropoffPrivateAirport) {
      return "MNG";
    }

    if (dropoffPrivateAirport && !pickupPrivateAirport) {
      return "DEP";
    }
  }

  if (isStandbyBooking(text)) {
    return "DSP";
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

  if (/\bE\s*-?\s*CLASS\b/.test(upperText)) {
    return "E class";
  }

  if (/\bS\s*-?\s*CLASS\b/.test(upperText)) {
    return "S class";
  }

  if (/\bV\s*-?\s*CLASS\b|\bVIANO\b/.test(upperText)) {
    return "VVV";
  }

  if (/\bCOMBI\b|\b13\s*-?\s*SEATER\b|\bMINIBUS\b/.test(upperText)) {
    return "Combi";
  }

  if (/\bS-?CLASS\b|\bMERC(?:EDES)?\b|\bSEDAN\b|\bLIMO\b/.test(upperText)) {
    return "Sedan";
  }

  if (/\bVITO\b|\bVAN\b/.test(upperText)) {
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
  const rawPickup = lineValue(text, [
    "pickup",
    "pickup address",
    "pickup location",
    "pickup point",
    "pick up",
    "pick up address",
    "pick up location",
    "pick up point",
    "pick-up",
    "pick-up address",
    "pick-up point",
    "p/u",
    "pu",
    "start location",
    "from",
    "origin",
    "origin address",
  ]);
  const rawDropoff = lineValue(text, [
    "dropoff",
    "dropoff address",
    "dropoff location",
    "dropoff point",
    "drop off",
    "drop off address",
    "drop off location",
    "drop off point",
    "drop-off",
    "drop-off address",
    "drop-off location",
    "drop-off point",
    "d/o",
    "do",
    "end location",
    "to",
    "destination",
    "destination address",
  ]);
  const structuredPickup = cleanStructuredListLocation(rawPickup);
  const structuredDropoff = cleanStructuredListLocation(rawDropoff);
  const pickup = /\b(?:Singapore\s+)?\d{5,6}\b/i.test(structuredPickup)
    ? structuredPickup
    : cleanLocation(structuredPickup);
  const dropoff = /\b(?:Singapore\s+)?\d{5,6}\b/i.test(structuredDropoff)
    ? structuredDropoff
    : cleanLocation(structuredDropoff);

  if (pickup || dropoff) {
    const dropoffOnlyAirportTransferArrival =
      !pickup &&
      dropoff &&
      Boolean(flight) &&
      /\bAIRPORT\s+TRANSFER\b/i.test(text) &&
      /\bROUTE\s+NAME\s+AIRPORT\b/i.test(text) &&
      !/\bPICK\s*UP\s+LOCATION\b/i.test(text);
    const pickupOnlyAirportRouteDeparture =
      pickup &&
      !dropoff &&
      Boolean(flight) &&
      /\bROUTE\s+NAME\s+AIRPORT\b/i.test(text) &&
      /\bPICK\s*UP\s+LOCATION\b/i.test(text) &&
      !/\bDROP\s*OFF\s+LOCATION\b/i.test(text);

    if (
      !pickup &&
      dropoff &&
      (/\bARRIV(?:AL|ING|ES?)\b|\bETA\b|\bLANDING\b|\bFLIGHT\s+ARRIVES?\b|\bMNG\b|\bAIRPORT\s+PICK\s*UP\b|\bAIRPORT\s+P\/U\b|\bPICK\s*UP\s+FROM\s+AIRPORT\b/i.test(text) ||
        dropoffOnlyAirportTransferArrival)
    ) {
      return { pickup: airportLocationFromText(text), dropoff };
    }

    if (pickup && !dropoff && (/\bairport\s+departure\b/i.test(text) || pickupOnlyAirportRouteDeparture)) {
      return { pickup, dropoff: airportLocationFromText(text) };
    }

    return { pickup, dropoff };
  }

  const departureHotelPickup = cleanedLineValue(text, ["hotel"]);
  const departureAirportDropoff = cleanedLineValue(text, ["airport"]);
  if (
    departureHotelPickup &&
    departureAirportDropoff &&
    /\bDEP\b|\bDEPARTURE\b|\bDEPART\b|\bETD\b|\bAIRPORT\s+DROP\s*OFF\b|\bDROP\s*OFF\s+(?:AT\s+)?AIRPORT\b|\bTO\s+AIRPORT\b/i.test(text)
  ) {
    return {
      pickup: departureHotelPickup,
      dropoff: departureAirportDropoff,
    };
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

  const arrivalTerminalToMatch = text.match(
    /\b([A-Z]{2}\s?\d{1,4})\s+((?:changi\s+airport\s*)?(?:t|terminal)\s*[1-4])\s+to\s+(.+?)(?=\.|,|\n|$)/i,
  );
  if (
    flight &&
    arrivalTerminalToMatch?.[1] &&
    normalizeFlightCode(arrivalTerminalToMatch[1]) === flight &&
    arrivalTerminalToMatch[2] &&
    arrivalTerminalToMatch[3]
  ) {
    return {
      pickup: normalizeLocationName(arrivalTerminalToMatch[2]),
      dropoff: cleanLocation(arrivalTerminalToMatch[3]),
    };
  }

  const freeformMultiLocationTransfer = detectFreeformMultiLocationTransfer(text);

  if (freeformMultiLocationTransfer) {
    return {
      pickup: freeformMultiLocationTransfer.pickup,
      dropoff: freeformMultiLocationTransfer.dropoff,
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
    const labeledHotelDropoff = cleanedLineValue(text, ["hotel"]);
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
      dropoff: dropoffAfterAirport || labeledHotelDropoff,
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

  if (/\b(?:to\s+(?:changi\s+)?airport|airport\s+drop\s*off|drop\s*off\s+(?:at\s+)?airport)\b/i.test(text)) {
    const pickupBeforeAirport = cleanLocation(firstMatch(text, [
      /\bfrom\s+(.+?)\s+to\s+(?:changi\s+)?airport\b/i,
      /\bpick\s*up\s+(?:from\s+)?(.+?)\s+to\s+(?:changi\s+)?airport\b/i,
      /\bpick\s*up\s+from\s+(.+?)(?=\s+(?:at|by|around)\s+\d{1,2}(?:(?::|\.)?\d{2})?\s*(?:am|pm|hrs?)?|\s+then\b|\.|,|\n|$)/i,
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
    const sharedTransferContext = detectSharedTransferRequestContext(operationalText);

    return {
      success: false,
      company: sharedTransferContext.company || bookerCompanyContext.company,
      booker: sharedTransferContext.booker || bookerCompanyContext.booker,
      vehicle: sharedTransferContext.vehicle,
      name: sharedTransferContext.passenger,
      multipleBookingsDetected: true,
      parserWarning: "Multiple bookings detected. Please select one extracted booking.",
      extractedBookingsPreview: buildExtractedBookingsPreview(operationalText, cleanedLines, referenceDate),
      cleanedLines,
    };
  }

  const email = firstMatch(normalizedText, [/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i]);
  const domain = getEmailDomain(email);
  const bookerCompanyContext = detectBookerCompanyContext(operationalText);
  const tripOrganizerDetails = detectTripOrganizerDetails(operationalText);
  const dateText = lineValue(operationalText, ["date", "pickup date", "p/u date", "pu date"]);
  const multiStopItinerary = detectMultiStopItinerary(operationalText);
  const flight = multiStopItinerary ? "" : detectFlight(operationalText);
  const terminalFlightDetails = detectTerminalFlightLineDetails(operationalText, flight);
  const sharedArrivalDropoff = terminalFlightDetails ? detectSharedArrivalDropoff(operationalText) : "";
  const detectedRouteValues = multiStopItinerary
    ? { pickup: multiStopItinerary.pickup, dropoff: multiStopItinerary.dropoff }
    : detectRoute(operationalText, flight);
  const routeValues = terminalFlightDetails
    ? {
        pickup: terminalFlightDetails.pickup || detectedRouteValues.pickup,
        dropoff: sharedArrivalDropoff || detectedRouteValues.dropoff,
      }
    : detectedRouteValues;
  const standbyRouteDetails = !multiStopItinerary && isStandbyBooking(operationalText)
    ? detectStandbyRoute(operationalText)
    : { pickup: "", dropoff: "", returnDestination: "", standbyUntil: "" };
  const freeformMultiLocationTransfer = detectFreeformMultiLocationTransfer(operationalText);
  const structuredClientName = detectStructuredClientName(operationalText);
  const paxNameAndNumber = detectPaxNameAndNumber(operationalText);
  const labeledTravelerName = detectLabeledTravelerName(operationalText);
  const name =
    terminalFlightDetails?.passenger ||
    freeformMultiLocationTransfer?.passenger ||
    detectStandbyName(operationalText) ||
    detectDrivenPassenger(operationalText) ||
    paxNameAndNumber ||
    labeledTravelerName ||
    structuredClientName ||
    detectName(operationalText, flight) ||
    detectNameFromCleanedLines(cleanedLines) ||
    detectNameFromNextWhatsAppLine(whatsappTranscript) ||
    "";
  const standbyDriver = detectStandbyDriver(operationalText);
  const rawTime = terminalFlightDetails?.time || multiStopItinerary?.pickupTime || parseTimeFromText(operationalText);
  const childSeatType = detectChildSeatType(operationalText);
  const childSeatCount = detectChildSeatCount(operationalText);
  const extraStopDetails = multiStopItinerary || detectExtraStopDetails(operationalText);
  const bookingType =
    lineValue(operationalText, ["booking type", "type", "job type"]) ||
    (multiStopItinerary ? "DSP" : detectBookingType(operationalText, flight, routeValues));

  const parsedBooking: ParsedBooking = {
    success: true,
    company:
      cleanCompanyAccount(lineValue(operationalText, ["company", "client", "account"])) ||
      cleanCompanyAccount(bookerCompanyContext.company) ||
      cleanCompanyAccount(whatsappTranscript.senderCompany) ||
      domain,
    bookingType,
    vehicle:
      cleanVehicle(lineValue(operationalText, ["vehicle", "car", "vehicle type"])) ||
      detectVehicle(operationalText) ||
      detectVehicle(normalizedText),
    date: parseDateFromText(dateText || operationalText, referenceDate),
    time: formatTimeForState(rawTime) || rawTime,
    flight,
    pickup: routeValues.pickup,
    dropoff: routeValues.dropoff,
    booker:
      tripOrganizerDetails.booker ||
      detectBookerValue(operationalText, bookerCompanyContext) ||
      whatsappTranscript.senderName ||
      (paxNameAndNumber ? structuredClientName : "") ||
      getEmailBooker(email),
    bookerEmail: email,
    name,
    pax: terminalFlightDetails?.pax || detectPax(operationalText),
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
    bookerContact:
      tripOrganizerDetails.contact ||
      lineValue(operationalText, [
        "booker contact",
        "booker whatsapp",
        "booker phone",
        "requestor contact",
        "contact",
        "contact number",
        "mobile",
        "mobile number",
        "phone",
        "phone number",
        "tel",
        "tel no",
        "tel. no.",
        "telephone",
        "telephone number",
        "whatsapp",
      ]) ||
      detectUnlabeledPlusContact(operationalText),
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
