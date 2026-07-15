export const customerBookingLocalVoiceDraftSupportedFields = [
  "passengerName",
  "pickupDate",
  "pickupTime",
  "flightNumber",
  "pickupLocation",
  "dropoffLocation",
] as const;

export type CustomerBookingLocalVoiceDraftSupportedField =
  (typeof customerBookingLocalVoiceDraftSupportedFields)[number];

type CustomerBookingLocalVoiceDraftForm = Record<CustomerBookingLocalVoiceDraftSupportedField, string>;

type BrowserSpeechRecognitionAlternative = {
  transcript: string;
};

type BrowserSpeechRecognitionResult = {
  readonly 0?: BrowserSpeechRecognitionAlternative;
};

type BrowserSpeechRecognitionResultList = {
  readonly length: number;
  readonly [index: number]: BrowserSpeechRecognitionResult | undefined;
};

export type CustomerBookingSpeechRecognitionEvent = {
  results: BrowserSpeechRecognitionResultList;
};

export type CustomerBookingSpeechRecognitionErrorEvent = {
  error?: string;
};

export type CustomerBookingSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: CustomerBookingSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: CustomerBookingSpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => CustomerBookingSpeechRecognition;

type CustomerVoiceWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

export type CustomerBookingLocalVoiceDraftFillResult<TForm> = {
  filledFields: CustomerBookingLocalVoiceDraftSupportedField[];
  nextForm: TForm;
};

const localVoiceDraftApprovedFields = [
  "companyName",
  "contactNo",
  "emailAddress",
  "passengerName",
  "pickupDate",
  "pickupTime",
  "flightNumber",
  "pickupLocation",
  "dropoffLocation",
  "returnTripRequested",
  "returnPickupDate",
  "returnPickupTime",
  "returnFlightNumber",
  "returnPickupLocation",
  "returnDropoffLocation",
  "returnExtraStops",
  "serviceType",
  "vehicleType",
  "passengerCount",
  "luggage",
  "extraStops",
] as const;

const localVoiceDraftApprovedFieldSet = new Set<string>(localVoiceDraftApprovedFields);

const localVoiceDraftMonthNumbers: Record<string, string> = {
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

export function getCustomerBookingSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = window as CustomerVoiceWindow;

  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

export function transcriptFromCustomerBookingSpeechEvent(event: CustomerBookingSpeechRecognitionEvent) {
  return Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLocalVoiceDraftText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanLocalVoiceDraftValue(value: string) {
  return normalizeLocalVoiceDraftText(value)
    .replace(/^[\s,.:;-]+/, "")
    .replace(/[\s,.:;-]+$/, "");
}

function titleCaseLocalVoiceDraftName(value: string) {
  return cleanLocalVoiceDraftValue(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function safeLocalVoiceDraftValue(value: string) {
  return value.length > 0 && value.length <= 160 && !/[<>]/.test(value);
}

function localVoiceDraftPassengerName(transcript: string) {
  const normalizedTranscript = normalizeLocalVoiceDraftText(transcript);
  const namedMatch = normalizedTranscript.match(
    /\b(?:passenger|passenger name|name)\s*(?:is|:)?\s*([a-z][a-z' -]{1,60}?)(?=\s+(?:needs?|requires?|has|from|to|on|at)\b|[,.]|$)/i,
  );
  const leadingMatch = normalizedTranscript.match(
    /^\s*([a-z][a-z' -]{1,60}?)\s+(?:needs?|requires?|has|is requesting)\b/i,
  );
  const name = titleCaseLocalVoiceDraftName(namedMatch?.[1] ?? leadingMatch?.[1] ?? "");

  return safeLocalVoiceDraftValue(name) ? name : "";
}

function localVoiceDraftPickupDate(transcript: string) {
  const normalizedTranscript = normalizeLocalVoiceDraftText(transcript);
  const isoMatch = normalizedTranscript.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const numericMatch = normalizedTranscript.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);
  const namedMatch = normalizedTranscript.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/i,
  );
  const year = isoMatch?.[1] ?? numericMatch?.[3] ?? namedMatch?.[3] ?? "";
  const month =
    isoMatch?.[2] ??
    numericMatch?.[2] ??
    localVoiceDraftMonthNumbers[namedMatch?.[2]?.toLowerCase() ?? ""] ??
    "";
  const day = isoMatch?.[3] ?? numericMatch?.[1] ?? namedMatch?.[1] ?? "";
  const monthNumber = Number(month);
  const dayNumber = Number(day);

  if (!year || monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
    return "";
  }

  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
}

function localVoiceDraftPickupTime(transcript: string) {
  const normalizedTranscript = normalizeLocalVoiceDraftText(transcript);
  const separatedMatch = normalizedTranscript.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  const compactMatch = normalizedTranscript.match(/\b([01]\d|2[0-3])([0-5]\d)\s*(?:hrs?|h)\b/i);
  const hour = separatedMatch?.[1] ?? compactMatch?.[1] ?? "";
  const minute = separatedMatch?.[2] ?? compactMatch?.[2] ?? "";

  if (!hour || !minute || Number(minute) % 5 !== 0) {
    return "";
  }

  return `${String(Number(hour)).padStart(2, "0")}:${minute}`;
}

function localVoiceDraftFlightNumber(transcript: string) {
  const match = normalizeLocalVoiceDraftText(transcript)
    .toUpperCase()
    .match(/\b([A-Z]{2,3})\s?(\d{2,4}[A-Z]?)\b/);
  const flightNumber = cleanLocalVoiceDraftValue(`${match?.[1] ?? ""}${match?.[2] ?? ""}`);

  return safeLocalVoiceDraftValue(flightNumber) ? flightNumber : "";
}

function localVoiceDraftRouteMatch(transcript: string) {
  return normalizeLocalVoiceDraftText(transcript).match(
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+[a-z]{2,3}\s?\d{2,4}[a-z]?\b|\s+on\b|\s+at\b|[,.]|$)/i,
  );
}

function cleanLocalVoiceDraftLocation(value: string) {
  const cleaned = cleanLocalVoiceDraftValue(value)
    .replace(/\b(?:on|at)\s+\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+.*$/i, "")
    .replace(/\b(?:on|at)\s+20\d{2}.*$/i, "")
    .replace(/\b[a-z]{2,3}\s?\d{2,4}[a-z]?\b.*$/i, "")
    .replace(/\b(?:please|thanks?)\b.*$/i, "");

  return cleanLocalVoiceDraftValue(cleaned);
}

function localVoiceDraftKnownPickupAddress(transcript: string) {
  const normalizedTranscript = normalizeLocalVoiceDraftText(transcript);
  const stayMatch = normalizedTranscript.match(/\b(?:stays?|lives?)\s+at\s+([^,.]+)(?=[,.]|$)/i);
  const addressMatch = normalizedTranscript.match(/\b(?:home|address)\s+is\s+([^,.]+)(?=[,.]|$)/i);
  const address = cleanLocalVoiceDraftLocation(stayMatch?.[1] ?? addressMatch?.[1] ?? "");

  return safeLocalVoiceDraftValue(address) ? address : "";
}

function localVoiceDraftPickupLocation(transcript: string) {
  const knownAddress = localVoiceDraftKnownPickupAddress(transcript);
  if (knownAddress) {
    return knownAddress;
  }

  const routeMatch = localVoiceDraftRouteMatch(transcript);
  const pickupLocation = cleanLocalVoiceDraftLocation(routeMatch?.[1] ?? "");

  return safeLocalVoiceDraftValue(pickupLocation) ? pickupLocation : "";
}

function localVoiceDraftDropoffLocation(transcript: string) {
  const routeMatch = localVoiceDraftRouteMatch(transcript);
  const dropoffLocation = cleanLocalVoiceDraftLocation(routeMatch?.[2] ?? "");

  return safeLocalVoiceDraftValue(dropoffLocation) ? dropoffLocation : "";
}

const localVoiceDraftFieldExtractors: Record<CustomerBookingLocalVoiceDraftSupportedField, (transcript: string) => string> = {
  passengerName: localVoiceDraftPassengerName,
  pickupDate: localVoiceDraftPickupDate,
  pickupTime: localVoiceDraftPickupTime,
  flightNumber: localVoiceDraftFlightNumber,
  pickupLocation: localVoiceDraftPickupLocation,
  dropoffLocation: localVoiceDraftDropoffLocation,
};

export function applyCustomerBookingLocalVoiceDraftFieldFillToForm<TForm extends CustomerBookingLocalVoiceDraftForm>(
  currentForm: TForm,
  transcript: string,
): CustomerBookingLocalVoiceDraftFillResult<TForm> {
  let nextForm = currentForm;
  const filledFields: CustomerBookingLocalVoiceDraftSupportedField[] = [];

  for (const field of customerBookingLocalVoiceDraftSupportedFields) {
    if (!localVoiceDraftApprovedFieldSet.has(field) || currentForm[field].trim()) {
      continue;
    }

    const value = localVoiceDraftFieldExtractors[field](transcript);
    if (!safeLocalVoiceDraftValue(value)) {
      continue;
    }

    nextForm = { ...nextForm, [field]: value };
    filledFields.push(field);
  }

  return { filledFields, nextForm };
}
