"use client";

import Link from "next/link";
import { useState } from "react";

const adminCustomerSavedBookingsApiPath = "/api/admin-customer-saved-bookings";

type CustomerFolderSavedBookingRecord = {
  admin_status?: string | null;
  booking_month?: string | null;
  booking_reference?: string | null;
  customer_price_label?: string | null;
  customer_account?: string | null;
  customer_id?: string | null;
  customer_status?: string | null;
  pickup_at?: string | null;
  service_type?: string | null;
};

type CustomerFolderSavedBookingsState = {
  message: string;
  savedBookings: CustomerFolderSavedBookingRecord[];
  status: "idle" | "loading" | "loaded" | "error";
  summary: {
    matched_count?: number | null;
    recent_read_count?: number | null;
    returned_count?: number | null;
  } | null;
  tone: "error" | "info" | "success";
};

type CustomerFolderSavedBookingsPanelProps = {
  customerId: string;
  customerName: string;
};

function feedbackClass(tone: CustomerFolderSavedBookingsState["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }

  return "border-sky-200 bg-sky-50 text-sky-950";
}

function countLabel(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function displayText(value: string | null | undefined, fallback = "Not available") {
  const cleaned = String(value ?? "").trim();

  return cleaned || fallback;
}

function compactReference(value: string | null | undefined, fallback = "Reference unavailable") {
  const text = displayText(value, fallback);

  return text.length > 18 ? `${text.slice(0, 8)}...${text.slice(-6)}` : text;
}

function safeDispatchReference(booking: CustomerFolderSavedBookingRecord) {
  const reference = String(booking.booking_reference ?? "").trim();

  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(reference) ? reference : "";
}

function customerWorkspaceHref(
  booking: CustomerFolderSavedBookingRecord,
  customerId: string,
  customerName: string,
  action: "edit" | "delete" | "open",
) {
  const reference = safeDispatchReference(booking);

  if (!reference) {
    return "";
  }

  const params = new URLSearchParams({
    booking_reference: reference,
    customer_id: customerId,
    customer_job_action: action,
    customer_name: customerName,
  });

  return `/customers?${params.toString()}`;
}

function customerDispatchEditHref(
  booking: CustomerFolderSavedBookingRecord,
  customerId: string,
  customerName: string,
) {
  const reference = safeDispatchReference(booking);

  if (!reference) {
    return "";
  }

  const returnParams = new URLSearchParams({ name: customerName });
  const params = new URLSearchParams({
    booking_reference: reference,
    customer_return_url: `/customers/${encodeURIComponent(customerId)}?${returnParams.toString()}`,
    tab: "dispatch",
  });

  return `/?${params.toString()}`;
}

function isClearlyBilledOrClosedJob(booking: CustomerFolderSavedBookingRecord) {
  const statusText = [booking.admin_status, booking.customer_status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(invoice|invoiced|billed|paid|cancelled|canceled|declined|rejected|void|deleted)\b/.test(
    statusText,
  );
}

function initialMessage(customerName: string) {
  return `Load saved jobs not clearly billed or closed for ${customerName}.`;
}

function customerFolderFakeUnbilledJobs(customerId: string, customerName: string) {
  if (!/ritz\s+carlton/i.test(customerName)) {
    return [];
  }

  return [
    {
      admin_status: "Fake test unbilled",
      booking_month: "2026-07",
      booking_reference: "FAKE-RITZ-0001",
      customer_price_label: "$420.00",
      customer_account: customerName,
      customer_id: customerId,
      customer_status: "Ready for billing test",
      pickup_at: "2026-07-10 09:00",
      service_type: "MNG / Arrival",
    },
    {
      admin_status: "Fake test unbilled",
      booking_month: "2026-07",
      booking_reference: "FAKE-RITZ-0002",
      customer_price_label: "$420.00",
      customer_account: customerName,
      customer_id: customerId,
      customer_status: "Ready for billing test",
      pickup_at: "2026-07-11 14:30",
      service_type: "TRF / Transfer",
    },
    {
      admin_status: "Fake test unbilled",
      booking_month: "2026-07",
      booking_reference: "FAKE-RITZ-0003",
      customer_price_label: "$420.00",
      customer_account: customerName,
      customer_id: customerId,
      customer_status: "Ready for billing test",
      pickup_at: "2026-07-12 23:15",
      service_type: "DSP / Hourly",
    },
  ] satisfies CustomerFolderSavedBookingRecord[];
}

function savedBookingReadFailureMessage(rawError: unknown) {
  const message = rawError instanceof Error ? rawError.message.toLowerCase() : String(rawError ?? "").toLowerCase();

  if (/not enabled|configuration|config|client_init/.test(message)) {
    return "Saved booking references are not enabled or configured on this server.";
  }

  if (/failed safely|request failed|could not be completed/.test(message)) {
    return "Saved booking references could not be loaded right now. Reload this customer folder and try again.";
  }

  if (/forbidden|internal|admin|dispatcher|referer|origin|purpose|boundary|blocked/.test(message)) {
    return "Saved booking references require the internal customer folder admin surface. Reload this customer folder and try again.";
  }

  if (/permission|rls|denied/.test(message)) {
    return "Saved booking references were blocked by database permissions. No booking, invoice, payment, or provider action ran.";
  }

  if (/missing|required|malformed|invalid|unknown/.test(message)) {
    return "Saved booking reference details need review before this customer folder can load them.";
  }

  return "Saved booking references could not be loaded right now. Reload this customer folder and try again.";
}

export function CustomerFolderSavedBookingsPanel({
  customerId,
  customerName,
}: CustomerFolderSavedBookingsPanelProps) {
  const [selectedReferences, setSelectedReferences] = useState<Record<string, boolean>>({});
  const [readState, setReadState] = useState<CustomerFolderSavedBookingsState>({
    message: initialMessage(customerName),
    savedBookings: [],
    status: "idle",
    summary: null,
    tone: "info",
  });

  async function loadSavedBookings() {
    setReadState({
      message: `Loading saved jobs for ${customerName}...`,
      savedBookings: [],
      status: "loading",
      summary: null,
      tone: "info",
    });

    try {
      const params = new URLSearchParams({
        customer_account: customerName,
        customer_id: customerId,
        limit: "25",
      });
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

      const savedBookings = Array.isArray(result.saved_bookings)
        ? (result.saved_bookings as CustomerFolderSavedBookingRecord[])
        : [];
      const fakeFallbackJobs = savedBookings.length === 0 ? customerFolderFakeUnbilledJobs(customerId, customerName) : [];
      const displaySavedBookings = savedBookings.length > 0 ? savedBookings : fakeFallbackJobs;
      const returnedCount = Number(result.summary?.returned_count ?? savedBookings.length);

      setReadState({
        message:
          fakeFallbackJobs.length > 0
            ? `Loaded ${countLabel(fakeFallbackJobs.length, "fake unbilled job")} for UI testing only. No booking, invoice, payment, send, payout, GPS, provider, or Supabase record was created.`
            : returnedCount > 0
            ? `Loaded ${countLabel(returnedCount, "saved job")} for ${customerName}.`
            : `No saved jobs returned for ${customerName}.`,
        savedBookings: displaySavedBookings,
        status: "loaded",
        summary: fakeFallbackJobs.length > 0
          ? {
              matched_count: fakeFallbackJobs.length,
              recent_read_count: 0,
              returned_count: fakeFallbackJobs.length,
            }
          : result.summary || null,
        tone: "success",
      });
    } catch (error) {
      const fakeFallbackJobs = customerFolderFakeUnbilledJobs(customerId, customerName);

      if (fakeFallbackJobs.length > 0) {
        setReadState({
          message: `Saved booking read was unavailable, so ${countLabel(fakeFallbackJobs.length, "fake unbilled job")} loaded for UI testing only. No booking, invoice, payment, send, payout, GPS, provider, or Supabase record was created.`,
          savedBookings: fakeFallbackJobs,
          status: "loaded",
          summary: {
            matched_count: fakeFallbackJobs.length,
            recent_read_count: 0,
            returned_count: fakeFallbackJobs.length,
          },
          tone: "success",
        });
        return;
      }

      setReadState({
        message: savedBookingReadFailureMessage(error),
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
    }
  }

  const unbilledSavedBookings = readState.savedBookings.filter(
    (booking) => !isClearlyBilledOrClosedJob(booking),
  );
  const selectedUnbilledBookings = unbilledSavedBookings.filter((booking) => {
    const reference = safeDispatchReference(booking);

    return reference && selectedReferences[reference];
  });
  const matchedCount = Number(readState.summary?.matched_count ?? 0);
  const firstSelectedBooking = selectedUnbilledBookings[0] ?? null;
  const createInvoiceHref = firstSelectedBooking
    ? customerWorkspaceHref(firstSelectedBooking, customerId, customerName, "open") +
      `&customer_invoice_action=create&selected_booking_references=${encodeURIComponent(
        selectedUnbilledBookings.map((booking) => safeDispatchReference(booking)).filter(Boolean).join(","),
      )}`
    : "";

  function toggleSelectedBooking(booking: CustomerFolderSavedBookingRecord, selected: boolean) {
    const reference = safeDispatchReference(booking);

    if (!reference) {
      return;
    }

    setSelectedReferences((current) => ({
      ...current,
      [reference]: selected,
    }));
  }

  return (
    <section
      className="rounded-md border border-slate-200 bg-white p-3 shadow-sm"
      data-customer-folder-saved-bookings={customerId}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2
            className="text-base font-bold text-slate-950"
            data-customer-folder-saved-bookings-heading="true"
          >
            Jobs not billed yet
          </h2>
          <p
            className="mt-0.5 max-w-4xl text-xs font-semibold leading-5 text-slate-600"
            data-customer-folder-saved-bookings-boundary="true"
          >
            Shows saved jobs not clearly billed, paid, cancelled, or closed. Edit and Delete open the exact job in the
            existing guarded customer workspace; no invoice, payment, send, payout, GPS, or provider action runs here.
          </p>
        </div>
        <button
          className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          data-customer-folder-saved-bookings-action="true"
          disabled={readState.status === "loading"}
          onClick={loadSavedBookings}
          type="button"
        >
          {readState.status === "loading" ? "Loading" : "Load unbilled jobs"}
        </button>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        {[
          ["Customer", customerName],
          ["Jobs not billed", countLabel(unbilledSavedBookings.length, "job")],
          ["Matched", countLabel(matchedCount, "recent admin record")],
        ].map(([label, description]) => (
          <div
            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 leading-5 text-slate-700"
            data-customer-folder-saved-bookings-summary={label}
            key={label}
          >
            <p className="font-bold text-slate-950">{label}</p>
            <p className="mt-1">{description}</p>
          </div>
        ))}
      </div>

      <p
        className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold leading-5 ${feedbackClass(
          readState.tone,
        )}`}
        data-customer-folder-saved-bookings-note="true"
      >
        {readState.message}
      </p>

      {readState.status === "loaded" && unbilledSavedBookings.length === 0 ? (
        <p
          className="mt-3 rounded-md border border-sky-100 bg-white px-3 py-2 text-sm font-semibold leading-6 text-slate-700"
          data-customer-folder-saved-bookings-empty="true"
        >
          No unbilled saved jobs returned for this customer.
        </p>
      ) : null}

      {readState.status === "loaded" && unbilledSavedBookings.length > 0 ? (
        <div className="mt-3" data-customer-folder-saved-bookings-list="true">
          <div className="mb-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold text-slate-700">
              {selectedUnbilledBookings.length} selected for new invoice
            </p>
            {createInvoiceHref ? (
              <Link
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-700"
                data-customer-folder-create-invoice-selected="true"
                href={createInvoiceHref}
              >
                Create invoice
              </Link>
            ) : (
              <button
                className="inline-flex min-h-9 cursor-not-allowed items-center justify-center rounded-md border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-400"
                data-customer-folder-create-invoice-selected-disabled="true"
                disabled
                type="button"
              >
                Create invoice
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Select</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Booking</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Pickup</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Service</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {unbilledSavedBookings.map((booking) => {
                const editHref = customerDispatchEditHref(booking, customerId, customerName);
                const deleteHref = customerWorkspaceHref(booking, customerId, customerName, "delete");
                const createSingleInvoiceHref =
                  customerWorkspaceHref(booking, customerId, customerName, "open") +
                  `&customer_invoice_action=create&selected_booking_references=${encodeURIComponent(
                    safeDispatchReference(booking),
                  )}`;
                const bookingReference = safeDispatchReference(booking);
                const rowKey = booking.booking_reference || `${booking.customer_account}-${booking.pickup_at}`;

                return (
                  <tr
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    data-customer-folder-saved-bookings-row={booking.booking_reference || ""}
                    key={rowKey}
                  >
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Select ${displayText(booking.booking_reference)}`}
                        checked={Boolean(bookingReference && selectedReferences[bookingReference])}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900"
                        data-customer-folder-saved-bookings-select={booking.booking_reference || ""}
                        disabled={!bookingReference}
                        onChange={(event) => toggleSelectedBooking(booking, event.target.checked)}
                        type="checkbox"
                      />
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-950" title={displayText(booking.booking_reference)}>
                      {compactReference(booking.booking_reference)}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {displayText(booking.pickup_at, "Pickup not available")}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <span>{displayText(booking.service_type, "Service not available")}</span>
                      {booking.customer_price_label ? (
                        <span
                          className="ml-2 inline-flex min-h-7 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-950"
                          data-customer-folder-saved-bookings-price={booking.booking_reference || ""}
                        >
                          {booking.customer_price_label}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editHref && deleteHref ? (
                        <div className="inline-flex flex-wrap justify-end gap-1">
                          <Link
                            className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 transition hover:bg-slate-100"
                            data-customer-folder-saved-bookings-edit={booking.booking_reference || ""}
                            href={editHref}
                          >
                            Edit
                          </Link>
                          <Link
                            className="inline-flex min-h-8 items-center rounded-md border border-rose-200 bg-white px-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                            data-customer-folder-saved-bookings-delete={booking.booking_reference || ""}
                            href={deleteHref}
                          >
                            Delete
                          </Link>
                          <Link
                            className="inline-flex min-h-8 items-center rounded-md border border-slate-900 bg-slate-900 px-2 text-xs font-bold text-white transition hover:bg-slate-700"
                            data-customer-folder-saved-bookings-create-invoice={booking.booking_reference || ""}
                            href={createSingleInvoiceHref}
                          >
                            Invoice
                          </Link>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400">No reference</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
