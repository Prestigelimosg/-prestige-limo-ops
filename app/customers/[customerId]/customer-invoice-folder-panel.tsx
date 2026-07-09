"use client";

import { useState } from "react";
import type { MockCustomer, MockCustomerBooking, MockCustomerInvoice } from "../_data/mock-customers";
import { CustomerInvoicePrefixSettingsPanel } from "./invoice-prefix-settings-panel";

type CustomerInvoiceFolderPanelProps = {
  customer: MockCustomer;
};

function statusClass(status: string) {
  if (/paid/i.test(status) && !/partially/i.test(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (/overdue/i.test(status)) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
}

function displayInvoiceStatus(status: string) {
  if (/paid/i.test(status) && !/partially/i.test(status)) {
    return "Paid";
  }

  return "Pending";
}

function invoiceBalance(invoice: MockCustomerInvoice, booking: MockCustomerBooking | undefined) {
  if (booking?.balanceDue) {
    return booking.balanceDue;
  }

  return /paid/i.test(invoice.status) && !/partially/i.test(invoice.status) ? "$0" : invoice.amount;
}

function itemDescription(customer: MockCustomer, booking: MockCustomerBooking | undefined, invoice: MockCustomerInvoice) {
  if (!booking) {
    return `Passenger/service details pending review. Ref ${invoice.invoiceNumber}`;
  }

  return `${booking.service}; ${booking.date}; ${booking.route}. Passenger/customer: ${customer.companyName}. Ref ${booking.invoiceNumber}`;
}

export function CustomerInvoiceFolderPanel({ customer }: CustomerInvoiceFolderPanelProps) {
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState(customer.invoices[0]?.invoiceNumber ?? "");
  const selectedInvoice = customer.invoices.find((invoice) => invoice.invoiceNumber === selectedInvoiceNumber);
  const selectedBooking = customer.bookingHistory.find(
    (booking) => booking.invoiceNumber === selectedInvoice?.invoiceNumber,
  );

  return (
    <section
      className="rounded-md border border-slate-200 bg-white shadow-sm"
      data-customer-invoice-rules="true"
      data-customer-invoice-folder-panel={customer.id}
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Invoices</h2>
            <p className="mt-0.5 text-sm font-semibold text-slate-600">
              Date, invoice number, amount, balance due, and paid or pending status for this customer.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-600 sm:min-w-[28rem]">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p>Total</p>
              <p className="mt-1 text-base font-bold text-slate-950">{customer.invoices.length}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p>Outstanding</p>
              <p className="mt-1 text-base font-bold text-slate-950">{customer.outstandingAmount}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p>Overdue</p>
              <p className="mt-1 text-base font-bold text-rose-700">{customer.overdueAmount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm" data-customer-invoice-folder-table="true">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Invoice number</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {customer.invoices.length === 0 ? (
              <tr data-customer-invoice-folder-empty="true">
                <td className="px-4 py-5 text-sm font-semibold text-slate-600" colSpan={6}>
                  No invoice records loaded for this customer yet.
                </td>
              </tr>
            ) : null}
            {customer.invoices.map((invoice) => {
              const booking = customer.bookingHistory.find((row) => row.invoiceNumber === invoice.invoiceNumber);
              const balance = invoiceBalance(invoice, booking);
              const selected = selectedInvoiceNumber === invoice.invoiceNumber;

              return (
                <tr
                  className={`border-b border-slate-100 last:border-b-0 ${
                    selected ? "bg-sky-50/70" : "hover:bg-slate-50"
                  }`}
                  data-customer-invoice-folder-row={invoice.invoiceNumber}
                  key={invoice.invoiceNumber}
                >
                  <td className="px-4 py-3 font-semibold text-slate-800">{invoice.dueDate}</td>
                  <td className="px-4 py-3">
                    <button
                      className="font-bold text-sky-700 underline-offset-4 hover:underline"
                      data-customer-invoice-folder-view={invoice.invoiceNumber}
                      onClick={() => setSelectedInvoiceNumber(invoice.invoiceNumber)}
                      type="button"
                    >
                      {invoice.invoiceNumber}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-950">{invoice.amount}</td>
                  <td className="px-4 py-3 font-bold text-slate-950">{balance}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md border px-3 py-1 font-bold ${statusClass(invoice.status)}`}>
                      {displayInvoiceStatus(invoice.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-800 hover:bg-slate-50"
                        onClick={() => setSelectedInvoiceNumber(invoice.invoiceNumber)}
                        type="button"
                      >
                        View
                      </button>
                      <button
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-800 opacity-60"
                        title="Use the guarded invoice workbench for live email sending."
                        type="button"
                      >
                        Email
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedInvoice ? (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-4" data-customer-invoice-folder-detail="true">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-950">{selectedInvoice.invoiceNumber} items</h3>
              <p className="mt-0.5 text-sm font-semibold text-slate-600">
                Only this selected invoice is shown below.
              </p>
            </div>
            <span className={`w-fit rounded-md border px-3 py-1 text-sm font-bold ${statusClass(selectedInvoice.status)}`}>
              {displayInvoiceStatus(selectedInvoice.status)}
            </span>
          </div>

          <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Item description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-4 font-bold text-slate-600">1</td>
                  <td className="px-4 py-4 font-semibold leading-6 text-slate-900">
                    {itemDescription(customer, selectedBooking, selectedInvoice)}
                  </td>
                  <td className="px-4 py-4 text-right font-bold text-slate-950">{selectedInvoice.amount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-600">
          No invoice selected.
        </div>
      )}

      <details className="border-t border-slate-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">Prefix settings</summary>
        <div className="mt-3">
          <CustomerInvoicePrefixSettingsPanel
            customerAccount={customer.companyName}
            suggestedPrefix={customer.invoicePrefix}
          />
        </div>
      </details>

    </section>
  );
}
