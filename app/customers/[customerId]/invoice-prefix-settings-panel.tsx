"use client";

import { useState } from "react";

const adminCustomerInvoicePrefixSettingsApiPath =
  "/api/admin-customer-invoice-prefix-settings";
const adminCustomerSavedBookingsApiPath = "/api/admin-customer-saved-bookings";

type CustomerInvoicePrefixSettingRecord = {
  booker_id: number | null;
  customer_account: string;
  invoice_prefix: string;
  last_reserved_invoice_number: string | null;
  next_sequence_number: number;
  number_format: "PREFIX-0001";
  prefix_locked: boolean;
  sequence_scope: "lifetime";
  sequence_status: "active" | "on_hold" | "archived";
  traveler_id: number | null;
};

type CustomerInvoicePrefixSettingsPanelProps = {
  customerAccount: string;
  customerId: string;
  suggestedPrefix: string;
};

type CustomerInvoicePrefixTraveler = {
  bookerId: number;
  passengerName: string;
  travelerId: number;
};

type CustomerInvoicePrefixTravelerReadRecord = {
  booker_id?: number | null;
  passenger_name?: string | null;
  traveler_id?: number | null;
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

  return /^[A-Z0-9]{2,12}$/.test(cleaned) && !["INV", "QUO", "CN"].includes(cleaned)
    ? cleaned
    : "";
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

function prefixSettingsFailureMessage(action: "load" | "save", rawError: unknown, prefix: string) {
  const message = errorMessage(rawError).toLowerCase();

  if (/locked/.test(message)) {
    return lockedPrefixFeedback(prefix);
  }

  if (/duplicate|unique|23505|already.*used|used by another|already exists/.test(message) && action === "save") {
    return `Prefix ${prefix || "this value"} is already used by another customer/account. Choose a different prefix.`;
  }

  if (/not enabled|configuration|config|client_init/.test(message)) {
    return "Invoice prefix settings are not enabled or configured on this server.";
  }

  if (/failed safely|request failed|could not be completed/.test(message)) {
    return action === "load"
      ? "Invoice prefix settings could not be loaded. Reload this customer folder and try again."
      : "Invoice prefix was not saved. No invoice number was reserved; reload this customer folder and try again.";
  }

  if (/forbidden|internal|admin|dispatcher|referer|origin|purpose|boundary|blocked/.test(message)) {
    return "Invoice prefix settings require the internal customer folder admin surface. Reload this customer folder and try again.";
  }

  if (/permission|rls|denied/.test(message)) {
    return "Invoice prefix settings were blocked by database permissions. No invoice number was reserved.";
  }

  if (/missing|required|malformed|invalid|unknown/.test(message)) {
    return "Invoice prefix details need review. Use 2-12 uppercase letters or numbers only.";
  }

  return action === "load"
    ? "Invoice prefix settings could not be loaded. Reload this customer folder and try again."
    : "Invoice prefix was not saved. No invoice number was reserved; reload this customer folder and try again.";
}

function CustomerInvoicePrefixTravelerRow({
  bookerId,
  customerAccount,
  passengerName,
  suggestedPrefix,
  travelerId,
}: {
  bookerId: number;
  customerAccount: string;
  passengerName: string;
  suggestedPrefix: string;
  travelerId: number;
}) {
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
  const prefixValid =
    /^[A-Z0-9]{2,12}$/.test(prefixInput) && !["INV", "QUO", "CN"].includes(prefixInput);

  function updatePrefixInput(value: string) {
    setPrefixInput(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
  }

  async function fetchPrefixSetting() {
    const params = new URLSearchParams({
      booker_id: String(bookerId),
      customer_account: account,
      traveler_id: String(travelerId),
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
    } catch (error) {
      setState((current) => ({
        ...current,
        message: prefixSettingsFailureMessage("load", error, prefixInput),
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
          booker_id: bookerId,
          customer_account: account,
          invoice_prefix: prefixInput,
          safe_sequence_note:
            "Set from admin customer folder prefix settings only.",
          traveler_id: travelerId,
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
        message: prefixSettingsFailureMessage("save", error, prefixInput),
        status: "error",
        tone: "error",
      }));
    }
  }

  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
      data-admin-customer-traveler-invoice-prefix="true"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-950">{passengerName}</h3>
          <p
            className="mt-0.5 truncate text-xs font-semibold text-slate-600"
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
            data-admin-customer-traveler-invoice-prefix-load="true"
            disabled={state.status === "loading" || state.status === "saving"}
            onClick={loadPrefixSetting}
            type="button"
          >
            {state.status === "loading" ? "Loading" : "Load"}
          </button>
          <button
            className="min-h-10 rounded-md border border-slate-900 bg-slate-900 px-3 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
            data-admin-customer-invoice-prefix-save-action="true"
            data-admin-customer-traveler-invoice-prefix-save="true"
            disabled={!prefixValid || prefixLocked || state.status === "loading" || state.status === "saving"}
            onClick={savePrefixSetting}
            type="button"
          >
            {state.status === "saving" ? "Saving" : "Save"}
          </button>
        </div>
      </div>

      <div
        className="mt-2 grid gap-2 text-xs sm:grid-cols-4"
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
            <p className="font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
            <p className="mt-0.5 truncate font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <p
        className={`mt-2 rounded-md border px-3 py-2 text-xs font-semibold leading-5 ${feedbackClass(
          state.tone,
        )}`}
        data-admin-customer-invoice-prefix-feedback="true"
      >
        {state.message}
      </p>
    </div>
  );
}

function verifiedTravelerRows(value: unknown): CustomerInvoicePrefixTraveler[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const travelers = new Map<number, CustomerInvoicePrefixTraveler>();

  value.forEach((rawRow) => {
    const row = rawRow as CustomerInvoicePrefixTravelerReadRecord;
    const travelerId = Number(row.traveler_id);
    const bookerId = Number(row.booker_id);
    const passengerName = clean(row.passenger_name);

    if (
      Number.isInteger(travelerId) &&
      travelerId > 0 &&
      Number.isInteger(bookerId) &&
      bookerId > 0 &&
      passengerName
    ) {
      travelers.set(travelerId, { bookerId, passengerName, travelerId });
    }
  });

  return [...travelers.values()].sort((first, second) =>
    first.passengerName.localeCompare(second.passengerName),
  );
}

export function CustomerInvoicePrefixSettingsPanel({
  customerAccount,
  customerId,
  suggestedPrefix,
}: CustomerInvoicePrefixSettingsPanelProps) {
  const [travelers, setTravelers] = useState<CustomerInvoicePrefixTraveler[]>([]);
  const [message, setMessage] = useState(
    "Load the verified travellers for this customer before assigning invoice prefixes.",
  );
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  async function loadVerifiedTravelers() {
    setStatus("loading");
    setMessage("Loading verified travellers from this customer folder...");

    try {
      const params = new URLSearchParams({
        customer_account: clean(customerAccount),
        customer_id: clean(customerId),
        limit: "200",
      });
      const response = await fetch(`${adminCustomerSavedBookingsApiPath}?${params.toString()}`, {
        cache: "no-store",
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok !== true) {
        throw new Error(result?.error || "verified-traveler-read-blocked");
      }

      const nextTravelers = verifiedTravelerRows(result.saved_bookings);

      if (nextTravelers.length === 0) {
        setTravelers([]);
        setStatus("error");
        setMessage(
          "No verified traveller identity is available in this customer folder. Invoice issue remains blocked.",
        );
        return;
      }

      setTravelers(nextTravelers);
      setStatus("loaded");
      setMessage(
        `Loaded ${nextTravelers.length} verified traveller${nextTravelers.length === 1 ? "" : "s"}. Assign one unique prefix to each traveller before invoicing.`,
      );
    } catch {
      setTravelers([]);
      setStatus("error");
      setMessage("Verified travellers could not be loaded. Invoice issue remains blocked.");
    }
  }

  return (
    <div
      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
      data-admin-customer-invoice-prefix-settings="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-950">Invoice Prefix Settings</h3>
          <p className="mt-0.5 text-xs font-semibold text-slate-600">
            One locked lifetime sequence per verified traveller. The PA email may remain shared.
          </p>
        </div>
        <button
          className="min-h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 disabled:opacity-60"
          data-admin-customer-traveler-prefix-list-load="true"
          disabled={status === "loading"}
          onClick={loadVerifiedTravelers}
          type="button"
        >
          {status === "loading" ? "Loading" : "Load travellers"}
        </button>
      </div>

      <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950">
        {message}
      </p>

      {travelers.length > 0 ? (
        <div className="mt-2 grid gap-2">
          {travelers.map((traveler) => (
            <CustomerInvoicePrefixTravelerRow
              bookerId={traveler.bookerId}
              customerAccount={customerAccount}
              key={traveler.travelerId}
              passengerName={traveler.passengerName}
              suggestedPrefix={travelers.length === 1 ? suggestedPrefix : ""}
              travelerId={traveler.travelerId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
