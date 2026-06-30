"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  collectionRules,
  mockCustomers,
  mockPaymentSummary,
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
import {
  downloadCustomerInvoicePdf,
  formatInvoiceAmount,
  formatInvoiceDate,
  formatInvoiceMonth,
  invoiceDateInputDaysFromNow,
  parseInvoiceAmountToCents,
  readCustomerLocalInvoices,
  saveCustomerLocalInvoice,
  type CustomerBillingDocumentType,
  type CustomerLocalInvoiceRecord,
  type CustomerLocalInvoiceStatus,
} from "../../lib/customer-local-invoices";

const summaryCards = [
  { label: "Total Outstanding", value: mockPaymentSummary.totalOutstanding },
  { label: "Overdue", value: mockPaymentSummary.overdue },
  { label: "Paid This Month", value: mockPaymentSummary.paidThisMonth },
  { label: "Follow-ups Today", value: mockPaymentSummary.followUpsToday },
];

const adminCustomerAccountsApiPath = "/api/admin-customer-accounts";
const adminCustomerSavedBookingsApiPath = "/api/admin-customer-saved-bookings";
const adminCustomerInvoicesApiPath = "/api/admin-customer-invoices";
const adminCustomerInvoicePdfApiPath = "/api/admin-customer-invoice-pdf";
const adminCustomerInvoiceEmailApiPath = "/api/admin-customer-invoice-email";
const adminCustomerPortalAccessLinksApiPath = "/api/admin-customer-portal-access-links";
const adminDriverJobDspActualTimeSummariesApiPath =
  "/api/admin-driver-job-dsp-actual-time-summaries";

const customerFolderIndexHandoffRows = mockCustomers.map((customer) => {
  const upcomingJobs = customer.bookingHistory.filter((booking) => booking.jobStatus === "Upcoming").length;
  const completedJobs = customer.bookingHistory.filter((booking) => booking.jobStatus === "Completed").length;

  return {
    completedJobs,
    customerId: customer.id,
    customerName: customer.companyName,
    folderHref: `/customers/${customer.id}`,
    historyRows: customer.bookingHistory.length,
    upcomingJobs,
  };
});

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
const customerInvoiceWorkspaceTabs = [
  { label: "Statements", value: "statements" },
  { label: "Outstanding", value: "outstanding" },
  { label: "Follow-up", value: "follow-up" },
] as const;

type CustomerInvoiceWorkspaceTab = (typeof customerInvoiceWorkspaceTabs)[number]["value"];

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
  amount: string;
  billingBreakdown?: string;
  customerFolderHref: string;
  customerId: string;
  customerName: string;
  dateLabel: string;
  invoiceLineDescription?: string;
  key: string;
  reference: string;
  route: string;
  service: string;
  statusLabel: string;
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
  previewKey: string;
  reference: string;
  route: string;
  service: string;
  sourceLabel: string;
};

type CustomerDisplayedInvoiceRecord = CustomerLocalInvoiceRecord & {
  customerEmail?: string;
  emailDeliveryStatus?: "blocked" | "failed" | "not_sent" | "sent";
  emailSentAt?: string | null;
  pdfFilename?: string;
  storageSource?: "local" | "server";
};

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
type CustomerPortalAccessCopyStatus = "copied" | "copying" | "error";

type CustomerPortalAccessFeedback = {
  message: string;
  tone: RegularCustomerBookingFeedbackTone;
};

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
  admin_status?: string | null;
  booking_month?: string | null;
  booking_reference?: string | null;
  customer_account?: string | null;
  customer_id?: string | null;
  customer_status?: string | null;
  pickup_at?: string | null;
  service_type?: string | null;
};

type RegularCustomerAccountReadRecord = {
  completed_count?: number | null;
  customer_account?: string | null;
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

const initialRegularCustomerBookingListFilters: RegularCustomerBookingListFilters = {
  billingMonth: "",
  billingStatus: "",
  customerId: "",
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

function customerBillingDocumentActionLabel(documentType: CustomerBillingDocumentType) {
  if (documentType === "quotation") {
    return "Issue Quote + PDF";
  }

  return "Issue Invoice + PDF";
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

function normalizeCustomerFolderMatch(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function findMockCustomerForSavedAccount(account: RegularCustomerAccountReadRecord) {
  const accountId = normalizeCustomerFolderMatch(account.customer_id);
  const accountName = normalizeCustomerFolderMatch(account.customer_account);

  return (
    mockCustomers.find(
      (customer) =>
        normalizeCustomerFolderMatch(customer.id) === accountId ||
        normalizeCustomerFolderMatch(customer.companyName) === accountName,
    ) ?? null
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

function getMockUnbilledCustomerRows() {
  return mockCustomers.flatMap((customer) =>
    customer.bookingHistory
      .filter(
        (booking) =>
          hasMockBalanceDue(booking.balanceDue) &&
          (booking.paymentStatus === "Unpaid" ||
            (customer.accountType === "Monthly Account" &&
              booking.jobStatus === "Completed" &&
              booking.paymentStatus !== "Paid")),
      )
      .map((booking) => ({
        amount: booking.balanceDue,
        customerFolderHref: `/customers/${customer.id}`,
        customerId: customer.id,
        customerName: customer.companyName,
        dateLabel: booking.date,
        key: `mock-unbilled:${customer.id}:${booking.invoiceNumber}`,
        reference: booking.invoiceNumber,
        route: booking.route,
        service: booking.service,
        statusLabel:
          booking.paymentStatus === "Unpaid"
            ? "Unbilled / needs invoice"
            : "Monthly statement needed",
      })),
  );
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
  const customerInvoicePrepRowKeyRef = useRef("");
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFolderFinderPage, setCustomerFolderFinderPage] = useState(1);
  const [customerFolderFinderSelectedId, setCustomerFolderFinderSelectedId] = useState("");
  const [customerFolderFinderDropdownOpen, setCustomerFolderFinderDropdownOpen] = useState(false);
  const [customerPortalAccessCopyStates, setCustomerPortalAccessCopyStates] = useState<
    Record<string, CustomerPortalAccessCopyStatus>
  >({});
  const [customerPortalAccessFeedback, setCustomerPortalAccessFeedback] =
    useState<CustomerPortalAccessFeedback | null>(null);
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
  const [regularCustomerSavedBookingReadState, setRegularCustomerSavedBookingReadState] =
    useState<RegularCustomerSavedBookingReadState>({
      message: "Select a customer/account, then load saved bookings from the guarded admin read path.",
      savedBookings: [],
      status: "idle",
      summary: null,
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
  const [selectedUnbilledCustomerRowKey, setSelectedUnbilledCustomerRowKey] = useState("");
  const [preparingUnbilledCustomerRowKey, setPreparingUnbilledCustomerRowKey] = useState("");
  const [customerInvoicePrepRowKey, setCustomerInvoicePrepRowKey] = useState("");
  const [customerInvoicePrepFeedback, setCustomerInvoicePrepFeedback] = useState(
    "Choose Prepare from Unbilled Customers to load one customer into the invoice workbench.",
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
  const [issuedCustomerInvoices, setIssuedCustomerInvoices] = useState<CustomerDisplayedInvoiceRecord[]>(() =>
    readCustomerLocalInvoices().map(displayLocalInvoice),
  );
  const [customerInvoiceWorkspaceTab, setCustomerInvoiceWorkspaceTab] =
    useState<CustomerInvoiceWorkspaceTab>("statements");
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
      return customerFolderIndexHandoffRows.map((row) => ({
        ...row,
        latestBookingReference: null as string | null,
        latestPickupAt: null as string | null,
        latestServiceType: null as string | null,
        source: "local-folder-index" as const,
      }));
    }

    return regularCustomerAccountReadState.accounts.map((account) => {
      const matchedCustomer = findMockCustomerForSavedAccount(account);
      const customerAccount = String(account.customer_account ?? "").trim() || "Customer account";
      const customerId = String(account.customer_id ?? "").trim() || customerAccount;

      return {
        completedJobs: Number(account.completed_count ?? 0),
        customerId,
        customerName: customerAccount,
        folderHref: matchedCustomer ? `/customers/${matchedCustomer.id}` : "",
        historyRows: Number(account.saved_booking_count ?? 0),
        latestBookingReference: account.latest_booking_reference ?? null,
        latestPickupAt: account.latest_pickup_at ?? null,
        latestServiceType: account.latest_service_type ?? null,
        source: "saved-account-read" as const,
        upcomingJobs: Number(account.upcoming_count ?? 0),
      };
    });
  }, [regularCustomerAccountReadState.accounts, regularCustomerAccountReadState.status]);
  const selectedCustomerFolderFinderRow = useMemo(
    () =>
      customerFolderIndexRows.find(
        (row) => row.customerId === customerFolderFinderSelectedId,
      ) ?? null,
    [customerFolderFinderSelectedId, customerFolderIndexRows],
  );
  const filteredCustomers = useMemo(() => {
    return customerFolderIndexRows.filter((row) => {
      if (customerFolderFinderSelectedId && row.customerId !== customerFolderFinderSelectedId) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return [
        row.customerName,
        row.customerId,
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
    const localDraftRows = regularCustomerBookingListItems
      .filter((item) => item.billingStatus.trim().toLowerCase().includes("unbilled"))
      .map((item) => {
        const hourlyInvoiceReview = getRegularCustomerHourlyInvoiceReview(item);

        return {
          amount: hourlyInvoiceReview?.amountLabel ?? "Draft amount not set",
          billingBreakdown: hourlyInvoiceReview?.billingBreakdown,
          customerFolderHref: item.customerFolderHref,
          customerId: item.customerId,
          customerName: item.customerName,
          dateLabel: item.pickupDate || "Date TBC",
          invoiceLineDescription: hourlyInvoiceReview?.invoiceLineDescription,
          key: `local-unbilled:${item.id}`,
          reference: item.customerReference || item.id,
          route: `${item.pickupLocation || "Pickup TBC"} > ${item.dropoffLocation || "Drop-off TBC"}`,
          service: item.routeType,
          statusLabel: hourlyInvoiceReview ? "Hourly auto-calculated" : "Unbilled / draft booking",
        };
      })
      .filter((row) => !invoicedReferences.has(normalizedInvoiceReference(row.reference)));

    return [...localDraftRows, ...getMockUnbilledCustomerRows()]
      .filter((row) => !invoicedReferences.has(normalizedInvoiceReference(row.reference)))
      .sort(
        (firstRow, secondRow) =>
          parseMockDateValue(firstRow.dateLabel) - parseMockDateValue(secondRow.dateLabel) ||
          firstRow.customerName.localeCompare(secondRow.customerName),
      );
  }, [issuedCustomerInvoices, regularCustomerBookingListItems]);
  const selectedUnbilledCustomerRow = useMemo(
    () => unbilledCustomerRows.find((row) => row.key === selectedUnbilledCustomerRowKey) ?? null,
    [selectedUnbilledCustomerRowKey, unbilledCustomerRows],
  );
  const visibleUnbilledCustomerRows = selectedUnbilledCustomerRow
    ? [selectedUnbilledCustomerRow]
    : unbilledCustomerRows;
  const unbilledCustomersShowingLabel = selectedUnbilledCustomerRow
    ? `Showing selected unbilled row of ${unbilledCustomerRows.length}`
    : `Showing all ${unbilledCustomerRows.length} unbilled rows`;
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

  useEffect(() => {
    const controller = new AbortController();

    async function loadIssuedCustomerInvoices() {
      const localInvoices = readCustomerLocalInvoices().map(displayLocalInvoice);

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
          const serverInvoiceRecords = safeInvoiceApiRecords(result.invoices).map((invoice) => ({
            ...invoice,
            storageSource: "server" as const,
          }));
          const serverDraftRecords = serverInvoiceRecords.filter(
            (invoice) => invoice.documentState === "draft",
          );
          const serverIssuedRecords = serverInvoiceRecords.filter(
            (invoice) => invoice.documentState !== "draft",
          );

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

  async function loadRegularCustomerAccounts() {
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
      message: "Loading saved customer accounts from the guarded read path...",
      status: "loading",
      summary: null,
      tone: "info",
    });

    try {
      const params = new URLSearchParams({
        limit: "10",
      });
      const response = await fetch(`${adminCustomerAccountsApiPath}?${params.toString()}`, {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Saved customer account read failed safely.");
      }

      const accounts = Array.isArray(result.accounts)
        ? (result.accounts as RegularCustomerAccountReadRecord[])
        : [];
      const returnedCount = Number(result.summary?.returned_count ?? accounts.length);

      setRegularCustomerAccountReadState({
        accounts,
        message:
          returnedCount > 0
            ? `Loaded ${returnedCount} saved customer account${returnedCount === 1 ? "" : "s"}.`
            : "No saved customer accounts were returned.",
        status: "loaded",
        summary: result.summary || null,
        tone: "success",
      });
    } catch {
      setRegularCustomerAccountReadState({
        accounts: [],
        message: "Saved customer account read failed safely or is not enabled for this staff surface.",
        status: "error",
        summary: null,
        tone: "error",
      });
    }
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
      return;
    }

    setRegularCustomerSavedBookingReadState({
      message: `Loading saved bookings for ${selectedRegularCustomer.companyName} through the guarded admin read path...`,
      savedBookings: [],
      status: "loading",
      summary: null,
      tone: "info",
    });

    try {
      const params = new URLSearchParams({
        customer_account: selectedRegularCustomer.companyName,
        limit: "10",
      });
      const response = await fetch(`${adminCustomerSavedBookingsApiPath}?${params.toString()}`, {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Saved booking read failed safely.");
      }

      const savedBookings = Array.isArray(result.saved_bookings)
        ? (result.saved_bookings as RegularCustomerSavedBookingReadRecord[])
        : [];
      const returnedCount = Number(result.summary?.returned_count ?? savedBookings.length);

      setRegularCustomerSavedBookingReadState({
        message:
          returnedCount > 0
            ? `Loaded ${returnedCount} saved booking${returnedCount === 1 ? "" : "s"} for ${selectedRegularCustomer.companyName}.`
            : `No saved bookings returned for ${selectedRegularCustomer.companyName}.`,
        savedBookings,
        status: "loaded",
        summary: result.summary || null,
        tone: "success",
      });
    } catch {
      setRegularCustomerSavedBookingReadState({
        message: "Saved booking read failed safely or is not enabled for this admin surface.",
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
    }
  }

  function updateCustomerFolderFinderSearch(value: string) {
    setCustomerFolderFinderSelectedId("");
    setCustomerFolderFinderDropdownOpen(false);
    setSearchTerm(value);
    setCustomerFolderFinderPage(1);
  }

  function updateCustomerFolderFinderSelection(value: string) {
    setCustomerFolderFinderSelectedId(value);
    setCustomerFolderFinderDropdownOpen(false);
    setSearchTerm("");
    setCustomerFolderFinderPage(1);
  }

  function showAllCustomerFolderFinderRows(pageNumber = 1) {
    setCustomerFolderFinderSelectedId("");
    setSearchTerm("");
    setCustomerFolderFinderPage(pageNumber);
  }

  function customerPortalAccessButtonLabel(customerId: string) {
    const status = customerPortalAccessCopyStates[customerId];

    if (status === "copying") {
      return "Copying";
    }

    if (status === "copied") {
      return "Copied";
    }

    if (status === "error") {
      return "Failed";
    }

    return "Portal";
  }

  async function copyCustomerPortalAccessLink(customer: (typeof customerFolderIndexRows)[number]) {
    const customerAccountReference = customer.customerId.trim();

    if (!customerAccountReference) {
      setCustomerPortalAccessFeedback({
        message: "Customer portal link needs a saved customer account reference first.",
        tone: "error",
      });
      return;
    }

    setCustomerPortalAccessCopyStates((currentStates) => ({
      ...currentStates,
      [customerAccountReference]: "copying",
    }));
    setCustomerPortalAccessFeedback({
      message: `Preparing portal link for ${customer.customerName}...`,
      tone: "info",
    });

    try {
      const response = await fetch(adminCustomerPortalAccessLinksApiPath, {
        body: JSON.stringify({ customerAccountReference }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);
      const url = typeof result?.url === "string" ? result.url : "";

      if (!response.ok || result?.ok !== true || !url) {
        throw new Error("portal-link-blocked");
      }

      await navigator.clipboard.writeText(url);

      setCustomerPortalAccessCopyStates((currentStates) => ({
        ...currentStates,
        [customerAccountReference]: "copied",
      }));
      setCustomerPortalAccessFeedback({
        message: `Portal link copied for ${customer.customerName}. It opens only this customer folder.`,
        tone: "success",
      });
    } catch {
      setCustomerPortalAccessCopyStates((currentStates) => ({
        ...currentStates,
        [customerAccountReference]: "error",
      }));
      setCustomerPortalAccessFeedback({
        message:
          "Customer portal link was not copied. Check the customer portal access allowlist before sharing.",
        tone: "error",
      });
    }
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

  function updateSelectedUnbilledCustomerRow(value: string) {
    setSelectedUnbilledCustomerRowKey(value);
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
      throw new Error(result?.error || "Driver JC timing read failed safely.");
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
      `${row.customerName} loaded from Unbilled Customers. Review the amount and route, then issue only when the invoice is correct.`,
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
    } catch {
      if (customerInvoicePrepRowKeyRef.current !== row.key) {
        return;
      }

      setCustomerInvoiceDriverActualTimeReadState({
        bookingReference,
        message:
          "Driver JC timing read failed safely. Keep the row amount or enter the approved amount before issuing.",
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
      "Invoice prep selection cleared. Choose Prepare from Unbilled Customers to load one customer.",
    );
    setCustomerInvoiceIssueFeedback(
      "Review the amount and due date before issuing. Invoice number is created only when you click issue.",
    );
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
        `Choose Prepare from Unbilled Customers before previewing a ${customerBillingDocumentLabel(
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
        throw new Error("Stored invoice PDF download failed safely.");
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
      customerName: customerInvoicePrepRow.customerName,
      documentState,
      documentType: customerInvoicePreview.documentType,
      dueDateIso: customerInvoicePreview.dueDateIso,
      lineItems: [
        {
          amountLabel: customerInvoicePreview.amountLabel,
          description: customerInvoicePreview.lineDescription,
        },
      ],
      reference: customerInvoicePrepRow.reference,
      route: customerInvoicePrepRow.route,
      service: customerInvoicePrepRow.service,
      status: customerInvoicePreview.folder,
    };
  }

  async function saveCustomerInvoiceDraft() {
    if (!customerInvoicePrepRow) {
      setCustomerInvoiceIssueFeedback("Choose Prepare from Unbilled Customers before saving a draft.");
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
        throw new Error(result?.error || "Customer invoice draft failed safely.");
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
      setCustomerInvoiceIssueFeedback(
        error instanceof Error ? error.message : "Customer invoice draft failed safely.",
      );
    } finally {
      window.setTimeout(() => setIssuingCustomerInvoiceKey(""), 700);
    }
  }

  async function issuePreparedCustomerInvoice() {
    if (!customerInvoicePrepRow) {
      setCustomerInvoiceIssueFeedback("Choose Prepare from Unbilled Customers before issuing an invoice.");
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
        throw new Error(result?.error || "Customer invoice record failed safely.");
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
      setCustomerInvoiceIssueFeedback(
        error instanceof Error
          ? error.message
          : "Customer invoice issue failed safely. No invoice number was confirmed.",
      );
    } finally {
      window.setTimeout(() => setIssuingCustomerInvoiceKey(""), 700);
    }
  }

  async function downloadIssuedCustomerInvoice(invoice: CustomerDisplayedInvoiceRecord) {
    setDownloadingCustomerInvoiceNumber(invoice.invoiceNumber);

    try {
      await downloadStoredCustomerInvoicePdf(invoice);
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} PDF download started.`);
    } catch {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} PDF download failed safely.`);
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
        throw new Error(result?.error || "Customer invoice email failed safely.");
      }

      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} emailed to ${recipientEmail}.`);
    } catch (error) {
      setCustomerInvoiceIssueFeedback(
        error instanceof Error ? error.message : `${invoice.invoiceNumber} email failed safely.`,
      );
    } finally {
      window.setTimeout(() => setEmailingCustomerInvoiceNumber(""), 700);
    }
  }

  async function markIssuedCustomerInvoicePaid(invoice: CustomerDisplayedInvoiceRecord) {
    if (invoice.status === "Paid") {
      setCustomerInvoiceIssueFeedback(`${invoice.invoiceNumber} is already marked Paid in this browser.`);
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
          throw new Error(result?.error || "Customer invoice status update failed safely.");
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
          error instanceof Error
            ? error.message
            : `${invoice.invoiceNumber} paid status failed safely.`,
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
          throw new Error(result?.error || "Customer invoice status update failed safely.");
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
          error instanceof Error
            ? error.message
            : `${invoice.invoiceNumber} unpaid status failed safely.`,
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
        throw new Error(result?.error || "Credit note failed safely.");
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
      setCustomerInvoiceIssueFeedback(
        error instanceof Error ? error.message : "Credit note failed safely.",
      );
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
        throw new Error(result?.error || "Quotation conversion failed safely.");
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
      setCustomerInvoiceIssueFeedback(
        error instanceof Error ? error.message : "Quotation conversion failed safely.",
      );
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
                Work from customer account, statement, outstanding balance, and follow-up queues before sending
                invoices from the approved invoice workflow.
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

        <section
          aria-label="Customer payment summary"
          className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm"
          data-customer-summary-strip="true"
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {summaryCards.map((card) => (
              <div
                className="flex min-h-10 items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"
                data-customer-summary-card={card.label}
                key={card.label}
              >
                <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {card.label}
                </p>
                <p className="text-sm font-bold text-slate-950">{card.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          className="rounded-lg border border-slate-200 bg-white shadow-sm"
          data-customer-dashboard="true"
          data-customer-folder-finder="true"
        >
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Find Customer Folder</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Search all customer folders, scan 10 at a time, then open the correct account before invoice work.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                  onClick={loadRegularCustomerAccounts}
                  type="button"
                >
                  {regularCustomerAccountReadState.status === "loading" ? "Loading" : "Load Accounts"}
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
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
                              customer.customerId === customerFolderFinderSelectedId
                                ? "bg-emerald-50 text-emerald-950"
                                : "bg-white text-slate-900"
                            }`}
                            data-customer-folder-finder-dropdown-page-row={customer.customerId}
                            aria-selected={customer.customerId === customerFolderFinderSelectedId}
                            key={customer.customerId}
                            onClick={() => updateCustomerFolderFinderSelection(customer.customerId)}
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
              className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold leading-5 ${regularCustomerBookingFeedbackClass(
                regularCustomerAccountReadState.tone,
              )}`}
              data-customer-folder-finder-feedback="true"
              data-customer-search-helper="true"
            >
              {selectedCustomerFolderFinderRow
                ? `Dropdown selected ${selectedCustomerFolderFinderRow.customerName}. Open the row below or choose All customer folders to browse ${customerFolderFinderPageSize} per page.`
                : normalizedSearchTerm
                ? `Search is filtering customer folders locally for "${searchTerm}".`
                : regularCustomerAccountReadState.message}
            </p>
            {customerPortalAccessFeedback ? (
              <p
                aria-live="polite"
                className={`mt-2 rounded-md border px-3 py-2 text-sm font-semibold leading-5 ${regularCustomerBookingFeedbackClass(
                  customerPortalAccessFeedback.tone,
                )}`}
                data-customer-portal-access-link-feedback="true"
              >
                {customerPortalAccessFeedback.message}
              </p>
            ) : null}

            <div
              aria-live="polite"
              className="mt-4 overflow-hidden rounded-md border border-slate-200"
              data-customer-results-panel="true"
            >
              {paginatedCustomerFolderFinderRows.length > 0 ? (
                <div>
                  <div
                    aria-hidden="true"
                    className="hidden grid-cols-[minmax(12rem,1.4fr)_7rem_8rem_minmax(12rem,1fr)_11rem] gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 md:grid"
                  >
                    <span>Customer</span>
                    <span>Jobs</span>
                    <span>Status</span>
                    <span>Latest</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <div className="divide-y divide-slate-200" data-customer-folder-finder-list="true">
                    {paginatedCustomerFolderFinderRows.map((customer) => (
                      <article
                        className="grid gap-2 bg-white px-3 py-2 text-sm leading-5 transition hover:bg-slate-50 md:grid-cols-[minmax(12rem,1.4fr)_7rem_8rem_minmax(12rem,1fr)_11rem] md:items-center md:gap-3"
                        data-customer-folder-finder-row={customer.customerId}
                        data-customer-row={customer.customerId}
                        key={customer.customerId}
                      >
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-slate-950 sm:text-base">
                            {customer.customerName}
                          </h3>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            Account: {customer.customerId}
                          </p>
                        </div>
                        <p className="font-semibold text-slate-800">
                          {customer.historyRows} job{customer.historyRows === 1 ? "" : "s"}
                        </p>
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                          {customer.upcomingJobs} up / {customer.completedJobs} done
                        </p>
                        <p className="min-w-0 truncate text-xs font-semibold text-slate-600">
                          {customer.source === "saved-account-read"
                            ? [customer.latestPickupAt, customer.latestServiceType, customer.latestBookingReference]
                                .filter(Boolean)
                                .join(" | ") || "Latest saved service not available"
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
                              Open
                            </Link>
                          ) : (
                            <span
                              className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-center text-xs font-bold text-slate-600"
                              data-customer-folder-finder-no-folder={customer.customerId}
                            >
                              Pending
                            </span>
                          )}
                          <button
                            className={`inline-flex min-h-9 items-center justify-center rounded-md border px-3 text-center text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-70 ${
                              customerPortalAccessCopyStates[customer.customerId] === "copied"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : customerPortalAccessCopyStates[customer.customerId] === "error"
                                  ? "border-rose-300 bg-rose-50 text-rose-800"
                                  : "border-sky-300 bg-white text-sky-900 hover:border-sky-700"
                            }`}
                            data-customer-portal-access-link={customer.customerId}
                            disabled={customerPortalAccessCopyStates[customer.customerId] === "copying"}
                            onClick={() => copyCustomerPortalAccessLink(customer)}
                            type="button"
                          >
                            {customerPortalAccessButtonLabel(customer.customerId)}
                          </button>
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
          </div>
        </section>

        <section
          className="rounded-lg border border-amber-200 bg-white shadow-sm"
          data-unbilled-customers-sector="true"
        >
          <div className="border-b border-amber-200 bg-amber-50/60 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
                  Billing checkpoint
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">Unbilled Customers</h2>
                <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-amber-950">
                  Review these before sending invoices so unbilled or statement-needed accounts are not missed.
                </p>
              </div>
              <p
                className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-amber-950"
                data-unbilled-customers-count="true"
              >
                {unbilledCustomersShowingLabel}
              </p>
            </div>
            <div
              className="mt-3"
              data-unbilled-customers-dropdown="true"
            >
              <label className="text-sm font-semibold text-slate-700">
                Unbilled customer/job
                <select
                  className="mt-1 min-h-10 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-amber-700"
                  data-unbilled-customers-select="true"
                  onChange={(event) => updateSelectedUnbilledCustomerRow(event.target.value)}
                  value={selectedUnbilledCustomerRowKey}
                >
                  <option value="">All unbilled customers</option>
                  {unbilledCustomerRows.map((row) => (
                    <option key={row.key} value={row.key}>
                      {row.customerName} - {row.reference} - {row.amount}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="max-h-72 overflow-auto" data-unbilled-customers-scroll-list="true">
            {visibleUnbilledCustomerRows.length > 0 ? (
              <table
                className="w-full min-w-[820px] border-collapse text-left text-sm"
                data-unbilled-customers-list="true"
              >
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-amber-100 text-[11px] uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-3 py-2 font-bold sm:px-4">Customer</th>
                    <th className="px-3 py-2 font-bold">Status</th>
                    <th className="px-3 py-2 font-bold">Amount</th>
                    <th className="px-3 py-2 font-bold">Job / route</th>
                    <th className="px-3 py-2 text-right font-bold sm:px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUnbilledCustomerRows.map((row) => {
                    const prepareButtonPrepared = isUnbilledPrepareButtonPrepared(row.key);

                    return (
                      <tr
                        className="border-b border-slate-100 text-sm last:border-b-0 hover:bg-amber-50/40"
                        data-unbilled-customer-row={row.key}
                        key={row.key}
                      >
                        <td className="px-3 py-2 sm:px-4">
                          <p className="max-w-[13rem] truncate font-bold text-slate-950">{row.customerName}</p>
                          <p className="max-w-[13rem] truncate text-xs text-slate-500">{row.reference}</p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-amber-950">{row.statusLabel}</p>
                          {row.billingBreakdown ? (
                            <p
                              className="mt-1 max-w-[14rem] text-xs font-semibold leading-4 text-amber-800"
                              data-unbilled-customer-billing-breakdown={row.key}
                            >
                              {row.billingBreakdown}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-950">{row.amount}</td>
                        <td className="px-3 py-2">
                          <p className="max-w-[18rem] truncate font-semibold text-slate-800">
                            {row.dateLabel} · {row.service}
                          </p>
                          <p className="max-w-[18rem] truncate text-xs text-slate-500">{row.route}</p>
                        </td>
                        <td className="px-3 py-2 text-right sm:px-4">
                          <div className="inline-flex items-center gap-2">
                            <button
                              className={`inline-flex min-h-8 items-center justify-center rounded-md border px-3 text-center text-xs font-bold transition ${
                                prepareButtonPrepared
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                  : "border-amber-900 bg-amber-900 text-white hover:bg-amber-800"
                              }`}
                              data-unbilled-customer-prepare-invoice={row.key}
                              onClick={() => prepareCustomerInvoiceFromUnbilled(row)}
                              type="button"
                            >
                              {getUnbilledPrepareButtonLabel(row.key)}
                            </button>
                            {row.customerFolderHref ? (
                              <Link
                                className="inline-flex min-h-8 items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-center text-xs font-bold text-amber-950 transition hover:border-amber-700"
                                data-unbilled-customer-open-folder={row.key}
                                href={row.customerFolderHref}
                              >
                                Open
                              </Link>
                            ) : (
                              <span className="text-xs font-semibold text-slate-500">Folder pending</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="p-5 text-sm leading-6 text-slate-600" data-unbilled-customers-empty="true">
                No unbilled customer rows are visible right now.
              </div>
            )}
          </div>
          <p
            className="border-t border-amber-100 bg-amber-50/60 px-4 py-3 text-xs font-semibold leading-5 text-amber-950 sm:px-5"
            data-unbilled-customers-boundary="true"
          >
            Review-only checkpoint. Opening a folder does not create invoice numbers, generate invoices/PDFs, send
            payment requests, write records, call providers, or change payment status.
          </p>
        </section>

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
                  Use Statements first when preparing invoices. Outstanding balances and follow-up queues stay one
                  click away.
                </p>
              </div>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                {mockStatementPreviewGroups.length} statement preview
                {mockStatementPreviewGroups.length === 1 ? "" : "s"}
              </p>
            </div>
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
                    <p className="truncate text-xs text-slate-500">{customerInvoicePrepRow.reference}</p>
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
                        className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-700"
                        data-customer-invoice-prep-open-folder="true"
                        href={customerInvoicePrepRow.customerFolderHref}
                      >
                        Open folder
                      </Link>
                    ) : null}
                    <button
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-slate-500"
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
                  No customer loaded. Use Prepare in Unbilled Customers to focus one invoice job here.
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
                  <div className="grid gap-2 md:grid-cols-[minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_minmax(8rem,0.7fr)_minmax(8rem,0.6fr)_minmax(12rem,1fr)_auto_auto_auto] md:items-end">
                    <label className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Document
                      <select
                        className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-700"
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
                    <label className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Approved amount
                      <input
                        className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-700"
                        data-customer-invoice-issue-amount="true"
                        inputMode="decimal"
                        onChange={(event) => {
                          setCustomerInvoiceIssueAmount(event.target.value);
                        }}
                        placeholder="e.g. 420.00"
                        value={customerInvoiceIssueAmount}
                      />
                    </label>
                    <label className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Due date
                      <input
                        className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-700"
                        data-customer-invoice-issue-due-date="true"
                        onChange={(event) => {
                          setCustomerInvoiceIssueDueDate(event.target.value);
                        }}
                        type="date"
                        value={customerInvoiceIssueDueDate}
                      />
                    </label>
                    <label className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Status
                      <select
                        className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-700"
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
                    <label className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Customer email
                      <input
                        className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-slate-700"
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
                    <label className="flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 md:mt-5">
                      <input
                        checked={customerInvoiceCardPaymentEnabled}
                        className="h-4 w-4 rounded border-slate-400 text-slate-900"
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
                      <span>Card payment</span>
                    </label>
                    <label
                      className={`flex min-h-9 items-center gap-2 rounded-md border px-3 py-2 text-xs font-bold md:mt-5 ${
                        customerInvoiceCardPaymentEnabled
                          ? "border-slate-300 bg-white text-slate-700"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      <input
                        checked={customerInvoiceCardFeeApplies}
                        className="h-4 w-4 rounded border-slate-400 text-slate-900 disabled:border-slate-300"
                        data-customer-invoice-card-fee-applies="true"
                        disabled={!customerInvoiceCardPaymentEnabled}
                        onChange={(event) => {
                          setCustomerInvoiceCardFeeApplies(event.target.checked);
                        }}
                        type="checkbox"
                      />
                      <span>10% card fee</span>
                    </label>
                    {customerInvoiceAmountEdited ? (
                      <label className="text-xs font-bold uppercase tracking-[0.08em] text-amber-700 md:col-span-4">
                        Adjustment reason
                        <input
                          className="mt-1 min-h-9 w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 outline-none focus:border-amber-700"
                          data-customer-invoice-override-reason="true"
                          onChange={(event) => {
                            setCustomerInvoiceAdjustmentReason(event.target.value);
                          }}
                          placeholder="e.g. approved discount, waiting time waived, corrected rate"
                          value={customerInvoiceAdjustmentReason}
                        />
                      </label>
                    ) : null}
                    <button
                      className={`min-h-9 rounded-md border px-3 py-2 text-sm font-bold transition ${
                        isCustomerInvoicePreviewCurrent
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : customerInvoicePreview
                            ? "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-500"
                            : "border-slate-300 bg-white text-slate-800 hover:border-slate-600"
                      }`}
                      data-customer-invoice-prep-next-action="true"
                      data-customer-invoice-preview-action="true"
                      onClick={previewPreparedCustomerInvoice}
                      type="button"
                    >
                      {isCustomerInvoicePreviewCurrent
                        ? "Previewed"
                        : customerInvoicePreview
                          ? "Refresh Preview"
                          : `Preview ${customerBillingDocumentLabel(customerInvoiceDocumentType)}`}
                    </button>
                    <button
                      className={`min-h-9 rounded-md border px-3 py-2 text-sm font-bold transition ${
                        isCustomerInvoicePreviewCurrent
                          ? "border-slate-300 bg-white text-slate-800 hover:border-slate-600"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      }`}
                      aria-disabled={!isCustomerInvoicePreviewCurrent}
                      data-customer-invoice-save-draft="true"
                      onClick={saveCustomerInvoiceDraft}
                      type="button"
                    >
                      Save Draft
                    </button>
                    <button
                      className={`min-h-9 rounded-md border px-3 py-2 text-sm font-bold transition ${
                        issuingCustomerInvoiceKey === customerInvoicePrepRow.key
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : !isCustomerInvoicePreviewCurrent
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : "border-slate-900 bg-slate-900 text-white hover:bg-slate-700"
                      }`}
                      aria-disabled={!isCustomerInvoicePreviewCurrent}
                      data-customer-invoice-issue-download-pdf="true"
                      onClick={issuePreparedCustomerInvoice}
                      type="button"
                    >
                      {issuingCustomerInvoiceKey === customerInvoicePrepRow.key
                        ? "Issued"
                        : isCustomerInvoicePreviewCurrent
                          ? customerBillingDocumentActionLabel(customerInvoiceDocumentType)
                          : "Preview first"}
                    </button>
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
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                      Billing documents
                    </p>
                    <p className="text-xs font-bold text-slate-600">
                      {issuedCustomerInvoices.length} document{issuedCustomerInvoices.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-xs">
                      <tbody>
                        {issuedCustomerInvoices.slice(0, 5).map((invoice) => {
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
                                  className={`rounded-md border px-2 py-1 font-bold transition ${
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
                                    className={`rounded-md border px-2 py-1 font-bold transition ${
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
                                      className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 font-bold text-sky-900"
                                      data-customer-invoice-issued-local-quotation={invoice.invoiceNumber}
                                    >
                                      Quote
                                    </span>
                                    <button
                                      className="rounded-md border border-slate-300 bg-white px-2 py-1 font-bold text-slate-800 transition hover:border-slate-600"
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
                                    className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-bold text-amber-900"
                                    data-customer-invoice-issued-local-credit-note={invoice.invoiceNumber}
                                  >
                                    Credit
                                  </span>
                                ) : invoice.status === "Paid" ? (
                                  <>
                                    <button
                                      className={`rounded-md border px-2 py-1 font-bold transition ${
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
                                      className="rounded-md border border-amber-300 bg-white px-2 py-1 font-bold text-amber-800 transition hover:border-amber-600"
                                      data-customer-invoice-issued-local-credit-action={invoice.invoiceNumber}
                                      onClick={() => createCreditNoteFromPaidInvoice(invoice)}
                                      title="Create credit note"
                                      type="button"
                                    >
                                      Credit
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className={`rounded-md border px-2 py-1 font-bold transition ${
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

        <div
          className={customerInvoiceWorkspaceTab === "statements" ? "" : "hidden"}
          data-customer-invoice-workspace-panel="statements"
        >
        <section
          className="rounded-lg border border-slate-200 bg-white shadow-sm"
          data-monthly-statement-preview="true"
        >
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Monthly Account Statement Preview</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600" data-monthly-statement-boundary="true">
                  Mock/read-only only. No statement record, invoice record, payment record, bank record, notification,
                  or Supabase row is created.
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600" data-monthly-statement-no-number-boundary="true">
                  No statement is generated, sent, saved, or assigned a real statement number.
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-600">
                Showing {monthlyStatementShowingStart}-{monthlyStatementShowingEnd} of{" "}
                {mockStatementPreviewGroups.length} statement previews
              </p>
            </div>
            <div
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              data-monthly-statement-pagination="true"
            >
              <label className="text-sm font-semibold text-slate-700 sm:max-w-48">
                Page size
                <select
                  className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950"
                  data-monthly-statement-page-size="true"
                  onChange={(event) => {
                    setMonthlyStatementPageSize(Number(event.target.value));
                    setMonthlyStatementPage(1);
                  }}
                  value={monthlyStatementPageSize}
                >
                  {customerQueuePageSizeOptions.map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize} rows
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  data-monthly-statement-previous="true"
                  disabled={currentMonthlyStatementPage <= 1}
                  onClick={() => setMonthlyStatementPage((currentPage) => Math.max(1, currentPage - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  data-monthly-statement-next="true"
                  disabled={currentMonthlyStatementPage >= monthlyStatementTotalPages}
                  onClick={() =>
                    setMonthlyStatementPage((currentPage) => Math.min(monthlyStatementTotalPages, currentPage + 1))
                  }
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {mockStatementPreviewGroups.length > 0 ? (
              paginatedMonthlyStatementGroups.map((group) => (
                <article
                  className="grid gap-2 px-3 py-2 transition hover:bg-slate-50 sm:px-4 lg:grid-cols-[minmax(12rem,1.25fr)_minmax(10rem,0.9fr)_minmax(7rem,0.6fr)_minmax(9rem,auto)] lg:items-center"
                  data-monthly-statement-group={group.key}
                  key={group.key}
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-slate-950 sm:text-base">{group.customerName}</h3>
                    <p className="mt-0.5 truncate text-xs text-slate-500">Prefix: {group.invoicePrefix}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{group.periodLabel}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Rows</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {group.items.length} invoice/reference rows
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">Statement number: not generated</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Mock total</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-950" data-monthly-statement-total={group.key}>
                      {group.statementTotal}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">Fully paid rows excluded</p>
                  </div>

                  <div className="flex items-center gap-2 lg:justify-end">
                    <Link
                      aria-label={`Open Customer Folder for ${group.customerName}`}
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700"
                      data-monthly-statement-open-customer-folder={group.key}
                      href={`/customers/${group.customerId}`}
                    >
                      Open
                    </Link>
                    <details className="group relative flex-1 lg:flex-none">
                      <summary
                        className="inline-flex min-h-9 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
                        data-monthly-statement-actions-toggle={group.key}
                      >
                        <span>Actions</span>
                        <span aria-hidden="true" className="text-slate-500 group-open:hidden">
                          v
                        </span>
                        <span aria-hidden="true" className="hidden text-slate-500 group-open:inline">
                          ^
                        </span>
                      </summary>
                      <div
                        className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white p-2 shadow-lg sm:w-96"
                        data-monthly-statement-actions-dropdown={group.key}
                      >
                        <div className="grid gap-2">
                          <p className="rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-700">
                            Monthly account can be grouped into statement later. Balance due remains visible until
                            paid. Statement preview is not generated or saved.
                          </p>
                          <div className="grid gap-2">
                            {group.items.map((item) => (
                              <div
                                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                                data-monthly-statement-row={item.key}
                                key={item.key}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate font-bold text-slate-950">{item.invoiceNumber}</p>
                                    <p className="mt-0.5 text-slate-600">{item.paymentStatus}</p>
                                  </div>
                                  <p className="font-bold text-slate-950">{item.balanceDue}</p>
                                </div>
                                <p className="mt-1 text-slate-500">Follow-up: {item.followUpDate}</p>
                              </div>
                            ))}
                          </div>
                          <button
                            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                            data-statement-preview-action={group.key}
                            onClick={() => handleMockStatementPreview(group)}
                            type="button"
                          >
                            Preview Mock Statement
                          </button>
                          <p
                            aria-live="polite"
                            className="rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-600"
                            data-statement-preview-feedback={group.key}
                          >
                            {group.feedback ?? "Mock helper: preview only; nothing is generated, saved, or sent."}
                          </p>
                        </div>
                      </div>
                    </details>
                  </div>
                </article>
              ))
            ) : (
              <div className="p-5 text-sm text-slate-600" data-monthly-statement-empty="true">
                No mock monthly account statement items remain after local actions. Refreshing the page restores the
                mock data.
              </div>
            )}
          </div>
        </section>
        </div>

        <div
          className={customerInvoiceWorkspaceTab === "outstanding" ? "" : "hidden"}
          data-customer-invoice-workspace-panel="outstanding"
        >
        <section
          className="rounded-lg border border-slate-200 bg-white shadow-sm"
          data-outstanding-payments-review="true"
        >
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Outstanding Payments Review</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600" data-outstanding-review-boundary="true">
                  Mock/local only. Changes reset on refresh and are not saved. No payment API, bank API,
                  notification, or Supabase write is used.
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-600">
                {visibleOutstandingPaymentReviewItems.length} mock items need account follow-up.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {outstandingReviewSummaryCards.map((card) => (
                <div
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3"
                  data-outstanding-review-summary-card={card.label}
                  key={card.label}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{card.label}</p>
                  <p className="mt-2 text-xl font-bold text-slate-950">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-600">{card.helper}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[1.3fr_1fr_1fr_0.7fr] xl:items-end">
              <label className="text-sm font-semibold text-slate-700">
                Search customer / booker / reference
                <input
                  className="mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950"
                  data-outstanding-review-search="true"
                  onChange={(event) => updateOutstandingReviewSearch(event.target.value)}
                  placeholder="Search company, contact, invoice, route"
                  type="search"
                  value={outstandingReviewSearchTerm}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Sort
                <select
                  className="mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950"
                  data-outstanding-review-sort="true"
                  onChange={(event) => updateOutstandingReviewSort(event.target.value as OutstandingReviewSort)}
                  value={outstandingReviewSort}
                >
                  {outstandingReviewSortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Page size
                <select
                  className="mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950"
                  data-outstanding-review-page-size="true"
                  onChange={(event) => updateOutstandingReviewPageSize(Number(event.target.value))}
                  value={outstandingReviewPageSize}
                >
                  {outstandingReviewPageSizeOptions.map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize} customers
                    </option>
                  ))}
                </select>
              </label>

              <p
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                data-outstanding-review-showing="true"
              >
                Showing {outstandingReviewShowingStart}-{outstandingReviewShowingEnd} of{" "}
                {filteredOutstandingReviewItems.length} customers
              </p>
            </div>

            <div
              className="mt-4 flex flex-wrap gap-2"
              data-outstanding-review-filter-controls="true"
            >
              {outstandingReviewFilterOptions.map((option) => (
                <button
                  className={`min-h-10 rounded-md border px-3 py-2 text-sm font-bold transition ${
                    outstandingReviewFilter === option.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:border-slate-500 hover:bg-slate-50"
                  }`}
                  data-outstanding-review-filter={option.value}
                  key={option.value}
                  onClick={() => updateOutstandingReviewFilter(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                aria-live="polite"
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:flex-1"
                data-payment-section-feedback="true"
              >
                {mockPaymentSectionFeedback}
              </p>
              <div className="flex gap-2">
                <button
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  data-outstanding-review-previous="true"
                  disabled={currentOutstandingReviewPage <= 1}
                  onClick={() => setOutstandingReviewPage((currentPage) => Math.max(1, currentPage - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  data-outstanding-review-next="true"
                  disabled={currentOutstandingReviewPage >= outstandingReviewTotalPages}
                  onClick={() =>
                    setOutstandingReviewPage((currentPage) =>
                      Math.min(outstandingReviewTotalPages, currentPage + 1),
                    )
                  }
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {visibleOutstandingPaymentReviewItems.length === 0 ? (
              <div className="p-5 text-sm text-slate-600" data-outstanding-payments-empty="true">
                No mock outstanding payment items remain after local actions. Refreshing the page restores the mock data.
              </div>
            ) : paginatedOutstandingReviewItems.length > 0 ? (
              paginatedOutstandingReviewItems.map((item) => {
                return (
                  <article
                    className="px-3 py-2 transition hover:bg-slate-50 sm:px-4"
                    data-outstanding-payment-row={item.key}
                    key={item.key}
                  >
                    <div className="grid gap-2 lg:grid-cols-[minmax(12rem,1.35fr)_minmax(7rem,0.65fr)_minmax(6rem,0.55fr)_minmax(10rem,0.85fr)_minmax(9rem,auto)] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <h3 className="truncate text-sm font-bold text-slate-950 sm:text-base">
                            {item.customerName}
                          </h3>
                          {item.isMonthlyAccount ? (
                            <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                              Monthly
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{item.invoiceNumber}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Outstanding
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <p className="text-sm font-bold text-slate-950">{item.balanceDue}</p>
                          <p className="text-xs text-slate-500">{item.paymentStatus}</p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Aging</p>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <p className="text-sm font-bold text-slate-900">{item.agingBucket}</p>
                          <p className="text-xs text-slate-500">{item.dueStatusLabel}</p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Due</p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-800">{item.dueOrFollowUpDate}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          Next: {getOutstandingNextActionLabel(item)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 lg:justify-end">
                        <Link
                          aria-label={`Open Customer Folder for ${item.customerName}`}
                          className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700"
                          data-outstanding-open-customer-folder={item.key}
                          href={`/customers/${item.customerId}`}
                        >
                          Open
                        </Link>
                        <details className="group relative flex-1 lg:flex-none">
                          <summary
                            className="inline-flex min-h-9 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
                            data-outstanding-review-detail-toggle={item.key}
                          >
                            <span>Actions</span>
                            <span aria-hidden="true" className="text-slate-500 group-open:hidden">
                              v
                            </span>
                            <span aria-hidden="true" className="hidden text-slate-500 group-open:inline">
                              ^
                            </span>
                          </summary>
                          <div
                            className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white p-2 shadow-lg sm:w-96"
                            data-outstanding-review-actions-dropdown={item.key}
                            data-outstanding-review-expanded={item.key}
                          >
                            <div className="grid gap-2">
                              <div className="min-w-0">
                                <p className="text-xs leading-5 text-slate-700">{item.reason}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Last follow-up: {item.lastFollowUpDate}
                                </p>
                                <div
                                  className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs leading-5 text-sky-950"
                                  data-outstanding-review-detail={item.key}
                                >
                                  <p className="font-bold">Mock/local detail only for {item.invoiceNumber}</p>
                                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                    <li>Customer folder reminder: open {item.customerName} before any real collection work.</li>
                                    <li>{item.outstandingBookingsCount} mock outstanding booking rows are visible for this account.</li>
                                    <li>Follow-up note placeholder only. No note, payment record, audit record, or customer record is created.</li>
                                    <li>No invoice, statement, PDF, invoice number, sending, Supabase call, payment API, bank API, notification, or calendar action.</li>
                                  </ul>
                                </div>
                              </div>

                              <div className="grid content-start gap-2 sm:grid-cols-2">
                                <button
                                  className="min-h-9 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                                  data-payment-action="invoice-sent"
                                  onClick={() => handleMockPaymentAction(item, "invoice-sent")}
                                  type="button"
                                >
                                  Invoice sent
                                </button>
                                <button
                                  className="min-h-9 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                                  data-payment-action="partial-payment"
                                  onClick={() => handleMockPaymentAction(item, "partial-payment")}
                                  type="button"
                                >
                                  Partial payment
                                </button>
                                <button
                                  className="min-h-9 rounded-md border border-emerald-700 bg-emerald-700 px-2 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-600"
                                  data-payment-action="paid"
                                  onClick={() => handleMockPaymentAction(item, "paid")}
                                  type="button"
                                >
                                  Paid
                                </button>
                                <button
                                  className="min-h-9 rounded-md border border-amber-700 bg-amber-50 px-2 py-1.5 text-xs font-bold text-amber-950 transition hover:bg-amber-100"
                                  data-payment-action="waived"
                                  onClick={() => handleMockPaymentAction(item, "waived")}
                                  type="button"
                                >
                                  Waive
                                </button>
                              </div>

                              <p
                                aria-live="polite"
                                className="rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-600"
                                data-payment-action-feedback={item.key}
                              >
                                {item.feedback ?? "Mock helper: this row updates local page state only."}
                              </p>
                            </div>
                          </div>
                        </details>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="p-5 text-sm leading-6 text-slate-600" data-outstanding-payments-no-results="true">
                No mock customers match this search or filter. No data was removed and no API was called.
              </div>
            )}
          </div>
        </section>
        </div>

        <div
          className={customerInvoiceWorkspaceTab === "follow-up" ? "" : "hidden"}
          data-customer-invoice-workspace-panel="follow-up"
        >
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm" data-collection-follow-up-queue="true">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Collection Follow-up Queue</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600" data-collection-follow-up-boundary="true">
                  Mock/local only. Follow-up changes reset on refresh and are not saved.
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-600" data-collection-follow-up-no-send-boundary="true">
                  No notification, WhatsApp message, email, payment record, bank record, or Supabase row is created.
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-600">
                Showing {collectionFollowUpShowingStart}-{collectionFollowUpShowingEnd} of{" "}
                {visibleCollectionFollowUpItems.length} follow-ups
              </p>
            </div>
            <p
              aria-live="polite"
              className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              data-follow-up-section-feedback="true"
            >
              {mockFollowUpSectionFeedback}
            </p>
            <div
              className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              data-collection-follow-up-pagination="true"
            >
              <label className="text-sm font-semibold text-slate-700 sm:max-w-48">
                Page size
                <select
                  className="mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950"
                  data-collection-follow-up-page-size="true"
                  onChange={(event) => {
                    setCollectionFollowUpPageSize(Number(event.target.value));
                    setCollectionFollowUpPage(1);
                  }}
                  value={collectionFollowUpPageSize}
                >
                  {customerQueuePageSizeOptions.map((pageSize) => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize} rows
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  data-collection-follow-up-previous="true"
                  disabled={currentCollectionFollowUpPage <= 1}
                  onClick={() => setCollectionFollowUpPage((currentPage) => Math.max(1, currentPage - 1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  data-collection-follow-up-next="true"
                  disabled={currentCollectionFollowUpPage >= collectionFollowUpTotalPages}
                  onClick={() =>
                    setCollectionFollowUpPage((currentPage) =>
                      Math.min(collectionFollowUpTotalPages, currentPage + 1),
                    )
                  }
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {visibleCollectionFollowUpItems.length > 0 ? (
              paginatedCollectionFollowUpItems.map((item) => (
                <article
                  className="grid gap-2 px-3 py-2 transition hover:bg-slate-50 sm:px-4 lg:grid-cols-[minmax(12rem,1.25fr)_minmax(8rem,0.75fr)_minmax(7rem,0.6fr)_minmax(10rem,0.8fr)_minmax(9rem,auto)] lg:items-center"
                  data-collection-follow-up-row={item.key}
                  key={item.key}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <h3 className="truncate text-sm font-bold text-slate-950 sm:text-base">
                        {item.customerName}
                      </h3>
                    {item.isMonthlyAccount ? (
                        <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                          Monthly
                        </span>
                    ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{item.invoiceNumber}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Status</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">{item.paymentStatus}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Balance</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-950">{item.balanceDue}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Follow-up</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-800">{item.followUpDate}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{getCollectionFollowUpReason(item)}</p>
                  </div>
                  <div className="flex items-center gap-2 lg:justify-end">
                    <Link
                      aria-label={`Open Customer Folder for ${item.customerName}`}
                      className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-700"
                      data-follow-up-open-customer-folder={item.key}
                      href={`/customers/${item.customerId}`}
                    >
                      Open
                    </Link>
                    <details className="group relative flex-1 lg:flex-none">
                      <summary
                        className="inline-flex min-h-9 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
                        data-collection-follow-up-actions-toggle={item.key}
                      >
                        <span>Actions</span>
                        <span aria-hidden="true" className="text-slate-500 group-open:hidden">
                          v
                        </span>
                        <span aria-hidden="true" className="hidden text-slate-500 group-open:inline">
                          ^
                        </span>
                      </summary>
                      <div
                        className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 bg-white p-2 shadow-lg sm:w-96"
                        data-collection-follow-up-actions-dropdown={item.key}
                      >
                        <div className="grid gap-2">
                          <div className="rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-700">
                            <p>{getCollectionFollowUpReason(item)}</p>
                            {item.isMonthlyAccount ? (
                              <p className="mt-1 font-semibold text-slate-600">
                                Monthly account can be grouped into statement later.
                              </p>
                            ) : null}
                            {item.followUpNote ? (
                              <p className="mt-1 text-slate-600">{item.followUpNote}</p>
                            ) : null}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <button
                              className="min-h-9 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                              data-follow-up-action="schedule"
                              onClick={() => handleMockFollowUpAction(item, "schedule")}
                              type="button"
                            >
                              Schedule Follow-up
                            </button>
                            <button
                              className="min-h-9 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                              data-follow-up-action="done"
                              onClick={() => handleMockFollowUpAction(item, "done")}
                              type="button"
                            >
                              Mark Follow-up Done
                            </button>
                            <button
                              className="min-h-9 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                              data-follow-up-action="note"
                              onClick={() => handleMockFollowUpAction(item, "note")}
                              type="button"
                            >
                              Add Mock Note
                            </button>
                          </div>
                          <p
                            aria-live="polite"
                            className="rounded-md bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-600"
                            data-follow-up-action-feedback={item.key}
                          >
                            {item.followUpFeedback ?? "Mock helper: this follow-up updates local page state only."}
                          </p>
                        </div>
                      </div>
                    </details>
                  </div>
                </article>
              ))
            ) : (
              <div className="p-5 text-sm text-slate-600" data-collection-follow-up-empty="true">
                No mock collection follow-up items remain after local actions. Refreshing the page restores the mock data.
              </div>
            )}
          </div>
        </section>
        </div>

        <details className="rounded-lg border border-slate-200 bg-white shadow-sm" data-customer-advanced-booking-drawer="true">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
            Advanced booking and draft invoice tools
            <span className="text-xs font-semibold text-slate-500">Collapsed</span>
          </summary>
          <section
            className="border-t border-slate-200"
            data-regular-customer-booking-form-section="true"
          >
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Internal dispatcher/admin only
                </p>
                <h2 className="mt-2 text-lg font-bold text-slate-950">
                  Regular Customer Booking Form Foundation
                </h2>
                <p
                  className="mt-1 max-w-4xl text-sm leading-6 text-slate-600"
                  data-regular-customer-booking-boundary="true"
                >
                  Mock/local only. Not customer-facing. No Supabase save, invoice number, invoice or statement
                  generation, notification, calendar sync, payment API, or bank API is used.
                </p>
              </div>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">
                Bank transfer remains manual-record only.
              </div>
            </div>
          </div>

          <form
            className="p-4 sm:p-5"
            data-regular-customer-booking-form="true"
            noValidate
            onSubmit={handleRegularCustomerBookingSubmit}
          >
            <p
              className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950"
              data-regular-customer-required-note="true"
            >
              Required fields are marked with * and checked locally before a mock preview can be created.
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Customer / account *
                <select
                  aria-invalid={isRegularCustomerBookingFieldMissing("customerId")}
                  className={regularCustomerBookingFieldClass("customerId")}
                  data-regular-booking-field="customerId"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("customerId", event.target.value)}
                  value={regularCustomerBookingForm.customerId}
                >
                  <option value="">Select customer/account</option>
                  {mockCustomers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.companyName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Booker / contact person *
                <input
                  aria-invalid={isRegularCustomerBookingFieldMissing("booker")}
                  className={regularCustomerBookingFieldClass("booker")}
                  data-regular-booking-field="booker"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("booker", event.target.value)}
                  placeholder="Account booker or contact"
                  type="text"
                  value={regularCustomerBookingForm.booker}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Passenger name *
                <input
                  aria-invalid={isRegularCustomerBookingFieldMissing("passengerName")}
                  className={regularCustomerBookingFieldClass("passengerName")}
                  data-regular-booking-field="passengerName"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("passengerName", event.target.value)}
                  placeholder="Passenger or guest name"
                  type="text"
                  value={regularCustomerBookingForm.passengerName}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Pickup date *
                <input
                  aria-invalid={isRegularCustomerBookingFieldMissing("pickupDate")}
                  className={regularCustomerBookingFieldClass("pickupDate")}
                  data-regular-booking-field="pickupDate"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("pickupDate", event.target.value)}
                  type="date"
                  value={regularCustomerBookingForm.pickupDate}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Pickup time *
                <input
                  aria-invalid={isRegularCustomerBookingFieldMissing("pickupTime")}
                  className={regularCustomerBookingFieldClass("pickupTime")}
                  data-regular-booking-field="pickupTime"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("pickupTime", event.target.value)}
                  placeholder="1530hrs"
                  type="text"
                  value={regularCustomerBookingForm.pickupTime}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Flight number if any
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-regular-booking-field="flightNumber"
                  onChange={(event) => updateRegularCustomerBookingField("flightNumber", event.target.value)}
                  placeholder="SQ333 or leave blank"
                  type="text"
                  value={regularCustomerBookingForm.flightNumber}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-1">
                Pickup location *
                <input
                  aria-invalid={isRegularCustomerBookingFieldMissing("pickupLocation")}
                  className={regularCustomerBookingFieldClass("pickupLocation")}
                  data-regular-booking-field="pickupLocation"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("pickupLocation", event.target.value)}
                  placeholder="Search pickup address — Google Map Suggest mock only"
                  type="text"
                  value={regularCustomerBookingForm.pickupLocation}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-1">
                Drop-off location *
                <input
                  aria-invalid={isRegularCustomerBookingFieldMissing("dropoffLocation")}
                  className={regularCustomerBookingFieldClass("dropoffLocation")}
                  data-regular-booking-field="dropoffLocation"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("dropoffLocation", event.target.value)}
                  placeholder="Search drop-off address — Google Map Suggest mock only"
                  type="text"
                  value={regularCustomerBookingForm.dropoffLocation}
                />
              </label>

              <p
                className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold leading-5 text-sky-950 md:col-span-2 xl:col-span-1"
                data-regular-customer-map-suggest-hint="true"
              >
                Google Map Suggest — Mock/local only beside address fields. No Google API call, no map billing/cost,
                and no location saved.
              </p>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Type of Service *
                <select
                  aria-invalid={isRegularCustomerBookingFieldMissing("routeType")}
                  className={regularCustomerBookingFieldClass("routeType")}
                  data-regular-booking-field="routeType"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("routeType", event.target.value)}
                  value={regularCustomerBookingForm.routeType}
                >
                  {regularCustomerRouteTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Actual start
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-regular-booking-field="actualStartTime"
                  onChange={(event) => updateRegularCustomerBookingField("actualStartTime", event.target.value)}
                  type="time"
                  value={regularCustomerBookingForm.actualStartTime}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Actual end
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-regular-booking-field="actualEndTime"
                  onChange={(event) => updateRegularCustomerBookingField("actualEndTime", event.target.value)}
                  type="time"
                  value={regularCustomerBookingForm.actualEndTime}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Hourly rate
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-regular-booking-field="ratePerHour"
                  inputMode="decimal"
                  onChange={(event) => updateRegularCustomerBookingField("ratePerHour", event.target.value)}
                  placeholder="65"
                  value={regularCustomerBookingForm.ratePerHour}
                />
              </label>

              <p
                className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-5 text-emerald-950 md:col-span-2 xl:col-span-3"
                data-regular-booking-hourly-calculation="true"
              >
                {regularCustomerHourlyInvoiceReview
                  ? `Auto invoice amount: ${regularCustomerHourlyInvoiceReview.amountLabel}. ${regularCustomerHourlyInvoiceReview.billingBreakdown}`
                  : /hourly|disposal/i.test(regularCustomerBookingForm.routeType)
                    ? `Enter actual start and actual end to auto-calculate hourly billing at $65/hr default. ${hourlyBillingGraceRuleText}`
                    : `Hourly auto-calculation applies when Type of Service is Hourly / Disposal. ${hourlyBillingGraceRuleText}`}
              </p>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Vehicle type *
                <select
                  aria-invalid={isRegularCustomerBookingFieldMissing("vehicleType")}
                  className={regularCustomerBookingFieldClass("vehicleType")}
                  data-regular-booking-field="vehicleType"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("vehicleType", event.target.value)}
                  value={regularCustomerBookingForm.vehicleType}
                >
                  {regularCustomerVehicleTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Number of passengers
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-regular-booking-field="passengerCount"
                  min="1"
                  onChange={(event) => updateRegularCustomerBookingField("passengerCount", event.target.value)}
                  type="number"
                  value={regularCustomerBookingForm.passengerCount}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Luggage
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-regular-booking-field="luggage"
                  onChange={(event) => updateRegularCustomerBookingField("luggage", event.target.value)}
                  placeholder="2 large bags, carry-on, etc."
                  type="text"
                  value={regularCustomerBookingForm.luggage}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Extra stops
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-regular-booking-field="extraStops"
                  onChange={(event) => updateRegularCustomerBookingField("extraStops", event.target.value)}
                  placeholder="None, or list stop details"
                  type="text"
                  value={regularCustomerBookingForm.extraStops}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Customer reference / PO number if any
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-regular-booking-field="customerReference"
                  onChange={(event) => updateRegularCustomerBookingField("customerReference", event.target.value)}
                  placeholder="PO, cost code, guest reference"
                  type="text"
                  value={regularCustomerBookingForm.customerReference}
                />
              </label>

              <div
                className="rounded-md border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-950 md:col-span-2 xl:col-span-3"
                data-regular-customer-mini-parser-helper="true"
              >
                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-800">
                      Free-text helper placeholder
                    </p>
                    <h3 className="mt-1 font-bold" data-regular-customer-mini-parser-heading="true">
                      Mini Parser Helper — Mock Only
                    </h3>
                    <p className="mt-1 font-semibold" data-regular-customer-mini-parser-boundary="true">
                      Future AI/parser helper may extract booking details. Not active yet. No OpenAI/ChatGPT API call,
                      no Supabase save, and no booking created.
                    </p>
                  </div>
                  <button
                    className="min-h-11 rounded-md border border-teal-900 bg-teal-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800"
                    data-regular-customer-mini-parser-button="true"
                    onClick={handleRegularCustomerParserHelper}
                    type="button"
                  >
                    Preview Mock Parser Help
                  </button>
                </div>
                <label className="mt-3 flex flex-col gap-1 text-sm font-semibold text-teal-950">
                  Paste booking details for future parser review
                  <textarea
                    className="min-h-24 rounded-md border border-teal-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-teal-700"
                    data-regular-customer-mini-parser-text="true"
                    onChange={(event) => setRegularCustomerParserHelperText(event.target.value)}
                    placeholder="Future helper only. Paste booking text here for local UI preview."
                    value={regularCustomerParserHelperText}
                  />
                </label>
                <p
                  aria-live="polite"
                  className="mt-3 rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-950"
                  data-regular-customer-mini-parser-feedback="true"
                >
                  {regularCustomerParserHelperFeedback}
                </p>
              </div>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-3">
                Internal note
                <textarea
                  className="min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-regular-booking-field="internalNote"
                  onChange={(event) => updateRegularCustomerBookingField("internalNote", event.target.value)}
                  placeholder="Internal dispatcher/admin note only"
                  value={regularCustomerBookingForm.internalNote}
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                <h3 className="font-bold text-slate-950">Mock/local safety guardrails</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Submit creates a local preview only and does not save a booking.</li>
                  <li>No invoice number, invoice, statement, notification, calendar sync, payment API, or bank API.</li>
                  <li>Existing parser booking save and customer match behavior stay separate.</li>
                </ul>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
                <h3 className="font-bold text-slate-950">Link to customer folder</h3>
                {selectedRegularCustomer ? (
                  <Link
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-4 text-center text-sm font-bold text-white transition hover:bg-slate-700 sm:w-auto"
                    data-regular-customer-folder-link="true"
                    href={`/customers/${selectedRegularCustomer.id}`}
                  >
                    Open {selectedRegularCustomer.companyName} folder (mock/local)
                  </Link>
                ) : (
                  <p className="mt-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-slate-600">
                    Select a customer/account to show the mock folder link.
                  </p>
                )}
              </div>
            </div>

            <div
              className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4"
              data-regular-customer-mock-save-section="true"
            >
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
                    Future real save placeholder
                  </p>
                  <h3 className="mt-2 text-base font-bold text-amber-950">Save/link workflow is not active</h3>
                  <p
                    className="mt-1 text-sm font-semibold leading-6 text-amber-950"
                    data-regular-customer-mock-save-boundary="true"
                  >
                    Mock/local only. No booking saved, no customer folder linked, no Supabase call, no invoice
                    number, no payment/bank action, and no notification/calendar action.
                  </p>
                </div>
                <div>
                  <button
                    className="min-h-11 w-full rounded-md border border-amber-900 bg-amber-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-800 sm:w-auto"
                    data-regular-customer-mock-save="true"
                    onClick={handleRegularCustomerMockSave}
                    type="button"
                  >
                    Save Regular Booking — Mock Only
                  </button>
                  <p
                    aria-live="polite"
                    className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold leading-6 ${regularCustomerBookingFeedbackClass(
                      regularCustomerMockSaveFeedbackTone,
                    )}`}
                    data-regular-customer-mock-save-feedback="true"
                    data-regular-customer-mock-save-feedback-tone={regularCustomerMockSaveFeedbackTone}
                  >
                    {regularCustomerMockSaveFeedback}
                  </p>
                  {regularCustomerMockSaveReview ? (
                    <article
                      className="mt-4 rounded-md border border-amber-300 bg-white p-4 text-sm leading-6 text-slate-700"
                      data-regular-customer-mock-save-review="true"
                    >
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
                        Mock confirmation step
                      </p>
                      <h4
                        className="mt-2 text-sm font-bold text-slate-950"
                        data-regular-customer-mock-save-review-heading="true"
                      >
                        Mock Save Confirmation — Not Active
                      </h4>
                      <p
                        className="mt-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 font-semibold text-amber-950"
                        data-regular-customer-mock-save-review-boundary="true"
                      >
                        Mock/local only. No booking saved, no customer folder linked, no Supabase call, no invoice
                        number, no audit record, no payment/bank action, and no notification/calendar action.
                      </p>

                      <dl
                        className="mt-3 grid gap-2 sm:grid-cols-2"
                        data-regular-customer-mock-save-review-summary-list="true"
                      >
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <dt className="text-xs font-bold uppercase text-slate-500">Customer/account</dt>
                          <dd
                            className="mt-1 font-semibold text-slate-950"
                            data-regular-customer-mock-save-review-summary="customerName"
                          >
                            {regularCustomerMockSaveReview.customerName}
                          </dd>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <dt className="text-xs font-bold uppercase text-slate-500">Passenger name</dt>
                          <dd
                            className="mt-1 font-semibold text-slate-950"
                            data-regular-customer-mock-save-review-summary="passengerName"
                          >
                            {regularCustomerMockSaveReview.passengerName}
                          </dd>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <dt className="text-xs font-bold uppercase text-slate-500">Pickup date/time</dt>
                          <dd
                            className="mt-1 font-semibold text-slate-950"
                            data-regular-customer-mock-save-review-summary="pickupDateTime"
                          >
                            {regularCustomerMockSaveReview.pickupDate} / {regularCustomerMockSaveReview.pickupTime}
                          </dd>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <dt className="text-xs font-bold uppercase text-slate-500">Vehicle type</dt>
                          <dd
                            className="mt-1 font-semibold text-slate-950"
                            data-regular-customer-mock-save-review-summary="vehicleType"
                          >
                            {getRegularCustomerVehicleTypeLabel(regularCustomerMockSaveReview.vehicleType)}
                          </dd>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <dt className="text-xs font-bold uppercase text-slate-500">Pickup location</dt>
                          <dd
                            className="mt-1 font-semibold text-slate-950"
                            data-regular-customer-mock-save-review-summary="pickupLocation"
                          >
                            {regularCustomerMockSaveReview.pickupLocation}
                          </dd>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <dt className="text-xs font-bold uppercase text-slate-500">Drop-off location</dt>
                          <dd
                            className="mt-1 font-semibold text-slate-950"
                            data-regular-customer-mock-save-review-summary="dropoffLocation"
                          >
                            {regularCustomerMockSaveReview.dropoffLocation}
                          </dd>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
                          <dt className="text-xs font-bold uppercase text-slate-500">Billing month</dt>
                          <dd
                            className="mt-1 font-semibold text-slate-950"
                            data-regular-customer-mock-save-review-summary="billingMonth"
                          >
                            {regularCustomerMockSaveReview.billingMonth}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button
                          className="min-h-11 rounded-md border border-amber-900 bg-amber-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-800"
                          data-regular-customer-mock-save-review-confirm="true"
                          onClick={handleRegularCustomerMockSaveReviewConfirm}
                          type="button"
                        >
                          Confirm Mock Save Review
                        </button>
                        <button
                          className="min-h-11 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                          data-regular-customer-mock-save-review-dismiss="true"
                          onClick={handleRegularCustomerMockSaveReviewDismiss}
                          type="button"
                        >
                          Dismiss Mock Review
                        </button>
                      </div>

                      <p
                        aria-live="polite"
                        className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold leading-6 ${regularCustomerBookingFeedbackClass(
                          regularCustomerMockSaveReviewFeedbackTone,
                        )}`}
                        data-regular-customer-mock-save-review-feedback="true"
                        data-regular-customer-mock-save-review-feedback-tone={
                          regularCustomerMockSaveReviewFeedbackTone
                        }
                      >
                        {regularCustomerMockSaveReviewFeedback}
                      </p>
                    </article>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div>
                <button
                  className="min-h-11 w-full rounded-md border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-700 sm:w-auto"
                  data-regular-customer-booking-submit="true"
                  type="submit"
                >
                  Create Mock Booking Preview
                </button>

                <div
                  aria-live="polite"
                  className={`mt-3 rounded-md border px-3 py-2 text-sm leading-6 ${regularCustomerBookingFeedbackClass(
                    regularCustomerBookingFeedbackTone,
                  )}`}
                  data-regular-customer-booking-feedback="true"
                  data-regular-customer-booking-feedback-tone={regularCustomerBookingFeedbackTone}
                >
                  <p>{regularCustomerBookingFeedback}</p>
                  {regularCustomerBookingMissingFields.length > 0 ? (
                    <ul
                      className="mt-2 list-disc space-y-1 pl-5"
                      data-regular-customer-booking-missing-fields="true"
                    >
                      {regularCustomerRequiredFields
                        .filter(({ field }) => regularCustomerBookingMissingFields.includes(field))
                        .map(({ field, label }) => (
                          <li data-regular-customer-booking-missing-field={field} key={field}>
                            {label}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              </div>

              <div>
                <button
                  className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50 sm:w-auto"
                  data-regular-customer-booking-clear="true"
                  onClick={handleRegularCustomerBookingClear}
                  type="button"
                >
                  Clear Local Form
                </button>

                <p
                  aria-live="polite"
                  className={`mt-3 rounded-md border px-3 py-2 text-sm leading-6 ${regularCustomerBookingFeedbackClass(
                    regularCustomerBookingClearFeedbackTone,
                  )}`}
                  data-regular-customer-booking-clear-feedback="true"
                  data-regular-customer-booking-clear-feedback-tone={regularCustomerBookingClearFeedbackTone}
                >
                  {regularCustomerBookingClearFeedback}
                </p>
              </div>
            </div>
          </form>

          <div className="border-t border-slate-200 p-4 sm:p-5">
            {regularCustomerBookingPreview ? (
              <article
                className="min-w-0 break-words rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"
                data-regular-customer-booking-preview="true"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="font-bold">Mock/local preview only</h3>
                    <p className="mt-1">
                      Created locally at {regularCustomerBookingPreview.createdAtLabel} for{" "}
                      {regularCustomerBookingPreview.customerName}.
                    </p>
                  </div>
                  <p className="font-bold">Invoice number: Not created</p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">Booker</p>
                    <p className="mt-1">{regularCustomerBookingPreview.booker || "Not entered"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">Passenger</p>
                    <p className="mt-1">{regularCustomerBookingPreview.passengerName || "Not entered"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">Pickup</p>
                    <p className="mt-1">
                      {regularCustomerBookingPreview.pickupDate || "Date TBC"}{" "}
                      {regularCustomerBookingPreview.pickupTime || "Time TBC"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">Billing</p>
                    <p className="mt-1">
                      {regularCustomerBookingPreview.billingMonth} / {regularCustomerBookingPreview.billingStatus}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-md bg-white/70 p-3">
                  <p>
                    Route: {regularCustomerBookingPreview.pickupLocation || "Pickup TBC"} to{" "}
                    {regularCustomerBookingPreview.dropoffLocation || "Drop-off TBC"}
                  </p>
                  <p>
                    Type/vehicle: {regularCustomerBookingPreview.routeType} /{" "}
                    {getRegularCustomerVehicleTypeLabel(regularCustomerBookingPreview.vehicleType)}
                  </p>
                  <p>
                    Pax/luggage/stops: {regularCustomerBookingPreview.passengerCount || "1"} pax /{" "}
                    {regularCustomerBookingPreview.luggage || "Luggage not entered"} /{" "}
                    {regularCustomerBookingPreview.extraStops || "No extra stops entered"}
                  </p>
                  <p>
                    Customer reference: {regularCustomerBookingPreview.customerReference || "No reference entered"}
                  </p>
                  <p>Payment method: {regularCustomerBookingPreview.paymentMethod}</p>
                  {getRegularCustomerHourlyInvoiceReview(regularCustomerBookingPreview) ? (
                    <p
                      className="mt-2 font-bold"
                      data-regular-customer-booking-hourly-preview="true"
                    >
                      Hourly invoice auto-calculation:{" "}
                      {getRegularCustomerHourlyInvoiceReview(regularCustomerBookingPreview)?.billingBreakdown}
                    </p>
                  ) : null}
                </div>

                <p
                  className="mt-4 rounded-md bg-white/70 p-3 font-semibold"
                  data-regular-customer-booking-no-save-boundary="true"
                >
                  Booking save: Not saved. Customer link write: Not written. Invoice/statement: Not generated.
                  Notification/calendar/payment/bank/Supabase calls: None.
                </p>

                {regularCustomerBookingPreview.customerFolderHref ? (
                  <Link
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-emerald-900 bg-emerald-900 px-4 text-sm font-bold text-white transition hover:bg-emerald-800"
                    data-regular-customer-preview-folder-link="true"
                    href={regularCustomerBookingPreview.customerFolderHref}
                  >
                    Open customer folder mock link
                  </Link>
                ) : null}
              </article>
            ) : (
              <div
                className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600"
                data-regular-customer-booking-empty-preview="true"
              >
                No mock regular customer booking preview yet.
              </div>
            )}
          </div>

          <div
            className="border-t border-slate-200 p-4 sm:p-5"
            data-regular-customer-booking-list-preview="true"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  Internal dispatcher/admin only
                </p>
                <h3 className="mt-2 text-lg font-bold text-slate-950">
                  Regular Customer Monthly Billing List Preview
                </h3>
                <p
                  className="mt-1 max-w-4xl text-sm leading-6 text-slate-600"
                  data-regular-customer-booking-list-boundary="true"
                >
                  Mock/local only. Rows reset on refresh and are not saved. No Supabase save, customer/payment
                  record, invoice number, invoice, statement, notification, calendar sync, payment API, or bank API is
                  used.
                </p>
              </div>
              <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {regularCustomerBookingListItems.length} local mock booking row
                {regularCustomerBookingListItems.length === 1 ? "" : "s"}.
              </p>
            </div>

            <div
              className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4"
              data-regular-customer-booking-list-filters="true"
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                  Customer / account filter (mock/local)
                  <select
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                    data-regular-customer-booking-list-filter="customerId"
                    onChange={(event) =>
                      updateRegularCustomerBookingListFilter("customerId", event.target.value)
                    }
                    value={regularCustomerBookingListFilters.customerId}
                  >
                    <option value="">All local mock customers</option>
                    {mockCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.companyName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                  Billing month filter (mock/local)
                  <input
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                    data-regular-customer-booking-list-filter="billingMonth"
                    onChange={(event) =>
                      updateRegularCustomerBookingListFilter("billingMonth", event.target.value)
                    }
                    placeholder="2026-05"
                    type="text"
                    value={regularCustomerBookingListFilters.billingMonth}
                  />
                </label>

                <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                  Billing status filter (mock/local)
                  <select
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                    data-regular-customer-booking-list-filter="billingStatus"
                    onChange={(event) =>
                      updateRegularCustomerBookingListFilter("billingStatus", event.target.value)
                    }
                    value={regularCustomerBookingListFilters.billingStatus}
                  >
                    <option value="">All local mock statuses</option>
                    {regularCustomerBillingStatusFilterOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="min-h-11 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-white"
                  data-regular-customer-booking-list-clear-filters="true"
                  onClick={clearRegularCustomerBookingListFilters}
                  type="button"
                >
                  Clear Local Filters
                </button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
                <p
                  aria-live="polite"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold leading-6 text-slate-700"
                  data-regular-customer-booking-list-filter-feedback="true"
                >
                  {regularCustomerBookingListFilterFeedback}
                </p>
                <p
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold leading-6 text-slate-950"
                  data-regular-customer-booking-list-filter-count="true"
                >
                  Showing {filteredRegularCustomerBookingListItems.length} of{" "}
                  {regularCustomerBookingListItems.length} local mock row
                  {regularCustomerBookingListItems.length === 1 ? "" : "s"}.
                </p>
              </div>

              <div
                className="mt-3 rounded-md border border-slate-200 bg-white p-3"
                data-regular-customer-billing-quick-filter-section="true"
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,18rem)_1fr] md:items-start">
                  <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-slate-700">
                    Billing Quick Filter — Mock Only
                    <select
                      className="min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-700"
                      data-regular-customer-billing-quick-filter="true"
                      onChange={(event) => updateRegularCustomerBillingQuickFilter(event.target.value)}
                      value={activeRegularCustomerBillingQuickFilter}
                    >
                      {regularCustomerBillingQuickFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p
                    aria-live="polite"
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-700"
                    data-regular-customer-billing-quick-filter-feedback="true"
                  >
                    Showing {filteredRegularCustomerBookingListItems.length} of{" "}
                    {regularCustomerBookingListItems.length} local mock row
                    {regularCustomerBookingListItems.length === 1 ? "" : "s"} with{" "}
                    {activeRegularCustomerBillingQuickFilterLabel}. Filter changes only visible mock rows and
                    counts; no row data is added, removed, saved, or permanently changed. Mock quick filter
                    only — no invoice, payment request, or statement was generated, no storage or Supabase
                    write occurs, and no payment, PDF, notification, or network API is called.
                  </p>
                </div>
                {regularCustomerBillingQuickFilterHasNoVisibleRows ? (
                  <div
                    className="mt-3 flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950 sm:flex-row sm:items-center sm:justify-between"
                    data-regular-customer-billing-quick-filter-empty="true"
                  >
                    <p className="font-semibold">No mock billing rows match this quick filter.</p>
                    <button
                      className="min-h-11 w-full rounded-md border border-amber-900 bg-white px-4 py-2 text-sm font-bold text-amber-950 transition hover:border-amber-700 sm:w-auto"
                      data-regular-customer-billing-quick-filter-reset="true"
                      onClick={resetRegularCustomerBillingQuickFilter}
                      type="button"
                    >
                      Reset Billing Quick Filter — Mock Only
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700"
                data-regular-customer-billing-visible-summary="true"
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <p
                      className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500"
                      data-regular-customer-billing-visible-summary-title="true"
                    >
                      Mock visible billing summary
                    </p>
                    <p
                      className="mt-1 font-bold text-slate-950"
                      data-regular-customer-billing-visible-summary-count="true"
                    >
                      {regularCustomerMonthlyBillingSummary.visibleRowCount} visible of{" "}
                      {regularCustomerMonthlyBillingSummary.totalRowCount} local mock row
                      {regularCustomerMonthlyBillingSummary.totalRowCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Quick filter</p>
                    <p
                      className="mt-1 font-semibold text-slate-950"
                      data-regular-customer-billing-visible-summary-filter="true"
                    >
                      {activeRegularCustomerBillingQuickFilterLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                      Billing month
                    </p>
                    <p
                      className="mt-1 font-semibold text-slate-950"
                      data-regular-customer-billing-visible-summary-months="true"
                    >
                      {regularCustomerMonthlyBillingSummary.monthSummary}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Status count</p>
                    <p
                      className="mt-1 font-semibold text-slate-950"
                      data-regular-customer-billing-visible-summary-statuses="true"
                    >
                      {regularCustomerMonthlyBillingSummary.statusSummary}
                    </p>
                  </div>
                </div>
                <p
                  className="mt-2 text-xs font-semibold leading-5 text-slate-600"
                  data-regular-customer-billing-visible-summary-boundary="true"
                >
                  Mock/local only. This strip summarizes currently visible mock monthly billing rows after the local
                  quick filter. It does not create invoice numbers, generate invoices or PDFs, send payment requests,
                  call network APIs, write browser storage, write Supabase, permanently change row data, add rows,
                  remove rows, update payment status, or trigger messaging or notification behavior.
                </p>
              </div>
            </div>

            <div
              className="mt-4 rounded-md border border-slate-200 bg-white p-4"
              data-regular-customer-monthly-billing-summary="true"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Internal staff-only / read-only
                  </p>
                  <h4
                    className="mt-2 text-base font-bold text-slate-950"
                    data-regular-customer-monthly-billing-summary-title="true"
                  >
                    Monthly Billing Summary — Mock Only
                  </h4>
                </div>
                <p
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800"
                  data-regular-customer-monthly-billing-summary-count="true"
                >
                  {regularCustomerMonthlyBillingSummary.visibleRowCount} visible of{" "}
                  {regularCustomerMonthlyBillingSummary.totalRowCount} local mock row
                  {regularCustomerMonthlyBillingSummary.totalRowCount === 1 ? "" : "s"}
                </p>
              </div>

              <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Billing month
                  </dt>
                  <dd
                    className="mt-1 font-semibold text-slate-950"
                    data-regular-customer-monthly-billing-summary-months="true"
                  >
                    {regularCustomerMonthlyBillingSummary.monthSummary}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Status count</dt>
                  <dd
                    className="mt-1 font-semibold text-slate-950"
                    data-regular-customer-monthly-billing-summary-statuses="true"
                  >
                    {regularCustomerMonthlyBillingSummary.statusSummary}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Mock outstanding
                  </dt>
                  <dd
                    className="mt-1 font-semibold text-slate-950"
                    data-regular-customer-monthly-billing-summary-amount="true"
                  >
                    Not calculated from mock rows
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Scope</dt>
                  <dd className="mt-1 font-semibold text-slate-950">Current visible local rows only</dd>
                </div>
              </dl>

              <p
                className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-700"
                data-regular-customer-monthly-billing-summary-boundary="true"
              >
                Mock summary only — no invoice, payment request, or statement was generated. This read-only summary
                does not create invoice numbers, generate invoices or PDFs, send payment requests, call network APIs,
                write browser storage, write Supabase, change row data, add rows, remove rows, update payment status,
                or trigger notification behavior.
              </p>
            </div>

            <div
              className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-4"
              data-regular-customer-saved-visibility-section="true"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-800">
                    Internal staff-only / guarded read
                  </p>
                  <h4
                    className="mt-2 text-base font-bold text-sky-950"
                    data-regular-customer-saved-visibility-heading="true"
                  >
                    Saved Booking Visibility
                  </h4>
                  <p
                    className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-sky-950"
                    data-regular-customer-saved-visibility-boundary="true"
                  >
                    Admin-only read. Loads safe saved booking references for the selected customer/account only. No
                    booking write, invoice number, invoice, PDF, payment/bank action, payout, notification/calendar
                    action, parser/debug data, contact details, internal notes, or customer price is returned.
                  </p>
                </div>
                <button
                  className="rounded-md border border-sky-400 bg-white px-3 py-2 text-sm font-bold text-sky-950 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  data-regular-customer-saved-visibility-action="true"
                  disabled={!selectedRegularCustomer || regularCustomerSavedBookingReadState.status === "loading"}
                  onClick={loadRegularCustomerSavedBookings}
                  type="button"
                >
                  {regularCustomerSavedBookingReadState.status === "loading"
                    ? "Loading..."
                    : "Load Saved Bookings"}
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  [
                    "Customer/account",
                    selectedRegularCustomer
                      ? selectedRegularCustomer.companyName
                      : "Select a customer/account first.",
                  ],
                  [
                    "Returned",
                    `${regularCustomerSavedBookingReadState.summary?.returned_count ?? regularCustomerSavedBookingReadState.savedBookings.length} saved booking${(regularCustomerSavedBookingReadState.summary?.returned_count ?? regularCustomerSavedBookingReadState.savedBookings.length) === 1 ? "" : "s"}`,
                  ],
                  [
                    "Matched",
                    `${regularCustomerSavedBookingReadState.summary?.matched_count ?? 0} recent admin booking${(regularCustomerSavedBookingReadState.summary?.matched_count ?? 0) === 1 ? "" : "s"}`,
                  ],
                  [
                    "Source",
                    "Guarded admin saved booking read; read-only customer folder context.",
                  ],
                ].map(([label, description]) => (
                  <div
                    className="rounded-md border border-sky-200 bg-white p-3 text-sm leading-6 text-slate-700"
                    data-regular-customer-saved-visibility-note={label}
                    key={label}
                  >
                    <p className="font-bold text-slate-950">{label}</p>
                    <p className="mt-1">{description}</p>
                  </div>
                ))}
              </div>

              <p
                className={`mt-4 rounded-md border px-3 py-2 text-sm font-semibold leading-6 ${regularCustomerBookingFeedbackClass(
                  regularCustomerSavedBookingReadState.tone,
                )}`}
                data-regular-customer-saved-visibility-local-row-note="true"
              >
                {regularCustomerSavedBookingReadState.message}
              </p>

              {regularCustomerSavedBookingReadState.savedBookings.length === 0 ? (
                <p className="mt-3 rounded-md border border-sky-100 bg-white px-3 py-2 text-sm font-semibold leading-6 text-slate-700">
                  No saved booking references loaded yet.
                </p>
              ) : null}

              {regularCustomerSavedBookingReadState.status === "loaded" &&
              regularCustomerSavedBookingReadState.savedBookings.length > 0 ? (
                <div
                  className="mt-3 grid gap-2"
                  data-regular-customer-saved-visibility-list="true"
                >
                  {regularCustomerSavedBookingReadState.savedBookings.map((booking) => (
                    <div
                      className="rounded-md border border-sky-200 bg-white p-3 text-sm leading-6 text-slate-700"
                      data-regular-customer-saved-visibility-row={booking.booking_reference || ""}
                      key={booking.booking_reference || `${booking.customer_account}-${booking.pickup_at}`}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-bold text-slate-950">
                            {booking.booking_reference || "Saved booking reference unavailable"}
                          </p>
                          <p className="text-slate-600">
                            {[booking.booking_month, booking.service_type].filter(Boolean).join(" · ") ||
                              "Month/service unavailable"}
                          </p>
                        </div>
                        <p className="font-semibold text-sky-950">
                          {[booking.admin_status, booking.customer_status].filter(Boolean).join(" / ") ||
                            "Status unavailable"}
                        </p>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Pickup: {booking.pickup_at || "not available"} · Account:{" "}
                        {booking.customer_account || "not available"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div
              className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4"
              data-regular-customer-draft-invoice-section="true"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">
                    Internal staff-only / mock-local
                  </p>
                  <h4 className="mt-2 text-base font-bold text-emerald-950">
                    Draft Monthly Invoice Preview For Bank Transfer
                  </h4>
                  <p
                    className="mt-1 max-w-4xl text-sm leading-6 text-emerald-900"
                    data-regular-customer-draft-invoice-boundary="true"
                  >
                    Preview-only. Not customer-facing. No invoice number, real invoice, statement, PDF, sending,
                    Supabase save, payment API, bank API, notification, calendar sync, payment provider, or audit record is
                    created.
                  </p>
                </div>
                <p className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-bold text-emerald-950">
                  Uses currently visible local mock rows.
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[auto_1fr] lg:grid-cols-[auto_auto_1fr] lg:items-start">
                <button
                  className="min-h-11 rounded-md border border-emerald-900 bg-emerald-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
                  data-regular-customer-draft-invoice-create="true"
                  onClick={createRegularCustomerDraftInvoicePreview}
                  type="button"
                >
                  Create Mock Draft Invoice Preview
                </button>
                {regularCustomerDraftInvoiceClearControlVisible ? (
                  <button
                    className="min-h-11 rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-950 transition hover:border-emerald-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                    data-regular-customer-draft-invoice-clear="true"
                    disabled={!regularCustomerDraftInvoicePreview}
                    onClick={clearRegularCustomerDraftInvoicePreview}
                    type="button"
                  >
                    Clear Mock Draft Preview
                  </button>
                ) : null}
                <p
                  aria-live="polite"
                  className={`rounded-md border px-3 py-2 text-sm font-semibold leading-6 md:col-span-2 lg:col-span-1 ${regularCustomerBookingFeedbackClass(
                    regularCustomerDraftInvoiceFeedbackTone,
                  )}`}
                  data-regular-customer-draft-invoice-clear-feedback="true"
                  data-regular-customer-draft-invoice-feedback="true"
                  data-regular-customer-draft-invoice-feedback-tone={regularCustomerDraftInvoiceFeedbackTone}
                >
                  {regularCustomerDraftInvoiceFeedback}
                </p>
              </div>

              <div data-regular-customer-draft-invoice-preview-area="true">
                {regularCustomerDraftInvoicePreview ? (
                  <article
                    className="mt-4 rounded-md border border-emerald-300 bg-white p-4 text-sm leading-6 text-slate-700"
                    data-regular-customer-draft-invoice-preview="true"
                  >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                        Draft Preview / Not Issued
                      </p>
                      <h5 className="mt-2 text-base font-bold text-slate-950">
                        Mock/local draft invoice preview
                      </h5>
                      <p className="mt-1 text-slate-600">
                        Created locally at {regularCustomerDraftInvoicePreview.createdAtLabel}. This is an internal
                        staff-only review preview, not a customer invoice.
                      </p>
                    </div>
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
                      Not issued / no invoice number
                    </p>
                  </div>

                  {regularCustomerDraftInvoiceSnapshotStale ? (
                    <p
                      className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold leading-6 text-amber-950"
                      data-regular-customer-draft-invoice-snapshot-notice="true"
                    >
                      Filters or local rows changed after this preview was created. This remains a mock/local snapshot
                      of the rows captured earlier; create a new mock draft preview for the latest visible filtered rows.
                    </p>
                  ) : (
                    <p
                      className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold leading-6 text-emerald-950"
                      data-regular-customer-draft-invoice-snapshot-notice="true"
                    >
                      Snapshot is current to the visible local mock rows used when staff clicked create. Nothing is
                      saved, numbered, generated, or sent.
                    </p>
                  )}

                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Customer / account
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {regularCustomerDraftInvoicePreview.customerLabel}
                      </dd>
                      {regularCustomerDraftInvoicePreview.isMixedCustomer ? (
                        <dd className="mt-1 text-xs font-semibold text-amber-800">
                          Mixed mock preview only; not a real customer invoice.
                        </dd>
                      ) : null}
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Billing month</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {regularCustomerDraftInvoicePreview.billingMonthLabel}
                      </dd>
                      {regularCustomerDraftInvoicePreview.isMixedBillingMonth ? (
                        <dd className="mt-1 text-xs font-semibold text-amber-800">
                          Mixed mock preview only; not a final billing period.
                        </dd>
                      ) : null}
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Payment method
                      </dt>
                      <dd className="mt-1 font-semibold text-slate-950">monthly bank transfer manual</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Invoice status</dt>
                      <dd className="mt-1 font-semibold text-slate-950">Draft Preview / Not Issued</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Invoice number</dt>
                      <dd className="mt-1 font-semibold text-slate-950">Not created</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Included rows</dt>
                      <dd className="mt-1 font-semibold text-slate-950">
                        {regularCustomerDraftInvoicePreview.rows.length} local mock row
                        {regularCustomerDraftInvoicePreview.rows.length === 1 ? "" : "s"}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 grid gap-3">
                    {regularCustomerDraftInvoicePreview.rows.map((item) => (
                      <article
                        className="rounded-md border border-slate-200 bg-slate-50 p-4"
                        data-regular-customer-draft-invoice-row={item.id}
                        key={item.id}
                      >
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h6 className="font-bold text-slate-950">{item.passengerName}</h6>
                            <p className="mt-1 text-slate-600">
                              {item.pickupDate} {item.pickupTime} / {item.routeType} /{" "}
                              {getRegularCustomerVehicleTypeLabel(item.vehicleType)}
                            </p>
                          </div>
                          <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                            Amount not calculated in this mock preview
                          </p>
                        </div>
                        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Pickup</dt>
                            <dd className="mt-1 text-slate-950">{item.pickupLocation}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Drop-off</dt>
                            <dd className="mt-1 text-slate-950">{item.dropoffLocation}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                              Customer ref / PO
                            </dt>
                            <dd className="mt-1 text-slate-950">
                              {item.customerReference || "No reference entered"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                              Customer / month
                            </dt>
                            <dd className="mt-1 text-slate-950">
                              {item.customerName} / {item.billingMonth}
                            </dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>

                  <div
                    className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4"
                    data-regular-customer-draft-invoice-amounts="true"
                  >
                    <h6 className="font-bold text-slate-950">Amounts</h6>
                    <p className="mt-1 text-slate-700">Amount not calculated in this mock preview.</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                      No subtotal, GST, discount, or grand total is created because these local mock booking rows do
                      not contain approved price fields.
                    </p>
                  </div>

                  <div
                    className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4"
                    data-regular-customer-draft-invoice-no-save-boundary="true"
                  >
                    <h6 className="font-bold text-emerald-950">Locked preview notes</h6>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-emerald-950">
                      <li>Bank transfer is manual-record only.</li>
                      <li>No bank API, payment API, payment provider, or production payment behavior.</li>
                      <li>No invoice number, PDF, real invoice, statement, or sending.</li>
                      <li>No Supabase save, notification, WhatsApp, email, SMS, calendar sync, or audit record.</li>
                    </ul>
                  </div>
                  </article>
                ) : (
                  <div
                    className="mt-4 rounded-md border border-dashed border-emerald-300 bg-white/70 p-5 text-sm leading-6 text-emerald-900"
                    data-regular-customer-draft-invoice-empty="true"
                  >
                    <p className="font-bold text-emerald-950">No draft invoice preview selected yet.</p>
                    <p className="mt-1">
                      Select bookings from the mock monthly billing list, then create a draft invoice preview for
                      staff review.
                    </p>
                    <p className="mt-2 text-xs font-semibold text-emerald-800">
                      Empty preview state only. No preview data, invoice number, PDF, sending, or save is active here.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {regularCustomerBookingListItems.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {filteredRegularCustomerBookingListItems.length > 0 ? (
                  filteredRegularCustomerBookingListItems.map((item) => {
                    const rowActionFeedback = regularCustomerBookingListActionFeedback[item.id];
                    const isBillingDetailPreviewOpen = regularCustomerBillingDetailPreviewId === item.id;

                    return (
                    <article
                      className="rounded-md border border-slate-200 bg-white p-4 text-sm leading-6 shadow-sm"
                      data-regular-customer-booking-list-row={item.id}
                      key={item.id}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h4 className="text-base font-bold text-slate-950">{item.customerName}</h4>
                          <p
                            className="mt-1 text-slate-600"
                            data-regular-customer-booking-list-passenger={item.id}
                          >
                            {item.passengerName} / {item.pickupDate} {item.pickupTime}
                          </p>
                        </div>
                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
                          Draft list only / not issued
                        </p>
                      </div>

                      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Pickup</dt>
                          <dd className="mt-1 text-slate-950">{item.pickupLocation}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Drop-off</dt>
                          <dd className="mt-1 text-slate-950">{item.dropoffLocation}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                            Route / vehicle
                          </dt>
                          <dd className="mt-1 text-slate-950">
                            {item.routeType} / {getRegularCustomerVehicleTypeLabel(item.vehicleType)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Billing</dt>
                          <dd
                            className="mt-1 text-slate-950"
                            data-regular-customer-booking-list-billing-status={item.id}
                          >
                            {item.billingMonth} / {item.billingStatus}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                            Payment method
                          </dt>
                          <dd className="mt-1 text-slate-950">{item.paymentMethod}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                            Customer ref / PO
                          </dt>
                          <dd className="mt-1 text-slate-950">{item.customerReference || "No reference entered"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                            Invoice number
                          </dt>
                          <dd
                            className="mt-1 font-semibold text-slate-950"
                            data-regular-customer-booking-list-invoice-number={item.id}
                          >
                            Not created
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                            Created locally
                          </dt>
                          <dd className="mt-1 text-slate-950">{item.createdAtLabel}</dd>
                        </div>
                      </dl>

                      <div
                        className="mt-4 border-t border-slate-200 pt-4"
                        data-regular-customer-booking-list-action-controls={item.id}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                              Internal staff-only / mock-local controls
                            </p>
                            <p
                              className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-600"
                              data-regular-customer-booking-list-action-boundary={item.id}
                            >
                              Mock/local only. Internal staff-only. Not saved. No audit record created yet. No
                              invoice, payment, bank, notification, calendar, or Supabase action.
                            </p>
                          </div>
                          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto xl:grid-cols-4">
                            <button
                              className="min-h-11 rounded-md border border-indigo-900 bg-indigo-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-800"
                              data-regular-customer-billing-detail-action={item.id}
                              onClick={() => showRegularCustomerBillingDetails(item)}
                              type="button"
                            >
                              View Billing Details — Mock Only
                            </button>
                            {(
                              [
                                ["edit", "Edit mock row"],
                                ["amend", "Amend mock row"],
                                ["cancel", "Cancel mock row"],
                              ] as const
                            ).map(([action, label]) => (
                              <button
                                className="min-h-11 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-white"
                                data-regular-customer-booking-list-action={action}
                                key={action}
                                onClick={() => handleRegularCustomerBookingListAction(item, action)}
                                type="button"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <p
                          aria-live="polite"
                          className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-700"
                          data-regular-customer-booking-list-action-feedback={item.id}
                          data-regular-customer-booking-list-action-feedback-kind={rowActionFeedback?.action ?? ""}
                        >
                          {rowActionFeedback?.message ??
                            "Choose a mock row action to preview future edit/amend/cancel guidance. Nothing will be saved, removed, audited, invoiced, paid, synced, sent, or written to Supabase."}
                        </p>

                        {isBillingDetailPreviewOpen ? (
                          <div
                            className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-slate-700"
                            data-regular-customer-billing-detail-preview={item.id}
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-800">
                                  Mock/local read-only panel
                                </p>
                                <h5
                                  className="mt-1 text-base font-bold text-indigo-950"
                                  data-regular-customer-billing-detail-title={item.id}
                                >
                                  Billing Details Preview — Mock Only
                                </h5>
                              </div>
                              <button
                                className="min-h-11 rounded-md border border-indigo-300 bg-white px-3 py-2 text-sm font-bold text-indigo-950 transition hover:border-indigo-700"
                                data-regular-customer-billing-detail-dismiss={item.id}
                                onClick={closeRegularCustomerBillingDetails}
                                type="button"
                              >
                                Close Billing Details — Mock Only
                              </button>
                            </div>

                            <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                              <div>
                                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-800">
                                  Customer
                                </dt>
                                <dd className="mt-1 font-semibold text-slate-950">{item.customerName}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-800">
                                  Booking
                                </dt>
                                <dd className="mt-1 font-semibold text-slate-950">
                                  {item.passengerName} / {item.pickupDate} {item.pickupTime}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-800">
                                  Billing month
                                </dt>
                                <dd className="mt-1 font-semibold text-slate-950">{item.billingMonth}</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-800">
                                  Trip count
                                </dt>
                                <dd className="mt-1 font-semibold text-slate-950">1 local mock trip</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-800">
                                  Mock amount
                                </dt>
                                <dd className="mt-1 font-semibold text-slate-950">Not calculated</dd>
                              </div>
                              <div>
                                <dt className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-800">
                                  Status
                                </dt>
                                <dd className="mt-1 font-semibold text-slate-950">{item.billingStatus}</dd>
                              </div>
                            </dl>

                            <p
                              className="mt-3 rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold leading-6 text-indigo-950"
                              data-regular-customer-billing-detail-boundary={item.id}
                            >
                              This is not an invoice and no payment was requested. Opening or closing this preview
                              does not create invoice numbers, generate invoices or PDFs, send payment requests, call
                              network APIs, write browser storage, write Supabase, change row data, add rows, remove
                              rows, update payment status, or trigger Telegram/notification behavior.
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p
                          className="rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-700"
                          data-regular-customer-booking-list-no-save-boundary={item.id}
                        >
                          List row only. No save, invoice, statement, notification, calendar, payment, bank, audit, or
                          Supabase record.
                        </p>
                        {item.customerFolderHref ? (
                          <Link
                            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-700"
                            data-regular-customer-booking-list-folder-link={item.id}
                            href={item.customerFolderHref}
                          >
                            Open customer folder mock link
                          </Link>
                        ) : null}
                      </div>
                    </article>
                    );
                  })
                ) : (
                  <div
                    className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600"
                    data-regular-customer-booking-list-filter-empty="true"
                  >
                    No local mock rows match these filters. Nothing was saved, sent, numbered, or synced.
                  </div>
                )}
              </div>
            ) : (
              <div
                className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600"
                data-regular-customer-booking-list-empty="true"
              >
                No mock regular customer monthly billing rows yet. A validated mock booking submit adds a local row
                here.
              </div>
            )}
          </div>
        </section>
        </details>

        <details className="rounded-lg border border-slate-200 bg-white shadow-sm" data-customer-debug-tools-drawer="true">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-900 [&::-webkit-details-marker]:hidden">
            Support logs and guardrails
            <span className="text-xs font-semibold text-slate-500">Collapsed</span>
          </summary>
          <div className="grid gap-4 border-t border-slate-200 p-4 sm:p-5">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm" data-mock-payment-event-log="true">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <h2 className="text-lg font-bold text-slate-950">Mock Payment Event Log</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600" data-mock-payment-event-log-boundary="true">
              Mock only. No payment record, invoice record, bank record, notification, or Supabase row is created.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            {mockPaymentEvents.length > 0 ? (
              <div className="grid gap-3" aria-live="polite">
                {mockPaymentEvents.map((event) => (
                  <article
                    className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm lg:grid-cols-[0.8fr_1fr_0.8fr_0.7fr_1.2fr]"
                    data-mock-payment-event={event.invoiceNumber}
                    key={event.id}
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Invoice / Reference
                      </p>
                      <p className="mt-1 font-bold text-slate-950">{event.invoiceNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Customer</p>
                      <p className="mt-1 font-semibold text-slate-900">{event.customerName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Action</p>
                      <p className="mt-1 font-semibold text-slate-900">{event.action}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Local Time</p>
                      <p className="mt-1 font-semibold text-slate-900">{event.timestamp}</p>
                    </div>
                    <p className="leading-6 text-slate-700">{event.note}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                No mock payment actions recorded yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm" data-mock-follow-up-event-log="true">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <h2 className="text-lg font-bold text-slate-950">Mock Follow-up Event Log</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600" data-mock-follow-up-event-log-boundary="true">
              Mock only. No notification, WhatsApp message, email, payment record, bank record, or Supabase row is
              created.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            {mockFollowUpEvents.length > 0 ? (
              <div className="grid gap-3" aria-live="polite">
                {mockFollowUpEvents.map((event) => (
                  <article
                    className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm lg:grid-cols-[0.8fr_1fr_0.8fr_0.7fr_1.2fr]"
                    data-mock-follow-up-event={event.invoiceNumber}
                    key={event.id}
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Invoice / Reference
                      </p>
                      <p className="mt-1 font-bold text-slate-950">{event.invoiceNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Customer</p>
                      <p className="mt-1 font-semibold text-slate-900">{event.customerName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Action</p>
                      <p className="mt-1 font-semibold text-slate-900">{event.action}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Local Time</p>
                      <p className="mt-1 font-semibold text-slate-900">{event.timestamp}</p>
                    </div>
                    <p className="leading-6 text-slate-700">{event.note}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                No mock follow-up actions recorded yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm" data-mock-statement-preview-log="true">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <h2 className="text-lg font-bold text-slate-950">Mock Statement Preview Log</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600" data-mock-statement-preview-log-boundary="true">
              Mock only. No statement record, invoice record, payment record, bank record, notification, WhatsApp
              message, email, SMS, or Supabase row is created.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            {mockStatementPreviewEvents.length > 0 ? (
              <div className="grid gap-3" aria-live="polite">
                {mockStatementPreviewEvents.map((event) => (
                  <article
                    className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm lg:grid-cols-[1fr_1fr_0.8fr_0.7fr_1.2fr]"
                    data-mock-statement-preview-event={event.customerName}
                    key={event.id}
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Customer</p>
                      <p className="mt-1 font-bold text-slate-950">{event.customerName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Mock statement period
                      </p>
                      <p className="mt-1 font-semibold text-slate-900">{event.periodLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Action</p>
                      <p className="mt-1 font-semibold text-slate-900">{event.action}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Local Time</p>
                      <p className="mt-1 font-semibold text-slate-900">{event.timestamp}</p>
                    </div>
                    <p className="leading-6 text-slate-700">{event.note}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                No mock statement previews recorded yet.
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Mock Payment States</h2>
            <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
              {["Unpaid", "Invoice Sent", "Partially Paid", "Paid", "Overdue", "Monthly Account"].map((status) => (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700" key={status}>
                  {status}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Collection Rules</h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700" data-payment-collection-rules="true">
              {collectionRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <h2 className="font-bold">Invoice Number Guardrails</h2>
          <p className="mt-2">
            Invoice numbers are unique and must not be reused. Once issued, invoice numbers are immutable. Changing a
            customer invoice prefix later requires warning/protection because it can make invoice history messy.
          </p>
          <p className="mt-2">
            This dashboard does not implement real invoice generation yet; it only shows local mock examples.
          </p>
        </section>
          </div>
        </details>
      </div>
    </main>
  );
}
