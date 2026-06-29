"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  loadCustomerPortalSavedBookings,
  type CustomerPortalBooking,
} from "../../lib/customer-portal-saved-bookings-adapter";
import {
  applyCustomerBookingLocalVoiceDraftFieldFillToForm,
  getCustomerBookingSpeechRecognitionConstructor,
  transcriptFromCustomerBookingSpeechEvent,
  type CustomerBookingLocalVoiceDraftSupportedField,
  type CustomerBookingSpeechRecognition,
} from "../../lib/customer-booking-local-voice-draft";
import {
  defaultCompanyProfile,
  type PublicCompanyProfile,
} from "../../lib/company-profile-shared";

type BookingFilter = "Cancelled" | "Completed" | "Upcoming";
type PortalSection = "New Booking Request" | BookingFilter;
type PortalBookingsLoadState = "blocked" | "loading" | "ready";

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

type BookingRequestFeedback = {
  tone: "info" | "success" | "error";
  text: string;
};

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

const visibleBookingLimit = 10;

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const bookingFilters: BookingFilter[] = ["Upcoming", "Completed", "Cancelled"];
const portalSections: PortalSection[] = ["New Booking Request", ...bookingFilters];

const initialBookingPages: Record<BookingFilter, number> = {
  Cancelled: 1,
  Completed: 1,
  Upcoming: 1,
};

const initialSelectedBookingMonths: Record<BookingFilter, string> = {
  Cancelled: "",
  Completed: "",
  Upcoming: "",
};

const initialBookingRequestForm: BookingRequestForm = {
  companyName: "",
  contactNo: "",
  emailAddress: "",
  passengerName: "",
  pickupDate: "",
  pickupTime: "",
  flightNumber: "",
  pickupLocation: "",
  dropoffLocation: "",
  serviceType: "",
  vehicleType: "",
  passengerCount: "",
  luggage: "",
  extraStops: "",
  specialRequest: "",
};

const requiredBookingRequestFields: Array<keyof BookingRequestForm> = [
  "contactNo",
  "passengerName",
  "pickupDate",
  "pickupTime",
];

const bookingRequestFieldLabels: Record<keyof BookingRequestForm, string> = {
  companyName: "Customer / company name",
  contactNo: "Contact no.",
  emailAddress: "Email address",
  passengerName: "Passenger name",
  pickupDate: "Pickup date",
  pickupTime: "Pickup time",
  flightNumber: "Flight number if any",
  pickupLocation: "Pickup location",
  dropoffLocation: "Drop-off location",
  serviceType: "Trip type",
  vehicleType: "Preferred vehicle",
  passengerCount: "Number of passengers",
  luggage: "Luggage",
  extraStops: "Extra stops",
  specialRequest: "Special request / note",
};

const pickupHourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const pickupMinuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

function rowMatchesFilter(booking: CustomerPortalBooking, filter: BookingFilter) {
  if (filter === "Completed") {
    return booking.status === "Completed";
  }

  if (filter === "Cancelled") {
    return booking.status === "Cancelled";
  }

  return booking.status !== "Completed" && booking.status !== "Cancelled";
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function getBookingMonthInfo(booking: CustomerPortalBooking) {
  const [dateText = ""] = booking.pickupDateTime.split(",");
  const [dayText = "", monthText = "", yearText = ""] = dateText.trim().split(" ");
  const monthIndex = monthNames.indexOf(monthText);
  const year = Number(yearText);
  const day = Number(dayText);

  if (monthIndex < 0 || !Number.isFinite(year) || !Number.isFinite(day)) {
    return {
      key: "",
      label: "Date to confirm",
      sortValue: 0,
    };
  }

  return {
    key: `${yearText}-${String(monthIndex + 1).padStart(2, "0")}`,
    label: `${monthText} ${yearText}`,
    sortValue: Date.UTC(year, monthIndex, day),
  };
}

function getCurrentPortalMonthInfo(date = new Date()) {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();

  return {
    key: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    label: `${monthNames[monthIndex]} ${year}`,
  };
}

function fieldClass(hasError = false) {
  return [
    "mt-2 min-h-11 w-full rounded-md border bg-white px-3 py-2 font-sans text-base font-normal text-slate-950 shadow-sm outline-none transition",
    "focus:border-sky-500 focus:ring-2 focus:ring-sky-100",
    hasError ? "border-red-400" : "border-slate-300",
  ].join(" ");
}

function timePartClass(hasError = false) {
  return [
    "min-h-11 rounded-md border bg-white px-3 py-2 font-sans text-base font-normal text-slate-950 shadow-sm outline-none transition",
    "focus:border-sky-500 focus:ring-2 focus:ring-sky-100",
    hasError ? "border-red-400" : "border-slate-300",
  ].join(" ");
}

function feedbackClass(tone: BookingRequestFeedback["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-900";
  }

  return "border-sky-200 bg-sky-50 text-sky-950";
}

function canRequestBookingReview(booking: CustomerPortalBooking) {
  return booking.status !== "Completed" && booking.status !== "Cancelled";
}

function splitPickupTime(value: string) {
  const [hour = "", minute = ""] = value.split(":");

  return {
    hour: pickupHourOptions.includes(hour) ? hour : "",
    minute: pickupMinuteOptions.includes(minute) ? minute : "",
  };
}

export default function CustomerPortalPage() {
  const [activeSection, setActiveSection] = useState<PortalSection>("Upcoming");
  const [companyProfile, setCompanyProfile] =
    useState<PublicCompanyProfile>(defaultCompanyProfile);
  const [expandedBookingId, setExpandedBookingId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [changeFeedback, setChangeFeedback] = useState<Record<string, string>>({});
  const [portalBookings, setPortalBookings] = useState<CustomerPortalBooking[]>([]);
  const [portalBookingsLoadState, setPortalBookingsLoadState] =
    useState<PortalBookingsLoadState>("loading");
  const [bookingPages, setBookingPages] = useState<Record<BookingFilter, number>>(initialBookingPages);
  const [selectedBookingMonths, setSelectedBookingMonths] =
    useState<Record<BookingFilter, string>>(initialSelectedBookingMonths);
  const [bookingRequestForm, setBookingRequestForm] = useState<BookingRequestForm>(initialBookingRequestForm);
  const [pickupTimeDraft, setPickupTimeDraft] = useState(() => splitPickupTime(initialBookingRequestForm.pickupTime));
  const [missingBookingRequestFields, setMissingBookingRequestFields] = useState<Array<keyof BookingRequestForm>>([]);
  const bookingRequestFormRef = useRef<BookingRequestForm>(initialBookingRequestForm);
  const voiceRecognitionRef = useRef<CustomerBookingSpeechRecognition | null>(null);
  const voiceRecognitionErroredRef = useRef(false);
  const voiceTranscriptRef = useRef("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceHelperText, setVoiceHelperText] = useState(
    "Use Speak as a local draft helper. Review the transcript, then type or edit the trip fields yourself.",
  );
  const [voiceDraftFilledFields, setVoiceDraftFilledFields] = useState<CustomerBookingLocalVoiceDraftSupportedField[]>([]);
  const [bookingRequestFeedback, setBookingRequestFeedback] = useState<BookingRequestFeedback>({
    tone: "info",
    text: "Submit a booking request and our staff will review availability before confirming.",
  });
  const companyName = companyProfile.company_name || defaultCompanyProfile.company_name;

  const activeFilter: BookingFilter = activeSection === "New Booking Request" ? "Upcoming" : activeSection;
  const selectedBookingMonth = selectedBookingMonths[activeFilter] || "";
  const currentPortalMonth = useMemo(() => getCurrentPortalMonthInfo(), []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCompanyProfile() {
      try {
        const response = await fetch("/api/company-profile", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          ok?: boolean;
          profile?: PublicCompanyProfile;
        };

        if (response.ok && data.ok && data.profile) {
          setCompanyProfile(data.profile);
        }
      } catch {
        setCompanyProfile(defaultCompanyProfile);
      }
    }

    void loadCompanyProfile();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    async function loadSavedBookings() {
      const loadedBookings = await loadCustomerPortalSavedBookings({
        signal: controller.signal,
      });

      if (!isCurrent) {
        return;
      }

      setPortalBookings(loadedBookings || []);
      setPortalBookingsLoadState(loadedBookings === null ? "blocked" : "ready");
      setExpandedBookingId("");
      setChangeFeedback({});
      setBookingPages({ ...initialBookingPages });
      setSelectedBookingMonths({ ...initialSelectedBookingMonths });
    }

    loadSavedBookings();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, []);

  const filteredBookings = useMemo(() => {
    const query = normalize(searchQuery);

    return portalBookings.filter((booking) => {
      if (!rowMatchesFilter(booking, activeFilter)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        booking.dropoffLocation,
        booking.flightNumber,
        booking.passengerName,
        booking.pickupDateTime,
        booking.pickupLocation,
        booking.serviceType,
        booking.specialRequest,
        booking.status,
        booking.vehicleType,
      ]
        .filter(Boolean)
        .some((value) => normalize(String(value)).includes(query));
    });
  }, [activeFilter, portalBookings, searchQuery]);

  const pastMonthOptions = useMemo(() => {
    if (activeFilter === "Upcoming") {
      return [];
    }

    const months = new Map<string, { key: string; label: string; sortValue: number }>();

    filteredBookings.forEach((booking) => {
      const monthInfo = getBookingMonthInfo(booking);

      if (monthInfo.key && monthInfo.key !== currentPortalMonth.key) {
        months.set(monthInfo.key, monthInfo);
      }
    });

    return [...months.values()].sort((left, right) => right.key.localeCompare(left.key));
  }, [activeFilter, currentPortalMonth.key, filteredBookings]);

  const scopedBookings = useMemo(() => {
    if (activeFilter === "Upcoming") {
      return filteredBookings;
    }

    const monthKey = selectedBookingMonth || currentPortalMonth.key;

    return filteredBookings.filter((booking) => getBookingMonthInfo(booking).key === monthKey);
  }, [activeFilter, currentPortalMonth.key, filteredBookings, selectedBookingMonth]);

  const totalBookingPages = Math.max(1, Math.ceil(scopedBookings.length / visibleBookingLimit));
  const currentBookingPage = Math.min(bookingPages[activeFilter] || 1, totalBookingPages);
  const firstVisibleBookingIndex = (currentBookingPage - 1) * visibleBookingLimit;
  const visibleBookings = scopedBookings.slice(firstVisibleBookingIndex, firstVisibleBookingIndex + visibleBookingLimit);
  const showingStart = scopedBookings.length === 0 ? 0 : firstVisibleBookingIndex + 1;
  const showingEnd = firstVisibleBookingIndex + visibleBookings.length;
  const selectedMonthOption = pastMonthOptions.find((month) => month.key === selectedBookingMonth);
  const activeMonthLabel = (() => {
    if (activeFilter === "Upcoming") {
      return "";
    }

    if (selectedBookingMonth) {
      return selectedMonthOption?.label || selectedBookingMonth;
    }

    return currentPortalMonth.label;
  })();
  const expandedBooking = visibleBookings.find((booking) => booking.id === expandedBookingId);
  const emptyBookingsMessage =
    portalBookingsLoadState === "loading"
      ? "Loading bookings."
      : portalBookingsLoadState === "blocked"
        ? "Sign in to view bookings."
        : "No bookings match the current search.";

  function handleSectionChange(section: PortalSection) {
    const nextFilter: BookingFilter = section === "New Booking Request" ? "Upcoming" : section;

    setActiveSection(section);
    setExpandedBookingId("");
    setChangeFeedback({});
    setBookingPages((current) => ({ ...current, [nextFilter]: 1 }));
    setSelectedBookingMonths((current) => ({ ...current, [nextFilter]: "" }));
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setExpandedBookingId("");
    setChangeFeedback({});
    setBookingPages((current) => ({ ...current, [activeFilter]: 1 }));
  }

  function handleMonthSelect(monthKey: string) {
    setSelectedBookingMonths((current) => ({ ...current, [activeFilter]: monthKey }));
    setBookingPages((current) => ({ ...current, [activeFilter]: 1 }));
    setExpandedBookingId("");
    setChangeFeedback({});
  }

  function handlePageChange(direction: "next" | "previous") {
    setBookingPages((current) => {
      const currentPage = Math.min(current[activeFilter] || 1, totalBookingPages);
      const nextPage = direction === "next" ? currentPage + 1 : currentPage - 1;

      return {
        ...current,
        [activeFilter]: Math.min(Math.max(nextPage, 1), totalBookingPages),
      };
    });
    setExpandedBookingId("");
    setChangeFeedback({});
  }

  function handleEditRequest(booking: CustomerPortalBooking) {
    setExpandedBookingId(booking.id);
    setChangeFeedback({
      [booking.id]: canRequestBookingReview(booking)
        ? `Edit request noted for review. ${companyName} staff will confirm before anything changes.`
        : "Completed or cancelled bookings are read-only here. Please contact our team if you need help.",
    });
  }

  function handleCancelRequest(booking: CustomerPortalBooking) {
    setExpandedBookingId(booking.id);
    setChangeFeedback({
      [booking.id]: canRequestBookingReview(booking)
        ? `Cancel request noted for review. Your booking is not cancelled until ${companyName} confirms.`
        : "Completed or cancelled bookings are read-only here. Please contact our team if you need help.",
    });
  }

  function updateBookingRequestField(field: keyof BookingRequestForm, value: string) {
    setBookingRequestForm((current) => {
      const nextForm = { ...current, [field]: value };
      bookingRequestFormRef.current = nextForm;
      return nextForm;
    });
    setMissingBookingRequestFields((current) => current.filter((item) => item !== field));
  }

  function updatePickupTimeSelect(part: "hour" | "minute", value: string) {
    setPickupTimeDraft((current) => {
      const base =
        current.hour || current.minute
          ? current
          : splitPickupTime(bookingRequestFormRef.current.pickupTime);
      const next = { ...base, [part]: value };
      updateBookingRequestField("pickupTime", next.hour && next.minute ? `${next.hour}:${next.minute}` : "");
      return next;
    });
  }

  function applyLocalVoiceDraftFieldFill(transcript: string) {
    const result = applyCustomerBookingLocalVoiceDraftFieldFillToForm(bookingRequestFormRef.current, transcript);
    setVoiceDraftFilledFields(result.filledFields);

    if (result.filledFields.length === 0) {
      setVoiceHelperText(
        "Voice draft captured locally. No safe empty fields changed. Review the transcript and type details manually.",
      );
      return;
    }

    bookingRequestFormRef.current = result.nextForm;
    setBookingRequestForm(result.nextForm);
    if (result.filledFields.includes("pickupTime")) {
      setPickupTimeDraft(splitPickupTime(result.nextForm.pickupTime));
    }
    setMissingBookingRequestFields((current) =>
      current.filter((item) => !result.filledFields.includes(item as CustomerBookingLocalVoiceDraftSupportedField)),
    );
    setVoiceHelperText(
      `Voice draft filled ${result.filledFields.map((field) => bookingRequestFieldLabels[field]).join(", ")}. Review and edit before submitting.`,
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

  function handleBookingRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const missing = requiredBookingRequestFields.filter((field) => !bookingRequestForm[field].trim());

    if (missing.length > 0) {
      setMissingBookingRequestFields(missing);
      setBookingRequestFeedback({
        tone: "error",
        text: "Please complete contact no., passenger name, pickup date, and pickup time before submitting your request.",
      });
      return;
    }

    setMissingBookingRequestFields([]);
    setBookingRequestFeedback({
      tone: "success",
      text: `Booking request received for review. This is not confirmed yet. ${companyName} staff will reply to confirm availability.`,
    });
  }

  function isBookingRequestMissing(field: keyof BookingRequestForm) {
    return missingBookingRequestFields.includes(field);
  }

  const visiblePickupTimeParts = (() => {
    const formParts = splitPickupTime(bookingRequestForm.pickupTime);

    return {
      hour: pickupTimeDraft.hour || formParts.hour,
      minute: pickupTimeDraft.minute || formParts.minute,
    };
  })();

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-stone-50 px-3 py-4 text-slate-950 sm:px-4 lg:px-6"
      data-customer-portal-page="true"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <header className="border-b border-slate-200 px-1 pb-3 pt-1">
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
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">My Bookings</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Customers can view booking requests and booking history here after staff confirmation.
          </p>
          {companyProfile.whatsapp_phone || companyProfile.phone || companyProfile.email ? (
            <p
              className="mt-1 text-xs leading-5 text-slate-600"
              data-customer-company-profile-contact="true"
            >
              {[companyProfile.whatsapp_phone, companyProfile.phone, companyProfile.email]
                .filter(Boolean)
                .join(" | ")}
            </p>
          ) : null}
        </header>

        <nav
          aria-label="Customer portal sections"
          className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
          data-customer-portal-sections="true"
        >
          {portalSections.map((section) => {
            const isActive = activeSection === section;
            const isBookingFilter = section !== "New Booking Request";

            return (
              <button
                className={[
                  "min-h-9 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition",
                  isActive
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-300 bg-white text-slate-800 hover:border-slate-500",
                ].join(" ")}
                data-active={isActive ? "true" : "false"}
                data-customer-portal-filter={isBookingFilter ? section : undefined}
                data-customer-portal-section={section}
                key={section}
                onClick={() => handleSectionChange(section)}
                type="button"
              >
                {section}
              </button>
            );
          })}
        </nav>

        {activeSection === "New Booking Request" ? (
          <form
            className="rounded-md border border-slate-200 bg-white p-3 sm:p-4"
            data-customer-portal-request-form="true"
            noValidate
            onSubmit={handleBookingRequestSubmit}
          >
            <div className="flex flex-col gap-4">
              <section aria-labelledby="portal-request-contact-title">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-base font-semibold text-slate-950" id="portal-request-contact-title">
                      New Booking Request
                    </h2>
                    <button
                      aria-pressed={voiceListening}
                      className="inline-flex min-h-9 w-fit items-center justify-center rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-950 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-70"
                      data-customer-portal-voice-booking-mode="local-transcript-helper"
                      data-customer-portal-voice-booking-speak-button="true"
                      onClick={handleSpeakDraft}
                      type="button"
                    >
                      {voiceListening ? "Listening" : "Speak"}
                    </button>
                  </div>
                  <div
                    className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-950"
                    data-customer-portal-request-notice="true"
                  >
                    <p>Admin will review and confirm your booking shortly. Thank you</p>
                  </div>
                  <div
                    className="text-sm leading-6 text-slate-600"
                    data-customer-portal-voice-booking-helper="true"
                    data-customer-portal-voice-booking-local-only="true"
                  >
                    <p data-customer-portal-voice-booking-status="true">{voiceHelperText}</p>
                    {voiceTranscript ? (
                      <p className="mt-1" data-customer-portal-voice-booking-draft-note="true">
                        <span>Voice draft: </span>
                        <span data-customer-portal-voice-booking-transcript="true">{voiceTranscript}</span>
                      </p>
                    ) : null}
                    {voiceDraftFilledFields.length > 0 ? (
                      <p
                        className="mt-1"
                        data-customer-portal-voice-booking-draft-fill="local-only"
                        data-customer-portal-voice-booking-draft-fill-fields={voiceDraftFilledFields.join(",")}
                      >
                        Filled fields: {voiceDraftFilledFields.map((field) => bookingRequestFieldLabels[field]).join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-800">
                    Customer / company name
                    <input
                      className={fieldClass()}
                      data-customer-portal-request-field="companyName"
                      name="companyName"
                      onChange={(event) => updateBookingRequestField("companyName", event.target.value)}
                      placeholder="Company or family name"
                      type="text"
                      value={bookingRequestForm.companyName}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Contact no.
                    <input
                      aria-invalid={isBookingRequestMissing("contactNo")}
                      className={fieldClass(isBookingRequestMissing("contactNo"))}
                      data-customer-portal-request-field="contactNo"
                      name="contactNo"
                      onChange={(event) => updateBookingRequestField("contactNo", event.target.value)}
                      placeholder="+65 9000 0000"
                      required
                      type="tel"
                      value={bookingRequestForm.contactNo}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800 md:col-span-2">
                    Email address
                    <input
                      className={fieldClass()}
                      data-customer-portal-request-field="emailAddress"
                      name="emailAddress"
                      onChange={(event) => updateBookingRequestField("emailAddress", event.target.value)}
                      placeholder="name@example.com"
                      type="email"
                      value={bookingRequestForm.emailAddress}
                    />
                  </label>
                </div>
              </section>

              <section aria-labelledby="portal-request-trip-title">
                <h2 className="text-base font-semibold text-slate-950" id="portal-request-trip-title">
                  Trip Details
                </h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm font-semibold text-slate-800">
                    Passenger name
                    <input
                      aria-invalid={isBookingRequestMissing("passengerName")}
                      className={fieldClass(isBookingRequestMissing("passengerName"))}
                      data-customer-portal-request-field="passengerName"
                      name="passengerName"
                      onChange={(event) => updateBookingRequestField("passengerName", event.target.value)}
                      placeholder="Passenger full name"
                      required
                      type="text"
                      value={bookingRequestForm.passengerName}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Flight number if any
                    <input
                      className={fieldClass()}
                      data-customer-portal-request-field="flightNumber"
                      name="flightNumber"
                      onChange={(event) => updateBookingRequestField("flightNumber", event.target.value)}
                      placeholder="SQ318"
                      type="text"
                      value={bookingRequestForm.flightNumber}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Pickup date
                    <input
                      aria-invalid={isBookingRequestMissing("pickupDate")}
                      className={fieldClass(isBookingRequestMissing("pickupDate"))}
                      data-customer-portal-request-field="pickupDate"
                      name="pickupDate"
                      onChange={(event) => updateBookingRequestField("pickupDate", event.target.value)}
                      required
                      type="date"
                      value={bookingRequestForm.pickupDate}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Pickup time
                    <input
                      aria-invalid={isBookingRequestMissing("pickupTime")}
                      data-customer-portal-request-field="pickupTime"
                      name="pickupTime"
                      required
                      type="hidden"
                      value={bookingRequestForm.pickupTime}
                    />
                    <div
                      className="mt-2 flex max-w-xs items-center gap-2"
                      data-customer-portal-pickup-time="compact-selects"
                    >
                      <select
                        aria-invalid={isBookingRequestMissing("pickupTime")}
                        aria-label="Pickup hour"
                        className={`${timePartClass(isBookingRequestMissing("pickupTime"))} w-20`}
                        data-customer-portal-pickup-time-part="hour"
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
                        aria-invalid={isBookingRequestMissing("pickupTime")}
                        aria-label="Pickup minute"
                        className={`${timePartClass(isBookingRequestMissing("pickupTime"))} w-20`}
                        data-customer-portal-pickup-time-part="minute"
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

                  <label className="text-sm font-semibold text-slate-800">
                    Pickup location
                    <input
                      className={fieldClass()}
                      data-customer-portal-request-field="pickupLocation"
                      name="pickupLocation"
                      onChange={(event) => updateBookingRequestField("pickupLocation", event.target.value)}
                      placeholder="Hotel, airport terminal, lobby, home, or office"
                      type="text"
                      value={bookingRequestForm.pickupLocation}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Drop-off location
                    <input
                      className={fieldClass()}
                      data-customer-portal-request-field="dropoffLocation"
                      name="dropoffLocation"
                      onChange={(event) => updateBookingRequestField("dropoffLocation", event.target.value)}
                      placeholder="Destination hotel, airport terminal, home, or office"
                      type="text"
                      value={bookingRequestForm.dropoffLocation}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Trip type
                    <select
                      className={fieldClass()}
                      data-customer-portal-request-field="serviceType"
                      name="serviceType"
                      onChange={(event) => updateBookingRequestField("serviceType", event.target.value)}
                      value={bookingRequestForm.serviceType}
                    >
                      <option value="">Please select trip type</option>
                      {serviceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Preferred vehicle
                    <select
                      className={fieldClass()}
                      data-customer-portal-request-field="vehicleType"
                      name="vehicleType"
                      onChange={(event) => updateBookingRequestField("vehicleType", event.target.value)}
                      value={bookingRequestForm.vehicleType}
                    >
                      <option value="">No preference</option>
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
                      data-customer-portal-request-field="passengerCount"
                      min="1"
                      name="passengerCount"
                      onChange={(event) => updateBookingRequestField("passengerCount", event.target.value)}
                      placeholder="1"
                      type="number"
                      value={bookingRequestForm.passengerCount}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Luggage
                    <input
                      className={fieldClass()}
                      data-customer-portal-request-field="luggage"
                      name="luggage"
                      onChange={(event) => updateBookingRequestField("luggage", event.target.value)}
                      placeholder="2 suitcases"
                      type="text"
                      value={bookingRequestForm.luggage}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Extra stops
                    <input
                      className={fieldClass()}
                      data-customer-portal-request-field="extraStops"
                      name="extraStops"
                      onChange={(event) => updateBookingRequestField("extraStops", event.target.value)}
                      placeholder="Extra stop name or address if needed"
                      type="text"
                      value={bookingRequestForm.extraStops}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800 md:col-span-2">
                    Special request / note
                    <textarea
                      className={`${fieldClass()} min-h-24 resize-y`}
                      data-customer-portal-request-field="specialRequest"
                      name="specialRequest"
                      onChange={(event) => updateBookingRequestField("specialRequest", event.target.value)}
                      placeholder="Share any timing, luggage, meet-and-greet, or passenger notes"
                      value={bookingRequestForm.specialRequest}
                    />
                  </label>
                </div>
              </section>

              <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
                <button
                  className="min-h-10 w-full rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-fit"
                  data-customer-portal-submit-request="true"
                  type="submit"
                >
                  Submit Booking Request
                </button>
                <p
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClass(bookingRequestFeedback.tone)}`}
                  data-customer-portal-request-feedback="true"
                >
                  {bookingRequestFeedback.text}
                </p>
              </div>
            </div>
          </form>
        ) : (
          <>
            <section
              aria-labelledby="booking-search-title"
              className="rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5" data-customer-portal-search-area="true">
                  <label className="text-sm font-semibold text-slate-800" htmlFor="customer-portal-search">
                    Search bookings
                  </label>
                  <p
                    className="text-sm leading-6 text-slate-600"
                    data-customer-portal-search-helper="true"
                  >
                    Search by passenger, pickup, drop-off, flight, or service. Use the tabs to
                    switch between upcoming and past trips.
                  </p>
                  <input
                    className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    data-customer-portal-search="true"
                    id="customer-portal-search"
                    onChange={(event) => handleSearchChange(event.target.value)}
                    placeholder="Search passenger, pickup, drop-off, flight, service"
                    type="search"
                    value={searchQuery}
                  />
                </div>

                {activeFilter !== "Upcoming" ? (
                  <div
                    className="rounded-md border border-slate-200 bg-slate-50 p-2"
                    data-customer-portal-month-groups="true"
                  >
                    <p className="text-sm font-semibold text-slate-800">Select month</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        className={[
                          "min-h-9 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition",
                          selectedBookingMonth
                            ? "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                            : "border-slate-950 bg-slate-950 text-white",
                        ].join(" ")}
                        data-active={selectedBookingMonth ? "false" : "true"}
                        data-customer-portal-current-month="true"
                        onClick={() => handleMonthSelect("")}
                        type="button"
                      >
                        {currentPortalMonth.label}
                      </button>

                      {pastMonthOptions.map((month) => {
                        const isSelected = selectedBookingMonth === month.key;

                        return (
                          <button
                            className={[
                              "min-h-9 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition",
                              isSelected
                                ? "border-slate-950 bg-slate-950 text-white"
                                : "border-slate-300 bg-white text-slate-800 hover:border-slate-500",
                            ].join(" ")}
                            data-active={isSelected ? "true" : "false"}
                            data-customer-portal-month-button={month.key}
                            key={month.key}
                            onClick={() => handleMonthSelect(month.key)}
                            type="button"
                          >
                            {month.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-semibold text-slate-700">
                    {activeMonthLabel ? (
                      <p className="mb-1 text-slate-600" data-customer-portal-active-month="true">
                        {activeMonthLabel}
                      </p>
                    ) : null}
                    <p data-customer-portal-showing="true">
                      {scopedBookings.length === 0
                        ? "Showing 0 of 0 bookings"
                        : `Showing ${showingStart}-${showingEnd} of ${scopedBookings.length} bookings`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5" data-customer-portal-pagination="true">
                    <button
                      className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 transition enabled:hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                      data-customer-portal-prev="true"
                      disabled={currentBookingPage <= 1}
                      onClick={() => handlePageChange("previous")}
                      type="button"
                    >
                      Previous
                    </button>
                    <span className="text-sm font-semibold text-slate-700" data-customer-portal-page-summary="true">
                      Page {currentBookingPage} of {totalBookingPages}
                    </span>
                    <button
                      className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 transition enabled:hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                      data-customer-portal-next="true"
                      disabled={currentBookingPage >= totalBookingPages}
                      onClick={() => handlePageChange("next")}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="customer-portal-results-title"
              className="rounded-md border border-slate-200 bg-white p-2 sm:p-3"
            >
              <h2 className="sr-only" id="customer-portal-results-title">
                Booking results
              </h2>

              {visibleBookings.length === 0 ? (
                <div
                  className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-700"
                  data-customer-portal-access-state={portalBookingsLoadState}
                  data-customer-portal-empty="true"
                >
                  {emptyBookingsMessage}
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-200" data-customer-portal-list="true">
                  {visibleBookings.map((booking) => {
                    const canRequestReview = canRequestBookingReview(booking);
                    const isExpanded = expandedBooking?.id === booking.id;

                    return (
                      <li
                        className="flex flex-col gap-2 py-2"
                        data-customer-portal-row={booking.id}
                        data-customer-portal-status={booking.status}
                        key={booking.id}
                      >
                        <div className="grid gap-3 lg:grid-cols-[1.1fr_1.5fr_1fr_auto] lg:items-center">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-950" data-customer-portal-passenger="true">
                              {booking.passengerName}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">{booking.status}</p>
                          </div>
                          <div className="min-w-0 text-sm text-slate-700">
                            <p className="font-semibold text-slate-900">{booking.pickupDateTime}</p>
                            <p className="mt-1 break-words">
                              {booking.pickupLocation} to {booking.dropoffLocation}
                            </p>
                          </div>
                          <div className="min-w-0 text-sm text-slate-700">
                            <p>{booking.serviceType}</p>
                            <p className="mt-1">{booking.vehicleType}</p>
                          </div>
                          <div
                            className="flex flex-wrap gap-2 lg:justify-end"
                            data-customer-portal-row-actions={booking.id}
                          >
                            <button
                              aria-disabled="true"
                              className="min-h-9 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-sm font-semibold text-slate-500"
                              data-customer-portal-pdf={booking.id}
                              data-customer-portal-row-action="pdf"
                              disabled
                              title="Customer PDF is not ready yet"
                              type="button"
                            >
                              PDF
                            </button>
                            <button
                              className="min-h-9 rounded-md border border-sky-700 bg-sky-700 px-2.5 py-1.5 text-sm font-semibold text-white transition enabled:hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                              data-customer-portal-request-edit={booking.id}
                              data-customer-portal-row-action="edit"
                              disabled={!canRequestReview}
                              onClick={() => handleEditRequest(booking)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 transition enabled:hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                              data-customer-portal-request-cancel={booking.id}
                              data-customer-portal-row-action="cancel"
                              disabled={!canRequestReview}
                              onClick={() => handleCancelRequest(booking)}
                              type="button"
                            >
                              Cancel
                            </button>
                            <button
                              className="min-h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
                              data-customer-portal-detail-button={booking.id}
                              onClick={() => setExpandedBookingId(isExpanded ? "" : booking.id)}
                              type="button"
                            >
                              {isExpanded ? "Hide details" : "View details"}
                            </button>
                          </div>
                        </div>

                        {changeFeedback[booking.id] ? (
                          <p
                            className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950"
                            data-customer-portal-feedback={booking.id}
                          >
                            {changeFeedback[booking.id]}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {expandedBooking ? (
              <section
                aria-labelledby="booking-detail-title"
                className="rounded-md border border-slate-200 bg-white p-3"
                data-customer-portal-detail={expandedBooking.id}
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-base font-semibold text-slate-950" id="booking-detail-title">
                    Booking Details
                  </h2>
                  <p className="text-sm text-slate-600">{expandedBooking.status}</p>
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-slate-600">Pickup date/time</dt>
                    <dd className="mt-1 text-slate-950">{expandedBooking.pickupDateTime}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Passenger name</dt>
                    <dd className="mt-1 text-slate-950">{expandedBooking.passengerName}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Pickup location</dt>
                    <dd className="mt-1 text-slate-950">{expandedBooking.pickupLocation}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Drop-off location</dt>
                    <dd className="mt-1 text-slate-950">{expandedBooking.dropoffLocation}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Type of service</dt>
                    <dd className="mt-1 text-slate-950">{expandedBooking.serviceType}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Vehicle type</dt>
                    <dd className="mt-1 text-slate-950">{expandedBooking.vehicleType}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Flight number</dt>
                    <dd className="mt-1 text-slate-950">{expandedBooking.flightNumber || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600">Special request / note</dt>
                    <dd className="mt-1 text-slate-950">{expandedBooking.specialRequest || "None provided"}</dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
