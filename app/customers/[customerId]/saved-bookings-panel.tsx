"use client";

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
      className="rounded-md border border-sky-200 bg-sky-50/70 p-3 shadow-sm"
      data-customer-folder-saved-bookings={customerId}
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-800">
            Internal staff-only / guarded read
          </p>
          <h2
            className="mt-1 text-base font-bold text-sky-950"
            data-customer-folder-saved-bookings-heading="true"
          >
            Saved Booking References
          </h2>
          <p
            className="mt-0.5 max-w-4xl text-xs font-semibold leading-5 text-sky-950"
            data-customer-folder-saved-bookings-boundary="true"
          >
            Loads safe saved booking references for this customer folder only. No booking write, invoice/PDF/payment
            action, notification/calendar action, contact detail, pricing fields, driver compensation, parser data, or
            private notes are returned.
          </p>
        </div>
        <button
          className="rounded-md border border-sky-400 bg-white px-3 py-2 text-sm font-bold text-sky-950 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
          data-customer-folder-saved-bookings-action="true"
          disabled={readState.status === "loading"}
          onClick={loadSavedBookings}
          type="button"
        >
          {readState.status === "loading" ? "Loading..." : "Load Saved Bookings"}
        </button>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Customer/account", customerName],
          ["Returned", countLabel(returnedCount, "saved booking reference")],
          ["Matched", countLabel(matchedCount, "recent admin booking")],
          ["Source", "Guarded saved-booking read; customer-folder context only."],
        ].map(([label, description]) => (
          <div
            className="rounded-md border border-sky-200 bg-white px-3 py-2 leading-5 text-slate-700"
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
        <div className="mt-3 grid gap-1.5" data-customer-folder-saved-bookings-list="true">
          {readState.savedBookings.map((booking) => (
            <div
              className="rounded-md border border-sky-200 bg-white px-3 py-2 text-sm leading-5 text-slate-700"
              data-customer-folder-saved-bookings-row={booking.booking_reference || ""}
              key={booking.booking_reference || `${booking.customer_account}-${booking.pickup_at}`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold text-slate-950">
                    {displayText(booking.booking_reference, "Saved booking reference unavailable")}
                  </p>
                  <p className="text-slate-600">
                    {[booking.booking_month, booking.service_type].filter(Boolean).join(" | ") ||
                      "Month/service unavailable"}
                  </p>
                </div>
                <p className="font-semibold text-sky-950">
                  {[booking.admin_status, booking.customer_status].filter(Boolean).join(" / ") ||
                    "Status unavailable"}
                </p>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Pickup: {displayText(booking.pickup_at, "not available")} | Account:{" "}
                {displayText(booking.customer_account, "not available")}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
