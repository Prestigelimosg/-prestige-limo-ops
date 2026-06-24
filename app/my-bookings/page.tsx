"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  loadCustomerPortalSavedBookings,
  type CustomerPortalBooking,
} from "../../lib/customer-portal-saved-bookings-adapter";

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
  serviceType: "Other / To Confirm",
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
    "mt-2 min-h-11 w-full rounded-md border bg-white px-3 py-2 font-sans text-base text-slate-950 shadow-sm outline-none transition",
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

function splitPickupTime(value: string) {
  const [hour = "", minute = ""] = value.split(":");

  return {
    hour: pickupHourOptions.includes(hour) ? hour : "",
    minute: pickupMinuteOptions.includes(minute) ? minute : "",
  };
}

function canRequestBookingReview(booking: CustomerPortalBooking) {
  return booking.status !== "Completed" && booking.status !== "Cancelled";
}

export default function CustomerPortalPage() {
  const [activeSection, setActiveSection] = useState<PortalSection>("Upcoming");
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
  const [missingBookingRequestFields, setMissingBookingRequestFields] = useState<Array<keyof BookingRequestForm>>([]);
  const [bookingRequestFeedback, setBookingRequestFeedback] = useState<BookingRequestFeedback>({
    tone: "info",
    text: "Submit a booking request and our staff will review availability before confirming.",
  });

  const activeFilter: BookingFilter = activeSection === "New Booking Request" ? "Upcoming" : activeSection;
  const selectedBookingMonth = selectedBookingMonths[activeFilter] || "";
  const currentPortalMonth = useMemo(() => getCurrentPortalMonthInfo(), []);

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
  const pickupTimeParts = splitPickupTime(bookingRequestForm.pickupTime);
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
        ? "Edit request noted for review. Prestige Limo staff will confirm before anything changes."
        : "Completed or cancelled bookings are read-only here. Please contact our team if you need help.",
    });
  }

  function handleCancelRequest(booking: CustomerPortalBooking) {
    setExpandedBookingId(booking.id);
    setChangeFeedback({
      [booking.id]: canRequestBookingReview(booking)
        ? "Cancel request noted for review. Your booking is not cancelled until Prestige Limo confirms."
        : "Completed or cancelled bookings are read-only here. Please contact our team if you need help.",
    });
  }

  function updateBookingRequestField(field: keyof BookingRequestForm, value: string) {
    setBookingRequestForm((current) => ({ ...current, [field]: value }));
    setMissingBookingRequestFields((current) => current.filter((item) => item !== field));
  }

  function updatePickupTimePart(part: "hour" | "minute", value: string) {
    setBookingRequestForm((currentForm) => {
      const current = splitPickupTime(currentForm.pickupTime);
      const nextHour = part === "hour" ? value : current.hour;
      const nextMinute = part === "minute" ? value : current.minute || "00";

      return {
        ...currentForm,
        pickupTime: nextHour ? `${nextHour}:${nextMinute || "00"}` : "",
      };
    });
    setMissingBookingRequestFields((current) => current.filter((item) => item !== "pickupTime"));
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
      text: "Booking request received for review. This is not confirmed yet. Our staff will reply to confirm availability.",
    });
  }

  function isBookingRequestMissing(field: keyof BookingRequestForm) {
    return missingBookingRequestFields.includes(field);
  }

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-stone-50 px-3 py-4 text-slate-950 sm:px-4 lg:px-6"
      data-customer-portal-page="true"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <header className="border-b border-slate-200 px-1 pb-3 pt-1">
          <p className="text-sm font-semibold uppercase text-slate-600">Prestige Limo SG</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">My Bookings</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Customers can view booking requests and booking history here after staff confirmation.
          </p>
          <p
            className="mt-2 border-l-2 border-sky-300 bg-sky-50/70 px-3 py-1.5 text-sm font-medium leading-6 text-sky-950"
            data-customer-portal-mobile-web-note="true"
          >
            Mobile web trip view for your confirmed and requested rides. Use request review for changes.
          </p>
          <div
            className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm"
            data-customer-portal-guidance="true"
          >
            <p className="text-slate-700">
              <span className="font-semibold text-slate-950">New request: </span>
              Send a trip request from this page.
            </p>
            <p className="text-slate-700">
              <span className="font-semibold text-slate-950">Check trips: </span>
              Search upcoming, completed, or cancelled bookings.
            </p>
            <p className="text-slate-700">
              <span className="font-semibold text-slate-950">Need changes: </span>
              Request a review before the booking is updated.
            </p>
          </div>
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
                  <h2 className="text-base font-semibold text-slate-950" id="portal-request-contact-title">
                    New Booking Request
                  </h2>
                  <p className="text-sm text-slate-600">Required fields are marked with *.</p>
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
                    Contact no. *
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
                    Passenger name *
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
                    Pickup date *
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

                  <fieldset className="text-sm font-semibold text-slate-800" data-customer-portal-pickup-time="true">
                    <legend>Pickup time *</legend>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <label className="sr-only" htmlFor="portal-pickup-hour">
                        Pickup hour
                      </label>
                      <select
                        aria-invalid={isBookingRequestMissing("pickupTime")}
                        className={fieldClass(isBookingRequestMissing("pickupTime")).replace("mt-2 ", "")}
                        data-customer-portal-pickup-hour="true"
                        id="portal-pickup-hour"
                        name="pickupHour"
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
                      <label className="sr-only" htmlFor="portal-pickup-minute">
                        Pickup minute
                      </label>
                      <select
                        aria-invalid={isBookingRequestMissing("pickupTime")}
                        className={fieldClass(isBookingRequestMissing("pickupTime")).replace("mt-2 ", "")}
                        data-customer-portal-pickup-minute="true"
                        id="portal-pickup-minute"
                        name="pickupMinute"
                        onChange={(event) => updatePickupTimePart("minute", event.target.value)}
                        required
                        value={pickupTimeParts.minute}
                      >
                        <option value="">MM</option>
                        {pickupMinuteOptions.map((minute) => (
                          <option key={minute} value={minute}>
                            {minute}
                          </option>
                        ))}
                      </select>
                    </div>
                  </fieldset>

                  <label className="text-sm font-semibold text-slate-800">
                    Pickup location
                    <input
                      className={fieldClass()}
                      data-customer-portal-request-field="pickupLocation"
                      name="pickupLocation"
                      onChange={(event) => updateBookingRequestField("pickupLocation", event.target.value)}
                      placeholder="Hotel, airport, or address"
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
                      placeholder="Hotel, airport, or address"
                      type="text"
                      value={bookingRequestForm.dropoffLocation}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-800">
                    Type of Service
                    <select
                      className={fieldClass()}
                      data-customer-portal-request-field="serviceType"
                      name="serviceType"
                      onChange={(event) => updateBookingRequestField("serviceType", event.target.value)}
                      value={bookingRequestForm.serviceType}
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
                      data-customer-portal-request-field="vehicleType"
                      name="vehicleType"
                      onChange={(event) => updateBookingRequestField("vehicleType", event.target.value)}
                      value={bookingRequestForm.vehicleType}
                    >
                      <option value="">To confirm</option>
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
                      placeholder="Any extra stop details"
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

            <details
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 shadow-sm"
              data-customer-portal-help="true"
            >
              <summary className="cursor-pointer font-semibold text-slate-900">Help</summary>
              <div className="mt-2 grid gap-1">
                <p>Requests here are reviewed by the Prestige Limo team before any booking is updated.</p>
                <p>For urgent same-day help, contact our team directly with the passenger name or pickup time.</p>
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
