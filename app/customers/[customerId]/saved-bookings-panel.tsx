"use client";

import Link from "next/link";
import { useState } from "react";

const adminCustomerSavedBookingsApiPath = "/api/admin-customer-saved-bookings";

type CustomerFolderSavedBookingRecord = {
  admin_status?: string | null;
  booking_month?: string | null;
  booking_reference?: string | null;
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

function dispatchHref(booking: CustomerFolderSavedBookingRecord) {
  const reference = safeDispatchReference(booking);

  if (!reference) {
    return "";
  }

  const params = new URLSearchParams({
    booking_reference: reference,
    tab: "dispatch",
  });

  return `/?${params.toString()}`;
}

function initialMessage(customerName: string) {
  return `Load saved booking references for ${customerName} from the guarded customer-folder read path.`;
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
  const [readState, setReadState] = useState<CustomerFolderSavedBookingsState>({
    message: initialMessage(customerName),
    savedBookings: [],
    status: "idle",
    summary: null,
    tone: "info",
  });

  async function loadSavedBookings() {
    setReadState({
      message: `Loading saved booking references for ${customerName}...`,
      savedBookings: [],
      status: "loading",
      summary: null,
      tone: "info",
    });

    try {
      const params = new URLSearchParams({
        customer_account: customerName,
        customer_id: customerId,
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
        throw new Error(result?.error || "Saved booking read could not be completed.");
      }

      const savedBookings = Array.isArray(result.saved_bookings)
        ? (result.saved_bookings as CustomerFolderSavedBookingRecord[])
        : [];
      const returnedCount = Number(result.summary?.returned_count ?? savedBookings.length);

      setReadState({
        message:
          returnedCount > 0
            ? `Loaded ${countLabel(returnedCount, "saved booking reference")} for ${customerName}.`
            : `No saved booking references returned for ${customerName}.`,
        savedBookings,
        status: "loaded",
        summary: result.summary || null,
        tone: "success",
      });
    } catch (error) {
      setReadState({
        message: savedBookingReadFailureMessage(error),
        savedBookings: [],
        status: "error",
        summary: null,
        tone: "error",
      });
    }
  }

  const returnedCount = Number(readState.summary?.returned_count ?? readState.savedBookings.length);
  const matchedCount = Number(readState.summary?.matched_count ?? 0);

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
            Customer jobs
          </h2>
          <p
            className="mt-0.5 max-w-4xl text-xs font-semibold leading-5 text-slate-600"
            data-customer-folder-saved-bookings-boundary="true"
          >
            Loads this customer&apos;s saved jobs only. Open/Edit uses Dispatch; no invoice, payment, send, payout, GPS,
            or provider action runs here.
          </p>
        </div>
        <button
          className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          data-customer-folder-saved-bookings-action="true"
          disabled={readState.status === "loading"}
          onClick={loadSavedBookings}
          type="button"
        >
          {readState.status === "loading" ? "Loading" : "Load jobs"}
        </button>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        {[
          ["Customer", customerName],
          ["Jobs", countLabel(returnedCount, "loaded job")],
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

      {readState.savedBookings.length === 0 ? (
        <p
          className="mt-3 rounded-md border border-sky-100 bg-white px-3 py-2 text-sm font-semibold leading-6 text-slate-700"
          data-customer-folder-saved-bookings-empty="true"
        >
          No saved booking references loaded yet.
        </p>
      ) : null}

      {readState.status === "loaded" && readState.savedBookings.length > 0 ? (
        <div
          className="mt-3 max-h-96 overflow-auto rounded-md border border-slate-200"
          data-customer-folder-saved-bookings-list="true"
        >
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Booking</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Pickup</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Service</th>
                <th className="border-b border-slate-200 px-3 py-2 font-bold">Status</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {readState.savedBookings.map((booking) => {
                const href = dispatchHref(booking);
                const rowKey = booking.booking_reference || `${booking.customer_account}-${booking.pickup_at}`;

                return (
                  <tr
                    className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    data-customer-folder-saved-bookings-row={booking.booking_reference || ""}
                    key={rowKey}
                  >
                    <td className="px-3 py-2 font-bold text-slate-950" title={displayText(booking.booking_reference)}>
                      {compactReference(booking.booking_reference)}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-800">
                      {displayText(booking.pickup_at, "Pickup not available")}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {displayText(booking.service_type, "Service not available")}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {[booking.admin_status, booking.customer_status].filter(Boolean).join(" / ") ||
                        "Status unavailable"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {href ? (
                        <Link
                          className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-700"
                          data-customer-folder-saved-bookings-open-dispatch={booking.booking_reference || ""}
                          href={href}
                        >
                          Open/Edit
                        </Link>
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
      ) : null}
    </section>
  );
}
