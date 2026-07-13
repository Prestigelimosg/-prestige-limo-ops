"use client";

import { useEffect, useMemo, useState } from "react";
import type { MockCustomer, MockCustomerBooking, MockCustomerInvoice } from "../_data/mock-customers";

const adminCustomerInvoicesApiPath = "/api/admin-customer-invoices";

type CustomerInvoiceFolderPanelProps = {
  customer: MockCustomer;
};

type PaymentMethod = "Card" | "Cash" | "Bank transfer";
type InvoiceLineItem = {
  amountLabel?: string;
  description?: string;
};
type DisplayInvoice = {
  amount: string;
  dueDate: string;
  invoiceNumber: string;
  issueDate: string;
  lineItems: InvoiceLineItem[];
  route: string;
  service: string;
  status: string;
};
type StoredInvoiceRecord = {
  amountCents?: number;
  amountLabel?: string;
  customerId?: string;
  customerName?: string;
  documentType?: string;
  documentState?: string;
  dueDateLabel?: string;
  dueDateIso?: string;
  invoiceNumber?: string;
  issueDateLabel?: string;
  lineItems?: InvoiceLineItem[];
  reference?: string;
  route?: string;
  service?: string;
  status?: string;
};

function statusClass(status: string) {
  if (isPaidStatus(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (/overdue/i.test(status)) {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
}

function displayInvoiceStatus(status: string) {
  if (isPaidStatus(status)) {
    return "Paid";
  }

  return "Pending";
}

function isPaidStatus(status: string) {
  const normalizedStatus = status.trim().toLowerCase();

  return normalizedStatus === "paid" || normalizedStatus === "settled";
}

function normalizeCustomerMatch(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function safeDisplay(value: string | null | undefined, fallback: string) {
  const cleaned = String(value ?? "").trim();

  return cleaned || fallback;
}

function invoiceBalance(
  invoice: Pick<DisplayInvoice, "amount" | "status"> | MockCustomerInvoice,
  booking: MockCustomerBooking | undefined,
) {
  if (booking?.balanceDue) {
    return booking.balanceDue;
  }

  return isPaidStatus(invoice.status) ? "$0" : invoice.amount;
}

function customerBillingContact(customer: MockCustomer) {
  return customer.contacts.find((contact) => /billing|account/i.test(contact.label)) ?? customer.contacts[0];
}

function itemDescription(
  customer: MockCustomer,
  booking: MockCustomerBooking | undefined,
  invoice: Pick<DisplayInvoice, "invoiceNumber"> | MockCustomerInvoice,
) {
  if (!booking) {
    return `Passenger/service details pending review. Ref ${invoice.invoiceNumber}`;
  }

  return `${booking.service}; ${booking.date}; ${booking.route}. Passenger/customer: ${customer.companyName}. Ref ${booking.invoiceNumber}`;
}

export function CustomerInvoiceFolderPanel({ customer }: CustomerInvoiceFolderPanelProps) {
  const [selectedInvoiceNumber, setSelectedInvoiceNumber] = useState(customer.invoices[0]?.invoiceNumber ?? "");
  const [storedInvoices, setStoredInvoices] = useState<DisplayInvoice[]>([]);
  const [storedInvoiceMessage, setStoredInvoiceMessage] = useState("Loading stored invoices...");
  const [paidInvoiceMethods, setPaidInvoiceMethods] = useState<Record<string, PaymentMethod>>({});
  const [localPaidInvoices, setLocalPaidInvoices] = useState<Record<string, PaymentMethod>>({});
  const [localInvoiceStatusOverrides, setLocalInvoiceStatusOverrides] = useState<Record<string, "Paid" | "Unpaid">>({});
  const [invoiceActionMessage, setInvoiceActionMessage] = useState("");
  const mockInvoices = useMemo<DisplayInvoice[]>(
    () =>
      customer.invoices.map((invoice) => {
        const booking = customer.bookingHistory.find((row) => row.invoiceNumber === invoice.invoiceNumber);

        return {
          amount: invoice.amount,
          dueDate: invoice.dueDate,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.dueDate,
          lineItems: [
            {
              amountLabel: invoice.amount,
              description: itemDescription(customer, booking, invoice),
            },
          ],
          route: booking?.route || "Route to confirm",
          service: booking?.service || "Service",
          status: invoice.status,
        };
      }),
    [customer],
  );
  const displayInvoices = storedInvoices.length > 0 ? storedInvoices : mockInvoices;
  const selectedInvoice =
    displayInvoices.find((invoice) => invoice.invoiceNumber === selectedInvoiceNumber) ??
    displayInvoices[0];
  const selectedBooking = customer.bookingHistory.find(
    (booking) => booking.invoiceNumber === selectedInvoice?.invoiceNumber,
  );
  const selectedPaymentMethod = selectedInvoice
    ? paidInvoiceMethods[selectedInvoice.invoiceNumber] ?? "Bank transfer"
    : "Bank transfer";
  const selectedInvoiceIsPaid = selectedInvoice
    ? localInvoiceStatusOverrides[selectedInvoice.invoiceNumber] === "Unpaid"
      ? false
      : localInvoiceStatusOverrides[selectedInvoice.invoiceNumber] === "Paid" ||
        Boolean(localPaidInvoices[selectedInvoice.invoiceNumber]) ||
        isPaidStatus(selectedInvoice.status)
    : false;
  const selectedInvoiceStatus = selectedInvoiceIsPaid ? "Paid" : "Pending";
  const selectedInvoiceBalance = selectedInvoice
    ? selectedInvoiceIsPaid
      ? "$0"
      : selectedBooking
        ? invoiceBalance(
            {
              amount: selectedInvoice.amount,
              status: selectedInvoice.status,
            },
            selectedBooking,
          )
        : selectedInvoice.amount
    : "$0";
  const selectedContact = customerBillingContact(customer);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStoredInvoices() {
      try {
        const response = await fetch(adminCustomerInvoicesApiPath, {
          cache: "no-store",
          headers: {
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok || !Array.isArray(result.invoices)) {
          throw new Error("Stored invoice read failed");
        }

        const customerIdKey = normalizeCustomerMatch(customer.id);
        const customerNameKey = normalizeCustomerMatch(customer.companyName);
        const invoices = (result.invoices as StoredInvoiceRecord[])
          .filter((invoice) => {
            const invoiceCustomerId = normalizeCustomerMatch(String(invoice.customerId ?? ""));
            const invoiceCustomerName = normalizeCustomerMatch(String(invoice.customerName ?? ""));

            return (
              invoiceCustomerId === customerIdKey ||
              invoiceCustomerName === customerNameKey ||
              (customerNameKey && invoiceCustomerName.includes(customerNameKey))
            );
          })
          .map((invoice) => ({
            amount: safeDisplay(invoice.amountLabel, "$0"),
            dueDate: safeDisplay(invoice.dueDateLabel, "Due date to confirm"),
            invoiceNumber: safeDisplay(invoice.invoiceNumber, ""),
            issueDate: safeDisplay(invoice.issueDateLabel, "Date to confirm"),
            lineItems: Array.isArray(invoice.lineItems) ? invoice.lineItems : [],
            route: safeDisplay(invoice.route, "Route to confirm"),
            service: safeDisplay(invoice.service, "Service"),
            status: invoice.documentState === "draft" ? "Draft" : safeDisplay(invoice.status, "Unpaid"),
          }))
          .filter((invoice) => invoice.invoiceNumber);

        setStoredInvoices(invoices);
        setStoredInvoiceMessage(
          invoices.length > 0
            ? `Loaded ${invoices.length} stored invoice${invoices.length === 1 ? "" : "s"} for this customer.`
            : "No stored invoice records matched this customer yet.",
        );

        if (!selectedInvoiceNumber && invoices[0]) {
          setSelectedInvoiceNumber(invoices[0].invoiceNumber);
        }
      } catch {
        if (!controller.signal.aborted) {
          setStoredInvoiceMessage("Stored invoice records could not be loaded; showing folder records only.");
        }
      }
    }

    void loadStoredInvoices();

    return () => controller.abort();
  }, [customer.companyName, customer.id, selectedInvoiceNumber]);

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

  function applyInvoiceStatus(invoiceNumber: string, status: "Paid" | "Unpaid") {
    setLocalInvoiceStatusOverrides((currentOverrides) => ({
      ...currentOverrides,
      [invoiceNumber]: status,
    }));
    setStoredInvoices((currentInvoices) =>
      currentInvoices.map((invoice) =>
        invoice.invoiceNumber === invoiceNumber
          ? {
              ...invoice,
              status,
            }
          : invoice,
      ),
    );
  }

  async function persistInvoiceStatus(invoiceNumber: string, status: "Paid" | "Unpaid") {
    if (!/^INV-/.test(invoiceNumber)) {
      return false;
    }

    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify({
          invoiceNumber,
          status,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const result = await response.json().catch(() => null);

      return response.ok && result?.ok;
    } catch {
      return false;
    }
  }

  async function updateInvoicePaidState(invoice: DisplayInvoice, paid: boolean) {
    const status = paid ? "Paid" : "Unpaid";
    const paymentMethod = paidInvoiceMethods[invoice.invoiceNumber] ?? "Bank transfer";

    setSelectedInvoiceNumber(invoice.invoiceNumber);
    applyInvoiceStatus(invoice.invoiceNumber, status);

    if (paid) {
      setLocalPaidInvoices((currentPaidInvoices) => ({
        ...currentPaidInvoices,
        [invoice.invoiceNumber]: paymentMethod,
      }));
    } else {
      setLocalPaidInvoices((currentPaidInvoices) => {
        const nextPaidInvoices = { ...currentPaidInvoices };

        delete nextPaidInvoices[invoice.invoiceNumber];

        return nextPaidInvoices;
      });
    }

    const persisted = await persistInvoiceStatus(invoice.invoiceNumber, status);

    setInvoiceActionMessage(
      paid
        ? `Marked ${invoice.invoiceNumber} paid by ${paymentMethod}${
            persisted ? "" : " in this customer view"
          }. Thank you message ready for ${selectedContact?.value ?? customer.companyName}.`
        : `Reversed ${invoice.invoiceNumber} to unpaid${
            persisted ? "" : " in this customer view"
          }. Balance is open again for billing follow-up.`,
    );
  }

  function preparePaymentReminder(invoice: DisplayInvoice) {
    setSelectedInvoiceNumber(invoice.invoiceNumber);
    setInvoiceActionMessage(
      `Reminder ready for ${selectedContact?.value ?? customer.companyName}: payment is pending for ${invoice.invoiceNumber}, amount ${invoice.amount}, due ${invoice.dueDate}.`,
    );
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-amber-500 border-l-[12px] border-t-8 border-t-slate-950 bg-amber-50 shadow-md"
      data-customer-invoice-rules="true"
      data-customer-invoice-folder-panel={customer.id}
      data-customer-folder-sector="invoices"
    >
      <div className="border-b border-amber-300 bg-amber-100 px-4 py-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">2 · Total invoices</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">Invoices</h2>
            <p className="mt-0.5 text-sm font-semibold text-slate-600">
              Date, invoice number, amount, balance due, and paid or pending status for this customer.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-600 sm:min-w-[28rem]">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p>Total</p>
              <p className="mt-1 text-base font-bold text-slate-950">{displayInvoices.length}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p>Paid this month</p>
              <p className="mt-1 text-base font-bold text-emerald-700">{customer.paidThisMonth}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p>Overdue</p>
              <p className="mt-1 text-base font-bold text-rose-700">{customer.overdueAmount}</p>
            </div>
          </div>
        </div>
      </div>

      <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">
        {storedInvoiceMessage}
      </p>

      <div className="max-h-72 overflow-auto bg-white" data-customer-total-invoices-scroll="true">
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
            {displayInvoices.length === 0 ? (
              <tr data-customer-invoice-folder-empty="true">
                <td className="px-4 py-5 text-sm font-semibold text-slate-600" colSpan={6}>
                  No invoice records loaded for this customer yet.
                </td>
              </tr>
            ) : null}
            {displayInvoices.map((invoice) => {
              const paidLocally = localPaidInvoices[invoice.invoiceNumber];
              const statusOverride = localInvoiceStatusOverrides[invoice.invoiceNumber];
              const isPaid =
                statusOverride === "Unpaid"
                  ? false
                  : statusOverride === "Paid" || Boolean(paidLocally) || isPaidStatus(invoice.status);
              const balance = isPaid ? "$0" : invoice.amount;
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
                  <td className="px-4 py-3 font-semibold text-slate-800">{invoice.issueDate}</td>
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
                        className={`rounded-md border px-3 py-1.5 font-bold ${
                          isPaid
                            ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                            : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                        }`}
                        data-customer-invoice-folder-mark-paid={invoice.invoiceNumber}
                        onClick={() => updateInvoicePaidState(invoice, !isPaid)}
                        type="button"
                      >
                        {isPaid ? "Mark unpaid" : "Mark paid"}
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
                {(selectedInvoice.lineItems.length > 0
                  ? selectedInvoice.lineItems
                  : [
                      {
                        amountLabel: selectedInvoice.amount,
                        description: itemDescription(customer, selectedBooking, {
                          invoiceNumber: selectedInvoice.invoiceNumber,
                        }),
                      },
                    ]).map((item, itemIndex) => (
                  <tr key={`${selectedInvoice.invoiceNumber}-${itemIndex}`}>
                    <td className="px-4 py-4 font-bold text-slate-600">{itemIndex + 1}</td>
                    <td className="px-4 py-4 font-semibold leading-6 text-slate-900">
                      {item.description || "Invoice item description pending"}
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-slate-950">
                      {item.amountLabel || selectedInvoice.amount}
                    </td>
                  </tr>
                ))}
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
                className={`min-h-9 rounded-md border px-3 text-sm font-bold ${
                  selectedInvoiceIsPaid
                    ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                    : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
                data-customer-invoice-folder-selected-mark-paid={selectedInvoice.invoiceNumber}
                onClick={() => updateInvoicePaidState(selectedInvoice, !selectedInvoiceIsPaid)}
                type="button"
              >
                {selectedInvoiceIsPaid ? "Mark unpaid" : "Mark paid + thank you"}
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

    </section>
  );
}
