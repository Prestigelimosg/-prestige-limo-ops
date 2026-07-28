"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildCustomerInvoiceActionEmail,
  formatCustomerInvoiceActionSentAt,
} from "../../../lib/customer-invoice-action-email";
import {
  calculateCustomerInvoiceRateReview,
  type CustomerInvoiceRateReview,
  type CustomerInvoiceRateSetupRecord,
} from "../../../lib/customer-dsp-invoice-review";
import {
  normalizeCustomerInvoiceDspLineTimeRange,
  parseCustomerInvoiceDspLineTimeRange,
} from "../../../lib/customer-invoice-line-description";
import type { MockCustomer, MockCustomerBooking, MockCustomerInvoice } from "../_data/mock-customers";

const adminCustomerSavedBookingsApiPath = "/api/admin-customer-saved-bookings";
const adminCustomerInvoicesApiPath = "/api/admin-customer-invoices";
const adminRateSetupApiPath = "/api/admin-rate-setup";
const customerInvoiceUpdatedEventName = "prestige:customer-invoice-updated";

type CustomerInvoiceFolderPanelProps = {
  customer: MockCustomer;
};

type PaymentMethod = "Card" | "Cash" | "Bank transfer";
type InvoiceLineItem = {
  amountLabel?: string;
  bookingReference?: string;
  description?: string;
  quantity?: number;
};
type InvoiceEditLineItem = {
  amount: string;
  bookingReference?: string;
  description: string;
  quantity: number;
};
type IssuedInvoiceDspSavedBooking = {
  booking_reference?: string | null;
  child_seat_count?: number | null;
  company_id?: number | null;
  customer_id?: number | string | null;
  extra_stop_count?: number | null;
  pickup_at?: string | null;
  service_type?: string | null;
  traveler_id?: number | null;
  vehicle_type_or_category?: string | null;
};
type IssuedInvoiceDspPricingContext = {
  booking: IssuedInvoiceDspSavedBooking;
  rateSetup: CustomerInvoiceRateSetupRecord;
};
type DisplayInvoice = {
  amount: string;
  amountCents: number;
  customerEmail?: string;
  dueDate: string;
  invoiceNumber: string;
  issueDate: string;
  lastReminderSentAt?: string | null;
  lineItems: InvoiceLineItem[];
  paidAt?: string | null;
  paymentMethod?: PaymentMethod;
  reminderSendCount: number;
  route: string;
  service: string;
  status: string;
  thankYouSentAt?: string | null;
};
type StoredInvoiceRecord = {
  amountCents?: number;
  amountLabel?: string;
  customerEmail?: string;
  customerId?: string;
  customerName?: string;
  documentType?: string;
  documentState?: string;
  dueDateLabel?: string;
  dueDateIso?: string;
  invoiceNumber?: string;
  issueDateLabel?: string;
  lastReminderSentAt?: string | null;
  lineItems?: InvoiceLineItem[];
  paidAt?: string | null;
  paymentMethod?: PaymentMethod;
  reference?: string;
  reminderSendCount?: number;
  route?: string;
  service?: string;
  status?: string;
  thankYouSentAt?: string | null;
};

type InvoiceActionMode = "payment" | "reminder" | null;
const customerInvoiceIssuedEditAction = "edit_issued_invoice";
const customerInvoiceMaximumLineItems = 4;

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
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDisplay(value: string | null | undefined, fallback: string) {
  const cleaned = String(value ?? "").trim();

  return cleaned || fallback;
}

function centsFromAmountLabel(value: string) {
  const amount = Number(value.replace(/[^0-9.]/g, ""));

  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

function amountInputFromLabel(value: string | undefined) {
  const amountCents = centsFromAmountLabel(value || "");

  return amountCents > 0 ? (amountCents / 100).toFixed(2) : "";
}

function editLineItemsFromInvoice(
  invoice: DisplayInvoice,
  fallbackDescription: string,
): InvoiceEditLineItem[] {
  const sourceItems =
    invoice.lineItems.length > 0
      ? invoice.lineItems
      : [
          {
            amountLabel: invoice.amount,
            description: fallbackDescription,
          },
        ];

  return sourceItems.map((item) => ({
    amount: amountInputFromLabel(item.amountLabel || invoice.amount),
    bookingReference: item.bookingReference,
    description: safeDisplay(item.description, "Invoice item"),
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
  }));
}

function calculateIssuedInvoiceDspLine(
  item: InvoiceEditLineItem,
  context: IssuedInvoiceDspPricingContext | undefined,
): CustomerInvoiceRateReview | null {
  const timeRange = parseCustomerInvoiceDspLineTimeRange(item.description);
  const bookingService = String(context?.booking.service_type ?? "")
    .trim()
    .toUpperCase();

  if (
    !timeRange ||
    !context ||
    !["DSP", "HOURLY"].includes(bookingService)
  ) {
    return null;
  }

  return calculateCustomerInvoiceRateReview(
    {
      actualMinutes: timeRange.actualMinutes,
      bookingType: "DSP",
      childSeatCount: context.booking.child_seat_count,
      companyId: context.booking.company_id,
      extraStopCount: context.booking.extra_stop_count,
      pickupAt: context.booking.pickup_at,
      travelerId: context.booking.traveler_id,
      vehicleType: context.booking.vehicle_type_or_category,
    },
    context.rateSetup,
  );
}

function isIssuedInvoiceDspLine(item: InvoiceEditLineItem) {
  return (
    Boolean(item.bookingReference) &&
    /^(?:DSP|HOURLY)(?:\s*\/\s*DISPOSAL)?\s*\|/i.test(
      item.description.trim(),
    )
  );
}

function issuedInvoiceDspCalculationMessage(
  billingReview: CustomerInvoiceRateReview,
) {
  const surchargeText =
    billingReview.surchargeAmountCents > 0
      ? ` plus $${(billingReview.surchargeAmountCents / 100).toFixed(2)} surcharges`
      : "";

  return (
    "DSP amount recalculated from the edited start and end time. " +
    `${billingReview.billableHours} billable hr × ` +
    `$${(billingReview.rateCents / 100).toFixed(2)}/hr${surchargeText} = ` +
    `$${(billingReview.amountCents / 100).toFixed(2)}.`
  );
}

function displayStoredInvoice(invoice: StoredInvoiceRecord): DisplayInvoice | null {
  const invoiceNumber = safeDisplay(invoice.invoiceNumber, "");

  if (!invoiceNumber) {
    return null;
  }

  const amount = safeDisplay(invoice.amountLabel, "$0");

  return {
    amount,
    amountCents: Number(invoice.amountCents) || centsFromAmountLabel(amount),
    customerEmail: invoice.customerEmail,
    dueDate: safeDisplay(invoice.dueDateLabel, "Due date to confirm"),
    invoiceNumber,
    issueDate: safeDisplay(invoice.issueDateLabel, "Date to confirm"),
    lastReminderSentAt: invoice.lastReminderSentAt,
    lineItems: Array.isArray(invoice.lineItems) ? invoice.lineItems : [],
    paidAt: invoice.paidAt,
    paymentMethod: invoice.paymentMethod,
    reminderSendCount: Number(invoice.reminderSendCount) || 0,
    route: safeDisplay(invoice.route, "Route to confirm"),
    service: safeDisplay(invoice.service, "Service"),
    status: invoice.documentState === "draft" ? "Draft" : safeDisplay(invoice.status, "Unpaid"),
    thankYouSentAt: invoice.thankYouSentAt,
  };
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
  const [invoiceActionMode, setInvoiceActionMode] = useState<InvoiceActionMode>(null);
  const [invoiceActionPending, setInvoiceActionPending] = useState(false);
  const [invoiceEditItems, setInvoiceEditItems] = useState<InvoiceEditLineItem[]>([]);
  const [invoiceEditMessage, setInvoiceEditMessage] = useState("");
  const [invoiceEditNumber, setInvoiceEditNumber] = useState("");
  const [invoiceEditPending, setInvoiceEditPending] = useState(false);
  const [invoiceEditDspPricing, setInvoiceEditDspPricing] = useState<
    Record<string, IssuedInvoiceDspPricingContext>
  >({});
  const [invoiceEditDspPricingPending, setInvoiceEditDspPricingPending] =
    useState(false);
  const [reminderRecipientEmail, setReminderRecipientEmail] = useState("");
  const [sendPaymentThankYou, setSendPaymentThankYou] = useState(true);
  const mockInvoices = useMemo<DisplayInvoice[]>(
    () =>
      customer.invoices.map((invoice) => {
        const booking = customer.bookingHistory.find((row) => row.invoiceNumber === invoice.invoiceNumber);

        return {
          amount: invoice.amount,
          amountCents: centsFromAmountLabel(invoice.amount),
          dueDate: invoice.dueDate,
          invoiceNumber: invoice.invoiceNumber,
          issueDate: invoice.dueDate,
          lineItems: [
            {
              amountLabel: invoice.amount,
              description: itemDescription(customer, booking, invoice),
            },
          ],
          reminderSendCount: 0,
          route: booking?.route || "Route to confirm",
          service: booking?.service || "Service",
          status: invoice.status,
        };
      }),
    [customer],
  );
  const displayInvoices = storedInvoices.length > 0 ? storedInvoices : mockInvoices;
  const selectedInvoice =
    displayInvoices.find((invoice) => invoice.invoiceNumber === selectedInvoiceNumber) ?? displayInvoices[0];
  const selectedBooking = customer.bookingHistory.find(
    (booking) => booking.invoiceNumber === selectedInvoice?.invoiceNumber,
  );
  const selectedPaymentMethod = selectedInvoice
    ? (paidInvoiceMethods[selectedInvoice.invoiceNumber] ?? selectedInvoice.paymentMethod ?? "Bank transfer")
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
  const selectedActionEmail =
    selectedInvoice && invoiceActionMode
      ? buildCustomerInvoiceActionEmail({
          amountCents: selectedInvoice.amountCents,
          dueDateLabel: selectedInvoice.dueDate,
          invoiceNumber: selectedInvoice.invoiceNumber,
          kind: invoiceActionMode === "reminder" ? "reminder" : "payment_thank_you",
          paymentMethod: selectedPaymentMethod,
        })
      : null;
  const invoiceEditDspCalculationBlocked = invoiceEditItems.some(
    (item) =>
      isIssuedInvoiceDspLine(item) &&
      (!parseCustomerInvoiceDspLineTimeRange(item.description) ||
        !item.bookingReference ||
        !invoiceEditDspPricing[item.bookingReference]),
  );

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
          .map(displayStoredInvoice)
          .filter((invoice): invoice is DisplayInvoice => Boolean(invoice));

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
    setInvoiceActionMode(null);
    setInvoiceEditMessage("");
    setInvoiceEditNumber("");
    setInvoiceEditItems([]);
    setInvoiceEditDspPricing({});
    setInvoiceEditDspPricingPending(false);
  }

  async function loadIssuedInvoiceDspPricing(
    editItems: InvoiceEditLineItem[],
  ) {
    const dspBookingReferences = [
      ...new Set(
        editItems
          .filter((item) =>
            Boolean(
              item.bookingReference &&
                parseCustomerInvoiceDspLineTimeRange(item.description),
            ),
          )
          .map((item) => String(item.bookingReference)),
      ),
    ];

    if (dspBookingReferences.length === 0) {
      setInvoiceEditDspPricing({});
      setInvoiceEditDspPricingPending(false);
      return;
    }

    setInvoiceEditDspPricingPending(true);
    setInvoiceEditMessage("Loading the verified DSP customer rate...");

    try {
      const rateResponsePromise = fetch(adminRateSetupApiPath, {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const bookingResponsePromises = dspBookingReferences.map(
        (bookingReference) => {
          const params = new URLSearchParams({
            booking_reference: bookingReference,
            customer_account: customer.companyName,
            customer_id: customer.id,
            limit: "1",
          });

          return fetch(
            `${adminCustomerSavedBookingsApiPath}?${params.toString()}`,
            {
              headers: {
                "x-prestige-admin-purpose": "admin-booking-persistence",
              },
              method: "GET",
            },
          );
        },
      );
      const [rateResponse, ...bookingResponses] = await Promise.all([
        rateResponsePromise,
        ...bookingResponsePromises,
      ]);
      const rateSetup = (await rateResponse.json().catch(() => null)) as
        | (CustomerInvoiceRateSetupRecord & { ok?: boolean })
        | null;

      if (!rateResponse.ok || rateSetup?.ok !== true) {
        throw new Error("Verified customer rate setup is unavailable.");
      }

      const contexts: Record<string, IssuedInvoiceDspPricingContext> = {};

      for (let index = 0; index < dspBookingReferences.length; index += 1) {
        const response = bookingResponses[index];
        const result = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              saved_bookings?: IssuedInvoiceDspSavedBooking[];
            }
          | null;
        const bookingReference = dspBookingReferences[index];
        const booking = result?.saved_bookings?.find(
          (candidate) =>
            String(candidate.booking_reference ?? "").trim() ===
              bookingReference &&
            String(candidate.customer_id ?? "").trim() ===
              String(customer.id).trim(),
        );

        if (!response.ok || result?.ok !== true || !booking) {
          throw new Error(
            `The exact saved job for ${bookingReference} is unavailable.`,
          );
        }

        contexts[bookingReference] = {
          booking,
          rateSetup,
        };
      }

      setInvoiceEditDspPricing(contexts);
      setInvoiceEditItems((currentItems) => {
        let latestReview: CustomerInvoiceRateReview | null = null;
        const nextItems = currentItems.map((item) => {
          const billingReview = item.bookingReference
            ? calculateIssuedInvoiceDspLine(
                item,
                contexts[item.bookingReference],
              )
            : null;

          if (!billingReview) {
            return item;
          }

          latestReview = billingReview;

          return {
            ...item,
            amount: (billingReview.amountCents / 100).toFixed(2),
          };
        });

        if (latestReview) {
          setInvoiceEditMessage(
            issuedInvoiceDspCalculationMessage(latestReview),
          );
        }

        return nextItems;
      });
    } catch (error) {
      setInvoiceEditDspPricing({});
      setInvoiceEditMessage(
        error instanceof Error
          ? `${error.message} The DSP invoice was not changed.`
          : "The verified DSP calculation is unavailable. The invoice was not changed.",
      );
    } finally {
      setInvoiceEditDspPricingPending(false);
    }
  }

  function beginInvoiceEdit(invoice: DisplayInvoice) {
    const editItems = editLineItemsFromInvoice(
      invoice,
      itemDescription(customer, selectedBooking, {
        invoiceNumber: invoice.invoiceNumber,
      }),
    );

    setSelectedInvoiceNumber(invoice.invoiceNumber);
    setInvoiceActionMessage("");
    setInvoiceActionMode(null);
    setInvoiceEditMessage("");
    setInvoiceEditItems(editItems);
    setInvoiceEditNumber(invoice.invoiceNumber);
    setInvoiceEditDspPricing({});
    void loadIssuedInvoiceDspPricing(editItems);
  }

  function cancelInvoiceEdit() {
    setInvoiceEditMessage("");
    setInvoiceEditItems([]);
    setInvoiceEditNumber("");
    setInvoiceEditDspPricing({});
    setInvoiceEditDspPricingPending(false);
  }

  function updateInvoiceEditItem(
    itemIndex: number,
    field: "amount" | "description",
    value: string,
  ) {
    const currentItem = invoiceEditItems[itemIndex];
    const updatedItem = currentItem
      ? {
          ...currentItem,
          [field]: value,
        }
      : null;
    const billingReview =
      field === "description" &&
      updatedItem?.bookingReference
        ? calculateIssuedInvoiceDspLine(
            updatedItem,
            invoiceEditDspPricing[updatedItem.bookingReference],
          )
        : null;

    setInvoiceEditItems((currentItems) =>
      currentItems.map((item, index) =>
        index === itemIndex
          ? {
              ...item,
              [field]: value,
              ...(billingReview
                ? {
                    amount: (billingReview.amountCents / 100).toFixed(2),
                  }
                : {}),
            }
          : item,
      ),
    );
    setInvoiceEditMessage(
      billingReview
        ? issuedInvoiceDspCalculationMessage(billingReview)
        : field === "description" &&
            updatedItem &&
            isIssuedInvoiceDspLine(updatedItem)
          ? "Enter the DSP time as 1200 - 2114 or 1200 TO 2114. The invoice was not changed."
          : "",
    );
  }

  function addInvoiceEditItem() {
    if (invoiceEditItems.length >= customerInvoiceMaximumLineItems) {
      setInvoiceEditMessage(`Invoices support up to ${customerInvoiceMaximumLineItems} line items.`);
      return;
    }

    setInvoiceEditItems((currentItems) => [
      ...currentItems,
      {
        amount: "",
        description: "",
        quantity: 1,
      },
    ]);
    setInvoiceEditMessage("");
  }

  function removeInvoiceEditItem(itemIndex: number) {
    if (invoiceEditItems.length <= 1) {
      setInvoiceEditMessage("An issued invoice must keep at least one line item.");
      return;
    }

    setInvoiceEditItems((currentItems) =>
      currentItems.filter((_, index) => index !== itemIndex),
    );
    setInvoiceEditMessage("");
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

  const applyStoredInvoice = useCallback((invoice: StoredInvoiceRecord) => {
    const displayed = displayStoredInvoice(invoice);

    if (!displayed) {
      return;
    }

    setStoredInvoices((currentInvoices) =>
      currentInvoices.map((currentInvoice) =>
        currentInvoice.invoiceNumber === displayed.invoiceNumber ? displayed : currentInvoice,
      ),
    );
    setPaidInvoiceMethods((currentMethods) =>
      displayed.paymentMethod
        ? {
            ...currentMethods,
            [displayed.invoiceNumber]: displayed.paymentMethod,
          }
          : currentMethods,
    );
  }, []);

  useEffect(() => {
    function handleCustomerInvoiceUpdated(event: Event) {
      const updatedInvoice =
        event instanceof CustomEvent &&
        event.detail &&
        typeof event.detail === "object"
          ? (event.detail.invoice as StoredInvoiceRecord | undefined)
          : undefined;
      const invoiceCustomerId = normalizeCustomerMatch(
        String(updatedInvoice?.customerId ?? ""),
      );
      const customerIdKey = normalizeCustomerMatch(customer.id);

      if (!updatedInvoice || invoiceCustomerId !== customerIdKey) {
        return;
      }

      applyStoredInvoice(updatedInvoice);
      setSelectedInvoiceNumber(String(updatedInvoice.invoiceNumber ?? ""));
      setStoredInvoiceMessage(
        `${String(updatedInvoice.invoiceNumber ?? "Invoice")} refreshed from the reviewed amended job.`,
      );
    }

    window.addEventListener(
      customerInvoiceUpdatedEventName,
      handleCustomerInvoiceUpdated,
    );

    return () =>
      window.removeEventListener(
        customerInvoiceUpdatedEventName,
        handleCustomerInvoiceUpdated,
      );
  }, [applyStoredInvoice, customer.id]);

  async function persistInvoiceStatus(invoiceNumber: string, status: "Paid" | "Unpaid", paymentMethod?: PaymentMethod) {
    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify({
          invoiceNumber,
          paymentMethod,
          status,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const result = await response.json().catch(() => null);

      return response.ok && result?.ok && result?.invoice ? (result.invoice as StoredInvoiceRecord) : null;
    } catch {
      return null;
    }
  }

  async function saveInvoiceEdit(invoice: DisplayInvoice) {
    const lineItems = invoiceEditItems.map((item) => {
      const amountCents = centsFromAmountLabel(item.amount);
      const description = normalizeCustomerInvoiceDspLineTimeRange(
        item.description,
      );

      return {
        amountCents,
        amountLabel: amountCents > 0 ? `$${(amountCents / 100).toFixed(2)}` : "",
        bookingReference: item.bookingReference,
        description,
        quantity: item.quantity,
      };
    });
    const invalidLine = lineItems.find(
      (item) => !item.description || item.description.length > 500 || !item.amountCents,
    );

    if (lineItems.length === 0 || lineItems.length > customerInvoiceMaximumLineItems || invalidLine) {
      setInvoiceEditMessage("Every line needs a description and an amount greater than $0.");
      return;
    }

    const nextAmountCents = lineItems.reduce((total, item) => total + item.amountCents, 0);
    const confirmed = window.confirm(
      `Update issued invoice ${invoice.invoiceNumber} to $${(nextAmountCents / 100).toFixed(2)}? ` +
        "This keeps the same invoice number, dates, and payment status, regenerates its PDF, and sends no email.",
    );

    if (!confirmed) {
      setInvoiceEditMessage(`${invoice.invoiceNumber} edit cancelled. Nothing was changed.`);
      return;
    }

    setInvoiceEditPending(true);
    setInvoiceEditMessage("");

    try {
      const response = await fetch(adminCustomerInvoicesApiPath, {
        body: JSON.stringify({
          action: customerInvoiceIssuedEditAction,
          customerId: customer.id,
          expectedAmountCents: invoice.amountCents,
          invoiceNumber: invoice.invoiceNumber,
          lineItems: lineItems.map(({ amountCents: _amountCents, ...lineItem }) => lineItem),
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result.invoice) {
        throw new Error(result?.error || "Issued invoice edit failed safely.");
      }

      applyStoredInvoice(result.invoice as StoredInvoiceRecord);
      setInvoiceEditItems([]);
      setInvoiceEditNumber("");
      setInvoiceActionMessage(
        `${invoice.invoiceNumber} updated. The same invoice number and payment status were kept; its PDF was regenerated and no email was sent.`,
      );
    } catch (error) {
      setInvoiceEditMessage(
        error instanceof Error ? error.message : "Issued invoice edit failed safely.",
      );
    } finally {
      setInvoiceEditPending(false);
    }
  }

  function preparePaymentReminder(invoice: DisplayInvoice) {
    setSelectedInvoiceNumber(invoice.invoiceNumber);
    setReminderRecipientEmail(
      invoice.customerEmail ||
        (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedContact?.value || "") ? selectedContact?.value || "" : ""),
    );
    setInvoiceActionMessage("");
    setInvoiceActionMode("reminder");
  }

  function prepareMarkPaid(invoice: DisplayInvoice) {
    setSelectedInvoiceNumber(invoice.invoiceNumber);
    updatePaymentMethod(
      invoice.invoiceNumber,
      paidInvoiceMethods[invoice.invoiceNumber] ?? invoice.paymentMethod ?? "Bank transfer",
    );
    setReminderRecipientEmail(
      invoice.customerEmail ||
        (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedContact?.value || "") ? selectedContact?.value || "" : ""),
    );
    setSendPaymentThankYou(true);
    setInvoiceActionMessage("");
    setInvoiceActionMode("payment");
  }

  async function sendInvoiceActionEmail(invoice: DisplayInvoice, messageKind: "payment_thank_you" | "reminder") {
    const recipientEmail = reminderRecipientEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new Error("Enter a valid recipient email before sending.");
    }

    const response = await fetch("/api/admin-customer-invoice-email", {
      body: JSON.stringify({
        invoiceNumber: invoice.invoiceNumber,
        messageKind,
        recipientEmails: [recipientEmail],
      }),
      headers: {
        "Content-Type": "application/json",
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
      method: "POST",
    });
    const result = await response.json().catch(() => null);

    if (!response.ok || !result?.ok || !result.invoice) {
      throw new Error(result?.error || "Customer invoice email failed safely.");
    }

    applyStoredInvoice(result.invoice as StoredInvoiceRecord);
  }

  async function submitPaymentReminder(invoice: DisplayInvoice) {
    setInvoiceActionPending(true);

    try {
      await sendInvoiceActionEmail(invoice, "reminder");
      setInvoiceActionMessage(
        `Reminder sent for ${invoice.invoiceNumber} to ${reminderRecipientEmail.trim().toLowerCase()}.`,
      );
      setInvoiceActionMode(null);
    } catch (error) {
      setInvoiceActionMessage(error instanceof Error ? error.message : "Payment reminder failed safely.");
    } finally {
      setInvoiceActionPending(false);
    }
  }

  async function submitMarkPaid(invoice: DisplayInvoice) {
    const paymentMethod = paidInvoiceMethods[invoice.invoiceNumber] ?? "Bank transfer";

    setInvoiceActionPending(true);

    try {
      const persisted = await persistInvoiceStatus(invoice.invoiceNumber, "Paid", paymentMethod);

      if (!persisted) {
        throw new Error(`${invoice.invoiceNumber} was not marked paid. No local-only status was kept.`);
      }

      applyStoredInvoice(persisted);
      applyInvoiceStatus(invoice.invoiceNumber, "Paid");
      setLocalPaidInvoices((currentPaidInvoices) => ({
        ...currentPaidInvoices,
        [invoice.invoiceNumber]: paymentMethod,
      }));

      if (sendPaymentThankYou) {
        try {
          await sendInvoiceActionEmail({ ...invoice, paymentMethod, status: "Paid" }, "payment_thank_you");
          setInvoiceActionMessage(
            `${invoice.invoiceNumber} marked paid by ${paymentMethod}. Payment thank-you sent to ${reminderRecipientEmail.trim().toLowerCase()}.`,
          );
        } catch (error) {
          setInvoiceActionMessage(
            `${invoice.invoiceNumber} is paid by ${paymentMethod}, but the thank-you email was not sent: ${
              error instanceof Error ? error.message : "email failed safely"
            }`,
          );
        }
      } else {
        setInvoiceActionMessage(
          `${invoice.invoiceNumber} marked paid by ${paymentMethod}. No thank-you email was sent.`,
        );
      }

      setInvoiceActionMode(null);
    } catch (error) {
      setInvoiceActionMessage(error instanceof Error ? error.message : "Payment update failed safely.");
    } finally {
      setInvoiceActionPending(false);
    }
  }

  async function markInvoiceUnpaid(invoice: DisplayInvoice) {
    if (!window.confirm(`Mark ${invoice.invoiceNumber} unpaid and reopen ${invoice.amount}?`)) {
      return;
    }

    setInvoiceActionPending(true);

    try {
      const persisted = await persistInvoiceStatus(invoice.invoiceNumber, "Unpaid");

      if (!persisted) {
        throw new Error(`${invoice.invoiceNumber} was not changed. No local-only status was kept.`);
      }

      applyStoredInvoice(persisted);
      applyInvoiceStatus(invoice.invoiceNumber, "Unpaid");
      setLocalPaidInvoices((currentPaidInvoices) => {
        const nextPaidInvoices = { ...currentPaidInvoices };

        delete nextPaidInvoices[invoice.invoiceNumber];
        return nextPaidInvoices;
      });
      setInvoiceActionMessage(`${invoice.invoiceNumber} marked unpaid. The balance is open again.`);
    } catch (error) {
      setInvoiceActionMessage(error instanceof Error ? error.message : "Unpaid status update failed safely.");
    } finally {
      setInvoiceActionPending(false);
    }
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

      <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-600">{storedInvoiceMessage}</p>

      <div className="max-h-72 overflow-auto bg-white" data-customer-total-invoices-scroll="true">
        <table
          className="w-full min-w-[760px] border-collapse text-left text-sm"
          data-customer-invoice-folder-table="true"
        >
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
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-800 hover:bg-slate-100"
                        data-customer-invoice-folder-open={invoice.invoiceNumber}
                        onClick={() => openInvoice(invoice.invoiceNumber)}
                        type="button"
                      >
                        View
                      </button>
                      <button
                        className="rounded-md border border-amber-400 bg-amber-50 px-3 py-1.5 font-bold text-amber-900 hover:bg-amber-100"
                        data-customer-invoice-folder-edit={invoice.invoiceNumber}
                        onClick={() => beginInvoiceEdit(invoice)}
                        type="button"
                      >
                        Edit
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
              <p className="mt-0.5 text-sm font-semibold text-slate-600">Only this selected invoice is shown below.</p>
            </div>
            <span
              className={`w-fit rounded-md border px-3 py-1 text-sm font-bold ${statusClass(selectedInvoiceStatus)}`}
            >
              {selectedInvoiceStatus}
            </span>
          </div>

          <div
            className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white"
            data-customer-invoice-folder-selected-item-table={selectedInvoice.invoiceNumber}
          >
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
                    ]
                ).map((item, itemIndex) => (
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

          {invoiceEditNumber === selectedInvoice.invoiceNumber ? (
            <div
              className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3"
              data-customer-invoice-folder-editor={selectedInvoice.invoiceNumber}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold text-slate-950">Edit issued invoice</p>
                  <p className="text-xs font-semibold text-slate-600">
                    Update the existing lines. The invoice number, dates, customer, and payment status stay unchanged.
                  </p>
                </div>
                <p className="text-xs font-bold text-amber-900">
                  No email is sent when saved.
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {invoiceEditItems.map((item, itemIndex) => (
                  <div
                    className="grid gap-2 rounded-md border border-amber-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
                    data-customer-invoice-folder-edit-line={itemIndex + 1}
                    key={`${selectedInvoice.invoiceNumber}-edit-${itemIndex}`}
                  >
                    <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Job / item {itemIndex + 1}
                      <textarea
                        className="mt-1 min-h-16 w-full resize-y rounded-md border border-slate-300 px-2 py-1.5 text-sm font-semibold text-slate-950"
                        data-customer-invoice-folder-edit-description={itemIndex + 1}
                        maxLength={500}
                        onChange={(event) =>
                          updateInvoiceEditItem(itemIndex, "description", event.target.value)
                        }
                        value={item.description}
                      />
                    </label>
                    <label className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      Amount (SGD)
                      <input
                        className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm font-bold text-slate-950"
                        data-customer-invoice-folder-edit-dsp-calculation={
                          item.bookingReference &&
                          calculateIssuedInvoiceDspLine(
                            item,
                            invoiceEditDspPricing[item.bookingReference],
                          )
                            ? "calculated"
                            : "manual"
                        }
                        data-customer-invoice-folder-edit-amount={itemIndex + 1}
                        inputMode="decimal"
                        onChange={(event) =>
                          updateInvoiceEditItem(itemIndex, "amount", event.target.value)
                        }
                        placeholder="0.00"
                        value={item.amount}
                      />
                    </label>
                    <button
                      className="h-9 self-end rounded-md border border-rose-300 bg-rose-50 px-3 text-xs font-bold text-rose-800 hover:bg-rose-100"
                      data-customer-invoice-folder-edit-remove={itemIndex + 1}
                      disabled={invoiceEditPending || invoiceEditItems.length <= 1}
                      onClick={() => removeInvoiceEditItem(itemIndex)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                  data-customer-invoice-folder-edit-add={selectedInvoice.invoiceNumber}
                  disabled={
                    invoiceEditPending ||
                    invoiceEditItems.length >= customerInvoiceMaximumLineItems
                  }
                  onClick={addInvoiceEditItem}
                  type="button"
                >
                  Add item
                </button>
                <div className="flex gap-2">
                  <button
                    className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800"
                    disabled={invoiceEditPending}
                    onClick={cancelInvoiceEdit}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="h-9 rounded-md border border-amber-500 bg-amber-100 px-3 text-sm font-bold text-amber-950 disabled:opacity-50"
                    data-customer-invoice-folder-edit-save={selectedInvoice.invoiceNumber}
                    disabled={
                      invoiceEditPending ||
                      invoiceEditDspPricingPending ||
                      invoiceEditDspCalculationBlocked
                    }
                    onClick={() => void saveInvoiceEdit(selectedInvoice)}
                    type="button"
                  >
                    {invoiceEditPending ? "Saving…" : "Save invoice"}
                  </button>
                </div>
              </div>
              {invoiceEditMessage ? (
                <p
                  className="mt-2 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                  data-customer-invoice-folder-edit-message="true"
                >
                  {invoiceEditMessage}
                </p>
              ) : null}
            </div>
          ) : null}
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
              {selectedInvoiceIsPaid ? (
                <>
                  <span className="inline-flex min-h-9 items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 font-bold text-emerald-800">
                    Paid ✓
                  </span>
                  {selectedInvoice.thankYouSentAt ? (
                    <span className="inline-flex min-h-9 items-center rounded-md border border-sky-300 bg-sky-50 px-3 font-bold text-sky-800">
                      Thank-you sent ✓
                    </span>
                  ) : null}
                  <button
                    className="min-h-9 rounded-md border border-rose-300 bg-rose-50 px-3 text-sm font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                    data-customer-invoice-folder-selected-mark-unpaid={selectedInvoice.invoiceNumber}
                    disabled={invoiceActionPending}
                    onClick={() => void markInvoiceUnpaid(selectedInvoice)}
                    type="button"
                  >
                    Mark unpaid
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="min-h-9 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm font-bold text-amber-900 hover:bg-amber-100"
                    data-customer-invoice-folder-selected-reminder={selectedInvoice.invoiceNumber}
                    onClick={() => preparePaymentReminder(selectedInvoice)}
                    type="button"
                  >
                    Send reminder
                  </button>
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
                    onClick={() => prepareMarkPaid(selectedInvoice)}
                    type="button"
                  >
                    Mark paid
                  </button>
                </>
              )}
            </div>
          </div>
          {invoiceActionMode === "reminder" && selectedActionEmail ? (
            <div
              className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm"
              data-customer-invoice-folder-reminder-preview={selectedInvoice.invoiceNumber}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-bold text-slate-950">Reminder email preview</p>
                <p className="font-semibold text-slate-600">Attachment: {selectedInvoice.invoiceNumber}.pdf</p>
              </div>
              <label className="mt-2 block font-bold text-slate-700">
                To
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900"
                  data-customer-invoice-folder-reminder-recipient="true"
                  onChange={(event) => setReminderRecipientEmail(event.target.value)}
                  type="email"
                  value={reminderRecipientEmail}
                />
              </label>
              <p className="mt-2">
                <strong>Subject:</strong> {selectedActionEmail.subject}
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 font-sans text-sm leading-6 text-slate-800">
                {selectedActionEmail.text}
              </pre>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  className="min-h-9 rounded-md border border-slate-300 bg-white px-3 font-bold text-slate-800"
                  disabled={invoiceActionPending}
                  onClick={() => setInvoiceActionMode(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="min-h-9 rounded-md border border-amber-400 bg-amber-100 px-3 font-bold text-amber-950 disabled:opacity-60"
                  data-customer-invoice-folder-send-reminder-email={selectedInvoice.invoiceNumber}
                  disabled={invoiceActionPending}
                  onClick={() => void submitPaymentReminder(selectedInvoice)}
                  type="button"
                >
                  {invoiceActionPending ? "Sending…" : "Send reminder email"}
                </button>
              </div>
            </div>
          ) : null}
          {invoiceActionMode === "payment" && selectedActionEmail ? (
            <div
              className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm"
              data-customer-invoice-folder-payment-confirmation={selectedInvoice.invoiceNumber}
            >
              <p className="font-bold text-slate-950">Confirm payment received</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <p>
                  <strong>Invoice:</strong> {selectedInvoice.invoiceNumber}
                  <br />
                  <strong>Amount:</strong> {selectedInvoice.amount}
                </p>
                <label className="font-bold text-slate-700">
                  Payment method
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-900"
                    data-customer-invoice-folder-payment-confirm-method="true"
                    onChange={(event) =>
                      updatePaymentMethod(selectedInvoice.invoiceNumber, event.target.value as PaymentMethod)
                    }
                    value={selectedPaymentMethod}
                  >
                    <option>Bank transfer</option>
                    <option>Card</option>
                    <option>Cash</option>
                  </select>
                </label>
              </div>
              <label className="mt-3 flex items-start gap-2 font-bold text-slate-800">
                <input
                  checked={sendPaymentThankYou}
                  className="mt-1 h-4 w-4"
                  data-customer-invoice-folder-payment-thank-you="true"
                  onChange={(event) => setSendPaymentThankYou(event.target.checked)}
                  type="checkbox"
                />
                Send payment thank-you email
              </label>
              {sendPaymentThankYou ? (
                <div className="mt-2 rounded-md border border-slate-200 bg-white p-3">
                  <label className="block font-bold text-slate-700">
                    To
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-semibold text-slate-900"
                      data-customer-invoice-folder-thank-you-recipient="true"
                      onChange={(event) => setReminderRecipientEmail(event.target.value)}
                      type="email"
                      value={reminderRecipientEmail}
                    />
                  </label>
                  <p className="mt-2">
                    <strong>Subject:</strong> {selectedActionEmail.subject}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-800">
                    {selectedActionEmail.text}
                  </pre>
                  <p className="mt-2 font-semibold text-slate-600">Attachment: {selectedInvoice.invoiceNumber}.pdf</p>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  className="min-h-9 rounded-md border border-slate-300 bg-white px-3 font-bold text-slate-800"
                  disabled={invoiceActionPending}
                  onClick={() => setInvoiceActionMode(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="min-h-9 rounded-md border border-emerald-400 bg-emerald-100 px-3 font-bold text-emerald-950 disabled:opacity-60"
                  data-customer-invoice-folder-confirm-paid={selectedInvoice.invoiceNumber}
                  disabled={invoiceActionPending}
                  onClick={() => void submitMarkPaid(selectedInvoice)}
                  type="button"
                >
                  {invoiceActionPending
                    ? "Saving…"
                    : sendPaymentThankYou
                      ? "Mark paid & send thank-you"
                      : "Mark paid only"}
                </button>
              </div>
            </div>
          ) : null}
          {invoiceActionMessage ? (
            <p
              className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900"
              data-customer-invoice-folder-action-message="true"
            >
              {invoiceActionMessage}
            </p>
          ) : null}
          {selectedInvoice.lastReminderSentAt ? (
            <p className="mt-2 text-xs font-semibold text-slate-600">
              Last reminder sent {formatCustomerInvoiceActionSentAt(selectedInvoice.lastReminderSentAt)} ·{" "}
              {selectedInvoice.reminderSendCount} total
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
