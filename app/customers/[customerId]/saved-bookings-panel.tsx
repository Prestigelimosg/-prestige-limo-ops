"use client";

import Link from "next/link";
import { Fragment, type MouseEvent, useEffect, useRef, useState } from "react";

import {
  calculateCustomerDspBillingActualMinutes,
  calculateCustomerInvoiceRateReview,
  customerInvoiceBookingType,
  type CustomerInvoiceRateSetupRecord,
} from "../../../lib/customer-dsp-invoice-review";
import { formatCustomerInvoiceLineDescription } from "../../../lib/customer-invoice-line-description";
import {
  formatInvoiceAmount,
  parseInvoiceAmountToCents,
} from "../../../lib/customer-local-invoices";
import { formatSingaporePickupDisplay } from "../../../lib/singapore-pickup-display";

const adminCustomerSavedBookingsApiPath = "/api/admin-customer-saved-bookings";
const adminCustomerInvoicesApiPath = "/api/admin-customer-invoices";
const adminCustomerAccountsApiPath = "/api/admin-customer-accounts";
const adminBookingsApiPath = "/api/admin-bookings";
const adminCompanyTravelerCrmRuntimeWriteActionApiPath =
  "/api/admin-company-traveler-crm-runtime-write-action";
const adminDriverJobDspActualTimeSummariesApiPath =
  "/api/admin-driver-job-dsp-actual-time-summaries";
const adminLegacyTravelersApiPath = "/api/admin-legacy-data/rest/v1/travelers";
const adminRateSetupApiPath = "/api/admin-rate-setup";
const customerFolderFocusBookingReferenceParam = "focus_booking_reference";
const customerFolderLoadSavedJobsParam = "load_saved_jobs";
const customerFolderPaidBookingReferenceParam = "paid_booking_reference";
const customerFolderSelectedPriceReviewsParam = "selected_booking_price_reviews";
const customerFolderInvoiceSelectionLimit = 4;
const customerInvoiceAmendedBookingRefreshAction = "refresh_amended_unpaid_invoice";
const customerInvoiceUpdatedEventName = "prestige:customer-invoice-updated";

type CustomerFolderSavedBookingRecord = {
  admin_status?: string | null;
  booker_id?: number | null;
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

type CustomerFolderIssuedInvoiceLineItem = {
  bookingReference?: string;
};

type CustomerFolderIssuedInvoiceRecord = {
  customerId?: string;
  documentState?: string;
  documentType?: string;
  lineItems?: CustomerFolderIssuedInvoiceLineItem[];
  reference?: string;
};

type CustomerFolderTravelerInvoiceGroup = {
  bookings: CustomerFolderSavedBookingRecord[];
  bookerId: number | null;
  guestAccountBillingEnabled: boolean;
  passengerName: string;
  travelerId: number | null;
};

type CustomerFolderRateSetup = Omit<CustomerInvoiceRateSetupRecord, "companies" | "travelers"> & {
  companies?: Array<{
    company_name?: string | null;
    id?: number | null;
  }>;
  travelers?: Array<{
    booker_id?: number | null;
    booker_name?: string | null;
    company_id?: number | null;
    id?: number | null;
    traveler_name?: string | null;
  }>;
};

type CustomerFolderBillingReview = {
  amountCents: number | null;
  breakdown: string;
  message: string;
  status: "calculating" | "proposed" | "required" | "reviewed";
};

type CustomerFolderBillingReviews = Record<string, CustomerFolderBillingReview>;

type CustomerFolderDspActualTimeSummary = {
  billing_time_correction_reason?: string | null;
  billing_time_source?: "admin_correction" | "automatic" | null;
  dsp_ended_at?: string | null;
  dsp_started_at?: string | null;
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
  bookerContact: string;
  bookerEmail: string;
  bookerId: string;
  bookerName: string;
  companyId: string;
  customerName: string;
  dropoffLocation: string;
  passengerName: string;
  pickupDateTime: string;
  pickupLocation: string;
  routeSummary: string;
  serviceType: string;
  travelerId: string;
};

type CustomerFolderInlineEditState = {
  booking: CustomerFolderExactBooking | null;
  form: CustomerFolderInlineEditForm;
  message: string;
  status: "idle" | "loading" | "loaded" | "saving" | "error";
};

type CustomerFolderDspBillingTimeCorrectionState = {
  endInput: string;
  message: string;
  reason: string;
  startInput: string;
  status: "idle" | "loading" | "loaded" | "saving" | "error";
};

type CustomerFolderSavedBookingsState = {
  issuedInvoiceBookingReferences: string[];
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
  bookerContact: "",
  bookerEmail: "",
  bookerId: "",
  bookerName: "",
  companyId: "",
  customerName: "",
  dropoffLocation: "",
  passengerName: "",
  pickupDateTime: "",
  pickupLocation: "",
  routeSummary: "",
  serviceType: "",
  travelerId: "",
};

const initialInlineEditState: CustomerFolderInlineEditState = {
  booking: null,
  form: emptyInlineEditForm,
  message: "",
  status: "idle",
};

const initialDspBillingTimeCorrectionState: CustomerFolderDspBillingTimeCorrectionState = {
  endInput: "",
  message: "",
  reason: "",
  startInput: "",
  status: "idle",
};

function inlineEditText(value: unknown, maxLength = 300) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function inlineEditComparableText(value: unknown, maxLength = 300) {
  return inlineEditText(value, maxLength).toLocaleLowerCase("en-SG");
}

function inlineEditIdentityId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function inlineEditEmail(value: unknown) {
  const email = inlineEditText(value, 240).toLowerCase();

  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email || null : null;
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
    bookerContact: inlineEditText(booking.contact_phone, 120),
    bookerEmail: inlineEditText(booking.contact_email, 240),
    bookerId: inlineEditIdentityId(booking.booker_id)?.toString() || "",
    bookerName: inlineEditText(booking.contact_display_name, 160),
    companyId: inlineEditIdentityId(booking.company_id)?.toString() || "",
    customerName: inlineEditText(booking.customer_display_name, 160),
    dropoffLocation: inlineEditText(booking.dropoff_location),
    passengerName: inlineEditText(booking.passenger_name, 160),
    pickupDateTime: inlineEditDateTimeInput(booking.pickup_at || booking.pickup_datetime),
    pickupLocation: inlineEditText(booking.pickup_location),
    routeSummary: inlineEditText(booking.route_summary, 500),
    serviceType: inlineEditText(booking.service_type || booking.route_type, 80),
    travelerId: inlineEditIdentityId(booking.traveler_id)?.toString() || "",
  } satisfies CustomerFolderInlineEditForm;
}

function dspBillingTimeCorrectionStateFromSummary(
  booking: CustomerFolderExactBooking,
  summary: CustomerFolderDspActualTimeSummary | null,
): CustomerFolderDspBillingTimeCorrectionState {
  const hasAdminCorrection = summary?.billing_time_source === "admin_correction";

  return {
    endInput: inlineEditDateTimeInput(summary?.dsp_ended_at),
    message: hasAdminCorrection
      ? "Saved admin correction. Original Driver Reports evidence remains unchanged."
      : "Automatic default: saved booking pickup → Driver JC. Edit only when the actual billing interval needs correction.",
    reason: hasAdminCorrection
      ? inlineEditText(summary?.billing_time_correction_reason, 500)
      : "",
    startInput: inlineEditDateTimeInput(
      hasAdminCorrection
        ? summary?.dsp_started_at
        : booking.pickup_at || booking.pickup_datetime,
    ),
    status: "loaded",
  };
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
        ? "Checking saved booking pickup→Driver JC end and the verified Prestige customer rate."
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
  guestAccountBillingEnabled = false,
  paidBookingReference = "",
) {
  const baseHref = customerWorkspaceHref(booking, customerId, customerName, "open");
  const references = selectedBookings
    .map((selectedBooking) => safeDispatchReference(selectedBooking))
    .filter(Boolean);

  if (!baseHref || references.length === 0) {
    return "";
  }

  const travelerId = Number(selectedBookings[0]?.traveler_id);
  const bookerId = Number(selectedBookings[0]?.booker_id);

  if (!guestAccountBillingEnabled && (
    !Number.isInteger(travelerId) ||
    travelerId <= 0 ||
    !Number.isInteger(bookerId) ||
    bookerId <= 0 ||
    selectedBookings.some(
      (selectedBooking) =>
        Number(selectedBooking.traveler_id) !== travelerId ||
        Number(selectedBooking.booker_id) !== bookerId,
    )
  )) {
    return "";
  }

  if (selectedBookings.some((selectedBooking) => !safePublicBookingReference(selectedBooking.public_booking_reference))) {
    return "";
  }

  const params = new URLSearchParams(baseHref.split("?")[1] || "");

  params.set("customer_invoice_action", "create");
  if (guestAccountBillingEnabled) {
    params.set("guest_account_billing", "1");
  }
  params.set("selected_booking_references", references.join(","));
  const safePaidBookingReference = safeBookingReferenceValue(paidBookingReference);

  if (references.length === 1 && safePaidBookingReference === references[0]) {
    params.set(customerFolderPaidBookingReferenceParam, safePaidBookingReference);
  }
  params.set(
    customerFolderSelectedPriceReviewsParam,
    customerFolderReviewedPricePayload(selectedBookings, reviews),
  );

  return `/customers?${params.toString()}`;
}

function customerFolderTravelerInvoiceGroups(
  bookings: CustomerFolderSavedBookingRecord[],
  guestAccountBillingEnabled = false,
): { error: string; groups: CustomerFolderTravelerInvoiceGroup[] } {
  if (guestAccountBillingEnabled && bookings.length > 0) {
    return {
      error: "",
      groups: [{
        bookings,
        bookerId: null,
        guestAccountBillingEnabled: true,
        passengerName: "customer account",
        travelerId: null,
      }],
    };
  }

  const groups = new Map<number, CustomerFolderTravelerInvoiceGroup>();

  for (const booking of bookings) {
    const travelerId = Number(booking.traveler_id);
    const bookerId = Number(booking.booker_id);
    const passengerName = displayText(booking.passenger_name, "Verified traveller");

    if (
      !Number.isInteger(travelerId) ||
      travelerId <= 0 ||
      !Number.isInteger(bookerId) ||
      bookerId <= 0
    ) {
      return {
        error: "Missing verified traveller identity. Invoice preparation is blocked.",
        groups: [],
      };
    }

    const current = groups.get(travelerId);

    if (current && current.bookerId !== bookerId) {
      return {
        error: "Verified traveller and PA ownership do not match. Invoice preparation is blocked.",
        groups: [],
      };
    }

    groups.set(travelerId, {
      bookings: [...(current?.bookings || []), booking],
      bookerId,
      guestAccountBillingEnabled: false,
      passengerName: current?.passengerName || passengerName,
      travelerId,
    });
  }

  return {
    error: "",
    groups: [...groups.values()],
  };
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

function normalizedExactInvoiceReference(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function issuedInvoiceBookingReferences(
  invoices: CustomerFolderIssuedInvoiceRecord[],
  customerId: string,
) {
  const exactCustomerId = normalizedExactInvoiceReference(customerId);
  const references = new Set<string>();

  invoices.forEach((invoice) => {
    if (
      (invoice.documentType || "invoice") !== "invoice" ||
      (invoice.documentState || "issued") !== "issued" ||
      normalizedExactInvoiceReference(invoice.customerId) !== exactCustomerId
    ) {
      return;
    }

    const invoiceReference = normalizedExactInvoiceReference(invoice.reference);

    if (invoiceReference) {
      references.add(invoiceReference);
    }

    invoice.lineItems?.forEach((lineItem) => {
      const lineItemReference = normalizedExactInvoiceReference(
        lineItem.bookingReference,
      );

      if (lineItemReference) {
        references.add(lineItemReference);
      }
    });
  });

  return references;
}

function bookingHasIssuedInvoice(
  booking: CustomerFolderSavedBookingRecord,
  issuedInvoiceReferences: Set<string>,
) {
  return [booking.booking_reference, booking.public_booking_reference].some(
    (reference) =>
      issuedInvoiceReferences.has(normalizedExactInvoiceReference(reference)),
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

  if (/invoice coverage/.test(message)) {
    return "Customer invoice coverage could not be verified. Jobs not billed yet is blocked so an existing issued invoice cannot be duplicated. Reload this customer folder and try again.";
  }

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
  const customerFolderRateSetupRef = useRef<CustomerFolderRateSetup | null>(null);
  const [customerFolderRateSetup, setCustomerFolderRateSetup] =
    useState<CustomerFolderRateSetup | null>(null);
  const [customerFolderRateSetupMessage, setCustomerFolderRateSetupMessage] =
    useState("");
  const [sectionFourEditingReference, setSectionFourEditingReference] = useState("");
  const [dspBillingTimeCorrectionState, setDspBillingTimeCorrectionState] =
    useState<CustomerFolderDspBillingTimeCorrectionState>(
      initialDspBillingTimeCorrectionState,
    );
  const [priceDraft, setPriceDraft] = useState("");
  const [expandedSavedBookingReference, setExpandedSavedBookingReference] = useState("");
  const [paidReferences, setPaidReferences] = useState<Record<string, boolean>>({});
  const [selectedReferences, setSelectedReferences] = useState<Record<string, boolean>>({});
  const [guestAccountBillingEnabled, setGuestAccountBillingEnabled] = useState(false);
  const [readState, setReadState] = useState<CustomerFolderSavedBookingsState>({
    issuedInvoiceBookingReferences: [],
    message: initialMessage(customerName),
    savedBookings: [],
    status: "idle",
    summary: null,
    tone: "info",
  });

  async function loadCustomerFolderRateSetup(
    options: { force?: boolean } = {},
  ) {
    if (!options.force && customerFolderRateSetupRef.current) {
      return customerFolderRateSetupRef.current;
    }

    setCustomerFolderRateSetupMessage("Loading verified CRM identities...");
    const rateResponse = await fetch(adminRateSetupApiPath, {
      headers: {
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
      method: "GET",
    });
    const rateSetup = (await rateResponse.json().catch(() => null)) as
      | (CustomerFolderRateSetup & { error?: string; ok?: boolean })
      | null;

    if (!rateResponse.ok || rateSetup?.ok !== true) {
      setCustomerFolderRateSetupMessage(
        "Verified CRM identities could not be loaded. No customer identity is assumed.",
      );
      throw new Error("CRM rate setup unavailable");
    }

    customerFolderRateSetupRef.current = rateSetup;
    setCustomerFolderRateSetup(rateSetup);
    setCustomerFolderRateSetupMessage("Verified CRM identities loaded.");
    return rateSetup;
  }

  async function loadAutomatedBillingReviews(bookings: CustomerFolderSavedBookingRecord[]) {
    const proposalBookings = bookings.filter(
      (booking) =>
        safeDispatchReference(booking) &&
        customerInvoiceBookingType(booking.service_type) !== null &&
        !parseInvoiceAmountToCents(String(booking.customer_price_label ?? "")),
    );

    if (proposalBookings.length === 0) {
      return [];
    }

    try {
      const rateSetup = await loadCustomerFolderRateSetup();

      const calculatedReviews = await Promise.all(
        proposalBookings.map(async (booking) => {
          const reference = safeDispatchReference(booking);
          const bookingType = customerInvoiceBookingType(booking.service_type);
          let actualMinutes: number | null = null;
          let dspBillingTimeSource: CustomerFolderDspActualTimeSummary["billing_time_source"] =
            null;

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
            dspBillingTimeSource = summary?.billing_time_source ?? null;
            const billingStartAt =
              summary?.billing_time_source === "admin_correction"
                ? summary?.dsp_started_at
                : booking.pickup_at;
            actualMinutes = calculateCustomerDspBillingActualMinutes(
              billingStartAt,
              summary?.dsp_ended_at,
            );

            if (
              !timingResponse.ok ||
              timingResult?.ok !== true ||
              actualMinutes === null
            ) {
              return {
                reference,
                review: {
                  amountCents: null,
                  breakdown:
                    "Confirm the saved booking pickup and complete Driver JC, then reload this customer folder.",
                  message: "Review required",
                  status: "required",
                } satisfies CustomerFolderBillingReview,
              };
            }
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
              ? `${calculation.actualMinutes} ${
                  dspBillingTimeSource === "admin_correction"
                    ? "corrected billing"
                    : "booking-to-JC"
                } min → ${calculation.billableHours} billable hr × ` +
                `${formatInvoiceAmount(calculation.rateCents)}/hr${surchargeLabel}. Source: ${sourceLabel}.`
              : `${formatInvoiceAmount(calculation.baseAmountCents)} fixed trip${surchargeLabel}. ` +
                `Source: ${sourceLabel}.`;

          return {
            reference,
            review: {
              amountCents: calculation.amountCents,
              breakdown: `${breakdown} Temporary Codex proposal; tick the job to confirm this price for invoice handoff, or edit it first.`,
              message: "Review required · tick to confirm",
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
      return calculatedReviews;
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
      return [];
    }
  }

  async function loadSavedBookings(options?: {
    focusBookingReference?: string;
    source?: "manual" | "return";
  }) {
    const focusBookingReference = safeBookingReferenceValue(options?.focusBookingReference);
    setReadState({
      issuedInvoiceBookingReferences: [],
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
      const accountParams = new URLSearchParams({ customer_id: customerId, limit: "1" });
      const [response, invoiceResponse, accountResponse] = await Promise.all([
        fetch(`${adminCustomerSavedBookingsApiPath}?${params.toString()}`, {
          headers: {
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          method: "GET",
        }),
        fetch(adminCustomerInvoicesApiPath, {
          cache: "no-store",
          headers: {
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          method: "GET",
        }),
        fetch(`${adminCustomerAccountsApiPath}?${accountParams.toString()}`, {
          cache: "no-store",
          headers: {
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          method: "GET",
        }),
      ]);
      const result = await response.json().catch(() => null);
      const invoiceResult = await invoiceResponse.json().catch(() => null);
      const accountResult = await accountResponse.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Saved booking read could not be completed.");
      }

      if (
        !invoiceResponse.ok ||
        !invoiceResult?.ok ||
        !Array.isArray(invoiceResult.invoices)
      ) {
        throw new Error("Customer invoice coverage could not be verified.");
      }

      const exactAccount = Array.isArray(accountResult?.accounts) ? accountResult.accounts[0] : null;

      if (
        !accountResponse.ok ||
        !accountResult?.ok ||
        String(exactAccount?.customer_id || "") !== customerId
      ) {
        throw new Error("Customer account classification could not be verified.");
      }

      setGuestAccountBillingEnabled(exactAccount.guest_account_billing_enabled === true);

      const savedBookings = Array.isArray(result.saved_bookings)
        ? (result.saved_bookings as CustomerFolderSavedBookingRecord[])
        : [];
      const issuedInvoiceReferenceSet = issuedInvoiceBookingReferences(
        invoiceResult.invoices as CustomerFolderIssuedInvoiceRecord[],
        customerId,
      );
      const returnedCount = Number(result.summary?.returned_count ?? savedBookings.length);
      const visibleSavedBookings = savedBookings.filter(
        (booking) =>
          !isClearlyBilledOrClosedJob(booking) &&
          !bookingHasIssuedInvoice(booking, issuedInvoiceReferenceSet),
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
        issuedInvoiceBookingReferences: [...issuedInvoiceReferenceSet],
        message:
          returnMessage ||
          (visibleSavedBookings.length > 0
            ? `Loaded ${countLabel(visibleSavedBookings.length, "unbilled saved job")} for ${customerName}.`
            : returnedCount > 0
              ? "No saved job remains in Jobs not billed yet after billed or closed checks."
            : `No saved jobs returned for ${customerName}.`),
        savedBookings,
        status: "loaded",
        summary: result.summary || null,
        tone: "success",
      });
    } catch (error) {
      setReadState({
        issuedInvoiceBookingReferences: [],
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

  useEffect(() => {
    function handleGuestAccountBillingUpdate(event: Event) {
      const detail = (event as CustomEvent<{ customerId?: string; enabled?: boolean }>).detail;

      if (detail?.customerId === customerId && typeof detail.enabled === "boolean") {
        setGuestAccountBillingEnabled(detail.enabled);
      }
    }

    window.addEventListener(
      "prestige:customer-guest-account-billing-updated",
      handleGuestAccountBillingUpdate,
    );

    return () =>
      window.removeEventListener(
        "prestige:customer-guest-account-billing-updated",
        handleGuestAccountBillingUpdate,
      );
  }, [customerId]);

  const issuedInvoiceReferenceSet = new Set(
    readState.issuedInvoiceBookingReferences,
  );
  const unbilledSavedBookings = readState.savedBookings.filter(
    (booking) =>
      !isClearlyBilledOrClosedJob(booking) &&
      !bookingHasIssuedInvoice(booking, issuedInvoiceReferenceSet),
  );
  const selectedUnbilledBookings = unbilledSavedBookings.filter((booking) => {
    const reference = safeDispatchReference(booking);

    return reference && selectedReferences[reference];
  });
  const selectedTravelerInvoiceGrouping = customerFolderTravelerInvoiceGroups(
    selectedUnbilledBookings,
    guestAccountBillingEnabled,
  );
  const selectedTravelerInvoiceGroups = selectedTravelerInvoiceGrouping.groups.map((group) => ({
    ...group,
    href: customerFolderInvoiceHref(
      group.bookings[0],
      customerId,
      customerName,
      group.bookings,
      billingReviews,
      group.guestAccountBillingEnabled,
    ),
  }));
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
  const sectionFourCrmCompanies = (customerFolderRateSetup?.companies || [])
    .filter((company) => inlineEditIdentityId(company.id))
    .map((company) => ({
      id: String(company.id),
      name: displayText(company.company_name, `Company ${company.id}`),
    }));
  const sectionFourCompanyId = inlineEditIdentityId(inlineEditState.form.companyId);
  const sectionFourBookerId = inlineEditIdentityId(inlineEditState.form.bookerId);
  const sectionFourCrmBookers = Array.from(
    new Map(
      (customerFolderRateSetup?.travelers || [])
        .filter(
          (traveler) =>
            sectionFourCompanyId &&
            inlineEditIdentityId(traveler.company_id) === sectionFourCompanyId &&
            inlineEditIdentityId(traveler.booker_id),
        )
        .map((traveler) => [
          String(traveler.booker_id),
          {
            id: String(traveler.booker_id),
            name: displayText(traveler.booker_name, `Booker ${traveler.booker_id}`),
          },
        ]),
    ).values(),
  );
  const sectionFourCrmTravelers = (customerFolderRateSetup?.travelers || []).filter(
    (traveler) =>
      sectionFourCompanyId &&
      sectionFourBookerId &&
      inlineEditIdentityId(traveler.company_id) === sectionFourCompanyId &&
      inlineEditIdentityId(traveler.booker_id) === sectionFourBookerId &&
      inlineEditIdentityId(traveler.id),
  );

  function toggleSelectedBooking(booking: CustomerFolderSavedBookingRecord, selected: boolean) {
    const reference = safeDispatchReference(booking);

    if (!reference) {
      return;
    }

    if (selected) {
      setBillingReviews((current) => {
        const displayedPrice = current[reference];

        if (!displayedPrice?.amountCents || displayedPrice.status === "reviewed") {
          return current;
        }

        return {
          ...current,
          [reference]: {
            ...displayedPrice,
            message: "Reviewed",
            status: "reviewed",
          },
        };
      });
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

  async function openInlineBookingEditor(
    booking: CustomerFolderSavedBookingRecord,
    options: { surface?: "invoice-review" | "unbilled-jobs" } = {},
  ) {
    const reference = safeDispatchReference(booking);

    if (!reference) {
      return;
    }

    if (options.surface === "invoice-review") {
      setSectionFourEditingReference(reference);
      try {
        await loadCustomerFolderRateSetup();
      } catch {
        // The visible Section 4 identity editor remains fail closed.
      }
    } else {
      setExpandedSavedBookingReference(reference);
      setSectionFourEditingReference("");
    }
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
    setDspBillingTimeCorrectionState({
      ...initialDspBillingTimeCorrectionState,
      message: "Loading DSP billing time...",
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

      let dspActualTimeSummary: CustomerFolderDspActualTimeSummary | null = null;

      if (customerInvoiceBookingType(exactBooking.service_type) === "DSP") {
        const timingParams = new URLSearchParams({
          booking_reference: reference,
          limit: "1",
        });
        const timingResponse = await fetch(
          `${adminDriverJobDspActualTimeSummariesApiPath}?${timingParams.toString()}`,
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

        if (!timingResponse.ok || timingResult?.ok !== true) {
          throw new Error("DSP billing time read failed safely.");
        }

        dspActualTimeSummary = timingResult.latest_summary ?? null;
      }

      setInlineEditState({
        booking: exactBooking,
        form: inlineEditFormFromBooking(exactBooking),
        message: "Edit the job details and customer price inside this box.",
        status: "loaded",
      });
      setDspBillingTimeCorrectionState(
        customerInvoiceBookingType(exactBooking.service_type) === "DSP"
          ? dspBillingTimeCorrectionStateFromSummary(
              exactBooking,
              dspActualTimeSummary,
            )
          : initialDspBillingTimeCorrectionState,
      );
    } catch {
      setInlineEditState({
        ...initialInlineEditState,
        message: "This exact job could not be loaded. Reload the customer folder and try again.",
        status: "error",
      });
      setDspBillingTimeCorrectionState({
        ...initialDspBillingTimeCorrectionState,
        message: "DSP billing time could not be loaded safely.",
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

  function updateSectionFourCompanyIdentity(value: string) {
    setInlineEditState((current) => ({
      ...current,
      form: {
        ...current.form,
        bookerId: "",
        companyId: value,
        travelerId: "",
      },
      message: "Unsaved verified customer identity changes.",
    }));
  }

  function updateSectionFourBookerIdentity(value: string) {
    const selectedBooker = sectionFourCrmBookers.find((booker) => booker.id === value);

    setInlineEditState((current) => ({
      ...current,
      form: {
        ...current.form,
        bookerId: value,
        bookerName: selectedBooker?.name || current.form.bookerName,
        travelerId: "",
      },
      message: "Unsaved verified customer identity changes.",
    }));
  }

  function updateSectionFourTravelerIdentity(value: string) {
    const selectedTraveler = sectionFourCrmTravelers.find(
      (traveler) => String(traveler.id) === value,
    );

    setInlineEditState((current) => ({
      ...current,
      form: {
        ...current.form,
        passengerName:
          inlineEditText(selectedTraveler?.traveler_name, 160) ||
          current.form.passengerName,
        travelerId: value,
      },
      message: "Unsaved verified customer identity changes.",
    }));
  }

  function sectionFourVerifiedIdentityIsValid(form: CustomerFolderInlineEditForm) {
    const companyId = inlineEditIdentityId(form.companyId);
    const bookerId = inlineEditIdentityId(form.bookerId);
    const travelerId = inlineEditIdentityId(form.travelerId);

    return Boolean(
      companyId &&
      bookerId &&
      travelerId &&
      (customerFolderRateSetupRef.current?.travelers ||
        customerFolderRateSetup?.travelers ||
        []).some(
        (traveler) =>
          inlineEditIdentityId(traveler.id) === travelerId &&
          inlineEditIdentityId(traveler.company_id) === companyId &&
          inlineEditIdentityId(traveler.booker_id) === bookerId,
      ),
    );
  }

  function sectionFourProceedCause(form: CustomerFolderInlineEditForm) {
    const companyId = inlineEditIdentityId(form.companyId);
    const bookerId = inlineEditIdentityId(form.bookerId);
    const travelerId = inlineEditIdentityId(form.travelerId);

    if (!companyId) {
      return "No verified company is selected for this booking.";
    }

    if (!bookerId) {
      return "No verified PA / booker is selected beneath the verified company.";
    }

    if (!travelerId) {
      return "A verified traveller is missing. The existing guarded correction will try to create and link only that traveller beneath the selected company and PA / booker.";
    }

    if (!sectionFourVerifiedIdentityIsValid(form)) {
      return "The selected company, PA / booker, and traveller chain must be re-read and verified before this booking can continue to invoice review.";
    }

    return "You reviewed corrections to this booking's customer identity or job details.";
  }

  function sectionFourProceedConfirmation(
    booking: CustomerFolderSavedBookingRecord,
    form: CustomerFolderInlineEditForm,
  ) {
    return [
      `Proceed for booking ${publicBookingReferenceDisplay(booking)}?`,
      "",
      `Cause: ${sectionFourProceedCause(form)}`,
      "",
      "This saves only the reviewed customer identity and job fields for this booking.",
      "If one traveller is missing, the existing guarded correction may create and link only that traveller beneath the selected company and PA / booker.",
      "The customer price returns to Review required.",
      "No invoice, PDF, email, reminder, payment, driver, Calendar, messaging, payout, PayNow, or other booking action will run.",
      "",
      "Email AI and Ask AI cannot approve this action. Continue only if you pressed this visible Admin button yourself.",
    ].join("\n");
  }

  async function proceedWithSectionFourBookingCorrection(
    event: MouseEvent<HTMLButtonElement>,
    booking: CustomerFolderSavedBookingRecord,
  ) {
    const reference = safeDispatchReference(booking);
    const editingReference = safeBookingReferenceValue(
      inlineEditText(inlineEditState.booking?.booking_reference, 120),
    );

    if (!event.isTrusted) {
      setInlineEditState((current) => ({
        ...current,
        message:
          "Use the visible Proceed for this booking button. Email AI and Ask AI cannot approve this action. No job was changed.",
        status: "error",
      }));
      return;
    }

    if (!reference || reference !== editingReference) {
      setInlineEditState((current) => ({
        ...current,
        message:
          "The exact booking changed before confirmation. Reopen Edit job and review it again. No job was changed.",
        status: "error",
      }));
      return;
    }

    if (!window.confirm(sectionFourProceedConfirmation(booking, inlineEditState.form))) {
      setInlineEditState((current) => ({
        ...current,
        message: `Proceed cancelled for ${publicBookingReferenceDisplay(booking)}. No job was changed.`,
        status: "loaded",
      }));
      return;
    }

    await saveInlineBookingDetails(booking, {
      keepEditorOpen: true,
      requireVerifiedIdentity: true,
    });
  }

  async function ensureSectionFourVerifiedIdentity(
    form: CustomerFolderInlineEditForm,
  ) {
    const companyId = inlineEditIdentityId(form.companyId);
    const bookerId = inlineEditIdentityId(form.bookerId);
    const travelerName = inlineEditText(form.passengerName, 160);
    const bookerName = inlineEditText(form.bookerName, 160);
    const bookerContact = inlineEditText(form.bookerContact, 120);
    const bookerEmail = inlineEditEmail(form.bookerEmail);

    if (!companyId || !bookerId || !travelerName || !bookerName) {
      throw new Error(
        "Select the exact verified company and booker, then enter the traveller name.",
      );
    }

    const freshRateSetup = await loadCustomerFolderRateSetup({ force: true });
    const companyExists = (freshRateSetup.companies || []).some(
      (company) => inlineEditIdentityId(company.id) === companyId,
    );

    if (!companyExists) {
      throw new Error("Select one existing verified company before saving.");
    }

    const bookerBelongsToCompany = (freshRateSetup.travelers || []).some(
      (traveler) =>
        inlineEditIdentityId(traveler.company_id) === companyId &&
        inlineEditIdentityId(traveler.booker_id) === bookerId,
    );

    if (!bookerBelongsToCompany) {
      throw new Error("Select one existing verified booker for this company.");
    }
    const matchingTraveler = (freshRateSetup.travelers || []).find(
      (traveler) =>
        inlineEditIdentityId(traveler.company_id) === companyId &&
        inlineEditComparableText(traveler.traveler_name, 160) ===
          inlineEditComparableText(travelerName, 160),
    );
    const linkedBookerId = inlineEditIdentityId(matchingTraveler?.booker_id);

    if (linkedBookerId && linkedBookerId !== bookerId) {
      throw new Error(
        "That traveller is already linked to another verified booker. Select the exact traveller instead.",
      );
    }

    let travelerId = inlineEditIdentityId(matchingTraveler?.id);

    if (!travelerId) {
      const response = await fetch(adminCompanyTravelerCrmRuntimeWriteActionApiPath, {
        body: JSON.stringify({
          action_type: "traveler_create",
          booker_contact: bookerContact || null,
          booker_email: bookerEmail,
          booker_name: bookerName,
          company_id: companyId,
          traveler_name: travelerName,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as
        | {
            error?: string;
            ok?: boolean;
            record?: {
              company_id?: number | null;
              id?: number | null;
            } | null;
          }
        | null;

      travelerId = inlineEditIdentityId(result?.record?.id);

      if (
        !response.ok ||
        result?.ok !== true ||
        !travelerId ||
        inlineEditIdentityId(result.record?.company_id) !== companyId
      ) {
        throw new Error(
          result?.error ||
            "Verified traveller could not be created. No invoice was created or emailed.",
        );
      }
    }

    const travelerLinkParams = new URLSearchParams({
      id: `eq.${travelerId}`,
      select:
        "id,company_id,booker_id,traveler_name,booker_name,booker_contact,booker_email",
      single: "single",
    });
    const travelerLinkResponse = await fetch(
      `${adminLegacyTravelersApiPath}?${travelerLinkParams.toString()}`,
      {
        body: JSON.stringify({
          booker_contact: bookerContact || null,
          booker_email: bookerEmail,
          booker_id: bookerId,
          booker_name: bookerName,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      },
    );
    const linkedTraveler = (await travelerLinkResponse.json().catch(() => null)) as
      | {
          booker_id?: number | null;
          company_id?: number | null;
          id?: number | null;
        }
      | null;

    if (
      !travelerLinkResponse.ok ||
      inlineEditIdentityId(linkedTraveler?.id) !== travelerId ||
      inlineEditIdentityId(linkedTraveler?.company_id) !== companyId ||
      inlineEditIdentityId(linkedTraveler?.booker_id) !== bookerId
    ) {
      throw new Error(
        "Verified traveller could not be linked to the exact booker. No invoice was created or emailed.",
      );
    }

    await loadCustomerFolderRateSetup({ force: true });

    return {
      ...form,
      bookerId: String(bookerId),
      companyId: String(companyId),
      travelerId: String(travelerId),
    } satisfies CustomerFolderInlineEditForm;
  }

  function updateDspBillingTimeCorrectionField(
    field: "endInput" | "reason" | "startInput",
    value: string,
  ) {
    setDspBillingTimeCorrectionState((current) => ({
      ...current,
      [field]: value,
      message: "Unsaved DSP billing-time correction.",
      status: "loaded",
    }));
  }

  async function saveDspBillingTimeCorrection(
    booking: CustomerFolderSavedBookingRecord,
  ) {
    const reference = safeDispatchReference(booking);
    const dspStartedAt = inlineEditApiDateTime(
      dspBillingTimeCorrectionState.startInput,
    );
    const dspEndedAt = inlineEditApiDateTime(
      dspBillingTimeCorrectionState.endInput,
    );
    const correctionReason = inlineEditText(
      dspBillingTimeCorrectionState.reason,
      500,
    );
    const startTime = new Date(dspStartedAt).getTime();
    const endTime = new Date(dspEndedAt).getTime();

    if (
      !reference ||
      !dspStartedAt ||
      !dspEndedAt ||
      correctionReason.length < 3 ||
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime)
    ) {
      setDspBillingTimeCorrectionState((current) => ({
        ...current,
        message: "Enter a valid DSP billing start, end, and correction reason.",
        status: "error",
      }));
      return;
    }

    if (endTime <= startTime) {
      setDspBillingTimeCorrectionState((current) => ({
        ...current,
        message: "DSP billing end must be after its start.",
        status: "error",
      }));
      return;
    }

    setDspBillingTimeCorrectionState((current) => ({
      ...current,
      message: `Saving DSP billing times for ${publicBookingReferenceDisplay(booking)}...`,
      status: "saving",
    }));

    try {
      const response = await fetch(adminDriverJobDspActualTimeSummariesApiPath, {
        body: JSON.stringify({
          booking_reference: reference,
          correction_reason: correctionReason,
          dsp_ended_at: dspEndedAt,
          dsp_started_at: dspStartedAt,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = (await response.json().catch(() => null)) as
        | {
            corrected_summary?: CustomerFolderDspActualTimeSummary | null;
            error?: string;
            ok?: boolean;
          }
        | null;

      if (
        !response.ok ||
        result?.ok !== true ||
        result.corrected_summary?.billing_time_source !== "admin_correction"
      ) {
        throw new Error(result?.error || "DSP billing time correction failed safely.");
      }

      setDspBillingTimeCorrectionState({
        ...dspBillingTimeCorrectionStateFromSummary(
          inlineEditState.booking || {},
          result.corrected_summary,
        ),
        message:
          "Saved DSP billing times. Original Driver Reports evidence remains unchanged.",
      });
      setBillingReviews((current) => ({
        ...current,
        [reference]: {
          amountCents: null,
          breakdown: "Recalculating from the saved DSP billing-time correction.",
          message: "Calculating",
          status: "calculating",
        },
      }));
      const recalculatedReviews = await loadAutomatedBillingReviews([booking]);
      const recalculatedReview = recalculatedReviews.find(
        (candidate) => candidate.reference === reference,
      );

      if (recalculatedReview?.review.amountCents) {
        setPriceDraft((recalculatedReview.review.amountCents / 100).toFixed(2));
      }
      setReadState((current) => ({
        ...current,
        message: `Saved DSP billing times and recalculated the customer proposal for ${publicBookingReferenceDisplay(booking)}.`,
        tone: "success",
      }));
    } catch (error) {
      setDspBillingTimeCorrectionState((current) => ({
        ...current,
        message:
          error instanceof Error
            ? error.message
            : "DSP billing time correction was not saved.",
        status: "error",
      }));
    }
  }

  async function saveInlineBookingDetails(
    booking: CustomerFolderSavedBookingRecord,
    options: {
      keepEditorOpen?: boolean;
      requireVerifiedIdentity?: boolean;
    } = {},
  ) {
    const exactBooking = inlineEditState.booking;
    const reference = safeDispatchReference(booking);
    let form = inlineEditState.form;
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

    if (inlineEditText(form.bookerEmail) && !inlineEditEmail(form.bookerEmail)) {
      setInlineEditState((current) => ({
        ...current,
        message: "Enter a valid booker email or leave it blank.",
        status: "error",
      }));
      return;
    }

    if (options.requireVerifiedIdentity && !sectionFourVerifiedIdentityIsValid(form)) {
      setInlineEditState((current) => ({
        ...current,
        message: "Creating or linking the missing verified traveller...",
        status: "saving",
      }));

      try {
        form = await ensureSectionFourVerifiedIdentity(form);
      } catch (error) {
        setInlineEditState((current) => ({
          ...current,
          message:
            error instanceof Error
              ? error.message
              : "Verified traveller could not be saved. No invoice was created or emailed.",
          status: "error",
        }));
        return;
      }

      if (!sectionFourVerifiedIdentityIsValid(form)) {
        setInlineEditState((current) => ({
          ...current,
          message:
            "Verified identity could not be confirmed after saving. No invoice was created or emailed.",
          status: "error",
        }));
        return;
      }
    }

    setInlineEditState((current) => ({
      ...current,
      message: `Saving job ${publicBookingReferenceDisplay(booking)}...`,
      status: "saving",
    }));

    const payload = {
      booking: {
        admin_internal_status: exactBooking.admin_internal_status ?? "Draft",
        booker_id: inlineEditIdentityId(form.bookerId),
        booking_reference: reference,
        cancellation_review_status: exactBooking.cancellation_review_status ?? null,
        change_review_status: exactBooking.change_review_status ?? null,
        company_id: inlineEditIdentityId(form.companyId),
        contact_display_name: inlineEditText(form.bookerName, 160) || null,
        contact_email: inlineEditEmail(form.bookerEmail),
        contact_phone: inlineEditText(form.bookerContact, 120) || null,
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
        traveler_id: inlineEditIdentityId(form.travelerId),
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
                booker_id: updatedBooking.booker_id,
                company_id: updatedBooking.company_id,
                customer_account: updatedBooking.customer_display_name,
                dropoff_location: updatedBooking.dropoff_location,
                passenger_name: updatedBooking.passenger_name,
                pickup_at: updatedBooking.pickup_at || updatedBooking.pickup_datetime,
                pickup_location: updatedBooking.pickup_location,
                public_booking_reference:
                  updatedBooking.public_booking_reference || savedBooking.public_booking_reference,
                route_summary: updatedBooking.route_summary,
                service_type: updatedBooking.service_type || updatedBooking.route_type,
                traveler_id: updatedBooking.traveler_id,
              }
            : savedBooking,
        ),
        tone: "success",
      }));
      if (options.keepEditorOpen) {
        setBillingReviews((current) => ({
          ...current,
          [reference]: {
            amountCents: current[reference]?.amountCents ?? null,
            breakdown:
              "Customer identity or job information changed. Review and confirm the displayed customer price again before invoice handoff.",
            message: "Review corrected job price",
            status: "proposed",
          },
        }));
        return;
      }

      setExpandedSavedBookingReference("");
      setSectionFourEditingReference("");
      setEditingPriceReference("");
      setPriceDraft("");
      setInlineEditState(initialInlineEditState);
      setDspBillingTimeCorrectionState(initialDspBillingTimeCorrectionState);
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

  async function refreshLinkedUnpaidInvoice(
    booking: CustomerFolderSavedBookingRecord,
    amountCents: number,
  ) {
    const exactBooking = inlineEditState.booking;
    const bookingReference = safeDispatchReference(booking);
    const exactBookingReference = safeBookingReferenceValue(
      exactBooking?.booking_reference,
    );

    if (
      !exactBooking ||
      !bookingReference ||
      exactBookingReference !== bookingReference
    ) {
      throw new Error(
        "Reload this exact job before linking its reviewed price to Total invoices.",
      );
    }

    const serviceType = inlineEditText(
      exactBooking.service_type || exactBooking.route_type,
      80,
    );
    const dspBooking = customerInvoiceBookingType(serviceType) === "DSP";
    const route =
      inlineEditText(exactBooking.route_summary, 500) ||
      [exactBooking.pickup_location, exactBooking.dropoff_location]
        .map((value) => inlineEditText(value))
        .filter(Boolean)
        .join(" > ");
    const lineDescription = formatCustomerInvoiceLineDescription({
      dspEndedAt: dspBooking
        ? inlineEditApiDateTime(dspBillingTimeCorrectionState.endInput)
        : null,
      dspStartedAt: dspBooking
        ? inlineEditApiDateTime(dspBillingTimeCorrectionState.startInput)
        : null,
      flightNumber: exactBooking.flight_no,
      passengerName: exactBooking.passenger_name,
      pickupAt: exactBooking.pickup_at || exactBooking.pickup_datetime,
      pickupLocation: exactBooking.pickup_location,
      publicReference:
        safePublicBookingReference(exactBooking.public_booking_reference) ||
        safePublicBookingReference(booking.public_booking_reference),
      route,
      serviceType,
      vehicleType: exactBooking.vehicle_type_or_category,
    });
    const response = await fetch(adminCustomerInvoicesApiPath, {
      body: JSON.stringify({
        action: customerInvoiceAmendedBookingRefreshAction,
        amountCents,
        bookingReference,
        customerId,
        lineItem: {
          amountLabel: formatInvoiceAmount(amountCents),
          bookingReference,
          description: lineDescription,
          quantity: 1,
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
      method: "PATCH",
    });
    const result = (await response.json().catch(() => null)) as
      | {
          error?: string;
          invoice?: Record<string, unknown> | null;
          linked?: boolean;
          ok?: boolean;
        }
      | null;

    if (!response.ok || result?.ok !== true) {
      throw new Error(
        result?.error ||
          "The reviewed job price was not linked to Total invoices.",
      );
    }

    if (result.linked && result.invoice) {
      window.dispatchEvent(
        new CustomEvent(customerInvoiceUpdatedEventName, {
          detail: {
            invoice: result.invoice,
          },
        }),
      );
      return inlineEditText(result.invoice.invoiceNumber, 80);
    }

    return "";
  }

  async function savePriceReview(booking: CustomerFolderSavedBookingRecord) {
    const reference = safeDispatchReference(booking);
    const amountCents = parseInvoiceAmountToCents(priceDraft);

    if (!reference || !amountCents) {
      return;
    }

    setReadState((current) => ({
      ...current,
      message: `Linking the reviewed price for ${publicBookingReferenceDisplay(booking)}...`,
      tone: "info",
    }));

    let linkedInvoiceNumber = "";

    try {
      linkedInvoiceNumber = await refreshLinkedUnpaidInvoice(booking, amountCents);
    } catch (error) {
      setReadState((current) => ({
        ...current,
        message:
          error instanceof Error
            ? error.message
            : "The reviewed job price was not saved.",
        tone: "error",
      }));
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
    setReadState((current) => ({
      ...current,
      message: linkedInvoiceNumber
        ? `Saved customer price and refreshed ${linkedInvoiceNumber} in Total invoices.`
        : `Saved customer price for ${publicBookingReferenceDisplay(booking)}. No existing unpaid invoice required a refresh.`,
      tone: "success",
    }));
    setExpandedSavedBookingReference("");
    setEditingPriceReference("");
    setPriceDraft("");
    setInlineEditState(initialInlineEditState);
    setDspBillingTimeCorrectionState(initialDspBillingTimeCorrectionState);
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
            <span className="text-xs font-semibold text-slate-500">
              Ticking a job confirms its displayed customer price for this invoice.
            </span>
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
                const paidForInvoice = Boolean(
                  bookingReference && paidReferences[bookingReference],
                );
                const createSingleInvoiceHref = customerFolderInvoiceHref(
                  booking,
                  customerId,
                  customerName,
                  [booking],
                  billingReviews,
                  false,
                  paidForInvoice ? bookingReference : "",
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
                          <label className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-bold text-emerald-900">
                            <input
                              aria-label={`Mark ${publicBookingReferenceDisplay(booking)} paid`}
                              checked={paidForInvoice}
                              className="h-3.5 w-3.5 rounded border-emerald-500 text-emerald-700"
                              data-customer-folder-saved-bookings-paid={booking.booking_reference || ""}
                              onChange={(event) => {
                                if (!bookingReference) {
                                  return;
                                }

                                setPaidReferences((current) => ({
                                  ...current,
                                  [bookingReference]: event.target.checked,
                                }));
                              }}
                              type="checkbox"
                            />
                            <span>Paid</span>
                          </label>
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
                                {customerInvoiceBookingType(inlineEditState.form.serviceType) === "DSP" ? (
                                  <div
                                    className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3"
                                    data-customer-folder-dsp-billing-time-correction="true"
                                  >
                                    <p className="text-xs font-bold text-sky-950">
                                      DSP billing time
                                    </p>
                                    <p className="mt-1 text-xs font-semibold leading-5 text-sky-900">
                                      {dspBillingTimeCorrectionState.message}
                                    </p>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                      <label className="text-xs font-bold text-slate-700">
                                        DSP billing start (SGT)
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-sky-300 bg-white px-2 font-semibold text-slate-950"
                                          data-customer-folder-dsp-billing-start="true"
                                          disabled={dspBillingTimeCorrectionState.status === "saving"}
                                          onChange={(event) =>
                                            updateDspBillingTimeCorrectionField(
                                              "startInput",
                                              event.target.value,
                                            )
                                          }
                                          type="datetime-local"
                                          value={dspBillingTimeCorrectionState.startInput}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        DSP billing end / JC (SGT)
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-sky-300 bg-white px-2 font-semibold text-slate-950"
                                          data-customer-folder-dsp-billing-end="true"
                                          disabled={dspBillingTimeCorrectionState.status === "saving"}
                                          onChange={(event) =>
                                            updateDspBillingTimeCorrectionField(
                                              "endInput",
                                              event.target.value,
                                            )
                                          }
                                          type="datetime-local"
                                          value={dspBillingTimeCorrectionState.endInput}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                                        Correction reason
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-sky-300 bg-white px-2 font-semibold text-slate-950"
                                          data-customer-folder-dsp-billing-reason="true"
                                          disabled={dspBillingTimeCorrectionState.status === "saving"}
                                          maxLength={500}
                                          onChange={(event) =>
                                            updateDspBillingTimeCorrectionField(
                                              "reason",
                                              event.target.value,
                                            )
                                          }
                                          placeholder="Actual customer service started early / JC corrected"
                                          value={dspBillingTimeCorrectionState.reason}
                                        />
                                      </label>
                                    </div>
                                    <div className="mt-2 flex justify-end">
                                      <button
                                        className="h-9 rounded-md border border-sky-800 bg-sky-800 px-3 text-xs font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                                        data-customer-folder-dsp-billing-time-save="true"
                                        disabled={dspBillingTimeCorrectionState.status === "saving"}
                                        onClick={() => void saveDspBillingTimeCorrection(booking)}
                                        type="button"
                                      >
                                        {dspBillingTimeCorrectionState.status === "saving"
                                          ? "Saving DSP billing times..."
                                          : "Save DSP billing times"}
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
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
                                      setDspBillingTimeCorrectionState(
                                        initialDspBillingTimeCorrectionState,
                                      );
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
                                    onClick={() => void savePriceReview(booking)}
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
                  Review invoice &amp; email. Selected jobs are automatically separated by verified traveller.
                </p>
              </div>
              {selectedTravelerInvoiceGroups.length > 0 &&
              selectedTravelerInvoiceGroups.every((group) => group.href) &&
              selectedPricesReviewed &&
              selectedPublicReferencesReady ? (
                <div className="flex flex-wrap gap-2" data-customer-folder-traveler-invoice-groups="true">
                  {selectedTravelerInvoiceGroups.map((group) => (
                    <Link
                      className="inline-flex h-8 items-center justify-center rounded-md border border-sky-800 bg-sky-800 px-2.5 text-[11px] font-bold text-white transition hover:bg-sky-700"
                      data-customer-folder-create-invoice-selected="true"
                      data-customer-folder-traveler-invoice-group="true"
                      href={group.href}
                      key={group.guestAccountBillingEnabled ? "guest-account" : group.travelerId}
                    >
                      Load {group.passengerName} invoice
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    className="inline-flex h-8 cursor-not-allowed items-center justify-center rounded-md border border-slate-200 bg-slate-100 px-2.5 text-[11px] font-bold text-slate-400"
                    data-customer-folder-create-invoice-selected-disabled="true"
                    disabled
                    type="button"
                  >
                    {selectedUnbilledBookings.length === 0
                      ? "Select jobs first"
                      : selectedTravelerInvoiceGrouping.error
                        ? selectedTravelerInvoiceGrouping.error
                      : !selectedPublicReferencesReady
                        ? "Public reference required"
                        : "Customer price required"}
                  </button>
                  {selectedTravelerInvoiceGrouping.error && selectedUnbilledBookings.length === 1 ? (
                    <button
                      className="inline-flex h-8 items-center justify-center rounded-md border border-sky-800 bg-sky-800 px-2.5 text-[11px] font-bold text-white hover:bg-sky-700"
                      data-customer-folder-blocked-proceed="true"
                      onClick={() =>
                        void openInlineBookingEditor(selectedUnbilledBookings[0], {
                          surface: "invoice-review",
                        })
                      }
                      type="button"
                    >
                      Proceed for this booking
                    </button>
                  ) : null}
                </div>
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
                      <th className="border-b border-slate-200 px-3 py-2 text-right">Confirmed price</th>
                      <th className="border-b border-slate-200 px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedUnbilledBookings.map((booking) => {
                      const reference = safeDispatchReference(booking);
                      const review = reference ? billingReviews[reference] : null;

                      return (
                      <Fragment key={`invoice-layout-${booking.booking_reference}`}>
                        <tr
                          className="border-b border-slate-100 last:border-b-0"
                          data-customer-folder-selected-invoice-job={booking.booking_reference || ""}
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
                          <td className="px-3 py-2 text-right">
                            <button
                              className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                              data-customer-folder-section-four-edit="true"
                              onClick={() =>
                                void openInlineBookingEditor(booking, {
                                  surface: "invoice-review",
                                })
                              }
                              type="button"
                            >
                              Edit job
                            </button>
                          </td>
                        </tr>
                        {sectionFourEditingReference === reference ? (
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <td className="px-3 py-3" colSpan={5}>
                              <div
                                className="rounded-md border border-sky-300 bg-white p-3"
                                data-customer-folder-section-four-identity-editor="true"
                              >
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-wide text-sky-900">
                                      Correct saved customer identity and job information
                                    </p>
                                    <p className="text-xs font-semibold leading-5 text-slate-600">
                                      Reuses the exact saved-booking Edit/PATCH lane. Invoice preparation
                                      stays blocked until one verified company, PA / booker, traveller,
                                      and reviewed price are confirmed.
                                    </p>
                                  </div>
                                  <button
                                    className="h-8 shrink-0 rounded-md border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                                    onClick={() => {
                                      setSectionFourEditingReference("");
                                      setEditingPriceReference("");
                                      setInlineEditState(initialInlineEditState);
                                      setPriceDraft("");
                                    }}
                                    type="button"
                                  >
                                    Close
                                  </button>
                                </div>
                                {inlineEditState.status === "loading" ? (
                                  <p className="mt-3 text-xs font-bold text-sky-800">
                                    {inlineEditState.message}
                                  </p>
                                ) : inlineEditState.booking ? (
                                  <>
                                    <p className="mt-2 text-xs font-semibold text-slate-600">
                                      {customerFolderRateSetupMessage}
                                    </p>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                      <label className="text-xs font-bold text-slate-700">
                                        Verified company
                                        <select
                                          className="mt-1 h-9 w-full rounded-md border border-sky-300 bg-white px-2 font-semibold text-slate-950"
                                          data-customer-folder-section-four-company-identity="true"
                                          onChange={(event) =>
                                            updateSectionFourCompanyIdentity(event.target.value)
                                          }
                                          value={inlineEditState.form.companyId}
                                        >
                                          <option value="">Select exact company</option>
                                          {sectionFourCrmCompanies.map((company) => (
                                            <option key={company.id} value={company.id}>
                                              {company.name}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Verified PA / booker
                                        <select
                                          className="mt-1 h-9 w-full rounded-md border border-sky-300 bg-white px-2 font-semibold text-slate-950 disabled:bg-slate-100"
                                          data-customer-folder-section-four-booker-identity="true"
                                          disabled={!sectionFourCompanyId}
                                          onChange={(event) =>
                                            updateSectionFourBookerIdentity(event.target.value)
                                          }
                                          value={inlineEditState.form.bookerId}
                                        >
                                          <option value="">Select exact PA / booker</option>
                                          {sectionFourCrmBookers.map((booker) => (
                                            <option key={booker.id} value={booker.id}>
                                              {booker.name}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Verified traveller
                                        <select
                                          className="mt-1 h-9 w-full rounded-md border border-sky-300 bg-white px-2 font-semibold text-slate-950 disabled:bg-slate-100"
                                          data-customer-folder-section-four-traveler-identity="true"
                                          disabled={!sectionFourBookerId}
                                          onChange={(event) =>
                                            updateSectionFourTravelerIdentity(event.target.value)
                                          }
                                          value={inlineEditState.form.travelerId}
                                        >
                                          <option value="">Select exact traveller</option>
                                          {sectionFourCrmTravelers.map((traveler) => (
                                            <option key={traveler.id} value={String(traveler.id)}>
                                              {displayText(
                                                traveler.traveler_name,
                                                `Traveller ${traveler.id}`,
                                              )}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Customer / company
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          data-customer-folder-section-four-customer-name="true"
                                          onChange={(event) =>
                                            updateInlineEditField("customerName", event.target.value)
                                          }
                                          value={inlineEditState.form.customerName}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Booker name
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          data-customer-folder-section-four-booker-name="true"
                                          onChange={(event) =>
                                            updateInlineEditField("bookerName", event.target.value)
                                          }
                                          value={inlineEditState.form.bookerName}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Passenger
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          data-customer-folder-section-four-passenger-name="true"
                                          onChange={(event) =>
                                            updateInlineEditField("passengerName", event.target.value)
                                          }
                                          value={inlineEditState.form.passengerName}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Booker contact
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          data-customer-folder-section-four-booker-contact="true"
                                          onChange={(event) =>
                                            updateInlineEditField("bookerContact", event.target.value)
                                          }
                                          value={inlineEditState.form.bookerContact}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Booker email
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          data-customer-folder-section-four-booker-email="true"
                                          onChange={(event) =>
                                            updateInlineEditField("bookerEmail", event.target.value)
                                          }
                                          type="email"
                                          value={inlineEditState.form.bookerEmail}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Pickup date &amp; time (SGT)
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          onChange={(event) =>
                                            updateInlineEditField("pickupDateTime", event.target.value)
                                          }
                                          type="datetime-local"
                                          value={inlineEditState.form.pickupDateTime}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Pickup
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          onChange={(event) =>
                                            updateInlineEditField("pickupLocation", event.target.value)
                                          }
                                          value={inlineEditState.form.pickupLocation}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Drop-off
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          onChange={(event) =>
                                            updateInlineEditField("dropoffLocation", event.target.value)
                                          }
                                          value={inlineEditState.form.dropoffLocation}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Service
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          onChange={(event) =>
                                            updateInlineEditField("serviceType", event.target.value)
                                          }
                                          value={inlineEditState.form.serviceType}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                                        Route
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 font-semibold text-slate-950"
                                          onChange={(event) =>
                                            updateInlineEditField("routeSummary", event.target.value)
                                          }
                                          value={inlineEditState.form.routeSummary}
                                        />
                                      </label>
                                      <label className="text-xs font-bold text-slate-700">
                                        Confirmed price (SGD)
                                        <input
                                          className="mt-1 h-9 w-full rounded-md border border-amber-300 bg-white px-2 font-bold text-slate-950"
                                          inputMode="decimal"
                                          onChange={(event) => setPriceDraft(event.target.value)}
                                          value={priceDraft}
                                        />
                                      </label>
                                    </div>
                                    <p className="mt-2 text-xs font-bold text-slate-700">
                                      {inlineEditState.message}
                                    </p>
                                    <p
                                      className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs font-semibold text-sky-950"
                                      data-customer-folder-section-four-exact-booking-proceed="true"
                                    >
                                      Proceed applies only to this exact booking. The confirmation
                                      explains the cause, affected fields, and untouched actions
                                      before the existing guarded save runs. Email AI and Ask AI do
                                      not call this control.
                                    </p>
                                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                                      <button
                                        className="h-9 rounded-md border border-sky-800 bg-sky-800 px-3 text-xs font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                                        data-customer-folder-section-four-save="true"
                                        disabled={inlineEditState.status === "saving"}
                                        onClick={(event) =>
                                          void proceedWithSectionFourBookingCorrection(
                                            event,
                                            booking,
                                          )
                                        }
                                        type="button"
                                      >
                                        {inlineEditState.status === "saving"
                                          ? "Saving..."
                                          : "Proceed for this booking"}
                                      </button>
                                      <button
                                        className="h-9 rounded-md border border-emerald-700 bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
                                        disabled={
                                          !parseInvoiceAmountToCents(priceDraft) ||
                                          inlineEditState.message.startsWith("Unsaved") ||
                                          inlineEditState.status === "saving"
                                        }
                                        onClick={() => void savePriceReview(booking)}
                                        type="button"
                                      >
                                        Confirm corrected price
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <p className="mt-3 text-xs font-bold text-rose-800">
                                    {inlineEditState.message}
                                  </p>
                                )}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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
