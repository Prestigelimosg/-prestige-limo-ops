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
  { label: "Arrival / MNG", value: "MNG" },
  { label: "Departure / DEP", value: "DEP" },
  { label: "Transfer / TRF", value: "TRF" },
  { label: "Disposal / DSP / hourly", value: "DSP" },
];

const regularCustomerVehicleTypeOptions = ["AVF", "VVV", "Combi", "E class", "S class"];

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
  routeType: "MNG",
  vehicleType: "AVF",
};

const outstandingPaymentStatuses = new Set<MockPaymentStatus>([
  "Invoice Sent",
  "Monthly Account",
  "Overdue",
  "Partially Paid",
  "Unpaid",
]);

type OutstandingPaymentReviewItem = {
  balanceDue: string;
  customerId: string;
  customerName: string;
  dueOrFollowUpDate: string;
  followUpDate: string;
  invoiceNumber: string;
  isMonthlyAccount: boolean;
  key: string;
  paymentStatus: MockPaymentStatus;
  reason: string;
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

type RegularCustomerBookingFeedbackTone = "error" | "info" | "success";

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
  { field: "routeType", label: "Route type" },
  { field: "vehicleType", label: "Vehicle type" },
  { field: "billingMonth", label: "Billing month" },
];

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
    .map((booking) => ({
      balanceDue: booking.balanceDue,
      customerId: customer.id,
      customerName: customer.companyName,
      dueOrFollowUpDate:
        customer.invoices.find((invoice) => invoice.invoiceNumber === booking.invoiceNumber)?.dueDate ??
        customer.nextFollowUpDate,
      followUpDate: customer.nextFollowUpDate,
      invoiceNumber: booking.invoiceNumber,
      isMonthlyAccount: customer.accountType === "Monthly Account",
      key: `${customer.id}:${booking.invoiceNumber}`,
      paymentStatus: booking.paymentStatus,
      reason: getOutstandingPaymentReason(customer, booking),
    })),
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
  const [regularCustomerBookingMissingFields, setRegularCustomerBookingMissingFields] = useState<
    Array<keyof RegularCustomerBookingForm>
  >([]);
  const [regularCustomerBookingPreview, setRegularCustomerBookingPreview] =
    useState<RegularCustomerBookingPreview | null>(null);
  const [regularCustomerBookingListItems, setRegularCustomerBookingListItems] = useState<
    RegularCustomerBookingListItem[]
  >([]);
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

  function updateRegularCustomerBookingField(field: keyof RegularCustomerBookingForm, value: string) {
    setRegularCustomerBookingForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
    setRegularCustomerBookingMissingFields((currentFields) =>
      value.trim() ? currentFields.filter((currentField) => currentField !== field) : currentFields,
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
    const nextBookingPreview = {
      ...regularCustomerBookingForm,
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
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              Clean mock dashboard for finding customer folders and reviewing outstanding balances.
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
                  placeholder="Pickup address or airport terminal"
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
                  placeholder="Drop-off address"
                  type="text"
                  value={regularCustomerBookingForm.dropoffLocation}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Route type *
                <select
                  aria-invalid={isRegularCustomerBookingFieldMissing("routeType")}
                  className={regularCustomerBookingFieldClass("routeType")}
                  data-regular-booking-field="routeType"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("routeType", event.target.value)}
                  value={regularCustomerBookingForm.routeType}
                >
                  {regularCustomerRouteTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
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
                  {regularCustomerVehicleTypeOptions.map((vehicleType) => (
                    <option key={vehicleType} value={vehicleType}>
                      {vehicleType}
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

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Billing month *
                <input
                  aria-invalid={isRegularCustomerBookingFieldMissing("billingMonth")}
                  className={regularCustomerBookingFieldClass("billingMonth")}
                  data-regular-booking-field="billingMonth"
                  data-regular-booking-required="true"
                  onChange={(event) => updateRegularCustomerBookingField("billingMonth", event.target.value)}
                  placeholder="2026-05"
                  type="text"
                  value={regularCustomerBookingForm.billingMonth}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Billing status default
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  data-regular-booking-field="billingStatus"
                  readOnly
                  type="text"
                  value={regularCustomerBookingForm.billingStatus}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
                Payment method default
                <input
                  className="min-h-11 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  data-regular-booking-field="paymentMethod"
                  readOnly
                  type="text"
                  value={regularCustomerBookingForm.paymentMethod}
                />
              </label>

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
                className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"
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
                    {regularCustomerBookingPreview.vehicleType}
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

            {regularCustomerBookingListItems.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {regularCustomerBookingListItems.map((item) => (
                  <article
                    className="rounded-md border border-slate-200 bg-white p-4 text-sm leading-6 shadow-sm"
                    data-regular-customer-booking-list-row={item.id}
                    key={item.id}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h4 className="text-base font-bold text-slate-950">{item.customerName}</h4>
                        <p className="mt-1 text-slate-600">
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
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Route / vehicle</dt>
                        <dd className="mt-1 text-slate-950">
                          {item.routeType} / {item.vehicleType}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Billing</dt>
                        <dd className="mt-1 text-slate-950">
                          {item.billingMonth} / {item.billingStatus}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Payment method</dt>
                        <dd className="mt-1 text-slate-950">{item.paymentMethod}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Customer ref / PO</dt>
                        <dd className="mt-1 text-slate-950">{item.customerReference || "No reference entered"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Invoice number</dt>
                        <dd className="mt-1 font-semibold text-slate-950">Not created</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Created locally</dt>
                        <dd className="mt-1 text-slate-950">{item.createdAtLabel}</dd>
                      </div>
                    </dl>

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
                ))}
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
            <p
              aria-live="polite"
              className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              data-payment-section-feedback="true"
            >
              {mockPaymentSectionFeedback}
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {visibleOutstandingPaymentReviewItems.length > 0 ? (
              visibleOutstandingPaymentReviewItems.map((item) => (
                <article
                  className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1fr_0.7fr_0.7fr_0.8fr_1fr_1.35fr] xl:items-start"
                  data-outstanding-payment-row={item.key}
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
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Due / Follow-up</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{item.dueOrFollowUpDate}</p>
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{item.reason}</p>
                  <div className="flex flex-col gap-3">
                    <Link
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-700"
                      data-outstanding-open-customer-folder={item.key}
                      href={`/customers/${item.customerId}`}
                    >
                      Open Customer Folder
                    </Link>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <button
                        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                        data-payment-action="invoice-sent"
                        onClick={() => handleMockPaymentAction(item, "invoice-sent")}
                        type="button"
                      >
                        Mark Invoice Sent
                      </button>
                      <button
                        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:border-slate-500 hover:bg-slate-50"
                        data-payment-action="partial-payment"
                        onClick={() => handleMockPaymentAction(item, "partial-payment")}
                        type="button"
                      >
                        Record Partial Payment
                      </button>
                      <button
                        className="min-h-11 rounded-md border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-600"
                        data-payment-action="paid"
                        onClick={() => handleMockPaymentAction(item, "paid")}
                        type="button"
                      >
                        Mark Paid
                      </button>
                      <button
                        className="min-h-11 rounded-md border border-amber-700 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-100"
                        data-payment-action="waived"
                        onClick={() => handleMockPaymentAction(item, "waived")}
                        type="button"
                      >
                        Waive Balance
                      </button>
                    </div>
                    <p
                      aria-live="polite"
                      className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600"
                      data-payment-action-feedback={item.key}
                    >
                      {item.feedback ?? "Mock helper: this row updates local page state only."}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <div className="p-5 text-sm text-slate-600" data-outstanding-payments-empty="true">
                No mock outstanding payment items remain after local actions. Refreshing the page restores the mock data.
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
