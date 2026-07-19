"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";

import {
  calculateCustomerInvoiceRateReview,
  customerInvoiceBookingType,
  type CustomerInvoiceRateSetupRecord,
} from "../../../lib/customer-dsp-invoice-review";
import {
  formatInvoiceAmount,
  parseInvoiceAmountToCents,
} from "../../../lib/customer-local-invoices";
import { formatSingaporePickupDisplay } from "../../../lib/singapore-pickup-display";

const adminCustomerSavedBookingsApiPath = "/api/admin-customer-saved-bookings";
const adminBookingsApiPath = "/api/admin-bookings";
const adminDriverJobDspActualTimeSummariesApiPath =
  "/api/admin-driver-job-dsp-actual-time-summaries";
const adminRateSetupApiPath = "/api/admin-rate-setup";
const customerFolderFocusBookingReferenceParam = "focus_booking_reference";
const customerFolderLoadSavedJobsParam = "load_saved_jobs";
const customerFolderSelectedPriceReviewsParam = "selected_booking_price_reviews";
const customerFolderInvoiceSelectionLimit = 4;

type CustomerFolderSavedBookingRecord = {
  admin_status?: string | null;
  booking_month?: string | null;
  booking_reference?: string | null;
  child_seat_count?: number | null;
  company_id?: number | null;
  customer_price_label?: string | null;
  customer_account?: string | null;
  customer_id?: string | null;
  customer_status?: string | null;
  dropoff_location?: string | null;
  extra_stop_count?: number | null;
  passenger_name?: string | null;
  pickup_at?: string | null;
  pickup_location?: string | null;
  public_booking_reference?: string | null;
  route_summary?: string | null;
  service_type?: string | null;
  traveler_id?: number | null;
  vehicle_type_or_category?: string | null;
};

type CustomerFolderBillingReview = {
  amountCents: number | null;
  breakdown: string;
  message: string;
  status: "calculating" | "proposed" | "required" | "reviewed";
};

type CustomerFolderBillingReviews = Record<string, CustomerFolderBillingReview>;

type CustomerFolderDspActualTimeSummary = {
  actual_time_status?: "complete" | "not_started" | "started" | string | null;
  dsp_total_minutes?: number | null;
};

type CustomerFolderExactRoutePoint = {
  location?: string | null;
  location_text?: string | null;
  notes?: string | null;
  point_type?: string | null;
  sequence?: number | null;
  sequence_number?: number | null;
  timing_note?: string | null;
};

type CustomerFolderExactServiceItem = {
  blocks_count?: number | null;
  item_type?: string | null;
  notes?: string | null;
  quantity?: number | null;
  service_item_type?: string | null;
};

type CustomerFolderExactBooking = {
  admin_internal_status?: string | null;
  booker_id?: number | null;
  booking_reference?: string | null;
  cancellation_review_status?: string | null;
  change_review_status?: string | null;
  company_id?: number | null;
  contact_display_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  customer_display_name?: string | null;
  customer_facing_status?: string | null;
  customer_id?: number | string | null;
  driver_contact?: string | null;
  driver_name?: string | null;
  driver_plate_number?: string | null;
  dropoff_datetime?: string | null;
  dropoff_location?: string | null;
  flight_no?: string | null;
  luggage_count?: number | null;
  parser_source_reference?: string | null;
  passenger_name?: string | null;
  passenger_phone?: string | null;
  pax_count?: number | null;
  pickup_at?: string | null;
  pickup_datetime?: string | null;
  pickup_location?: string | null;
  public_booking_reference?: string | null;
  request_review_status?: string | null;
  route_points?: CustomerFolderExactRoutePoint[] | null;
  route_summary?: string | null;
  route_type?: string | null;
  service_items?: CustomerFolderExactServiceItem[] | null;
  service_type?: string | null;
  short_notice_review_status?: string | null;
  source_channel?: string | null;
  source_surface?: string | null;
  traveler_id?: number | null;
  vehicle_type_or_category?: string | null;
};

type CustomerFolderInlineEditForm = {
  customerName: string;
  dropoffLocation: string;
  passengerName: string;
  pickupDateTime: string;
  pickupLocation: string;
  routeSummary: string;
  serviceType: string;
};

type CustomerFolderInlineEditState = {
  booking: CustomerFolderExactBooking | null;
  form: CustomerFolderInlineEditForm;
  message: string;
  status: "idle" | "loading" | "loaded" | "saving" | "error";
};

type CustomerFolderSavedBookingsState = {
  message: string;
  savedBookings: CustomerFolderSavedBookingRecord[];
  status: "idle" | "loading" | "loaded" | "error";
  summary: {
    matched_count?: number | null;
    recent_read_count?: number | null;
    returned_count?: number | null;
  } | null;
  tone: "error" | "info" | "success";
};

type CustomerFolderSavedBookingsPanelProps = {
  customerId: string;
  customerName: string;
};

function feedbackClass(tone: CustomerFolderSavedBookingsState["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }

  return "border-sky-200 bg-sky-50 text-sky-950";
}

function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function displayText(value: string | null | undefined, fallback = "Not available") {
  const cleaned = String(value ?? "").trim();

  return cleaned || fallback;
}

function savedBookingDescriptionItems(booking: CustomerFolderSavedBookingRecord) {
  return [
    ["Reference", safePublicBookingReference(booking.public_booking_reference)],
    ["Passenger", booking.passenger_name],
    ["Customer", booking.customer_account],
    ["Pickup time", formatSingaporePickupDisplay(booking.pickup_at)],
    ["Pickup", booking.pickup_location],
    ["Drop-off", booking.dropoff_location],
    ["Route", booking.route_summary],
    ["Service", booking.service_type],
    ["Price", booking.customer_price_label],
  ].filter((item): item is [string, string] => Boolean(displayText(item[1], "")));
}

function safeDispatchReference(booking: CustomerFolderSavedBookingRecord) {
  const reference = String(booking.booking_reference ?? "").trim();

  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(reference) ? reference : "";
}

function safeBookingReferenceValue(value: string | null | undefined) {
  const reference = String(value ?? "").trim();

  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(reference) ? reference : "";
}

function safePublicBookingReference(value: string | null | undefined) {
  const reference = String(value ?? "").trim().toUpperCase();

  return /^(?:[A-Z][A-Z0-9]{0,19}-)?\d{5}$/.test(reference) ? reference : "";
}

function publicBookingReferenceDisplay(booking: CustomerFolderSavedBookingRecord) {
  return safePublicBookingReference(booking.public_booking_reference) || "Reference unavailable";
}

const emptyInlineEditForm: CustomerFolderInlineEditForm = {
  customerName: "",
  dropoffLocation: "",
  passengerName: "",
  pickupDateTime: "",
  pickupLocation: "",
  routeSummary: "",
  serviceType: "",
};

const initialInlineEditState: CustomerFolderInlineEditState = {
  booking: null,
  form: emptyInlineEditForm,
  message: "",
  status: "idle",
};

function inlineEditText(value: unknown, maxLength = 300) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function inlineEditDateTimeInput(value: unknown) {
  const cleaned = inlineEditText(value, 120);
  const parsed = new Date(cleaned);

  if (!cleaned || Number.isNaN(parsed.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(parsed);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  const hour = part("hour") === "24" ? "00" : part("hour");

  return `${part("year")}-${part("month")}-${part("day")}T${hour}:${part("minute")}`;
}

function inlineEditApiDateTime(value: string) {
  const cleaned = inlineEditText(value, 120);
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  return match
    ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+08:00`
    : cleaned;
}

function inlineEditFormFromBooking(booking: CustomerFolderExactBooking) {
  return {
    customerName: inlineEditText(booking.customer_display_name, 160),
    dropoffLocation: inlineEditText(booking.dropoff_location),
    passengerName: inlineEditText(booking.passenger_name, 160),
    pickupDateTime: inlineEditDateTimeInput(booking.pickup_at || booking.pickup_datetime),
    pickupLocation: inlineEditText(booking.pickup_location),
    routeSummary: inlineEditText(booking.route_summary, 500),
    serviceType: inlineEditText(booking.service_type || booking.route_type, 80),
  } satisfies CustomerFolderInlineEditForm;
}

function inlineEditRoutePoints(
  booking: CustomerFolderExactBooking,
  form: CustomerFolderInlineEditForm,
) {
  const existing = Array.isArray(booking.route_points) ? booking.route_points : [];
  const middle = existing.filter(
    (point) => !["pickup", "dropoff"].includes(inlineEditText(point.point_type, 30).toLowerCase()),
  );

  return [
    {
      location: form.pickupLocation,
      location_text: form.pickupLocation,
      notes: null,
      point_type: "pickup",
      sequence: 1,
      sequence_number: 1,
      timing_note: null,
    },
    ...middle.map((point, index) => ({
      location: inlineEditText(point.location_text || point.location),
      location_text: inlineEditText(point.location_text || point.location),
      notes: inlineEditText(point.notes || point.timing_note) || null,
      point_type: inlineEditText(point.point_type, 30) || "stop",
      sequence: index + 2,
      sequence_number: index + 2,
      timing_note: inlineEditText(point.timing_note || point.notes) || null,
    })),
    {
      location: form.dropoffLocation,
      location_text: form.dropoffLocation,
      notes: null,
      point_type: "dropoff",
      sequence: middle.length + 2,
      sequence_number: middle.length + 2,
      timing_note: null,
    },
  ];
}

function inlineEditServiceItems(booking: CustomerFolderExactBooking) {
  return (Array.isArray(booking.service_items) ? booking.service_items : []).map((item) => ({
    blocks_count: item.blocks_count ?? null,
    item_type: item.item_type ?? null,
    notes: inlineEditText(item.notes) || null,
    quantity: item.quantity ?? null,
    service_item_type: item.service_item_type ?? null,
  }));
}

function customerFolderBillingReviewForBooking(
  booking: CustomerFolderSavedBookingRecord,
): CustomerFolderBillingReview {
  const savedAmountCents = parseInvoiceAmountToCents(String(booking.customer_price_label ?? ""));

  if (savedAmountCents) {
    return {
      amountCents: savedAmountCents,
      breakdown: "Saved customer amount loaded for admin review.",
      message: "Click to review",
      status: "proposed",
    };
  }

  const bookingType = customerInvoiceBookingType(booking.service_type);

  if (!bookingType) {
    return {
      amountCents: null,
      breakdown: "Confirm a supported saved service (MNG, DEP, TRF, or DSP) before price review.",
      message: "Review required",
      status: "required",
    };
  }

  return {
    amountCents: null,
    breakdown:
      bookingType === "DSP"
        ? "Checking Driver OTS→JC actual time and the verified Prestige customer rate."
        : "Calculating a temporary proposal from the existing Prestige customer rate setup.",
    message: "Calculating",
    status: "calculating",
  };
}

function customerFolderRateSourceLabel(source: string) {
  if (source === "company") {
    return "verified company rate";
  }

  if (source === "boss") {
    return "verified traveler rate";
  }

  return "Prestige default rate";
}

function customerFolderInitialBillingReviews(bookings: CustomerFolderSavedBookingRecord[]) {
  return bookings.reduce<CustomerFolderBillingReviews>((reviews, booking) => {
    const reference = safeDispatchReference(booking);

    if (reference) {
      reviews[reference] = customerFolderBillingReviewForBooking(booking);
    }

    return reviews;
  }, {});
}

function customerFolderReviewedPricePayload(
  bookings: CustomerFolderSavedBookingRecord[],
  reviews: CustomerFolderBillingReviews,
) {
  return JSON.stringify(
    bookings
      .map((booking) => {
        const reference = safeDispatchReference(booking);
        const review = reference ? reviews[reference] : null;

        return reference && review?.status === "reviewed" && review.amountCents
          ? { amount_cents: review.amountCents, booking_reference: reference }
          : null;
      })
      .filter(Boolean),
  );
}

function customerFolderInvoiceHref(
  booking: CustomerFolderSavedBookingRecord,
  customerId: string,
  customerName: string,
  selectedBookings: CustomerFolderSavedBookingRecord[],
  reviews: CustomerFolderBillingReviews,
) {
  const baseHref = customerWorkspaceHref(booking, customerId, customerName, "open");
  const references = selectedBookings
    .map((selectedBooking) => safeDispatchReference(selectedBooking))
    .filter(Boolean);

  if (!baseHref || references.length === 0) {
    return "";
  }

  if (selectedBookings.some((selectedBooking) => !safePublicBookingReference(selectedBooking.public_booking_reference))) {
    return "";
  }

  const params = new URLSearchParams(baseHref.split("?")[1] || "");

  params.set("customer_invoice_action", "create");
  params.set("selected_booking_references", references.join(","));
  params.set(
    customerFolderSelectedPriceReviewsParam,
    customerFolderReviewedPricePayload(selectedBookings, reviews),
  );

  return `/customers?${params.toString()}`;
}

function customerWorkspaceHref(
  booking: CustomerFolderSavedBookingRecord,
  customerId: string,
  customerName: string,
  action: "edit" | "delete" | "open",
) {
  const reference = safeDispatchReference(booking);

  if (!reference) {
    return "";
  }

  const params = new URLSearchParams({
    booking_reference: reference,
    customer_id: customerId,
    customer_job_action: action,
    customer_name: customerName,
  });

  return `/customers?${params.toString()}`;
}

function customerCompletedCancelHref(
  booking: CustomerFolderSavedBookingRecord,
  customerId: string,
  customerName: string,
) {
  const reference = safeDispatchReference(booking);

  if (!reference) {
    return "";
  }

  const returnParams = new URLSearchParams({
    [customerFolderFocusBookingReferenceParam]: reference,
    [customerFolderLoadSavedJobsParam]: "1",
    name: customerName,
  });
  const params = new URLSearchParams({
    completed_action: "cancel",
    completed_booking_reference: reference,
    customer_return_url: `/customers/${encodeURIComponent(customerId)}?${returnParams.toString()}`,
    tab: "completed",
  });

  return `/?${params.toString()}`;
}

function isClearlyBilledOrClosedJob(booking: CustomerFolderSavedBookingRecord) {
  const statusText = [booking.admin_status, booking.customer_status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(invoice|invoiced|billed|paid|cancelled|canceled|declined|rejected|void|deleted)\b/.test(
    statusText,
  );
}

function initialMessage(customerName: string) {
  return `Load saved jobs not clearly billed or closed for ${customerName}.`;
}

function customerFolderReturnContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);

  if (params.get(customerFolderLoadSavedJobsParam) !== "1") {
    return null;
  }

  return {
    focusBookingReference: safeBookingReferenceValue(params.get(customerFolderFocusBookingReferenceParam)),
  };
}

function savedBookingReadFailureMessage(rawError: unknown) {
  const message = rawError instanceof Error ? rawError.message.toLowerCase() : String(rawError ?? "").toLowerCase();

  if (/not enabled|configuration|config|client_init/.test(message)) {
    return "Saved booking references are not enabled or configured on this server.";
  }

  if (/failed safely|request failed|could not be completed/.test(message)) {
    return "Saved booking references could not be loaded right now. Reload this customer folder and try again.";
  }

  if (/forbidden|internal|admin|dispatcher|referer|origin|purpose|boundary|blocked/.test(message)) {
    return "Saved booking references require the internal customer folder admin surface. Reload this customer folder and try again.";
  }

  if (/permission|rls|denied/.test(message)) {
    return "Saved booking references were blocked by database permissions. No booking, invoice, payment, or provider action ran.";
  }

  if (/missing|required|malformed|invalid|unknown/.test(message)) {
    return "Saved booking reference details need review before this customer folder can load them.";
  }

  return "Saved booking references could not be loaded right now. Reload this customer folder and try again.";
}

export function CustomerFolderSavedBookingsPanel({
  customerId,
  customerName,
}: CustomerFolderSavedBookingsPanelProps) {
  const autoLoadAttemptedRef = useRef(false);
  const [billingReviews, setBillingReviews] = useState<CustomerFolderBillingReviews>({});
  const [editingPriceReference, setEditingPriceReference] = useState("");
  const [inlineEditState, setInlineEditState] =
    useState<CustomerFolderInlineEditState>(initialInlineEditState);
  const [priceDraft, setPriceDraft] = useState("");
  const [expandedSavedBookingReference, setExpandedSavedBookingReference] = useState("");
  const [selectedReferences, setSelectedReferences] = useState<Record<string, boolean>>({});
  const [readState, setReadState] = useState<CustomerFolderSavedBookingsState>({
    message: initialMessage(customerName),
    savedBookings: [],
    status: "idle",
    summary: null,
    tone: "info",
  });

  async function loadAutomatedBillingReviews(bookings: CustomerFolderSavedBookingRecord[]) {
    const proposalBookings = bookings.filter(
      (booking) =>
        safeDispatchReference(booking) &&
        customerInvoiceBookingType(booking.service_type) !== null &&
        !parseInvoiceAmountToCents(String(booking.customer_price_label ?? "")),
    );

    if (proposalBookings.length === 0) {
      return;
    }

    try {
      const rateResponse = await fetch(adminRateSetupApiPath, {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const rateSetup = (await rateResponse.json().catch(() => null)) as
        | (CustomerInvoiceRateSetupRecord & { error?: string; ok?: boolean })
        | null;

      if (!rateResponse.ok || rateSetup?.ok !== true) {
        throw new Error("CRM rate setup unavailable");
      }

      const calculatedReviews = await Promise.all(
        proposalBookings.map(async (booking) => {
          const reference = safeDispatchReference(booking);
          const bookingType = customerInvoiceBookingType(booking.service_type);
          let actualMinutes: number | null = null;

          if (!bookingType) {
            return {
              reference,
              review: {
                amountCents: null,
                breakdown: "Confirm a supported saved service (MNG, DEP, TRF, or DSP) before price review.",
                message: "Review required",
                status: "required",
              } satisfies CustomerFolderBillingReview,
            };
          }

          if (bookingType === "DSP") {
            const params = new URLSearchParams({ booking_reference: reference, limit: "1" });
            const timingResponse = await fetch(
              `${adminDriverJobDspActualTimeSummariesApiPath}?${params.toString()}`,
              {
                headers: {
                  "x-prestige-admin-purpose": "admin-booking-persistence",
                },
                method: "GET",
              },
            );
            const timingResult = (await timingResponse.json().catch(() => null)) as
              | {
                  latest_summary?: CustomerFolderDspActualTimeSummary | null;
                  ok?: boolean;
                }
              | null;
            const summary = timingResult?.latest_summary;

            if (
              !timingResponse.ok ||
              timingResult?.ok !== true ||
              summary?.actual_time_status !== "complete" ||
              !Number.isFinite(Number(summary.dsp_total_minutes)) ||
              Number(summary.dsp_total_minutes) <= 0
            ) {
              return {
                reference,
                review: {
                  amountCents: null,
                  breakdown: "Complete Driver OTS→JC actual time, then reload this customer folder.",
                  message: "Review required",
                  status: "required",
                } satisfies CustomerFolderBillingReview,
              };
            }

            actualMinutes = Number(summary.dsp_total_minutes);
          }

          const calculation = calculateCustomerInvoiceRateReview(
            {
              actualMinutes,
              bookingType,
              childSeatCount: booking.child_seat_count,
              companyId: booking.company_id,
              extraStopCount: booking.extra_stop_count,
              pickupAt: booking.pickup_at,
              travelerId: booking.traveler_id,
              vehicleType: booking.vehicle_type_or_category,
            },
            rateSetup,
          );

          if (!calculation) {
            return {
              reference,
              review: {
                amountCents: null,
                breakdown: "Review the saved Prestige customer rate setup, then reload.",
                message: "Review required",
                status: "required",
              } satisfies CustomerFolderBillingReview,
            };
          }

          const surchargeLabel = calculation.surchargeAmountCents
            ? ` + ${formatInvoiceAmount(calculation.surchargeAmountCents)} surcharges`
            : "";
          const sourceLabel = customerFolderRateSourceLabel(calculation.customerRateSource);
          const breakdown =
            bookingType === "DSP" && calculation.actualMinutes !== null && calculation.billableHours !== null
              ? `${calculation.actualMinutes} actual min → ${calculation.billableHours} billable hr × ` +
                `${formatInvoiceAmount(calculation.rateCents)}/hr${surchargeLabel}. Source: ${sourceLabel}.`
              : `${formatInvoiceAmount(calculation.baseAmountCents)} fixed trip${surchargeLabel}. ` +
                `Source: ${sourceLabel}.`;

          return {
            reference,
            review: {
              amountCents: calculation.amountCents,
              breakdown: `${breakdown} Temporary Codex proposal; edit or approve before invoice handoff.`,
              message: "Codex price · review",
              status: "proposed",
            } satisfies CustomerFolderBillingReview,
          };
        }),
      );

      setBillingReviews((current) => {
        const next = { ...current };

        calculatedReviews.forEach(({ reference, review }) => {
          if (next[reference]?.status !== "reviewed") {
            next[reference] = review;
          }
        });

        return next;
      });
    } catch {
      setBillingReviews((current) => {
        const next = { ...current };

        proposalBookings.forEach((booking) => {
          const reference = safeDispatchReference(booking);

          if (next[reference]?.status !== "reviewed") {
            next[reference] = {
              amountCents: null,
              breakdown: "Prestige rate calculation is unavailable. Enter an approved price manually.",
              message: "Review required",
              status: "required",
            };
          }
        });

        return next;
      });
    }
  }

  async function loadSavedBookings(options?: {
    focusBookingReference?: string;
    source?: "manual" | "return";
  }) {
    const focusBookingReference = safeBookingReferenceValue(options?.focusBookingReference);
    setReadState({
      message: `Loading saved jobs for ${customerName}...`,
      savedBookings: [],
      status: "loading",
      summary: null,
      tone: "info",
    });

    try {
      const params = new URLSearchParams({
        customer_account: customerName,
        customer_id: customerId,
        limit: "200",
      });
      if (focusBookingReference) {
        params.set("booking_reference", focusBookingReference);
      }
      const response = await fetch(`${adminCustomerSavedBookingsApiPath}?${params.toString()}`, {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Saved booking read could not be completed.");
      }

      const savedBookings = Array.isArray(result.saved_bookings)
        ? (result.saved_bookings as CustomerFolderSavedBookingRecord[])
        : [];
      const returnedCount = Number(result.summary?.returned_count ?? savedBookings.length);
      const visibleSavedBookings = savedBookings.filter(
        (booking) => !isClearlyBilledOrClosedJob(booking),
      );
      setBillingReviews(customerFolderInitialBillingReviews(visibleSavedBookings));
      void loadAutomatedBillingReviews(visibleSavedBookings);
      const focusReturned = focusBookingReference
        ? savedBookings.some((booking) => safeDispatchReference(booking) === focusBookingReference)
        : false;
      const focusBooking = focusBookingReference
        ? savedBookings.find((booking) => safeDispatchReference(booking) === focusBookingReference)
        : null;
      const focusDisplayReference = focusBooking
        ? publicBookingReferenceDisplay(focusBooking)
        : "selected job";
      const focusVisible = focusBookingReference
        ? visibleSavedBookings.some((booking) => safeDispatchReference(booking) === focusBookingReference)
        : false;
      const returnMessage = focusBookingReference
        ? focusVisible
          ? `Returned from Dispatch after Update + Calendar. Loaded ${countLabel(
              visibleSavedBookings.length,
              "unbilled saved job",
            )} for ${customerName}; job ${focusDisplayReference} is visible below.`
          : focusReturned
          ? `Returned from Dispatch after Update + Calendar. Job ${focusDisplayReference} was returned but is now billed, paid, cancelled, or closed, so it is hidden from Jobs not billed yet.`
          : `Returned from Dispatch after Update + Calendar. Loaded ${countLabel(
              returnedCount,
              "saved job",
            )}, but the selected job was not returned for ${customerName}.`
        : "";

      setReadState({
        message:
          returnMessage ||
          (returnedCount > 0
            ? `Loaded ${countLabel(returnedCount, "saved job")} for ${customerName}.`
            : `No saved jobs returned for ${customerName}.`),
        savedBookings,
        status: "loaded",
        summary: result.summary || null,
        tone: "success",
      });
    } catch (error) {
      setReadState({
        message: savedBookingReadFailureMessage(error),
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
    }
  }

  useEffect(() => {
    if (autoLoadAttemptedRef.current) {
      return;
    }

    const returnContext = customerFolderReturnContext();

    autoLoadAttemptedRef.current = true;
    window.setTimeout(() => {
      void loadSavedBookings({
        focusBookingReference: returnContext?.focusBookingReference,
        source: returnContext ? "return" : "manual",
      });
    }, 0);
    // The customer folder performs exactly one guarded read on mount or return from Dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unbilledSavedBookings = readState.savedBookings.filter(
    (booking) => !isClearlyBilledOrClosedJob(booking),
  );
  const selectedUnbilledBookings = unbilledSavedBookings.filter((booking) => {
    const reference = safeDispatchReference(booking);

    return reference && selectedReferences[reference];
  });
  const firstSelectedBooking = selectedUnbilledBookings[0] ?? null;
  const createInvoiceHref = firstSelectedBooking
    ? customerFolderInvoiceHref(
        firstSelectedBooking,
        customerId,
        customerName,
        selectedUnbilledBookings,
        billingReviews,
      )
    : "";
  const selectedPricesReviewed =
    selectedUnbilledBookings.length > 0 &&
    selectedUnbilledBookings.every((booking) => {
      const reference = safeDispatchReference(booking);
      const review = reference ? billingReviews[reference] : null;

      return review?.status === "reviewed" && Boolean(review.amountCents);
    });
  const selectedPublicReferencesReady = selectedUnbilledBookings.every((booking) =>
    Boolean(safePublicBookingReference(booking.public_booking_reference)),
  );

  function toggleSelectedBooking(booking: CustomerFolderSavedBookingRecord, selected: boolean) {
    const reference = safeDispatchReference(booking);

    if (!reference) {
      return;
    }

    setSelectedReferences((current) => ({
      ...(selected && Object.values(current).filter(Boolean).length >= customerFolderInvoiceSelectionLimit
        ? current
        : {
            ...current,
            [reference]: selected,
          }),
    }));
  }

  function toggleSavedBookingDescription(booking: CustomerFolderSavedBookingRecord) {
    const reference = safeDispatchReference(booking);

    if (!reference) {
      return;
    }

    setExpandedSavedBookingReference((currentReference) =>
      currentReference === reference ? "" : reference,
    );
  }

  async function openInlineBookingEditor(booking: CustomerFolderSavedBookingRecord) {
    const reference = safeDispatchReference(booking);

    if (!reference) {
      return;
    }

    setExpandedSavedBookingReference(reference);
    setEditingPriceReference(reference);
    setPriceDraft(
      billingReviews[reference]?.amountCents
        ? (Number(billingReviews[reference].amountCents) / 100).toFixed(2)
        : "",
    );

    if (
      inlineEditState.booking?.booking_reference === reference &&
      inlineEditState.status !== "error"
    ) {
      return;
    }

    setInlineEditState({
      ...initialInlineEditState,
      message: `Loading job ${publicBookingReferenceDisplay(booking)}...`,
      status: "loading",
    });

    try {
      const params = new URLSearchParams({ booking_reference: reference });
      const response = await fetch(`${adminBookingsApiPath}?${params.toString()}`, {
        headers: { "x-prestige-admin-purpose": "admin-booking-persistence" },
        method: "GET",
      });
      const result = (await response.json().catch(() => null)) as
        | { booking?: CustomerFolderExactBooking | null; error?: string; ok?: boolean }
        | null;
      const exactBooking = result?.booking ?? null;

      if (
        !response.ok ||
        result?.ok !== true ||
        !exactBooking ||
        inlineEditText(exactBooking.booking_reference, 120) !== reference
      ) {
        throw new Error(result?.error || "Exact job read failed safely.");
      }

      setInlineEditState({
        booking: exactBooking,
        form: inlineEditFormFromBooking(exactBooking),
        message: "Edit the job details and customer price inside this box.",
        status: "loaded",
      });
    } catch {
      setInlineEditState({
        ...initialInlineEditState,
        message: "This exact job could not be loaded. Reload the customer folder and try again.",
        status: "error",
      });
    }
  }

  function updateInlineEditField(field: keyof CustomerFolderInlineEditForm, value: string) {
    setInlineEditState((current) => ({
      ...current,
      form: { ...current.form, [field]: value },
      message: "Unsaved job-detail changes.",
    }));
  }

  async function saveInlineBookingDetails(booking: CustomerFolderSavedBookingRecord) {
    const exactBooking = inlineEditState.booking;
    const reference = safeDispatchReference(booking);
    const form = inlineEditState.form;
    const pickupDateTime = inlineEditApiDateTime(form.pickupDateTime);
    const requiredValues = [
      form.customerName,
      form.passengerName,
      pickupDateTime,
      form.pickupLocation,
      form.dropoffLocation,
      form.routeSummary,
      form.serviceType,
    ];

    if (!exactBooking || !reference || requiredValues.some((value) => !inlineEditText(value))) {
      setInlineEditState((current) => ({
        ...current,
        message: "Complete every editable job field before saving.",
        status: "error",
      }));
      return;
    }

    setInlineEditState((current) => ({
      ...current,
      message: `Saving job ${publicBookingReferenceDisplay(booking)}...`,
      status: "saving",
    }));

    const payload = {
      booking: {
        admin_internal_status: exactBooking.admin_internal_status ?? "Draft",
        booker_id: exactBooking.booker_id ?? null,
        booking_reference: reference,
        cancellation_review_status: exactBooking.cancellation_review_status ?? null,
        change_review_status: exactBooking.change_review_status ?? null,
        company_id: exactBooking.company_id ?? null,
        contact_display_name: exactBooking.contact_display_name ?? null,
        contact_email: exactBooking.contact_email ?? null,
        contact_phone: exactBooking.contact_phone ?? null,
        customer_display_name: inlineEditText(form.customerName, 160),
        customer_facing_status: exactBooking.customer_facing_status ?? "Received",
        customer_id: exactBooking.customer_id ?? null,
        driver_contact: exactBooking.driver_contact ?? null,
        driver_name: exactBooking.driver_name ?? null,
        driver_plate_number: exactBooking.driver_plate_number ?? null,
        dropoff_datetime: exactBooking.dropoff_datetime ?? null,
        dropoff_location: inlineEditText(form.dropoffLocation),
        flight_no: exactBooking.flight_no ?? null,
        luggage_count: exactBooking.luggage_count ?? null,
        parser_source_reference: exactBooking.parser_source_reference ?? null,
        passenger_name: inlineEditText(form.passengerName, 160),
        passenger_phone: exactBooking.passenger_phone ?? null,
        pax_count: exactBooking.pax_count ?? null,
        pickup_datetime: pickupDateTime,
        pickup_location: inlineEditText(form.pickupLocation),
        request_review_status: exactBooking.request_review_status ?? null,
        route_summary: inlineEditText(form.routeSummary, 500),
        route_type: inlineEditText(form.serviceType, 80),
        service_type: inlineEditText(form.serviceType, 80),
        short_notice_review_status: exactBooking.short_notice_review_status ?? null,
        source_channel: exactBooking.source_channel || exactBooking.source_surface || "admin-dashboard",
        source_surface: exactBooking.source_surface || exactBooking.source_channel || "admin-dashboard",
        traveler_id: exactBooking.traveler_id ?? null,
        vehicle_type_or_category: exactBooking.vehicle_type_or_category ?? null,
      },
      route_points: inlineEditRoutePoints(exactBooking, form),
      service_items: inlineEditServiceItems(exactBooking),
      target_booking_reference: reference,
    };

    try {
      const response = await fetch(adminBookingsApiPath, {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const result = (await response.json().catch(() => null)) as
        | { booking?: CustomerFolderExactBooking | null; error?: string; ok?: boolean }
        | null;
      const updatedBooking = result?.booking ?? null;

      if (
        !response.ok ||
        result?.ok !== true ||
        !updatedBooking ||
        inlineEditText(updatedBooking.booking_reference, 120) !== reference
      ) {
        throw new Error(result?.error || "Exact job update failed safely.");
      }

      setInlineEditState({
        booking: updatedBooking,
        form: inlineEditFormFromBooking(updatedBooking),
        message: `Saved job ${safePublicBookingReference(updatedBooking.public_booking_reference) || publicBookingReferenceDisplay(booking)}.`,
        status: "loaded",
      });
      setReadState((current) => ({
        ...current,
        message: `Saved job ${safePublicBookingReference(updatedBooking.public_booking_reference) || publicBookingReferenceDisplay(booking)}.`,
        savedBookings: current.savedBookings.map((savedBooking) =>
          safeDispatchReference(savedBooking) === reference
            ? {
                ...savedBooking,
                customer_account: updatedBooking.customer_display_name,
                dropoff_location: updatedBooking.dropoff_location,
                passenger_name: updatedBooking.passenger_name,
                pickup_at: updatedBooking.pickup_at || updatedBooking.pickup_datetime,
                pickup_location: updatedBooking.pickup_location,
                public_booking_reference:
                  updatedBooking.public_booking_reference || savedBooking.public_booking_reference,
                route_summary: updatedBooking.route_summary,
                service_type: updatedBooking.service_type || updatedBooking.route_type,
              }
            : savedBooking,
        ),
        tone: "success",
      }));
    } catch {
      setInlineEditState((current) => ({
        ...current,
        message: "Job details were not saved. Review the required fields and try again.",
        status: "error",
      }));
    }
  }

  function openPriceReview(booking: CustomerFolderSavedBookingRecord) {
    void openInlineBookingEditor(booking);
  }

  function savePriceReview(booking: CustomerFolderSavedBookingRecord) {
    const reference = safeDispatchReference(booking);
    const amountCents = parseInvoiceAmountToCents(priceDraft);

    if (!reference || !amountCents) {
      return;
    }

    setBillingReviews((current) => ({
      ...current,
      [reference]: {
        amountCents,
        breakdown:
          current[reference]?.breakdown || "Approved customer price entered by admin for invoice review.",
        message: "Reviewed",
        status: "reviewed",
      },
    }));
    setInlineEditState((current) => ({ ...current, message: "Customer price review saved." }));
  }

  return (
    <>
    <section
      className="rounded-xl border border-amber-500 border-l-[12px] border-t-8 border-t-slate-950 bg-amber-50 p-4 shadow-md"
      data-customer-folder-saved-bookings={customerId}
      data-customer-folder-sector="unbilled-jobs"
    >
      <div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
            3 · Pending jobs for payment
          </p>
          <h2
            className="mt-1 text-lg font-bold text-slate-950"
            data-customer-folder-saved-bookings-heading="true"
          >
            Jobs not billed yet
          </h2>
          <p
            className="mt-0.5 max-w-4xl text-xs font-semibold leading-5 text-slate-600"
            data-customer-folder-saved-bookings-boundary="true"
          >
            Pending jobs load automatically. Select up to four jobs, or use Edit, Delete, and Invoice on one exact job.
          </p>
        </div>
      </div>

      <p
        className={`mt-2 rounded-md border px-3 py-2 text-xs font-semibold leading-5 ${feedbackClass(
          readState.tone,
        )}`}
        data-customer-folder-saved-bookings-note="true"
      >
        {readState.message}
      </p>

      {readState.status === "loaded" && unbilledSavedBookings.length === 0 ? (
        <p
          className="mt-3 rounded-md border border-sky-100 bg-white px-3 py-2 text-sm font-semibold leading-6 text-slate-700"
          data-customer-folder-saved-bookings-empty="true"
        >
          No unbilled saved jobs returned for this customer.
        </p>
      ) : null}

      {readState.status === "loaded" && unbilledSavedBookings.length > 0 ? (
        <div className="mt-3" data-customer-folder-saved-bookings-list="true">
          <div className="mb-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold text-slate-700">
              {selectedUnbilledBookings.length} of {customerFolderInvoiceSelectionLimit} selected for new invoice
            </p>
            <span className="text-xs font-semibold text-slate-500">Review every price tag before Invoice.</span>
          </div>
          <div
            className="max-h-[32rem] overflow-x-auto overflow-y-auto rounded-lg border border-amber-300 bg-white shadow-inner"
            data-customer-folder-unbilled-scroll="true"
          >
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-amber-100 text-[11px] uppercase tracking-[0.12em] text-amber-950 shadow-sm">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Select</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Booking</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Pickup</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Service</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Customer price</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {unbilledSavedBookings.map((booking) => {
                const deleteHref = customerCompletedCancelHref(booking, customerId, customerName);
                const bookingReference = safeDispatchReference(booking);
                const billingReview = bookingReference ? billingReviews[bookingReference] : null;
                const priceReviewed =
                  billingReview?.status === "reviewed" && Boolean(billingReview.amountCents);
                const createSingleInvoiceHref = customerFolderInvoiceHref(
                  booking,
                  customerId,
                  customerName,
                  [booking],
                  billingReviews,
                );
                const rowKey = booking.booking_reference || `${booking.customer_account}-${booking.pickup_at}`;
                const isExpanded = Boolean(
                  bookingReference && expandedSavedBookingReference === bookingReference,
                );
                const descriptionItems = savedBookingDescriptionItems(booking);

                return (
                  <Fragment key={rowKey}>
                  <tr
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    data-customer-folder-saved-bookings-row={booking.booking_reference || ""}
                  >
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Select ${publicBookingReferenceDisplay(booking)}`}
                        checked={Boolean(bookingReference && selectedReferences[bookingReference])}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900"
                        data-customer-folder-saved-bookings-select={booking.booking_reference || ""}
                        disabled={
                          !bookingReference ||
                          (selectedUnbilledBookings.length >= customerFolderInvoiceSelectionLimit &&
                            !selectedReferences[bookingReference])
                        }
                        onChange={(event) => toggleSelectedBooking(booking, event.target.checked)}
                        type="checkbox"
                      />
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-950" title={publicBookingReferenceDisplay(booking)}>
                      <button
                        aria-expanded={isExpanded}
                        className="rounded px-1 py-0.5 text-left font-bold text-slate-950 underline-offset-4 transition hover:bg-slate-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        data-customer-folder-saved-bookings-description-toggle={booking.booking_reference || ""}
                        onClick={() => toggleSavedBookingDescription(booking)}
                        type="button"
                      >
                        {publicBookingReferenceDisplay(booking)}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {formatSingaporePickupDisplay(booking.pickup_at, "Pickup not available")}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <span>{displayText(booking.service_type, "Service not available")}</span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        className={`inline-flex min-h-8 items-center rounded-md border px-2 text-left text-xs font-bold transition ${
                          priceReviewed
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                            : billingReview?.status === "calculating"
                              ? "cursor-wait border-sky-200 bg-sky-50 text-sky-800"
                              : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                        }`}
                        data-customer-folder-saved-bookings-price={booking.booking_reference || ""}
                        disabled={billingReview?.status === "calculating"}
                        onClick={() => openPriceReview(booking)}
                        type="button"
                      >
                        {billingReview?.amountCents
                          ? `${formatInvoiceAmount(billingReview.amountCents)} · ${billingReview.message}`
                          : billingReview?.message || "Review required"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {deleteHref ? (
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <button
                            className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100"
                            data-customer-folder-saved-bookings-edit={booking.booking_reference || ""}
                            onClick={() => void openInlineBookingEditor(booking)}
                            type="button"
                          >
                            Edit
                          </button>
                          <Link
                            className="inline-flex min-h-8 items-center rounded-md border border-rose-200 bg-white px-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                            data-customer-folder-saved-bookings-delete={booking.booking_reference || ""}
                            href={deleteHref}
                          >
                            Delete
                          </Link>
                          {priceReviewed && createSingleInvoiceHref ? (
                            <Link
                              className="inline-flex min-h-8 items-center rounded-md border border-slate-900 bg-slate-900 px-2 text-xs font-bold text-white transition hover:bg-slate-700"
                              data-customer-folder-saved-bookings-create-invoice={booking.booking_reference || ""}
                              href={createSingleInvoiceHref}
                            >
                              Invoice
                            </Link>
                          ) : (
                            <button
                              className="inline-flex min-h-8 cursor-not-allowed items-center rounded-md border border-slate-200 bg-slate-100 px-2 text-xs font-bold text-slate-400"
                              data-customer-folder-saved-bookings-create-invoice-disabled={booking.booking_reference || ""}
                              disabled
                              title="Review the customer price first"
                              type="button"
                            >
                              Invoice
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">No reference</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr
                      className="border-b border-slate-100 bg-slate-50"
                      data-customer-folder-saved-bookings-description={booking.booking_reference || ""}
                    >
                      <td className="px-3 py-2" colSpan={6}>
                        {editingPriceReference === bookingReference ? (
                          <div
                            className="rounded-md border border-amber-300 bg-white p-3"
                            data-customer-folder-inline-job-editor={booking.booking_reference || ""}
                            data-customer-folder-price-review-editor={booking.booking_reference || ""}
                          >
                            {inlineEditState.status === "loading" ? (
                              <p className="text-xs font-bold text-sky-800">{inlineEditState.message}</p>
                            ) : inlineEditState.booking ? (
                              <>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                  <label className="text-xs font-bold text-slate-700">
                                    Reference (read-only)
                                    <input
                                      className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-slate-100 px-2 font-bold text-slate-600"
                                      data-customer-folder-inline-public-reference="true"
                                      readOnly
                                      value={
                                        safePublicBookingReference(
                                          inlineEditState.booking.public_booking_reference,
                                        ) || publicBookingReferenceDisplay(booking)
                                      }
                                    />
                                  </label>
                                  <label className="text-xs font-bold text-slate-700">
                                    Customer / company
                                    <input
                                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                      data-customer-folder-inline-customer="true"
                                      onChange={(event) => updateInlineEditField("customerName", event.target.value)}
                                      value={inlineEditState.form.customerName}
                                    />
                                  </label>
                                  <label className="text-xs font-bold text-slate-700">
                                    Passenger
                                    <input
                                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                      data-customer-folder-inline-passenger="true"
                                      onChange={(event) => updateInlineEditField("passengerName", event.target.value)}
                                      value={inlineEditState.form.passengerName}
                                    />
                                  </label>
                                  <label className="text-xs font-bold text-slate-700">
                                    Pickup date &amp; time (SGT)
                                    <input
                                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                      data-customer-folder-inline-pickup-time="true"
                                      onChange={(event) => updateInlineEditField("pickupDateTime", event.target.value)}
                                      type="datetime-local"
                                      value={inlineEditState.form.pickupDateTime}
                                    />
                                  </label>
                                  <label className="text-xs font-bold text-slate-700 lg:col-span-2">
                                    Pickup
                                    <input
                                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                      data-customer-folder-inline-pickup="true"
                                      onChange={(event) => updateInlineEditField("pickupLocation", event.target.value)}
                                      value={inlineEditState.form.pickupLocation}
                                    />
                                  </label>
                                  <label className="text-xs font-bold text-slate-700 lg:col-span-2">
                                    Drop-off
                                    <input
                                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                      data-customer-folder-inline-dropoff="true"
                                      onChange={(event) => updateInlineEditField("dropoffLocation", event.target.value)}
                                      value={inlineEditState.form.dropoffLocation}
                                    />
                                  </label>
                                  <label className="text-xs font-bold text-slate-700 lg:col-span-2">
                                    Route
                                    <input
                                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                      data-customer-folder-inline-route="true"
                                      onChange={(event) => updateInlineEditField("routeSummary", event.target.value)}
                                      value={inlineEditState.form.routeSummary}
                                    />
                                  </label>
                                  <label className="text-xs font-bold text-slate-700">
                                    Service
                                    <input
                                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                      data-customer-folder-inline-service="true"
                                      onChange={(event) => updateInlineEditField("serviceType", event.target.value)}
                                      value={inlineEditState.form.serviceType}
                                    />
                                  </label>
                                  <label className="text-xs font-bold text-slate-700">
                                    Customer price (SGD)
                                    <input
                                      className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-bold text-slate-950"
                                      data-customer-folder-price-review-input={booking.booking_reference || ""}
                                      inputMode="decimal"
                                      onChange={(event) => setPriceDraft(event.target.value)}
                                      placeholder="0.00"
                                      value={priceDraft}
                                    />
                                  </label>
                                </div>
                                <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                                  {billingReview?.breakdown || "Enter the approved customer amount."}
                                </p>
                                <p className="mt-1 text-xs font-bold text-slate-700">{inlineEditState.message}</p>
                                <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                                  <button
                                    className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                    onClick={() => {
                                      setEditingPriceReference("");
                                      setInlineEditState(initialInlineEditState);
                                      setPriceDraft("");
                                    }}
                                    type="button"
                                  >
                                    Close edit
                                  </button>
                                  <button
                                    className="h-9 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                                    data-customer-folder-price-review-save={booking.booking_reference || ""}
                                    disabled={!parseInvoiceAmountToCents(priceDraft)}
                                    onClick={() => savePriceReview(booking)}
                                    type="button"
                                  >
                                    Save price review
                                  </button>
                                  <button
                                    className="h-9 rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                                    data-customer-folder-inline-save="true"
                                    disabled={inlineEditState.status === "saving"}
                                    onClick={() => void saveInlineBookingDetails(booking)}
                                    type="button"
                                  >
                                    {inlineEditState.status === "saving" ? "Saving..." : "Save job details"}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <p className="text-xs font-bold text-rose-800">{inlineEditState.message}</p>
                            )}
                          </div>
                        ) : (
                          <div className="grid gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                            {descriptionItems.map(([label, value]) => (
                              <p className="min-w-0" key={label}>
                                <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                  {label}
                                </span>
                                <span className="break-words text-slate-900">{displayText(value)}</span>
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}
    </section>
      <section
            className="rounded-xl border border-amber-500 border-l-[12px] border-t-8 border-t-slate-950 bg-amber-50 p-4 shadow-md"
            data-customer-folder-sector="invoice-review"
            data-customer-folder-selected-invoice-layout="true"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
                  4 · Selected jobs invoice review
                </p>
                <h3 className="mt-1 text-lg font-bold text-slate-950">Customer invoice layout</h3>
                <p className="mt-0.5 text-xs font-semibold text-slate-600">
                  Every selected job is carried into the established invoice preview and email lane.
                </p>
              </div>
              {createInvoiceHref && selectedPricesReviewed && selectedPublicReferencesReady ? (
                <Link
                  className="inline-flex h-8 items-center justify-center rounded-md border border-sky-800 bg-sky-800 px-2.5 text-[11px] font-bold text-white transition hover:bg-sky-700"
                  data-customer-folder-create-invoice-selected="true"
                  href={createInvoiceHref}
                >
                  Review invoice &amp; email
                </Link>
              ) : (
                <button
                  className="inline-flex h-8 cursor-not-allowed items-center justify-center rounded-md border border-slate-200 bg-slate-100 px-2.5 text-[11px] font-bold text-slate-400"
                  data-customer-folder-create-invoice-selected-disabled="true"
                  disabled
                  type="button"
                >
                  {selectedUnbilledBookings.length === 0
                    ? "Select jobs first"
                    : !selectedPublicReferencesReady
                      ? "Public reference required"
                      : "Review every price first"}
                </button>
              )}
            </div>
            {selectedUnbilledBookings.length > 0 ? (
              <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-2">Job</th>
                      <th className="border-b border-slate-200 px-3 py-2">Pickup</th>
                      <th className="border-b border-slate-200 px-3 py-2">Service</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right">Reviewed price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedUnbilledBookings.map((booking) => {
                      const reference = safeDispatchReference(booking);
                      const review = reference ? billingReviews[reference] : null;

                      return (
                      <tr
                        className="border-b border-slate-100 last:border-b-0"
                        data-customer-folder-selected-invoice-job={booking.booking_reference || ""}
                        key={`invoice-layout-${booking.booking_reference}`}
                      >
                        <td className="px-3 py-2 font-bold text-slate-950">
                          {publicBookingReferenceDisplay(booking)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatSingaporePickupDisplay(booking.pickup_at, "Pickup not available")}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{displayText(booking.service_type)}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-950">
                          {review?.status === "reviewed" && review.amountCents
                            ? formatInvoiceAmount(review.amountCents)
                            : "Review required"}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-3 text-xs font-semibold text-slate-500">Select jobs above to build this invoice.</p>
            )}
      </section>
    </>
  );
}
