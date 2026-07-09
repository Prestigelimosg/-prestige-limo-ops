"use client";

import { useState } from "react";
import type { MockCustomer, MockCustomerBooking, MockCustomerInvoice } from "../_data/mock-customers";
import { CustomerInvoicePrefixSettingsPanel } from "./invoice-prefix-settings-panel";

type CustomerInvoiceFolderPanelProps = {
  customer: MockCustomer;
};

type PaymentMethod = "Card" | "Cash" | "Bank transfer";

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

function isPaidStatus(status: string) {
  return /paid/i.test(status) && !/partially/i.test(status);
}

function invoiceBalance(invoice: MockCustomerInvoice, booking: MockCustomerBooking | undefined) {
  if (booking?.balanceDue) {
    return booking.balanceDue;
  }

  return /paid/i.test(invoice.status) && !/partially/i.test(invoice.status) ? "$0" : invoice.amount;
}

function customerBillingContact(customer: MockCustomer) {
  return customer.contacts.find((contact) => /billing|account/i.test(contact.label)) ?? customer.contacts[0];
}

function itemDescription(customer: MockCustomer, booking: MockCustomerBooking | undefined, invoice: MockCustomerInvoice) {
  if (!booking) {
    return `Passenger/service details pending review. Ref ${invoice.invoiceNumber}`;
  }

  return `${booking.service}; ${booking.date}; ${booking.route}. Passenger/customer: ${customer.companyName}. Ref ${booking.invoiceNumber}`;
}

export function CustomerInvoiceFolderPanel({ customer }: CustomerInvoiceFolderPanelProps) {
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState(customer.invoices[0]?.invoiceNumber ?? "");
  const [paidInvoiceMethods, setPaidInvoiceMethods] = useState<Record<string, PaymentMethod>>({});
  const [localPaidInvoices, setLocalPaidInvoices] = useState<Record<string, PaymentMethod>>({});
  const [invoiceActionMessage, setInvoiceActionMessage] = useState("");
  const selectedInvoice = customer.invoices.find((invoice) => invoice.invoiceNumber === selectedInvoiceNumber);
  const selectedBooking = customer.bookingHistory.find(
    (booking) => booking.invoiceNumber === selectedInvoice?.invoiceNumber,
  );
  const selectedPaymentMethod = selectedInvoice
    ? paidInvoiceMethods[selectedInvoice.invoiceNumber] ?? "Bank transfer"
    : "Bank transfer";
  const selectedInvoiceIsPaid = selectedInvoice
    ? Boolean(localPaidInvoices[selectedInvoice.invoiceNumber]) || isPaidStatus(selectedInvoice.status)
    : false;
  const selectedInvoiceStatus = selectedInvoiceIsPaid ? "Paid" : "Pending";
  const selectedInvoiceBalance = selectedInvoice
    ? selectedInvoiceIsPaid
      ? "$0"
      : invoiceBalance(selectedInvoice, selectedBooking)
    : "$0";
  const selectedContact = customerBillingContact(customer);

  function openInvoice(invoiceNumber: string) {
    setSelectedInvoiceNumber(invoiceNumber);
    setInvoiceActionMessage("");
  }

  function updatePaymentMethod(invoiceNumber: string, paymentMethod: PaymentMethod) {
    setPaidInvoiceMethods((currentMethods) => ({
      ...currentMethods,
      [invoiceNumber]: paymentMethod,
    }));
  }

  function markInvoicePaid(invoice: MockCustomerInvoice) {
    const paymentMethod = paidInvoiceMethods[invoice.invoiceNumber] ?? "Bank transfer";

    setSelectedInvoiceNumber(invoice.invoiceNumber);
    setLocalPaidInvoices((currentPaidInvoices) => ({
      ...currentPaidInvoices,
      [invoice.invoiceNumber]: paymentMethod,
    }));
    setInvoiceActionMessage(
      `Marked ${invoice.invoiceNumber} paid by ${paymentMethod}. Thank you message ready for ${selectedContact?.value ?? customer.companyName}.`,
    );
  }

  function preparePaymentReminder(invoice: MockCustomerInvoice) {
    setSelectedInvoiceNumber(invoice.invoiceNumber);
    setInvoiceActionMessage(
      `Reminder ready for ${selectedContact?.value ?? customer.companyName}: payment is pending for ${invoice.invoiceNumber}, amount ${invoice.amount}, due ${invoice.dueDate}.`,
    );
  }

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
              const paidLocally = localPaidInvoices[invoice.invoiceNumber];
              const isPaid = Boolean(paidLocally) || isPaidStatus(invoice.status);
              const balance = isPaid ? "$0" : invoiceBalance(invoice, booking);
              const selected = selectedInvoiceNumber === invoice.invoiceNumber;
              const paymentMethod = paidInvoiceMethods[invoice.invoiceNumber] ?? paidLocally ?? "Bank transfer";

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
                      onClick={() => openInvoice(invoice.invoiceNumber)}
                      type="button"
                    >
                      {invoice.invoiceNumber}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-950">{invoice.amount}</td>
                  <td className="px-4 py-3 font-bold text-slate-950">{balance}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-md border px-3 py-1 font-bold ${statusClass(
                        isPaid ? "Paid" : invoice.status,
                      )}`}
                    >
                      {isPaid ? "Paid" : displayInvoiceStatus(invoice.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-800 hover:bg-slate-50"
                        onClick={() => openInvoice(invoice.invoiceNumber)}
                        type="button"
                      >
                        View
                      </button>
                      {isPaid ? null : (
                        <button
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 font-bold text-amber-900 hover:bg-amber-100"
                          data-customer-invoice-folder-reminder={invoice.invoiceNumber}
                          onClick={() => preparePaymentReminder(invoice)}
                          type="button"
                        >
                          Send reminder
                        </button>
                      )}
                      <select
                        aria-label={`Payment method for ${invoice.invoiceNumber}`}
                        className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-bold text-slate-800"
                        data-customer-invoice-folder-paid-method={invoice.invoiceNumber}
                        onChange={(event) =>
                          updatePaymentMethod(invoice.invoiceNumber, event.target.value as PaymentMethod)
                        }
                        value={paymentMethod}
                      >
                        <option>Bank transfer</option>
                        <option>Card</option>
                        <option>Cash</option>
                      </select>
                      <button
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-bold text-emerald-800 hover:bg-emerald-100"
                        data-customer-invoice-folder-mark-paid={invoice.invoiceNumber}
                        onClick={() => markInvoicePaid(invoice)}
                        type="button"
                      >
                        Mark paid
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
            <span
              className={`w-fit rounded-md border px-3 py-1 text-sm font-bold ${statusClass(
                selectedInvoiceStatus,
              )}`}
            >
              {selectedInvoiceStatus}
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
          <div
            className="mt-3 grid gap-3 rounded-md border border-slate-200 bg-white p-3 text-sm md:grid-cols-[minmax(14rem,1fr)_minmax(14rem,1fr)]"
            data-customer-invoice-folder-selected-actions={selectedInvoice.invoiceNumber}
          >
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Invoice status</p>
              <p className="mt-1 font-bold text-slate-950">
                {selectedInvoiceStatus} · Due {selectedInvoiceBalance}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2 md:justify-end">
              {selectedInvoiceIsPaid ? null : (
                <button
                  className="min-h-9 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-bold text-amber-900 hover:bg-amber-100"
                  data-customer-invoice-folder-selected-reminder={selectedInvoice.invoiceNumber}
                  onClick={() => preparePaymentReminder(selectedInvoice)}
                  type="button"
                >
                  Send reminder
                </button>
              )}
              <select
                aria-label={`Payment method for selected invoice ${selectedInvoice.invoiceNumber}`}
                className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-bold text-slate-800"
                data-customer-invoice-folder-selected-paid-method={selectedInvoice.invoiceNumber}
                onChange={(event) =>
                  updatePaymentMethod(selectedInvoice.invoiceNumber, event.target.value as PaymentMethod)
                }
                value={selectedPaymentMethod}
              >
                <option>Bank transfer</option>
                <option>Card</option>
                <option>Cash</option>
              </select>
              <button
                className="min-h-9 rounded-md border border-emerald-300 bg-emerald-50 px-3 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
                data-customer-invoice-folder-selected-mark-paid={selectedInvoice.invoiceNumber}
                onClick={() => markInvoicePaid(selectedInvoice)}
                type="button"
              >
                Mark paid + thank you
              </button>
            </div>
          </div>
          {invoiceActionMessage ? (
            <p
              className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900"
              data-customer-invoice-folder-action-message="true"
            >
              {invoiceActionMessage}
            </p>
          ) : null}
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
