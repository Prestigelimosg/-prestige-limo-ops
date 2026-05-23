"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { collectionRules, mockCustomers, mockPaymentSummary } from "./_data/mock-customers";

const summaryCards = [
  { label: "Total Outstanding", value: mockPaymentSummary.totalOutstanding },
  { label: "Overdue", value: mockPaymentSummary.overdue },
  { label: "Paid This Month", value: mockPaymentSummary.paidThisMonth },
  { label: "Follow-ups Today", value: mockPaymentSummary.followUpsToday },
];

export default function MockCustomerDashboardPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const filteredCustomers = useMemo(() => {
    if (!normalizedSearchTerm) {
      return mockCustomers;
    }

    return mockCustomers.filter((customer) =>
      `${customer.companyName} ${customer.invoicePrefix} ${customer.paymentStatusSummary}`
        .toLowerCase()
        .includes(normalizedSearchTerm),
    );
  }, [normalizedSearchTerm]);

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
                <h2 className="text-lg font-bold text-slate-950">Customer List</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Zoho Invoice-style simplicity: search, scan payment state, then open the customer folder.
                </p>
              </div>
              <label className="flex w-full flex-col gap-1 text-sm font-semibold text-slate-700 lg:max-w-sm">
                Search customer/company
                <input
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-700"
                  data-customer-search="true"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search UBS, Ritz, VIP, invoice prefix..."
                  type="search"
                  value={searchTerm}
                />
              </label>
            </div>
          </div>

          <div className="divide-y divide-slate-200">
            {filteredCustomers.map((customer) => (
              <article
                className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.35fr_0.8fr_0.8fr_1fr_auto] lg:items-center"
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
                  <p className="mt-1 text-xs text-slate-500">Next follow-up: {customer.nextFollowUpDate}</p>
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
            {filteredCustomers.length === 0 ? (
              <div className="p-5 text-sm text-slate-600" data-customer-empty-state="true">
                No mock customers match this search.
              </div>
            ) : null}
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
