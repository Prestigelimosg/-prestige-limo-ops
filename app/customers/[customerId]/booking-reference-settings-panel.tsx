"use client";

import { useState } from "react";

const settingsApiPath = "/api/admin-customer-booking-reference-settings";

type ReferenceSetting = {
  booking_prefix: string;
  customer_account: string;
  next_sequence_number: number;
  number_format: "PREFIX-00001";
  prefix_locked: true;
  sequence_status: "active" | "on_hold" | "archived";
};

type State = {
  message: string;
  setting: ReferenceSetting | null;
  status: "idle" | "loading" | "loaded" | "saving" | "error";
  tone: "error" | "info" | "success";
};

function safePrefix(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function feedbackClass(tone: State["tone"]) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-950";
  return "border-sky-200 bg-sky-50 text-sky-950";
}

export function CustomerBookingReferenceSettingsPanel({
  customerAccount,
  customerName,
}: {
  customerAccount: string;
  customerName: string;
}) {
  const suggestedPrefix = safePrefix(customerName).slice(0, 4) || "CUST";
  const [prefix, setPrefix] = useState(suggestedPrefix);
  const [state, setState] = useState<State>({
    message: "Load the saved booking prefix before changing it.",
    setting: null,
    status: "idle",
    tone: "info",
  });
  const prefixValid = /^[A-Z0-9]{2,12}$/.test(prefix);
  const prefixLocked = state.setting?.prefix_locked === true;

  async function loadSetting() {
    setState((current) => ({
      ...current,
      message: "Loading booking reference prefix...",
      status: "loading",
      tone: "info",
    }));

    try {
      const params = new URLSearchParams({ customer_account: customerAccount });
      const response = await fetch(`${settingsApiPath}?${params.toString()}`, {
        cache: "no-store",
        headers: { "x-prestige-admin-purpose": "admin-booking-persistence" },
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error || "load-failed");
      }

      const setting = (result.reference_setting as ReferenceSetting | null) ?? null;

      if (setting) setPrefix(setting.booking_prefix);
      setState({
        message: setting
          ? `${setting.booking_prefix} is locked. The next trip will be ${setting.booking_prefix}-${String(setting.next_sequence_number).padStart(5, "0")}.`
          : "No booking prefix is set. New trips currently receive a unique five-digit reference.",
        setting,
        status: "loaded",
        tone: "success",
      });
    } catch {
      setState((current) => ({
        ...current,
        message: "Booking reference prefix could not be loaded. No setting changed.",
        status: "error",
        tone: "error",
      }));
    }
  }

  async function saveSetting() {
    if (!prefixValid || prefixLocked) return;

    if (
      !window.confirm(
        `Lock booking reference prefix ${prefix} for this customer? Future trips will use ${prefix}-00001 onward. Existing trips and invoice numbers will not change.`,
      )
    ) {
      return;
    }

    setState((current) => ({
      ...current,
      message: `Saving booking prefix ${prefix}...`,
      status: "saving",
      tone: "info",
    }));

    try {
      const response = await fetch(settingsApiPath, {
        body: JSON.stringify({
          booking_prefix: prefix,
          customer_account: customerAccount,
        }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok !== true || !result.reference_setting) {
        throw new Error(result?.error || "save-failed");
      }

      const setting = result.reference_setting as ReferenceSetting;
      setPrefix(setting.booking_prefix);
      setState({
        message: `Saved and locked ${setting.booking_prefix}. Future trips start at ${setting.booking_prefix}-${String(setting.next_sequence_number).padStart(5, "0")}.`,
        setting,
        status: "loaded",
        tone: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      setState((current) => ({
        ...current,
        message: message.includes("locked")
          ? "This customer already has a locked booking prefix. Reload the saved setting."
          : message.includes("used") || message.includes("duplicate")
            ? `Prefix ${prefix} is already used by another customer.`
            : "Booking reference prefix was not saved. No setting changed.",
        status: "error",
        tone: "error",
      }));
    }
  }

  return (
    <section className="rounded-md border border-violet-200 bg-violet-50 p-3" data-customer-booking-reference-settings="true">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-950">Booking reference prefix</h2>
          <p className="mt-0.5 text-xs font-semibold text-slate-600">
            Separate from invoice numbering. Existing trip references never change.
          </p>
        </div>
        <button
          className="min-h-9 rounded-md border border-violet-300 bg-white px-3 text-xs font-bold text-violet-950 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={state.status === "loading" || state.status === "saving"}
          onClick={loadSetting}
          type="button"
        >
          {state.status === "loading" ? "Loading" : "Load prefix"}
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1 text-xs font-bold text-slate-700">
          Customer booking prefix
          <input
            className="min-h-9 rounded-md border border-violet-300 bg-white px-2 text-sm font-bold uppercase text-slate-950 disabled:bg-slate-100"
            disabled={prefixLocked || state.status === "saving"}
            maxLength={12}
            onChange={(event) => setPrefix(safePrefix(event.target.value))}
            value={prefix}
          />
        </label>
        <button
          className="min-h-9 rounded-md bg-violet-900 px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          disabled={!prefixValid || prefixLocked || state.status === "saving"}
          onClick={saveSetting}
          type="button"
        >
          {state.status === "saving" ? "Saving" : prefixLocked ? "Locked" : "Save & lock"}
        </button>
      </div>
      <p className={`mt-2 rounded-md border px-2 py-1.5 text-xs font-semibold ${feedbackClass(state.tone)}`} aria-live="polite">
        {state.message}
      </p>
    </section>
  );
}
