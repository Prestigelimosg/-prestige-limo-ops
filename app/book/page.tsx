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

export default function CustomerBookingPage() {
  const [form, setForm] = useState<BookingRequestForm>(initialForm);
  const [missingFields, setMissingFields] = useState<Array<keyof BookingRequestForm>>([]);
  const [bookingMemorySuggestions, setBookingMemorySuggestions] = useState<CustomerBookingMemorySuggestion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const bookingMemoryLoadStarted = useRef(false);
  const [confirmationStatus, setConfirmationStatus] = useState<CustomerBookingConfirmationStatus | null>(null);
  const [feedback, setFeedback] = useState<Feedback>({
    tone: "info",
    text: "Send a request and our staff will review the details before confirming availability.",
  });

  function updateField(field: keyof BookingRequestForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
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
    }
  }

  function updatePassengerName(value: string) {
    const suggestion = findCustomerBookingMemorySuggestion(bookingMemorySuggestions, value);

    setForm((current) => {
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
    setForm((currentForm) => {
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
      const response = await fetch("/api/customer-booking-requests", {
        body: JSON.stringify({
          companyName: form.companyName,
          contactNo: form.contactNo,
          emailAddress: form.emailAddress,
          passengerName: form.passengerName,
          pickupDate: form.pickupDate,
          pickupTime: form.pickupTime,
          flightNumber: form.flightNumber,
          pickupLocation: form.pickupLocation,
          dropoffLocation: form.dropoffLocation,
          serviceType: form.serviceType,
          vehicleType: form.vehicleType,
          passengerCount: form.passengerCount,
          luggage: form.luggage,
          extraStops: form.extraStops,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-customer-purpose": "customer-booking-request",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Booking request could not be submitted.");
      }

      const shortNoticeReviewRequired = result?.request?.short_notice_review_required === true;
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
            <Link
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-slate-500"
              data-customer-booking-portal-link="true"
              href="/my-bookings"
            >
              Portal
            </Link>
          </div>
          <p
            className="mt-3 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium leading-6 text-sky-950"
            data-customer-booking-mobile-web-note="true"
          >
            Mobile web request form for trip details only. Prestige Limo will reply before confirmation.
          </p>
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
