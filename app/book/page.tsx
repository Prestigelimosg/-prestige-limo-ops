"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  loadCustomerBookingMemorySuggestions,
  type CustomerBookingMemorySuggestion,
} from "../../lib/customer-booking-memory-adapter";
import {
  applyCustomerBookingMemoryToRequestForm,
  findCustomerBookingMemorySuggestion,
} from "../../lib/customer-booking-memory-form";
import {
  applyCustomerBookingLocalVoiceDraftFieldFillToForm,
  getCustomerBookingSpeechRecognitionConstructor,
  transcriptFromCustomerBookingSpeechEvent,
  type CustomerBookingLocalVoiceDraftSupportedField,
  type CustomerBookingSpeechRecognition,
} from "../../lib/customer-booking-local-voice-draft";
import { submitCustomerBookingRequest } from "../../lib/customer-booking-request-adapter";
import {
  customerTermsAndConditionsSummary,
  customerTermsAndSurchargeSummary,
} from "../../lib/customer-facing-booking-terms";
import {
  companyProfileContactLines,
  defaultCompanyProfile,
  type PublicCompanyProfile,
} from "../../lib/company-profile-shared";
import { loadPublicCompanyProfile } from "../../lib/public-company-profile-adapter";

const serviceOptions = [
  "Airport Arrival",
  "Airport Departure",
  "Point-to-Point Transfer",
  "Hourly / Disposal",
  "Event / VIP Movement",
  "Other / Need advice",
];

const vehicleOptions = [
  "Alphard / Vellfire",
  "Mercedes Viano / V-Class",
  "Hi-roof Minibus",
  "Mercedes E-Class",
  "Mercedes S-Class",
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
  returnTripRequested: string;
  returnPickupDate: string;
  returnPickupTime: string;
  returnFlightNumber: string;
  returnPickupLocation: string;
  returnDropoffLocation: string;
  returnExtraStops: string;
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
  returnTripRequested: "",
  returnPickupDate: "",
  returnPickupTime: "",
  returnFlightNumber: "",
  returnPickupLocation: "",
  returnDropoffLocation: "",
  returnExtraStops: "",
  serviceType: "",
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
  returnTripRequested: "Return trip",
  returnPickupDate: "Return pickup date",
  returnPickupTime: "Return pickup time",
  returnFlightNumber: "Return flight number if any",
  returnPickupLocation: "Return pickup location",
  returnDropoffLocation: "Return drop-off location",
  returnExtraStops: "Return extra stops",
  serviceType: "Type of service",
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
const returnTripRequiredFields: Array<keyof BookingRequestForm> = [
  "returnPickupDate",
  "returnPickupTime",
  "returnPickupLocation",
  "returnDropoffLocation",
];

const pickupHourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const pickupMinuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

function fieldClass(hasError = false) {
  return [
    "mt-1 min-h-10 w-full rounded-md border bg-white px-2.5 py-1.5 font-sans text-sm font-normal text-slate-950 shadow-sm outline-none transition",
    "focus:border-sky-500 focus:ring-2 focus:ring-sky-100",
    hasError ? "border-red-400" : "border-slate-300",
  ].join(" ");
}

function timePartClass(hasError = false) {
  return [
    "min-h-10 rounded-md border bg-white px-2.5 py-1.5 font-sans text-sm font-normal text-slate-950 shadow-sm outline-none transition",
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

function splitPickupTime(value: string) {
  const [hour = "", minute = ""] = value.split(":");

  return {
    hour: pickupHourOptions.includes(hour) ? hour : "",
    minute: pickupMinuteOptions.includes(minute) ? minute : "",
  };
}

export default function CustomerBookingPage() {
  const [form, setForm] = useState<BookingRequestForm>(initialForm);
  const [companyProfile, setCompanyProfile] =
    useState<PublicCompanyProfile>(defaultCompanyProfile);
  const [pickupTimeDraft, setPickupTimeDraft] = useState(() => splitPickupTime(initialForm.pickupTime));
  const [returnPickupTimeDraft, setReturnPickupTimeDraft] = useState(() =>
    splitPickupTime(initialForm.returnPickupTime),
  );
  const [missingFields, setMissingFields] = useState<Array<keyof BookingRequestForm>>([]);
  const [bookingMemorySuggestions, setBookingMemorySuggestions] = useState<CustomerBookingMemorySuggestion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const bookingMemoryLoadStarted = useRef(false);
  const voiceRecognitionRef = useRef<CustomerBookingSpeechRecognition | null>(null);
  const voiceRecognitionErroredRef = useRef(false);
  const voiceTranscriptRef = useRef("");
  const formRef = useRef<BookingRequestForm>(initialForm);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceHelperText, setVoiceHelperText] = useState(
    "Use Speak as a local draft helper. Review the transcript, then type or edit the trip fields yourself.",
  );
  const [voiceDraftFilledFields, setVoiceDraftFilledFields] = useState<CustomerBookingLocalVoiceDraftSupportedField[]>([]);
  const [confirmationStatus, setConfirmationStatus] = useState<CustomerBookingConfirmationStatus | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({
    tone: "info",
    text: "Send a request and our staff will review the details before confirming availability.",
  });
  const companyName = companyProfile.company_name || defaultCompanyProfile.company_name;
  const companyContactLines = companyProfileContactLines(companyProfile);
  const fallbackContactLines = companyProfileContactLines(defaultCompanyProfile);
  const hotlineContact = companyContactLines[0] || fallbackContactLines[0];

  useEffect(() => {
    const controller = new AbortController();

    async function loadCompanyProfile() {
      const profile = await loadPublicCompanyProfile({ signal: controller.signal });

      if (profile) {
        setCompanyProfile(profile);
        return;
      }

      setCompanyProfile(defaultCompanyProfile);
    }

    void loadCompanyProfile();

    return () => controller.abort();
  }, []);

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

  function updatePickupTimeSelect(part: "hour" | "minute", value: string) {
    setPickupTimeDraft((current) => {
      const base = current.hour || current.minute ? current : splitPickupTime(formRef.current.pickupTime);
      const next = { ...base, [part]: value };
      updateField("pickupTime", next.hour && next.minute ? `${next.hour}:${next.minute}` : "");
      return next;
    });
  }

  function updateReturnPickupTimeSelect(part: "hour" | "minute", value: string) {
    setReturnPickupTimeDraft((current) => {
      const base = current.hour || current.minute ? current : splitPickupTime(formRef.current.returnPickupTime);
      const next = { ...base, [part]: value };
      updateField("returnPickupTime", next.hour && next.minute ? `${next.hour}:${next.minute}` : "");
      return next;
    });
  }

  function toggleReturnTrip(checked: boolean) {
    updateForm((current) => ({
      ...current,
      returnDropoffLocation: checked
        ? current.returnDropoffLocation || current.pickupLocation
        : current.returnDropoffLocation,
      returnPickupLocation: checked
        ? current.returnPickupLocation || current.dropoffLocation
        : current.returnPickupLocation,
      returnTripRequested: checked ? "yes" : "",
    }));
    setMissingFields((current) =>
      checked
        ? current.filter((item) => item !== "returnTripRequested")
        : current.filter((item) => !returnTripRequiredFields.includes(item)),
    );
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

  function applyLocalVoiceDraftFieldFill(transcript: string) {
    const result = applyCustomerBookingLocalVoiceDraftFieldFillToForm(formRef.current, transcript);
    setVoiceDraftFilledFields(result.filledFields);

    if (result.filledFields.length === 0) {
      setVoiceHelperText(
        "Voice draft captured locally. No safe empty fields changed. Review the transcript and type details manually.",
      );
      return;
    }

    formRef.current = result.nextForm;
    setForm(result.nextForm);
    if (result.filledFields.includes("pickupTime")) {
      setPickupTimeDraft(splitPickupTime(result.nextForm.pickupTime));
    }
    setMissingFields((current) =>
      current.filter((item) => !result.filledFields.includes(item as CustomerBookingLocalVoiceDraftSupportedField)),
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

    const SpeechRecognitionConstructor = getCustomerBookingSpeechRecognitionConstructor();

    if (!SpeechRecognitionConstructor) {
      setVoiceHelperText("Voice dictation is not supported in this browser. Type the trip details manually.");
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-SG";
    recognition.onresult = (event) => {
      const transcript = transcriptFromCustomerBookingSpeechEvent(event);

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

    const requiredForSubmit =
      form.returnTripRequested === "yes"
        ? [...requiredFields, ...returnTripRequiredFields]
        : requiredFields;
    const missing = requiredForSubmit.filter((field) => !form[field].trim());
    if (missing.length > 0) {
      setMissingFields(missing);
      setConfirmationStatus(null);
      setFeedback({
        tone: "error",
        text:
          form.returnTripRequested === "yes"
            ? "Please complete the outbound and return trip date, time, pickup, and drop-off details before submitting your request."
            : "Please complete contact no., passenger name, pickup date, pickup time, pickup location, and drop-off location before submitting your request.",
      });
      return;
    }

    if (!termsAccepted) {
      setMissingFields([]);
      setConfirmationStatus(null);
      setFeedback({
        tone: "error",
        text: "Please accept the booking terms, surcharges, and waiting-time policy before submitting.",
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
        if (result.reason === "portal_access_cleared") {
          setFeedback({
            tone: "error",
            text: "Your old saved portal access was cleared. Review the details, then press Submit Booking Request again.",
          });
          return;
        }

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
        text: `Booking request could not be submitted right now. Please contact ${companyName}.`,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function isMissing(field: keyof BookingRequestForm) {
    return missingFields.includes(field);
  }

  const visiblePickupTimeParts = (() => {
    const formParts = splitPickupTime(form.pickupTime);

    return {
      hour: pickupTimeDraft.hour || formParts.hour,
      minute: pickupTimeDraft.minute || formParts.minute,
    };
  })();
  const visibleReturnPickupTimeParts = (() => {
    const formParts = splitPickupTime(form.returnPickupTime);

    return {
      hour: returnPickupTimeDraft.hour || formParts.hour,
      minute: returnPickupTimeDraft.minute || formParts.minute,
    };
  })();

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-stone-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8"
      data-customer-booking-page="true"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="rounded-md border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div
                className="flex min-w-0 items-center gap-2"
                data-customer-company-profile-brand="true"
              >
                {companyProfile.logo_image_url ? (
                  <span
                    aria-label={`${companyName} logo`}
                    className="h-8 w-8 shrink-0 rounded-md bg-contain bg-center bg-no-repeat"
                    role="img"
                    style={{ backgroundImage: `url("${companyProfile.logo_image_url}")` }}
                  />
                ) : null}
                <p className="truncate text-sm font-semibold uppercase text-slate-600">{companyName}</p>
              </div>
              <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Booking Request</h1>
              <p
                className="mt-2 max-w-3xl text-sm leading-6 text-slate-700 sm:text-base"
                data-customer-booking-header-note="true"
              >
                Thank you for your request. Our team will review it at our soonest. Hotline: {hotlineContact}.
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
          <div
            className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"
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
        </header>

        <form
          className="rounded-md border border-slate-200 bg-white p-3 shadow-sm sm:p-4"
          data-customer-booking-form-density="slim"
          data-customer-booking-form="true"
          noValidate
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-3">
            <section aria-labelledby="contact-section-title">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-slate-950" id="contact-section-title">
                  Contact Details
                </h2>
                <div
                  className="mt-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs leading-5 text-sky-950"
                  data-customer-booking-request-notice="true"
                >
                  <p>Our team will review and confirm your booking shortly. Thank you</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold text-slate-800">
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

                <label className="text-xs font-semibold text-slate-800">
                  Contact no.
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

                <label className="text-xs font-semibold text-slate-800 md:col-span-2">
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
              <h2 className="text-base font-semibold text-slate-950" id="trip-section-title">
                Trip Details
              </h2>
              <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs font-semibold text-slate-800">
                  Passenger name
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

                <label className="text-xs font-semibold text-slate-800">
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

                <label className="text-xs font-semibold text-slate-800">
                  Pickup date
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

                <label className="text-xs font-semibold text-slate-800">
                  Pickup time
                  <input
                    aria-invalid={isMissing("pickupTime")}
                    data-customer-booking-field="pickupTime"
                    name="pickupTime"
                    required
                    type="hidden"
                    value={form.pickupTime}
                  />
                  <div
                    className="mt-1 flex max-w-xs items-center gap-1.5"
                    data-customer-booking-time-control="compact-selects"
                  >
                    <select
                      aria-invalid={isMissing("pickupTime")}
                      aria-label="Pickup hour"
                      className={`${timePartClass(isMissing("pickupTime"))} w-16`}
                      data-customer-booking-time-part="hour"
                      onChange={(event) => updatePickupTimeSelect("hour", event.target.value)}
                      value={visiblePickupTimeParts.hour}
                    >
                      <option value="">HH</option>
                      {pickupHourOptions.map((hour) => (
                        <option key={hour} value={hour}>
                          {hour}
                        </option>
                      ))}
                    </select>
                    <span aria-hidden="true" className="text-base text-slate-500">
                      :
                    </span>
                    <select
                      aria-invalid={isMissing("pickupTime")}
                      aria-label="Pickup minute"
                      className={`${timePartClass(isMissing("pickupTime"))} w-16`}
                      data-customer-booking-time-part="minute"
                      onChange={(event) => updatePickupTimeSelect("minute", event.target.value)}
                      value={visiblePickupTimeParts.minute}
                    >
                      <option value="">MM</option>
                      {pickupMinuteOptions.map((minute) => (
                        <option key={minute} value={minute}>
                          {minute}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label className="text-xs font-semibold text-slate-800 md:col-span-1 xl:col-span-2">
                  Pickup location
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

                <label className="text-xs font-semibold text-slate-800 md:col-span-1 xl:col-span-2">
                  Drop-off location
                  <input
                    aria-invalid={isMissing("dropoffLocation")}
                    className={fieldClass(isMissing("dropoffLocation"))}
                    data-customer-booking-field="dropoffLocation"
                    name="dropoffLocation"
                    onChange={(event) => updateField("dropoffLocation", event.target.value)}
                    placeholder="Destination hotel, airport terminal, home, or office"
                    required
                    type="text"
                    value={form.dropoffLocation}
                  />
                </label>

                <label className="text-xs font-semibold text-slate-800">
                  Type of service
                  <select
                    className={fieldClass()}
                    data-customer-booking-field="serviceType"
                    name="serviceType"
                    onChange={(event) => updateField("serviceType", event.target.value)}
                    value={form.serviceType}
                  >
                    <option value="">Please select service type</option>
                    {serviceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-800">
                  Vehicle type
                  <select
                    className={fieldClass()}
                    data-customer-booking-field="vehicleType"
                    name="vehicleType"
                    onChange={(event) => updateField("vehicleType", event.target.value)}
                    value={form.vehicleType}
                  >
                    <option value="">No preference</option>
                    {vehicleOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold text-slate-800">
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

                <label className="text-xs font-semibold text-slate-800">
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

                <label className="text-xs font-semibold text-slate-800 md:col-span-2 xl:col-span-2">
                  Extra stops
                  <input
                    className={fieldClass()}
                    data-customer-booking-field="extraStops"
                    name="extraStops"
                    onChange={(event) => updateField("extraStops", event.target.value)}
                    placeholder="Extra stop name or address if needed"
                    type="text"
                    value={form.extraStops}
                  />
                </label>

                <div
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 md:col-span-2 xl:col-span-4"
                  data-customer-booking-return-trip-control="true"
                >
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <input
                      checked={form.returnTripRequested === "yes"}
                      className="h-4 w-4 rounded border-slate-300 text-slate-950"
                      data-customer-booking-field="returnTripRequested"
                      data-customer-booking-return-trip-checkbox="true"
                      name="returnTripRequested"
                      onChange={(event) => toggleReturnTrip(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      Return trip
                      <span className="ml-2 inline text-[11px] font-medium leading-5 text-slate-600">
                        Add return details as a linked second request for team review.
                      </span>
                    </span>
                  </label>
                </div>

                {form.returnTripRequested === "yes" ? (
                  <div
                    className="grid gap-2.5 rounded-md border border-slate-200 bg-white p-2.5 md:col-span-2 md:grid-cols-2 xl:col-span-4 xl:grid-cols-4"
                    data-customer-booking-return-trip-fields="true"
                  >
                    <label className="text-xs font-semibold text-slate-800">
                      Return pickup date
                      <input
                        aria-invalid={isMissing("returnPickupDate")}
                        className={fieldClass(isMissing("returnPickupDate"))}
                        data-customer-booking-field="returnPickupDate"
                        name="returnPickupDate"
                        onChange={(event) => updateField("returnPickupDate", event.target.value)}
                        required
                        type="date"
                        value={form.returnPickupDate}
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-800">
                      Return pickup time
                      <input
                        aria-invalid={isMissing("returnPickupTime")}
                        data-customer-booking-field="returnPickupTime"
                        name="returnPickupTime"
                        required
                        type="hidden"
                        value={form.returnPickupTime}
                      />
                      <div className="mt-1 flex max-w-xs items-center gap-1.5">
                        <select
                          aria-invalid={isMissing("returnPickupTime")}
                          aria-label="Return pickup hour"
                          className={`${timePartClass(isMissing("returnPickupTime"))} w-16`}
                          data-customer-booking-time-part="return-hour"
                          onChange={(event) => updateReturnPickupTimeSelect("hour", event.target.value)}
                          value={visibleReturnPickupTimeParts.hour}
                        >
                          <option value="">HH</option>
                          {pickupHourOptions.map((hour) => (
                            <option key={hour} value={hour}>
                              {hour}
                            </option>
                          ))}
                        </select>
                        <span aria-hidden="true" className="text-base text-slate-500">
                          :
                        </span>
                        <select
                          aria-invalid={isMissing("returnPickupTime")}
                          aria-label="Return pickup minute"
                          className={`${timePartClass(isMissing("returnPickupTime"))} w-16`}
                          data-customer-booking-time-part="return-minute"
                          onChange={(event) => updateReturnPickupTimeSelect("minute", event.target.value)}
                          value={visibleReturnPickupTimeParts.minute}
                        >
                          <option value="">MM</option>
                          {pickupMinuteOptions.map((minute) => (
                            <option key={minute} value={minute}>
                              {minute}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>

                    <label className="text-xs font-semibold text-slate-800 xl:col-span-2">
                      Return pickup location
                      <input
                        aria-invalid={isMissing("returnPickupLocation")}
                        className={fieldClass(isMissing("returnPickupLocation"))}
                        data-customer-booking-field="returnPickupLocation"
                        name="returnPickupLocation"
                        onChange={(event) => updateField("returnPickupLocation", event.target.value)}
                        placeholder="Return pickup location"
                        required
                        type="text"
                        value={form.returnPickupLocation}
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-800 xl:col-span-2">
                      Return drop-off location
                      <input
                        aria-invalid={isMissing("returnDropoffLocation")}
                        className={fieldClass(isMissing("returnDropoffLocation"))}
                        data-customer-booking-field="returnDropoffLocation"
                        name="returnDropoffLocation"
                        onChange={(event) => updateField("returnDropoffLocation", event.target.value)}
                        placeholder="Return destination"
                        required
                        type="text"
                        value={form.returnDropoffLocation}
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-800 md:col-span-2 xl:col-span-4">
                      Return flight number if any
                      <input
                        className={fieldClass()}
                        data-customer-booking-field="returnFlightNumber"
                        name="returnFlightNumber"
                        onChange={(event) => updateField("returnFlightNumber", event.target.value)}
                        placeholder="SQ123"
                        type="text"
                        value={form.returnFlightNumber}
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-800 md:col-span-2 xl:col-span-4">
                      Return extra stops
                      <input
                        className={fieldClass()}
                        data-customer-booking-field="returnExtraStops"
                        name="returnExtraStops"
                        onChange={(event) => updateField("returnExtraStops", event.target.value)}
                        placeholder="Return extra stop name or address if needed"
                        type="text"
                        value={form.returnExtraStops}
                      />
                    </label>
                  </div>
                ) : null}

                <label className="text-xs font-semibold text-slate-800 md:col-span-2 xl:col-span-2">
                  Special request / note
                  <textarea
                    className={`${fieldClass()} min-h-20 resize-y`}
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
              <div
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] leading-5 text-slate-500"
                data-customer-booking-terms-summary="true"
              >
                <label
                  className="flex min-w-0 items-start gap-2 font-medium text-slate-600"
                  data-customer-booking-terms-acceptance="true"
                >
                  <input
                    checked={termsAccepted}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-950 focus:ring-slate-300"
                    data-customer-booking-terms-checkbox="true"
                    onChange={(event) => setTermsAccepted(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    I agree to the booking terms, surcharges, waiting-time policy, and hourly grace rule.
                  </span>
                </label>
                <details className="mt-2" data-customer-booking-terms-details="true">
                  <summary className="cursor-pointer text-[11px] font-semibold text-slate-600">
                    View terms, surcharges and grace periods
                  </summary>
                  <ul className="mt-1 grid gap-1 pl-4">
                    {customerTermsAndSurchargeSummary.map((term) => (
                      <li className="list-disc" key={term}>
                        {term}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1">{customerTermsAndConditionsSummary}</p>
                </details>
              </div>
              <p className="text-sm leading-6 text-slate-600">
                After you submit, {companyName} will review the request and reply with the next step.
              </p>
              <button
                className="min-h-12 rounded-md bg-slate-950 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-400"
                data-customer-booking-submit="true"
                disabled={submitting || Boolean(confirmationStatus)}
                type="submit"
              >
                {confirmationStatus ? "Submitted" : submitting ? "Submitting..." : "Submit Booking Request"}
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
