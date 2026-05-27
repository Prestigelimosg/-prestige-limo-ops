"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import {
  collectionRules,
  mockCustomers,
  mockPaymentSummary,
  type MockCustomer,
  type MockCustomerBooking,
  type MockPaymentStatus,
} from "./_data/mock-customers";

const summaryCards = [
  { label: "Total Outstanding", value: mockPaymentSummary.totalOutstanding },
  { label: "Overdue", value: mockPaymentSummary.overdue },
  { label: "Paid This Month", value: mockPaymentSummary.paidThisMonth },
  { label: "Follow-ups Today", value: mockPaymentSummary.followUpsToday },
];

const maxCustomerSearchResults = 8;

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

const initialRegularCustomerBookingForm = {
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

function regularCustomerBookingFeedbackClass(tone: RegularCustomerBookingFeedbackTone) {
  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }

  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
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

export default function MockCustomerDashboardPage() {
  const [searchTerm, setSearchTerm] = useState("");
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
  const [expandedOutstandingPaymentKey, setExpandedOutstandingPaymentKey] = useState("");
  const [mockFollowUpSectionFeedback, setMockFollowUpSectionFeedback] = useState(
    "Mock follow-up controls only. Use the buttons to simulate collection follow-up without sending messages.",
  );
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const selectedRegularCustomer = useMemo(
    () => mockCustomers.find((customer) => customer.id === regularCustomerBookingForm.customerId),
    [regularCustomerBookingForm.customerId],
  );
  const filteredCustomers = useMemo(() => {
    if (!normalizedSearchTerm) {
      return [];
    }

    return mockCustomers
      .filter((customer) =>
        `${customer.companyName} ${customer.invoicePrefix} ${customer.paymentStatusSummary}`
          .toLowerCase()
          .includes(normalizedSearchTerm),
      )
      .slice(0, maxCustomerSearchResults);
  }, [normalizedSearchTerm]);
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
  const mockStatementPreviewGroups = useMemo(
    () =>
      getMockStatementPreviewGroups(visibleOutstandingPaymentReviewItems).map((group) => ({
        ...group,
        feedback: mockStatementPreviewFeedback[group.key],
      })),
    [mockStatementPreviewFeedback, visibleOutstandingPaymentReviewItems],
  );
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

        return customerMatches && billingMonthMatches && billingStatusMatches;
      }),
    [regularCustomerBookingListFilters, regularCustomerBookingListItems],
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

  function clearRegularCustomerBookingListFilters() {
    setRegularCustomerBookingListFilters(initialRegularCustomerBookingListFilters);
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
              <h1 className="text-3xl font-bold tracking-normal text-slate-950">Customers</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Mock customer payments dashboard. Local/mock only. No payment API, bank API,
                notification, or Supabase write is used.
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

        <section aria-label="Customer payment summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              data-customer-summary-card={card.label}
              key={card.label}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{card.label}</p>
              <p className="mt-3 text-2xl font-bold text-slate-950">{card.value}</p>
            </div>
          ))}
        </section>

        <section
          className="rounded-lg border border-slate-200 bg-white shadow-sm"
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
                    Internal staff-only / planning placeholder
                  </p>
                  <h4
                    className="mt-2 text-base font-bold text-sky-950"
                    data-regular-customer-saved-visibility-heading="true"
                  >
                    Future Saved Booking Visibility — Mock Only
                  </h4>
                  <p
                    className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-sky-950"
                    data-regular-customer-saved-visibility-boundary="true"
                  >
                    Mock/local only. No booking saved, no customer folder linked, no Supabase call, no invoice number,
                    no payment/bank action, no notification/calendar action, and no audit record.
                  </p>
                </div>
                <p className="rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-bold text-sky-950">
                  Read-only placeholder. No action is available here.
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[
                  [
                    "Customer folder",
                    "Future approved saves will appear in the selected customer folder. Nothing is linked here now.",
                  ],
                  [
                    "Monthly billing review",
                    "Saved regular bookings will become eligible for monthly billing review later. Current rows still reset on refresh.",
                  ],
                  [
                    "Future saved booking list",
                    "This area marks where saved booking visibility will live after save/linking approval. It does not add or remove local rows.",
                  ],
                  [
                    "Future edit/amend/cancel",
                    "Later edit/amend/cancel workflow will use saved booking ids only. Mock row controls remain guidance only.",
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
                className="mt-4 rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold leading-6 text-sky-950"
                data-regular-customer-saved-visibility-local-row-note="true"
              >
                {regularCustomerBookingListItems.length > 0
                  ? `Future saved booking will appear here after real save is approved. ${regularCustomerBookingListItems.length} local mock monthly billing row${regularCustomerBookingListItems.length === 1 ? " is" : "s are"} present on this page, but none is saved, linked, audited, invoiced, paid, synced, sent, or written to Supabase.`
                  : "Future saved booking will appear here after real save is approved. No saved booking visibility data exists now, and this placeholder does not save, link, audit, invoice, pay, sync, send, or call Supabase."}
              </p>
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
                                  Local read-only panel
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
                                Close Preview
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

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm" data-customer-dashboard="true">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Find Customer Folder</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Zoho Invoice-style simplicity: search first, scan the payment state, then open the customer folder.
                </p>
              </div>
              <label className="flex w-full flex-col gap-1 text-sm font-semibold text-slate-700 lg:max-w-sm">
                Search customer/company
                <input
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-customer-search="true"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Type a customer, company, or invoice prefix"
                  type="search"
                  value={searchTerm}
                />
              </label>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {!normalizedSearchTerm ? (
              <div
                className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600"
                data-customer-search-helper="true"
              >
                Type a customer or company name to search.
              </div>
            ) : (
              <div
                aria-live="polite"
                className="overflow-hidden rounded-md border border-slate-200"
                data-customer-results-panel="true"
              >
                {filteredCustomers.length > 0 ? (
                  <div className="divide-y divide-slate-200">
                    {filteredCustomers.map((customer) => (
                      <article
                        className="grid gap-4 p-4 lg:grid-cols-[1.35fr_0.8fr_0.8fr_1fr_auto] lg:items-center"
                        data-customer-row={customer.id}
                        key={customer.id}
                      >
                        <div>
                          <h3 className="text-base font-bold text-slate-950">{customer.companyName}</h3>
                          <p className="mt-1 text-sm text-slate-600">Fixed invoice prefix: {customer.invoicePrefix}</p>
                          <p className="mt-1 text-xs text-slate-500">Examples: {customer.invoiceExamples.join(", ")}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Outstanding</p>
                          <p className="mt-1 text-base font-bold text-slate-950">{customer.outstandingAmount}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Overdue</p>
                          <p className="mt-1 text-base font-bold text-rose-700">{customer.overdueAmount}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Status</p>
                          <p className="mt-1 text-sm font-semibold text-slate-800">{customer.paymentStatusSummary}</p>
                          <p className="mt-1 text-xs text-slate-500">Follow-up: {customer.nextFollowUpDate}</p>
                        </div>
                        <Link
                          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-700"
                          data-open-customer-folder={customer.id}
                          href={`/customers/${customer.id}`}
                        >
                          Open Customer Folder
                        </Link>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="p-5 text-sm text-slate-600" data-customer-empty-state="true">
                    No mock customers match this search.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

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
                const isExpanded = expandedOutstandingPaymentKey === item.key;

                return (
                  <article
                    className="p-4 sm:p-5"
                    data-outstanding-payment-row={item.key}
                    key={item.key}
                  >
                    <div className="grid gap-3 xl:grid-cols-[1.1fr_0.85fr_0.75fr_0.75fr_0.85fr_1.1fr] xl:items-start">
                      <div>
                        <h3 className="text-base font-bold text-slate-950">{item.customerName}</h3>
                        <p className="mt-1 text-sm text-slate-600">{item.invoiceNumber}</p>
                        {item.isMonthlyAccount ? (
                          <p className="mt-1 text-xs font-semibold text-slate-500">Monthly Account</p>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Outstanding
                        </p>
                        <p className="mt-1 text-base font-bold text-slate-950">{item.balanceDue}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.paymentStatus}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Aging</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{item.agingBucket}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.dueStatusLabel}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Due date</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{item.dueOrFollowUpDate}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Last follow-up
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{item.lastFollowUpDate}</p>
                        <p className="mt-1 text-xs text-slate-500">Next action: {getOutstandingNextActionLabel(item)}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Link
                          className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
                          data-outstanding-open-customer-folder={item.key}
                          href={`/customers/${item.customerId}`}
                        >
                          Open Customer Folder
                        </Link>
                        <button
                          className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                          data-outstanding-review-detail-toggle={item.key}
                          onClick={() =>
                            setExpandedOutstandingPaymentKey((currentKey) =>
                              currentKey === item.key ? "" : item.key,
                            )
                          }
                          type="button"
                        >
                          {isExpanded ? "Hide details — Mock Only" : "View details — Mock Only"}
                        </button>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-700">{item.reason}</p>

                    {isExpanded ? (
                      <div
                        className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-950"
                        data-outstanding-review-detail={item.key}
                      >
                        <p className="font-bold">Mock/local detail only for {item.invoiceNumber}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          <li>Customer folder reminder: open {item.customerName} before any real collection work.</li>
                          <li>{item.outstandingBookingsCount} mock outstanding booking rows are visible for this account.</li>
                          <li>Follow-up note placeholder only. No note, payment record, audit record, or customer record is created.</li>
                          <li>No invoice, statement, PDF, invoice number, sending, Supabase call, payment API, bank API, notification, or calendar action.</li>
                        </ul>
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <button
                        className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                        data-payment-action="invoice-sent"
                        onClick={() => handleMockPaymentAction(item, "invoice-sent")}
                        type="button"
                      >
                        Mark Invoice Sent
                      </button>
                      <button
                        className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                        data-payment-action="partial-payment"
                        onClick={() => handleMockPaymentAction(item, "partial-payment")}
                        type="button"
                      >
                        Record Partial Payment
                      </button>
                      <button
                        className="min-h-10 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-600"
                        data-payment-action="paid"
                        onClick={() => handleMockPaymentAction(item, "paid")}
                        type="button"
                      >
                        Mark Paid
                      </button>
                      <button
                        className="min-h-10 rounded-md border border-amber-700 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-100"
                        data-payment-action="waived"
                        onClick={() => handleMockPaymentAction(item, "waived")}
                        type="button"
                      >
                        Waive Balance
                      </button>
                    </div>
                    <p
                      aria-live="polite"
                      className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"
                      data-payment-action-feedback={item.key}
                    >
                      {item.feedback ?? "Mock helper: this row updates local page state only."}
                    </p>
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
                {visibleCollectionFollowUpItems.length} mock follow-ups need collection attention.
              </p>
            </div>
            <p
              aria-live="polite"
              className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              data-follow-up-section-feedback="true"
            >
              {mockFollowUpSectionFeedback}
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {visibleCollectionFollowUpItems.length > 0 ? (
              visibleCollectionFollowUpItems.map((item) => (
                <article
                  className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1fr_0.7fr_0.7fr_0.8fr_1fr_1.25fr] xl:items-start"
                  data-collection-follow-up-row={item.key}
                  key={item.key}
                >
                  <div>
                    <h3 className="text-base font-bold text-slate-950">{item.customerName}</h3>
                    <p className="mt-1 text-sm text-slate-600">{item.invoiceNumber}</p>
                    {item.isMonthlyAccount ? (
                      <p className="mt-1 text-xs font-semibold text-slate-500">Monthly Account</p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Payment Status</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{item.paymentStatus}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Balance Due</p>
                    <p className="mt-1 text-sm font-bold text-slate-950">{item.balanceDue}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Next Follow-up</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{item.followUpDate}</p>
                  </div>
                  <div>
                    <p className="text-sm leading-6 text-slate-700">{getCollectionFollowUpReason(item)}</p>
                    {item.followUpNote ? (
                      <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                        {item.followUpNote}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-3">
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-700"
                      data-follow-up-open-customer-folder={item.key}
                      href={`/customers/${item.customerId}`}
                    >
                      Open Customer Folder
                    </Link>
                    <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                      <button
                        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                        data-follow-up-action="schedule"
                        onClick={() => handleMockFollowUpAction(item, "schedule")}
                        type="button"
                      >
                        Schedule Follow-up
                      </button>
                      <button
                        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                        data-follow-up-action="done"
                        onClick={() => handleMockFollowUpAction(item, "done")}
                        type="button"
                      >
                        Mark Follow-up Done
                      </button>
                      <button
                        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                        data-follow-up-action="note"
                        onClick={() => handleMockFollowUpAction(item, "note")}
                        type="button"
                      >
                        Add Mock Note
                      </button>
                    </div>
                    <p
                      aria-live="polite"
                      className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"
                      data-follow-up-action-feedback={item.key}
                    >
                      {item.followUpFeedback ?? "Mock helper: this follow-up updates local page state only."}
                    </p>
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
                {mockStatementPreviewGroups.length} mock monthly account preview.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {mockStatementPreviewGroups.length > 0 ? (
              mockStatementPreviewGroups.map((group) => (
                <article
                  className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1fr_1.2fr_0.8fr_1fr] xl:items-start"
                  data-monthly-statement-group={group.key}
                  key={group.key}
                >
                  <div>
                    <h3 className="text-base font-bold text-slate-950">{group.customerName}</h3>
                    <p className="mt-1 text-sm text-slate-600">Fixed invoice prefix: {group.invoicePrefix}</p>
                    <p className="mt-1 text-sm text-slate-600">Statement period: {group.periodLabel}</p>
                    <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                      Statement number: Not generated (mock/read-only preview)
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Included invoice/reference rows
                    </p>
                    <div className="mt-3 grid gap-2">
                      {group.items.map((item) => (
                        <div
                          className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
                          data-monthly-statement-row={item.key}
                          key={item.key}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-bold text-slate-950">{item.invoiceNumber}</p>
                              <p className="mt-1 text-slate-600">{item.paymentStatus}</p>
                            </div>
                            <p className="font-bold text-slate-950">{item.balanceDue}</p>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">Follow-up: {item.followUpDate}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Mock statement total
                    </p>
                    <p className="mt-2 text-2xl font-bold text-slate-950" data-monthly-statement-total={group.key}>
                      {group.statementTotal}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Fully paid rows are excluded from this mock total.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <p className="text-sm leading-6 text-slate-700">
                      Monthly account can be grouped into statement later. Balance due remains visible until paid.
                      Statement preview is not generated or saved.
                    </p>
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-700"
                      data-monthly-statement-open-customer-folder={group.key}
                      href={`/customers/${group.customerId}`}
                    >
                      Open Customer Folder
                    </Link>
                    <button
                      className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                      data-statement-preview-action={group.key}
                      onClick={() => handleMockStatementPreview(group)}
                      type="button"
                    >
                      Preview Mock Statement
                    </button>
                    <p
                      aria-live="polite"
                      className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"
                      data-statement-preview-feedback={group.key}
                    >
                      {group.feedback ?? "Mock helper: preview only; nothing is generated, saved, or sent."}
                    </p>
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
    </main>
  );
}
