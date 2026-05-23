"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
