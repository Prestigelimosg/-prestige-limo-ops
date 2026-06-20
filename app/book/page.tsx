"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useRef, useState } from "react";
import {
  loadCustomerBookingMemorySuggestions,
  type CustomerBookingMemorySuggestion,
} from "../../lib/customer-booking-memory-adapter";
import {
  applyCustomerBookingMemoryToRequestForm,
  findCustomerBookingMemorySuggestion,
} from "../../lib/customer-booking-memory-form";
import { submitCustomerBookingRequest } from "../../lib/customer-booking-request-adapter";

const serviceOptions = [
  "Airport Arrival",
  "Airport Departure",
  "Point-to-Point Transfer",
  "Hourly / Disposal",
  "Event / VIP Movement",
  "Other / To Confirm",
];

const vehicleOptions = [
  "Alphard / Vellfire",
  "Mercedes Viano / V-Class",
  "Hi-roof Minibus",
  "Mercedes E-Class",
  "Mercedes S-Class",
];

const pickupHourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));

const pickupMinuteOptions = [
  "00",
  "05",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
];

const bookingMemoryPassengerListId = "customer-booking-memory-passengers";

type BookingRequestForm = {
  companyName: string;
  contactNo: string;
  emailAddress: string;
  passengerName: string;
  pickupDate: string;
  pickupTime: string;
  flightNumber: string;
  pickupLocation: string;
  dropoffLocation: string;
  serviceType: string;
  vehicleType: string;
  passengerCount: string;
  luggage: string;
  extraStops: string;
  specialRequest: string;
};

type Feedback = {
  tone: "info" | "success" | "error";
  text: string;
};

type CustomerBookingConfirmationStatus = {
  detail: string;
  title: string;
};

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

type BrowserSpeechRecognitionEvent = {
  results: BrowserSpeechRecognitionResultList;
};

type BrowserSpeechRecognitionErrorEvent = {
  error?: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type CustomerVoiceWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

const initialForm: BookingRequestForm = {
  companyName: "",
  contactNo: "",
  emailAddress: "",
  passengerName: "",
  pickupDate: "",
  pickupTime: "",
  flightNumber: "",
  pickupLocation: "",
  dropoffLocation: "",
  serviceType: "Other / To Confirm",
  vehicleType: "",
  passengerCount: "",
  luggage: "",
  extraStops: "",
  specialRequest: "",
};

const requiredFieldLabels: Record<keyof BookingRequestForm, string> = {
  companyName: "Customer / company name",
  contactNo: "Contact no.",
  emailAddress: "Email address",
  passengerName: "Passenger name",
  pickupDate: "Pickup date",
  pickupTime: "Pickup time",
  flightNumber: "Flight number if any",
  pickupLocation: "Pickup location",
  dropoffLocation: "Drop-off location",
  serviceType: "Type of Service",
  vehicleType: "Vehicle type",
  passengerCount: "Number of passengers",
  luggage: "Luggage",
  extraStops: "Extra stops",
  specialRequest: "Special request / note",
};

const requiredFields: Array<keyof BookingRequestForm> = [
  "contactNo",
  "passengerName",
  "pickupDate",
  "pickupTime",
  "pickupLocation",
  "dropoffLocation",
];

function fieldClass(hasError = false) {
  return [
    "mt-2 min-h-11 w-full rounded-md border bg-white px-3 py-2 font-sans text-base text-slate-950 shadow-sm outline-none transition",
    "focus:border-sky-500 focus:ring-2 focus:ring-sky-100",
    hasError ? "border-red-400" : "border-slate-300",
  ].join(" ");
}

function feedbackClass(tone: Feedback["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-900";
  }

  return "border-sky-200 bg-sky-50 text-sky-950";
}

function splitPickupTime(value: string) {
  const [hour = "", minute = ""] = value.split(":");

  return {
    hour: pickupHourOptions.includes(hour) ? hour : "",
    minute: pickupMinuteOptions.includes(minute) ? minute : "",
  };
}

function applyBookingMemoryToForm(
  currentForm: BookingRequestForm,
  suggestion: CustomerBookingMemorySuggestion,
) {
  return applyCustomerBookingMemoryToRequestForm({
    form: currentForm,
    serviceOptions,
    suggestion,
    vehicleOptions,
  });
}

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = window as CustomerVoiceWindow;

  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition ?? null;
}

function transcriptFromSpeechEvent(event: BrowserSpeechRecognitionEvent) {
  return Array.from({ length: event.results.length }, (_, index) => event.results[index]?.[0]?.transcript || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  "serviceType",
  "vehicleType",
  "passengerCount",
  "luggage",
  "extraStops",
] as const;

const localVoiceDraftSupportedFields = [
  "passengerName",
  "pickupDate",
  "pickupTime",
  "flightNumber",
  "pickupLocation",
  "dropoffLocation",
] as const;

type LocalVoiceDraftSupportedField = (typeof localVoiceDraftSupportedFields)[number];

type LocalVoiceDraftFillResult = {
  filledFields: LocalVoiceDraftSupportedField[];
  nextForm: BookingRequestForm;
};

const localVoiceDraftApprovedFieldSet = new Set<keyof BookingRequestForm>(localVoiceDraftApprovedFields);

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

  if (!hour || !minute) {
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

const localVoiceDraftFieldExtractors: Record<LocalVoiceDraftSupportedField, (transcript: string) => string> = {
  passengerName: localVoiceDraftPassengerName,
  pickupDate: localVoiceDraftPickupDate,
  pickupTime: localVoiceDraftPickupTime,
  flightNumber: localVoiceDraftFlightNumber,
  pickupLocation: localVoiceDraftPickupLocation,
  dropoffLocation: localVoiceDraftDropoffLocation,
};

function applyLocalVoiceDraftFieldFillToForm(
  currentForm: BookingRequestForm,
  transcript: string,
): LocalVoiceDraftFillResult {
  let nextForm = currentForm;
  const filledFields: LocalVoiceDraftSupportedField[] = [];

  for (const field of localVoiceDraftSupportedFields) {
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

export default function CustomerBookingPage() {
  const [form, setForm] = useState<BookingRequestForm>(initialForm);
  const [missingFields, setMissingFields] = useState<Array<keyof BookingRequestForm>>([]);
  const [bookingMemorySuggestions, setBookingMemorySuggestions] = useState<CustomerBookingMemorySuggestion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const bookingMemoryLoadStarted = useRef(false);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceRecognitionErroredRef = useRef(false);
  const voiceTranscriptRef = useRef("");
  const formRef = useRef<BookingRequestForm>(initialForm);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceHelperText, setVoiceHelperText] = useState(
    "Use Speak as a local draft helper. Review the transcript, then type or edit the trip fields yourself.",
  );
  const [voiceDraftFilledFields, setVoiceDraftFilledFields] = useState<LocalVoiceDraftSupportedField[]>([]);
  const [confirmationStatus, setConfirmationStatus] = useState<CustomerBookingConfirmationStatus | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({
    tone: "info",
    text: "Send a request and our staff will review the details before confirming availability.",
  });

  function updateForm(updater: (currentForm: BookingRequestForm) => BookingRequestForm) {
    setForm((currentForm) => {
      const nextForm = updater(currentForm);
      formRef.current = nextForm;
      return nextForm;
    });
  }

  function updateField(field: keyof BookingRequestForm, value: string) {
    updateForm((current) => ({ ...current, [field]: value }));
    setMissingFields((current) => current.filter((item) => item !== field));
    setConfirmationStatus(null);
  }

  async function ensureBookingMemorySuggestions() {
    if (bookingMemoryLoadStarted.current) {
      return;
    }

    bookingMemoryLoadStarted.current = true;

    const suggestions = await loadCustomerBookingMemorySuggestions();

    if (suggestions) {
      setBookingMemorySuggestions(suggestions);
      updateForm((current) => {
        const suggestion = findCustomerBookingMemorySuggestion(suggestions, current.passengerName);

        return suggestion ? applyBookingMemoryToForm(current, suggestion) : current;
      });
    }
  }

  function updatePassengerName(value: string) {
    const suggestion = findCustomerBookingMemorySuggestion(bookingMemorySuggestions, value);

    updateForm((current) => {
      const nextForm = {
        ...current,
        passengerName: value,
      };

      return suggestion ? applyBookingMemoryToForm(nextForm, suggestion) : nextForm;
    });
    setMissingFields((current) =>
      current.filter(
        (item) =>
          !(
            item === "passengerName" ||
            (Boolean(suggestion) &&
              ["dropoffLocation", "pickupLocation", "serviceType", "vehicleType"].includes(item))
          ),
      ),
    );
    setConfirmationStatus(null);
  }

  function updatePickupTimePart(part: "hour" | "minute", value: string) {
    updateForm((currentForm) => {
      const current = splitPickupTime(currentForm.pickupTime);
      const nextHour = part === "hour" ? value : current.hour;
      const nextMinute = part === "minute" ? value : current.minute || "00";

      return {
        ...currentForm,
        pickupTime: nextHour ? `${nextHour}:${nextMinute || "00"}` : "",
      };
    });
    setMissingFields((current) => current.filter((item) => item !== "pickupTime"));
    setConfirmationStatus(null);
  }

  function applyLocalVoiceDraftFieldFill(transcript: string) {
    const result = applyLocalVoiceDraftFieldFillToForm(formRef.current, transcript);
    setVoiceDraftFilledFields(result.filledFields);

    if (result.filledFields.length === 0) {
      setVoiceHelperText(
        "Voice draft captured locally. No safe empty fields changed. Review the transcript and type details manually.",
      );
      return;
    }

    formRef.current = result.nextForm;
    setForm(result.nextForm);
    setMissingFields((current) =>
      current.filter((item) => !result.filledFields.includes(item as LocalVoiceDraftSupportedField)),
    );
    setConfirmationStatus(null);
    setVoiceHelperText(
      `Voice draft filled ${result.filledFields.map((field) => requiredFieldLabels[field]).join(", ")}. Review and edit before submitting.`,
    );
  }

  function handleSpeakDraft() {
    if (voiceListening) {
      voiceRecognitionRef.current?.stop();
      setVoiceListening(false);
      setVoiceHelperText("Voice draft stopped. Review the transcript, then type or edit the trip fields yourself.");
      return;
    }

    const SpeechRecognitionConstructor = getSpeechRecognitionConstructor();

    if (!SpeechRecognitionConstructor) {
      setVoiceHelperText("Voice dictation is not supported in this browser. Type the trip details manually.");
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-SG";
    recognition.onresult = (event) => {
      const transcript = transcriptFromSpeechEvent(event);

      if (transcript) {
        setVoiceTranscript(transcript);
        voiceTranscriptRef.current = transcript;
        setVoiceDraftFilledFields([]);
        setVoiceHelperText("Voice draft captured locally. Review it, then type or edit the trip fields yourself.");
      }
    };
    recognition.onerror = () => {
      voiceRecognitionErroredRef.current = true;
      setVoiceListening(false);
      setVoiceHelperText("Voice draft was not captured. Type the trip details manually.");
    };
    recognition.onend = () => {
      if (!voiceRecognitionErroredRef.current) {
        applyLocalVoiceDraftFieldFill(voiceTranscriptRef.current);
      }
      voiceRecognitionErroredRef.current = false;
      setVoiceListening(false);
      voiceRecognitionRef.current = null;
    };

    voiceRecognitionRef.current = recognition;
    setVoiceTranscript("");
    voiceTranscriptRef.current = "";
    voiceRecognitionErroredRef.current = false;
    setVoiceDraftFilledFields([]);
    setVoiceListening(true);
    setVoiceHelperText("Listening locally. Speak the trip details, then review the transcript before editing fields.");

    try {
      recognition.start();
    } catch {
      setVoiceListening(false);
      voiceRecognitionRef.current = null;
      setVoiceHelperText("Voice dictation could not start. Type the trip details manually.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const missing = requiredFields.filter((field) => !form[field].trim());
    if (missing.length > 0) {
      setMissingFields(missing);
      setConfirmationStatus(null);
      setFeedback({
        tone: "error",
        text: "Please complete contact no., passenger name, pickup date, pickup time, pickup location, and drop-off location before submitting your request.",
      });
      return;
    }

    setMissingFields([]);
    setSubmitting(true);
    setConfirmationStatus(null);
    setFeedback({
      tone: "info",
      text: "Submitting your booking request for review...",
    });

    try {
      const result = await submitCustomerBookingRequest(form);

      if (!result.ok) {
        throw new Error("Booking request could not be submitted.");
      }

      const shortNoticeReviewRequired = result.shortNoticeReviewRequired;
      setFeedback({
        tone: "success",
        text:
          shortNoticeReviewRequired
            ? "This booking is within 24 hours, so our team will review and confirm availability."
            : "Booking request received. Our team will review and confirm availability.",
      });
      setConfirmationStatus({
        title: "Request received - pending review",
        detail: shortNoticeReviewRequired
          ? "This booking is within 24 hours, so our team will review and confirm availability."
          : "This is not confirmed yet. We will contact you after review.",
      });
    } catch {
      setConfirmationStatus(null);
      setFeedback({
        tone: "error",
        text: "Booking request could not be submitted right now. Please contact Prestige Limo.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function isMissing(field: keyof BookingRequestForm) {
    return missingFields.includes(field);
  }

  const pickupTimeParts = splitPickupTime(form.pickupTime);

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-stone-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8"
      data-customer-booking-page="true"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="rounded-md border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase text-slate-600">Prestige Limo SG</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-950 sm:text-4xl">Booking Request</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">
                Share the trip details you have now. Your booking is not confirmed until Prestige
                Limo staff replies.
              </p>
            </div>
            <div
              className="flex shrink-0 flex-wrap items-center gap-2"
              data-customer-booking-header-actions="true"
            >
              <button
                aria-pressed={voiceListening}
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
                data-customer-voice-booking-mode="local-transcript-helper"
                data-customer-voice-booking-speak-button="true"
                onClick={handleSpeakDraft}
                type="button"
              >
                {voiceListening ? "Listening" : "Speak"}
              </button>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
                data-customer-booking-portal-link="true"
                href="/my-bookings"
              >
                Portal
              </Link>
            </div>
          </div>
          <p
            className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium leading-6 text-sky-950"
            data-customer-booking-mobile-web-note="true"
          >
            Mobile web request form for trip details only. Prestige Limo will reply before confirmation.
          </p>
          <div
            className="mt-3 text-sm leading-6 text-slate-700"
            data-customer-voice-booking-helper="true"
            data-customer-voice-booking-local-only="true"
          >
            <p data-customer-voice-booking-status="true">{voiceHelperText}</p>
            {voiceTranscript ? (
              <p className="mt-1" data-customer-voice-booking-draft-note="true">
                <span className="font-semibold text-slate-950">Voice draft: </span>
                <span data-customer-voice-booking-transcript="true">{voiceTranscript}</span>
              </p>
            ) : null}
            {voiceDraftFilledFields.length > 0 ? (
              <p
                className="mt-1"
                data-customer-voice-booking-draft-fill="local-only"
                data-customer-voice-booking-draft-fill-fields={voiceDraftFilledFields.join(",")}
              >
                Filled fields: {voiceDraftFilledFields.map((field) => requiredFieldLabels[field]).join(", ")}
              </p>
            ) : null}
          </div>
          <ol
            aria-label="Booking request next steps"
            className="mt-4 grid gap-2 text-sm sm:grid-cols-3"
            data-customer-booking-next-steps="true"
          >
            {[
              "Submit the trip details you know.",
              "Prestige Limo reviews timing and availability.",
              "We reply before the booking is confirmed.",
            ].map((step, index) => (
              <li
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700"
                data-customer-booking-next-step={index + 1}
                key={step}
              >
                <span className="font-semibold text-slate-950">Step {index + 1}: </span>
                {step}
              </li>
            ))}
          </ol>
        </header>

        <form
          className="rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
          data-customer-booking-form="true"
          noValidate
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-5">
            <section aria-labelledby="contact-section-title">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-slate-950" id="contact-section-title">
                  Contact Details
                </h2>
                <p className="text-sm text-slate-600">Required fields are marked with *.</p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-800">
                  Customer / company name
                  <input
                    className={fieldClass()}
                    data-customer-booking-field="companyName"
                    name="companyName"
                    onChange={(event) => updateField("companyName", event.target.value)}
                    placeholder="Company or family name"
                    type="text"
                    value={form.companyName}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-800">
                  Contact no. *
                  <input
                    aria-invalid={isMissing("contactNo")}
                    className={fieldClass(isMissing("contactNo"))}
                    data-customer-booking-field="contactNo"
                    name="contactNo"
                    onChange={(event) => updateField("contactNo", event.target.value)}
                    placeholder="+65 9000 0000"
                    required
                    type="tel"
                    value={form.contactNo}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-800 md:col-span-2">
                  Email address
                  <input
                    className={fieldClass()}
                    data-customer-booking-field="emailAddress"
                    name="emailAddress"
                    onChange={(event) => updateField("emailAddress", event.target.value)}
                    placeholder="name@example.com"
                    type="email"
                    value={form.emailAddress}
                  />
                </label>
              </div>
            </section>

            <section aria-labelledby="trip-section-title">
              <h2 className="text-lg font-semibold text-slate-950" id="trip-section-title">
                Trip Details
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-800">
                  Passenger name *
                  <input
                    aria-invalid={isMissing("passengerName")}
                    autoComplete="off"
                    className={fieldClass(isMissing("passengerName"))}
                    data-customer-booking-field="passengerName"
                    data-customer-booking-memory-passenger-input="true"
                    list={bookingMemorySuggestions.length > 0 ? bookingMemoryPassengerListId : undefined}
                    name="passengerName"
                    onChange={(event) => updatePassengerName(event.target.value)}
                    onFocus={ensureBookingMemorySuggestions}
                    onPointerDown={ensureBookingMemorySuggestions}
                    placeholder="Passenger name"
                    required
                    type="text"
                    value={form.passengerName}
                  />
                  {bookingMemorySuggestions.length > 0 ? (
                    <datalist
                      data-customer-booking-memory-passenger-list="true"
                      id={bookingMemoryPassengerListId}
                    >
                      {bookingMemorySuggestions.map((suggestion) => (
                        <option
                          data-customer-booking-memory-passenger-option={suggestion.passengerName}
                          key={`${suggestion.passengerName}-${suggestion.pickupLocation}-${suggestion.dropoffLocation}`}
                          value={suggestion.passengerName}
                        />
                      ))}
                    </datalist>
                  ) : null}
                </label>

                <label className="text-sm font-semibold text-slate-800">
                  Flight number if any
                  <input
                    className={fieldClass()}
                    data-customer-booking-field="flightNumber"
                    name="flightNumber"
                    onChange={(event) => updateField("flightNumber", event.target.value)}
                    placeholder="SQ123"
                    type="text"
                    value={form.flightNumber}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-800">
                  Pickup date *
                  <input
                    aria-invalid={isMissing("pickupDate")}
                    className={fieldClass(isMissing("pickupDate"))}
                    data-customer-booking-field="pickupDate"
                    name="pickupDate"
                    onChange={(event) => updateField("pickupDate", event.target.value)}
                    required
                    type="date"
                    value={form.pickupDate}
                  />
                </label>

                <fieldset
                  aria-invalid={isMissing("pickupTime")}
                  className="min-w-0 text-sm font-semibold text-slate-800"
                  data-customer-booking-field="pickupTime"
                  data-customer-booking-time-control="selects"
                  data-required="true"
                  data-step="300"
                  data-value={form.pickupTime}
                >
                  <legend>Pickup time *</legend>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <label className="min-w-0 text-xs font-semibold text-slate-700">
                      Hour
                      <select
                        aria-label="Pickup hour"
                        aria-invalid={isMissing("pickupTime")}
                        className={fieldClass(isMissing("pickupTime"))}
                        data-customer-booking-time-part="hour"
                        onChange={(event) => updatePickupTimePart("hour", event.target.value)}
                        required
                        value={pickupTimeParts.hour}
                      >
                        <option value="">HH</option>
                        {pickupHourOptions.map((hour) => (
                          <option key={hour} value={hour}>
                            {hour}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-slate-700">
                      Minute
                      <select
                        aria-label="Pickup minute"
                        className={fieldClass(isMissing("pickupTime"))}
                        data-customer-booking-time-part="minute"
                        onChange={(event) => updatePickupTimePart("minute", event.target.value)}
                        value={pickupTimeParts.minute || "00"}
                      >
                        {pickupMinuteOptions.map((minute) => (
                          <option key={minute} value={minute}>
                            {minute}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <input
                    data-customer-booking-time-value="true"
                    name="pickupTime"
                    readOnly
                    type="hidden"
                    value={form.pickupTime}
                  />
                </fieldset>

                <label className="text-sm font-semibold text-slate-800">
                  Pickup location *
                  <input
                    aria-invalid={isMissing("pickupLocation")}
                    className={fieldClass(isMissing("pickupLocation"))}
                    data-customer-booking-field="pickupLocation"
                    name="pickupLocation"
                    onChange={(event) => updateField("pickupLocation", event.target.value)}
                    placeholder="Hotel, airport terminal, home, or office"
                    required
                    type="text"
                    value={form.pickupLocation}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-800">
                  Drop-off location *
                  <input
                    aria-invalid={isMissing("dropoffLocation")}
                    className={fieldClass(isMissing("dropoffLocation"))}
                    data-customer-booking-field="dropoffLocation"
                    name="dropoffLocation"
                    onChange={(event) => updateField("dropoffLocation", event.target.value)}
                    placeholder="Destination or area"
                    required
                    type="text"
                    value={form.dropoffLocation}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-800">
                  Type of Service
                  <select
                    className={fieldClass()}
                    data-customer-booking-field="serviceType"
                    name="serviceType"
                    onChange={(event) => updateField("serviceType", event.target.value)}
                    value={form.serviceType}
                  >
                    {serviceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-semibold text-slate-800">
                  Vehicle type
                  <select
                    className={fieldClass()}
                    data-customer-booking-field="vehicleType"
                    name="vehicleType"
                    onChange={(event) => updateField("vehicleType", event.target.value)}
                    value={form.vehicleType}
                  >
                    <option value="">Choose if known</option>
                    {vehicleOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-semibold text-slate-800">
                  Number of passengers
                  <input
                    className={fieldClass()}
                    data-customer-booking-field="passengerCount"
                    min="1"
                    name="passengerCount"
                    onChange={(event) => updateField("passengerCount", event.target.value)}
                    placeholder="1"
                    type="number"
                    value={form.passengerCount}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-800">
                  Luggage
                  <input
                    className={fieldClass()}
                    data-customer-booking-field="luggage"
                    name="luggage"
                    onChange={(event) => updateField("luggage", event.target.value)}
                    placeholder="2 large bags, 1 cabin bag"
                    type="text"
                    value={form.luggage}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-800 md:col-span-2">
                  Extra stops
                  <input
                    className={fieldClass()}
                    data-customer-booking-field="extraStops"
                    name="extraStops"
                    onChange={(event) => updateField("extraStops", event.target.value)}
                    placeholder="Add stop details if needed"
                    type="text"
                    value={form.extraStops}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-800 md:col-span-2">
                  Special request / note
                  <textarea
                    className={`${fieldClass()} min-h-28 resize-y`}
                    data-customer-booking-field="specialRequest"
                    name="specialRequest"
                    onChange={(event) => updateField("specialRequest", event.target.value)}
                    placeholder="Child seat, meet-and-greet, event timing, or other requests"
                    value={form.specialRequest}
                  />
                </label>
              </div>
            </section>

            {missingFields.length > 0 ? (
              <div
                className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900"
                data-customer-booking-missing-fields="true"
              >
                <p className="font-semibold">Please complete these required fields:</p>
                <ul className="mt-2 list-disc pl-5">
                  {missingFields.map((field) => (
                    <li data-customer-booking-missing-field={field} key={field}>
                      {requiredFieldLabels[field]}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4">
              <section
                aria-labelledby="pre-submit-review-title"
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700"
                data-customer-booking-pre-submit-review="true"
              >
                <p
                  className="font-semibold text-slate-950"
                  data-customer-booking-pre-submit-review-title="true"
                  id="pre-submit-review-title"
                >
                  Review before submitting
                </p>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  <li data-customer-booking-pre-submit-review-item="request-only">
                    This is a booking request only, not a confirmed booking yet.
                  </li>
                  <li data-customer-booking-pre-submit-review-item="team-review">
                    Our team will review and confirm availability before your booking is confirmed.
                  </li>
                  <li data-customer-booking-pre-submit-review-item="short-notice">
                    Short-notice bookings under 24 hours require team review before confirmation.
                  </li>
                  <li data-customer-booking-pre-submit-review-item="no-finance-file">
                    No price, payment, invoice, PDF, or billing file is created here.
                  </li>
                  <li
                    className="sm:col-span-2"
                    data-customer-booking-pre-submit-review-item="urgent-help"
                  >
                    For urgent or same-day help, contact our team directly.
                  </li>
                </ul>
              </section>
              <p className="text-sm leading-6 text-slate-600">
                After you submit, Prestige Limo will review the request and reply with the next step.
              </p>
              <button
                className="min-h-12 rounded-md bg-slate-950 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-400"
                data-customer-booking-submit="true"
                disabled={submitting}
                type="submit"
              >
                {submitting ? "Submitting..." : "Submit Booking Request"}
              </button>
              <div
                className={`rounded-md border px-3 py-3 text-sm leading-6 ${feedbackClass(feedback.tone)}`}
                data-customer-booking-feedback="true"
                data-customer-booking-feedback-tone={feedback.tone}
                role="status"
              >
                {feedback.text}
              </div>
              {confirmationStatus ? (
                <section
                  aria-label="Booking request status"
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-950"
                  data-customer-booking-confirmation-status="true"
                >
                  <p className="font-semibold" data-customer-booking-confirmation-status-title="true">
                    {confirmationStatus.title}
                  </p>
                  <p className="mt-1" data-customer-booking-confirmation-status-detail="true">
                    {confirmationStatus.detail}
                  </p>
                </section>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
