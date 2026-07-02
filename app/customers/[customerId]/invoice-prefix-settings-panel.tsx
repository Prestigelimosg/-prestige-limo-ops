"use client";

import { useState } from "react";

const adminCustomerInvoicePrefixSettingsApiPath =
  "/api/admin-customer-invoice-prefix-settings";

type CustomerInvoicePrefixSettingRecord = {
  customer_account: string;
  invoice_prefix: string;
  last_reserved_invoice_number: string | null;
  next_sequence_number: number;
  number_format: "PREFIX-0001";
  prefix_locked: boolean;
  sequence_scope: "lifetime";
  sequence_status: "active" | "on_hold" | "archived";
};

type CustomerInvoicePrefixSettingsPanelProps = {
  customerAccount: string;
  suggestedPrefix: string;
};

type PrefixSettingsState = {
  message: string;
  prefixSetting: CustomerInvoicePrefixSettingRecord | null;
  status: "idle" | "loading" | "loaded" | "saving" | "error";
  tone: "error" | "info" | "success";
};

function clean(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeInitialPrefix(value: string) {
  const cleaned = clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

  return /^[A-Z0-9]{2,12}$/.test(cleaned) ? cleaned : "";
}

function feedbackClass(tone: PrefixSettingsState["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }

  return "border-sky-200 bg-sky-50 text-sky-950";
}

function prefixStatusLabel(setting: CustomerInvoicePrefixSettingRecord | null) {
  if (!setting) {
    return "Not set";
  }

  return setting.prefix_locked ? "Locked" : "Open";
}

function lockedPrefixFeedback(prefix: string | null | undefined) {
  return prefix
    ? `This customer already has locked prefix ${prefix} and it is not changeable.`
    : "This customer already has a locked prefix and it is not changeable.";
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : "";
}

export function CustomerInvoicePrefixSettingsPanel({
  customerAccount,
  suggestedPrefix,
}: CustomerInvoicePrefixSettingsPanelProps) {
  const initialPrefix = safeInitialPrefix(suggestedPrefix);
  const [prefixInput, setPrefixInput] = useState(initialPrefix);
  const [state, setState] = useState<PrefixSettingsState>({
    message: "Prefix settings are loaded only from the guarded customer folder action.",
    prefixSetting: null,
    status: "idle",
    tone: "info",
  });
  const account = clean(customerAccount);
  const prefixLocked = Boolean(state.prefixSetting?.prefix_locked);
  const prefixValid = /^[A-Z0-9]{2,12}$/.test(prefixInput);

  function updatePrefixInput(value: string) {
    setPrefixInput(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
  }

  async function fetchPrefixSetting() {
    const params = new URLSearchParams({
      customer_account: account,
    });
    const response = await fetch(
      `${adminCustomerInvoicePrefixSettingsApiPath}?${params.toString()}`,
      {
        cache: "no-store",
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      },
    );
    const result = await response.json().catch(() => null);

    if (!response.ok || result?.ok !== true) {
      throw new Error(result?.error || "prefix-load-blocked");
    }

    return (result.prefix_setting as CustomerInvoicePrefixSettingRecord | null | undefined) ?? null;
  }

  async function loadPrefixSetting() {
    if (!account) {
      setState({
        message: "Customer account is required before prefix settings can load.",
        prefixSetting: null,
        status: "error",
        tone: "error",
      });
      return;
    }

    setState((current) => ({
      ...current,
      message: `Loading prefix setting for ${account}...`,
      status: "loading",
      tone: "info",
    }));

    try {
      const prefixSetting = await fetchPrefixSetting();

      if (prefixSetting?.invoice_prefix) {
        setPrefixInput(prefixSetting.invoice_prefix);
      } else if (!prefixInput && initialPrefix) {
        setPrefixInput(initialPrefix);
      }

      setState({
        message: prefixSetting
          ? `Loaded ${prefixSetting.invoice_prefix} for ${account}.`
          : `No saved prefix yet for ${account}.`,
        prefixSetting,
        status: "loaded",
        tone: "success",
      });
    } catch {
      setState((current) => ({
        ...current,
        message: "Prefix settings could not be loaded from this customer folder.",
        status: "error",
        tone: "error",
      }));
    }
  }

  async function savePrefixSetting() {
    if (!account || !prefixValid || prefixLocked) {
      setState((current) => ({
        ...current,
        message: prefixLocked
          ? lockedPrefixFeedback(state.prefixSetting?.invoice_prefix)
          : "Enter a 2-12 character uppercase prefix before saving.",
        status: "error",
        tone: "error",
      }));
      return;
    }

    setState((current) => ({
      ...current,
      message: `Saving ${prefixInput} for ${account}...`,
      status: "saving",
      tone: "info",
    }));

    try {
      const response = await fetch(adminCustomerInvoicePrefixSettingsApiPath, {
        body: JSON.stringify({
          customer_account: account,
          invoice_prefix: prefixInput,
          safe_sequence_note:
            "Set from admin customer folder prefix settings only.",
        }),
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok !== true || !result.prefix_setting) {
        throw new Error(result?.error || "prefix-save-blocked");
      }

      const prefixSetting = result.prefix_setting as CustomerInvoicePrefixSettingRecord;

      setPrefixInput(prefixSetting.invoice_prefix);
      setState({
        message: `Saved ${prefixSetting.invoice_prefix} for ${account}.`,
        prefixSetting,
        status: "loaded",
        tone: "success",
      });
    } catch (error) {
      const message = errorMessage(error).toLowerCase();

      if (message.includes("locked")) {
        try {
          const prefixSetting = await fetchPrefixSetting();

          if (prefixSetting?.invoice_prefix) {
            setPrefixInput(prefixSetting.invoice_prefix);
          }

          setState((current) => ({
            ...current,
            message: lockedPrefixFeedback(prefixSetting?.invoice_prefix),
            prefixSetting: prefixSetting ?? current.prefixSetting,
            status: "error",
            tone: "error",
          }));
          return;
        } catch {
          setState((current) => ({
            ...current,
            message: lockedPrefixFeedback(current.prefixSetting?.invoice_prefix),
            status: "error",
            tone: "error",
          }));
          return;
        }
      }

      setState((current) => ({
        ...current,
        message: "Prefix was not saved. It may already be used by another account.",
        status: "error",
        tone: "error",
      }));
    }
  }

  return (
    <div
      className="mt-4 border-t border-slate-200 pt-4"
      data-admin-customer-invoice-prefix-settings="true"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-950">Invoice Prefix Settings</h3>
          <p
            className="mt-1 truncate text-sm font-semibold text-slate-600"
            data-admin-customer-invoice-prefix-account="true"
          >
            {account}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(9rem,1fr)_auto_auto] sm:items-end">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-slate-700">
            Prefix
            <input
              className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold uppercase tracking-normal text-slate-950 outline-none focus:border-slate-700 disabled:bg-slate-100 disabled:text-slate-500"
              data-admin-customer-invoice-prefix-input="true"
              disabled={prefixLocked || state.status === "loading" || state.status === "saving"}
              maxLength={12}
              onChange={(event) => updatePrefixInput(event.target.value)}
              value={prefixInput}
            />
          </label>
          <button
            className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 transition hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            data-admin-customer-invoice-prefix-load-action="true"
            disabled={state.status === "loading" || state.status === "saving"}
            onClick={loadPrefixSetting}
            type="button"
          >
            {state.status === "loading" ? "Loading" : "Load"}
          </button>
          <button
            className="min-h-10 rounded-md border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
            data-admin-customer-invoice-prefix-save-action="true"
            disabled={!prefixValid || prefixLocked || state.status === "loading" || state.status === "saving"}
            onClick={savePrefixSetting}
            type="button"
          >
            {state.status === "saving" ? "Saving" : "Save"}
          </button>
        </div>
      </div>

      <div
        className="mt-3 grid gap-2 text-sm sm:grid-cols-4"
        data-admin-customer-invoice-prefix-policy="true"
      >
        {[
          ["Format", "PREFIX-0001"],
          ["Sequence", "Lifetime"],
          ["Status", prefixStatusLabel(state.prefixSetting)],
          [
            "Last number",
            state.prefixSetting?.last_reserved_invoice_number || "None",
          ],
        ].map(([label, value]) => (
          <div className="min-w-0" key={label}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className="mt-1 truncate font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <p
        className={`mt-3 rounded-md border px-3 py-2 text-sm font-semibold leading-6 ${feedbackClass(
          state.tone,
        )}`}
        data-admin-customer-invoice-prefix-feedback="true"
      >
        {state.message}
      </p>
    </div>
  );
}
