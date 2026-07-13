"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  collectionRules,
  mockCustomers,
  type MockCustomer,
  type MockCustomerBooking,
  type MockPaymentStatus,
} from "./_data/mock-customers";
import {
  calculateHourlyBillableMinutes,
  calculateHourlyInvoiceAmountCents,
  hourlyBillingDefaultRateCents,
  hourlyBillingGraceRuleText,
  hourlyBillingUnitMinutes,
} from "../../lib/hourly-billing";
import { formatSingaporePickupDisplay } from "../../lib/singapore-pickup-display";
import {
  downloadCustomerInvoicePdf,
  formatInvoiceAmount,
  formatInvoiceDate,
  formatInvoiceMonth,
  invoiceDateInputDaysFromNow,
  parseInvoiceAmountToCents,
  readCustomerLocalInvoices,
  removeCustomerLocalInvoice,
  saveCustomerLocalInvoice,
  type CustomerBillingDocumentType,
  type CustomerLocalInvoiceLineItem,
  type CustomerLocalInvoiceRecord,
  type CustomerLocalInvoiceStatus,
} from "../../lib/customer-local-invoices";

const adminCustomerAccountsApiPath = "/api/admin-customer-accounts";
const adminCustomerSavedBookingsApiPath = "/api/admin-customer-saved-bookings";
const adminBookingsApiPath = "/api/admin-bookings";
const adminSavedBookingsApiPath = "/api/admin-saved-bookings";
const adminCustomerInvoicesApiPath = "/api/admin-customer-invoices";
const adminCustomerInvoicePdfApiPath = "/api/admin-customer-invoice-pdf";
const adminCustomerInvoiceEmailApiPath = "/api/admin-customer-invoice-email";
const adminCompletedBookingCloseoutApiPath = "/api/admin-completed-booking-closeouts";
const adminDriverJobDspActualTimeSummariesApiPath =
  "/api/admin-driver-job-dsp-actual-time-summaries";
const customerFolderDispatchHandoffTab = "dispatch";
const customerFolderDispatchHandoffReferenceParam = "booking_reference";
const customerInvoiceTestArtifactArchiveAction = "archive_test_invoice";
const approvedCustomerTestInvoiceArchiveTarget = {
  bookingReference: "ADM-20260702061357",
  confirmationText: "ARCHIVE TEST INVOICE INV-20260702-0001 ADM-20260702061357",
  customerId: "64",
  customerName: "Codex Live Ops Account 20260702141102 Pte Ltd [Codex Traveler 20260702141102]",
  invoiceNumber: "INV-20260702-0001",
};

type RegularCustomerSavedBookingReadTarget = {
  accountScopeKey?: string;
  customerId: string;
  customerName: string;
};

type RegularCustomerSavedBookingReadMode = "account-or-id" | "customer-id";

const regularCustomerRouteTypeOptions = [
  "Airport Arrival",
  "Airport Departure",
  "Point-to-Point Transfer",
  "Hourly / Disposal",
  "Event / VIP Movement",
  "Other / To Confirm",
];

const regularCustomerVehicleTypeOptions = [
  { label: "Alphard / Vellfire", value: "AVF" },
  { label: "Mercedes Viano / V-Class", value: "VVV" },
  { label: "Hi-roof Minibus", value: "Combi" },
  { label: "Mercedes E-Class", value: "E-Class" },
  { label: "Mercedes S-Class", value: "S-Class" },
];

const regularCustomerBillingStatusFilterOptions = [
  "unbilled / draft",
  "billed",
  "paid",
  "cancelled",
];

const regularCustomerBillingQuickFilterAllValue = "all";
const regularCustomerBillingQuickFilterNoMatchValue = "mock-no-match";

const initialRegularCustomerBookingForm = {
  actualEndTime: "",
  actualStartTime: "",
  billingMonth: "2026-05",
  billingStatus: "unbilled / draft",
  booker: "",
  customerId: "",
  customerReference: "",
  dropoffLocation: "",
  extraStops: "",
  flightNumber: "",
  internalNote: "",
  luggage: "",
  passengerCount: "1",
  passengerName: "",
  paymentMethod: "monthly bank transfer manual",
  pickupDate: "",
  pickupLocation: "",
  pickupTime: "",
  ratePerHour: String(hourlyBillingDefaultRateCents / 100),
  routeType: "Airport Arrival",
  vehicleType: "AVF",
};

const outstandingPaymentStatuses = new Set<MockPaymentStatus>([
  "Invoice Sent",
  "Monthly Account",
  "Overdue",
  "Partially Paid",
  "Unpaid",
]);

type OutstandingReviewFilter = "all" | "due-soon" | "needs-follow-up" | "overdue" | "partial-pending";

type OutstandingReviewSort = "customer-az" | "highest-amount" | "last-follow-up" | "oldest-overdue";

const outstandingReviewFilterOptions: Array<{ label: string; value: OutstandingReviewFilter }> = [
  { label: "All", value: "all" },
  { label: "Overdue", value: "overdue" },
  { label: "Due soon", value: "due-soon" },
  { label: "Partial / pending", value: "partial-pending" },
  { label: "Needs follow-up", value: "needs-follow-up" },
];

const outstandingReviewSortOptions: Array<{ label: string; value: OutstandingReviewSort }> = [
  { label: "Highest amount first", value: "highest-amount" },
  { label: "Oldest overdue first", value: "oldest-overdue" },
  { label: "Customer A-Z", value: "customer-az" },
  { label: "Last follow-up", value: "last-follow-up" },
];

const outstandingReviewPageSizeOptions = [10, 25];
const customerQueuePageSizeOptions = [10, 25];
const customerFolderFinderPageSize = 10;
const customerBillingOverviewPageSize = 20;
const customerBillingDocumentPageSize = 5;
type CustomerInvoiceWorkspaceTab = "create-invoice" | "statements" | "outstanding" | "follow-up";

const customerInvoiceWorkspaceTabs: Array<{ label: string; value: CustomerInvoiceWorkspaceTab }> = [];

const mockTodayDateValue = Date.UTC(2026, 4, 25);

const mockMonthIndexes: Record<string, number> = {
  Apr: 3,
  April: 3,
  Jun: 5,
  June: 5,
  May: 4,
};

type OutstandingPaymentReviewItem = {
  agingBucket: string;
  balanceDue: string;
  customerId: string;
  customerName: string;
  dueOrFollowUpDate: string;
  dueStatusLabel: string;
  followUpDate: string;
  invoiceNumber: string;
  isMonthlyAccount: boolean;
  key: string;
  lastFollowUpDate: string;
  outstandingBookingsCount: number;
  paymentStatus: MockPaymentStatus;
  reason: string;
  searchText: string;
};

type VisibleOutstandingPaymentReviewItem = OutstandingPaymentReviewItem & {
  feedback?: string;
  removeFromOutstanding: boolean;
};

type MockPaymentAction = "invoice-sent" | "partial-payment" | "paid" | "waived";

type MockPaymentLocalUpdate = {
  balanceDue: string;
  feedback: string;
  paymentStatus: MockPaymentStatus;
  removeFromOutstanding: boolean;
};

type MockPaymentEvent = {
  action: string;
  customerName: string;
  id: string;
  invoiceNumber: string;
  note: string;
  timestamp: string;
};

type MockFollowUpAction = "schedule" | "done" | "note";

type MockFollowUpLocalUpdate = {
  feedback: string;
  followUpDate?: string;
  note?: string;
};

type MockFollowUpEvent = {
  action: string;
  customerName: string;
  id: string;
  invoiceNumber: string;
  note: string;
  timestamp: string;
};

type MockStatementPreviewGroup = {
  customerId: string;
  customerName: string;
  feedback?: string;
  invoicePrefix: string;
  items: VisibleOutstandingPaymentReviewItem[];
  key: string;
  periodLabel: string;
  statementTotal: string;
};

type MockStatementPreviewEvent = {
  action: string;
  customerName: string;
  id: string;
  note: string;
  periodLabel: string;
  timestamp: string;
};

type UnbilledCustomerRow = {
  accountScopeKey: string;
  accountScopeLabel: string;
  amount: string;
  billingMonth: string;
  billingMonthLabel: string;
  billingBreakdown?: string;
  customerFolderHref: string;
  customerId: string;
  companyId: number | null;
  bookerId: number | null;
  customerName: string;
  dateLabel: string;
  invoiceLineDescription?: string;
  key: string;
  needsScopeReview: boolean;
  reference: string;
  route: string;
  service: string;
  statusLabel: string;
};

type CustomerMonthlyBillingGroup = {
  accountScopeKey: string;
  accountScopeLabel: string;
  billingMonth: string;
  billingMonthLabel: string;
  customerId: string;
  customerName: string;
  key: string;
  needsScopeReview: boolean;
  rows: UnbilledCustomerRow[];
};

type CustomerInvoiceDriverActualTimeSummary = {
  actual_time_status?: "complete" | "not_started" | "started" | string | null;
  booking_reference?: string | null;
  dsp_billable_minutes?: number | null;
  dsp_ended_at?: string | null;
  dsp_started_at?: string | null;
  dsp_total_minutes?: number | null;
};

type CustomerInvoiceDriverActualTimeReadState = {
  bookingReference: string;
  message: string;
  status: "error" | "idle" | "loaded" | "loading" | "skipped";
  summary: CustomerInvoiceDriverActualTimeSummary | null;
  tone: RegularCustomerBookingFeedbackTone;
};

type CustomerInvoiceCalculatedAmount = {
  amountCents: number;
  billingBreakdown: string;
  invoiceLineDescription: string;
  sourceLabel: string;
};

type CustomerInvoicePreview = {
  amountCents: number;
  amountLabel: string;
  cardFeeApplies: boolean;
  cardPaymentEnabled: boolean;
  customerName: string;
  documentType: CustomerBillingDocumentType;
  dueDateIso: string;
  dueDateLabel: string;
  folder: CustomerLocalInvoiceStatus;
  lineDescription: string;
  lineItems: CustomerLocalInvoiceLineItem[];
  previewKey: string;
  reference: string;
  route: string;
  service: string;
  sourceLabel: string;
};

type CustomerDisplayedInvoiceRecord = CustomerLocalInvoiceRecord & {
  creditNoteReason?: string;
  customerEmail?: string;
  emailDeliveryStatus?: "blocked" | "failed" | "not_sent" | "sent";
  emailSentAt?: string | null;
  pdfFilename?: string;
  storageSource?: "local" | "server";
};

type InvoiceSafetyActionConfirmation = {
  action: string;
  amountLabel?: string;
  consequence: string;
  customerName?: string;
  documentLabel?: string;
  extraLines?: string[];
  invoiceNumber?: string;
  recipientEmail?: string;
  reference?: string;
};

function confirmInvoiceSafetyAction({
  action,
  amountLabel,
  consequence,
  customerName,
  documentLabel,
  extraLines = [],
  invoiceNumber,
  recipientEmail,
  reference,
}: InvoiceSafetyActionConfirmation) {
  if (typeof window === "undefined") {
    return false;
  }

  const detailLines = [
    documentLabel ? `Document: ${documentLabel}` : "",
    invoiceNumber ? `Invoice: ${invoiceNumber}` : "",
    customerName ? `Customer: ${customerName}` : "",
    reference ? `Reference: ${reference}` : "",
    amountLabel ? `Amount: ${amountLabel}` : "",
    recipientEmail ? `Recipient: ${recipientEmail}` : "",
    ...extraLines,
  ].filter(Boolean);

  return window.confirm(
    [
      `Final invoice action confirmation: ${action}`,
      "",
      ...detailLines,
      "",
      consequence,
      "Use only after final admin review.",
      "Confirm to continue.",
    ].join("\n"),
  );
}

type CustomerBillingDocumentState = "draft" | "issued";

type CustomerInvoiceDraftRecord = {
  amountCents: number;
  amountLabel: string;
  cardFeeApplies: boolean;
  cardPaymentEnabled: boolean;
  createdAtLabel: string;
  customerName: string;
  documentType: CustomerBillingDocumentType;
  documentNumber?: string;
  draftId: string;
  dueDateIso: string;
  dueDateLabel: string;
  folder: CustomerLocalInvoiceStatus;
  lineDescription: string;
  reference: string;
  route: string;
  service: string;
  storageSource?: "local" | "server";
};

type CustomerBillingOverviewRow = {
  balanceCents: number;
  balanceLabel: string;
  customerFolderKey: string;
  customerFolderHref: string;
  customerId: string;
  customerName: string;
  draftCount: number;
  invoiceAmountCents: number;
  invoiceAmountLabel: string;
  invoiceCount: number;
  latestDateLabel: string;
  paidCount: number;
  pendingCount: number;
  readyJobCount: number;
  statusLabel: "Draft" | "Pending" | "Ready" | "Paid" | "No invoices";
};

type SelectedCustomerBillingInvoiceRow = {
  amountLabel: string;
  balanceLabel: string;
  customerName: string;
  dateLabel: string;
  documentNumber: string;
  documentTypeLabel: string;
  invoiceRecord?: CustomerDisplayedInvoiceRecord;
  key: string;
  lineItems: CustomerLocalInvoiceLineItem[];
  statusLabel: "Draft" | "Pending" | "Paid";
};

type PlainInvoiceForm = {
  amount: string;
  billToEmail: string;
  billToName: string;
  bookerId: number | null;
  bookingReference: string;
  cardFeeApplies: boolean;
  cardPaymentEnabled: boolean;
  crmCustomerId: string;
  crmCustomerName: string;
  dueDateIso: string;
  isPaid: boolean;
  lineItems: PlainInvoiceAdditionalLineItem[];
  lineDescription: string;
  reference: string;
  route: string;
  service: string;
};

type PlainInvoiceAdditionalLineItem = {
  amount: string;
  lineDescription: string;
};

type RegularCustomerBookingForm = typeof initialRegularCustomerBookingForm;

type RegularCustomerBookingPreview = RegularCustomerBookingForm & {
  customerFolderHref: string;
  customerName: string;
  createdAtLabel: string;
};

type RegularCustomerBookingListItem = RegularCustomerBookingPreview & {
  id: string;
};

type RegularCustomerBookingListAction = "amend" | "cancel" | "edit";

type RegularCustomerBookingListActionFeedback = {
  action: RegularCustomerBookingListAction;
  message: string;
};

type RegularCustomerBookingListFilters = {
  billingMonth: string;
  billingStatus: string;
  customerId: string;
};

type RegularCustomerDraftInvoicePreview = {
  billingMonthLabel: string;
  createdAtLabel: string;
  customerLabel: string;
  isMixedBillingMonth: boolean;
  isMixedCustomer: boolean;
  rows: RegularCustomerBookingListItem[];
};

type RegularCustomerBookingFeedbackTone = "error" | "info" | "success";

type RegularCustomerMockSaveReview = {
  billingMonth: string;
  customerName: string;
  dropoffLocation: string;
  passengerName: string;
  pickupDate: string;
  pickupLocation: string;
  pickupTime: string;
  vehicleType: string;
};

type RegularCustomerSavedBookingReadRecord = {
  booker_id?: number | null;
  account_scope_key?: string | null;
  account_scope_label?: string | null;
  admin_status?: string | null;
  booking_month?: string | null;
  booking_reference?: string | null;
  booking_type?: string | null;
  child_seat_count?: number | null;
  child_seat_customer_surcharge?: number | null;
  child_seat_required?: boolean | null;
  customer_account?: string | null;
  customer_id?: string | null;
  company_id?: number | null;
  customer_price_amount?: number | null;
  customer_price_override_reason?: string | null;
  customer_rate?: number | null;
  customer_rate_override?: number | null;
  customer_rate_unit?: string | null;
  customer_status?: string | null;
  extra_stop_count?: number | null;
  extra_stop_surcharge?: number | null;
  midnight_surcharge?: number | null;
  pickup_at?: string | null;
  pricing_source?: string | null;
  route_type?: string | null;
  service_type?: string | null;
};

type CustomerFolderExactBookingRoutePoint = {
  location?: string | null;
  location_text?: string | null;
  notes?: string | null;
  point_type?: "pickup" | "dropoff" | "stop" | "waypoint" | "extra_stop" | string | null;
  sequence?: number | null;
  sequence_number?: number | null;
  timing_note?: string | null;
};

type CustomerFolderExactBookingServiceItem = {
  blocks_count?: number | null;
  item_type?: string | null;
  notes?: string | null;
  quantity?: number | null;
  service_item_type?: string | null;
};

type CustomerFolderExactBookingRecord = {
  booker_id?: number | null;
  admin_internal_status?: string | null;
  booking_reference?: string | null;
  cancellation_review_status?: string | null;
  change_review_status?: string | null;
  contact_display_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  customer_display_name?: string | null;
  customer_facing_status?: string | null;
  customer_id?: number | string | null;
  company_id?: number | null;
  driver_contact?: string | null;
  driver_name?: string | null;
  driver_plate_number?: string | null;
  dropoff_location?: string | null;
  flight_no?: string | null;
  id?: number | string | null;
  luggage_count?: number | null;
  parser_source_reference?: string | null;
  passenger_name?: string | null;
  passenger_phone?: string | null;
  pax_count?: number | null;
  pickup_at?: string | null;
  pickup_datetime?: string | null;
  pickup_location?: string | null;
  request_review_status?: string | null;
  route_points?: CustomerFolderExactBookingRoutePoint[] | null;
  route_summary?: string | null;
  route_type?: string | null;
  service_items?: CustomerFolderExactBookingServiceItem[] | null;
  service_type?: string | null;
  short_notice_review_status?: string | null;
  source_channel?: string | null;
  source_surface?: string | null;
  vehicle_type_or_category?: string | null;
};

type CustomerFolderExactBookingEditForm = {
  driverContact: string;
  driverName: string;
  driverPlateNumber: string;
  dropoffLocation: string;
  passengerName: string;
  pickupDateTime: string;
  pickupLocation: string;
  serviceType: string;
  vehicleType: string;
};

type CustomerFolderExactBookingEditorState = {
  booking: CustomerFolderExactBookingRecord | null;
  bookingReference: string;
  form: CustomerFolderExactBookingEditForm;
  message: string;
  status: "idle" | "loading" | "loaded" | "saving" | "deleting" | "deleted" | "error";
  tone: RegularCustomerBookingFeedbackTone;
};

type RegularCustomerSavedBookingCloseoutRecord = {
  billing_prep_readiness?: string | null;
  closeout_status?: string | null;
  completed_job_status?: string | null;
  dsp_actual_hours_readiness?: string | null;
  extra_charges_readiness?: string | null;
  safe_closeout_context?: {
    closeout_summary?: string | null;
    next_action?: string | null;
  } | null;
};

type RegularCustomerAccountReadRecord = {
  account_scope_key?: string | null;
  account_scope_label?: string | null;
  completed_count?: number | null;
  customer_account?: string | null;
  customer_folder_key?: string | null;
  customer_id?: string | null;
  latest_booking_reference?: string | null;
  latest_pickup_at?: string | null;
  latest_service_type?: string | null;
  saved_booking_count?: number | null;
  upcoming_count?: number | null;
};

type RegularCustomerAccountReadState = {
  accounts: RegularCustomerAccountReadRecord[];
  message: string;
  status: "idle" | "loading" | "loaded" | "error";
  summary: {
    recent_read_count?: number | null;
    returned_count?: number | null;
    total_account_count?: number | null;
  } | null;
  tone: RegularCustomerBookingFeedbackTone;
};

type RegularCustomerSavedBookingReadState = {
  message: string;
  savedBookings: RegularCustomerSavedBookingReadRecord[];
  status: "idle" | "loading" | "loaded" | "error";
  summary: {
    matched_count?: number | null;
    recent_read_count?: number | null;
    returned_count?: number | null;
  } | null;
  tone: RegularCustomerBookingFeedbackTone;
};

type CustomerFolderJobViewState = RegularCustomerSavedBookingReadState & {
  customerId: string;
  customerName: string;
};

type CustomerFolderSavedBookingMonthGroup = {
  bookings: RegularCustomerSavedBookingReadRecord[];
  key: string;
  label: string;
};

type RegularCustomerSavedBookingBillingReadinessState = {
  closeoutsByReference: Record<string, RegularCustomerSavedBookingCloseoutRecord>;
  message: string;
  status: "idle" | "loading" | "loaded" | "error";
  tone: RegularCustomerBookingFeedbackTone;
};

const initialRegularCustomerBookingListFilters: RegularCustomerBookingListFilters = {
  billingMonth: "",
  billingStatus: "",
  customerId: "",
};

const initialCustomerFolderExactBookingEditForm: CustomerFolderExactBookingEditForm = {
  driverContact: "",
  driverName: "",
  driverPlateNumber: "",
  dropoffLocation: "",
  passengerName: "",
  pickupDateTime: "",
  pickupLocation: "",
  serviceType: "",
  vehicleType: "",
};

const initialCustomerFolderExactBookingEditorState: CustomerFolderExactBookingEditorState = {
  booking: null,
  bookingReference: "",
  form: initialCustomerFolderExactBookingEditForm,
  message: "Open a saved job to view, edit, or delete it by exact booking reference.",
  status: "idle",
  tone: "info",
};

const regularCustomerRequiredFields: Array<{
  field: keyof RegularCustomerBookingForm;
  label: string;
}> = [
  { field: "customerId", label: "Customer / account" },
  { field: "booker", label: "Booker / contact person" },
  { field: "passengerName", label: "Passenger name" },
  { field: "pickupDate", label: "Pickup date" },
  { field: "pickupTime", label: "Pickup time" },
  { field: "pickupLocation", label: "Pickup location" },
  { field: "dropoffLocation", label: "Drop-off location" },
  { field: "routeType", label: "Type of Service" },
  { field: "vehicleType", label: "Vehicle type" },
];

function getRegularCustomerVehicleTypeLabel(vehicleType: string) {
  return (
    regularCustomerVehicleTypeOptions.find((option) => option.value === vehicleType)?.label ?? vehicleType
  );
}

function getRegularCustomerBillingMonth(form: RegularCustomerBookingForm) {
  return /^\d{4}-\d{2}/.test(form.pickupDate) ? form.pickupDate.slice(0, 7) : form.billingMonth;
}

function safeBillingMonth(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim().slice(0, 7);

  return /^\d{4}-(0[1-9]|1[0-2])$/.test(cleaned) ? cleaned : "";
}

function billingMonthFromPickup(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim();
  const directMonth = safeBillingMonth(cleaned);

  if (directMonth) {
    return directMonth;
  }

  const parsedDate = cleaned ? new Date(cleaned) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return `${parsedDate.getUTCFullYear()}-${String(parsedDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthlyBillingMonthLabel(value: string) {
  const billingMonth = safeBillingMonth(value);

  if (!billingMonth) {
    return "Billing month needs review";
  }

  return formatInvoiceMonth(new Date(`${billingMonth}-01T00:00:00+08:00`));
}

function getMissingRegularCustomerRequiredFields(form: RegularCustomerBookingForm) {
  return regularCustomerRequiredFields.filter(({ field }) => !form[field].trim());
}

function parseHourlyRateToCents(value: string) {
  const rate = Number(value.replace(/[^0-9.]/g, ""));

  return Number.isFinite(rate) && rate > 0
    ? Math.round(rate * 100)
    : hourlyBillingDefaultRateCents;
}

function getRegularCustomerHourlyInvoiceReview(form: RegularCustomerBookingForm) {
  const isHourlyService = /hourly|disposal/i.test(form.routeType);

  if (!isHourlyService || !form.actualStartTime.trim() || !form.actualEndTime.trim()) {
    return null;
  }

  const rateCents = parseHourlyRateToCents(form.ratePerHour);
  const calculation = calculateHourlyInvoiceAmountCents(
    form.actualStartTime,
    form.actualEndTime,
    rateCents,
  );

  if (!calculation) {
    return null;
  }

  const billableHours = calculation.billableMinutes / hourlyBillingUnitMinutes;
  const billableHoursLabel =
    billableHours === 1 ? "1 billable hour" : `${billableHours} billable hours`;
  const amountLabel = formatInvoiceAmount(calculation.amountCents);
  const rateLabel = `${formatInvoiceAmount(calculation.rateCents)}/hr`;
  const billingBreakdown = `${form.actualStartTime} to ${form.actualEndTime}: ${calculation.actualMinutes} actual min / ${calculation.billableMinutes} billable min (${billableHoursLabel}) at ${rateLabel}. ${hourlyBillingGraceRuleText}`;

  return {
    amountCents: calculation.amountCents,
    amountLabel,
    billingBreakdown,
    invoiceLineDescription: `Hourly ${form.actualStartTime}-${form.actualEndTime} | ${calculation.actualMinutes} actual min | ${calculation.billableMinutes} billable min | ${rateLabel}`,
  };
}

function isHourlyCustomerInvoiceRow(row: UnbilledCustomerRow) {
  return /hourly|disposal/i.test(
    `${row.service} ${row.statusLabel} ${row.invoiceLineDescription ?? ""} ${row.billingBreakdown ?? ""}`,
  );
}

function validCustomerInvoiceDriverTimingReference(reference: string) {
  const trimmedReference = reference.trim();

  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(trimmedReference)
    ? trimmedReference
    : "";
}

const customerInvoiceLineDescriptionMaxLength = 500;

function customerInvoiceCardPaymentNote(cardPaymentEnabled: boolean, cardFeeApplies: boolean) {
  if (!cardPaymentEnabled) {
    return "";
  }

  return cardFeeApplies
    ? "Card payment available on request. A 10% card processing fee applies when the customer chooses card payment."
    : "Card payment available on request.";
}

function appendCustomerInvoiceCardPaymentNote(
  description: string,
  cardPaymentEnabled: boolean,
  cardFeeApplies: boolean,
) {
  const note = customerInvoiceCardPaymentNote(cardPaymentEnabled, cardFeeApplies);

  if (!note) {
    return description;
  }

  const suffix = ` ${note}`;
  const fullDescription = `${description}${suffix}`;

  if (fullDescription.length <= customerInvoiceLineDescriptionMaxLength) {
    return fullDescription;
  }

  const availableDescriptionLength = Math.max(
    40,
    customerInvoiceLineDescriptionMaxLength - suffix.length - 4,
  );

  return `${description.slice(0, availableDescriptionLength).trim()}...${suffix}`;
}

const plainInvoiceMaxLineItems = 4;

function plainInvoiceLineItemRows(form: PlainInvoiceForm) {
  return [
    {
      amount: form.amount,
      lineDescription: form.lineDescription,
      required: true,
      rowNumber: 1,
    },
    ...form.lineItems.slice(0, plainInvoiceMaxLineItems - 1).map((item, index) => ({
      amount: item.amount,
      lineDescription: item.lineDescription,
      required: false,
      rowNumber: index + 2,
    })),
  ];
}

function plainInvoiceLineItemHasContent(row: {
  amount: string;
  lineDescription: string;
  required: boolean;
}) {
  return row.required || Boolean(row.amount.trim()) || Boolean(row.lineDescription.trim());
}

function plainInvoiceLineItemValidationMessage(form: PlainInvoiceForm) {
  for (const row of plainInvoiceLineItemRows(form)) {
    if (!plainInvoiceLineItemHasContent(row)) {
      continue;
    }

    if (!row.lineDescription.trim()) {
      return `Enter line item ${row.rowNumber} description before previewing Create Invoice.`;
    }

    if (!parseInvoiceAmountToCents(row.amount)) {
      return `Enter line item ${row.rowNumber} amount before previewing Create Invoice.`;
    }
  }

  return "";
}

function plainInvoiceLineItemsFromForm(
  form: PlainInvoiceForm,
  options: { includeCardPaymentNote?: boolean } = {},
) {
  const lineItems = plainInvoiceLineItemRows(form)
    .filter(plainInvoiceLineItemHasContent)
    .map((row) => {
      const amountCents = parseInvoiceAmountToCents(row.amount) || 0;

      return {
        amountCents,
        amountLabel: formatInvoiceAmount(amountCents),
        description: row.lineDescription.trim(),
      };
    });

  if (options.includeCardPaymentNote && lineItems.length > 0) {
    const lastLineItem = lineItems[lineItems.length - 1];
    lineItems[lineItems.length - 1] = {
      ...lastLineItem,
      description: appendCustomerInvoiceCardPaymentNote(
        lastLineItem.description,
        form.cardPaymentEnabled,
        form.cardFeeApplies,
      ),
    };
  }

  return lineItems;
}

function plainInvoiceTotalAmountCents(form: PlainInvoiceForm) {
  return plainInvoiceLineItemsFromForm(form).reduce(
    (total, item) => total + item.amountCents,
    0,
  );
}

function customerInvoiceCardPaymentPreviewLabel(
  cardPaymentEnabled: boolean,
  cardFeeApplies: boolean,
) {
  if (!cardPaymentEnabled) {
    return "Off";
  }

  return cardFeeApplies ? "Enabled, 10% fee note included" : "Enabled, no fee note";
}

function customerBillingDocumentLabel(documentType: CustomerBillingDocumentType) {
  if (documentType === "credit_note") {
    return "Credit Note";
  }

  if (documentType === "quotation") {
    return "Quotation";
  }

  return "Invoice";
}

function customerBillingDocumentActionLabel() {
  return "Issue";
}

const plainInvoiceDraftActionKey = "plain-invoice-draft";
const plainInvoiceEmailActionKey = "plain-invoice-email";
const plainInvoiceIssueActionKey = "plain-invoice-issue";

function plainInvoiceDefaultReference() {
  return `ADHOC-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
}

function plainInvoiceInitialForm(): PlainInvoiceForm {
  return {
    amount: "",
    billToEmail: "",
    billToName: "",
    bookerId: null,
    bookingReference: "",
    cardFeeApplies: false,
    cardPaymentEnabled: false,
    crmCustomerId: "",
    crmCustomerName: "",
    dueDateIso: invoiceDateInputDaysFromNow(7),
    isPaid: false,
    lineItems: [],
    lineDescription: "",
    reference: plainInvoiceDefaultReference(),
    route: "",
    service: "Ad hoc service",
  };
}

function plainInvoiceSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function plainInvoiceCustomerId(reference: string, billToName: string) {
  const slug = plainInvoiceSlug(reference) || plainInvoiceSlug(billToName) || "manual";

  return `plain-invoice:${slug}`.slice(0, 160);
}

function getCustomerInvoiceRowCalculatedAmount(
  row: UnbilledCustomerRow,
): CustomerInvoiceCalculatedAmount | null {
  const amountCents = parseInvoiceAmountToCents(row.amount);

  if (!amountCents) {
    return null;
  }

  return {
    amountCents,
    billingBreakdown: row.billingBreakdown ?? "",
    invoiceLineDescription:
      row.invoiceLineDescription ?? `${row.service} - ${row.reference} - ${row.route}`,
    sourceLabel: "Selected unbilled row",
  };
}

function getCustomerInvoiceDriverActualTimeCalculatedAmount(
  row: UnbilledCustomerRow,
  summary: CustomerInvoiceDriverActualTimeSummary | null,
): CustomerInvoiceCalculatedAmount | null {
  if (!isHourlyCustomerInvoiceRow(row) || summary?.actual_time_status !== "complete") {
    return null;
  }

  const actualMinutes =
    typeof summary.dsp_total_minutes === "number" && Number.isFinite(summary.dsp_total_minutes)
      ? Math.round(summary.dsp_total_minutes)
      : null;
  const billableMinutes = calculateHourlyBillableMinutes(actualMinutes);

  if (actualMinutes === null || actualMinutes <= 0 || billableMinutes === null) {
    return null;
  }

  const billableHours = billableMinutes / hourlyBillingUnitMinutes;
  const billableHoursLabel =
    billableHours === 1 ? "1 billable hour" : `${billableHours} billable hours`;
  const amountCents = Math.round(billableHours * hourlyBillingDefaultRateCents);
  const rateLabel = `${formatInvoiceAmount(hourlyBillingDefaultRateCents)}/hr`;

  return {
    amountCents,
    billingBreakdown: `Driver JC timing: ${actualMinutes} actual min / ${billableMinutes} billable min (${billableHoursLabel}) at ${rateLabel}. ${hourlyBillingGraceRuleText}`,
    invoiceLineDescription: `Driver JC actual time | ${actualMinutes} actual min | ${billableMinutes} billable min | ${rateLabel}`,
    sourceLabel: "Driver JC timing",
  };
}

function regularCustomerBookingFeedbackClass(tone: RegularCustomerBookingFeedbackTone) {
  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }

  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function cleanCustomerFolderText(value: unknown, maxLength = 1000) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();

  return cleaned ? cleaned.slice(0, maxLength) : "";
}

function customerFolderStatusToken(value: unknown) {
  return cleanCustomerFolderText(value, 80)
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function customerFolderExactBookingReference(booking: CustomerFolderExactBookingRecord | null | undefined) {
  return cleanCustomerFolderText(booking?.booking_reference, 160);
}

function customerFolderExactBookingId(booking: CustomerFolderExactBookingRecord | null | undefined) {
  const id = booking?.id;

  if (typeof id === "number" && Number.isSafeInteger(id)) {
    return String(id);
  }

  return cleanCustomerFolderText(id, 120);
}

function customerFolderExactBookingPickupDateTime(booking: CustomerFolderExactBookingRecord | null | undefined) {
  return cleanCustomerFolderText(booking?.pickup_at, 120) || cleanCustomerFolderText(booking?.pickup_datetime, 120);
}

function customerFolderExactBookingStatusLabel(booking: CustomerFolderExactBookingRecord | null | undefined) {
  if (!booking) {
    return "Not loaded";
  }

  return (
    [
      booking.admin_internal_status,
      booking.customer_facing_status,
      booking.request_review_status,
      booking.change_review_status,
      booking.cancellation_review_status,
    ]
      .map((value) => cleanCustomerFolderText(value, 80))
      .filter(Boolean)
      .join(" / ") || "Status unavailable"
  );
}

function customerFolderExactBookingCanDelete(booking: CustomerFolderExactBookingRecord | null | undefined) {
  const statusTokens = [
    customerFolderStatusToken(booking?.admin_internal_status),
    customerFolderStatusToken(booking?.customer_facing_status),
  ];

  return statusTokens.includes("completed") || statusTokens.includes("cancelled");
}

function customerFolderExactBookingDeleteBlockReason(
  booking: CustomerFolderExactBookingRecord | null | undefined,
) {
  if (!booking) {
    return "Load the exact booking before delete.";
  }

  if (!customerFolderExactBookingId(booking)) {
    return "Exact booking id is missing; reload this job before delete.";
  }

  if (!customerFolderExactBookingCanDelete(booking)) {
    return "Delete is locked until this exact job is completed or cancelled.";
  }

  return "";
}

function customerFolderDateTimeInputValue(value: unknown) {
  const cleaned = cleanCustomerFolderText(value, 120);

  if (!cleaned) {
    return "";
  }

  const localInputMatch = cleaned.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);

  if (localInputMatch) {
    return `${localInputMatch[1]}T${localInputMatch[2]}`;
  }

  const parsed = new Date(cleaned);

  if (!Number.isFinite(parsed.getTime())) {
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
  const partValue = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const hour = partValue("hour") === "24" ? "00" : partValue("hour");

  return `${partValue("year")}-${partValue("month")}-${partValue("day")}T${hour}:${partValue("minute")}`;
}

function customerFolderApiDateTimeFromInput(value: string) {
  const cleaned = cleanCustomerFolderText(value, 120);
  const localInputMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);

  if (localInputMatch) {
    return `${localInputMatch[1]}-${localInputMatch[2]}-${localInputMatch[3]}T${localInputMatch[4]}:${localInputMatch[5]}:00+08:00`;
  }

  return cleaned;
}

function customerFolderExactBookingFormFromRecord(
  booking: CustomerFolderExactBookingRecord,
): CustomerFolderExactBookingEditForm {
  return {
    driverContact: cleanCustomerFolderText(booking.driver_contact, 80),
    driverName: cleanCustomerFolderText(booking.driver_name, 120),
    driverPlateNumber: cleanCustomerFolderText(booking.driver_plate_number, 80),
    dropoffLocation: cleanCustomerFolderText(booking.dropoff_location, 300),
    passengerName: cleanCustomerFolderText(booking.passenger_name, 160),
    pickupDateTime: customerFolderDateTimeInputValue(customerFolderExactBookingPickupDateTime(booking)),
    pickupLocation: cleanCustomerFolderText(booking.pickup_location, 300),
    serviceType: cleanCustomerFolderText(booking.service_type || booking.route_type, 80),
    vehicleType: cleanCustomerFolderText(booking.vehicle_type_or_category, 80),
  };
}

function customerFolderSafeRoutePointType(value: unknown, fallback: "stop" | "pickup" | "dropoff" = "stop") {
  const pointType = customerFolderStatusToken(value);

  return ["pickup", "dropoff", "stop", "waypoint", "extra_stop"].includes(pointType)
    ? (pointType as "pickup" | "dropoff" | "stop" | "waypoint" | "extra_stop")
    : fallback;
}

function customerFolderExactBookingRoutePoints(
  booking: CustomerFolderExactBookingRecord,
  form: CustomerFolderExactBookingEditForm,
) {
  const existingRoutePoints = Array.isArray(booking.route_points) ? booking.route_points : [];
  const middleRoutePoints = existingRoutePoints
    .filter((routePoint) => {
      const pointType = customerFolderSafeRoutePointType(routePoint.point_type);

      return pointType !== "pickup" && pointType !== "dropoff";
    })
    .map((routePoint, index) => {
      const location = cleanCustomerFolderText(routePoint.location_text || routePoint.location, 300);
      const pointType = customerFolderSafeRoutePointType(routePoint.point_type);

      return location
        ? {
            location: location,
            location_text: location,
            notes: cleanCustomerFolderText(routePoint.notes || routePoint.timing_note, 300) || null,
            point_type: pointType,
            sequence: index + 2,
            sequence_number: index + 2,
            timing_note: cleanCustomerFolderText(routePoint.timing_note || routePoint.notes, 300) || null,
          }
        : null;
    })
    .filter((routePoint): routePoint is NonNullable<typeof routePoint> => Boolean(routePoint));
  const pickupLocation = cleanCustomerFolderText(form.pickupLocation, 300);
  const dropoffLocation = cleanCustomerFolderText(form.dropoffLocation, 300);

  return [
    {
      location: pickupLocation,
      location_text: pickupLocation,
      notes: null,
      point_type: "pickup" as const,
      sequence: 1,
      sequence_number: 1,
      timing_note: null,
    },
    ...middleRoutePoints,
    {
      location: dropoffLocation,
      location_text: dropoffLocation,
      notes: null,
      point_type: "dropoff" as const,
      sequence: middleRoutePoints.length + 2,
      sequence_number: middleRoutePoints.length + 2,
      timing_note: null,
    },
  ];
}

function customerFolderExactBookingServiceItems(booking: CustomerFolderExactBookingRecord) {
  const allowedServiceItemTypes = new Set([
    "child_seat",
    "extra_stop",
    "waiting_time",
    "midnight_charge",
    "midnight",
  ]);

  return (Array.isArray(booking.service_items) ? booking.service_items : [])
    .map((serviceItem) => {
      const serviceItemType = customerFolderStatusToken(
        serviceItem.service_item_type || serviceItem.item_type,
      );
      const quantity = Number(serviceItem.quantity ?? 0);
      const blocksCount = Number(serviceItem.blocks_count ?? 0);

      if (
        !allowedServiceItemTypes.has(serviceItemType) ||
        (!Number.isSafeInteger(quantity) && !Number.isSafeInteger(blocksCount)) ||
        Math.max(quantity || 0, blocksCount || 0) < 1
      ) {
        return null;
      }

      return {
        blocks_count: Number.isSafeInteger(blocksCount) && blocksCount > 0 ? blocksCount : null,
        item_type: serviceItemType === "midnight_charge" ? "midnight" : serviceItemType,
        notes: cleanCustomerFolderText(serviceItem.notes, 300) || null,
        quantity: Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null,
        service_item_type: serviceItemType === "midnight" ? "midnight_charge" : serviceItemType,
      };
    })
    .filter((serviceItem): serviceItem is NonNullable<typeof serviceItem> => Boolean(serviceItem));
}

function customerFolderExactBookingPayload(
  booking: CustomerFolderExactBookingRecord,
  form: CustomerFolderExactBookingEditForm,
) {
  const bookingReference = customerFolderExactBookingReference(booking);
  const pickupDateTime = customerFolderApiDateTimeFromInput(form.pickupDateTime);
  const pickupLocation = cleanCustomerFolderText(form.pickupLocation, 300);
  const dropoffLocation = cleanCustomerFolderText(form.dropoffLocation, 300);
  const serviceType = cleanCustomerFolderText(form.serviceType || booking.service_type || booking.route_type, 80);
  const customerDisplayName = cleanCustomerFolderText(booking.customer_display_name, 160);
  const contactPhone = cleanCustomerFolderText(booking.contact_phone, 80);
  const routeSummary = [pickupLocation, dropoffLocation].filter(Boolean).join(" > ");
  const missingFields = [
    ["booking reference", bookingReference],
    ["pickup date/time", pickupDateTime],
    ["pickup location", pickupLocation],
    ["drop-off location", dropoffLocation],
    ["service type", serviceType],
    ["customer/account", customerDisplayName],
    ["contact phone", contactPhone],
  ].filter(([, value]) => !value);

  if (missingFields.length > 0) {
    return {
      error: `Cannot save from Customer Dashboard. Missing ${missingFields
        .map(([label]) => label)
        .join(", ")}; open Dispatch to repair the full booking first.`,
      ok: false as const,
    };
  }

  return {
    ok: true as const,
    payload: {
      booking: {
        admin_internal_status: cleanCustomerFolderText(booking.admin_internal_status, 80) || "Draft",
        booking_reference: bookingReference,
        cancellation_review_status: cleanCustomerFolderText(booking.cancellation_review_status, 80) || null,
        change_review_status: cleanCustomerFolderText(booking.change_review_status, 80) || null,
        contact_display_name: cleanCustomerFolderText(booking.contact_display_name, 160) || null,
        contact_email: cleanCustomerFolderText(booking.contact_email, 160) || null,
        contact_phone: contactPhone,
        customer_display_name: customerDisplayName,
        customer_facing_status: cleanCustomerFolderText(booking.customer_facing_status, 80) || "Received",
        customer_id: booking.customer_id ?? null,
        driver_contact: cleanCustomerFolderText(form.driverContact, 80) || null,
        driver_name: cleanCustomerFolderText(form.driverName, 120) || null,
        driver_plate_number: cleanCustomerFolderText(form.driverPlateNumber, 80) || null,
        dropoff_location: dropoffLocation,
        flight_no: cleanCustomerFolderText(booking.flight_no, 80) || null,
        luggage_count: Number.isSafeInteger(booking.luggage_count ?? NaN) ? booking.luggage_count ?? null : null,
        parser_source_reference: cleanCustomerFolderText(booking.parser_source_reference, 160) || null,
        passenger_name: cleanCustomerFolderText(form.passengerName, 160) || null,
        passenger_phone: cleanCustomerFolderText(booking.passenger_phone, 80) || null,
        pax_count: Number.isSafeInteger(booking.pax_count ?? NaN) ? booking.pax_count ?? null : null,
        pickup_datetime: pickupDateTime,
        pickup_location: pickupLocation,
        request_review_status: cleanCustomerFolderText(booking.request_review_status, 80) || null,
        route_summary: routeSummary || cleanCustomerFolderText(booking.route_summary, 500) || null,
        route_type: serviceType,
        service_type: serviceType,
        short_notice_review_status: cleanCustomerFolderText(booking.short_notice_review_status, 80) || null,
        source_channel:
          cleanCustomerFolderText(booking.source_channel, 80) ||
          cleanCustomerFolderText(booking.source_surface, 80) ||
          "admin-dashboard",
        source_surface:
          cleanCustomerFolderText(booking.source_surface, 80) ||
          cleanCustomerFolderText(booking.source_channel, 80) ||
          "admin-dashboard",
        vehicle_type_or_category: cleanCustomerFolderText(form.vehicleType, 80) || null,
      },
      route_points: customerFolderExactBookingRoutePoints(booking, form),
      service_items: customerFolderExactBookingServiceItems(booking),
      target_booking_reference: bookingReference,
    },
  };
}

function normalizeCustomerFolderMatch(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function customerFolderHrefFor(customerId: string | null | undefined, customerName: string | null | undefined) {
  const safeCustomerId = String(customerId ?? "").trim() || String(customerName ?? "").trim();
  const safeCustomerName = String(customerName ?? "").trim();
  const pathId = encodeURIComponent(safeCustomerId || "customer-account");
  const params = new URLSearchParams();

  if (safeCustomerName) {
    params.set("name", safeCustomerName);
  }

  return `/customers/${pathId}${params.toString() ? `?${params.toString()}` : ""}`;
}

function customerFolderHrefFromIndexRow(customer: { customerId: string; customerName: string }) {
  return customerFolderHrefFor(customer.customerId, customer.customerName);
}

function customerAdminFailureText(rawError: unknown) {
  return rawError instanceof Error
    ? String(rawError.message || "").trim().toLowerCase()
    : String(rawError ?? "").trim().toLowerCase();
}

function customerAdminReadFailureMessage(label: string, rawError: unknown) {
  const errorText = customerAdminFailureText(rawError);

  if (/not enabled|configuration|config|client_init|supabaseurl/.test(errorText)) {
    return `${label} is not enabled or configured on this server.`;
  }

  if (/failed safely|request failed|could not be completed/.test(errorText)) {
    return `${label} could not be completed. Reload the page and try again.`;
  }

  if (/forbidden|internal|admin|dispatcher|referer|origin|purpose|boundary|blocked/.test(errorText)) {
    return `${label} requires the internal admin customer surface. Reload /customers and try again.`;
  }

  if (/permission|rls|denied/.test(errorText)) {
    return `${label} was blocked by database permissions. No customer, invoice, payment, provider, or payout action ran.`;
  }

  if (/missing|required|malformed|invalid|unknown|not found/.test(errorText)) {
    return `${label} details need review before the read can complete.`;
  }

  return `${label} could not be read right now. Reload the page and try again.`;
}

function customerInvoiceActionFailureMessage(action: string, rawError: unknown) {
  const errorText = customerAdminFailureText(rawError);

  if (/recipient|allowlist|allowlisted|email.*invalid/.test(errorText)) {
    return `${action} was not sent because the recipient email is invalid or not allowlisted.`;
  }

  if (/email sending is not configured|provider.*config|resend|api key|email.*not configured/.test(errorText)) {
    return `${action} was not sent because invoice email provider settings are not configured.`;
  }

  if (/email.*failed|provider.*failure|delivery|send failed/.test(errorText)) {
    return `${action} was not sent because the email provider did not confirm delivery.`;
  }

  if (/draft.*email|can only send issued|issued documents/.test(errorText)) {
    return `${action} can only send an issued stored invoice. Issue the invoice first.`;
  }

  if (/not enabled|configuration|config|client_init|supabaseurl/.test(errorText)) {
    return `${action} is not enabled or configured on this server. No invoice number, payment, provider send, or payout was confirmed.`;
  }

  if (/pdf|download|file|artifact|bytes/.test(errorText)) {
    return `${action} PDF could not be downloaded yet. The invoice record was not changed; use PDF again after the page refreshes.`;
  }

  if (/failed safely|request failed|could not be completed/.test(errorText)) {
    return `${action} could not be completed. Reload Billing Documents before trying again; no payment, provider send, payout, or GPS action ran.`;
  }

  if (/forbidden|internal|admin|dispatcher|referer|origin|purpose|boundary|blocked/.test(errorText)) {
    return `${action} requires the internal admin customer surface. Reload /customers and try again.`;
  }

  if (/permission|rls|denied/.test(errorText)) {
    return `${action} was blocked by database permissions. No payment, provider send, payout, or GPS action ran.`;
  }

  if (/duplicate|unique|already exists|23505|already reserved/.test(errorText)) {
    return `${action} was not saved because a matching invoice record already exists. Reload Billing Documents before trying again.`;
  }

  if (/missing|required|malformed|invalid|unknown|amount|line item|due date|customer|reference/.test(errorText)) {
    return `${action} details need review before saving. Check bill-to/customer, amount, due date, reference, and line item.`;
  }

  return `${action} could not complete. Reload the page and try again; no payment, provider send, payout, or GPS action ran.`;
}

function customerFolderRowFromSavedAccount(account: RegularCustomerAccountReadRecord) {
  const customerAccount = String(account.customer_account ?? "").trim() || "Customer account";
  const customerId = String(account.customer_id ?? "").trim() || customerAccount;
  const accountScopeKey = String(account.account_scope_key ?? "").trim();
  const accountScopeLabel = String(account.account_scope_label ?? "").trim();
  const customerFolderKey =
    String(account.customer_folder_key ?? "").trim() ||
    [customerId, accountScopeKey || "booker_traveller_not_set"].join("::");

  return {
    accountScopeKey,
    accountScopeLabel,
    completedJobs: Number(account.completed_count ?? 0),
    customerFolderKey,
    customerId,
    customerName: customerAccount,
    folderHref: customerFolderHrefFor(customerId, customerAccount),
    historyRows: Number(account.saved_booking_count ?? 0),
    latestBookingReference: account.latest_booking_reference ?? null,
    latestPickupAt: account.latest_pickup_at ?? null,
    latestServiceType: account.latest_service_type ?? null,
    source: "saved-account-read" as const,
    upcomingJobs: Number(account.upcoming_count ?? 0),
  };
}

function savedBookingReference(booking: RegularCustomerSavedBookingReadRecord) {
  return String(booking.booking_reference ?? "").trim();
}

function safeCustomerFolderDispatchHandoffReference(booking: RegularCustomerSavedBookingReadRecord) {
  const reference = savedBookingReference(booking);

  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(reference) ? reference : "";
}

function customerFolderJobDispatchHref(booking: RegularCustomerSavedBookingReadRecord) {
  const bookingReference = safeCustomerFolderDispatchHandoffReference(booking);

  if (!bookingReference) {
    return "";
  }

  const customerId = cleanCustomerFolderText(booking.customer_id, 80);
  const customerName = cleanCustomerFolderText(booking.customer_account, 160) || "Customer";
  const returnParams = new URLSearchParams({ name: customerName });
  const params = new URLSearchParams({
    [customerFolderDispatchHandoffReferenceParam]: bookingReference,
    ...(customerId
      ? {
          customer_return_url: `/customers/${encodeURIComponent(customerId)}?${returnParams.toString()}`,
        }
      : {}),
    tab: customerFolderDispatchHandoffTab,
  });

  return `/?${params.toString()}`;
}

function customerFolderSavedBookingMonthKey(booking: RegularCustomerSavedBookingReadRecord) {
  return safeBillingMonth(booking.booking_month) || billingMonthFromPickup(booking.pickup_at) || "needs-review";
}

function customerFolderSavedBookingMonthLabel(key: string) {
  return key === "needs-review" ? "Date needs review" : monthlyBillingMonthLabel(key);
}

function groupCustomerFolderSavedBookingsByMonth(
  bookings: RegularCustomerSavedBookingReadRecord[],
): CustomerFolderSavedBookingMonthGroup[] {
  const groups = new Map<string, CustomerFolderSavedBookingMonthGroup>();

  bookings.forEach((booking) => {
    const key = customerFolderSavedBookingMonthKey(booking);
    const group =
      groups.get(key) ||
      ({
        bookings: [],
        key,
        label: customerFolderSavedBookingMonthLabel(key),
      } satisfies CustomerFolderSavedBookingMonthGroup);

    group.bookings.push(booking);
    groups.set(key, group);
  });

  return [...groups.values()].sort((firstGroup, secondGroup) => {
    if (firstGroup.key === "needs-review") {
      return 1;
    }

    if (secondGroup.key === "needs-review") {
      return -1;
    }

    return secondGroup.key.localeCompare(firstGroup.key);
  });
}

function savedBookingCustomerId(booking: RegularCustomerSavedBookingReadRecord) {
  return String(booking.customer_id ?? "").trim();
}

function savedBookingCloseoutIsBillingReady(
  closeout: RegularCustomerSavedBookingCloseoutRecord | undefined,
) {
  if (!closeout) {
    return false;
  }

  const completedJobStatus = String(closeout.completed_job_status ?? "").trim();

  return (
    (closeout.closeout_status === "ready_for_billing_prep" || closeout.closeout_status === "closed") &&
    (completedJobStatus === "completed" || completedJobStatus === "completion_exception") &&
    (closeout.dsp_actual_hours_readiness === "ready" ||
      closeout.dsp_actual_hours_readiness === "not_applicable") &&
    (closeout.extra_charges_readiness === "ready" ||
      closeout.extra_charges_readiness === "none") &&
    closeout.billing_prep_readiness === "ready"
  );
}

function savedBookingCloseoutBillingDispositionLabel(
  closeout: RegularCustomerSavedBookingCloseoutRecord | undefined,
) {
  if (String(closeout?.completed_job_status ?? "").trim() !== "completion_exception") {
    return null;
  }

  const closeoutSummary = String(closeout?.safe_closeout_context?.closeout_summary ?? "").toLowerCase();

  if (/no[-\s]?show/.test(closeoutSummary)) {
    return "Customer no-show";
  }

  if (/late\s+cancellation|late\s+cancel/.test(closeoutSummary)) {
    return "Late cancellation";
  }

  return "Closeout exception";
}

function savedBookingDateLabel(booking: RegularCustomerSavedBookingReadRecord) {
  const pickupAt = String(booking.pickup_at ?? "").trim();
  const parsedPickupAt = pickupAt ? new Date(pickupAt) : null;

  if (parsedPickupAt && !Number.isNaN(parsedPickupAt.getTime())) {
    return formatInvoiceDate(parsedPickupAt);
  }

  return String(booking.booking_month ?? "").trim() || "Date TBC";
}

function savedBookingDisplayText(value: string | null | undefined, fallback = "Not available") {
  const cleaned = String(value ?? "").trim();

  return cleaned || fallback;
}

function savedBookingCustomerChargeNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function savedBookingCustomerBillingAmountCents(
  booking: RegularCustomerSavedBookingReadRecord,
) {
  const savedAmount = savedBookingCustomerChargeNumber(booking.customer_price_amount);

  if (savedAmount !== null) {
    return Math.round(savedAmount * 100);
  }

  const overrideRate = savedBookingCustomerChargeNumber(booking.customer_rate_override);

  if (overrideRate !== null) {
    return Math.round(overrideRate * 100);
  }

  const baseRate = savedBookingCustomerChargeNumber(booking.customer_rate);

  if (baseRate === null) {
    return null;
  }

  const midnightSurcharge = savedBookingCustomerChargeNumber(booking.midnight_surcharge) ?? 0;
  const extraStopCount = savedBookingCustomerChargeNumber(booking.extra_stop_count) ?? 0;
  const extraStopSurcharge = savedBookingCustomerChargeNumber(booking.extra_stop_surcharge) ?? 0;
  const childSeatCount =
    booking.child_seat_required === false
      ? 0
      : (savedBookingCustomerChargeNumber(booking.child_seat_count) ?? 0);
  const childSeatSurcharge = savedBookingCustomerChargeNumber(
    booking.child_seat_customer_surcharge,
  ) ?? 0;

  return Math.round(
    (baseRate + midnightSurcharge + extraStopCount * extraStopSurcharge + childSeatCount * childSeatSurcharge) * 100,
  );
}

function savedBookingCustomerBillingSourceLabel(booking: RegularCustomerSavedBookingReadRecord) {
  const source = String(booking.pricing_source ?? "").trim();

  if (source) {
    return source;
  }

  if (savedBookingCustomerChargeNumber(booking.customer_rate_override) !== null) {
    return "saved customer override";
  }

  if (savedBookingCustomerChargeNumber(booking.customer_rate) !== null) {
    return "saved Prestige rate";
  }

  return "saved booking";
}

function compactCustomerBookingReference(value: string | null | undefined, fallback = "Not available") {
  const reference = savedBookingDisplayText(value, "");

  if (!reference) {
    return fallback;
  }

  if (reference.length <= 16) {
    return reference;
  }

  const structuredReference = reference.match(/^([A-Za-z]+)-(\d{8})(\d{4,6})(?:-([A-Za-z0-9]{4,10}))?$/);

  if (structuredReference) {
    const prefix = structuredReference[1].toUpperCase();
    const suffix = structuredReference[4]?.toUpperCase() || reference.slice(-6).toUpperCase();

    return `${prefix}-${suffix}`;
  }

  const prefix = reference.split("-")[0]?.slice(0, 6).toUpperCase() || reference.slice(0, 6);

  return `${prefix}-${reference.slice(-6)}`;
}

function customerFolderLatestPickupDisplay(value: string | null | undefined) {
  return formatSingaporePickupDisplay(value);
}

function customerFolderLatestSummary(customer: {
  latestBookingReference?: string | null;
  latestPickupAt?: string | null;
  latestServiceType?: string | null;
}) {
  const summaryParts = [
    customerFolderLatestPickupDisplay(customer.latestPickupAt),
    savedBookingDisplayText(customer.latestServiceType, ""),
    compactCustomerBookingReference(customer.latestBookingReference, ""),
  ].filter(Boolean);

  return summaryParts.join(" | ") || "Latest saved service not available";
}

function savedBookingCountLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function savedBookingStatusLabel(booking: RegularCustomerSavedBookingReadRecord) {
  return (
    [booking.admin_status, booking.customer_status]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" / ") || "Status unavailable"
  );
}

function savedBookingUnbilledRow(
  booking: RegularCustomerSavedBookingReadRecord,
  closeout: RegularCustomerSavedBookingCloseoutRecord | undefined,
): UnbilledCustomerRow | null {
  if (!savedBookingCloseoutIsBillingReady(closeout)) {
    return null;
  }

  const reference = savedBookingReference(booking);

  if (!reference) {
    return null;
  }

  const billingMonth = safeBillingMonth(booking.booking_month) || billingMonthFromPickup(booking.pickup_at);
  const customerId = savedBookingCustomerId(booking);

  if (!customerId) {
    return null;
  }

  const customerName =
    String(booking.customer_account ?? "").trim() ||
    customerId;
  const accountScopeKey = String(booking.account_scope_key ?? "").trim();
  const accountScopeLabel = String(booking.account_scope_label ?? "").trim();
  const needsScopeReview = customerBillingScopeNeedsReview(accountScopeKey, accountScopeLabel);
  const service = String(booking.service_type ?? "").trim() || "Completed transfer";
  const closeoutDisposition = savedBookingCloseoutBillingDispositionLabel(closeout);
  const billableServiceLabel = closeoutDisposition || service;
  const billingAmountCents = savedBookingCustomerBillingAmountCents(booking);
  const billingAmountLabel = billingAmountCents ? formatInvoiceAmount(billingAmountCents) : "";
  const billingSourceLabel = savedBookingCustomerBillingSourceLabel(booking);
  const amountReadyBreakdown = billingAmountLabel
    ? `${closeoutDisposition || "Closeout ready"} from saved booking. ${billingAmountLabel} copied from ${billingSourceLabel}; review before previewing or issuing.`
    : "";

  return {
    accountScopeKey,
    accountScopeLabel,
    amount: billingAmountLabel || "Draft amount not set",
    billingMonth,
    billingMonthLabel: monthlyBillingMonthLabel(billingMonth),
    billingBreakdown:
      amountReadyBreakdown ||
      (closeoutDisposition
        ? `${closeoutDisposition} closeout ready from saved booking. Enter the approved customer amount before previewing or issuing.`
        : "Closeout ready from saved booking. Enter the approved customer amount before previewing or issuing."),
    customerFolderHref: "",
    customerId,
    companyId: booking.company_id ?? null,
    bookerId: booking.booker_id ?? null,
    customerName,
    dateLabel: savedBookingDateLabel(booking),
    invoiceLineDescription: `${billableServiceLabel} - ${reference}`,
    key: `saved-closeout-unbilled:${reference}`,
    needsScopeReview,
    reference,
    route: "Saved booking route in Dispatch",
    service: billableServiceLabel,
    statusLabel: billingAmountLabel
      ? closeoutDisposition
        ? "Closeout exception ready / amount ready"
        : "Closeout ready / amount ready"
      : closeoutDisposition
        ? "Closeout exception ready / amount needed"
        : "Closeout ready / amount needed",
  };
}

function customerBillingScopeNeedsReview(accountScopeKey: string, accountScopeLabel: string) {
  const normalizedKey = normalizeCustomerFolderMatch(accountScopeKey);
  const normalizedLabel = accountScopeLabel.toLowerCase();

  return (
    !normalizedKey ||
    normalizedKey === normalizeCustomerFolderMatch("booker_traveller_not_set") ||
    (!normalizedLabel.includes("passenger:") && !normalizedLabel.includes("traveller:"))
  );
}

function hasMockBalanceDue(balanceDue: string) {
  return Number(balanceDue.replace(/[^\d.-]/g, "")) > 0;
}

function parseMockCurrency(value: string) {
  return Number(value.replace(/[^\d.-]/g, ""));
}

function formatMockCurrency(value: number) {
  return `$${Math.max(0, Math.round(value)).toLocaleString("en-US")}`;
}

function getMockPartialBalance(balanceDue: string) {
  const currentBalance = parseMockCurrency(balanceDue);

  if (!Number.isFinite(currentBalance) || currentBalance <= 1) {
    return balanceDue;
  }

  return formatMockCurrency(currentBalance / 2);
}

function parseMockDateValue(dateLabel: string) {
  const match = dateLabel.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);

  if (!match) {
    return Number.POSITIVE_INFINITY;
  }

  const [, day, monthLabel, year] = match;
  const monthIndex = mockMonthIndexes[monthLabel];

  if (monthIndex === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.UTC(Number(year), monthIndex, Number(day));
}

function invoiceDateLabelToIso(dateLabel: string) {
  const match = dateLabel.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);

  if (!match) {
    return invoiceDateInputDaysFromNow(7);
  }

  const [, day, monthLabel, year] = match;
  const monthIndex = mockMonthIndexes[monthLabel];

  if (monthIndex === undefined) {
    return invoiceDateInputDaysFromNow(7);
  }

  return [
    year,
    String(monthIndex + 1).padStart(2, "0"),
    String(Number(day)).padStart(2, "0"),
  ].join("-");
}

function getMockDaysUntil(dateLabel: string) {
  const dateValue = parseMockDateValue(dateLabel);

  if (!Number.isFinite(dateValue)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.round((dateValue - mockTodayDateValue) / 86_400_000);
}

function getOutstandingAgingBucket(dueDate: string) {
  const overdueDays = Math.max(0, -getMockDaysUntil(dueDate));

  if (overdueDays > 90) {
    return "90+";
  }

  if (overdueDays > 60) {
    return "61-90";
  }

  if (overdueDays > 30) {
    return "31-60";
  }

  return "0-30";
}

function getOutstandingDueStatusLabel(dueDate: string) {
  const daysUntil = getMockDaysUntil(dueDate);

  if (!Number.isFinite(daysUntil)) {
    return `Due: ${dueDate}`;
  }

  if (daysUntil < 0) {
    return `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? "" : "s"} overdue`;
  }

  if (daysUntil === 0) {
    return "Due today";
  }

  return `Due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
}

function getMockLastFollowUpDate(invoiceNumber: string) {
  const followUpDates: Record<string, string> = {
    "RITZ-0003": "20 May 2026",
    "RITZ-0004": "21 May 2026",
    "UBS-0003": "24 May 2026",
    "UBS-0004": "24 May 2026",
    "VIP-0003": "25 May 2026",
  };

  return followUpDates[invoiceNumber] ?? "Not logged yet";
}

function getOutstandingNextActionLabel(item: VisibleOutstandingPaymentReviewItem | OutstandingPaymentReviewItem) {
  if (item.paymentStatus === "Overdue") {
    return "Call accounts today";
  }

  if (item.paymentStatus === "Partially Paid") {
    return "Confirm remaining balance";
  }

  if (item.isMonthlyAccount) {
    return "Group for billing review";
  }

  if (item.paymentStatus === "Invoice Sent") {
    return "Check expected payment";
  }

  return "Manual follow-up";
}

function isOutstandingDueSoon(item: VisibleOutstandingPaymentReviewItem) {
  const daysUntil = getMockDaysUntil(item.dueOrFollowUpDate);

  return daysUntil >= 0 && daysUntil <= 7;
}

function isOutstandingNeedsFollowUp(item: VisibleOutstandingPaymentReviewItem) {
  return (
    item.paymentStatus === "Overdue" ||
    item.paymentStatus === "Partially Paid" ||
    item.paymentStatus === "Invoice Sent" ||
    item.paymentStatus === "Unpaid" ||
    item.isMonthlyAccount
  );
}

function getOutstandingPaymentReason(customer: MockCustomer, booking: MockCustomerBooking) {
  if (booking.paymentStatus === "Overdue") {
    return "Due date passed + balance due = Overdue";
  }

  if (booking.paymentStatus === "Partially Paid") {
    return "Partial payment keeps balance visible";
  }

  if (customer.accountType === "Monthly Account") {
    return "Monthly account can be grouped later into statement";
  }

  return "Completed job + balance due = Outstanding";
}

function getCollectionFollowUpReason(item: OutstandingPaymentReviewItem) {
  if (item.paymentStatus === "Overdue") {
    return "Overdue balance needs collection follow-up";
  }

  if (item.paymentStatus === "Partially Paid") {
    return "Partial payment still has balance due";
  }

  if (item.isMonthlyAccount) {
    return "Monthly account can be grouped into statement later";
  }

  if (item.paymentStatus === "Invoice Sent") {
    return "Invoice sent but balance remains due";
  }

  return "Unpaid balance needs collection follow-up";
}

function getMockStatementPreviewGroups(items: VisibleOutstandingPaymentReviewItem[]) {
  return mockCustomers
    .filter((customer) => customer.accountType === "Monthly Account")
    .map((customer) => {
      const statementItems = items.filter((item) => item.customerId === customer.id && item.isMonthlyAccount);

      return {
        customerId: customer.id,
        customerName: customer.companyName,
        invoicePrefix: customer.invoicePrefix,
        items: statementItems,
        key: customer.id,
        periodLabel: "May 2026 billing cycle (mock preview)",
        statementTotal: formatMockCurrency(
          statementItems.reduce((total, item) => total + parseMockCurrency(item.balanceDue), 0),
        ),
      };
    })
    .filter((group) => group.items.length > 0);
}

const outstandingPaymentReviewItems: OutstandingPaymentReviewItem[] = mockCustomers.flatMap((customer) =>
  customer.bookingHistory
    .filter(
      (booking) =>
        outstandingPaymentStatuses.has(booking.paymentStatus) &&
        hasMockBalanceDue(booking.balanceDue),
    )
    .map((booking) => {
      const dueOrFollowUpDate =
        customer.invoices.find((invoice) => invoice.invoiceNumber === booking.invoiceNumber)?.dueDate ??
        customer.nextFollowUpDate;
      const outstandingBookingsCount = customer.bookingHistory.filter(
        (customerBooking) =>
          outstandingPaymentStatuses.has(customerBooking.paymentStatus) &&
          hasMockBalanceDue(customerBooking.balanceDue),
      ).length;
      const searchText = [
        customer.companyName,
        customer.invoicePrefix,
        customer.paymentStatusSummary,
        customer.contacts.map((contact) => `${contact.name} ${contact.value}`).join(" "),
        booking.invoiceNumber,
        booking.route,
        booking.service,
        booking.paymentStatus,
      ]
        .join(" ")
        .toLowerCase();

      return {
        agingBucket: getOutstandingAgingBucket(dueOrFollowUpDate),
        balanceDue: booking.balanceDue,
        customerId: customer.id,
        customerName: customer.companyName,
        dueOrFollowUpDate,
        dueStatusLabel: getOutstandingDueStatusLabel(dueOrFollowUpDate),
        followUpDate: customer.nextFollowUpDate,
        invoiceNumber: booking.invoiceNumber,
        isMonthlyAccount: customer.accountType === "Monthly Account",
        key: `${customer.id}:${booking.invoiceNumber}`,
        lastFollowUpDate: getMockLastFollowUpDate(booking.invoiceNumber),
        outstandingBookingsCount,
        paymentStatus: booking.paymentStatus,
        reason: getOutstandingPaymentReason(customer, booking),
        searchText,
      };
    }),
);

function displayLocalInvoice(invoice: CustomerLocalInvoiceRecord): CustomerDisplayedInvoiceRecord {
  return {
    ...invoice,
    emailDeliveryStatus: "not_sent",
    pdfFilename: `${invoice.invoiceNumber}.pdf`,
    storageSource: "local",
  };
}

function isArchivedCustomerTestInvoiceRecord(invoice: CustomerDisplayedInvoiceRecord) {
  return (
    invoice.invoiceNumber === approvedCustomerTestInvoiceArchiveTarget.invoiceNumber &&
    invoice.reference === approvedCustomerTestInvoiceArchiveTarget.bookingReference &&
    invoice.documentState === "draft" &&
    typeof invoice.creditNoteReason === "string" &&
    invoice.creditNoteReason.includes("Archived test artifact")
  );
}

function isApprovedCustomerTestInvoiceArchiveCandidate(invoice: CustomerDisplayedInvoiceRecord) {
  return (
    invoice.storageSource === "server" &&
    invoice.invoiceNumber === approvedCustomerTestInvoiceArchiveTarget.invoiceNumber &&
    invoice.reference === approvedCustomerTestInvoiceArchiveTarget.bookingReference &&
    invoice.customerId === approvedCustomerTestInvoiceArchiveTarget.customerId &&
    invoice.customerName === approvedCustomerTestInvoiceArchiveTarget.customerName &&
    invoice.documentState !== "draft" &&
    (invoice.documentType || "invoice") === "invoice" &&
    invoice.status === "Unpaid"
  );
}

function activeCustomerInvoiceRecords(records: CustomerDisplayedInvoiceRecord[]) {
  return records.filter((record) => !isArchivedCustomerTestInvoiceRecord(record));
}

function mergeDisplayedInvoices(
  primaryRecords: CustomerDisplayedInvoiceRecord[],
  fallbackRecords: CustomerDisplayedInvoiceRecord[],
) {
  const records = new Map<string, CustomerDisplayedInvoiceRecord>();

  [...fallbackRecords, ...primaryRecords].forEach((record) => {
    records.set(record.invoiceNumber, record);
  });

  return [...records.values()].sort((firstRecord, secondRecord) =>
    secondRecord.issueDateIso.localeCompare(firstRecord.issueDateIso),
  );
}

function safeInvoiceApiRecords(value: unknown) {
  return Array.isArray(value) ? (value as CustomerDisplayedInvoiceRecord[]) : [];
}

function invoiceDraftRecordFromDisplayedInvoice(invoice: CustomerDisplayedInvoiceRecord): CustomerInvoiceDraftRecord {
  return {
    amountCents: invoice.amountCents,
    amountLabel: invoice.amountLabel,
    cardFeeApplies: false,
    cardPaymentEnabled: false,
    createdAtLabel: invoice.issueDateLabel,
    customerName: invoice.customerName,
    documentNumber: invoice.invoiceNumber,
    documentType: invoice.documentType || "invoice",
    draftId: invoice.invoiceNumber,
    dueDateIso: "",
    dueDateLabel: invoice.dueDateLabel,
    folder: invoice.status,
    lineDescription: invoice.lineItems[0]?.description || invoice.service,
    reference: invoice.reference,
    route: invoice.route,
    service: invoice.service,
    storageSource: invoice.storageSource,
  };
}

function normalizedInvoiceReference(value: string) {
  return value.trim().toLowerCase();
}

function invoicedReferenceSetFrom(invoices: CustomerDisplayedInvoiceRecord[]) {
  const references = new Set<string>();

  invoices.forEach((invoice) => {
    if ((invoice.documentType || "invoice") !== "invoice") {
      return;
    }

    const reference = normalizedInvoiceReference(invoice.reference);

    if (reference) {
      references.add(reference);
    }
  });

  return references;
}

function downloadBrowserBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export default function MockCustomerDashboardPage() {
  const customerInvoicePrepPanelRef = useRef<HTMLDivElement | null>(null);
  const plainInvoicePanelRef = useRef<HTMLDivElement | null>(null);
  const plainInvoiceCrmRequestSequenceRef = useRef(0);
  const plainInvoiceSavedBookingRequestSequenceRef = useRef(0);
  const customerInvoicePrepRowKeyRef = useRef("");
  const customerFolderUrlHandoffRef = useRef("");
  const customerFolderReturnHrefRef = useRef("");
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFolderFinderPage, setCustomerFolderFinderPage] = useState(1);
  const [customerFolderFinderSelectedId, setCustomerFolderFinderSelectedId] = useState("");
  const [customerFolderFinderDropdownOpen, setCustomerFolderFinderDropdownOpen] = useState(false);
  const [plainInvoiceCrmPickerOpen, setPlainInvoiceCrmPickerOpen] = useState(false);
  const [selectedPlainInvoiceCrmFolderKey, setSelectedPlainInvoiceCrmFolderKey] = useState("");
  const [plainInvoiceCrmSearchTerm, setPlainInvoiceCrmSearchTerm] = useState("");
  const [regularCustomerBookingForm, setRegularCustomerBookingForm] = useState<RegularCustomerBookingForm>(
    initialRegularCustomerBookingForm,
  );
  const [regularCustomerBookingFeedback, setRegularCustomerBookingFeedback] = useState(
    "Mock/local form foundation only. Submit creates a local preview beside this button.",
  );
  const [regularCustomerBookingFeedbackTone, setRegularCustomerBookingFeedbackTone] =
    useState<RegularCustomerBookingFeedbackTone>("info");
  const [regularCustomerBookingClearFeedback, setRegularCustomerBookingClearFeedback] = useState(
    "Clear only resets this local draft form and preview.",
  );
  const [regularCustomerBookingClearFeedbackTone, setRegularCustomerBookingClearFeedbackTone] =
    useState<RegularCustomerBookingFeedbackTone>("info");
  const [regularCustomerMockSaveFeedback, setRegularCustomerMockSaveFeedback] = useState(
    "Future real save placeholder only. Mock/local only: no booking save, customer folder link write, Supabase call, invoice number, payment/bank action, notification, or calendar action.",
  );
  const [regularCustomerMockSaveFeedbackTone, setRegularCustomerMockSaveFeedbackTone] =
    useState<RegularCustomerBookingFeedbackTone>("info");
  const [regularCustomerMockSaveReview, setRegularCustomerMockSaveReview] =
    useState<RegularCustomerMockSaveReview | null>(null);
  const [regularCustomerMockSaveReviewFeedback, setRegularCustomerMockSaveReviewFeedback] = useState(
    "Valid mock save clicks show a local confirmation review here. No save, link, audit, invoice, payment, bank, notification, calendar, or Supabase action is active.",
  );
  const [regularCustomerMockSaveReviewFeedbackTone, setRegularCustomerMockSaveReviewFeedbackTone] =
    useState<RegularCustomerBookingFeedbackTone>("info");
  const [regularCustomerParserHelperText, setRegularCustomerParserHelperText] = useState("");
  const [regularCustomerParserHelperFeedback, setRegularCustomerParserHelperFeedback] = useState(
    "Paste free-text booking details here later. Mock/local only: no OpenAI/ChatGPT API call, no Supabase save, and no booking created.",
  );
  const [regularCustomerBookingMissingFields, setRegularCustomerBookingMissingFields] = useState<
    Array<keyof RegularCustomerBookingForm>
  >([]);
  const [regularCustomerBookingPreview, setRegularCustomerBookingPreview] =
    useState<RegularCustomerBookingPreview | null>(null);
  const [regularCustomerBookingListItems, setRegularCustomerBookingListItems] = useState<
    RegularCustomerBookingListItem[]
  >([]);
  const [regularCustomerBookingListFilters, setRegularCustomerBookingListFilters] =
    useState<RegularCustomerBookingListFilters>(initialRegularCustomerBookingListFilters);
  const [regularCustomerBookingListFilterFeedback, setRegularCustomerBookingListFilterFeedback] = useState(
    "Mock/local list filters only affect rows on this page. Nothing is saved or sent.",
  );
  const [regularCustomerBookingListActionFeedback, setRegularCustomerBookingListActionFeedback] = useState<
    Record<string, RegularCustomerBookingListActionFeedback>
  >({});
  const [regularCustomerBillingQuickFilter, setRegularCustomerBillingQuickFilter] = useState(
    regularCustomerBillingQuickFilterAllValue,
  );
  const [regularCustomerBillingDetailPreviewId, setRegularCustomerBillingDetailPreviewId] = useState("");
  const [regularCustomerDraftInvoicePreview, setRegularCustomerDraftInvoicePreview] =
    useState<RegularCustomerDraftInvoicePreview | null>(null);
  const [regularCustomerDraftInvoiceClearControlVisible, setRegularCustomerDraftInvoiceClearControlVisible] =
    useState(false);
  const [regularCustomerDraftInvoiceSnapshotStale, setRegularCustomerDraftInvoiceSnapshotStale] =
    useState(false);
  const [regularCustomerDraftInvoiceFeedback, setRegularCustomerDraftInvoiceFeedback] = useState(
    "Create a mock draft invoice preview from the currently visible local mock rows. Nothing is saved, numbered, generated, or sent.",
  );
  const [regularCustomerDraftInvoiceFeedbackTone, setRegularCustomerDraftInvoiceFeedbackTone] =
    useState<RegularCustomerBookingFeedbackTone>("info");
  const [regularCustomerAccountReadState, setRegularCustomerAccountReadState] =
    useState<RegularCustomerAccountReadState>({
      accounts: [],
      message: "Load saved customer accounts from the guarded read path when needed.",
      status: "idle",
      summary: null,
      tone: "info",
    });
  const regularCustomerAccountSearchRequestRef = useRef(0);
  const [plainInvoiceCrmAccountReadState, setPlainInvoiceCrmAccountReadState] =
    useState<RegularCustomerAccountReadState>({
      accounts: [],
      message: "Load CRM accounts or type an account name prefix to search 10 at a time.",
      status: "idle",
      summary: null,
      tone: "info",
    });
  const [regularCustomerSavedBookingReadState, setRegularCustomerSavedBookingReadState] =
    useState<RegularCustomerSavedBookingReadState>({
      message: "Select a customer/account, then load saved bookings from the guarded admin read path.",
      savedBookings: [],
      status: "idle",
      summary: null,
      tone: "info",
    });
  const [customerFolderJobViewState, setCustomerFolderJobViewState] =
    useState<CustomerFolderJobViewState>({
      customerId: "",
      customerName: "",
      message: "Open a customer folder to read that exact saved account's jobs.",
      savedBookings: [],
      status: "idle",
      summary: null,
      tone: "info",
    });
  const [expandedCustomerFolderJobReference, setExpandedCustomerFolderJobReference] = useState("");
  const [selectedCustomerInvoiceDetailKey, setSelectedCustomerInvoiceDetailKey] = useState("");
  const [customerFolderExactBookingEditorState, setCustomerFolderExactBookingEditorState] =
    useState<CustomerFolderExactBookingEditorState>(initialCustomerFolderExactBookingEditorState);
  const [
    regularCustomerSavedBookingBillingReadinessState,
    setRegularCustomerSavedBookingBillingReadinessState,
  ] = useState<RegularCustomerSavedBookingBillingReadinessState>({
    closeoutsByReference: {},
    message: "Closeout billing readiness loads after saved bookings are loaded.",
    status: "idle",
    tone: "info",
  });
  const [mockPaymentEvents, setMockPaymentEvents] = useState<MockPaymentEvent[]>([]);
  const [mockFollowUpEvents, setMockFollowUpEvents] = useState<MockFollowUpEvent[]>([]);
  const [mockStatementPreviewEvents, setMockStatementPreviewEvents] = useState<MockStatementPreviewEvent[]>([]);
  const [mockPaymentLocalUpdates, setMockPaymentLocalUpdates] = useState<
    Record<string, MockPaymentLocalUpdate>
  >({});
  const [mockFollowUpLocalUpdates, setMockFollowUpLocalUpdates] = useState<
    Record<string, MockFollowUpLocalUpdate>
  >({});
  const [mockStatementPreviewFeedback, setMockStatementPreviewFeedback] = useState<Record<string, string>>({});
  const [mockPaymentSectionFeedback, setMockPaymentSectionFeedback] = useState(
    "Mock controls only. Use the buttons to simulate manual payment tracking without saving records.",
  );
  const [outstandingReviewSearchTerm, setOutstandingReviewSearchTerm] = useState("");
  const [outstandingReviewFilter, setOutstandingReviewFilter] = useState<OutstandingReviewFilter>("all");
  const [outstandingReviewSort, setOutstandingReviewSort] =
    useState<OutstandingReviewSort>("highest-amount");
  const [outstandingReviewPageSize, setOutstandingReviewPageSize] = useState(10);
  const [outstandingReviewPage, setOutstandingReviewPage] = useState(1);
  const [collectionFollowUpPageSize, setCollectionFollowUpPageSize] = useState(10);
  const [collectionFollowUpPage, setCollectionFollowUpPage] = useState(1);
  const [monthlyStatementPageSize, setMonthlyStatementPageSize] = useState(10);
  const [monthlyStatementPage, setMonthlyStatementPage] = useState(1);
  const [selectedMonthlyBillingGroupKey, setSelectedMonthlyBillingGroupKey] = useState("");
  const [preparingMonthlyBillingGroupKey, setPreparingMonthlyBillingGroupKey] = useState("");
  const [selectedUnbilledCustomerRowKey, setSelectedUnbilledCustomerRowKey] = useState("");
  const [preparingUnbilledCustomerRowKey, setPreparingUnbilledCustomerRowKey] = useState("");
  const [customerInvoicePrepRowKey, setCustomerInvoicePrepRowKey] = useState("");
  const [customerInvoicePrepFeedback, setCustomerInvoicePrepFeedback] = useState(
    "Open the selected customer workspace and choose Prepare monthly invoice to load a billing account/month into the invoice workbench.",
  );
  const [customerInvoiceIssueAmount, setCustomerInvoiceIssueAmount] = useState("");
  const [customerInvoiceIssueDueDate, setCustomerInvoiceIssueDueDate] = useState(() =>
    invoiceDateInputDaysFromNow(7),
  );
  const [customerInvoiceIssueStatus, setCustomerInvoiceIssueStatus] =
    useState<CustomerLocalInvoiceStatus>("Unpaid");
  const [customerInvoiceDocumentType, setCustomerInvoiceDocumentType] =
    useState<CustomerBillingDocumentType>("invoice");
  const [customerInvoiceRecipientEmail, setCustomerInvoiceRecipientEmail] = useState("");
  const [customerInvoiceCardPaymentEnabled, setCustomerInvoiceCardPaymentEnabled] = useState(false);
  const [customerInvoiceCardFeeApplies, setCustomerInvoiceCardFeeApplies] = useState(false);
  const [customerInvoiceIssueFeedback, setCustomerInvoiceIssueFeedback] = useState(
    "Review the amount and due date before issuing. Invoice number is created only when you click issue.",
  );
  const [customerInvoicePreview, setCustomerInvoicePreview] =
    useState<CustomerInvoicePreview | null>(null);
  const [plainInvoiceForm, setPlainInvoiceForm] = useState<PlainInvoiceForm>(() =>
    plainInvoiceInitialForm(),
  );
  const [plainInvoicePreview, setPlainInvoicePreview] =
    useState<CustomerInvoicePreview | null>(null);
  const [plainInvoiceFeedback, setPlainInvoiceFeedback] = useState(
    "Create Invoice is ready for manual bill-to. No invoice number is created until Draft or Issue.",
  );
  const [plainInvoiceFeedbackTone, setPlainInvoiceFeedbackTone] =
    useState<RegularCustomerBookingFeedbackTone>("info");
  const [plainInvoiceSavedBookings, setPlainInvoiceSavedBookings] = useState<
    RegularCustomerSavedBookingReadRecord[]
  >([]);
  const [plainInvoiceSavedBookingsLoading, setPlainInvoiceSavedBookingsLoading] = useState(false);
  const [customerInvoiceDrafts, setCustomerInvoiceDrafts] = useState<CustomerInvoiceDraftRecord[]>([]);
  const [customerInvoiceCalculatedAmountCents, setCustomerInvoiceCalculatedAmountCents] =
    useState<number | null>(null);
  const [customerInvoiceCalculatedBillingBreakdown, setCustomerInvoiceCalculatedBillingBreakdown] =
    useState("");
  const [customerInvoiceCalculatedLineDescription, setCustomerInvoiceCalculatedLineDescription] =
    useState("");
  const [customerInvoiceCalculatedSourceLabel, setCustomerInvoiceCalculatedSourceLabel] = useState("");
  const [customerInvoiceAdjustmentReason, setCustomerInvoiceAdjustmentReason] = useState("");
  const [customerInvoiceDriverActualTimeReadState, setCustomerInvoiceDriverActualTimeReadState] =
    useState<CustomerInvoiceDriverActualTimeReadState>({
      bookingReference: "",
      message: "Driver JC timing is checked after an hourly unbilled row is prepared.",
      status: "idle",
      summary: null,
      tone: "info",
    });
  const [issuingCustomerInvoiceKey, setIssuingCustomerInvoiceKey] = useState("");
  const [downloadingCustomerInvoiceNumber, setDownloadingCustomerInvoiceNumber] = useState("");
  const [emailingCustomerInvoiceNumber, setEmailingCustomerInvoiceNumber] = useState("");
  const [updatingCustomerInvoiceStatusNumber, setUpdatingCustomerInvoiceStatusNumber] = useState("");
  const [archivedCustomerTestInvoiceReferences, setArchivedCustomerTestInvoiceReferences] = useState<
    string[]
  >([]);
  const [issuedCustomerInvoices, setIssuedCustomerInvoices] = useState<CustomerDisplayedInvoiceRecord[]>(() =>
    readCustomerLocalInvoices().map(displayLocalInvoice),
  );
  const [customerBillingDocumentPage, setCustomerBillingDocumentPage] = useState(1);
  const [customerInvoiceWorkspaceTab, setCustomerInvoiceWorkspaceTab] =
    useState<CustomerInvoiceWorkspaceTab>("create-invoice");
  const [mockFollowUpSectionFeedback, setMockFollowUpSectionFeedback] = useState(
    "Mock follow-up controls only. Use the buttons to simulate collection follow-up without sending messages.",
  );
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const selectedRegularCustomer = useMemo(
    () => mockCustomers.find((customer) => customer.id === regularCustomerBookingForm.customerId),
    [regularCustomerBookingForm.customerId],
  );
  const regularCustomerHourlyInvoiceReview = useMemo(
    () => getRegularCustomerHourlyInvoiceReview(regularCustomerBookingForm),
    [regularCustomerBookingForm],
  );
  const customerFolderIndexRows = useMemo(() => {
    if (regularCustomerAccountReadState.status !== "loaded") {
      return [];
    }

    return regularCustomerAccountReadState.accounts.map(customerFolderRowFromSavedAccount);
  }, [regularCustomerAccountReadState.accounts, regularCustomerAccountReadState.status]);
  const plainInvoiceCrmAccountOptions = useMemo(
    () => {
      if (plainInvoiceCrmAccountReadState.status === "loaded") {
        return plainInvoiceCrmAccountReadState.accounts.map(customerFolderRowFromSavedAccount);
      }

      return customerFolderIndexRows.filter((row) => row.source === "saved-account-read");
    },
    [
      customerFolderIndexRows,
      plainInvoiceCrmAccountReadState.accounts,
      plainInvoiceCrmAccountReadState.status,
    ],
  );
  const selectedPlainInvoiceCrmAccountOption = useMemo(
    () =>
      plainInvoiceCrmAccountOptions.find(
        (account) => account.customerFolderKey === selectedPlainInvoiceCrmFolderKey,
      ) || null,
    [plainInvoiceCrmAccountOptions, selectedPlainInvoiceCrmFolderKey],
  );
  const plainInvoiceSavedBookingOptions = useMemo(() => {
    const selectedCustomerId = normalizeCustomerFolderMatch(plainInvoiceForm.crmCustomerId);
    if (!selectedCustomerId) return [];

    return plainInvoiceSavedBookings.filter(
      (booking) =>
        normalizeCustomerFolderMatch(savedBookingCustomerId(booking)) === selectedCustomerId &&
        Boolean(savedBookingReference(booking)),
    );
  }, [plainInvoiceForm.crmCustomerId, plainInvoiceSavedBookings]);
  const selectedCustomerFolderFinderRow = useMemo(
    () =>
      customerFolderIndexRows.find(
        (row) => row.customerFolderKey === customerFolderFinderSelectedId,
      ) ?? null,
    [customerFolderFinderSelectedId, customerFolderIndexRows],
  );
  const filteredCustomers = useMemo(() => {
    return customerFolderIndexRows.filter((row) => {
      if (customerFolderFinderSelectedId && row.customerFolderKey !== customerFolderFinderSelectedId) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return [
        row.customerName,
        row.customerId,
        row.accountScopeLabel,
        row.latestBookingReference ?? "",
        row.latestPickupAt ?? "",
        row.latestServiceType ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearchTerm);
    });
  }, [customerFolderFinderSelectedId, customerFolderIndexRows, normalizedSearchTerm]);
  const customerFolderFinderTotalPages = Math.max(
    1,
    Math.ceil(filteredCustomers.length / customerFolderFinderPageSize),
  );
  const currentCustomerFolderFinderPage = Math.min(
    customerFolderFinderPage,
    customerFolderFinderTotalPages,
  );
  const customerFolderFinderStartIndex =
    filteredCustomers.length === 0 ? 0 : (currentCustomerFolderFinderPage - 1) * customerFolderFinderPageSize;
  const paginatedCustomerFolderFinderRows = filteredCustomers.slice(
    customerFolderFinderStartIndex,
    customerFolderFinderStartIndex + customerFolderFinderPageSize,
  );
  const customerFolderFinderShowingStart =
    filteredCustomers.length === 0 ? 0 : customerFolderFinderStartIndex + 1;
  const customerFolderFinderShowingEnd = Math.min(
    customerFolderFinderStartIndex + customerFolderFinderPageSize,
    filteredCustomers.length,
  );
  const customerFolderFinderDropdownTotalPages = Math.max(
    1,
    Math.ceil(customerFolderIndexRows.length / customerFolderFinderPageSize),
  );
  const currentCustomerFolderFinderDropdownPage = Math.min(
    customerFolderFinderPage,
    customerFolderFinderDropdownTotalPages,
  );
  const customerFolderFinderDropdownStartIndex =
    customerFolderIndexRows.length === 0
      ? 0
      : (currentCustomerFolderFinderDropdownPage - 1) * customerFolderFinderPageSize;
  const customerFolderFinderDropdownRows = customerFolderIndexRows.slice(
    customerFolderFinderDropdownStartIndex,
    customerFolderFinderDropdownStartIndex + customerFolderFinderPageSize,
  );
  const customerFolderFinderDropdownPageNumbers = Array.from(
    { length: customerFolderFinderDropdownTotalPages },
    (_, pageIndex) => pageIndex + 1,
  );
  const customerFolderFinderDropdownLabel = selectedCustomerFolderFinderRow
    ? selectedCustomerFolderFinderRow.customerName
    : `All customers - page ${currentCustomerFolderFinderDropdownPage} of ${customerFolderFinderDropdownTotalPages}`;
  const customerFolderSavedBookingMonthGroups = useMemo(
    () => groupCustomerFolderSavedBookingsByMonth(customerFolderJobViewState.savedBookings),
    [customerFolderJobViewState.savedBookings],
  );
  const visibleOutstandingPaymentReviewItems = useMemo(
    () =>
      outstandingPaymentReviewItems
        .map((item) => {
          const localUpdate = mockPaymentLocalUpdates[item.key];

          return {
            ...item,
            balanceDue: localUpdate?.balanceDue ?? item.balanceDue,
            feedback: localUpdate?.feedback,
            paymentStatus: localUpdate?.paymentStatus ?? item.paymentStatus,
            removeFromOutstanding: localUpdate?.removeFromOutstanding ?? false,
          };
        })
        .filter(
          (item) =>
            !item.removeFromOutstanding &&
            item.paymentStatus !== "Paid" &&
            hasMockBalanceDue(item.balanceDue),
        ),
    [mockPaymentLocalUpdates],
  );
  const outstandingReviewSummaryCards = useMemo(() => {
    const dueSoonItems = visibleOutstandingPaymentReviewItems.filter(isOutstandingDueSoon);
    const needsFollowUpItems = visibleOutstandingPaymentReviewItems.filter(isOutstandingNeedsFollowUp);
    const overdueItems = visibleOutstandingPaymentReviewItems.filter(
      (item) => item.paymentStatus === "Overdue",
    );

    return [
      {
        label: "Total outstanding",
        value: formatMockCurrency(
          visibleOutstandingPaymentReviewItems.reduce(
            (total, item) => total + parseMockCurrency(item.balanceDue),
            0,
          ),
        ),
        helper: `${visibleOutstandingPaymentReviewItems.length} mock customer balance rows`,
      },
      {
        label: "Overdue amount",
        value: formatMockCurrency(
          overdueItems.reduce((total, item) => total + parseMockCurrency(item.balanceDue), 0),
        ),
        helper: `${overdueItems.length} overdue`,
      },
      {
        label: "Due soon",
        value: formatMockCurrency(
          dueSoonItems.reduce((total, item) => total + parseMockCurrency(item.balanceDue), 0),
        ),
        helper: `${dueSoonItems.length} due within 7 days`,
      },
      {
        label: "Needs follow-up",
        value: String(needsFollowUpItems.length),
        helper: "Mock manual follow-up only",
      },
    ];
  }, [visibleOutstandingPaymentReviewItems]);
  const filteredOutstandingReviewItems = useMemo(() => {
    const normalizedOutstandingSearchTerm = outstandingReviewSearchTerm.trim().toLowerCase();

    return visibleOutstandingPaymentReviewItems
      .filter((item) => {
        const searchMatches =
          !normalizedOutstandingSearchTerm || item.searchText.includes(normalizedOutstandingSearchTerm);
        const filterMatches =
          outstandingReviewFilter === "all" ||
          (outstandingReviewFilter === "overdue" && item.paymentStatus === "Overdue") ||
          (outstandingReviewFilter === "due-soon" && isOutstandingDueSoon(item)) ||
          (outstandingReviewFilter === "partial-pending" &&
            (item.paymentStatus === "Partially Paid" ||
              item.paymentStatus === "Unpaid" ||
              item.paymentStatus === "Invoice Sent")) ||
          (outstandingReviewFilter === "needs-follow-up" && isOutstandingNeedsFollowUp(item));

        return searchMatches && filterMatches;
      })
      .sort((firstItem, secondItem) => {
        if (outstandingReviewSort === "customer-az") {
          return (
            firstItem.customerName.localeCompare(secondItem.customerName) ||
            firstItem.invoiceNumber.localeCompare(secondItem.invoiceNumber)
          );
        }

        if (outstandingReviewSort === "oldest-overdue") {
          return (
            parseMockDateValue(firstItem.dueOrFollowUpDate) -
              parseMockDateValue(secondItem.dueOrFollowUpDate) ||
            secondItem.paymentStatus.localeCompare(firstItem.paymentStatus)
          );
        }

        if (outstandingReviewSort === "last-follow-up") {
          return (
            parseMockDateValue(firstItem.lastFollowUpDate) -
              parseMockDateValue(secondItem.lastFollowUpDate) ||
            firstItem.customerName.localeCompare(secondItem.customerName)
          );
        }

        return (
          parseMockCurrency(secondItem.balanceDue) - parseMockCurrency(firstItem.balanceDue) ||
          firstItem.customerName.localeCompare(secondItem.customerName)
        );
      });
  }, [
    outstandingReviewFilter,
    outstandingReviewSearchTerm,
    outstandingReviewSort,
    visibleOutstandingPaymentReviewItems,
  ]);
  const outstandingReviewTotalPages = Math.max(
    1,
    Math.ceil(filteredOutstandingReviewItems.length / outstandingReviewPageSize),
  );
  const currentOutstandingReviewPage = Math.min(outstandingReviewPage, outstandingReviewTotalPages);
  const outstandingReviewStartIndex =
    filteredOutstandingReviewItems.length === 0
      ? 0
      : (currentOutstandingReviewPage - 1) * outstandingReviewPageSize;
  const paginatedOutstandingReviewItems = filteredOutstandingReviewItems.slice(
    outstandingReviewStartIndex,
    outstandingReviewStartIndex + outstandingReviewPageSize,
  );
  const outstandingReviewShowingStart =
    filteredOutstandingReviewItems.length === 0 ? 0 : outstandingReviewStartIndex + 1;
  const outstandingReviewShowingEnd = Math.min(
    outstandingReviewStartIndex + outstandingReviewPageSize,
    filteredOutstandingReviewItems.length,
  );
  const visibleCollectionFollowUpItems = useMemo(
    () =>
      visibleOutstandingPaymentReviewItems.map((item) => {
        const localFollowUpUpdate = mockFollowUpLocalUpdates[item.key];

        return {
          ...item,
          followUpDate: localFollowUpUpdate?.followUpDate ?? item.followUpDate,
          followUpFeedback: localFollowUpUpdate?.feedback,
          followUpNote: localFollowUpUpdate?.note,
        };
      }),
    [mockFollowUpLocalUpdates, visibleOutstandingPaymentReviewItems],
  );
  const collectionFollowUpTotalPages = Math.max(
    1,
    Math.ceil(visibleCollectionFollowUpItems.length / collectionFollowUpPageSize),
  );
  const currentCollectionFollowUpPage = Math.min(collectionFollowUpPage, collectionFollowUpTotalPages);
  const collectionFollowUpStartIndex =
    visibleCollectionFollowUpItems.length === 0
      ? 0
      : (currentCollectionFollowUpPage - 1) * collectionFollowUpPageSize;
  const paginatedCollectionFollowUpItems = visibleCollectionFollowUpItems.slice(
    collectionFollowUpStartIndex,
    collectionFollowUpStartIndex + collectionFollowUpPageSize,
  );
  const collectionFollowUpShowingStart =
    visibleCollectionFollowUpItems.length === 0 ? 0 : collectionFollowUpStartIndex + 1;
  const collectionFollowUpShowingEnd = Math.min(
    collectionFollowUpStartIndex + collectionFollowUpPageSize,
    visibleCollectionFollowUpItems.length,
  );
  const mockStatementPreviewGroups = useMemo(
    () =>
      getMockStatementPreviewGroups(visibleOutstandingPaymentReviewItems).map((group) => ({
        ...group,
        feedback: mockStatementPreviewFeedback[group.key],
      })),
    [mockStatementPreviewFeedback, visibleOutstandingPaymentReviewItems],
  );
  const monthlyStatementTotalPages = Math.max(
    1,
    Math.ceil(mockStatementPreviewGroups.length / monthlyStatementPageSize),
  );
  const currentMonthlyStatementPage = Math.min(monthlyStatementPage, monthlyStatementTotalPages);
  const monthlyStatementStartIndex =
    mockStatementPreviewGroups.length === 0 ? 0 : (currentMonthlyStatementPage - 1) * monthlyStatementPageSize;
  const paginatedMonthlyStatementGroups = mockStatementPreviewGroups.slice(
    monthlyStatementStartIndex,
    monthlyStatementStartIndex + monthlyStatementPageSize,
  );
  const monthlyStatementShowingStart = mockStatementPreviewGroups.length === 0 ? 0 : monthlyStatementStartIndex + 1;
  const monthlyStatementShowingEnd = Math.min(
    monthlyStatementStartIndex + monthlyStatementPageSize,
    mockStatementPreviewGroups.length,
  );
  const unbilledCustomerRows = useMemo<UnbilledCustomerRow[]>(() => {
    const invoicedReferences = invoicedReferenceSetFrom(issuedCustomerInvoices);
    const suppressedInvoiceReferences = new Set([
      ...invoicedReferences,
      ...archivedCustomerTestInvoiceReferences,
    ]);
    const closeoutReadySavedBookingRows = regularCustomerSavedBookingReadState.savedBookings
      .map((booking) =>
        savedBookingUnbilledRow(
          booking,
          regularCustomerSavedBookingBillingReadinessState.closeoutsByReference[
            savedBookingReference(booking)
          ],
        ),
      )
      .filter((row): row is UnbilledCustomerRow => Boolean(row));

    return closeoutReadySavedBookingRows
      .filter((row) => !suppressedInvoiceReferences.has(normalizedInvoiceReference(row.reference)))
      .sort(
        (firstRow, secondRow) =>
          firstRow.billingMonth.localeCompare(secondRow.billingMonth) ||
          firstRow.customerId.localeCompare(secondRow.customerId) ||
          firstRow.customerName.localeCompare(secondRow.customerName),
      );
  }, [
    archivedCustomerTestInvoiceReferences,
    issuedCustomerInvoices,
    regularCustomerSavedBookingBillingReadinessState.closeoutsByReference,
    regularCustomerSavedBookingReadState.savedBookings,
  ]);
  const customerMonthlyBillingGroups = useMemo<CustomerMonthlyBillingGroup[]>(() => {
    const groups = new Map<string, CustomerMonthlyBillingGroup>();

    for (const row of unbilledCustomerRows) {
      const billingMonth = safeBillingMonth(row.billingMonth);
      const billingAccountKey = normalizeCustomerFolderMatch(row.customerId);
      const billingScopeKey = normalizeCustomerFolderMatch(row.accountScopeKey || "booker_traveller_not_set");

      if (!billingAccountKey) {
        continue;
      }

      const groupKey = [
        billingAccountKey,
        billingScopeKey,
        billingMonth || "month-review",
      ].join("::");
      const existingGroup = groups.get(groupKey);

      if (existingGroup) {
        existingGroup.rows.push(row);
        existingGroup.needsScopeReview ||= row.needsScopeReview;
        continue;
      }

      groups.set(groupKey, {
        accountScopeKey: row.accountScopeKey,
        accountScopeLabel: row.accountScopeLabel,
        billingMonth,
        billingMonthLabel: monthlyBillingMonthLabel(billingMonth),
        customerId: row.customerId,
        customerName: row.customerName,
        key: groupKey,
        needsScopeReview: row.needsScopeReview,
        rows: [row],
      });
    }

    return Array.from(groups.values()).sort(
      (firstGroup, secondGroup) =>
        firstGroup.customerName.localeCompare(secondGroup.customerName) ||
        firstGroup.billingMonth.localeCompare(secondGroup.billingMonth),
    );
  }, [unbilledCustomerRows]);
  const customerBillingOverviewRows = useMemo<CustomerBillingOverviewRow[]>(() => {
    type DraftSummary = { amountCents: number; count: number; dueDateLabel: string };
    type InvoiceSummary = {
      amountCents: number;
      balanceCents: number;
      count: number;
      dueDateLabel: string;
      paidCount: number;
      pendingCount: number;
    };
    type ReadySummary = { amountCents: number; count: number; dateLabel: string };

    const folderRowsByKey = new Map<
      string,
      {
        customerFolderKey: string;
        customerId: string;
        customerName: string;
      }
    >();
    const accountKeyAliases = new Map<string, string>();
    const addAlias = (alias: string | null | undefined, customerFolderKey: string) => {
      const normalizedAlias = normalizeCustomerFolderMatch(alias);

      if (normalizedAlias) {
        accountKeyAliases.set(normalizedAlias, customerFolderKey);
      }
    };

    for (const customer of customerFolderIndexRows) {
      folderRowsByKey.set(customer.customerFolderKey, {
        customerFolderKey: customer.customerFolderKey,
        customerId: customer.customerId,
        customerName: customer.customerName,
      });
      addAlias(customer.customerFolderKey, customer.customerFolderKey);
      addAlias(customer.customerId, customer.customerFolderKey);
      addAlias(customer.customerName, customer.customerFolderKey);
    }

    const keyForCustomer = (customerId: string, customerName: string) => {
      const customerIdKey = normalizeCustomerFolderMatch(customerId);
      const customerNameKey = normalizeCustomerFolderMatch(customerName);
      const matchedKey = accountKeyAliases.get(customerIdKey) || accountKeyAliases.get(customerNameKey);

      if (matchedKey) {
        return matchedKey;
      }

      const fallbackKey = customerIdKey || customerNameKey || "unknown-customer";
      const customerFolderKey = `billing-overview::${fallbackKey}`;

      if (!folderRowsByKey.has(customerFolderKey)) {
        folderRowsByKey.set(customerFolderKey, {
          customerFolderKey,
          customerId: customerId || customerName,
          customerName: customerName || customerId || "Customer account",
        });
        addAlias(customerId, customerFolderKey);
        addAlias(customerName, customerFolderKey);
      }

      return customerFolderKey;
    };

    const draftSummaries = new Map<string, DraftSummary>();
    for (const draft of customerInvoiceDrafts) {
      const rowKey = keyForCustomer(draft.customerName, draft.customerName);
      const existing = draftSummaries.get(rowKey) ?? {
        amountCents: 0,
        count: 0,
        dueDateLabel: "",
      };

      existing.amountCents += draft.amountCents;
      existing.count += 1;
      existing.dueDateLabel ||= draft.dueDateLabel || draft.createdAtLabel;
      draftSummaries.set(rowKey, existing);
    }

    const invoiceSummaries = new Map<string, InvoiceSummary>();
    for (const invoice of activeCustomerInvoiceRecords(issuedCustomerInvoices)) {
      const rowKey = keyForCustomer(invoice.customerId, invoice.customerName);
      const isPaid = invoice.status === "Paid";
      const existing = invoiceSummaries.get(rowKey) ?? {
        amountCents: 0,
        balanceCents: 0,
        count: 0,
        dueDateLabel: "",
        paidCount: 0,
        pendingCount: 0,
      };

      existing.amountCents += invoice.amountCents;
      existing.balanceCents += isPaid ? 0 : invoice.amountCents;
      existing.count += 1;
      existing.dueDateLabel ||= invoice.dueDateLabel || invoice.issueDateLabel;
      existing.paidCount += isPaid ? 1 : 0;
      existing.pendingCount += isPaid ? 0 : 1;
      invoiceSummaries.set(rowKey, existing);
    }

    const readySummaries = new Map<string, ReadySummary>();
    for (const row of unbilledCustomerRows) {
      const rowKey = keyForCustomer(row.customerId, row.customerName);
      const existing = readySummaries.get(rowKey) ?? {
        amountCents: 0,
        count: 0,
        dateLabel: "",
      };

      existing.amountCents += parseInvoiceAmountToCents(row.amount) || 0;
      existing.count += 1;
      existing.dateLabel ||= row.billingMonthLabel || row.dateLabel;
      readySummaries.set(rowKey, existing);
    }

    return Array.from(folderRowsByKey.values())
      .map((customer) => {
        const draftSummary = draftSummaries.get(customer.customerFolderKey);
        const invoiceSummary = invoiceSummaries.get(customer.customerFolderKey);
        const readySummary = readySummaries.get(customer.customerFolderKey);
        const draftCount = draftSummary?.count ?? 0;
        const pendingCount = invoiceSummary?.pendingCount ?? 0;
        const readyJobCount = readySummary?.count ?? 0;
        const paidCount = invoiceSummary?.paidCount ?? 0;
        const statusLabel: CustomerBillingOverviewRow["statusLabel"] =
          draftCount > 0
            ? "Draft"
            : pendingCount > 0
              ? "Pending"
              : readyJobCount > 0
                ? "Ready"
                : paidCount > 0
                  ? "Paid"
                  : "No invoices";
        const invoiceAmountCents =
          (draftSummary?.amountCents ?? 0) +
          (invoiceSummary?.amountCents ?? 0) +
          (readySummary?.amountCents ?? 0);
        const balanceCents =
          (draftSummary?.amountCents ?? 0) +
          (invoiceSummary?.balanceCents ?? 0) +
          (readySummary?.amountCents ?? 0);

        return {
          balanceCents,
          balanceLabel: formatInvoiceAmount(balanceCents),
          customerFolderKey: customer.customerFolderKey,
          customerFolderHref: customerFolderHrefFor(customer.customerId, customer.customerName),
          customerId: customer.customerId,
          customerName: customer.customerName,
          draftCount,
          invoiceAmountCents,
          invoiceAmountLabel: formatInvoiceAmount(invoiceAmountCents),
          invoiceCount: draftCount + (invoiceSummary?.count ?? 0),
          latestDateLabel:
            draftSummary?.dueDateLabel ||
            invoiceSummary?.dueDateLabel ||
            readySummary?.dateLabel ||
            "No invoice date",
          paidCount,
          pendingCount,
          readyJobCount,
          statusLabel,
        };
      })
      .sort(
        (firstRow, secondRow) =>
          secondRow.balanceCents - firstRow.balanceCents ||
          firstRow.customerName.localeCompare(secondRow.customerName),
      );
  }, [customerFolderIndexRows, customerInvoiceDrafts, issuedCustomerInvoices, unbilledCustomerRows]);
  const customerBillingOverviewTotals = useMemo(
    () =>
      customerBillingOverviewRows.reduce(
        (totals, row) => ({
          balanceCents: totals.balanceCents + row.balanceCents,
          draftCount: totals.draftCount + row.draftCount,
          pendingCount: totals.pendingCount + row.pendingCount,
          readyJobCount: totals.readyJobCount + row.readyJobCount,
          rowCount: totals.rowCount + 1,
        }),
        {
          balanceCents: 0,
          draftCount: 0,
          pendingCount: 0,
          readyJobCount: 0,
          rowCount: 0,
        },
      ),
    [customerBillingOverviewRows],
  );
  const filteredCustomerBillingOverviewRows = useMemo(() => {
    if (!normalizedSearchTerm) {
      return customerBillingOverviewRows;
    }

    return customerBillingOverviewRows.filter((row) =>
      [
        row.customerName,
        row.customerId,
        row.statusLabel,
        row.latestDateLabel,
        row.invoiceAmountLabel,
        row.balanceLabel,
      ]
        .join(" ")
        .toLowerCase()
      .includes(normalizedSearchTerm),
    );
  }, [customerBillingOverviewRows, normalizedSearchTerm]);
  const customerBillingOverviewTotalPages = Math.max(
    1,
    Math.ceil(filteredCustomerBillingOverviewRows.length / customerBillingOverviewPageSize),
  );
  const activeCustomerBillingOverviewPage = Math.min(
    currentCustomerFolderFinderPage,
    customerBillingOverviewTotalPages,
  );
  const customerBillingOverviewStartIndex =
    filteredCustomerBillingOverviewRows.length === 0
      ? 0
      : (activeCustomerBillingOverviewPage - 1) * customerBillingOverviewPageSize;
  const paginatedCustomerBillingOverviewRows = filteredCustomerBillingOverviewRows.slice(
    customerBillingOverviewStartIndex,
    customerBillingOverviewStartIndex + customerBillingOverviewPageSize,
  );
  const customerBillingOverviewShowingStart =
    filteredCustomerBillingOverviewRows.length === 0 ? 0 : customerBillingOverviewStartIndex + 1;
  const customerBillingOverviewShowingEnd = Math.min(
    customerBillingOverviewStartIndex + customerBillingOverviewPageSize,
    filteredCustomerBillingOverviewRows.length,
  );
  const customerBillingOverviewPageNumbers = Array.from(
    { length: customerBillingOverviewTotalPages },
    (_, pageIndex) => pageIndex + 1,
  );
  const selectedCustomerBillingInvoiceRows = useMemo<SelectedCustomerBillingInvoiceRow[]>(() => {
    const selectedCustomerId = normalizeCustomerFolderMatch(customerFolderJobViewState.customerId);
    const selectedCustomerName = normalizeCustomerFolderMatch(customerFolderJobViewState.customerName);

    if (!selectedCustomerId && !selectedCustomerName) {
      return [];
    }

    const rowMatchesSelectedCustomer = (customerId: string | null | undefined, customerName: string) => {
      const rowCustomerId = normalizeCustomerFolderMatch(customerId);
      const rowCustomerName = normalizeCustomerFolderMatch(customerName);

      return (
        Boolean(selectedCustomerId && rowCustomerId && rowCustomerId === selectedCustomerId) ||
        Boolean(selectedCustomerName && rowCustomerName && rowCustomerName === selectedCustomerName)
      );
    };

    const draftRows = customerInvoiceDrafts
      .filter((draft) => rowMatchesSelectedCustomer(null, draft.customerName))
      .map((draft): SelectedCustomerBillingInvoiceRow => ({
        amountLabel: draft.amountLabel,
        balanceLabel: draft.amountLabel,
        customerName: draft.customerName,
        dateLabel: draft.dueDateLabel || draft.createdAtLabel,
        documentNumber: draft.documentNumber || draft.draftId,
        documentTypeLabel: customerBillingDocumentLabel(draft.documentType),
        key: `draft::${draft.draftId}`,
        lineItems: [
          {
            amountLabel: draft.amountLabel,
            description: draft.lineDescription,
          },
        ],
        statusLabel: "Draft",
      }));
    const issuedRows = activeCustomerInvoiceRecords(issuedCustomerInvoices)
      .filter((invoice) => rowMatchesSelectedCustomer(invoice.customerId, invoice.customerName))
      .map((invoice): SelectedCustomerBillingInvoiceRow => ({
        amountLabel: invoice.amountLabel,
        balanceLabel: invoice.status === "Paid" ? formatInvoiceAmount(0) : invoice.amountLabel,
        customerName: invoice.customerName,
        dateLabel: invoice.issueDateLabel || invoice.dueDateLabel,
        documentNumber: invoice.invoiceNumber,
        documentTypeLabel: customerBillingDocumentLabel(invoice.documentType || "invoice"),
        invoiceRecord: invoice,
        key: `issued::${invoice.invoiceNumber}`,
        lineItems:
          invoice.lineItems.length > 0
            ? invoice.lineItems
            : [
                {
                  amountLabel: invoice.amountLabel,
                  description: invoice.lineItems[0]?.description || invoice.service,
                },
              ],
        statusLabel: invoice.status === "Paid" ? "Paid" : "Pending",
      }));

    return [...draftRows, ...issuedRows].sort((firstRow, secondRow) =>
      secondRow.dateLabel.localeCompare(firstRow.dateLabel),
    );
  }, [
    customerFolderJobViewState.customerId,
    customerFolderJobViewState.customerName,
    customerInvoiceDrafts,
    issuedCustomerInvoices,
  ]);
  const selectedCustomerBillingInvoiceDetail =
    selectedCustomerBillingInvoiceRows.find((row) => row.key === selectedCustomerInvoiceDetailKey) ?? null;
  const selectedCustomerWorkspaceOpen = customerFolderJobViewState.status !== "idle";
  const customerMonthlyBillingAccountReviewCount = useMemo(() => {
    const invoicedReferences = invoicedReferenceSetFrom(issuedCustomerInvoices);
    const suppressedInvoiceReferences = new Set([
      ...invoicedReferences,
      ...archivedCustomerTestInvoiceReferences,
    ]);
    const missingCustomerAccountCount = regularCustomerSavedBookingReadState.savedBookings.filter((booking) => {
      const reference = savedBookingReference(booking);

      if (!reference || savedBookingCustomerId(booking)) {
        return false;
      }

      if (suppressedInvoiceReferences.has(normalizedInvoiceReference(reference))) {
        return false;
      }

      return savedBookingCloseoutIsBillingReady(
        regularCustomerSavedBookingBillingReadinessState.closeoutsByReference[reference],
      );
    }).length;
    const unsafeScopeCount = unbilledCustomerRows.filter((row) => row.needsScopeReview).length;

    return missingCustomerAccountCount + unsafeScopeCount;
  }, [
    archivedCustomerTestInvoiceReferences,
    issuedCustomerInvoices,
    regularCustomerSavedBookingBillingReadinessState.closeoutsByReference,
    regularCustomerSavedBookingReadState.savedBookings,
    unbilledCustomerRows,
  ]);
  const visibleCustomerMonthlyBillingGroups = selectedCustomerFolderFinderRow
    ? customerMonthlyBillingGroups.filter((group) => {
        const selectedScopeKey =
          selectedCustomerFolderFinderRow.accountScopeKey || "booker_traveller_not_set";

        return (
          normalizeCustomerFolderMatch(group.customerId) ===
            normalizeCustomerFolderMatch(selectedCustomerFolderFinderRow.customerId) &&
          normalizeCustomerFolderMatch(group.accountScopeKey || "booker_traveller_not_set") ===
            normalizeCustomerFolderMatch(selectedScopeKey)
        );
      })
    : customerMonthlyBillingGroups;
  const selectedMonthlyBillingGroup = useMemo(
    () =>
      customerMonthlyBillingGroups.find((group) => group.key === selectedMonthlyBillingGroupKey) ??
      null,
    [customerMonthlyBillingGroups, selectedMonthlyBillingGroupKey],
  );
  const selectedCustomerMonthlyBillingGroups = useMemo(() => {
    const selectedCustomerId = normalizeCustomerFolderMatch(customerFolderJobViewState.customerId);
    const selectedCustomerName = normalizeCustomerFolderMatch(customerFolderJobViewState.customerName);

    if (!selectedCustomerId && !selectedCustomerName) {
      return [];
    }

    return customerMonthlyBillingGroups.filter((group) => {
      const groupCustomerId = normalizeCustomerFolderMatch(group.customerId);
      const groupCustomerName = normalizeCustomerFolderMatch(group.customerName);

      return (
        Boolean(selectedCustomerId && groupCustomerId && groupCustomerId === selectedCustomerId) ||
        Boolean(selectedCustomerName && groupCustomerName && groupCustomerName === selectedCustomerName)
      );
    });
  }, [
    customerFolderJobViewState.customerId,
    customerFolderJobViewState.customerName,
    customerMonthlyBillingGroups,
  ]);
  const selectedCustomerPrimaryMonthlyBillingGroup =
    selectedCustomerMonthlyBillingGroups.find((group) => !group.needsScopeReview) ??
    selectedCustomerMonthlyBillingGroups[0] ??
    null;
  const selectedUnbilledCustomerRow = useMemo(
    () => unbilledCustomerRows.find((row) => row.key === selectedUnbilledCustomerRowKey) ?? null,
    [selectedUnbilledCustomerRowKey, unbilledCustomerRows],
  );
  const visibleUnbilledCustomerRows =
    selectedMonthlyBillingGroup?.rows ??
    (selectedUnbilledCustomerRow ? [selectedUnbilledCustomerRow] : unbilledCustomerRows);
  const unbilledCustomersShowingLabel = selectedMonthlyBillingGroup
    ? `${selectedMonthlyBillingGroup.rows.length} job${
        selectedMonthlyBillingGroup.rows.length === 1 ? "" : "s"
      } / ${selectedMonthlyBillingGroup.customerName}${
        selectedMonthlyBillingGroup.accountScopeLabel
          ? ` / ${selectedMonthlyBillingGroup.accountScopeLabel}`
          : ""
      } / ${selectedMonthlyBillingGroup.billingMonthLabel}`
    : `${unbilledCustomerRows.length} billable job${
        unbilledCustomerRows.length === 1 ? "" : "s"
      } in ${customerMonthlyBillingGroups.length} billing account/month group${
        customerMonthlyBillingGroups.length === 1 ? "" : "s"
      }`;
  const getUnbilledPrepareButtonLabel = (rowKey: string) =>
    preparingUnbilledCustomerRowKey === rowKey
      ? "Preparing"
      : customerInvoicePrepRowKey === rowKey
        ? "Prepared"
        : "Prepare";
  const isUnbilledPrepareButtonPrepared = (rowKey: string) =>
    customerInvoicePrepRowKey === rowKey && preparingUnbilledCustomerRowKey !== rowKey;
  const customerInvoicePrepRow = useMemo(
    () => unbilledCustomerRows.find((row) => row.key === customerInvoicePrepRowKey) ?? null,
    [customerInvoicePrepRowKey, unbilledCustomerRows],
  );
  const advancedInvoiceWorkbenchVisible =
    !selectedCustomerWorkspaceOpen ||
    Boolean(customerInvoicePrepRow) ||
    Boolean(plainInvoicePreview) ||
    Boolean(plainInvoiceForm.billToName.trim());
  const customerInvoiceApprovedAmountCents = useMemo(
    () => parseInvoiceAmountToCents(customerInvoiceIssueAmount),
    [customerInvoiceIssueAmount],
  );
  const customerInvoiceAmountEdited =
    customerInvoiceCalculatedAmountCents !== null &&
    customerInvoiceApprovedAmountCents !== null &&
    customerInvoiceApprovedAmountCents !== customerInvoiceCalculatedAmountCents;
  const customerInvoiceCurrentPreviewKey = useMemo(() => {
    if (!customerInvoicePrepRow || !customerInvoiceApprovedAmountCents) {
      return "";
    }

    return [
      customerInvoicePrepRow.key,
      customerInvoiceDocumentType,
      customerInvoiceApprovedAmountCents,
      customerInvoiceIssueDueDate,
      customerInvoiceIssueStatus,
      customerInvoiceCalculatedAmountCents ?? "",
      customerInvoiceCalculatedLineDescription,
      customerInvoiceAmountEdited ? customerInvoiceAdjustmentReason.trim() : "",
      customerInvoiceCardPaymentEnabled ? "card-on" : "card-off",
      customerInvoiceCardFeeApplies ? "card-fee-on" : "card-fee-off",
    ].join("|");
  }, [
    customerInvoiceAdjustmentReason,
    customerInvoiceAmountEdited,
    customerInvoiceApprovedAmountCents,
    customerInvoiceCardFeeApplies,
    customerInvoiceCardPaymentEnabled,
    customerInvoiceCalculatedAmountCents,
    customerInvoiceCalculatedLineDescription,
    customerInvoiceDocumentType,
    customerInvoiceIssueDueDate,
    customerInvoiceIssueStatus,
    customerInvoicePrepRow,
  ]);
  const isCustomerInvoicePreviewCurrent =
    Boolean(customerInvoicePreview) &&
    customerInvoicePreview?.previewKey === customerInvoiceCurrentPreviewKey;
  const plainInvoiceAmountCents = useMemo(
    () => plainInvoiceTotalAmountCents(plainInvoiceForm),
    [plainInvoiceForm],
  );
  const plainInvoiceCurrentPreviewKey = useMemo(() => {
    const billToName = plainInvoiceForm.billToName.trim();
    const crmCustomerId = plainInvoiceForm.crmCustomerId.trim();
    const crmCustomerName = plainInvoiceForm.crmCustomerName.trim();
    const reference = plainInvoiceForm.reference.trim();
    const service = plainInvoiceForm.service.trim();
    const lineItems = plainInvoiceLineItemsFromForm(plainInvoiceForm, {
      includeCardPaymentNote: true,
    });
    const lineItemsKey = lineItems
      .map((item) => `${item.amountLabel}:${item.description}`)
      .join(";;");

    if (
      !billToName ||
      !reference ||
      !service ||
      !lineItemsKey ||
      !plainInvoiceAmountCents ||
      plainInvoiceLineItemValidationMessage(plainInvoiceForm)
    ) {
      return "";
    }

    return [
      "plain-invoice",
      billToName,
      plainInvoiceForm.billToEmail.trim(),
      crmCustomerId,
      crmCustomerName,
      plainInvoiceForm.bookingReference,
      plainInvoiceForm.bookerId ?? "",
      reference,
      service,
      plainInvoiceForm.route.trim(),
      lineItemsKey,
      plainInvoiceAmountCents,
      plainInvoiceForm.dueDateIso,
      plainInvoiceForm.cardPaymentEnabled ? "card-on" : "card-off",
      plainInvoiceForm.cardFeeApplies ? "card-fee-on" : "card-fee-off",
      plainInvoiceForm.isPaid ? "paid" : "unpaid",
    ].join("|");
  }, [
    plainInvoiceAmountCents,
    plainInvoiceForm,
  ]);
  const isPlainInvoicePreviewCurrent =
    Boolean(plainInvoicePreview) &&
    plainInvoicePreview?.previewKey === plainInvoiceCurrentPreviewKey;
  const plainInvoiceCrmPickerLabel =
    (selectedPlainInvoiceCrmAccountOption
      ? `${selectedPlainInvoiceCrmAccountOption.customerName}${
          selectedPlainInvoiceCrmAccountOption.accountScopeLabel
            ? ` / ${selectedPlainInvoiceCrmAccountOption.accountScopeLabel}`
            : ""
        }`
      : plainInvoiceForm.crmCustomerName.trim()) ||
    (plainInvoiceCrmAccountOptions.length > 0
      ? "Manual bill-to (no CRM link)"
      : plainInvoiceCrmAccountReadState.status === "loaded"
        ? "No CRM accounts found"
        : "Load CRM accounts first");
  const plainInvoiceCrmSearchResultsLabel =
    plainInvoiceCrmAccountReadState.status === "loading"
      ? "Loading CRM accounts..."
      : plainInvoiceCrmAccountReadState.message;
  const customerBillingDocumentTotalPages = Math.max(
    1,
    Math.ceil(issuedCustomerInvoices.length / customerBillingDocumentPageSize),
  );
  const currentCustomerBillingDocumentPage = Math.min(
    customerBillingDocumentPage,
    customerBillingDocumentTotalPages,
  );
  const customerBillingDocumentStartIndex =
    issuedCustomerInvoices.length === 0
      ? 0
      : (currentCustomerBillingDocumentPage - 1) * customerBillingDocumentPageSize;
  const visibleIssuedCustomerInvoices = issuedCustomerInvoices.slice(
    customerBillingDocumentStartIndex,
    customerBillingDocumentStartIndex + customerBillingDocumentPageSize,
  );
  const customerBillingDocumentShowingStart =
    issuedCustomerInvoices.length === 0 ? 0 : customerBillingDocumentStartIndex + 1;
  const customerBillingDocumentShowingEnd = Math.min(
    customerBillingDocumentStartIndex + customerBillingDocumentPageSize,
    issuedCustomerInvoices.length,
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadIssuedCustomerInvoices() {
      const localInvoices = activeCustomerInvoiceRecords(
        readCustomerLocalInvoices().map(displayLocalInvoice),
      );

      try {
        const response = await fetch(adminCustomerInvoicesApiPath, {
          cache: "no-store",
          headers: {
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null);

        if (response.ok && result?.ok) {
          const serverInvoiceRecordsWithStorage = safeInvoiceApiRecords(result.invoices).map((invoice) => ({
            ...invoice,
            storageSource: "server" as const,
          }));
          const archivedReferences = [
            ...new Set(
              serverInvoiceRecordsWithStorage
                .filter(isArchivedCustomerTestInvoiceRecord)
                .map((invoice) => normalizedInvoiceReference(invoice.reference))
                .filter(Boolean),
            ),
          ];
          const serverInvoiceRecords = activeCustomerInvoiceRecords(
            serverInvoiceRecordsWithStorage,
          );
          const serverDraftRecords = serverInvoiceRecords.filter(
            (invoice) => invoice.documentState === "draft",
          );
          const serverIssuedRecords = serverInvoiceRecords.filter(
            (invoice) => invoice.documentState !== "draft",
          );

          setArchivedCustomerTestInvoiceReferences(archivedReferences);
          setCustomerInvoiceDrafts(serverDraftRecords.map(invoiceDraftRecordFromDisplayedInvoice));
          setIssuedCustomerInvoices(
            mergeDisplayedInvoices(serverIssuedRecords, localInvoices),
          );
          return;
        }
      } catch {
        if (controller.signal.aborted) {
          return;
        }
      }

      setIssuedCustomerInvoices(localInvoices);
    }

    void loadIssuedCustomerInvoices();

    return () => controller.abort();
  }, []);

  const regularCustomerBillingQuickFilterOptions = useMemo(() => {
    const billingMonths = Array.from(
      new Set(regularCustomerBookingListItems.map((item) => item.billingMonth.trim()).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));
    const billingStatuses = Array.from(
      new Set(regularCustomerBookingListItems.map((item) => item.billingStatus.trim()).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right));

    return [
      { label: "All mock rows", value: regularCustomerBillingQuickFilterAllValue },
      { label: "No matching mock rows", value: regularCustomerBillingQuickFilterNoMatchValue },
      ...billingMonths.map((billingMonth) => ({
        label: `Month: ${billingMonth}`,
        value: `month:${billingMonth}`,
      })),
      ...billingStatuses.map((billingStatus) => ({
        label: `Status: ${billingStatus}`,
        value: `status:${billingStatus}`,
      })),
    ];
  }, [regularCustomerBookingListItems]);
  const activeRegularCustomerBillingQuickFilter = regularCustomerBillingQuickFilterOptions.some(
    (option) => option.value === regularCustomerBillingQuickFilter,
  )
    ? regularCustomerBillingQuickFilter
    : regularCustomerBillingQuickFilterAllValue;
  const activeRegularCustomerBillingQuickFilterLabel =
    regularCustomerBillingQuickFilterOptions.find(
      (option) => option.value === activeRegularCustomerBillingQuickFilter,
    )?.label ?? "All mock rows";
  const filteredRegularCustomerBookingListItems = useMemo(
    () =>
      regularCustomerBookingListItems.filter((item) => {
        const customerMatches =
          !regularCustomerBookingListFilters.customerId ||
          item.customerId === regularCustomerBookingListFilters.customerId;
        const billingMonthMatches =
          !regularCustomerBookingListFilters.billingMonth.trim() ||
          item.billingMonth.trim().toLowerCase() ===
            regularCustomerBookingListFilters.billingMonth.trim().toLowerCase();
        const billingStatusMatches =
          !regularCustomerBookingListFilters.billingStatus ||
          item.billingStatus === regularCustomerBookingListFilters.billingStatus;
        const quickFilterMatches =
          activeRegularCustomerBillingQuickFilter === regularCustomerBillingQuickFilterAllValue ||
          (activeRegularCustomerBillingQuickFilter !== regularCustomerBillingQuickFilterNoMatchValue &&
            ((activeRegularCustomerBillingQuickFilter.startsWith("month:") &&
              item.billingMonth.trim() === activeRegularCustomerBillingQuickFilter.replace(/^month:/, "")) ||
              (activeRegularCustomerBillingQuickFilter.startsWith("status:") &&
                item.billingStatus.trim() ===
                  activeRegularCustomerBillingQuickFilter.replace(/^status:/, ""))));

        return customerMatches && billingMonthMatches && billingStatusMatches && quickFilterMatches;
      }),
    [
      activeRegularCustomerBillingQuickFilter,
      regularCustomerBookingListFilters,
      regularCustomerBookingListItems,
    ],
  );
  const regularCustomerMonthlyBillingSummary = useMemo(() => {
    const monthCounts = new Map<string, number>();
    const statusCounts = new Map<string, number>();

    for (const item of filteredRegularCustomerBookingListItems) {
      const billingMonth = item.billingMonth.trim() || "No billing month";
      const billingStatus = item.billingStatus.trim() || "No billing status";

      monthCounts.set(billingMonth, (monthCounts.get(billingMonth) ?? 0) + 1);
      statusCounts.set(billingStatus, (statusCounts.get(billingStatus) ?? 0) + 1);
    }

    const monthEntries = Array.from(monthCounts.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const statusEntries = Array.from(statusCounts.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    const monthSummary =
      monthEntries.length === 0
        ? "No visible billing month"
        : monthEntries.map(([month, count]) => `${month} (${count})`).join(", ");
    const statusSummary =
      statusEntries.length === 0
        ? "No visible status"
        : statusEntries.map(([status, count]) => `${status} (${count})`).join(", ");

    return {
      monthSummary,
      statusSummary,
      totalRowCount: regularCustomerBookingListItems.length,
      visibleRowCount: filteredRegularCustomerBookingListItems.length,
    };
  }, [filteredRegularCustomerBookingListItems, regularCustomerBookingListItems.length]);
  const regularCustomerBillingQuickFilterHasNoVisibleRows =
    regularCustomerBookingListItems.length > 0 &&
    activeRegularCustomerBillingQuickFilter !== regularCustomerBillingQuickFilterAllValue &&
    filteredRegularCustomerBookingListItems.length === 0;

  function updateRegularCustomerBookingField(field: keyof RegularCustomerBookingForm, value: string) {
    setRegularCustomerBookingForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
    setRegularCustomerBookingMissingFields((currentFields) =>
      value.trim() ? currentFields.filter((currentField) => currentField !== field) : currentFields,
    );
  }

  function updateRegularCustomerBookingListFilter(
    field: keyof RegularCustomerBookingListFilters,
    value: string,
  ) {
    setRegularCustomerBookingListFilters((currentFilters) => ({
      ...currentFilters,
      [field]: value,
    }));
    setRegularCustomerBillingDetailPreviewId("");
    setRegularCustomerBookingListFilterFeedback(
      "Local mock filters updated. No booking, invoice, statement, notification, calendar, payment, bank, audit, or Supabase record was changed.",
    );
    setRegularCustomerDraftInvoiceFeedbackTone("info");
    if (regularCustomerDraftInvoicePreview) {
      setRegularCustomerDraftInvoiceClearControlVisible(true);
      setRegularCustomerDraftInvoiceSnapshotStale(true);
      setRegularCustomerDraftInvoiceFeedback(
        "Filters changed locally. The visible mock draft preview is still the earlier local snapshot; create a new mock draft preview for the latest visible rows or clear it below.",
      );
    } else {
      setRegularCustomerDraftInvoiceClearControlVisible(false);
      setRegularCustomerDraftInvoiceFeedback(
        "Filters changed locally. Create a new mock draft invoice preview from the currently visible rows when ready.",
      );
    }
  }

  async function loadRegularCustomerAccounts(searchTermOverride = "") {
    const requestId = regularCustomerAccountSearchRequestRef.current + 1;
    regularCustomerAccountSearchRequestRef.current = requestId;
    const trimmedSearch = searchTermOverride.trim();

    if (typeof fetch !== "function") {
      setRegularCustomerAccountReadState({
        accounts: [],
        message: "Saved customer account read is not available in this browser.",
        status: "error",
        summary: null,
        tone: "error",
      });
      return;
    }

    setRegularCustomerAccountReadState({
      accounts: [],
      message: trimmedSearch
        ? `Searching saved customer accounts starting with "${trimmedSearch}"...`
        : "Loading saved customer accounts from the guarded read path...",
      status: "loading",
      summary: null,
      tone: "info",
    });

    try {
      const params = new URLSearchParams({
        limit: "10",
      });
      if (trimmedSearch) {
        params.set("search", trimmedSearch);
      }
      const response = await fetch(`${adminCustomerAccountsApiPath}?${params.toString()}`, {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Saved customer account read could not be completed.");
      }

      const accounts = Array.isArray(result.accounts)
        ? (result.accounts as RegularCustomerAccountReadRecord[])
        : [];
      const returnedCount = Number(result.summary?.returned_count ?? accounts.length);
      const matchText = trimmedSearch ? ` matching "${trimmedSearch}"` : "";
      const accountReadTargets: RegularCustomerSavedBookingReadTarget[] = accounts.flatMap((account) => {
        const customerName = String(account.customer_account ?? "").trim();
        const customerId = String(account.customer_id ?? "").trim() || customerName;

        return customerName && customerId
          ? [
              {
                accountScopeKey: String(account.account_scope_key ?? "").trim(),
                customerId,
                customerName,
              },
            ]
          : [];
      });

      if (requestId !== regularCustomerAccountSearchRequestRef.current) {
        return;
      }

      setRegularCustomerAccountReadState({
        accounts,
        message:
          returnedCount > 0
            ? `Loaded ${returnedCount} saved customer account${returnedCount === 1 ? "" : "s"}${matchText}.`
            : `No saved customer accounts were returned${matchText}.`,
        status: "loaded",
        summary: result.summary || null,
        tone: "success",
      });
      await loadRegularCustomerSavedBookingsForUnbilledQueue(accountReadTargets);
    } catch (error) {
      setRegularCustomerAccountReadState({
        accounts: [],
        message: customerAdminReadFailureMessage("Saved customer account read", error),
        status: "error",
        summary: null,
        tone: "error",
      });
      setRegularCustomerSavedBookingReadState({
        message: "Saved customer accounts could not be loaded, so monthly billing groups were not loaded.",
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
      setRegularCustomerSavedBookingBillingReadinessState({
        closeoutsByReference: {},
        message: "Closeout billing readiness was not checked because saved customer accounts were not loaded.",
        status: "error",
        tone: "error",
      });
    }
  }

  useEffect(() => {
    const trimmedSearch = searchTerm.trim();

    if (!trimmedSearch) {
      return;
    }

    const searchTimer = window.setTimeout(() => {
      void loadRegularCustomerAccounts(trimmedSearch);
    }, 250);

    return () => window.clearTimeout(searchTimer);
    // Quick search should issue one guarded account read for the latest typed value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  async function loadPlainInvoiceCrmAccounts(searchTerm = plainInvoiceCrmSearchTerm) {
    const requestId = plainInvoiceCrmRequestSequenceRef.current + 1;
    plainInvoiceCrmRequestSequenceRef.current = requestId;
    const trimmedSearch = searchTerm.trim();

    if (typeof fetch !== "function") {
      setPlainInvoiceCrmAccountReadState({
        accounts: [],
        message: "CRM billing account read is not available in this browser.",
        status: "error",
        summary: null,
        tone: "error",
      });
      return;
    }

    setPlainInvoiceCrmAccountReadState({
      accounts: [],
      message: trimmedSearch
        ? `Searching CRM billing accounts starting with "${trimmedSearch}"...`
        : "Loading the first 10 CRM billing accounts...",
      status: "loading",
      summary: null,
      tone: "info",
    });

    try {
      const params = new URLSearchParams({
        limit: "10",
      });

      if (trimmedSearch) {
        params.set("search", trimmedSearch);
      }

      const response = await fetch(`${adminCustomerAccountsApiPath}?${params.toString()}`, {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "CRM billing account read could not be completed.");
      }

      if (requestId !== plainInvoiceCrmRequestSequenceRef.current) {
        return;
      }

      const accounts = Array.isArray(result.accounts)
        ? (result.accounts as RegularCustomerAccountReadRecord[])
        : [];
      const returnedCount = Number(result.summary?.returned_count ?? accounts.length);
      const totalCount = Number(result.summary?.total_account_count ?? returnedCount);
      const matchText = trimmedSearch ? ` starting with "${trimmedSearch}"` : "";

      setPlainInvoiceCrmAccountReadState({
        accounts,
        message:
          returnedCount > 0
            ? `Showing ${returnedCount} CRM billing account${returnedCount === 1 ? "" : "s"}${matchText}. 10 per search.`
            : `No CRM billing accounts found${matchText}.`,
        status: "loaded",
        summary: {
          ...(result.summary || {}),
          total_account_count: totalCount,
        },
        tone: returnedCount > 0 ? "success" : "info",
      });
    } catch (error) {
      if (requestId !== plainInvoiceCrmRequestSequenceRef.current) {
        return;
      }

      setPlainInvoiceCrmAccountReadState({
        accounts: [],
        message: customerAdminReadFailureMessage("CRM billing account read", error),
        status: "error",
        summary: null,
        tone: "error",
      });
    }
  }

  async function readRegularCustomerSavedBookingsForTarget(
    target: RegularCustomerSavedBookingReadTarget,
    mode: RegularCustomerSavedBookingReadMode = "account-or-id",
  ) {
    const params = new URLSearchParams({
      limit: "10",
    });

    if (mode === "customer-id" && target.customerId) {
      params.set("customer_id", target.customerId);
    } else {
      params.set("customer_account", target.customerName);
      params.set("customer_id", target.customerId);
    }

    if (target.accountScopeKey) {
      params.set("account_scope_key", target.accountScopeKey);
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

    return {
      savedBookings: Array.isArray(result.saved_bookings)
        ? (result.saved_bookings as RegularCustomerSavedBookingReadRecord[])
        : [],
      summary: result.summary || null,
      target,
    };
  }

  async function readAdminSavedBookingCustomerChargeByReference(
    bookingReference: string,
  ): Promise<Partial<RegularCustomerSavedBookingReadRecord> | null> {
    const safeReference = bookingReference.trim();

    if (!safeReference) {
      return null;
    }

    const params = new URLSearchParams({
      booking_reference: safeReference,
    });
    const response = await fetch(`${adminSavedBookingsApiPath}?${params.toString()}`, {
      headers: {
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
      method: "GET",
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || "Saved booking customer charge read could not be completed.");
    }

    const booking = result.booking as Partial<RegularCustomerSavedBookingReadRecord> | null | undefined;

    return booking ?? null;
  }

  async function enrichRegularCustomerSavedBookingsWithCustomerCharges(
    savedBookings: RegularCustomerSavedBookingReadRecord[],
  ) {
    const reads = await Promise.all(
      savedBookings.map(async (booking) => {
        const reference = savedBookingReference(booking);

        if (!reference) {
          return booking;
        }

        try {
          const chargeBooking = await readAdminSavedBookingCustomerChargeByReference(reference);

          return chargeBooking
            ? {
                ...booking,
                booking_type: chargeBooking.booking_type ?? booking.booking_type,
                child_seat_count: chargeBooking.child_seat_count ?? booking.child_seat_count,
                child_seat_customer_surcharge:
                  chargeBooking.child_seat_customer_surcharge ?? booking.child_seat_customer_surcharge,
                child_seat_required: chargeBooking.child_seat_required ?? booking.child_seat_required,
                customer_price_amount:
                  chargeBooking.customer_price_amount ?? booking.customer_price_amount,
                customer_price_override_reason:
                  chargeBooking.customer_price_override_reason ?? booking.customer_price_override_reason,
                customer_rate: chargeBooking.customer_rate ?? booking.customer_rate,
                customer_rate_override:
                  chargeBooking.customer_rate_override ?? booking.customer_rate_override,
                customer_rate_unit: chargeBooking.customer_rate_unit ?? booking.customer_rate_unit,
                extra_stop_count: chargeBooking.extra_stop_count ?? booking.extra_stop_count,
                extra_stop_surcharge: chargeBooking.extra_stop_surcharge ?? booking.extra_stop_surcharge,
                midnight_surcharge: chargeBooking.midnight_surcharge ?? booking.midnight_surcharge,
                pricing_source: chargeBooking.pricing_source ?? booking.pricing_source,
                route_type: chargeBooking.route_type ?? booking.route_type,
              }
            : booking;
        } catch {
          return booking;
        }
      }),
    );

    return reads;
  }

  async function loadRegularCustomerSavedBookingsForUnbilledQueue(
    targets: RegularCustomerSavedBookingReadTarget[],
  ) {
    const safeTargets = targets.filter((target) => target.customerId && target.customerName);

    if (safeTargets.length === 0) {
      setRegularCustomerSavedBookingReadState({
        message: "No customer accounts were available for selected-customer monthly invoice preparation.",
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
      setRegularCustomerSavedBookingBillingReadinessState({
        closeoutsByReference: {},
        message: "Closeout billing readiness was not checked because no customer folders were available.",
        status: "error",
        tone: "error",
      });
      return;
    }

    setRegularCustomerSavedBookingReadState({
      message: "Loading saved bookings for selected-customer monthly invoice preparation...",
      savedBookings: [],
      status: "loading",
      summary: null,
      tone: "info",
    });
    setRegularCustomerSavedBookingBillingReadinessState({
      closeoutsByReference: {},
      message: "Closeout billing readiness will be checked after saved bookings load.",
      status: "idle",
      tone: "info",
    });

    const reads = await Promise.all(
      safeTargets.map(async (target) => {
        try {
          return {
            ok: true,
            ...(await readRegularCustomerSavedBookingsForTarget(target, "customer-id")),
          };
        } catch (error) {
          return {
            error,
            ok: false,
            savedBookings: [] as RegularCustomerSavedBookingReadRecord[],
            summary: null,
            target,
          };
        }
      }),
    );
    const savedBookingsByReference = new Map<string, RegularCustomerSavedBookingReadRecord>();

    for (const read of reads) {
      for (const booking of read.savedBookings) {
        const reference = savedBookingReference(booking);

        if (reference && !savedBookingsByReference.has(reference)) {
          savedBookingsByReference.set(reference, booking);
        }
      }
    }

    const savedBookings = await enrichRegularCustomerSavedBookingsWithCustomerCharges(
      Array.from(savedBookingsByReference.values()),
    );
    const failedCount = reads.filter((read) => !read.ok).length;
    const returnedCount = savedBookings.length;

    if (returnedCount === 0 && failedCount === reads.length) {
      const firstFailedRead = reads.find((read) => !read.ok) as { error?: unknown } | undefined;
      setRegularCustomerSavedBookingReadState({
        message: customerAdminReadFailureMessage(
          "Saved booking read for selected-customer monthly invoice preparation",
          firstFailedRead?.error,
        ),
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
      setRegularCustomerSavedBookingBillingReadinessState({
        closeoutsByReference: {},
        message: "Closeout billing readiness was not checked because saved booking references could not be loaded.",
        status: "error",
        tone: "error",
      });
      return;
    }

    setRegularCustomerSavedBookingReadState({
      message:
        returnedCount > 0
          ? `Loaded ${returnedCount} saved booking${returnedCount === 1 ? "" : "s"} for selected-customer monthly invoice preparation.`
          : "No saved bookings returned for selected-customer monthly invoice preparation.",
      savedBookings,
      status: "loaded",
      summary: {
        matched_count: returnedCount,
        returned_count: returnedCount,
      },
      tone: failedCount > 0 ? "info" : "success",
    });
    await loadRegularCustomerSavedBookingBillingReadiness(savedBookings);
  }

  async function loadRegularCustomerSavedBookingBillingReadiness(
    savedBookings: RegularCustomerSavedBookingReadRecord[],
  ) {
    const bookingReferences = Array.from(
      new Set(savedBookings.map(savedBookingReference).filter(Boolean)),
    );

    if (bookingReferences.length === 0) {
      setRegularCustomerSavedBookingBillingReadinessState({
        closeoutsByReference: {},
        message: "No saved booking references were available for closeout billing readiness.",
        status: "loaded",
        tone: "info",
      });
      return;
    }

    setRegularCustomerSavedBookingBillingReadinessState({
      closeoutsByReference: {},
      message: "Checking completed closeout billing readiness for the loaded saved bookings...",
      status: "loading",
      tone: "info",
    });

    const closeoutReads = await Promise.all(
      bookingReferences.map(async (bookingReference) => {
        try {
          const params = new URLSearchParams({ booking_reference: bookingReference });
          const response = await fetch(`${adminCompletedBookingCloseoutApiPath}?${params.toString()}`, {
            headers: {
              "x-prestige-admin-purpose": "admin-booking-persistence",
            },
            method: "GET",
          });
          const result = await response.json().catch(() => null);

          if (!response.ok || !result?.ok) {
            throw new Error(result?.error || "Completed closeout readiness read could not be completed.");
          }

          return {
            closeout: result.closeout as RegularCustomerSavedBookingCloseoutRecord | null,
            ok: true,
            reference: bookingReference,
          };
        } catch (error) {
          return {
            closeout: null,
            error,
            ok: false,
            reference: bookingReference,
          };
        }
      }),
    );
    const closeoutsByReference = closeoutReads.reduce<
      Record<string, RegularCustomerSavedBookingCloseoutRecord>
    >((records, item) => {
      if (item.closeout) {
        records[item.reference] = item.closeout;
      }

      return records;
    }, {});
    const failedCount = closeoutReads.filter((item) => !item.ok).length;
    const readyCount = Object.values(closeoutsByReference).filter(
      savedBookingCloseoutIsBillingReady,
    ).length;

    setRegularCustomerSavedBookingBillingReadinessState({
      closeoutsByReference,
      message:
        failedCount === closeoutReads.length
          ? customerAdminReadFailureMessage(
              "Completed closeout billing readiness",
              (closeoutReads.find((item) => !item.ok) as { error?: unknown } | undefined)?.error,
            )
          : `Verified ${readyCount} closeout-ready saved booking${readyCount === 1 ? "" : "s"} for selected-customer monthly invoice preparation.`,
      status: failedCount === closeoutReads.length ? "error" : "loaded",
      tone: failedCount === closeoutReads.length ? "error" : "success",
    });
  }

  async function loadRegularCustomerSavedBookings() {
    if (!selectedRegularCustomer) {
      setRegularCustomerSavedBookingReadState({
        message: "Select a customer/account before loading saved bookings.",
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
      setRegularCustomerSavedBookingBillingReadinessState({
        closeoutsByReference: {},
        message: "Select a customer/account before checking closeout billing readiness.",
        status: "error",
        tone: "error",
      });
      return;
    }

    setRegularCustomerSavedBookingReadState({
      message: `Loading saved bookings for ${selectedRegularCustomer.companyName} through the guarded admin read path...`,
      savedBookings: [],
      status: "loading",
      summary: null,
      tone: "info",
    });
    setRegularCustomerSavedBookingBillingReadinessState({
      closeoutsByReference: {},
      message: "Closeout billing readiness will be checked after saved bookings load.",
      status: "idle",
      tone: "info",
    });

    try {
      const result = await readRegularCustomerSavedBookingsForTarget({
        accountScopeKey: "",
        customerId: selectedRegularCustomer.id,
        customerName: selectedRegularCustomer.companyName,
      });
      const savedBookings = await enrichRegularCustomerSavedBookingsWithCustomerCharges(result.savedBookings);
      const returnedCount = Number(result.summary?.returned_count ?? savedBookings.length);

      setRegularCustomerSavedBookingReadState({
        message:
          returnedCount > 0
            ? `Loaded ${returnedCount} saved booking${returnedCount === 1 ? "" : "s"} for ${selectedRegularCustomer.companyName}.`
            : `No saved bookings returned for ${selectedRegularCustomer.companyName}.`,
        savedBookings,
        status: "loaded",
        summary: result.summary,
        tone: "success",
      });
      await loadRegularCustomerSavedBookingBillingReadiness(savedBookings);
    } catch (error) {
      setRegularCustomerSavedBookingReadState({
        message: customerAdminReadFailureMessage(
          `Saved booking read for ${selectedRegularCustomer.companyName}`,
          error,
        ),
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
      setRegularCustomerSavedBookingBillingReadinessState({
        closeoutsByReference: {},
        message: "Closeout billing readiness was not checked because saved booking references could not be loaded.",
        status: "error",
        tone: "error",
      });
    }
  }

  function resetCustomerFolderJobView(message = "Open a customer folder to read that exact saved account's jobs.") {
    setCustomerFolderJobViewState({
      customerId: "",
      customerName: "",
      message,
      savedBookings: [],
      status: "idle",
      summary: null,
      tone: "info",
    });
    setExpandedCustomerFolderJobReference("");
    setCustomerFolderExactBookingEditorState(initialCustomerFolderExactBookingEditorState);
  }

  function scrollCustomerFolderJobsPanelIntoView() {
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>("[data-customer-folder-jobs-panel='true']")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function updateCustomerFolderFinderSearch(value: string) {
    setCustomerFolderFinderSelectedId("");
    setSelectedMonthlyBillingGroupKey("");
    setSelectedUnbilledCustomerRowKey("");
    setCustomerFolderFinderDropdownOpen(false);
    resetCustomerFolderJobView();
    setSearchTerm(value);
    setCustomerFolderFinderPage(1);
  }

  function updateCustomerFolderFinderSelection(value: string) {
    setCustomerFolderFinderSelectedId(value);
    setSelectedMonthlyBillingGroupKey("");
    setSelectedUnbilledCustomerRowKey("");
    setCustomerFolderFinderDropdownOpen(false);
    resetCustomerFolderJobView();
    setSearchTerm("");
    setCustomerFolderFinderPage(1);
  }

  function showAllCustomerFolderFinderRows(pageNumber = 1) {
    setCustomerFolderFinderSelectedId("");
    setSelectedMonthlyBillingGroupKey("");
    setSelectedUnbilledCustomerRowKey("");
    resetCustomerFolderJobView();
    setSearchTerm("");
    setCustomerFolderFinderPage(pageNumber);
  }

  function updateCustomerFolderExactBookingForm(
    field: keyof CustomerFolderExactBookingEditForm,
    value: string,
  ) {
    setCustomerFolderExactBookingEditorState((current) => ({
      ...current,
      form: {
        ...current.form,
        [field]: value,
      },
      message:
        current.status === "loaded" || current.status === "error"
          ? "Review changes, then Save changes. Delete stays locked unless this exact job is completed or cancelled."
          : current.message,
      status: current.status === "error" ? "loaded" : current.status,
      tone: current.status === "error" ? "info" : current.tone,
    }));
  }

  async function loadCustomerFolderExactBookingForEdit(
    booking: RegularCustomerSavedBookingReadRecord,
  ) {
    const bookingReference = safeCustomerFolderDispatchHandoffReference(booking);

    if (!bookingReference) {
      setExpandedCustomerFolderJobReference("");
      setCustomerFolderExactBookingEditorState({
        ...initialCustomerFolderExactBookingEditorState,
        message: "Cannot open this job because the saved booking reference is missing or malformed.",
        status: "error",
        tone: "error",
      });
      return null;
    }

    if (
      expandedCustomerFolderJobReference === bookingReference &&
      customerFolderExactBookingEditorState.status !== "idle"
    ) {
      setExpandedCustomerFolderJobReference("");
      setCustomerFolderExactBookingEditorState(initialCustomerFolderExactBookingEditorState);
      return null;
    }

    setExpandedCustomerFolderJobReference(bookingReference);
    setCustomerFolderExactBookingEditorState({
      ...initialCustomerFolderExactBookingEditorState,
      bookingReference,
      message: `Loading exact booking ${bookingReference}...`,
      status: "loading",
    });

    try {
      const params = new URLSearchParams({ booking_reference: bookingReference });
      const response = await fetch(`${adminBookingsApiPath}?${params.toString()}`, {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const result = (await response.json().catch(() => null)) as
        | {
            booking?: CustomerFolderExactBookingRecord | null;
            error?: string;
            ok?: boolean;
          }
        | null;
      const exactBooking = result?.booking ?? null;
      const exactReference = customerFolderExactBookingReference(exactBooking);

      if (!response.ok || result?.ok !== true || !exactBooking || exactReference !== bookingReference) {
        throw new Error(result?.error || "Exact booking read failed safely.");
      }

      setCustomerFolderExactBookingEditorState({
        booking: exactBooking,
        bookingReference,
        form: customerFolderExactBookingFormFromRecord(exactBooking),
        message: `Exact booking loaded. Status: ${customerFolderExactBookingStatusLabel(exactBooking)}.`,
        status: "loaded",
        tone: "success",
      });
      return exactBooking;
    } catch (error) {
      setCustomerFolderExactBookingEditorState({
        ...initialCustomerFolderExactBookingEditorState,
        bookingReference,
        message: customerAdminReadFailureMessage(`Exact booking read for ${bookingReference}`, error),
        status: "error",
        tone: "error",
      });
      return null;
    }
  }

  function mergeCustomerFolderSavedBookingFromExact(
    currentBooking: RegularCustomerSavedBookingReadRecord,
    exactBooking: CustomerFolderExactBookingRecord,
  ): RegularCustomerSavedBookingReadRecord {
    return {
      ...currentBooking,
      admin_status:
        cleanCustomerFolderText(exactBooking.admin_internal_status, 80) || currentBooking.admin_status,
      booking_month:
        cleanCustomerFolderText(exactBooking.pickup_at || exactBooking.pickup_datetime, 120).slice(0, 7) ||
        currentBooking.booking_month,
      booking_reference:
        customerFolderExactBookingReference(exactBooking) || currentBooking.booking_reference,
      customer_account:
        cleanCustomerFolderText(exactBooking.customer_display_name, 160) || currentBooking.customer_account,
      customer_id:
        cleanCustomerFolderText(exactBooking.customer_id, 80) || currentBooking.customer_id,
      customer_status:
        cleanCustomerFolderText(exactBooking.customer_facing_status, 80) || currentBooking.customer_status,
      pickup_at:
        cleanCustomerFolderText(exactBooking.pickup_at || exactBooking.pickup_datetime, 120) ||
        currentBooking.pickup_at,
      service_type:
        cleanCustomerFolderText(exactBooking.service_type || exactBooking.route_type, 80) ||
        currentBooking.service_type,
    };
  }

  async function saveCustomerFolderExactBookingEdit() {
    const exactBooking = customerFolderExactBookingEditorState.booking;
    const bookingReference =
      customerFolderExactBookingEditorState.bookingReference ||
      customerFolderExactBookingReference(exactBooking);

    if (!exactBooking || !bookingReference) {
      setCustomerFolderExactBookingEditorState((current) => ({
        ...current,
        message: "Load the exact booking before saving changes.",
        status: "error",
        tone: "error",
      }));
      return;
    }

    const payloadResult = customerFolderExactBookingPayload(
      exactBooking,
      customerFolderExactBookingEditorState.form,
    );

    if (!payloadResult.ok) {
      setCustomerFolderExactBookingEditorState((current) => ({
        ...current,
        message: payloadResult.error,
        status: "error",
        tone: "error",
      }));
      return;
    }

    setCustomerFolderExactBookingEditorState((current) => ({
      ...current,
      message: `Saving exact booking ${bookingReference}...`,
      status: "saving",
      tone: "info",
    }));

    try {
      const response = await fetch(adminBookingsApiPath, {
        body: JSON.stringify(payloadResult.payload),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const result = (await response.json().catch(() => null)) as
        | {
            booking?: CustomerFolderExactBookingRecord | null;
            error?: string;
            ok?: boolean;
          }
        | null;
      const updatedBooking = result?.booking ?? null;
      const updatedReference = customerFolderExactBookingReference(updatedBooking);

      if (!response.ok || result?.ok !== true || !updatedBooking || updatedReference !== bookingReference) {
        throw new Error(result?.error || "Exact booking update failed safely.");
      }

      setCustomerFolderExactBookingEditorState({
        booking: updatedBooking,
        bookingReference,
        form: customerFolderExactBookingFormFromRecord(updatedBooking),
        message: `Saved exact booking ${bookingReference}.`,
        status: "loaded",
        tone: "success",
      });
      setCustomerFolderJobViewState((current) => ({
        ...current,
        message: `Saved exact booking ${bookingReference}.`,
        savedBookings: current.savedBookings.map((currentBooking) =>
          savedBookingReference(currentBooking) === bookingReference
            ? mergeCustomerFolderSavedBookingFromExact(currentBooking, updatedBooking)
            : currentBooking,
        ),
        tone: "success",
      }));
      if (customerFolderReturnHrefRef.current) {
        window.setTimeout(() => {
          window.location.href = customerFolderReturnHrefRef.current;
        }, 900);
      }
    } catch (error) {
      setCustomerFolderExactBookingEditorState((current) => ({
        ...current,
        message: customerAdminReadFailureMessage(`Exact booking update for ${bookingReference}`, error),
        status: "error",
        tone: "error",
      }));
    }
  }

  async function deleteCustomerFolderExactBooking() {
    const exactBooking = customerFolderExactBookingEditorState.booking;
    const bookingReference =
      customerFolderExactBookingEditorState.bookingReference ||
      customerFolderExactBookingReference(exactBooking);
    const deleteBookingId = customerFolderExactBookingId(exactBooking);
    const blockReason = customerFolderExactBookingDeleteBlockReason(exactBooking);

    if (!bookingReference || !deleteBookingId || blockReason) {
      setCustomerFolderExactBookingEditorState((current) => ({
        ...current,
        message: blockReason || "Delete job failed: exact booking reference or id is missing.",
        status: "error",
        tone: "error",
      }));
      return;
    }

    const confirmed = window.confirm(
      `Delete completed/cancelled job ${bookingReference} from this customer folder? This removes the job and linked driver artifacts and cannot be undone.`,
    );

    if (!confirmed) {
      setCustomerFolderExactBookingEditorState((current) => ({
        ...current,
        message: "Delete cancelled.",
        status: "loaded",
        tone: "info",
      }));
      return;
    }

    setCustomerFolderExactBookingEditorState((current) => ({
      ...current,
      message: `Deleting exact booking ${bookingReference}...`,
      status: "deleting",
      tone: "info",
    }));

    try {
      const response = await fetch(adminSavedBookingsApiPath, {
        body: JSON.stringify({ booking_id: deleteBookingId }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "DELETE",
      });
      const result = (await response.json().catch(() => null)) as
        | {
            booking?: { id?: string | number | null; status?: string | null } | null;
            error?: string;
            ok?: boolean;
          }
        | null;
      const responseBookingId = cleanCustomerFolderText(result?.booking?.id, 120);
      const responseStatus = customerFolderStatusToken(result?.booking?.status);

      if (
        !response.ok ||
        result?.ok !== true ||
        responseBookingId !== deleteBookingId ||
        !["completed", "cancelled"].includes(responseStatus)
      ) {
        throw new Error(result?.error || "Exact booking delete failed safely.");
      }

      setCustomerFolderJobViewState((current) => {
        const nextSavedBookings = current.savedBookings.filter(
          (currentBooking) => savedBookingReference(currentBooking) !== bookingReference,
        );

        return {
          ...current,
          message: `Deleted exact completed/cancelled job ${bookingReference}.`,
          savedBookings: nextSavedBookings,
          summary: current.summary
            ? {
                ...current.summary,
                returned_count: Math.max(
                  0,
                  Number(current.summary.returned_count ?? nextSavedBookings.length + 1) - 1,
                ),
              }
            : current.summary,
          tone: "success",
        };
      });
      setExpandedCustomerFolderJobReference("");
      setCustomerFolderExactBookingEditorState({
        ...initialCustomerFolderExactBookingEditorState,
        bookingReference,
        message: `Deleted exact completed/cancelled job ${bookingReference}.`,
        status: "deleted",
        tone: "success",
      });
      if (customerFolderReturnHrefRef.current) {
        window.setTimeout(() => {
          window.location.href = customerFolderReturnHrefRef.current;
        }, 900);
      }
    } catch (error) {
      setCustomerFolderExactBookingEditorState((current) => ({
        ...current,
        message: customerAdminReadFailureMessage(`Exact booking delete for ${bookingReference}`, error),
        status: "error",
        tone: "error",
      }));
    }
  }

  async function viewCustomerFolderJobs(customer: (typeof customerFolderIndexRows)[number]) {
    setCustomerFolderFinderSelectedId(customer.customerFolderKey);
    setSelectedMonthlyBillingGroupKey("");
    setSelectedUnbilledCustomerRowKey("");
    setCustomerFolderFinderDropdownOpen(false);
    setSearchTerm("");
    setCustomerFolderFinderPage(1);
    setExpandedCustomerFolderJobReference("");
    setSelectedCustomerInvoiceDetailKey("");
    setCustomerFolderExactBookingEditorState(initialCustomerFolderExactBookingEditorState);

    setCustomerFolderJobViewState({
      customerId: customer.customerId,
      customerName: customer.customerName,
      message: `Loading saved jobs for ${customer.customerName} by exact account ID...`,
      savedBookings: [],
      status: "loading",
      summary: null,
      tone: "info",
    });
    scrollCustomerFolderJobsPanelIntoView();

    try {
      const result = await readRegularCustomerSavedBookingsForTarget(
        {
          accountScopeKey: customer.accountScopeKey,
          customerId: customer.customerId,
          customerName: customer.customerName,
        },
        "customer-id",
      );
      const savedBookings = result.savedBookings;
      const returnedCount = Number(result.summary?.returned_count ?? savedBookings.length);

      setCustomerFolderJobViewState({
        customerId: customer.customerId,
        customerName: customer.customerName,
        message:
          returnedCount > 0
            ? `Loaded ${savedBookingCountLabel(returnedCount, "saved job")} for ${customer.customerName}.`
            : `No saved jobs returned for ${customer.customerName}.`,
        savedBookings,
        status: "loaded",
        summary: result.summary,
        tone: returnedCount > 0 ? "success" : "info",
      });
    } catch (error) {
      setCustomerFolderJobViewState({
        customerId: customer.customerId,
        customerName: customer.customerName,
        message: customerAdminReadFailureMessage(`Saved job read for ${customer.customerName}`, error),
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
    }
  }

  async function openCustomerFolderFromUrl(
    customerId: string,
    customerName: string,
    bookingReference: string,
    action: "edit" | "delete" | "open",
    invoiceAction = "",
  ) {
    customerFolderReturnHrefRef.current =
      action === "edit" || action === "delete" ? customerFolderHrefFor(customerId, customerName) : "";
    setCustomerFolderFinderSelectedId("");
    setSelectedMonthlyBillingGroupKey("");
    setSelectedUnbilledCustomerRowKey("");
    setCustomerFolderFinderDropdownOpen(false);
    setSearchTerm("");
    setCustomerFolderFinderPage(1);
    setExpandedCustomerFolderJobReference("");
    setSelectedCustomerInvoiceDetailKey("");
    setCustomerFolderExactBookingEditorState(initialCustomerFolderExactBookingEditorState);
    setCustomerFolderJobViewState({
      customerId,
      customerName,
      message: `Loading saved jobs for ${customerName}...`,
      savedBookings: [],
      status: "loading",
      summary: null,
      tone: "info",
    });
    scrollCustomerFolderJobsPanelIntoView();

    try {
      const result = await readRegularCustomerSavedBookingsForTarget(
        {
          accountScopeKey: "",
          customerId,
          customerName,
        },
        "customer-id",
      );
      const savedBookings = result.savedBookings;
      const targetBooking = bookingReference
        ? savedBookings.find(
            (booking) => safeCustomerFolderDispatchHandoffReference(booking) === bookingReference,
          ) ?? null
        : null;

      setCustomerFolderJobViewState({
        customerId,
        customerName,
        message: bookingReference && !targetBooking
          ? `Loaded ${savedBookingCountLabel(savedBookings.length, "saved job")}. Job ${bookingReference} was not returned for this customer.`
          : `Loaded ${savedBookingCountLabel(savedBookings.length, "saved job")} for ${customerName}.`,
        savedBookings,
        status: "loaded",
        summary: result.summary,
        tone: bookingReference && !targetBooking ? "error" : savedBookings.length > 0 ? "success" : "info",
      });

      if (targetBooking) {
        if (invoiceAction === "create") {
          setPlainInvoiceForm(plainInvoiceInitialForm());
          setPlainInvoicePreview(null);
          setPlainInvoiceSavedBookings([]);
        }
        const exactBooking = await loadCustomerFolderExactBookingForEdit(targetBooking);
        setCustomerFolderJobViewState((current) => ({
          ...current,
          message:
            invoiceAction === "create"
              ? `Job ${bookingReference} is open for invoice preparation. Use the billing-ready row or Create Invoice workbench below after reviewing the loaded job.`
              : action === "delete"
              ? `Job ${bookingReference} is open. Delete remains guarded and requires confirmation.`
              : `Job ${bookingReference} is open for review and edit.`,
          tone: "info",
        }));
        if (invoiceAction === "create") {
          setCustomerInvoiceWorkspaceTab("statements");
          setCustomerInvoicePrepFeedback(
            `Invoice handoff received for ${bookingReference}. Review the loaded job, then prepare the billing row or use Create Invoice before sending to customer.`,
          );
          if (exactBooking) {
            const exactCustomerId = String(exactBooking.customer_id ?? customerId).trim();
            const exactCustomerName =
              String(exactBooking.customer_display_name ?? customerName).trim() || customerName;
            const exactService =
              String(exactBooking.service_type ?? targetBooking.service_type ?? "").trim();
            const exactRoute =
              String(exactBooking.route_summary ?? "").trim() ||
              [exactBooking.pickup_location, exactBooking.dropoff_location]
                .map((value) => String(value ?? "").trim())
                .filter(Boolean)
                .join(" > ") ||
              String(exactBooking.route_type ?? targetBooking.route_type ?? "").trim();
            const exactBookerId = exactBooking.booker_id ?? targetBooking.booker_id ?? null;

            setPlainInvoiceSavedBookings([targetBooking]);
            setPlainInvoiceForm({
              ...plainInvoiceInitialForm(),
              billToName: exactCustomerName,
              bookerId: exactBookerId,
              bookingReference,
              crmCustomerId: exactCustomerId,
              crmCustomerName: exactCustomerName,
              lineDescription: exactService ? `${exactService} - ${bookingReference}` : bookingReference,
              reference: bookingReference,
              route: exactRoute,
              service: exactService,
            });
            setPlainInvoiceFeedback(
              exactBookerId
                ? `Exact customer-folder job ${bookingReference} loaded with its verified PA. Enter only the approved amount, then Preview before Draft, Issue, or Email.`
                : `Exact customer-folder job ${bookingReference} has no verified PA. Draft remains admin-only; Issue and Email are blocked.`,
            );
            setPlainInvoiceFeedbackTone(exactBookerId ? "success" : "error");
            window.setTimeout(() => {
              plainInvoicePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
          } else {
            setPlainInvoiceFeedback(
              `Exact booking ${bookingReference} could not be verified for Create Invoice. Issue and Email remain blocked.`,
            );
            setPlainInvoiceFeedbackTone("error");
          }
        }
      }
    } catch (error) {
      setCustomerFolderJobViewState({
        customerId,
        customerName,
        message: customerAdminReadFailureMessage(`Saved job read for ${customerName}`, error),
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
    } finally {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const customerId = cleanCustomerFolderText(searchParams.get("customer_id"), 80);
    const customerName = cleanCustomerFolderText(searchParams.get("customer_name"), 160);
    const bookingReference = cleanCustomerFolderText(searchParams.get("booking_reference"), 120);
    const selectedBookingReferences = cleanCustomerFolderText(
      searchParams.get("selected_booking_references"),
      500,
    );
    const requestedAction = searchParams.get("customer_job_action");
    const invoiceAction = cleanCustomerFolderText(searchParams.get("customer_invoice_action"), 40);
    const action = requestedAction === "delete" ? "delete" : requestedAction === "edit" ? "edit" : "open";

    if (!customerId || !customerName) {
      return;
    }

    const handoffKey = [
      customerId,
      customerName,
      bookingReference,
      selectedBookingReferences,
      action,
      invoiceAction,
    ].join("::");

    if (customerFolderUrlHandoffRef.current === handoffKey) {
      return;
    }

    customerFolderUrlHandoffRef.current = handoffKey;
    void openCustomerFolderFromUrl(
      customerId,
      customerName,
      bookingReference,
      action,
      invoiceAction,
    );
    // URL handoff runs once so normal page interactions do not reload the selected customer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function viewCustomerJobsFromBillingRow(row: UnbilledCustomerRow) {
    setCustomerFolderFinderSelectedId(row.customerId);
    setSelectedMonthlyBillingGroupKey("");
    setSelectedUnbilledCustomerRowKey(row.key);
    setCustomerFolderFinderDropdownOpen(false);
    setSearchTerm("");
    setCustomerFolderFinderPage(1);
    setExpandedCustomerFolderJobReference("");
    setSelectedCustomerInvoiceDetailKey("");
    setCustomerFolderExactBookingEditorState(initialCustomerFolderExactBookingEditorState);

    setCustomerFolderJobViewState({
      customerId: row.customerId,
      customerName: row.customerName,
      message: `Loading saved jobs for ${row.customerName} by exact account ID...`,
      savedBookings: [],
      status: "loading",
      summary: null,
      tone: "info",
    });
    scrollCustomerFolderJobsPanelIntoView();

    try {
      const result = await readRegularCustomerSavedBookingsForTarget(
        {
          accountScopeKey: "",
          customerId: row.customerId,
          customerName: row.customerName,
        },
        "customer-id",
      );
      const savedBookings = result.savedBookings;
      const returnedCount = Number(result.summary?.returned_count ?? savedBookings.length);

      setCustomerFolderJobViewState({
        customerId: row.customerId,
        customerName: row.customerName,
        message:
          returnedCount > 0
            ? `Loaded ${savedBookingCountLabel(returnedCount, "saved job")} for ${row.customerName}.`
            : `No saved jobs returned for ${row.customerName}.`,
        savedBookings,
        status: "loaded",
        summary: result.summary,
        tone: returnedCount > 0 ? "success" : "info",
      });
    } catch (error) {
      setCustomerFolderJobViewState({
        customerId: row.customerId,
        customerName: row.customerName,
        message: customerAdminReadFailureMessage(`Saved job read for ${row.customerName}`, error),
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
    }
  }

  function reviewSelectedCustomerInvoice(invoiceKey: string) {
    setSelectedCustomerInvoiceDetailKey(invoiceKey);
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>("[data-selected-customer-invoice-detail='true']")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  function updateOutstandingReviewSearch(value: string) {
    setOutstandingReviewSearchTerm(value);
    setOutstandingReviewPage(1);
  }

  function updateOutstandingReviewFilter(value: OutstandingReviewFilter) {
    setOutstandingReviewFilter(value);
    setOutstandingReviewPage(1);
  }

  function updateOutstandingReviewSort(value: OutstandingReviewSort) {
    setOutstandingReviewSort(value);
    setOutstandingReviewPage(1);
  }

  function updateOutstandingReviewPageSize(value: number) {
    setOutstandingReviewPageSize(value);
    setOutstandingReviewPage(1);
  }

  function updateSelectedMonthlyBillingGroup(value: string) {
    setSelectedMonthlyBillingGroupKey(value);
    setSelectedUnbilledCustomerRowKey("");
  }

  function monthlyBillingGroupReference(group: CustomerMonthlyBillingGroup) {
    const accountSlug = plainInvoiceSlug(group.customerName).toUpperCase().slice(0, 24) || "CUSTOMER";
    const scopeSlug = plainInvoiceSlug(group.accountScopeKey).toUpperCase().slice(0, 16) || "GENERAL";
    const monthSlug = group.billingMonth || "MONTH-REVIEW";

    return `MONTHLY-${accountSlug}-${scopeSlug}-${monthSlug}`;
  }

  function monthlyBillingInvoiceAmountInput(row: UnbilledCustomerRow) {
    const amountCents = parseInvoiceAmountToCents(row.amount);

    return amountCents ? formatInvoiceAmount(amountCents).replace(/^\$/, "") : "";
  }

  function monthlyBillingInvoiceLineDescription(row: UnbilledCustomerRow) {
    return (
      row.invoiceLineDescription ||
      `${row.dateLabel} | ${row.service} | ${row.reference}`
    ).slice(0, customerInvoiceLineDescriptionMaxLength);
  }

  function prepareMonthlyBillingGroupForInvoice(group: CustomerMonthlyBillingGroup) {
    if (group.rows.length === 0) {
      setPlainInvoiceFeedback("No jobs are available in this billing account/month group.");
      setPlainInvoiceFeedbackTone("error");
      return;
    }

    if (group.needsScopeReview) {
      setPlainInvoiceFeedback(
        "Monthly bill prep is blocked until every job in this group has a passenger/traveller billing scope. Open the exact booking and save the passenger before preparing an invoice.",
      );
      setPlainInvoiceFeedbackTone("error");
      return;
    }

    const preparedRows = group.rows.slice(0, plainInvoiceMaxLineItems);
    const overflowCount = Math.max(0, group.rows.length - preparedRows.length);
    const [firstRow, ...additionalRows] = preparedRows;
    const referenceList = group.rows.map((row) => row.reference).filter(Boolean);
    const groupLabel = group.accountScopeLabel
      ? `${group.customerName} / ${group.accountScopeLabel}`
      : group.customerName;

    setPreparingMonthlyBillingGroupKey(group.key);
    setPlainInvoiceForm({
      amount: monthlyBillingInvoiceAmountInput(firstRow),
      billToEmail: "",
      billToName: group.customerName,
      bookerId: firstRow.bookerId,
      bookingReference: firstRow.reference,
      cardFeeApplies: false,
      cardPaymentEnabled: false,
      crmCustomerId: group.customerId,
      crmCustomerName: group.customerName,
      dueDateIso: invoiceDateInputDaysFromNow(7),
      isPaid: false,
      lineDescription: monthlyBillingInvoiceLineDescription(firstRow),
      lineItems: additionalRows.map((row) => ({
        amount: monthlyBillingInvoiceAmountInput(row),
        lineDescription: monthlyBillingInvoiceLineDescription(row),
      })),
      reference: monthlyBillingGroupReference(group),
      route: `${group.rows.length} job${group.rows.length === 1 ? "" : "s"}: ${referenceList.join(", ")}`,
      service: `Monthly billing - ${group.billingMonthLabel}`,
    });
    setSelectedPlainInvoiceCrmFolderKey(group.key);
    setPlainInvoicePreview(null);
    setPlainInvoiceCrmPickerOpen(false);
    setCustomerInvoiceWorkspaceTab("statements");
    setPlainInvoiceFeedback(
      overflowCount > 0
        ? `${groupLabel} / ${group.billingMonthLabel} loaded with the first ${preparedRows.length} jobs. ${overflowCount} more job${overflowCount === 1 ? "" : "s"} must be prepared in another invoice or after the invoice line-item limit is expanded. Enter approved amounts before Preview, Draft, Issue, or Email.`
        : `${groupLabel} / ${group.billingMonthLabel} loaded into Create Invoice. Enter approved amounts, review line descriptions, then Preview before Draft, Issue, or Email.`,
    );
    setPlainInvoiceFeedbackTone(overflowCount > 0 ? "info" : "success");

    window.setTimeout(() => {
      const drawer = document.querySelector<HTMLDetailsElement>(
        "[data-customer-billing-workbench-drawer='true']",
      );

      if (drawer) {
        drawer.open = true;
      }

      plainInvoicePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector<HTMLElement>("[data-plain-invoice-amount='true']")?.focus();
      setPreparingMonthlyBillingGroupKey("");
    }, 150);
  }

  function prepareSelectedCustomerMonthlyInvoice() {
    if (!selectedCustomerPrimaryMonthlyBillingGroup) {
      setPlainInvoiceFeedback(
        "No completed billing-ready jobs are available for this selected customer yet.",
      );
      setPlainInvoiceFeedbackTone("info");
      return;
    }

    setSelectedMonthlyBillingGroupKey(selectedCustomerPrimaryMonthlyBillingGroup.key);
    prepareMonthlyBillingGroupForInvoice(selectedCustomerPrimaryMonthlyBillingGroup);
  }

  async function readCustomerInvoiceDriverActualTimeSummary(bookingReference: string) {
    const params = new URLSearchParams({
      booking_reference: bookingReference,
      limit: "1",
    });
    const response = await fetch(`${adminDriverJobDspActualTimeSummariesApiPath}?${params.toString()}`, {
      headers: {
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
      method: "GET",
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok) {
      throw new Error(result?.error || "Driver JC timing read could not be completed.");
    }

    return (
      (result.latest_summary as CustomerInvoiceDriverActualTimeSummary | null | undefined) ??
      (result.summary as CustomerInvoiceDriverActualTimeSummary | null | undefined) ??
      (Array.isArray(result.summaries)
        ? (result.summaries[0] as CustomerInvoiceDriverActualTimeSummary | undefined)
        : null) ??
      null
    );
  }

  async function prepareCustomerInvoiceFromUnbilled(row: UnbilledCustomerRow) {
    if (row.needsScopeReview) {
      setCustomerInvoicePrepFeedback(
        "Invoice prep is blocked until this job has a passenger/traveller billing scope. Open the exact booking and save the passenger before preparing an invoice.",
      );
      return;
    }

    const suggestedAmountCents = parseInvoiceAmountToCents(row.amount);
    const baseCalculation = getCustomerInvoiceRowCalculatedAmount(row);
    const bookingReference = validCustomerInvoiceDriverTimingReference(row.reference);
    const shouldReadDriverActualTime = isHourlyCustomerInvoiceRow(row) && Boolean(bookingReference);

    setPreparingUnbilledCustomerRowKey(row.key);
    setSelectedUnbilledCustomerRowKey(row.key);
    setCustomerInvoicePrepRowKey(row.key);
    customerInvoicePrepRowKeyRef.current = row.key;
    setCustomerInvoiceWorkspaceTab("statements");
    setCustomerInvoiceIssueAmount(suggestedAmountCents ? row.amount.replace(/^\$/, "") : "");
    setCustomerInvoiceIssueDueDate(invoiceDateInputDaysFromNow(7));
    setCustomerInvoiceIssueStatus("Unpaid");
    setCustomerInvoiceDocumentType("invoice");
    setCustomerInvoiceRecipientEmail("");
    setCustomerInvoiceCardPaymentEnabled(false);
    setCustomerInvoiceCardFeeApplies(false);
    setCustomerInvoicePreview(null);
    setCustomerInvoiceAdjustmentReason("");
    setCustomerInvoiceCalculatedAmountCents(baseCalculation?.amountCents ?? null);
    setCustomerInvoiceCalculatedBillingBreakdown(baseCalculation?.billingBreakdown ?? "");
    setCustomerInvoiceCalculatedLineDescription(baseCalculation?.invoiceLineDescription ?? "");
    setCustomerInvoiceCalculatedSourceLabel(baseCalculation?.sourceLabel ?? "");
    setCustomerInvoiceDriverActualTimeReadState({
      bookingReference,
      message: shouldReadDriverActualTime
        ? `Checking driver JC timing for ${bookingReference}...`
        : isHourlyCustomerInvoiceRow(row)
          ? "Driver JC timing can be checked only when the unbilled row has a saved booking reference."
          : "Driver JC timing check is skipped for non-hourly invoice rows.",
      status: shouldReadDriverActualTime ? "loading" : "skipped",
      summary: null,
      tone: "info",
    });
    setOutstandingReviewSearchTerm(row.customerName);
    setOutstandingReviewFilter("all");
    setOutstandingReviewPage(1);
    setCollectionFollowUpPage(1);
    setMonthlyStatementPage(1);
    setCustomerInvoicePrepFeedback(
      `${row.customerName} loaded for selected-customer invoice preparation. Review the amount and route, then issue only when the invoice is correct.`,
    );
    setCustomerInvoiceIssueFeedback(
      suggestedAmountCents
        ? "Amount copied from the selected unbilled row. Review before issuing."
        : "Enter the approved customer amount before issuing this invoice.",
    );
    window.setTimeout(() => {
      setPreparingUnbilledCustomerRowKey("");
      const nextAction =
        document.querySelector<HTMLElement>("[data-customer-invoice-prep-next-action='true']") ??
        customerInvoicePrepPanelRef.current;

      customerInvoicePrepPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      nextAction?.focus();
    }, 250);

    if (!shouldReadDriverActualTime) {
      return;
    }

    try {
      const summary = await readCustomerInvoiceDriverActualTimeSummary(bookingReference);

      if (customerInvoicePrepRowKeyRef.current !== row.key) {
        return;
      }

      const driverCalculation = getCustomerInvoiceDriverActualTimeCalculatedAmount(row, summary);

      if (!driverCalculation) {
        setCustomerInvoiceDriverActualTimeReadState({
          bookingReference,
          message:
            summary?.actual_time_status === "complete"
              ? "Driver JC timing was found, but actual minutes were not ready for invoice calculation."
              : "Driver JC timing is not complete yet. Review or enter the approved amount before issuing.",
          status: "loaded",
          summary,
          tone: "info",
        });
        return;
      }

      setCustomerInvoiceCalculatedAmountCents(driverCalculation.amountCents);
      setCustomerInvoiceCalculatedBillingBreakdown(driverCalculation.billingBreakdown);
      setCustomerInvoiceCalculatedLineDescription(driverCalculation.invoiceLineDescription);
      setCustomerInvoiceCalculatedSourceLabel(driverCalculation.sourceLabel);
      setCustomerInvoiceIssueAmount(formatInvoiceAmount(driverCalculation.amountCents).replace(/^\$/, ""));
      setCustomerInvoiceDriverActualTimeReadState({
        bookingReference,
        message: `${driverCalculation.sourceLabel} applied: ${driverCalculation.billingBreakdown}`,
        status: "loaded",
        summary,
        tone: "success",
      });
      setCustomerInvoiceIssueFeedback(
        "Driver JC timing loaded into Approved amount. Review it, then issue only when correct.",
      );
    } catch (error) {
      if (customerInvoicePrepRowKeyRef.current !== row.key) {
        return;
      }

      setCustomerInvoiceDriverActualTimeReadState({
        bookingReference,
        message: `${customerAdminReadFailureMessage("Driver JC timing read", error)} Keep the row amount or enter the approved amount before issuing.`,
        status: "error",
        summary: null,
        tone: "error",
      });
    }
  }

  function clearCustomerInvoicePrep() {
    setCustomerInvoicePrepRowKey("");
    customerInvoicePrepRowKeyRef.current = "";
    setPreparingUnbilledCustomerRowKey("");
    setIssuingCustomerInvoiceKey("");
    setCustomerInvoiceIssueAmount("");
    setCustomerInvoiceIssueDueDate(invoiceDateInputDaysFromNow(7));
    setCustomerInvoiceIssueStatus("Unpaid");
    setCustomerInvoiceDocumentType("invoice");
    setCustomerInvoiceRecipientEmail("");
    setCustomerInvoiceCardPaymentEnabled(false);
    setCustomerInvoiceCardFeeApplies(false);
    setCustomerInvoicePreview(null);
    setCustomerInvoiceAdjustmentReason("");
    setCustomerInvoiceCalculatedAmountCents(null);
    setCustomerInvoiceCalculatedBillingBreakdown("");
    setCustomerInvoiceCalculatedLineDescription("");
    setCustomerInvoiceCalculatedSourceLabel("");
    setCustomerInvoiceDriverActualTimeReadState({
      bookingReference: "",
      message: "Driver JC timing is checked after an hourly unbilled row is prepared.",
      status: "idle",
      summary: null,
      tone: "info",
    });
    setOutstandingReviewSearchTerm("");
    setOutstandingReviewPage(1);
    setCustomerInvoicePrepFeedback(
      "Invoice prep selection cleared. Open the selected customer workspace and choose Prepare monthly invoice to load a billing account/month.",
    );
    setCustomerInvoiceIssueFeedback(
      "Review the amount and due date before issuing. Invoice number is created only when you click issue.",
    );
  }

  function focusPlainInvoicePanel() {
    setCustomerInvoiceWorkspaceTab("statements");
    setPlainInvoiceFeedback(
      "Create Invoice form ready. Preview first; Draft or Issue creates the invoice number.",
    );
    setPlainInvoiceFeedbackTone("info");
    window.setTimeout(() => {
      plainInvoicePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.querySelector<HTMLElement>("[data-plain-invoice-bill-to-name='true']")?.focus();
    }, 50);
  }

  function updatePlainInvoiceForm<K extends keyof PlainInvoiceForm>(
    field: K,
    value: PlainInvoiceForm[K],
  ) {
    const referenceClearsVerifiedOwnership =
      field === "reference" &&
      typeof value === "string" &&
      Boolean(plainInvoiceForm.bookingReference) &&
      value.trim() !== plainInvoiceForm.bookingReference;

    if (field === "billToName") {
      setSelectedPlainInvoiceCrmFolderKey("");
    }

    setPlainInvoiceForm((currentForm) => {
      const nextForm = {
        ...currentForm,
        [field]: value,
      };

      if (field === "cardPaymentEnabled" && value === false) {
        nextForm.cardFeeApplies = false;
      }

      if (
        field === "billToName" &&
        typeof value === "string" &&
        currentForm.crmCustomerName &&
        value.trim() !== currentForm.crmCustomerName
      ) {
        nextForm.crmCustomerId = "";
        nextForm.crmCustomerName = "";
        nextForm.bookerId = null;
        nextForm.bookingReference = "";
      }

      if (
        field === "reference" &&
        typeof value === "string" &&
        currentForm.bookingReference &&
        value.trim() !== currentForm.bookingReference
      ) {
        nextForm.bookerId = null;
        nextForm.bookingReference = "";
      }

      return nextForm;
    });

    if (referenceClearsVerifiedOwnership) {
      setPlainInvoicePreview(null);
      setPlainInvoiceFeedback(
        "Reference changed. Select the exact saved booking and verified PA again before Issue or Email.",
      );
      setPlainInvoiceFeedbackTone("error");
    }
  }

  async function updatePlainInvoiceCrmBillingAccount(customerFolderKey: string) {
    const selectedAccount =
      plainInvoiceCrmAccountOptions.find((account) => account.customerFolderKey === customerFolderKey) || null;

    setSelectedPlainInvoiceCrmFolderKey(selectedAccount?.customerFolderKey || "");
    const requestId = plainInvoiceSavedBookingRequestSequenceRef.current + 1;
    plainInvoiceSavedBookingRequestSequenceRef.current = requestId;
    setPlainInvoiceSavedBookings([]);
    setPlainInvoiceSavedBookingsLoading(Boolean(selectedAccount));
    setPlainInvoiceForm((currentForm) => ({
      ...currentForm,
      billToName: selectedAccount?.customerName || currentForm.billToName,
      crmCustomerId: selectedAccount?.customerId || "",
      crmCustomerName: selectedAccount?.customerName || "",
      bookerId: null,
      bookingReference: "",
    }));

    setPlainInvoiceFeedback(
      selectedAccount
        ? `Loading exact saved bookings for ${selectedAccount.customerName}...`
        : "Create Invoice switched to manual bill-to. Refresh preview before Draft, Issue, or Email.",
    );
    setPlainInvoiceFeedbackTone("info");
    setPlainInvoiceCrmPickerOpen(false);

    if (!selectedAccount) return;

    try {
      const result = await readRegularCustomerSavedBookingsForTarget({
        accountScopeKey: selectedAccount.accountScopeKey,
        customerId: selectedAccount.customerId,
        customerName: selectedAccount.customerName,
      });
      if (requestId !== plainInvoiceSavedBookingRequestSequenceRef.current) return;

      setPlainInvoiceSavedBookings(result.savedBookings);
      setPlainInvoiceFeedback(
        result.savedBookings.length > 0
          ? `Loaded ${result.savedBookings.length} exact saved booking${result.savedBookings.length === 1 ? "" : "s"} for ${selectedAccount.customerName}. Select one before Issue or Email.`
          : `No exact saved bookings were returned for ${selectedAccount.customerName}. Draft remains admin-only; Issue and Email are blocked.`,
      );
      setPlainInvoiceFeedbackTone(result.savedBookings.length > 0 ? "success" : "error");
    } catch (error) {
      if (requestId !== plainInvoiceSavedBookingRequestSequenceRef.current) return;
      setPlainInvoiceFeedback(customerAdminReadFailureMessage("Exact saved booking read", error));
      setPlainInvoiceFeedbackTone("error");
    } finally {
      if (requestId === plainInvoiceSavedBookingRequestSequenceRef.current) {
        setPlainInvoiceSavedBookingsLoading(false);
      }
    }
  }

  function updatePlainInvoiceSavedBooking(bookingReference: string) {
    const selectedBooking = plainInvoiceSavedBookingOptions.find(
      (booking) => savedBookingReference(booking) === bookingReference,
    );
    setPlainInvoiceForm((currentForm) => ({
      ...currentForm,
      bookerId: selectedBooking?.booker_id ?? null,
      bookingReference: selectedBooking ? bookingReference : "",
      reference: selectedBooking ? bookingReference : currentForm.reference,
    }));
    setPlainInvoicePreview(null);
    setPlainInvoiceFeedback(
      selectedBooking
        ? selectedBooking.booker_id
          ? `Exact booking ${bookingReference} linked to its verified PA. Preview again before Draft, Issue, or Email.`
          : `Exact booking ${bookingReference} has no verified PA. Draft remains admin-only; Issue and Email are blocked.`
        : "Choose an exact saved booking before issuing or emailing this invoice.",
    );
    setPlainInvoiceFeedbackTone(selectedBooking && !selectedBooking.booker_id ? "error" : "info");
  }

  function updatePlainInvoiceCrmSearchTerm(value: string) {
    setPlainInvoiceCrmSearchTerm(value);
    setPlainInvoiceCrmPickerOpen(true);
    void loadPlainInvoiceCrmAccounts(value);
  }

  function updatePlainInvoiceAdditionalLineItem(
    index: number,
    field: keyof PlainInvoiceAdditionalLineItem,
    value: string,
  ) {
    setPlainInvoiceForm((currentForm) => ({
      ...currentForm,
      lineItems: currentForm.lineItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    }));
  }

  function addPlainInvoiceLineItem() {
    if (plainInvoiceForm.lineItems.length >= plainInvoiceMaxLineItems - 1) {
      setPlainInvoiceFeedback(`Create Invoice supports up to ${plainInvoiceMaxLineItems} visible line items.`);
      setPlainInvoiceFeedbackTone("error");
      return;
    }

    setPlainInvoiceForm((currentForm) => ({
      ...currentForm,
      lineItems: [
        ...currentForm.lineItems,
        {
          amount: "",
          lineDescription: "",
        },
      ],
    }));
    setPlainInvoiceFeedback("Line item added. Refresh preview before Draft, Issue, or Email.");
    setPlainInvoiceFeedbackTone("info");
  }

  function removePlainInvoiceLineItem(index: number) {
    setPlainInvoiceForm((currentForm) => ({
      ...currentForm,
      lineItems: currentForm.lineItems.filter((_, itemIndex) => itemIndex !== index),
    }));
    setPlainInvoiceFeedback("Line item removed. Refresh preview before Draft, Issue, or Email.");
    setPlainInvoiceFeedbackTone("info");
  }

  function clearPlainInvoiceForm() {
    setPlainInvoiceForm(plainInvoiceInitialForm());
    setPlainInvoicePreview(null);
    setPlainInvoiceFeedback(
      "Create Invoice cleared. No invoice number, PDF, email, payment, or customer folder was created.",
    );
    setPlainInvoiceFeedbackTone("info");
  }

  function previewPlainInvoice() {
    const billToName = plainInvoiceForm.billToName.trim();
    const billingCustomerName = plainInvoiceForm.crmCustomerName.trim() || billToName;
    const reference = plainInvoiceForm.reference.trim();
    const service = plainInvoiceForm.service.trim();
    const amountCents = plainInvoiceAmountCents;
    const dueDate = new Date(`${plainInvoiceForm.dueDateIso}T00:00:00+08:00`);
    const lineItemsValidationMessage = plainInvoiceLineItemValidationMessage(plainInvoiceForm);
    const lineItems = plainInvoiceLineItemsFromForm(plainInvoiceForm, {
      includeCardPaymentNote: true,
    }).map(({ amountLabel, description }) => ({
      amountLabel,
      description,
    }));

    if (!billToName) {
      setPlainInvoiceFeedback("Enter the bill-to name before previewing Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-bill-to-name='true']")?.focus();
      return;
    }

    if (!reference) {
      setPlainInvoiceFeedback("Enter a manual reference before previewing Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-reference='true']")?.focus();
      return;
    }

    if (!service) {
      setPlainInvoiceFeedback("Enter the service label before previewing Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-service='true']")?.focus();
      return;
    }

    if (lineItemsValidationMessage) {
      setPlainInvoiceFeedback(lineItemsValidationMessage);
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-line-description='true']")?.focus();
      return;
    }

    if (!amountCents) {
      setPlainInvoiceFeedback("Enter the invoice amount before previewing Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-amount='true']")?.focus();
      return;
    }

    if (Number.isNaN(dueDate.getTime())) {
      setPlainInvoiceFeedback("Choose the due date before previewing Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-due-date='true']")?.focus();
      return;
    }

    setPlainInvoicePreview({
      amountCents,
      amountLabel: formatInvoiceAmount(amountCents),
      cardFeeApplies: plainInvoiceForm.cardFeeApplies,
      cardPaymentEnabled: plainInvoiceForm.cardPaymentEnabled,
      customerName: billingCustomerName,
      documentType: "invoice",
      dueDateIso: plainInvoiceForm.dueDateIso,
      dueDateLabel: formatInvoiceDate(dueDate),
      folder: plainInvoiceForm.isPaid ? "Paid" : "Unpaid",
      lineDescription: lineItems[0]?.description || "",
      lineItems,
      previewKey: plainInvoiceCurrentPreviewKey,
      reference,
      route: plainInvoiceForm.route.trim() || "Ad-hoc invoice / no trip route",
      service,
      sourceLabel: plainInvoiceForm.crmCustomerId
        ? "Linked CRM billing account"
        : "Create Invoice manual entry",
    });
    setPlainInvoiceFeedback(
      `Create Invoice preview ready with ${lineItems.length} line item${
        lineItems.length === 1 ? "" : "s"
      }. Draft or Issue will create the invoice number.`,
    );
    setPlainInvoiceFeedbackTone("success");
    window.setTimeout(() => {
      document.querySelector<HTMLElement>("[data-plain-invoice-issue-action='true']")?.focus();
    }, 50);
  }

  function plainInvoiceRequestBodyFromPreview(documentState: CustomerBillingDocumentState) {
    if (!plainInvoicePreview || !isPlainInvoicePreviewCurrent) {
      return null;
    }

    return {
      amountCents: plainInvoicePreview.amountCents,
      billingMonthLabel: formatInvoiceMonth(new Date()),
      customerEmail: plainInvoiceForm.billToEmail,
      customerId:
        plainInvoiceForm.crmCustomerId.trim() ||
        plainInvoiceCustomerId(
          plainInvoicePreview.reference,
          plainInvoicePreview.customerName,
        ),
      customerName: plainInvoicePreview.customerName,
      bookerId: plainInvoiceForm.bookerId,
      bookingReference: plainInvoiceForm.bookingReference,
      documentState,
      documentType: "invoice" as CustomerBillingDocumentType,
      dueDateIso: plainInvoicePreview.dueDateIso,
      lineItems: plainInvoicePreview.lineItems,
      reference: plainInvoicePreview.reference,
      route: plainInvoicePreview.route,
      service: plainInvoicePreview.service,
      status: plainInvoicePreview.folder,
    };
  }

  async function savePlainInvoiceDraft() {
    if (!plainInvoicePreview || !isPlainInvoicePreviewCurrent) {
      setPlainInvoiceFeedback("Preview first, then save the Create Invoice draft.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-preview-action='true']")?.focus();
      return;
    }

    const requestBody = plainInvoiceRequestBodyFromPreview("draft");

    if (!requestBody) {
      setPlainInvoiceFeedback("Preview first, then save the Create Invoice draft.");
      setPlainInvoiceFeedbackTone("error");
      return;
    }

    setIssuingCustomerInvoiceKey(plainInvoiceDraftActionKey);

    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result.invoice) {
        throw new Error(result?.error || "Create Invoice draft save");
      }

      const draftInvoice = {
        ...(result.invoice as CustomerDisplayedInvoiceRecord),
        storageSource: "server" as const,
      };

      setCustomerInvoiceDrafts((drafts) =>
        [
          invoiceDraftRecordFromDisplayedInvoice(draftInvoice),
          ...drafts.filter((draft) => draft.draftId !== draftInvoice.invoiceNumber),
        ].slice(0, 10),
      );
      setPlainInvoiceFeedback(
        `Create Invoice draft saved as ${draftInvoice.invoiceNumber}. It is admin-only until issued.`,
      );
      setPlainInvoiceFeedbackTone("success");
    } catch (error) {
      setPlainInvoiceFeedback(customerInvoiceActionFailureMessage("Create Invoice draft save", error));
      setPlainInvoiceFeedbackTone("error");
    } finally {
      window.setTimeout(() => setIssuingCustomerInvoiceKey(""), 700);
    }
  }

  async function issuePlainInvoice() {
    if (!plainInvoicePreview || !isPlainInvoicePreviewCurrent) {
      setPlainInvoiceFeedback("Preview first, then issue Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-preview-action='true']")?.focus();
      return;
    }

    const requestBody = plainInvoiceRequestBodyFromPreview("issued");

    if (!requestBody) {
      setPlainInvoiceFeedback("Preview first, then issue Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      return;
    }

    if (!plainInvoiceForm.bookingReference || !plainInvoiceForm.bookerId) {
      setPlainInvoiceFeedback("Select an exact saved booking with a verified PA / booker before issuing Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-booking-reference='true']")?.focus();
      return;
    }

    if (
      !confirmInvoiceSafetyAction({
        action: "Issue Create Invoice",
        amountLabel: plainInvoicePreview.amountLabel,
        consequence: "This creates an issued invoice number, stores the PDF, and starts the PDF download.",
        customerName: plainInvoicePreview.customerName,
        documentLabel: "Invoice",
        reference: plainInvoicePreview.reference,
      })
    ) {
      setPlainInvoiceFeedback(
        "Create Invoice issue cancelled. No invoice number, PDF, email, payment, or customer folder was changed.",
      );
      setPlainInvoiceFeedbackTone("info");
      return;
    }

    setIssuingCustomerInvoiceKey(plainInvoiceIssueActionKey);

    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result.invoice) {
        throw new Error(result?.error || "Create Invoice issue");
      }

      const issuedInvoice = {
        ...(result.invoice as CustomerDisplayedInvoiceRecord),
        storageSource: "server" as const,
      };

      saveCustomerLocalInvoice(issuedInvoice);
      updateIssuedInvoiceState(issuedInvoice);
      setPlainInvoiceFeedback(
        `Create Invoice ${issuedInvoice.invoiceNumber} stored with PDF. PDF download started.`,
      );
      setPlainInvoiceFeedbackTone("success");
      await downloadStoredCustomerInvoicePdf(issuedInvoice);
      setPlainInvoicePreview(null);
    } catch (error) {
      setPlainInvoiceFeedback(customerInvoiceActionFailureMessage("Create Invoice issue", error));
      setPlainInvoiceFeedbackTone("error");
    } finally {
      window.setTimeout(() => setIssuingCustomerInvoiceKey(""), 700);
    }
  }

  async function emailPlainInvoice() {
    if (!plainInvoicePreview || !isPlainInvoicePreviewCurrent) {
      setPlainInvoiceFeedback("Preview first, then email Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-preview-action='true']")?.focus();
      return;
    }

    const recipientEmail = plainInvoiceForm.billToEmail.trim();

    if (!recipientEmail) {
      setPlainInvoiceFeedback("Enter an email address before emailing Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-bill-to-email='true']")?.focus();
      return;
    }

    const requestBody = plainInvoiceRequestBodyFromPreview("issued");

    if (!requestBody) {
      setPlainInvoiceFeedback("Preview first, then email Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      return;
    }

    if (!plainInvoiceForm.bookingReference || !plainInvoiceForm.bookerId) {
      setPlainInvoiceFeedback("Select an exact saved booking with a verified PA / booker before emailing Create Invoice.");
      setPlainInvoiceFeedbackTone("error");
      document.querySelector<HTMLElement>("[data-plain-invoice-booking-reference='true']")?.focus();
      return;
    }

    if (
      !confirmInvoiceSafetyAction({
        action: "Email Create Invoice",
        amountLabel: plainInvoicePreview.amountLabel,
        consequence:
          "This creates an issued invoice number, stores the PDF, then sends the invoice email through the guarded route.",
        customerName: plainInvoicePreview.customerName,
        documentLabel: "Invoice",
        recipientEmail,
        reference: plainInvoicePreview.reference,
      })
    ) {
      setPlainInvoiceFeedback(
        "Create Invoice email cancelled. No invoice number, PDF, email, payment, or customer folder was changed.",
      );
      setPlainInvoiceFeedbackTone("info");
      return;
    }

    let issuedInvoiceNumber = "";

    setIssuingCustomerInvoiceKey(plainInvoiceEmailActionKey);

    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result.invoice) {
        throw new Error(result?.error || "Create Invoice email issue");
      }

      const issuedInvoice = {
        ...(result.invoice as CustomerDisplayedInvoiceRecord),
        storageSource: "server" as const,
      };

      issuedInvoiceNumber = issuedInvoice.invoiceNumber;
      saveCustomerLocalInvoice(issuedInvoice);
      updateIssuedInvoiceState(issuedInvoice);

      const emailResponse = await fetch(adminCustomerInvoiceEmailApiPath, {
        body: JSON.stringify({
          invoiceNumber: issuedInvoice.invoiceNumber,
          recipientEmail,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const emailResult = await emailResponse.json().catch(() => null);

      if (emailResult?.invoice) {
        updateIssuedInvoiceState({
          ...(emailResult.invoice as CustomerDisplayedInvoiceRecord),
          storageSource: "server",
        });
      }

      if (!emailResponse.ok || !emailResult?.ok) {
        throw new Error(emailResult?.error || "Create Invoice email could not be sent.");
      }

      setPlainInvoiceFeedback(`Create Invoice ${issuedInvoice.invoiceNumber} emailed to ${recipientEmail}.`);
      setPlainInvoiceFeedbackTone("success");
      setPlainInvoicePreview(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Create Invoice email could not be sent.";

      setPlainInvoiceFeedback(
        issuedInvoiceNumber
          ? `${issuedInvoiceNumber} was issued, but email was not sent: ${customerInvoiceActionFailureMessage("Create Invoice email", message)}`
          : customerInvoiceActionFailureMessage("Create Invoice email", message),
      );
      setPlainInvoiceFeedbackTone("error");
    } finally {
      window.setTimeout(() => setIssuingCustomerInvoiceKey(""), 700);
    }
  }

  function customerInvoiceLineDescriptionForPreview(
    row: UnbilledCustomerRow,
    amountEdited: boolean,
  ) {
    const baseDescription = amountEdited
      ? `${row.service} - approved customer amount - ${row.reference}`
      : customerInvoiceCalculatedLineDescription ||
          row.invoiceLineDescription ||
          `${row.service} - ${row.reference} - ${row.route}`;

    return appendCustomerInvoiceCardPaymentNote(
      baseDescription,
      customerInvoiceCardPaymentEnabled,
      customerInvoiceCardFeeApplies,
    );
  }

  function previewPreparedCustomerInvoice() {
    if (!customerInvoicePrepRow) {
      setCustomerInvoiceIssueFeedback(
        `Choose Prepare monthly invoice in the selected customer workspace before previewing a ${customerBillingDocumentLabel(
          customerInvoiceDocumentType,
        ).toLowerCase()}.`,
      );
      return;
    }

    const amountCents = parseInvoiceAmountToCents(customerInvoiceIssueAmount);

    if (!amountCents) {
      setCustomerInvoiceIssueFeedback(
        "Enter the approved customer amount before previewing. This prevents under-billing or over-billing.",
      );
      return;
    }

    if (customerInvoiceAmountEdited && !customerInvoiceAdjustmentReason.trim()) {
      setCustomerInvoiceIssueFeedback(
        `Enter adjustment reason before previewing a ${customerBillingDocumentLabel(
          customerInvoiceDocumentType,
        ).toLowerCase()} with an edited amount.`,
      );
      document
        .querySelector<HTMLElement>("[data-customer-invoice-override-reason='true']")
        ?.focus();
      return;
    }

    const dueDate = new Date(`${customerInvoiceIssueDueDate}T00:00:00+08:00`);
    const dueDateLabel = Number.isNaN(dueDate.getTime())
      ? "Due date to confirm"
      : formatInvoiceDate(dueDate);
    const lineDescription = customerInvoiceLineDescriptionForPreview(
      customerInvoicePrepRow,
      customerInvoiceAmountEdited,
    );

    setCustomerInvoicePreview({
      amountCents,
      amountLabel: formatInvoiceAmount(amountCents),
      cardFeeApplies: customerInvoiceCardFeeApplies,
      cardPaymentEnabled: customerInvoiceCardPaymentEnabled,
      customerName: customerInvoicePrepRow.customerName,
      documentType: customerInvoiceDocumentType,
      dueDateIso: customerInvoiceIssueDueDate,
      dueDateLabel,
      folder: customerInvoiceIssueStatus,
      lineDescription,
      lineItems: [
        {
          amountLabel: formatInvoiceAmount(amountCents),
          description: lineDescription,
        },
      ],
      previewKey: customerInvoiceCurrentPreviewKey,
      reference: customerInvoicePrepRow.reference,
      route: customerInvoicePrepRow.route,
      service: customerInvoicePrepRow.service,
      sourceLabel: customerInvoiceAmountEdited
        ? "Approved edited amount"
        : customerInvoiceCalculatedSourceLabel || "Prepared unbilled row",
    });
    setCustomerInvoiceIssueFeedback(
      `${customerBillingDocumentLabel(
        customerInvoiceDocumentType,
      )} preview ready. Review the details below before creating any PDF.`,
    );
    window.setTimeout(() => {
      document
        .querySelector<HTMLElement>("[data-customer-invoice-issue-download-pdf='true']")
        ?.focus();
    }, 50);
  }

  function updateIssuedInvoiceState(invoice: CustomerDisplayedInvoiceRecord) {
    setCustomerBillingDocumentPage(1);
    setIssuedCustomerInvoices((currentInvoices) =>
      mergeDisplayedInvoices([invoice], currentInvoices),
    );
  }

  async function downloadStoredCustomerInvoicePdf(invoice: CustomerDisplayedInvoiceRecord) {
    if (invoice.storageSource === "server") {
      const response = await fetch(
        `${adminCustomerInvoicePdfApiPath}/${encodeURIComponent(invoice.invoiceNumber)}`,
        {
          cache: "no-store",
          headers: {
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
        },
      );

      if (!response.ok) {
        throw new Error("Stored invoice PDF download");
      }

      downloadBrowserBlob(await response.blob(), invoice.pdfFilename || `${invoice.invoiceNumber}.pdf`);
      return;
    }

    await downloadCustomerInvoicePdf(invoice);
  }

  function customerInvoiceRequestBodyFromPreview(documentState: CustomerBillingDocumentState) {
    if (!customerInvoicePrepRow || !customerInvoicePreview || !isCustomerInvoicePreviewCurrent) {
      return null;
    }

    return {
      amountCents: customerInvoicePreview.amountCents,
      billingMonthLabel: formatInvoiceMonth(new Date()),
      customerEmail: customerInvoiceRecipientEmail,
      customerId: customerInvoicePrepRow.customerId,
      bookerId: customerInvoicePrepRow.bookerId,
      bookingReference: customerInvoicePrepRow.reference,
      customerName: customerInvoicePrepRow.customerName,
      documentState,
      documentType: customerInvoicePreview.documentType,
      dueDateIso: customerInvoicePreview.dueDateIso,
      lineItems: customerInvoicePreview.lineItems,
      reference: customerInvoicePrepRow.reference,
      route: customerInvoicePrepRow.route,
      service: customerInvoicePrepRow.service,
      status: customerInvoicePreview.folder,
    };
  }

  async function saveCustomerInvoiceDraft() {
    if (!customerInvoicePrepRow) {
      setCustomerInvoiceIssueFeedback("Choose Prepare monthly invoice in the selected customer workspace before saving a draft.");
      return;
    }

    if (!customerInvoicePreview || !isCustomerInvoicePreviewCurrent) {
      setCustomerInvoiceIssueFeedback("Preview first, then save the draft so the saved details match the screen.");
      document
        .querySelector<HTMLElement>("[data-customer-invoice-preview-action='true']")
        ?.focus();
      return;
    }

    const requestBody = customerInvoiceRequestBodyFromPreview("draft");

    if (!requestBody) {
      setCustomerInvoiceIssueFeedback("Preview first, then save the draft so the saved details match the screen.");
      return;
    }

    setIssuingCustomerInvoiceKey(customerInvoicePrepRow.key);

    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result.invoice) {
        throw new Error(result?.error || "Customer invoice draft save");
      }

      const draftInvoice = {
        ...(result.invoice as CustomerDisplayedInvoiceRecord),
        storageSource: "server" as const,
      };

      setCustomerInvoiceDrafts((drafts) =>
        [
          invoiceDraftRecordFromDisplayedInvoice(draftInvoice),
          ...drafts.filter((draft) => draft.draftId !== draftInvoice.invoiceNumber),
        ].slice(0, 10),
      );
      setCustomerInvoiceIssueFeedback(
        `${customerBillingDocumentLabel(
          draftInvoice.documentType || "invoice",
        )} draft saved as ${draftInvoice.invoiceNumber}. It is admin-only, not emailed, and not shown in the customer portal until issued.`,
      );
    } catch (error) {
      setCustomerInvoiceIssueFeedback(customerInvoiceActionFailureMessage("Customer invoice draft save", error));
    } finally {
      window.setTimeout(() => setIssuingCustomerInvoiceKey(""), 700);
    }
  }

  async function issuePreparedCustomerInvoice() {
    if (!customerInvoicePrepRow) {
      setCustomerInvoiceIssueFeedback("Choose Prepare monthly invoice in the selected customer workspace before issuing an invoice.");
      return;
    }

    if (!customerInvoicePrepRow.bookerId) {
      setCustomerInvoiceIssueFeedback(
        "Assign a verified PA / booker to the exact saved booking before issuing. Draft saving remains admin-only.",
      );
      return;
    }

    const amountCents = parseInvoiceAmountToCents(customerInvoiceIssueAmount);

    if (!amountCents) {
      setCustomerInvoiceIssueFeedback(
        "Enter the approved customer amount before issuing. This prevents under-billing or over-billing.",
      );
      return;
    }

    if (customerInvoiceAmountEdited && !customerInvoiceAdjustmentReason.trim()) {
      setCustomerInvoiceIssueFeedback(
        "Enter adjustment reason before issuing an invoice with an edited amount.",
      );
      document
        .querySelector<HTMLElement>("[data-customer-invoice-override-reason='true']")
        ?.focus();
      return;
    }

    if (!customerInvoicePreview || !isCustomerInvoicePreviewCurrent) {
      setCustomerInvoiceIssueFeedback(
        "Click Preview Invoice first. If you changed amount, due date, folder, adjustment reason, or card payment option, refresh the preview before issuing.",
      );
      document
        .querySelector<HTMLElement>("[data-customer-invoice-preview-action='true']")
        ?.focus();
      return;
    }

    const documentLabel = customerBillingDocumentLabel(customerInvoicePreview.documentType);

    if (
      !confirmInvoiceSafetyAction({
        action: `${customerBillingDocumentActionLabel()} ${documentLabel}`,
        amountLabel: customerInvoicePreview.amountLabel,
        consequence: `This creates an issued ${documentLabel.toLowerCase()} number, stores the PDF, and starts the PDF download.`,
        customerName: customerInvoicePreview.customerName,
        documentLabel,
        extraLines: customerInvoiceAmountEdited
          ? ["Amount was edited; the admin adjustment reason stays internal and is not printed on the customer PDF."]
          : [],
        reference: customerInvoicePreview.reference,
      })
    ) {
      setCustomerInvoiceIssueFeedback(
        `${documentLabel} issue cancelled. No invoice number, PDF, email, payment, or customer folder was changed.`,
      );
      return;
    }

    setIssuingCustomerInvoiceKey(customerInvoicePrepRow.key);

    try {
      const requestBody = customerInvoiceRequestBodyFromPreview("issued");

      if (!requestBody) {
        throw new Error("Preview first, then create the PDF from the current reviewed details.");
      }

      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result.invoice) {
        throw new Error(result?.error || "Customer invoice issue");
      }

      const issuedInvoice = {
        ...(result.invoice as CustomerDisplayedInvoiceRecord),
        storageSource: "server" as const,
      };
      const issuedDocumentLabel = customerBillingDocumentLabel(issuedInvoice.documentType || "invoice");

      saveCustomerLocalInvoice(issuedInvoice);
      updateIssuedInvoiceState(issuedInvoice);
      setCustomerInvoicePrepFeedback(
        `${issuedInvoice.invoiceNumber} issued for ${issuedInvoice.customerName}. PDF download started.`,
      );
      setCustomerInvoiceIssueFeedback(
        customerInvoiceAmountEdited
          ? `${issuedInvoice.invoiceNumber} issued with an approved amount adjustment. The reason stays in admin review and is not printed on the customer PDF.`
          : `${issuedDocumentLabel} ${issuedInvoice.invoiceNumber} stored with PDF. It is ready for customer portal download and email.`,
      );
      await downloadStoredCustomerInvoicePdf(issuedInvoice);
      setCustomerInvoicePreview(null);
    } catch (error) {
      setCustomerInvoiceIssueFeedback(customerInvoiceActionFailureMessage("Customer invoice issue", error));
    } finally {
      window.setTimeout(() => setIssuingCustomerInvoiceKey(""), 700);
    }
  }

  async function downloadIssuedCustomerInvoice(invoice: CustomerDisplayedInvoiceRecord) {
    setDownloadingCustomerInvoiceNumber(invoice.invoiceNumber);

    try {
      await downloadStoredCustomerInvoicePdf(invoice);
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} PDF download started.`);
    } catch (error) {
      setCustomerInvoiceIssueFeedback(customerInvoiceActionFailureMessage(`${invoice.invoiceNumber} PDF download`, error));
    } finally {
      window.setTimeout(() => setDownloadingCustomerInvoiceNumber(""), 700);
    }
  }

  async function handleCustomerInvoiceEmailAction(invoice: CustomerDisplayedInvoiceRecord) {
    const recipientEmail = invoice.customerEmail || customerInvoiceRecipientEmail.trim();

    if (!recipientEmail) {
      setCustomerInvoiceIssueFeedback("Enter a customer email before sending this invoice.");
      return;
    }

    if (invoice.storageSource !== "server") {
      setCustomerInvoiceIssueFeedback(
        `${invoice.invoiceNumber} is a local fallback invoice. Issue it as a stored invoice before email sending.`,
      );
      return;
    }

    const documentLabel = customerBillingDocumentLabel(invoice.documentType || "invoice");

    if (
      !confirmInvoiceSafetyAction({
        action: `Email ${documentLabel}`,
        amountLabel: invoice.amountLabel,
        consequence: "This sends the stored billing document email to the selected recipient.",
        customerName: invoice.customerName,
        documentLabel,
        invoiceNumber: invoice.invoiceNumber,
        recipientEmail,
        reference: invoice.reference,
      })
    ) {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} email cancelled. No customer email was sent.`);
      return;
    }

    setEmailingCustomerInvoiceNumber(invoice.invoiceNumber);

    try {
      const response = await fetch(adminCustomerInvoiceEmailApiPath, {
        body: JSON.stringify({
          invoiceNumber: invoice.invoiceNumber,
          recipientEmail,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (result?.invoice) {
        updateIssuedInvoiceState({
          ...(result.invoice as CustomerDisplayedInvoiceRecord),
          storageSource: "server",
        });
      }

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Customer invoice email");
      }

      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} emailed to ${recipientEmail}.`);
    } catch (error) {
      setCustomerInvoiceIssueFeedback(customerInvoiceActionFailureMessage(`${invoice.invoiceNumber} email`, error));
    } finally {
      window.setTimeout(() => setEmailingCustomerInvoiceNumber(""), 700);
    }
  }

  async function markIssuedCustomerInvoicePaid(invoice: CustomerDisplayedInvoiceRecord) {
    if (invoice.status === "Paid") {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} is already marked Paid in this browser.`);
      return;
    }

    if (
      !confirmInvoiceSafetyAction({
        action: "Mark invoice Paid",
        amountLabel: invoice.amountLabel,
        consequence:
          "This changes the invoice status to Paid only. It does not record bank payment, card payment, provider payment, or payout.",
        customerName: invoice.customerName,
        documentLabel: customerBillingDocumentLabel(invoice.documentType || "invoice"),
        invoiceNumber: invoice.invoiceNumber,
        reference: invoice.reference,
      })
    ) {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} paid mark cancelled. No invoice status changed.`);
      return;
    }

    setUpdatingCustomerInvoiceStatusNumber(invoice.invoiceNumber);

    if (invoice.storageSource === "server") {
      try {
        const response = await fetch(adminCustomerInvoicesApiPath, {
          body: JSON.stringify({
            invoiceNumber: invoice.invoiceNumber,
            status: "Paid",
          }),
          headers: {
            "Content-Type": "application/json",
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          method: "PATCH",
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok || !result.invoice) {
          throw new Error(result?.error || "Customer invoice paid status update");
        }

        const paidInvoice = {
          ...(result.invoice as CustomerDisplayedInvoiceRecord),
          storageSource: "server" as const,
        };

        saveCustomerLocalInvoice(paidInvoice);
        updateIssuedInvoiceState(paidInvoice);
        setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} marked Paid.`);
        return;
      } catch (error) {
        setCustomerInvoiceIssueFeedback(
          customerInvoiceActionFailureMessage(`${invoice.invoiceNumber} paid status update`, error),
        );
        return;
      } finally {
        window.setTimeout(() => setUpdatingCustomerInvoiceStatusNumber(""), 700);
      }
    }

    const paidInvoice = {
      ...invoice,
      status: "Paid" as const,
    };
    const nextInvoices = saveCustomerLocalInvoice(paidInvoice).map(displayLocalInvoice);

    setIssuedCustomerInvoices(nextInvoices);
    setCustomerInvoiceIssueFeedback(
      `${invoice.invoiceNumber} marked Paid locally. No bank, Stripe, payment provider, or Supabase record was changed.`,
    );
    window.setTimeout(() => setUpdatingCustomerInvoiceStatusNumber(""), 700);
  }

  async function markIssuedCustomerInvoiceUnpaid(invoice: CustomerDisplayedInvoiceRecord) {
    if (invoice.status === "Unpaid") {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} is already marked Unpaid in this browser.`);
      return;
    }

    if (
      !confirmInvoiceSafetyAction({
        action: "Mark invoice Unpaid",
        amountLabel: invoice.amountLabel,
        consequence:
          "This changes the invoice status to Unpaid only. It does not reverse a bank payment, card payment, provider payment, or payout.",
        customerName: invoice.customerName,
        documentLabel: customerBillingDocumentLabel(invoice.documentType || "invoice"),
        invoiceNumber: invoice.invoiceNumber,
        reference: invoice.reference,
      })
    ) {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} unpaid mark cancelled. No invoice status changed.`);
      return;
    }

    setUpdatingCustomerInvoiceStatusNumber(invoice.invoiceNumber);

    if (invoice.storageSource === "server") {
      try {
        const response = await fetch(adminCustomerInvoicesApiPath, {
          body: JSON.stringify({
            invoiceNumber: invoice.invoiceNumber,
            status: "Unpaid",
          }),
          headers: {
            "Content-Type": "application/json",
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          method: "PATCH",
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok || !result.invoice) {
          throw new Error(result?.error || "Customer invoice unpaid status update");
        }

        const unpaidInvoice = {
          ...(result.invoice as CustomerDisplayedInvoiceRecord),
          storageSource: "server" as const,
        };

        saveCustomerLocalInvoice(unpaidInvoice);
        updateIssuedInvoiceState(unpaidInvoice);
        setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} marked Unpaid.`);
        return;
      } catch (error) {
        setCustomerInvoiceIssueFeedback(
          customerInvoiceActionFailureMessage(`${invoice.invoiceNumber} unpaid status update`, error),
        );
        return;
      } finally {
        window.setTimeout(() => setUpdatingCustomerInvoiceStatusNumber(""), 700);
      }
    }

    const unpaidInvoice = {
      ...invoice,
      status: "Unpaid" as const,
    };
    const nextInvoices = saveCustomerLocalInvoice(unpaidInvoice).map(displayLocalInvoice);

    setIssuedCustomerInvoices(nextInvoices);
    setCustomerInvoiceIssueFeedback(
      `${invoice.invoiceNumber} marked Unpaid locally. No bank, Stripe, payment provider, or Supabase record was changed.`,
    );
    window.setTimeout(() => setUpdatingCustomerInvoiceStatusNumber(""), 700);
  }

  async function createCreditNoteFromPaidInvoice(invoice: CustomerDisplayedInvoiceRecord) {
    if (invoice.status !== "Paid") {
      setCustomerInvoiceIssueFeedback("Credit notes are available only after an invoice is marked Paid.");
      return;
    }

    if ((invoice.documentType || "invoice") !== "invoice") {
      setCustomerInvoiceIssueFeedback("Credit notes can only be created from paid invoices.");
      return;
    }

    if (invoice.storageSource !== "server") {
      setCustomerInvoiceIssueFeedback(
        `${invoice.invoiceNumber} is a local fallback invoice. Stored credit notes require a stored paid invoice.`,
      );
      return;
    }

    if (
      !confirmInvoiceSafetyAction({
        action: "Create credit note",
        amountLabel: invoice.amountLabel,
        consequence:
          "This creates a new credit note document and PDF linked to the paid invoice. The paid invoice is not edited or deleted.",
        customerName: invoice.customerName,
        documentLabel: "Credit Note",
        invoiceNumber: invoice.invoiceNumber,
        reference: invoice.reference,
      })
    ) {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} credit note cancelled. No credit note was created.`);
      return;
    }

    setUpdatingCustomerInvoiceStatusNumber(invoice.invoiceNumber);

    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify({
          amountCents: invoice.amountCents,
          billingMonthLabel: invoice.billingMonthLabel,
          creditNoteReason: `Admin credit note linked to ${invoice.invoiceNumber}.`,
          customerEmail: invoice.customerEmail || customerInvoiceRecipientEmail,
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          documentState: "issued",
          documentType: "credit_note",
          dueDateIso: invoiceDateInputDaysFromNow(0),
          lineItems: [
            {
              amountLabel: invoice.amountLabel,
              description: `Credit note for ${invoice.invoiceNumber}. Admin correction for overpayment or invoice reversal.`,
            },
          ],
          originalInvoiceNumber: invoice.invoiceNumber,
          reference: invoice.reference,
          route: invoice.route,
          service: "Credit Note",
          status: "Unpaid",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result.invoice) {
        throw new Error(result?.error || "Credit note creation");
      }

      const creditNote = {
        ...(result.invoice as CustomerDisplayedInvoiceRecord),
        storageSource: "server" as const,
      };

      saveCustomerLocalInvoice(creditNote);
      updateIssuedInvoiceState(creditNote);
      await downloadStoredCustomerInvoicePdf(creditNote);
      setCustomerInvoiceIssueFeedback(
        `${creditNote.invoiceNumber} created from ${invoice.invoiceNumber}. The paid invoice was not edited or deleted.`,
      );
    } catch (error) {
      setCustomerInvoiceIssueFeedback(customerInvoiceActionFailureMessage("Credit note creation", error));
    } finally {
      window.setTimeout(() => setUpdatingCustomerInvoiceStatusNumber(""), 700);
    }
  }

  async function archiveCustomerTestInvoiceArtifact(invoice: CustomerDisplayedInvoiceRecord) {
    if (!isApprovedCustomerTestInvoiceArchiveCandidate(invoice)) {
      setCustomerInvoiceIssueFeedback(
        "Only the exact approved live acceptance test invoice can be archived here.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Archive test invoice ${invoice.invoiceNumber} for ${invoice.reference}? This hides it from active billing and the customer portal, but does not delete the stored record.`,
    );

    if (!confirmed) {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} archive cancelled. No record was changed.`);
      return;
    }

    setUpdatingCustomerInvoiceStatusNumber(invoice.invoiceNumber);

    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify({
          action: customerInvoiceTestArtifactArchiveAction,
          bookingReference: approvedCustomerTestInvoiceArchiveTarget.bookingReference,
          confirmationText: approvedCustomerTestInvoiceArchiveTarget.confirmationText,
          invoiceNumber: approvedCustomerTestInvoiceArchiveTarget.invoiceNumber,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result?.archived || !result.invoice) {
        throw new Error(result?.error || "Customer invoice archive");
      }

      removeCustomerLocalInvoice(invoice.invoiceNumber);
      setArchivedCustomerTestInvoiceReferences((currentReferences) => [
        ...new Set([
          ...currentReferences,
          normalizedInvoiceReference(invoice.reference),
        ].filter(Boolean)),
      ]);
      setIssuedCustomerInvoices((currentInvoices) =>
        currentInvoices.filter((currentInvoice) => currentInvoice.invoiceNumber !== invoice.invoiceNumber),
      );
      setCustomerInvoiceDrafts((currentDrafts) =>
        currentDrafts.filter((draft) => draft.documentNumber !== invoice.invoiceNumber),
      );
      setCustomerInvoiceIssueFeedback(
        `${invoice.invoiceNumber} archived as a test artifact. It is hidden from active billing and the customer portal; the stored record was not deleted or marked paid.`,
      );
    } catch (error) {
      setCustomerInvoiceIssueFeedback(customerInvoiceActionFailureMessage(`${invoice.invoiceNumber} archive`, error));
    } finally {
      window.setTimeout(() => setUpdatingCustomerInvoiceStatusNumber(""), 700);
    }
  }

  async function convertQuotationToInvoice(invoice: CustomerDisplayedInvoiceRecord) {
    if ((invoice.documentType || "invoice") !== "quotation") {
      setCustomerInvoiceIssueFeedback("Only quotations can be converted into an invoice.");
      return;
    }

    if (invoice.storageSource !== "server") {
      setCustomerInvoiceIssueFeedback(
        `${invoice.invoiceNumber} is a local fallback quotation. Stored invoice conversion requires a stored quotation.`,
      );
      return;
    }

    if (
      !confirmInvoiceSafetyAction({
        action: "Convert quotation to invoice",
        amountLabel: invoice.amountLabel,
        consequence:
          "This creates a new issued invoice from the quotation and starts the PDF download. The quotation is not deleted.",
        customerName: invoice.customerName,
        documentLabel: "Invoice",
        invoiceNumber: invoice.invoiceNumber,
        reference: invoice.reference,
      })
    ) {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} conversion cancelled. No invoice was created.`);
      return;
    }

    setUpdatingCustomerInvoiceStatusNumber(invoice.invoiceNumber);

    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify({
          amountCents: invoice.amountCents,
          billingMonthLabel: invoice.billingMonthLabel,
          customerEmail: invoice.customerEmail || customerInvoiceRecipientEmail,
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          documentState: "issued",
          documentType: "invoice",
          dueDateIso: invoiceDateLabelToIso(invoice.dueDateLabel),
          lineItems:
            invoice.lineItems.length > 0
              ? invoice.lineItems
              : [
                  {
                    amountLabel: invoice.amountLabel,
                    description: `${invoice.service} - ${invoice.reference} - ${invoice.route}`,
                  },
                ],
          reference: invoice.reference,
          route: invoice.route,
          service: invoice.service,
          status: "Unpaid",
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result.invoice) {
        throw new Error(result?.error || "Quotation conversion");
      }

      const convertedInvoice = {
        ...(result.invoice as CustomerDisplayedInvoiceRecord),
        storageSource: "server" as const,
      };

      saveCustomerLocalInvoice(convertedInvoice);
      updateIssuedInvoiceState(convertedInvoice);
      await downloadStoredCustomerInvoicePdf(convertedInvoice);
      setCustomerInvoiceIssueFeedback(
        `${invoice.invoiceNumber} converted to ${convertedInvoice.invoiceNumber}. PDF download started.`,
      );
    } catch (error) {
      setCustomerInvoiceIssueFeedback(customerInvoiceActionFailureMessage("Quotation conversion", error));
    } finally {
      window.setTimeout(() => setUpdatingCustomerInvoiceStatusNumber(""), 700);
    }
  }

  function clearRegularCustomerBookingListFilters() {
    setRegularCustomerBookingListFilters(initialRegularCustomerBookingListFilters);
    setRegularCustomerBillingQuickFilter(regularCustomerBillingQuickFilterAllValue);
    setRegularCustomerBillingDetailPreviewId("");
    setRegularCustomerBookingListFilterFeedback(
      "Local mock filters cleared. The list is still page-only and no records were changed.",
    );
    setRegularCustomerDraftInvoiceFeedbackTone("info");
    if (regularCustomerDraftInvoicePreview) {
      setRegularCustomerDraftInvoiceClearControlVisible(true);
      setRegularCustomerDraftInvoiceSnapshotStale(true);
      setRegularCustomerDraftInvoiceFeedback(
        "Local filters cleared. The visible mock draft preview remains the earlier local snapshot; recreate it for the latest visible rows or clear it below.",
      );
    } else {
      setRegularCustomerDraftInvoiceClearControlVisible(false);
      setRegularCustomerDraftInvoiceFeedback(
        "Local filters cleared. The monthly billing list was not changed.",
      );
    }
  }

  function resetRegularCustomerBillingQuickFilter() {
    setRegularCustomerBillingQuickFilter(regularCustomerBillingQuickFilterAllValue);
    setRegularCustomerBillingDetailPreviewId("");
  }

  function updateRegularCustomerBillingQuickFilter(value: string) {
    setRegularCustomerBillingQuickFilter(value);
    setRegularCustomerBillingDetailPreviewId("");
  }

  function createRegularCustomerDraftInvoicePreview() {
    if (filteredRegularCustomerBookingListItems.length === 0) {
      setRegularCustomerDraftInvoiceFeedbackTone("error");
      setRegularCustomerDraftInvoiceClearControlVisible(Boolean(regularCustomerDraftInvoicePreview));
      setRegularCustomerDraftInvoiceFeedback(
        regularCustomerDraftInvoicePreview
          ? "No visible local mock booking rows match the current filters. No new draft preview was created; the existing mock/local snapshot remains unchanged until staff clear it."
          : "No visible local mock booking rows match the current filters. No draft preview was created, and nothing was saved, numbered, generated, sent, synced, or called.",
      );
      return;
    }

    const uniqueCustomerNames = Array.from(
      new Set(filteredRegularCustomerBookingListItems.map((item) => item.customerName.trim()).filter(Boolean)),
    );
    const uniqueBillingMonths = Array.from(
      new Set(filteredRegularCustomerBookingListItems.map((item) => item.billingMonth.trim()).filter(Boolean)),
    );
    const createdAtLabel = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    setRegularCustomerDraftInvoicePreview({
      billingMonthLabel:
        uniqueBillingMonths.length === 1 ? uniqueBillingMonths[0] : "Mixed billing months mock preview",
      createdAtLabel,
      customerLabel: uniqueCustomerNames.length === 1 ? uniqueCustomerNames[0] : "Mixed customer mock preview",
      isMixedBillingMonth: uniqueBillingMonths.length !== 1,
      isMixedCustomer: uniqueCustomerNames.length !== 1,
      rows: filteredRegularCustomerBookingListItems.map((item) => ({ ...item })),
    });
    setRegularCustomerDraftInvoiceClearControlVisible(true);
    setRegularCustomerDraftInvoiceSnapshotStale(false);
    setRegularCustomerDraftInvoiceFeedbackTone("success");
    setRegularCustomerDraftInvoiceFeedback(
      `${filteredRegularCustomerBookingListItems.length} visible local mock row${filteredRegularCustomerBookingListItems.length === 1 ? "" : "s"} added to a draft preview. No invoice number, PDF, invoice, statement, sending, notification, calendar, payment, bank, audit, payment provider, or Supabase call was made.`,
    );
  }

  function clearRegularCustomerDraftInvoicePreview() {
    setRegularCustomerDraftInvoicePreview(null);
    setRegularCustomerDraftInvoiceClearControlVisible(true);
    setRegularCustomerDraftInvoiceSnapshotStale(false);
    setRegularCustomerDraftInvoiceFeedbackTone("info");
    setRegularCustomerDraftInvoiceFeedback(
      "Mock draft invoice preview cleared locally. The local monthly billing list was not changed.",
    );
  }

  function handleRegularCustomerBookingListAction(
    item: RegularCustomerBookingListItem,
    action: RegularCustomerBookingListAction,
  ) {
    const actionMessages: Record<RegularCustomerBookingListAction, string> = {
      amend:
        `${item.passengerName} amend workflow is planned but not active yet. Future amendments will require a reason and old/new value review. This local mock row was not changed, saved, audited, invoiced, paid, sent, synced, or written to Supabase.`,
      cancel:
        `${item.passengerName} cancel workflow is planned but not active yet. Future cancellation will require a reason and billing review. This local mock row was not removed, marked cancelled, saved, audited, invoiced, paid, sent, synced, or written to Supabase.`,
      edit:
        `${item.passengerName} edit workflow is planned but not active yet. This click only shows local staff guidance. Row data was not changed, saved, audited, invoiced, paid, sent, synced, or written to Supabase.`,
    };

    setRegularCustomerBookingListActionFeedback((currentFeedback) => ({
      ...currentFeedback,
      [item.id]: {
        action,
        message: actionMessages[action],
      },
    }));
  }

  function showRegularCustomerBillingDetails(item: RegularCustomerBookingListItem) {
    setRegularCustomerBillingDetailPreviewId(item.id);
  }

  function closeRegularCustomerBillingDetails() {
    setRegularCustomerBillingDetailPreviewId("");
  }

  function handleRegularCustomerParserHelper() {
    setRegularCustomerParserHelperFeedback(
      regularCustomerParserHelperText.trim()
        ? "Mini Parser Helper checked this local text only. Future AI/parser helper may extract booking details; no OpenAI/ChatGPT API call, no Supabase save, and no booking created."
        : "Paste booking details first. Mini Parser Helper is not active yet; no OpenAI/ChatGPT API call, no Supabase save, and no booking created.",
    );
  }

  function handleRegularCustomerMockSave() {
    const missingFields = getMissingRegularCustomerRequiredFields(regularCustomerBookingForm);

    if (missingFields.length > 0) {
      setRegularCustomerBookingMissingFields(missingFields.map(({ field }) => field));
      setRegularCustomerMockSaveReview(null);
      setRegularCustomerMockSaveReviewFeedbackTone("info");
      setRegularCustomerMockSaveReviewFeedback(
        "Mock confirmation review stays hidden until required fields are present. No booking was saved or linked.",
      );
      setRegularCustomerMockSaveFeedbackTone("error");
      setRegularCustomerMockSaveFeedback(
        `Real Save Regular Booking is not active yet. Future real save would check required fields first: ${missingFields
          .map(({ label }) => label)
          .join(", ")}. No booking was saved, no customer folder was linked, no row was added, no invoice number or audit record was created, and no Supabase, payment, bank, notification, or calendar call was made.`,
      );
      return;
    }

    const customer = mockCustomers.find((candidate) => candidate.id === regularCustomerBookingForm.customerId);
    const customerName = customer?.companyName ?? "Selected customer";

    setRegularCustomerBookingMissingFields([]);
    setRegularCustomerMockSaveReview({
      billingMonth: getRegularCustomerBillingMonth(regularCustomerBookingForm),
      customerName,
      dropoffLocation: regularCustomerBookingForm.dropoffLocation,
      passengerName: regularCustomerBookingForm.passengerName,
      pickupDate: regularCustomerBookingForm.pickupDate,
      pickupLocation: regularCustomerBookingForm.pickupLocation,
      pickupTime: regularCustomerBookingForm.pickupTime,
      vehicleType: regularCustomerBookingForm.vehicleType,
    });
    setRegularCustomerMockSaveReviewFeedbackTone("info");
    setRegularCustomerMockSaveReviewFeedback(
      "Mock confirmation review opened locally. Review details only: no booking was saved, no customer folder was linked, no invoice number or audit record was created, and no Supabase, payment, bank, notification, or calendar call was made.",
    );
    setRegularCustomerMockSaveFeedbackTone("success");
    setRegularCustomerMockSaveFeedback(
      `${customerName} Save Regular Booking placeholder clicked. Future real save will require staff confirmation and separate Supabase approval. No booking was saved, no customer folder was linked, no local row was added, no row data changed, no invoice number or audit record was created, and no payment, bank, notification, calendar, or Supabase call was made.`,
    );
  }

  function handleRegularCustomerMockSaveReviewConfirm() {
    setRegularCustomerMockSaveReviewFeedbackTone("success");
    setRegularCustomerMockSaveReviewFeedback(
      "Future real save will require business approval and Supabase implementation before it can run. No save happened now: no booking was saved, no customer folder was linked, no local row was added or removed, no row data changed, no invoice number or audit record was created, and no Supabase, payment, bank, notification, or calendar call was made.",
    );
  }

  function handleRegularCustomerMockSaveReviewDismiss() {
    setRegularCustomerMockSaveReview(null);
    setRegularCustomerMockSaveReviewFeedbackTone("info");
    setRegularCustomerMockSaveReviewFeedback(
      "Mock save review dismissed locally. No booking was saved, no customer folder was linked, and no row data changed.",
    );
  }

  function handleRegularCustomerBookingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const missingFields = getMissingRegularCustomerRequiredFields(regularCustomerBookingForm);

    if (missingFields.length > 0) {
      setRegularCustomerBookingPreview(null);
      setRegularCustomerBookingMissingFields(missingFields.map(({ field }) => field));
      setRegularCustomerBookingFeedbackTone("error");
      setRegularCustomerBookingFeedback(
        `Please complete required fields before creating a mock preview: ${missingFields
          .map(({ label }) => label)
          .join(", ")}. No mock booking preview was created.`,
      );
      return;
    }

    const customer = mockCustomers.find((candidate) => candidate.id === regularCustomerBookingForm.customerId);
    const customerName = customer?.companyName ?? "Customer not selected";
    const customerFolderHref = customer ? `/customers/${customer.id}` : "";
    const createdAtLabel = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const normalizedRegularCustomerBookingForm = {
      ...regularCustomerBookingForm,
      billingMonth: getRegularCustomerBillingMonth(regularCustomerBookingForm),
    };
    const nextBookingPreview = {
      ...normalizedRegularCustomerBookingForm,
      customerFolderHref,
      customerName,
      createdAtLabel,
    };

    setRegularCustomerBookingMissingFields([]);
    setRegularCustomerBookingPreview(nextBookingPreview);
    setRegularCustomerBookingListItems((currentItems) => [
      {
        ...nextBookingPreview,
        id: `regular-mock-${Date.now()}`,
      },
      ...currentItems,
    ]);
    setRegularCustomerDraftInvoiceFeedbackTone("info");
    if (regularCustomerDraftInvoicePreview) {
      setRegularCustomerDraftInvoiceClearControlVisible(true);
      setRegularCustomerDraftInvoiceSnapshotStale(true);
      setRegularCustomerDraftInvoiceFeedback(
        "A local mock booking row was added. The visible draft preview remains the earlier local snapshot; recreate it for the latest visible rows or clear it below.",
      );
    } else {
      setRegularCustomerDraftInvoiceClearControlVisible(false);
      setRegularCustomerDraftInvoiceFeedback(
        "A local mock booking row was added. Create a new mock draft invoice preview from the currently visible rows when ready.",
      );
    }
    setRegularCustomerBookingFeedbackTone("success");
    setRegularCustomerBookingFeedback(
      `${customerName} mock/local preview created and added to the local monthly billing list. No booking was saved, no customer link was written, no invoice number was created, no invoice or statement was generated, no notification was sent, no calendar sync ran, and no payment, bank, or Supabase call was made.`,
    );
  }

  function handleRegularCustomerBookingClear() {
    setRegularCustomerBookingForm(initialRegularCustomerBookingForm);
    setRegularCustomerBookingPreview(null);
    setRegularCustomerBookingMissingFields([]);
    setRegularCustomerBookingFeedbackTone("info");
    setRegularCustomerBookingFeedback(
      "Mock/local form foundation only. Submit creates a local preview beside this button.",
    );
    setRegularCustomerMockSaveFeedbackTone("info");
    setRegularCustomerMockSaveFeedback(
      "Future real save placeholder only. Mock/local only: no booking save, customer folder link write, Supabase call, invoice number, payment/bank action, notification, or calendar action.",
    );
    setRegularCustomerMockSaveReview(null);
    setRegularCustomerMockSaveReviewFeedbackTone("info");
    setRegularCustomerMockSaveReviewFeedback(
      "Valid mock save clicks show a local confirmation review here. No save, link, audit, invoice, payment, bank, notification, calendar, or Supabase action is active.",
    );
    setRegularCustomerParserHelperText("");
    setRegularCustomerParserHelperFeedback(
      "Paste free-text booking details here later. Mock/local only: no OpenAI/ChatGPT API call, no Supabase save, and no booking created.",
    );
    setRegularCustomerBookingClearFeedbackTone("success");
    setRegularCustomerBookingClearFeedback(
      "Regular customer booking form cleared locally. No booking, customer folder, billing, invoice, calendar, payment, bank, notification, or Supabase record was changed.",
    );
  }

  function handleMockPaymentAction(item: OutstandingPaymentReviewItem, action: MockPaymentAction) {
    const actionTimestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const currentBalance = mockPaymentLocalUpdates[item.key]?.balanceDue ?? item.balanceDue;
    const actionConfig: Record<
      MockPaymentAction,
      {
        actionLabel: string;
        balanceDue: string;
        feedback: string;
        note: string;
        paymentStatus: MockPaymentStatus;
        removeFromOutstanding: boolean;
      }
    > = {
      "invoice-sent": {
        actionLabel: "Marked invoice sent",
        balanceDue: currentBalance,
        feedback: `${item.invoiceNumber} marked invoice sent locally. No invoice record was created.`,
        note: "Mock invoice-sent status only; dispatcher confirmation is not saved.",
        paymentStatus: "Invoice Sent",
        removeFromOutstanding: false,
      },
      "partial-payment": {
        actionLabel: "Recorded partial payment",
        balanceDue: getMockPartialBalance(currentBalance),
        feedback: `${item.invoiceNumber} partial payment recorded locally. Remaining balance stays visible.`,
        note: "Mock partial payment only; no payment record or bank confirmation exists.",
        paymentStatus: "Partially Paid",
        removeFromOutstanding: false,
      },
      paid: {
        actionLabel: "Marked paid",
        balanceDue: "$0",
        feedback: `${item.invoiceNumber} marked paid locally and removed from outstanding.`,
        note: "Mock paid action only; customer history/source data is unchanged.",
        paymentStatus: "Paid",
        removeFromOutstanding: true,
      },
      waived: {
        actionLabel: "Waived balance",
        balanceDue: "$0",
        feedback: `${item.invoiceNumber} balance waived locally and removed from outstanding.`,
        note: "Mock waiver only; no waiver record or accounting entry was created.",
        paymentStatus: "Paid",
        removeFromOutstanding: true,
      },
    };
    const nextUpdate = actionConfig[action];

    setMockPaymentLocalUpdates((currentUpdates) => ({
      ...currentUpdates,
      [item.key]: {
        balanceDue: nextUpdate.balanceDue,
        feedback: nextUpdate.feedback,
        paymentStatus: nextUpdate.paymentStatus,
        removeFromOutstanding: nextUpdate.removeFromOutstanding,
      },
    }));
    setMockPaymentEvents((currentEvents) => [
      {
        action: nextUpdate.actionLabel,
        customerName: item.customerName,
        id: `${item.key}:${action}:${Date.now()}`,
        invoiceNumber: item.invoiceNumber,
        note: nextUpdate.note,
        timestamp: actionTimestamp,
      },
      ...currentEvents,
    ]);
    setMockPaymentSectionFeedback(nextUpdate.feedback);
  }

  function handleMockFollowUpAction(item: VisibleOutstandingPaymentReviewItem, action: MockFollowUpAction) {
    const actionTimestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const actionConfig: Record<
      MockFollowUpAction,
      {
        actionLabel: string;
        feedback: string;
        followUpDate?: string;
        note: string;
      }
    > = {
      schedule: {
        actionLabel: "Scheduled follow-up",
        feedback: `${item.invoiceNumber} follow-up scheduled locally. No message was sent.`,
        followUpDate: "Tomorrow (mock/local)",
        note: "Mock follow-up schedule only; no WhatsApp, email, SMS, or notification was sent.",
      },
      done: {
        actionLabel: "Marked follow-up done",
        feedback: `${item.invoiceNumber} follow-up marked done locally. Balance still needs manual review.`,
        note: "Mock follow-up completion only; no collection record or Supabase row was created.",
      },
      note: {
        actionLabel: "Added mock note",
        feedback: `${item.invoiceNumber} mock note added locally. Source data is unchanged.`,
        note: "Mock note only; no customer note, payment record, or notification was created.",
      },
    };
    const nextUpdate = actionConfig[action];

    setMockFollowUpLocalUpdates((currentUpdates) => ({
      ...currentUpdates,
      [item.key]: {
        feedback: nextUpdate.feedback,
        followUpDate: nextUpdate.followUpDate ?? currentUpdates[item.key]?.followUpDate,
        note: nextUpdate.note,
      },
    }));
    setMockFollowUpEvents((currentEvents) => [
      {
        action: nextUpdate.actionLabel,
        customerName: item.customerName,
        id: `${item.key}:${action}:${Date.now()}`,
        invoiceNumber: item.invoiceNumber,
        note: nextUpdate.note,
        timestamp: actionTimestamp,
      },
      ...currentEvents,
    ]);
    setMockFollowUpSectionFeedback(nextUpdate.feedback);
  }

  function handleMockStatementPreview(group: MockStatementPreviewGroup) {
    const actionTimestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const feedback = `${group.customerName} mock statement preview opened locally. No statement was generated, sent, saved, or numbered.`;

    setMockStatementPreviewFeedback((currentFeedback) => ({
      ...currentFeedback,
      [group.key]: feedback,
    }));
    setMockStatementPreviewEvents((currentEvents) => [
      {
        action: "Previewed mock statement",
        customerName: group.customerName,
        id: `${group.key}:statement-preview:${Date.now()}`,
        note: "Mock statement preview only; no statement record, invoice record, payment record, bank record, notification, WhatsApp message, email, SMS, or Supabase row was created.",
        periodLabel: group.periodLabel,
        timestamp: actionTimestamp,
      },
      ...currentEvents,
    ]);
  }

  function regularCustomerBookingFieldClass(field: keyof RegularCustomerBookingForm) {
    const isMissing = regularCustomerBookingMissingFields.includes(field);

    return `min-h-11 rounded-md border px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700 ${
      isMissing ? "border-rose-500 bg-rose-50" : "border-slate-300 bg-white"
    }`;
  }

  function isRegularCustomerBookingFieldMissing(field: keyof RegularCustomerBookingForm) {
    return regularCustomerBookingMissingFields.includes(field);
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="border-b border-slate-200 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Prestige Limo Ops</p>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-normal text-slate-950">Customers & Invoices</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Find the exact customer account, review saved jobs, prepare monthly billing, and issue invoices from
                the approved invoice workflow.
              </p>
            </div>
            <div
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 shadow-sm"
              data-customer-internal-staff-notice="true"
            >
              <p className="font-bold">Internal Staff Dashboard — Not Customer-Facing</p>
              <p className="mt-1">
                Use /book for customer booking requests. This page contains dispatcher, billing, payment
                review, and staff-only planning tools.
              </p>
            </div>
          </div>
        </header>

        {!selectedCustomerWorkspaceOpen ? (
          <section
            className="rounded-lg border border-slate-200 bg-white shadow-sm"
            data-customer-billing-overview="true"
          >
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Customer Billing Overview</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Click a customer name to review that customer&apos;s saved jobs before preparing or sending any
                  invoice.
                </p>
              </div>
              <div className="flex flex-col gap-2 lg:items-end">
                <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-700 sm:grid-cols-4">
                  <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="block text-[10px] uppercase text-slate-500">Customers</span>
                    <span className="text-base text-slate-950">{customerBillingOverviewTotals.rowCount}</span>
                  </p>
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                    <span className="block text-[10px] uppercase">Draft</span>
                    <span className="text-base">{customerBillingOverviewTotals.draftCount}</span>
                  </p>
                  <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sky-900">
                    <span className="block text-[10px] uppercase">Pending</span>
                    <span className="text-base">{customerBillingOverviewTotals.pendingCount}</span>
                  </p>
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                    <span className="block text-[10px] uppercase">Balance</span>
                    <span className="text-base">
                      {formatInvoiceAmount(customerBillingOverviewTotals.balanceCents)}
                    </span>
                  </p>
                </div>
                <button
                  className="min-h-9 w-fit whitespace-nowrap rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  data-customer-billing-overview-load-accounts="true"
                  disabled={regularCustomerAccountReadState.status === "loading"}
                  onClick={() => {
                    void loadRegularCustomerAccounts();
                  }}
                  type="button"
                >
                  {regularCustomerAccountReadState.status === "loading" ? "Loading accounts" : "Load Accounts"}
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(18rem,1fr)_auto] lg:items-center">
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Quick search
                <input
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-customer-billing-overview-search="true"
                  data-customer-search="true"
                  onChange={(event) => updateCustomerFolderFinderSearch(event.target.value)}
                  placeholder="Search customer, account, invoice status, date, amount"
                  type="search"
                  value={searchTerm}
                />
              </label>
              <p
                aria-live="polite"
                className={`rounded-md border px-3 py-2 text-xs font-semibold leading-5 ${
                  regularCustomerAccountReadState.tone === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : regularCustomerAccountReadState.status === "loading"
                      ? "border-slate-200 bg-slate-50 text-slate-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
                data-customer-billing-overview-feedback="true"
              >
                {normalizedSearchTerm
                  ? `${filteredCustomerBillingOverviewRows.length} customer${
                      filteredCustomerBillingOverviewRows.length === 1 ? "" : "s"
                    } match "${searchTerm}".`
                  : `${regularCustomerAccountReadState.message} Showing ${customerBillingOverviewShowingStart}-${customerBillingOverviewShowingEnd} of ${filteredCustomerBillingOverviewRows.length} customers.`}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto p-4 sm:p-5">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Customer Name</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Invoice Status</th>
                  <th className="border-b border-slate-200 px-3 py-2 font-bold">Due / Latest Date</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">
                    Invoice Amount
                  </th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Balance</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Jobs</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomerBillingOverviewRows.length > 0 ? (
                  paginatedCustomerBillingOverviewRows.map((row) => (
                    <tr
                      className="align-top transition hover:bg-slate-50"
                      data-customer-billing-overview-row={row.customerFolderKey}
                      key={row.customerFolderKey}
                    >
                      <td className="border-b border-slate-100 px-3 py-3">
                        <Link
                          className="text-left font-bold text-slate-950 underline-offset-4 transition hover:text-sky-700 hover:underline"
                          data-customer-billing-overview-open={row.customerFolderKey}
                          href={row.customerFolderHref}
                        >
                          {row.customerName}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">{row.customerId}</p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <span
                          className={`inline-flex min-h-7 items-center rounded-md border px-2 text-xs font-bold ${
                            row.statusLabel === "Draft"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : row.statusLabel === "Pending"
                                ? "border-sky-200 bg-sky-50 text-sky-800"
                                : row.statusLabel === "Ready"
                                  ? "border-violet-200 bg-violet-50 text-violet-800"
                                  : row.statusLabel === "Paid"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {row.statusLabel}
                        </span>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.invoiceCount} invoice{row.invoiceCount === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 font-semibold text-slate-700">
                        {row.latestDateLabel}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right font-semibold text-slate-900">
                        {row.invoiceAmountLabel}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right font-bold text-slate-950">
                        {row.balanceLabel}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3 text-right text-xs font-bold text-slate-600">
                        {row.readyJobCount > 0 ? `${row.readyJobCount} ready` : ""}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-5 text-sm font-semibold text-slate-600" colSpan={6}>
                      Load customer accounts or clear the search to show the customer billing overview.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {customerBillingOverviewTotalPages > 1 ? (
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-600"
                data-customer-billing-overview-pages="true"
              >
                <span>
                  Page {activeCustomerBillingOverviewPage} of {customerBillingOverviewTotalPages}
                </span>
                <div className="flex flex-wrap gap-1">
                  {customerBillingOverviewPageNumbers.map((pageNumber) => (
                    <button
                      className={`min-h-8 min-w-8 rounded-md border px-2 transition ${
                        pageNumber === activeCustomerBillingOverviewPage
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-700"
                      }`}
                      data-customer-billing-overview-page={pageNumber}
                      key={pageNumber}
                      onClick={() => showAllCustomerFolderFinderRows(pageNumber)}
                      type="button"
                    >
                      {pageNumber}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          </section>
        ) : null}

        {selectedCustomerWorkspaceOpen ? (
        <section
          className="rounded-lg border border-slate-200 bg-white shadow-sm"
          data-selected-customer-dashboard="true"
        >
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {selectedCustomerWorkspaceOpen ? "Selected Customer" : "Find Customer Folder"}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  {selectedCustomerWorkspaceOpen
                    ? "Only the selected customer's jobs, invoices, and monthly invoice prep are shown here."
                    : "Search the customer or company, open the correct folder, then choose Prepare monthly invoice."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {selectedCustomerWorkspaceOpen ? (
                  <button
                    className="min-h-8 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 transition hover:border-slate-700"
                    data-selected-customer-back-to-all="true"
                    onClick={() => showAllCustomerFolderFinderRows(1)}
                    type="button"
                  >
                    Back to all customers
                  </button>
                ) : (
                  <>
                    <p
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
                      data-customer-folder-finder-count="true"
                    >
                      {customerFolderFinderShowingStart}-{customerFolderFinderShowingEnd} of{" "}
                      {filteredCustomers.length} folders
                    </p>
                    <button
                      className="min-h-8 whitespace-nowrap rounded-md border border-slate-900 bg-slate-900 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      data-customer-folder-finder-load-accounts="true"
                      disabled={regularCustomerAccountReadState.status === "loading"}
                      onClick={() => {
                        void loadRegularCustomerAccounts();
                      }}
                      type="button"
                    >
                      {regularCustomerAccountReadState.status === "loading" ? "Loading" : "Load Accounts"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {!selectedCustomerWorkspaceOpen ? (
              <>
            <div className="grid gap-3 lg:grid-cols-[minmax(18rem,0.9fr)_minmax(16rem,1fr)] lg:items-start">
              <div className="relative flex flex-col gap-1 text-sm font-semibold text-slate-700">
                <span>All customers</span>
                <button
                  aria-expanded={customerFolderFinderDropdownOpen}
                  aria-haspopup="listbox"
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-950 outline-none transition hover:border-slate-700 focus:border-slate-700"
                  data-customer-folder-finder-select="true"
                  onClick={() =>
                    setCustomerFolderFinderDropdownOpen((currentDropdownState) => !currentDropdownState)
                  }
                  type="button"
                >
                  <span className="truncate">{customerFolderFinderDropdownLabel}</span>
                  <span aria-hidden="true" className="text-slate-500">
                    v
                  </span>
                </button>
                {customerFolderFinderDropdownOpen ? (
                  <div
                    className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-md border border-slate-300 bg-white shadow-lg"
                    data-customer-folder-finder-dropdown-panel="true"
                    role="listbox"
                  >
                    <button
                      className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 text-left text-sm font-bold text-slate-950 transition hover:bg-slate-50"
                      data-customer-folder-finder-all-customers-option="true"
                      onClick={() => {
                        showAllCustomerFolderFinderRows(1);
                        setCustomerFolderFinderDropdownOpen(false);
                      }}
                      type="button"
                    >
                      <span>All customers</span>
                      <span className="text-xs font-semibold text-slate-500">10 per page</span>
                    </button>
                    <div className="max-h-80 overflow-y-auto">
                      {customerFolderFinderDropdownRows.length > 0 ? (
                        customerFolderFinderDropdownRows.map((customer) => (
                          <button
                            className={`grid w-full gap-1 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                              customer.customerFolderKey === customerFolderFinderSelectedId
                                ? "bg-emerald-50 text-emerald-950"
                                : "bg-white text-slate-900"
                            }`}
                            data-customer-folder-finder-dropdown-page-row={customer.customerFolderKey}
                            aria-selected={customer.customerFolderKey === customerFolderFinderSelectedId}
                            key={customer.customerFolderKey}
                            onClick={() => updateCustomerFolderFinderSelection(customer.customerFolderKey)}
                            role="option"
                            type="button"
                          >
                            <span className="font-bold">{customer.customerName}</span>
                            <span className="text-xs font-semibold text-slate-500">{customer.customerId}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-3 text-sm font-semibold text-slate-500">
                          No customer folders loaded.
                        </p>
                      )}
                    </div>
                    <div
                      className="flex flex-wrap gap-1 border-t border-slate-200 bg-slate-50 px-3 py-2"
                      data-customer-folder-finder-page-numbers="true"
                    >
                      {customerFolderFinderDropdownPageNumbers.map((pageNumber) => (
                        <button
                          className={`min-h-8 min-w-8 rounded-md border px-2 text-xs font-bold transition ${
                            pageNumber === currentCustomerFolderFinderDropdownPage &&
                            !selectedCustomerFolderFinderRow &&
                            !normalizedSearchTerm
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:border-slate-700"
                          }`}
                          data-customer-folder-finder-dropdown-page-number={pageNumber}
                          key={pageNumber}
                          onClick={() => {
                            showAllCustomerFolderFinderRows(pageNumber);
                            setCustomerFolderFinderDropdownOpen(true);
                          }}
                          type="button"
                        >
                          {pageNumber}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Search customer / company / latest booking
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-customer-folder-finder-search="true"
                  data-customer-search="true"
                  onChange={(event) => updateCustomerFolderFinderSearch(event.target.value)}
                  placeholder="Type customer, company, account, booking reference"
                  type="search"
                  value={searchTerm}
                />
              </label>
            </div>

            <p
              aria-live="polite"
              className={`mt-2 text-xs font-semibold leading-5 ${
                regularCustomerAccountReadState.tone === "error"
                  ? "text-rose-700"
                  : regularCustomerAccountReadState.status === "loading"
                    ? "text-slate-700"
                    : "text-slate-500"
              }`}
              data-customer-folder-finder-feedback="true"
              data-customer-search-helper="true"
            >
              {selectedCustomerFolderFinderRow
                ? `Selected customer: ${selectedCustomerFolderFinderRow.customerName}`
                : normalizedSearchTerm
                  ? `Searching customers for "${searchTerm}".`
                  : regularCustomerAccountReadState.message}
            </p>
            <div
              aria-live="polite"
              className="mt-4 overflow-hidden rounded-md border border-slate-200"
              data-customer-results-panel="true"
            >
              {paginatedCustomerFolderFinderRows.length > 0 ? (
                <div>
                  <div
                    aria-hidden="true"
                    className="hidden grid-cols-[minmax(12rem,1.4fr)_8rem_minmax(12rem,1fr)_8rem] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 md:grid"
                  >
                    <span>Customer</span>
                    <span>Jobs</span>
                    <span>Latest</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <div className="divide-y divide-slate-200" data-customer-folder-finder-list="true">
                    {paginatedCustomerFolderFinderRows.map((customer) => (
                      <article
                        className="grid gap-2 bg-white px-3 py-2 text-sm leading-5 transition hover:bg-slate-50 md:grid-cols-[minmax(12rem,1.4fr)_8rem_minmax(12rem,1fr)_8rem] md:items-center md:gap-3"
                        data-customer-folder-finder-row={customer.customerFolderKey}
                        data-customer-row={customer.customerFolderKey}
                        key={customer.customerFolderKey}
                      >
                        <div className="min-w-0">
                          <Link
                            className="block max-w-full truncate text-left text-sm font-bold text-slate-950 underline decoration-slate-300 underline-offset-4 transition hover:text-emerald-800 hover:decoration-emerald-500 sm:text-base"
                            data-customer-folder-finder-name-jobs={customer.customerFolderKey}
                            href={customer.folderHref || customerFolderHrefFromIndexRow(customer)}
                          >
                            {customer.customerName}
                          </Link>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            Account: {customer.customerId}
                          </p>
                          {customer.accountScopeLabel ? (
                            <p className="mt-0.5 truncate text-xs font-semibold text-emerald-800">
                              Scope: {customer.accountScopeLabel}
                            </p>
                          ) : null}
                        </div>
                        <p className="font-semibold leading-5 text-slate-800">
                          <span className="block">
                            {customer.historyRows} job{customer.historyRows === 1 ? "" : "s"}
                          </span>
                          <span className="block text-xs uppercase tracking-[0.1em] text-slate-500">
                            {customer.upcomingJobs} up / {customer.completedJobs} done
                          </span>
                        </p>
                        <p
                          className="min-w-0 truncate text-xs font-semibold text-slate-600"
                          title={
                            customer.source === "saved-account-read"
                              ? [
                                  customer.latestPickupAt,
                                  customer.latestServiceType,
                                  customer.latestBookingReference,
                                ]
                                  .filter(Boolean)
                                  .join(" | ")
                              : "Local folder ready"
                          }
                        >
                          {customer.source === "saved-account-read"
                            ? customerFolderLatestSummary(customer)
                            : "Local folder ready"}
                        </p>
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          {customer.folderHref ? (
                            <Link
                              className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 text-center text-xs font-bold text-white transition hover:bg-slate-700"
                              data-customer-folder-finder-link={customer.customerId}
                              data-open-customer-folder={customer.customerId}
                              href={customer.folderHref}
                            >
                              Open folder
                            </Link>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className="p-5 text-sm leading-6 text-slate-600"
                  data-customer-empty-state="true"
                  data-customer-folder-finder-empty="true"
                >
                  No customer folders match this search. Clear the search to show all folders again.
                </div>
              )}
            </div>
              </>
            ) : null}

            {customerFolderJobViewState.status !== "idle" ? (
              <section
                className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3"
                data-customer-folder-jobs-panel="true"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-slate-950">
                      Jobs for {customerFolderJobViewState.customerName || "selected customer"}
                    </h3>
                    <p className="mt-0.5 text-xs font-semibold text-slate-600">
                      Account ID: {customerFolderJobViewState.customerId || "Not selected"}
                    </p>
                    {selectedCustomerFolderFinderRow?.accountScopeLabel ? (
                      <p className="mt-0.5 text-xs font-semibold text-emerald-800">
                        Scope: {selectedCustomerFolderFinderRow.accountScopeLabel}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {selectedCustomerPrimaryMonthlyBillingGroup ? (
                      <button
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-emerald-900 bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
                        data-selected-customer-prepare-monthly-invoice="true"
                        disabled={
                          selectedCustomerPrimaryMonthlyBillingGroup.needsScopeReview ||
                          preparingMonthlyBillingGroupKey === selectedCustomerPrimaryMonthlyBillingGroup.key
                        }
                        onClick={prepareSelectedCustomerMonthlyInvoice}
                        type="button"
                      >
                        {preparingMonthlyBillingGroupKey === selectedCustomerPrimaryMonthlyBillingGroup.key
                          ? "Preparing"
                          : selectedCustomerPrimaryMonthlyBillingGroup.needsScopeReview
                            ? "Review scope"
                            : "Prepare monthly invoice"}
                      </button>
                    ) : (
                      <p
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-500"
                        data-selected-customer-no-monthly-invoice-ready="true"
                      >
                        No billing-ready jobs
                      </p>
                    )}
                    <p
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                      data-customer-folder-jobs-count="true"
                    >
                      {savedBookingCountLabel(
                        Number(
                          customerFolderJobViewState.summary?.returned_count ??
                            customerFolderJobViewState.savedBookings.length,
                        ),
                        "job",
                      )}
                    </p>
                  </div>
                </div>
                {selectedCustomerPrimaryMonthlyBillingGroup ? (
                  <p
                    className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-950"
                    data-selected-customer-monthly-invoice-summary="true"
                  >
                    {selectedCustomerPrimaryMonthlyBillingGroup.billingMonthLabel}:{" "}
                    {selectedCustomerPrimaryMonthlyBillingGroup.rows.length} completed billing-ready job
                    {selectedCustomerPrimaryMonthlyBillingGroup.rows.length === 1 ? "" : "s"} will be loaded into
                    the invoice workbench for admin review only.
                  </p>
                ) : null}

                <p
                  aria-live="polite"
                  className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold leading-5 ${regularCustomerBookingFeedbackClass(
                    customerFolderJobViewState.tone,
                  )}`}
                  data-customer-folder-jobs-feedback="true"
                >
                  {customerFolderJobViewState.message}
                </p>

                <div
                    className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white"
                    data-selected-customer-invoice-list="true"
                  >
                  <div className="flex flex-col gap-1 border-b border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950">Customer invoices</h4>
                      <p className="text-xs font-semibold text-slate-500">
                        Draft, pending, and paid documents for this selected customer.
                      </p>
                    </div>
                    <p
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700"
                      data-selected-customer-invoice-count="true"
                    >
                      {selectedCustomerBillingInvoiceRows.length} invoice
                      {selectedCustomerBillingInvoiceRows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {selectedCustomerBillingInvoiceRows.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[620px] text-left text-xs">
                        <thead className="text-[11px] uppercase tracking-[0.08em] text-slate-500">
                          <tr>
                            <th className="border-b border-slate-100 px-3 py-2 font-bold">Date</th>
                            <th className="border-b border-slate-100 px-3 py-2 font-bold">
                              Invoice Number
                            </th>
                            <th className="border-b border-slate-100 px-3 py-2 font-bold">Type</th>
                            <th className="border-b border-slate-100 px-3 py-2 text-right font-bold">
                              Amount
                            </th>
                            <th className="border-b border-slate-100 px-3 py-2 text-right font-bold">
                              Balance Due
                            </th>
                            <th className="border-b border-slate-100 px-3 py-2 text-right font-bold">
                              Status
                            </th>
                            <th className="border-b border-slate-100 px-3 py-2 text-right font-bold">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCustomerBillingInvoiceRows.map((invoice) => (
                            <tr
                              className="border-b border-slate-100 last:border-b-0"
                              data-selected-customer-invoice-row={invoice.key}
                              key={invoice.key}
                            >
                              <td className="px-3 py-2 font-semibold text-slate-700">
                                {invoice.dateLabel}
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  className="text-left font-bold text-slate-950 underline-offset-4 transition hover:text-sky-700 hover:underline"
                                  data-selected-customer-invoice-open={invoice.key}
                                  onClick={() => reviewSelectedCustomerInvoice(invoice.key)}
                                  type="button"
                                >
                                  {invoice.documentNumber}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-slate-700">{invoice.documentTypeLabel}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-950">
                                {invoice.amountLabel}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-slate-950">
                                {invoice.balanceLabel}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <span
                                  className={`inline-flex min-h-7 items-center rounded-md border px-2 text-xs font-bold ${
                                    invoice.statusLabel === "Draft"
                                      ? "border-amber-200 bg-amber-50 text-amber-800"
                                      : invoice.statusLabel === "Pending"
                                        ? "border-sky-200 bg-sky-50 text-sky-800"
                                        : "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  }`}
                                >
                                  {invoice.statusLabel}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="inline-flex flex-wrap justify-end gap-1">
                                  <button
                                    className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 transition hover:border-slate-700"
                                    data-selected-customer-invoice-view={invoice.key}
                                    onClick={() => reviewSelectedCustomerInvoice(invoice.key)}
                                    type="button"
                                  >
                                    View
                                  </button>
                                  {invoice.invoiceRecord ? (
                                    <>
                                      <button
                                        className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 transition hover:border-slate-700"
                                        data-selected-customer-invoice-pdf={invoice.key}
                                        onClick={() => downloadIssuedCustomerInvoice(invoice.invoiceRecord!)}
                                        type="button"
                                      >
                                        PDF
                                      </button>
                                      <button
                                        className="inline-flex min-h-8 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 px-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                        data-selected-customer-invoice-email={invoice.key}
                                        disabled={
                                          emailingCustomerInvoiceNumber === invoice.invoiceRecord.invoiceNumber ||
                                          invoice.invoiceRecord.emailDeliveryStatus === "sent"
                                        }
                                        onClick={() => handleCustomerInvoiceEmailAction(invoice.invoiceRecord!)}
                                        type="button"
                                      >
                                        {emailingCustomerInvoiceNumber === invoice.invoiceRecord.invoiceNumber
                                          ? "Sending"
                                          : invoice.invoiceRecord.emailDeliveryStatus === "sent"
                                            ? "Emailed"
                                            : "Email"}
                                      </button>
                                      {invoice.invoiceRecord.status === "Paid" ? null : (
                                        <button
                                          className="inline-flex min-h-8 items-center justify-center rounded-md border border-emerald-300 bg-white px-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                          data-selected-customer-invoice-paid={invoice.key}
                                          disabled={
                                            updatingCustomerInvoiceStatusNumber ===
                                            invoice.invoiceRecord.invoiceNumber
                                          }
                                          onClick={() => markIssuedCustomerInvoicePaid(invoice.invoiceRecord!)}
                                          type="button"
                                        >
                                          Paid
                                        </button>
                                      )}
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-3 py-3 text-sm font-semibold text-slate-600">
                      No draft, pending, or paid invoice documents found for this selected customer yet.
                    </p>
                  )}
                  {selectedCustomerBillingInvoiceDetail ? (
                    <div
                      className="border-t border-slate-200 bg-slate-50 px-3 py-3"
                      data-selected-customer-invoice-detail="true"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h5 className="text-sm font-bold text-slate-950">
                            {selectedCustomerBillingInvoiceDetail.documentNumber} items
                          </h5>
                          <p className="text-xs font-semibold text-slate-500">
                            Line items and descriptions for this invoice.
                          </p>
                        </div>
                        <span
                          className={`inline-flex min-h-7 w-fit items-center rounded-md border px-2 text-xs font-bold ${
                            selectedCustomerBillingInvoiceDetail.statusLabel === "Draft"
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : selectedCustomerBillingInvoiceDetail.statusLabel === "Pending"
                                ? "border-sky-200 bg-sky-50 text-sky-800"
                                : "border-emerald-200 bg-emerald-50 text-emerald-800"
                          }`}
                        >
                          {selectedCustomerBillingInvoiceDetail.statusLabel}
                        </span>
                      </div>
                      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white">
                        <table className="w-full min-w-[520px] text-left text-xs">
                          <thead className="text-[11px] uppercase tracking-[0.08em] text-slate-500">
                            <tr>
                              <th className="border-b border-slate-100 px-3 py-2 font-bold">No.</th>
                              <th className="border-b border-slate-100 px-3 py-2 font-bold">
                                Item description
                              </th>
                              <th className="border-b border-slate-100 px-3 py-2 text-right font-bold">
                                Amount
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedCustomerBillingInvoiceDetail.lineItems.map((item, itemIndex) => (
                              <tr
                                className="border-b border-slate-100 last:border-b-0"
                                data-selected-customer-invoice-detail-item={`${selectedCustomerBillingInvoiceDetail.key}-${itemIndex}`}
                                key={`${selectedCustomerBillingInvoiceDetail.key}-${itemIndex}`}
                              >
                                <td className="px-3 py-2 font-semibold text-slate-500">{itemIndex + 1}</td>
                                <td className="px-3 py-2 font-semibold leading-5 text-slate-800">
                                  {item.description}
                                </td>
                                <td className="px-3 py-2 text-right font-bold text-slate-950">
                                  {item.amountLabel}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                  </div>

                {customerFolderJobViewState.status === "loaded" &&
                customerFolderJobViewState.savedBookings.length > 0 ? (
                  <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
                    <div
                      aria-hidden="true"
                      className="hidden grid-cols-[minmax(10rem,1fr)_minmax(9rem,1fr)_minmax(8rem,0.8fr)_8rem] gap-3 border-b border-slate-200 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 md:grid"
                    >
                      <span>Booking</span>
                      <span>Pickup / service</span>
                      <span>Status</span>
                      <span className="text-right">Action</span>
                    </div>
                    <div className="divide-y divide-slate-200" data-customer-folder-jobs-list="true">
                      {customerFolderSavedBookingMonthGroups.map((group) => (
                        <div data-customer-folder-job-month-group={group.key} key={group.key}>
                          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                            {group.label} - {savedBookingCountLabel(group.bookings.length, "job")}
                          </div>
                          <div className="divide-y divide-slate-200">
                            {group.bookings.map((booking) => {
                        const bookingReference =
                          savedBookingReference(booking) ||
                          `${booking.customer_id || "customer"}-${booking.pickup_at || "job"}`;
                        const isExpanded = expandedCustomerFolderJobReference === bookingReference;
                        const dispatchHandoffHref = customerFolderJobDispatchHref(booking);
                        const exactEditorIsCurrent =
                          isExpanded &&
                          customerFolderExactBookingEditorState.bookingReference === bookingReference;
                        const exactEditorStatus = exactEditorIsCurrent
                          ? customerFolderExactBookingEditorState.status
                          : "idle";
                        const exactEditorForm = exactEditorIsCurrent
                          ? customerFolderExactBookingEditorState.form
                          : initialCustomerFolderExactBookingEditForm;
                        const exactBooking = exactEditorIsCurrent
                          ? customerFolderExactBookingEditorState.booking
                          : null;
                        const exactActionInFlight = ["loading", "saving", "deleting"].includes(
                          exactEditorStatus,
                        );
                        const exactDeleteBlockReason = customerFolderExactBookingDeleteBlockReason(exactBooking);

                        return (
                          <article
                            className="grid gap-2 px-3 py-2 text-sm leading-5 md:grid-cols-[minmax(10rem,1fr)_minmax(9rem,1fr)_minmax(8rem,0.8fr)_8rem] md:items-center md:gap-3"
                            data-customer-folder-job-row={bookingReference}
                            key={bookingReference}
                          >
                            <div className="min-w-0">
                              <p
                                className="truncate font-bold text-slate-950"
                                title={savedBookingDisplayText(booking.booking_reference, "Reference unavailable")}
                              >
                                {compactCustomerBookingReference(booking.booking_reference, "Reference unavailable")}
                              </p>
                              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                                Account: {savedBookingDisplayText(booking.customer_id, "Not linked")}
                              </p>
                            </div>
                            <p className="min-w-0 text-xs font-semibold text-slate-600">
                              <span className="block truncate">{savedBookingDateLabel(booking)}</span>
                              <span className="block truncate">
                                {savedBookingDisplayText(booking.service_type, "Service not set")}
                              </span>
                            </p>
                            <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                              {savedBookingStatusLabel(booking)}
                            </p>
                            <div className="flex justify-start md:justify-end">
                              <button
                                className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-slate-700"
                                data-customer-folder-job-view-toggle={bookingReference}
                                onClick={() => loadCustomerFolderExactBookingForEdit(booking)}
                                type="button"
                              >
                                {isExpanded ? "Close" : "View/Edit"}
                              </button>
                            </div>
                            {isExpanded ? (
                              <div
                                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-700 md:col-span-4"
                                data-customer-folder-job-details={bookingReference}
                              >
                                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                                  <p>
                                    <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                      Reference
                                    </span>
                                    {savedBookingDisplayText(booking.booking_reference)}
                                  </p>
                                  <p>
                                    <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                      Pickup
                                    </span>
                                    {formatSingaporePickupDisplay(booking.pickup_at, "Not available")}
                                  </p>
                                  <p>
                                    <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                      Service
                                    </span>
                                    {savedBookingDisplayText(booking.service_type, "Not available")}
                                  </p>
                                  <p>
                                    <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                      Account
                                    </span>
                                    {savedBookingDisplayText(booking.customer_account, "Not available")}
                                  </p>
                                  {booking.account_scope_label ? (
                                    <p>
                                      <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Scope
                                      </span>
                                      {savedBookingDisplayText(booking.account_scope_label, "Not available")}
                                    </p>
                                  ) : null}
                                </div>

                                {exactEditorIsCurrent ? (
                                  <p
                                    aria-live="polite"
                                    className={`mt-2 rounded-md border px-3 py-2 ${regularCustomerBookingFeedbackClass(
                                      customerFolderExactBookingEditorState.tone,
                                    )}`}
                                    data-customer-folder-exact-booking-feedback={bookingReference}
                                  >
                                    {customerFolderExactBookingEditorState.message}
                                  </p>
                                ) : null}

                                {exactEditorIsCurrent && exactBooking ? (
                                  <div
                                    className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-4"
                                    data-customer-folder-exact-booking-editor={bookingReference}
                                  >
                                    <label className="grid gap-1">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Passenger
                                      </span>
                                      <input
                                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
                                        data-customer-folder-exact-booking-passenger={bookingReference}
                                        onChange={(event) =>
                                          updateCustomerFolderExactBookingForm(
                                            "passengerName",
                                            event.target.value,
                                          )
                                        }
                                        type="text"
                                        value={exactEditorForm.passengerName}
                                      />
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Pickup date/time
                                      </span>
                                      <input
                                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
                                        data-customer-folder-exact-booking-pickup-datetime={bookingReference}
                                        onChange={(event) =>
                                          updateCustomerFolderExactBookingForm(
                                            "pickupDateTime",
                                            event.target.value,
                                          )
                                        }
                                        type="datetime-local"
                                        value={exactEditorForm.pickupDateTime}
                                      />
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Pickup
                                      </span>
                                      <input
                                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
                                        data-customer-folder-exact-booking-pickup={bookingReference}
                                        onChange={(event) =>
                                          updateCustomerFolderExactBookingForm(
                                            "pickupLocation",
                                            event.target.value,
                                          )
                                        }
                                        type="text"
                                        value={exactEditorForm.pickupLocation}
                                      />
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Drop-off
                                      </span>
                                      <input
                                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
                                        data-customer-folder-exact-booking-dropoff={bookingReference}
                                        onChange={(event) =>
                                          updateCustomerFolderExactBookingForm(
                                            "dropoffLocation",
                                            event.target.value,
                                          )
                                        }
                                        type="text"
                                        value={exactEditorForm.dropoffLocation}
                                      />
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Service
                                      </span>
                                      <input
                                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
                                        data-customer-folder-exact-booking-service={bookingReference}
                                        onChange={(event) =>
                                          updateCustomerFolderExactBookingForm("serviceType", event.target.value)
                                        }
                                        type="text"
                                        value={exactEditorForm.serviceType}
                                      />
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Vehicle
                                      </span>
                                      <input
                                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
                                        data-customer-folder-exact-booking-vehicle={bookingReference}
                                        onChange={(event) =>
                                          updateCustomerFolderExactBookingForm("vehicleType", event.target.value)
                                        }
                                        type="text"
                                        value={exactEditorForm.vehicleType}
                                      />
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Driver
                                      </span>
                                      <input
                                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
                                        data-customer-folder-exact-booking-driver={bookingReference}
                                        onChange={(event) =>
                                          updateCustomerFolderExactBookingForm("driverName", event.target.value)
                                        }
                                        type="text"
                                        value={exactEditorForm.driverName}
                                      />
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Driver contact
                                      </span>
                                      <input
                                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
                                        data-customer-folder-exact-booking-driver-contact={bookingReference}
                                        onChange={(event) =>
                                          updateCustomerFolderExactBookingForm(
                                            "driverContact",
                                            event.target.value,
                                          )
                                        }
                                        type="text"
                                        value={exactEditorForm.driverContact}
                                      />
                                    </label>
                                    <label className="grid gap-1">
                                      <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                                        Plate
                                      </span>
                                      <input
                                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
                                        data-customer-folder-exact-booking-plate={bookingReference}
                                        onChange={(event) =>
                                          updateCustomerFolderExactBookingForm(
                                            "driverPlateNumber",
                                            event.target.value,
                                          )
                                        }
                                        type="text"
                                        value={exactEditorForm.driverPlateNumber}
                                      />
                                    </label>
                                  </div>
                                ) : null}

                                <div className="mt-3 flex flex-wrap gap-2">
                                  {exactEditorIsCurrent && exactBooking ? (
                                    <>
                                      <button
                                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-emerald-500 bg-white px-3 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                                        data-customer-folder-exact-booking-save={bookingReference}
                                        disabled={exactActionInFlight}
                                        onClick={saveCustomerFolderExactBookingEdit}
                                        type="button"
                                      >
                                        {exactEditorStatus === "saving" ? "Saving" : "Save changes"}
                                      </button>
                                      <button
                                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-rose-300 bg-white px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                                        data-customer-folder-job-delete={bookingReference}
                                        disabled={exactActionInFlight || Boolean(exactDeleteBlockReason)}
                                        onClick={deleteCustomerFolderExactBooking}
                                        title={exactDeleteBlockReason || "Delete completed/cancelled job"}
                                        type="button"
                                      >
                                        {exactEditorStatus === "deleting" ? "Deleting" : "Delete job"}
                                      </button>
                                    </>
                                  ) : null}
                                  {dispatchHandoffHref ? (
                                    <Link
                                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-950 px-3 text-xs font-bold text-white transition hover:bg-slate-800"
                                      data-customer-folder-job-open-dispatch={bookingReference}
                                      href={dispatchHandoffHref}
                                    >
                                      Open in Dispatch
                                    </Link>
                                  ) : null}
                                </div>
                                {exactEditorIsCurrent && exactBooking && exactDeleteBlockReason ? (
                                  <p className="mt-2 text-[11px] font-semibold text-slate-500">
                                    {exactDeleteBlockReason}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </article>
                        );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </section>
        ) : null}

        {advancedInvoiceWorkbenchVisible ? (
          <details
            className="rounded-lg border border-slate-200 bg-white shadow-sm"
            data-customer-billing-workbench-drawer="true"
            open={
              Boolean(customerInvoicePrepRow) ||
              Boolean(plainInvoicePreview) ||
              Boolean(plainInvoiceForm.billToName.trim())
            }
          >
          <summary
            className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-900 [&::-webkit-details-marker]:hidden"
            data-customer-billing-workbench-summary="true"
          >
	            Advanced invoice workbench
            <span className="text-xs font-semibold text-slate-500">Open only after review</span>
          </summary>
          <div
            className="grid gap-4 border-t border-slate-200 p-4 sm:p-5"
            data-customer-billing-workbench-contents="true"
          >
        <section
          className="rounded-lg border border-slate-200 bg-white shadow-sm"
          data-customer-invoice-workspace="true"
        >
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Invoice workspace
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">Send Invoice Workbench</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Existing guarded controls for final staff review. Use the customer overview and invoice detail
                  above first, then load one exact customer/month from the selected customer folder or create a manual
                  billing document before any draft, issue, PDF, email, paid, unpaid, or credit action.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
                  data-plain-invoice-start-action="true"
                  onClick={focusPlainInvoicePanel}
                  type="button"
                >
                  Create Invoice
                </button>
              </div>
            </div>
            {customerInvoiceWorkspaceTabs.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2" data-customer-invoice-workspace-tabs="true">
                {customerInvoiceWorkspaceTabs.map((tab) => (
                  <button
                    className={`min-h-10 rounded-md border px-3 py-2 text-sm font-bold transition ${
                      customerInvoiceWorkspaceTab === tab.value
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-800 hover:border-slate-500 hover:bg-slate-50"
                    }`}
                    data-customer-invoice-workspace-tab={tab.value}
                    key={tab.value}
                    onClick={() => setCustomerInvoiceWorkspaceTab(tab.value)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div
              className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
              data-customer-invoice-prep-panel="true"
              ref={customerInvoicePrepPanelRef}
              tabIndex={-1}
            >
              {customerInvoicePrepRow ? (
                <div
                  className="grid gap-2 text-sm leading-5 lg:grid-cols-[minmax(12rem,1.2fr)_minmax(8rem,0.7fr)_minmax(14rem,1.4fr)_auto] lg:items-center"
                  data-customer-invoice-prep-active={customerInvoicePrepRow.key}
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Invoice prep
                    </p>
                    <p className="truncate font-bold text-slate-950">{customerInvoicePrepRow.customerName}</p>
                    <p className="truncate text-xs text-slate-500" title={customerInvoicePrepRow.reference}>
                      {compactCustomerBookingReference(customerInvoicePrepRow.reference)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Amount</p>
                    <p className="font-bold text-slate-950">{customerInvoicePrepRow.amount}</p>
                    <p className="truncate text-xs text-slate-500">{customerInvoicePrepRow.statusLabel}</p>
                    {customerInvoiceCalculatedAmountCents !== null ? (
                      <p
                        className="mt-1 text-xs font-semibold leading-4 text-emerald-800"
                        data-customer-invoice-calculated-amount="true"
                      >
                        Calculated: {formatInvoiceAmount(customerInvoiceCalculatedAmountCents)}
                        {customerInvoiceCalculatedSourceLabel
                          ? ` (${customerInvoiceCalculatedSourceLabel})`
                          : ""}
                      </p>
                    ) : null}
                    {customerInvoicePrepRow.billingBreakdown ? (
                      <p
                        className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-slate-600"
                        data-customer-invoice-prep-billing-breakdown="true"
                      >
                        {customerInvoicePrepRow.billingBreakdown}
                      </p>
                    ) : null}
                    {customerInvoiceCalculatedBillingBreakdown &&
                    customerInvoiceCalculatedBillingBreakdown !== customerInvoicePrepRow.billingBreakdown ? (
                      <p
                        className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-emerald-800"
                        data-customer-invoice-calculated-breakdown="true"
                      >
                        {customerInvoiceCalculatedBillingBreakdown}
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Job / route
                    </p>
                    <p className="truncate font-semibold text-slate-800">
                      {customerInvoicePrepRow.dateLabel} · {customerInvoicePrepRow.service}
                    </p>
                    <p className="truncate text-xs text-slate-500">{customerInvoicePrepRow.route}</p>
                  </div>
                  <div className="flex gap-2 lg:justify-end">
                    {customerInvoicePrepRow.customerFolderHref ? (
                      <Link
                        className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border border-slate-900 bg-slate-900 px-2 text-[11px] font-bold leading-none text-white transition hover:bg-slate-700"
                        data-customer-invoice-prep-open-folder="true"
                        href={customerInvoicePrepRow.customerFolderHref}
                        title="Open customer folder"
                      >
                        Open
                      </Link>
                    ) : null}
                    <button
                      className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-800 transition hover:border-slate-500"
                      data-customer-invoice-prep-clear="true"
                      onClick={clearCustomerInvoicePrep}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  className="text-sm font-semibold leading-5 text-slate-700"
                  data-customer-invoice-prep-empty="true"
                >
	                  No customer loaded. Open a customer from the overview, then prepare that customer&apos;s monthly invoice.
                </p>
              )}
              <p
                aria-live="polite"
                className="mt-2 text-xs font-semibold leading-5 text-slate-600"
                data-customer-invoice-prep-feedback="true"
              >
                {customerInvoicePrepFeedback}
              </p>
              <p
                aria-live="polite"
                className={`mt-1 text-xs font-semibold leading-5 ${
                  customerInvoiceDriverActualTimeReadState.tone === "error"
                    ? "text-rose-700"
                    : customerInvoiceDriverActualTimeReadState.tone === "success"
                      ? "text-emerald-700"
                      : "text-slate-600"
                }`}
                data-customer-invoice-driver-jc-timing="true"
              >
                {customerInvoiceDriverActualTimeReadState.message}
              </p>
              {customerInvoicePrepRow ? (
                <div
                  className="mt-3 border-t border-slate-200 pt-3"
                  data-customer-invoice-issue-panel="true"
                >
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(7rem,0.75fr)_minmax(7rem,0.75fr)_minmax(8rem,0.8fr)_minmax(7rem,0.65fr)_minmax(11rem,1fr)_auto_auto] xl:items-end">
                    <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Document
                      <select
                        className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                        data-customer-invoice-document-type="true"
                        onChange={(event) => {
                          const nextType = event.target.value as CustomerBillingDocumentType;
                          setCustomerInvoiceDocumentType(nextType);

                          if (nextType === "quotation") {
                            setCustomerInvoiceIssueStatus("Unpaid");
                          }
                        }}
                        value={customerInvoiceDocumentType}
                      >
                        <option value="invoice">Invoice</option>
                        <option value="quotation">Quotation</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Approved amount
                      <input
                        className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                        data-customer-invoice-issue-amount="true"
                        inputMode="decimal"
                        onChange={(event) => {
                          setCustomerInvoiceIssueAmount(event.target.value);
                        }}
                        placeholder="e.g. 420.00"
                        value={customerInvoiceIssueAmount}
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Due date
                      <input
                        className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                        data-customer-invoice-issue-due-date="true"
                        onChange={(event) => {
                          setCustomerInvoiceIssueDueDate(event.target.value);
                        }}
                        type="date"
                        value={customerInvoiceIssueDueDate}
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Status
                      <select
                        className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                        data-customer-invoice-issue-status="true"
                        disabled={customerInvoiceDocumentType === "quotation"}
                        onChange={(event) => {
                          setCustomerInvoiceIssueStatus(event.target.value as CustomerLocalInvoiceStatus);
                        }}
                        value={customerInvoiceIssueStatus}
                      >
                        <option value="Unpaid">Unpaid</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Customer email
                      <input
                        className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                        data-customer-invoice-recipient-email="true"
                        inputMode="email"
                        onChange={(event) => {
                          setCustomerInvoiceRecipientEmail(event.target.value);
                        }}
                        placeholder="customer@email.com"
                        type="email"
                        value={customerInvoiceRecipientEmail}
                      />
                    </label>
                    <label className="inline-flex h-7 w-fit items-center gap-1.5 self-end justify-self-start whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-700 xl:mt-5">
                      <input
                        checked={customerInvoiceCardPaymentEnabled}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-slate-900"
                        data-customer-invoice-card-payment-enabled="true"
                        onChange={(event) => {
                          const isEnabled = event.target.checked;
                          setCustomerInvoiceCardPaymentEnabled(isEnabled);

                          if (!isEnabled) {
                            setCustomerInvoiceCardFeeApplies(false);
                          }
                        }}
                        type="checkbox"
                      />
                      <span>Card</span>
                    </label>
                    <label
                      className={`inline-flex h-7 w-fit items-center gap-1.5 self-end justify-self-start whitespace-nowrap rounded-md border px-2 text-[11px] font-bold leading-none xl:mt-5 ${
                        customerInvoiceCardPaymentEnabled
                          ? "border-slate-300 bg-white text-slate-700"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      <input
                        checked={customerInvoiceCardFeeApplies}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-slate-900 disabled:border-slate-300"
                        data-customer-invoice-card-fee-applies="true"
                        disabled={!customerInvoiceCardPaymentEnabled}
                        onChange={(event) => {
                          setCustomerInvoiceCardFeeApplies(event.target.checked);
                        }}
                        type="checkbox"
                      />
                      <span>10% fee</span>
                    </label>
                    {customerInvoiceAmountEdited ? (
                      <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-amber-700 sm:col-span-2 xl:col-span-5">
                        Adjustment reason
                        <input
                          className="mt-1 h-8 w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950 outline-none focus:border-amber-700"
                          data-customer-invoice-override-reason="true"
                          onChange={(event) => {
                            setCustomerInvoiceAdjustmentReason(event.target.value);
                          }}
                          placeholder="e.g. approved discount, waiting time waived, corrected rate"
                          value={customerInvoiceAdjustmentReason}
                        />
                      </label>
                    ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                        isCustomerInvoicePreviewCurrent
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : customerInvoicePreview
                            ? "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500"
                            : "border-slate-300 bg-white text-slate-800 hover:border-slate-600"
                      }`}
                      data-customer-invoice-prep-next-action="true"
                      data-customer-invoice-preview-action="true"
                      onClick={previewPreparedCustomerInvoice}
                      title={`Preview ${customerBillingDocumentLabel(customerInvoiceDocumentType)}`}
                      type="button"
                    >
                      {isCustomerInvoicePreviewCurrent
                        ? "Previewed"
                        : customerInvoicePreview
                          ? "Refresh"
                          : "Preview"}
                    </button>
                    <button
                      className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                        isCustomerInvoicePreviewCurrent
                          ? "border-slate-300 bg-white text-slate-800 hover:border-slate-600"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      }`}
                      aria-disabled={!isCustomerInvoicePreviewCurrent}
                      data-customer-invoice-save-draft="true"
                      onClick={saveCustomerInvoiceDraft}
                      title="Save draft"
                      type="button"
                    >
                      Draft
                    </button>
                    <button
                      className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                        issuingCustomerInvoiceKey === customerInvoicePrepRow.key
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : !isCustomerInvoicePreviewCurrent
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : "border-slate-900 bg-slate-900 text-white hover:bg-slate-700"
                      }`}
                      aria-disabled={!isCustomerInvoicePreviewCurrent}
                      data-customer-invoice-issue-download-pdf="true"
                      onClick={issuePreparedCustomerInvoice}
                      title={`${customerBillingDocumentActionLabel()} ${customerBillingDocumentLabel(customerInvoiceDocumentType)} PDF`}
                      type="button"
                    >
                      {issuingCustomerInvoiceKey === customerInvoicePrepRow.key
                        ? "Issued"
                        : isCustomerInvoicePreviewCurrent
                          ? customerBillingDocumentActionLabel()
                          : customerBillingDocumentActionLabel()}
                    </button>
                    </div>
                  </div>
                  {customerInvoicePreview ? (
                    <div
                      className={`mt-3 rounded-md border px-3 py-2 text-xs leading-5 ${
                        isCustomerInvoicePreviewCurrent
                          ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                          : "border-amber-200 bg-amber-50 text-amber-950"
                      }`}
                      data-customer-invoice-preview-card="true"
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-bold uppercase tracking-[0.08em]">
                          {customerBillingDocumentLabel(customerInvoicePreview.documentType)} Preview{" "}
                          {isCustomerInvoicePreviewCurrent ? "Ready" : "Needs Refresh"}
                        </p>
                        <p className="font-semibold" data-customer-invoice-preview-amount="true">
                          {customerInvoicePreview.amountLabel} / {customerInvoicePreview.folder}
                        </p>
                      </div>
                      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        <div>
                          <dt className="font-bold text-slate-600">Customer</dt>
                          <dd className="font-semibold" data-customer-invoice-preview-customer="true">
                            {customerInvoicePreview.customerName}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-600">Document</dt>
                          <dd className="font-semibold" data-customer-invoice-preview-document-type="true">
                            {customerBillingDocumentLabel(customerInvoicePreview.documentType)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-600">Due date</dt>
                          <dd className="font-semibold">{customerInvoicePreview.dueDateLabel}</dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-600">Reference</dt>
                          <dd className="font-semibold">{customerInvoicePreview.reference}</dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-600">Source</dt>
                          <dd className="font-semibold">{customerInvoicePreview.sourceLabel}</dd>
                        </div>
                        <div>
                          <dt className="font-bold text-slate-600">Card payment</dt>
                          <dd
                            className="font-semibold"
                            data-customer-invoice-preview-card-payment="true"
                          >
                            {customerInvoiceCardPaymentPreviewLabel(
                              customerInvoicePreview.cardPaymentEnabled,
                              customerInvoicePreview.cardFeeApplies,
                            )}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-2 font-semibold" data-customer-invoice-preview-line="true">
                        {customerInvoicePreview.lineDescription}
                      </p>
                      <p className="mt-1 text-slate-700">{customerInvoicePreview.route}</p>
                      {!isCustomerInvoicePreviewCurrent ? (
                        <p className="mt-2 font-bold text-amber-800" data-customer-invoice-preview-stale="true">
                          Amount, due date, folder, adjustment reason, or card payment option changed. Refresh
                          preview before issuing.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <p
                    aria-live="polite"
                    className="mt-2 text-xs font-semibold leading-5 text-slate-600"
                    data-customer-invoice-issue-feedback="true"
                  >
                    {customerInvoiceIssueFeedback}
                  </p>
                  <p
                    className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-950"
                    data-customer-invoice-issue-local-boundary="true"
                  >
                    Invoice, quotation, and credit note actions create separated stored billing documents with PDF
                    download. Draft stays admin-only until issued. Card checkbox only changes document wording. No
                    Stripe checkout, payment link, card charge, bank debit, payout, provider job send, or automatic
                    payment action is created here.
                  </p>
                </div>
              ) : null}
              <div
                className="mt-3 border-t border-slate-200 pt-3"
                data-plain-invoice-panel="true"
                ref={plainInvoicePanelRef}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Create Invoice
                    </p>
                    <h3 className="mt-1 text-base font-bold text-slate-950">
                      Manual bill-to
                    </h3>
                  </div>
                  <p className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600">
                    No number yet
                  </p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(9rem,1fr)_minmax(9rem,0.9fr)_minmax(8rem,0.75fr)_minmax(8rem,0.7fr)] xl:items-end">
                  <div className="grid gap-2 sm:col-span-2 xl:col-span-4 xl:grid-cols-[minmax(12rem,1fr)_auto] xl:items-end">
                    <div className="relative grid gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      <span>CRM billing account</span>
                      <button
                        aria-expanded={plainInvoiceCrmPickerOpen}
                        aria-haspopup="listbox"
                        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-left text-xs font-semibold normal-case tracking-normal text-slate-950 outline-none transition hover:border-slate-500 focus:border-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                        data-plain-invoice-crm-account="true"
                        data-plain-invoice-crm-picker="true"
                        disabled={plainInvoiceCrmAccountReadState.status === "loading"}
                        onClick={() => {
                          setPlainInvoiceCrmPickerOpen((currentOpen) => !currentOpen);
                          if (
                            plainInvoiceCrmAccountReadState.status === "idle" &&
                            regularCustomerAccountReadState.status !== "loaded"
                          ) {
                            void loadPlainInvoiceCrmAccounts(plainInvoiceCrmSearchTerm);
                          }
                        }}
                        type="button"
                      >
                        <span className="truncate">{plainInvoiceCrmPickerLabel}</span>
                        <span aria-hidden="true" className="text-slate-500">
                          v
                        </span>
                      </button>
                      {plainInvoiceCrmPickerOpen ? (
                        <div
                          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-md border border-slate-300 bg-white shadow-lg"
                          data-plain-invoice-crm-picker-panel="true"
                        >
                          <div className="grid gap-2 border-b border-slate-200 bg-slate-50 p-2 sm:grid-cols-[minmax(10rem,1fr)_auto]">
                            <label className="grid gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                              Search account starts with
                              <input
                                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold normal-case tracking-normal text-slate-950 outline-none focus:border-slate-700"
                                data-plain-invoice-crm-search="true"
                                onChange={(event) => updatePlainInvoiceCrmSearchTerm(event.target.value)}
                                placeholder="Type c, h, u..."
                                type="search"
                                value={plainInvoiceCrmSearchTerm}
                              />
                            </label>
                            <button
                              className="inline-flex h-8 items-center justify-center self-end rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none normal-case tracking-normal text-slate-700 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                              data-plain-invoice-crm-search-action="true"
                              disabled={plainInvoiceCrmAccountReadState.status === "loading"}
                              onClick={() => void loadPlainInvoiceCrmAccounts(plainInvoiceCrmSearchTerm)}
                              type="button"
                            >
                              Search
                            </button>
                          </div>
                          <div
                            className="max-h-72 overflow-y-auto"
                            data-plain-invoice-crm-results="true"
                            role="listbox"
                          >
                            <button
                              aria-selected={!selectedPlainInvoiceCrmFolderKey && !plainInvoiceForm.crmCustomerId}
                              className={`grid w-full gap-0.5 px-3 py-2 text-left text-xs normal-case tracking-normal transition hover:bg-slate-50 ${
                                selectedPlainInvoiceCrmFolderKey || plainInvoiceForm.crmCustomerId
                                  ? "bg-white text-slate-900"
                                  : "bg-emerald-50 text-emerald-950"
                              }`}
                              data-plain-invoice-crm-result="manual"
                              onClick={() => updatePlainInvoiceCrmBillingAccount("")}
                              role="option"
                              type="button"
                            >
                              <span className="font-bold">Manual bill-to (no CRM link)</span>
                              <span className="font-semibold text-slate-500">No customer/account link</span>
                            </button>
                            {plainInvoiceCrmAccountOptions.map((account) => (
                              <button
                                aria-selected={account.customerFolderKey === selectedPlainInvoiceCrmFolderKey}
                                className={`grid w-full gap-0.5 px-3 py-2 text-left text-xs normal-case tracking-normal transition hover:bg-slate-50 ${
                                  account.customerFolderKey === selectedPlainInvoiceCrmFolderKey
                                    ? "bg-emerald-50 text-emerald-950"
                                    : "bg-white text-slate-900"
                                }`}
                                data-plain-invoice-crm-result={account.customerFolderKey}
                                key={account.customerFolderKey}
                                onClick={() => updatePlainInvoiceCrmBillingAccount(account.customerFolderKey)}
                                role="option"
                                type="button"
                              >
                                <span className="font-bold">{account.customerName}</span>
                                {account.accountScopeLabel ? (
                                  <span className="font-semibold text-emerald-700">
                                    {account.accountScopeLabel}
                                  </span>
                                ) : null}
                                <span className="font-semibold text-slate-500">
                                  {account.customerId} | {account.historyRows} booking
                                  {account.historyRows === 1 ? "" : "s"}
                                </span>
                              </button>
                            ))}
                            {plainInvoiceCrmAccountOptions.length === 0 ? (
                              <p className="px-3 py-3 text-xs font-semibold normal-case tracking-normal text-slate-500">
                                No matching CRM billing accounts.
                              </p>
                            ) : null}
                          </div>
                          <p
                            aria-live="polite"
                            className={`border-t border-slate-200 px-3 py-2 text-[11px] font-semibold normal-case leading-4 tracking-normal ${regularCustomerBookingFeedbackClass(
                              plainInvoiceCrmAccountReadState.tone,
                            )}`}
                            data-plain-invoice-crm-feedback="true"
                          >
                            {plainInvoiceCrmSearchResultsLabel}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <button
                      className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-700 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                      data-plain-invoice-load-crm-accounts="true"
                      disabled={plainInvoiceCrmAccountReadState.status === "loading"}
                      onClick={() => {
                        setPlainInvoiceCrmPickerOpen(true);
                        void loadPlainInvoiceCrmAccounts(plainInvoiceCrmSearchTerm);
                      }}
                      type="button"
                    >
                      {plainInvoiceCrmAccountReadState.status === "loading" ? "Loading" : "Load CRM"}
                    </button>
                  </div>
                  <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 sm:col-span-2 xl:col-span-2">
                    Exact saved booking / PA
                    <select
                      className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700 disabled:bg-slate-100 disabled:text-slate-500"
                      data-plain-invoice-booking-reference="true"
                      disabled={plainInvoiceSavedBookingsLoading || !plainInvoiceForm.crmCustomerId || plainInvoiceSavedBookingOptions.length === 0}
                      onChange={(event) => updatePlainInvoiceSavedBooking(event.target.value)}
                      value={plainInvoiceForm.bookingReference}
                    >
                      <option value="">
                        {plainInvoiceSavedBookingsLoading ? "Loading exact saved bookings" : "Select exact saved booking"}
                      </option>
                      {plainInvoiceSavedBookingOptions.map((booking) => {
                        const reference = savedBookingReference(booking);
                        return (
                          <option key={reference} value={reference}>
                            {reference} — {booking.account_scope_label || "PA not labelled"}
                            {booking.booker_id ? "" : " — PA not verified"}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Bill to
                    <input
                      className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                      data-plain-invoice-bill-to-name="true"
                      onChange={(event) => updatePlainInvoiceForm("billToName", event.target.value)}
                      placeholder="Name / company"
                      value={plainInvoiceForm.billToName}
                    />
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Email
                    <input
                      className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                      data-plain-invoice-bill-to-email="true"
                      inputMode="email"
                      onChange={(event) => updatePlainInvoiceForm("billToEmail", event.target.value)}
                      placeholder="optional"
                      type="email"
                      value={plainInvoiceForm.billToEmail}
                    />
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Reference
                    <input
                      className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                      data-plain-invoice-reference="true"
                      onChange={(event) => updatePlainInvoiceForm("reference", event.target.value)}
                      placeholder="e.g. WALKIN-001"
                      value={plainInvoiceForm.reference}
                    />
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Due date
                    <input
                      className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                      data-plain-invoice-due-date="true"
                      onChange={(event) => updatePlainInvoiceForm("dueDateIso", event.target.value)}
                      type="date"
                      value={plainInvoiceForm.dueDateIso}
                    />
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 sm:col-span-2 xl:col-span-2">
                    Service
                    <input
                      className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                      data-plain-invoice-service="true"
                      onChange={(event) => updatePlainInvoiceForm("service", event.target.value)}
                      value={plainInvoiceForm.service}
                    />
                  </label>
                  <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 sm:col-span-2 xl:col-span-2">
                    Route / notes
                    <input
                      className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                      data-plain-invoice-route="true"
                      onChange={(event) => updatePlainInvoiceForm("route", event.target.value)}
                      placeholder="optional"
                      value={plainInvoiceForm.route}
                    />
                  </label>
                  <div className="flex flex-wrap items-end gap-1.5 sm:col-span-2 xl:col-span-4">
                    <label className="inline-flex h-7 w-fit items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-700">
                      <input
                        checked={plainInvoiceForm.cardPaymentEnabled}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-slate-900"
                        data-plain-invoice-card-payment-enabled="true"
                        onChange={(event) =>
                          updatePlainInvoiceForm("cardPaymentEnabled", event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>Card</span>
                    </label>
                    <label
                      className={`inline-flex h-7 w-fit items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[11px] font-bold leading-none ${
                        plainInvoiceForm.cardPaymentEnabled
                          ? "border-slate-300 bg-white text-slate-700"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      <input
                        checked={plainInvoiceForm.cardFeeApplies}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-slate-900 disabled:border-slate-300"
                        data-plain-invoice-card-fee-applies="true"
                        disabled={!plainInvoiceForm.cardPaymentEnabled}
                        onChange={(event) =>
                          updatePlainInvoiceForm("cardFeeApplies", event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>10% fee</span>
                    </label>
                    <label className="inline-flex h-7 w-fit items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-700">
                      <input
                        checked={plainInvoiceForm.isPaid}
                        className="h-3.5 w-3.5 rounded border-slate-400 text-slate-900"
                        data-plain-invoice-paid-status="true"
                        onChange={(event) =>
                          updatePlainInvoiceForm("isPaid", event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>Paid</span>
                    </label>
                  </div>
                </div>
                <div className="mt-3" data-plain-invoice-line-items="true">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Line items
                    </p>
                    <p
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700"
                      data-plain-invoice-line-items-total="true"
                    >
                      Total {formatInvoiceAmount(plainInvoiceAmountCents)}
                    </p>
                  </div>
                  <div className="mt-2 space-y-2">
                    <div
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]"
                      data-plain-invoice-line-item-row="1"
                    >
                      <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                        Item 1
                        <input
                          className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                          data-plain-invoice-line-description="true"
                          onChange={(event) =>
                            updatePlainInvoiceForm("lineDescription", event.target.value)
                          }
                          placeholder="Service description printed on invoice"
                          value={plainInvoiceForm.lineDescription}
                        />
                      </label>
                      <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                        Amount
                        <input
                          className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                          data-plain-invoice-amount="true"
                          inputMode="decimal"
                          onChange={(event) => updatePlainInvoiceForm("amount", event.target.value)}
                          placeholder="120.00"
                          value={plainInvoiceForm.amount}
                        />
                      </label>
                    </div>
                    {plainInvoiceForm.lineItems.map((item, index) => {
                      const rowNumber = index + 2;

                      return (
                        <div
                          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
                          data-plain-invoice-line-item-row={rowNumber}
                          key={`plain-invoice-line-item-${rowNumber}`}
                        >
                          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                            Item {rowNumber}
                            <input
                              className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                              data-plain-invoice-extra-line-description={rowNumber}
                              onChange={(event) =>
                                updatePlainInvoiceAdditionalLineItem(
                                  index,
                                  "lineDescription",
                                  event.target.value,
                                )
                              }
                              placeholder="Additional service / return trip"
                              value={item.lineDescription}
                            />
                          </label>
                          <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                            Amount
                            <input
                              className="mt-1 h-8 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-950 outline-none focus:border-slate-700"
                              data-plain-invoice-extra-line-amount={rowNumber}
                              inputMode="decimal"
                              onChange={(event) =>
                                updatePlainInvoiceAdditionalLineItem(index, "amount", event.target.value)
                              }
                              placeholder="0.00"
                              value={item.amount}
                            />
                          </label>
                          <button
                            className="mt-5 inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-700 transition hover:border-slate-500"
                            data-plain-invoice-remove-line-item={rowNumber}
                            onClick={() => removePlainInvoiceLineItem(index)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className={`mt-2 inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                      plainInvoiceForm.lineItems.length >= plainInvoiceMaxLineItems - 1
                        ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
                    }`}
                    data-plain-invoice-add-line-item="true"
                    disabled={plainInvoiceForm.lineItems.length >= plainInvoiceMaxLineItems - 1}
                    onClick={addPlainInvoiceLineItem}
                    type="button"
                  >
                    Add item
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <button
                    className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                      isPlainInvoicePreviewCurrent
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : plainInvoicePreview
                          ? "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500"
                          : "border-slate-300 bg-white text-slate-800 hover:border-slate-600"
                    }`}
                    data-plain-invoice-preview-action="true"
                    onClick={previewPlainInvoice}
                    type="button"
                  >
                    {isPlainInvoicePreviewCurrent ? "Previewed" : plainInvoicePreview ? "Refresh" : "Preview"}
                  </button>
                  <button
                    className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                      issuingCustomerInvoiceKey === plainInvoiceDraftActionKey
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : isPlainInvoicePreviewCurrent
                          ? "border-slate-300 bg-white text-slate-800 hover:border-slate-600"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    }`}
                    aria-disabled={!isPlainInvoicePreviewCurrent}
                    data-plain-invoice-draft-action="true"
                    onClick={savePlainInvoiceDraft}
                    type="button"
                  >
                    {issuingCustomerInvoiceKey === plainInvoiceDraftActionKey ? "Saving" : "Draft"}
                  </button>
                  <button
                    className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                      issuingCustomerInvoiceKey === plainInvoiceIssueActionKey
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : isPlainInvoicePreviewCurrent
                          ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-700"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    }`}
                    aria-disabled={!isPlainInvoicePreviewCurrent}
                    data-plain-invoice-issue-action="true"
                    onClick={issuePlainInvoice}
                    type="button"
                  >
                    {issuingCustomerInvoiceKey === plainInvoiceIssueActionKey ? "Issuing" : "Issue"}
                  </button>
                  <button
                    className={`inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                      issuingCustomerInvoiceKey === plainInvoiceEmailActionKey
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : isPlainInvoicePreviewCurrent
                          ? "border-sky-300 bg-white text-sky-900 hover:border-sky-700"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    }`}
                    aria-disabled={!isPlainInvoicePreviewCurrent}
                    data-plain-invoice-email-action="true"
                    onClick={emailPlainInvoice}
                    type="button"
                  >
                    {issuingCustomerInvoiceKey === plainInvoiceEmailActionKey ? "Emailing" : "Email"}
                  </button>
                  <button
                    className="inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-700 transition hover:border-slate-500"
                    data-plain-invoice-clear-action="true"
                    onClick={clearPlainInvoiceForm}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
                {plainInvoicePreview ? (
                  <div
                    className={`mt-3 rounded-md border px-3 py-2 text-xs leading-5 ${
                      isPlainInvoicePreviewCurrent
                        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                        : "border-amber-200 bg-amber-50 text-amber-950"
                    }`}
                    data-plain-invoice-preview-card="true"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-bold uppercase tracking-[0.08em]">
                        Create Invoice Preview {isPlainInvoicePreviewCurrent ? "Ready" : "Needs Refresh"}
                      </p>
                      <p className="font-semibold" data-plain-invoice-preview-amount="true">
                        {plainInvoicePreview.amountLabel} / {plainInvoicePreview.folder}
                      </p>
                    </div>
                    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      <div>
                        <dt className="font-bold text-slate-600">Bill to</dt>
                        <dd className="font-semibold" data-plain-invoice-preview-bill-to="true">
                          {plainInvoicePreview.customerName}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-600">Billing link</dt>
                        <dd className="font-semibold" data-plain-invoice-preview-crm-link="true">
                          {plainInvoicePreview.sourceLabel === "Linked CRM billing account"
                            ? "CRM account"
                            : "Manual"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-600">Reference</dt>
                        <dd className="font-semibold">{plainInvoicePreview.reference}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-600">Due date</dt>
                        <dd className="font-semibold">{plainInvoicePreview.dueDateLabel}</dd>
                      </div>
                      <div>
                        <dt className="font-bold text-slate-600">Card payment</dt>
                        <dd className="font-semibold">
                          {customerInvoiceCardPaymentPreviewLabel(
                            plainInvoicePreview.cardPaymentEnabled,
                            plainInvoicePreview.cardFeeApplies,
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div
                      className="mt-2 divide-y divide-emerald-100 rounded-md border border-emerald-100 bg-white/70"
                      data-plain-invoice-preview-line="true"
                      data-plain-invoice-preview-lines="true"
                    >
                      {plainInvoicePreview.lineItems.map((item, index) => (
                        <div
                          className="grid gap-1 px-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_7rem] sm:items-start"
                          data-plain-invoice-preview-line-row={index + 1}
                          key={`${item.description}-${index}`}
                        >
                          <p className="font-semibold text-slate-900">
                            {index + 1}. {item.description}
                          </p>
                          <p className="font-bold text-slate-950 sm:text-right">{item.amountLabel}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-slate-700">{plainInvoicePreview.route}</p>
                    {!isPlainInvoicePreviewCurrent ? (
                      <p className="mt-2 font-bold text-amber-800" data-plain-invoice-preview-stale="true">
                        Create Invoice fields changed. Refresh preview before Draft or Issue.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <p
                  aria-live="polite"
                  className={`mt-2 rounded-md border px-3 py-2 text-sm font-semibold leading-5 ${regularCustomerBookingFeedbackClass(
                    plainInvoiceFeedbackTone,
                  )}`}
                  data-plain-invoice-feedback="true"
                  data-plain-invoice-feedback-tone={plainInvoiceFeedbackTone}
                >
                  {plainInvoiceFeedback}
                </p>
                <p
                  className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-950"
                  data-plain-invoice-boundary="true"
                >
                  Create Invoice stores an admin billing document only after Draft or Issue. Select a CRM billing
                  account to link the invoice to an existing customer/account, or leave it as manual bill-to. It does
                  not create a customer folder, CRM account, portal invite, prefix reservation, payment link, provider
                  send, payout, or GPS/live-location action. Email issues the invoice first, then uses the existing
                  guarded email route. Paid only changes invoice status; it does not record a payment.
                </p>
              </div>
              {customerInvoiceDrafts.length > 0 ? (
                <div
                  className="mt-3 border-t border-slate-200 pt-3"
                  data-customer-invoice-draft-list="true"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Drafts
                    </p>
                    <p className="text-xs font-bold text-slate-600">
                      {customerInvoiceDrafts.length} draft
                      {customerInvoiceDrafts.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <tbody>
                        {customerInvoiceDrafts.map((draft) => (
                          <tr
                            className="border-t border-slate-100"
                            data-customer-invoice-draft-row={draft.draftId}
                            key={draft.draftId}
                          >
                            <td className="py-2 pr-3 font-bold text-slate-950">
                              {draft.documentNumber || draft.draftId}
                            </td>
                            <td className="py-2 pr-3 text-slate-700">
                              {customerBillingDocumentLabel(draft.documentType)}
                            </td>
                            <td className="py-2 pr-3 text-slate-700">{draft.customerName}</td>
                            <td className="py-2 pr-3 font-semibold text-slate-950">{draft.amountLabel}</td>
                            <td className="py-2 pr-3 text-slate-700">
                              {draft.dueDateLabel}
                              <span className="ml-2 text-slate-400">
                                {draft.storageSource === "server" ? "Stored" : "Local"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {issuedCustomerInvoices.length > 0 ? (
                <div
                  className="mt-3 border-t border-slate-200 pt-3"
                  data-customer-invoice-issued-local-list="true"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Billing documents
                    </p>
                    <div
                      className="flex flex-wrap items-center justify-end gap-1.5"
                      data-customer-invoice-issued-local-pagination="true"
                    >
                      <p className="text-xs font-bold text-slate-600">
                        {customerBillingDocumentShowingStart}-{customerBillingDocumentShowingEnd} of{" "}
                        {issuedCustomerInvoices.length}
                      </p>
                      {customerBillingDocumentTotalPages > 1 ? (
                        <>
                          <button
                            className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-700 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                            data-customer-invoice-issued-local-prev-page="true"
                            disabled={currentCustomerBillingDocumentPage <= 1}
                            onClick={() => {
                              setCustomerBillingDocumentPage((currentPage) =>
                                Math.max(1, currentPage - 1),
                              );
                            }}
                            type="button"
                          >
                            Prev
                          </button>
                          <button
                            className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-700 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                            data-customer-invoice-issued-local-next-page="true"
                            disabled={currentCustomerBillingDocumentPage >= customerBillingDocumentTotalPages}
                            onClick={() => {
                              setCustomerBillingDocumentPage((currentPage) =>
                                Math.min(customerBillingDocumentTotalPages, currentPage + 1),
                              );
                            }}
                            type="button"
                          >
                            Next
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-xs">
                      <tbody>
                        {visibleIssuedCustomerInvoices.map((invoice) => {
                          const invoiceDocumentType = invoice.documentType || "invoice";

                          return (
                            <tr
                              className="border-t border-slate-100"
                              data-customer-invoice-issued-local-row={invoice.invoiceNumber}
                              key={invoice.id}
                            >
                              <td className="py-2 pr-3 font-bold text-slate-950">{invoice.invoiceNumber}</td>
                              <td className="py-2 pr-3 text-slate-700">
                                {customerBillingDocumentLabel(invoiceDocumentType)}
                              </td>
                              <td className="py-2 pr-3 text-slate-700">{invoice.customerName}</td>
                              <td className="py-2 pr-3 font-semibold text-slate-950">{invoice.amountLabel}</td>
                              <td className="py-2 pr-3 text-slate-700">
                                <span>{invoiceDocumentType === "credit_note" ? "Credit note" : invoice.status}</span>
                                <span className="ml-2 text-slate-400">
                                  {invoice.storageSource === "server" ? "Stored" : "Local"}
                                </span>
                              </td>
                              <td className="py-2 text-right">
                                <div className="inline-flex flex-wrap justify-end gap-1">
                                <button
                                  className={`inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                                    downloadingCustomerInvoiceNumber === invoice.invoiceNumber
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                      : "border-slate-300 bg-white text-slate-800 hover:border-slate-600"
                                  }`}
                                  data-customer-invoice-issued-local-download={invoice.invoiceNumber}
                                  onClick={() => downloadIssuedCustomerInvoice(invoice)}
                                  type="button"
                                >
                                  {downloadingCustomerInvoiceNumber === invoice.invoiceNumber
                                    ? "Saved"
                                    : "PDF"}
                                </button>
                                {invoice.storageSource === "server" ? (
                                  <button
                                    className={`inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                                      emailingCustomerInvoiceNumber === invoice.invoiceNumber ||
                                      invoice.emailDeliveryStatus === "sent"
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                        : invoice.emailDeliveryStatus === "blocked" ||
                                            invoice.emailDeliveryStatus === "failed"
                                          ? "border-amber-300 bg-amber-50 text-amber-800"
                                          : "border-slate-300 bg-white text-slate-800 hover:border-slate-600"
                                    }`}
                                    data-customer-invoice-issued-local-email={invoice.invoiceNumber}
                                    onClick={() => handleCustomerInvoiceEmailAction(invoice)}
                                    title={`Email ${customerBillingDocumentLabel(invoiceDocumentType)}`}
                                    type="button"
                                  >
                                    {emailingCustomerInvoiceNumber === invoice.invoiceNumber
                                      ? "Sending"
                                      : invoice.emailDeliveryStatus === "sent"
                                        ? "Emailed"
                                        : "Email"}
                                  </button>
                                ) : null}
                                {invoiceDocumentType === "quotation" ? (
                                  <>
                                    <span
                                      className="inline-flex h-7 items-center justify-center rounded-md border border-sky-300 bg-sky-50 px-2 text-[11px] font-bold leading-none text-sky-900"
                                      data-customer-invoice-issued-local-quotation={invoice.invoiceNumber}
                                    >
                                      Quote
                                    </span>
                                    <button
                                      className="inline-flex h-7 items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-[11px] font-bold leading-none text-slate-800 transition hover:border-slate-600"
                                      data-customer-invoice-issued-local-convert-quote={invoice.invoiceNumber}
                                      onClick={() => convertQuotationToInvoice(invoice)}
                                      title="Convert quotation to invoice"
                                      type="button"
                                    >
                                      Convert
                                    </button>
                                  </>
                                ) : invoiceDocumentType === "credit_note" ? (
                                  <span
                                    className="inline-flex h-7 items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-2 text-[11px] font-bold leading-none text-amber-900"
                                    data-customer-invoice-issued-local-credit-note={invoice.invoiceNumber}
                                  >
                                    Credit
                                  </span>
                                ) : invoice.status === "Paid" ? (
                                  <>
                                    <button
                                      className={`inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                                        updatingCustomerInvoiceStatusNumber === invoice.invoiceNumber
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                          : "border-amber-300 bg-white text-amber-800 hover:border-amber-600"
                                      }`}
                                      data-customer-invoice-issued-local-mark-unpaid={invoice.invoiceNumber}
                                      data-customer-invoice-issued-local-status-toggle={invoice.invoiceNumber}
                                      onClick={() => markIssuedCustomerInvoiceUnpaid(invoice)}
                                      title="Mark invoice unpaid"
                                      type="button"
                                    >
                                      Unpaid
                                    </button>
                                    <button
                                      className="inline-flex h-7 items-center justify-center rounded-md border border-amber-300 bg-white px-2 text-[11px] font-bold leading-none text-amber-800 transition hover:border-amber-600"
                                      data-customer-invoice-issued-local-credit-action={invoice.invoiceNumber}
                                      onClick={() => createCreditNoteFromPaidInvoice(invoice)}
                                      title="Create credit note"
                                      type="button"
                                    >
                                      Credit
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      className={`inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                                        updatingCustomerInvoiceStatusNumber === invoice.invoiceNumber
                                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                          : "border-emerald-300 bg-white text-emerald-800 hover:border-emerald-600"
                                      }`}
                                      data-customer-invoice-issued-local-mark-paid={invoice.invoiceNumber}
                                      data-customer-invoice-issued-local-status-toggle={invoice.invoiceNumber}
                                      onClick={() => markIssuedCustomerInvoicePaid(invoice)}
                                      title="Mark invoice paid"
                                      type="button"
                                    >
                                      Paid
                                    </button>
                                    {isApprovedCustomerTestInvoiceArchiveCandidate(invoice) ? (
                                      <button
                                        className={`inline-flex h-7 items-center justify-center rounded-md border px-2 text-[11px] font-bold leading-none transition ${
                                          updatingCustomerInvoiceStatusNumber === invoice.invoiceNumber
                                            ? "border-amber-300 bg-amber-50 text-amber-900"
                                            : "border-slate-300 bg-white text-slate-700 hover:border-slate-600"
                                        }`}
                                        data-customer-invoice-issued-local-archive-test={invoice.invoiceNumber}
                                        onClick={() => archiveCustomerTestInvoiceArtifact(invoice)}
                                        title="Archive approved test invoice artifact"
                                        type="button"
                                      >
                                        {updatingCustomerInvoiceStatusNumber === invoice.invoiceNumber
                                          ? "Archiving"
                                          : "Archive"}
                                      </button>
                                    ) : null}
                                  </>
                                )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

          </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}
