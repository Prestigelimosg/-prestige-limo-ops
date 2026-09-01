"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CustomerAccountDangerZone } from "./customer-account-danger-zone";
import { CustomerVerifiedIdentitiesEditor } from "./customer-verified-identities-editor";

const adminCompanyIdentityApiPath = "/api/admin-companies-crm-identity";
const adminCustomerAccountsApiPath = "/api/admin-customer-accounts";
const adminRateSetupApiPath = "/api/admin-rate-setup";
const createBookerValue = "create-new-booker";

type CustomerCompanyProfileEditorProps = {
  customerId: string;
  customerName: string;
};

type CompanyProfile = {
  accounts_email: string;
  billing_address: string;
  billing_email: string;
  company_name: string;
  domain: string;
  guest_account_billing_enabled: boolean;
  id: number | null;
  main_phone: string;
  mobile_phone: string;
  operations_email: string;
  primary_contact_name: string;
  website: string;
};

type BookerProfile = {
  booker_name: string;
  company_id: number;
  customer_id: number | null;
  email: string;
  id: number;
  phone: string;
};

type CompanyOption = { id: number; name: string };

type EditorStatus = "idle" | "loading" | "ready" | "saving" | "saved" | "error";
type ProfileMode = "create" | "edit";

function feedbackClass(status: EditorStatus) {
  if (status === "error") {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }

  if (status === "saved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-950";
  }

  return "border-sky-200 bg-sky-50 text-sky-950";
}

function safeErrorMessage(rawError: unknown) {
  const message = rawError instanceof Error ? rawError.message : String(rawError ?? "");
  const normalized = message.toLowerCase();

  if (/write gate|not configured|configuration|server/.test(normalized)) {
    return "Customer profile saving is not enabled on this server yet. No customer record was changed.";
  }

  if (/forbidden|admin|dispatcher|session|boundary|blocked/.test(normalized)) {
    return "Customer profile editing requires the internal admin session. No customer record was changed.";
  }

  if (/not found|no company/.test(normalized)) {
    return "No company CRM profile was found for this customer. No customer record was changed.";
  }

  if (/changed while|stale|conflict/.test(normalized)) {
    return "This exact Customer, Company or Booker changed while the profile was open. Reload before saving; nothing was overwritten.";
  }

  if (/saved but.*reload|authoritative title/.test(normalized)) {
    return "The exact Company + Booker profile saved, but its authoritative title could not be reloaded. Reload this profile before editing again.";
  }

  return "Customer profile could not be loaded or saved. No customer record was changed.";
}

function profileValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveProfileId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function blankCreateProfile(customerName: string, guestAccountBillingEnabled: boolean): CompanyProfile {
  return {
    accounts_email: "",
    billing_address: "",
    billing_email: "",
    company_name: customerName,
    domain: "",
    guest_account_billing_enabled: guestAccountBillingEnabled,
    id: null,
    main_phone: "",
    mobile_phone: "",
    operations_email: "",
    primary_contact_name: "",
    website: "",
  };
}

function blankBookerProfile(companyId: number): BookerProfile {
  return {
    booker_name: "",
    company_id: companyId,
    customer_id: null,
    email: "",
    id: 0,
    phone: "",
  };
}

function normalizedBooker(value: unknown): BookerProfile | null {
  const row = value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const id = positiveProfileId(row.id);
  const companyId = positiveProfileId(row.company_id);

  return id && companyId
    ? {
        booker_name: profileValue(row.booker_name),
        company_id: companyId,
        customer_id: positiveProfileId(row.customer_id),
        email: profileValue(row.email).toLowerCase(),
        id,
        phone: profileValue(row.phone),
      }
    : null;
}

function companyProfileSnapshot(profile: CompanyProfile) {
  return {
    accounts_email: profile.accounts_email.trim().toLowerCase() || null,
    billing_address: profile.billing_address.trim() || null,
    billing_email: profile.billing_email.trim().toLowerCase() || null,
    company_name: profile.company_name.replace(/\s+/g, " ").trim(),
    domain: profile.domain.trim().toLowerCase() || null,
    main_phone: profile.main_phone.trim() || null,
    mobile_phone: profile.mobile_phone.trim() || null,
    operations_email: profile.operations_email.trim().toLowerCase() || null,
    primary_contact_name: profile.primary_contact_name.trim() || null,
    website: profile.website.trim().toLowerCase() || null,
  };
}

function companyProfileFromRecord(value: unknown): CompanyProfile | null {
  const company = value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const id = positiveProfileId(company.id);

  return id
    ? {
        accounts_email: profileValue(company.accounts_email),
        billing_address: profileValue(company.billing_address),
        billing_email: profileValue(company.billing_email),
        company_name: profileValue(company.company_name),
        domain: profileValue(company.domain),
        guest_account_billing_enabled: false,
        id,
        main_phone: profileValue(company.main_phone),
        mobile_phone: profileValue(company.mobile_phone),
        operations_email: profileValue(company.operations_email),
        primary_contact_name: profileValue(company.primary_contact_name),
        website: profileValue(company.website),
      }
    : null;
}

function bookerProfileSnapshot(profile: BookerProfile) {
  return {
    booker_name: profile.booker_name.replace(/\s+/g, " ").trim(),
    email: profile.email.trim().toLowerCase() || null,
    phone: profile.phone.trim() || null,
  };
}

async function loadCompanyProfileById(companyId: number) {
  const params = new URLSearchParams();
  params.set("id", String(companyId));
  const response = await fetch(`${adminCompanyIdentityApiPath}?${params.toString()}`, {
    cache: "no-store",
    headers: {
      "x-prestige-admin-purpose": "admin-booking-persistence",
    },
    method: "GET",
  });
  const result = await response.json().catch(() => null);

  return { response, result };
}

export function CustomerCompanyProfileEditor({
  customerId,
  customerName,
}: CustomerCompanyProfileEditorProps) {
  const router = useRouter();
  const [status, setStatus] = useState<EditorStatus>("idle");
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loadedProfile, setLoadedProfile] = useState<CompanyProfile | null>(null);
  const [profileMode, setProfileMode] = useState<ProfileMode>("edit");
  const [customerFolderName, setCustomerFolderName] = useState(customerName.trim());
  const [loadedCustomerFolderName, setLoadedCustomerFolderName] = useState(customerName.trim());
  const [accountTitle, setAccountTitle] = useState("Customer account · Requires editing");
  const [booker, setBooker] = useState<BookerProfile | null>(null);
  const [loadedBooker, setLoadedBooker] = useState<BookerProfile | null>(null);
  const [bookerOptions, setBookerOptions] = useState<BookerProfile[]>([]);
  const [availableBookers, setAvailableBookers] = useState<BookerProfile[]>([]);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [companySelection, setCompanySelection] = useState("create-new-company");
  const [bookerSelection, setBookerSelection] = useState(createBookerValue);
  const [identityDraftDirty, setIdentityDraftDirty] = useState(false);
  const handleIdentityDraftDirtyChange = useCallback((dirty: boolean) => {
    setIdentityDraftDirty(dirty);
  }, []);

  const loadAccountTitle = useCallback(async () => {
    const params = new URLSearchParams({ customer_id: customerId, limit: "1" });
    const response = await fetch(`${adminCustomerAccountsApiPath}?${params.toString()}`, {
      cache: "no-store",
      headers: { "x-prestige-admin-purpose": "admin-booking-persistence" },
      method: "GET",
    });
    const result = await response.json().catch(() => null);
    const account = Array.isArray(result?.accounts) ? result.accounts[0] : null;

    if (response.ok && result?.ok && String(account?.customer_id || "") === customerId) {
      const title = profileValue(account.customer_account) || "Customer account · Requires editing";
      setAccountTitle(title);
      return title;
    }

    return null;
  }, [customerId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadAccountTitle(), 0);

    return () => window.clearTimeout(timeout);
  }, [loadAccountTitle]);

  function configureBookerForCompany(companyId: number, candidates = availableBookers) {
    const exactLinked = candidates.filter(
      (candidate) =>
        candidate.company_id === companyId &&
        candidate.customer_id === positiveProfileId(customerId),
    );

    if (exactLinked.length > 1) {
      throw new Error("More than one exact Booker is linked to this Customer.");
    }

    if (exactLinked.length === 1) {
      setBooker(exactLinked[0]);
      setLoadedBooker(exactLinked[0]);
      setBookerOptions([exactLinked[0]]);
      setBookerSelection(String(exactLinked[0].id));
      return;
    }

    const available = candidates.filter(
      (candidate) => candidate.company_id === companyId && candidate.customer_id === null,
    );
    setBookerOptions(available);
    setLoadedBooker(null);
    setBooker(blankBookerProfile(companyId));
    setBookerSelection(createBookerValue);
  }

  async function chooseCompany(value: string) {
    setCompanySelection(value);

    if (value === "create-new-company") {
      setProfile(blankCreateProfile("", false));
      setLoadedProfile(null);
      setProfileMode("create");
      setBooker(blankBookerProfile(0));
      setLoadedBooker(null);
      setBookerOptions([]);
      setBookerSelection(createBookerValue);
      return;
    }

    const companyId = positiveProfileId(value);

    if (!companyId) {
      return;
    }

    setStatus("loading");
    setMessage("Loading the selected exact Company...");
    const { response, result } = await loadCompanyProfileById(companyId);
    const nextProfile = companyProfileFromRecord(result?.company);

    if (!response.ok || result?.ok !== true || !nextProfile || nextProfile.id !== companyId) {
      setMessage("Selected Company could not be loaded safely. Nothing was changed.");
      setStatus("error");
      return;
    }

    setProfile(nextProfile);
    setLoadedProfile(nextProfile);
    setProfileMode("edit");
    configureBookerForCompany(companyId);
    setMessage("Company selected explicitly. Select an unlinked Booker or create one explicitly.");
    setStatus("ready");
  }

  async function openProfileEditor() {
    setIdentityDraftDirty(false);
    setStatus("loading");
    setMessage("Loading customer company profile...");

    try {
      const accountParams = new URLSearchParams({ customer_id: customerId, limit: "1" });
      const accountResponse = await fetch(`${adminCustomerAccountsApiPath}?${accountParams.toString()}`, {
        cache: "no-store",
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const accountResult = await accountResponse.json().catch(() => null);
      const account = Array.isArray(accountResult?.accounts) ? accountResult.accounts[0] : null;

      if (!accountResponse.ok || !accountResult?.ok || String(account?.customer_id || "") !== customerId) {
        throw new Error("Exact customer account classification could not be loaded safely.");
      }

      const exactCustomerFolderName = profileValue(account.customer_directory_label);

      if (!exactCustomerFolderName) {
        throw new Error("Exact customer folder name could not be loaded safely.");
      }

      setCustomerFolderName(exactCustomerFolderName);
      setLoadedCustomerFolderName(exactCustomerFolderName);
      const rateResponse = await fetch(adminRateSetupApiPath, {
        cache: "no-store",
        headers: { "x-prestige-admin-purpose": "admin-booking-persistence" },
        method: "GET",
      });
      const rateResult = await rateResponse.json().catch(() => null);
      const allBookers = Array.isArray(rateResult?.bookers)
        ? rateResult.bookers.map(normalizedBooker).filter((value: BookerProfile | null): value is BookerProfile => Boolean(value))
        : [];
      const allCompanies: CompanyOption[] = Array.isArray(rateResult?.companies)
        ? rateResult.companies.flatMap((value: unknown) => {
            const row = value !== null && typeof value === "object" && !Array.isArray(value)
              ? (value as Record<string, unknown>)
              : {};
            const id = positiveProfileId(row.id);
            const name = profileValue(row.company_name);

            return id && name ? [{ id, name }] : [];
          })
        : [];

      if (!rateResponse.ok || rateResult?.ok !== true) {
        throw new Error("Verified Booker list could not be loaded safely.");
      }

      setAvailableBookers(allBookers);
      setCompanyOptions(allCompanies);

      const verifiedCompanyId = positiveProfileId(account.verified_company_id);

      if (!verifiedCompanyId) {
        setProfile(blankCreateProfile("", false));
        setLoadedProfile(null);
        setBooker(blankBookerProfile(0));
        setLoadedBooker(null);
        setBookerOptions([]);
        setBookerSelection(createBookerValue);
        setCompanySelection("create-new-company");
        setProfileMode("create");
        setMessage("This Customer requires an explicit Company and Booker. Enter both; nothing was inferred from the old folder, passenger, Traveller or contact text.");
        setStatus("ready");
        return;
      }

      const { response, result } = await loadCompanyProfileById(verifiedCompanyId);
      const company = result?.company;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Customer company profile lookup failed safely.");
      }

      if (!company) {
        throw new Error("Verified company CRM profile could not be loaded safely.");
      }

      if (!Number.isSafeInteger(Number(company.id)) || Number(company.id) <= 0) {
        throw new Error("Customer company profile returned an invalid record id.");
      }

      if (verifiedCompanyId && Number(company.id) !== verifiedCompanyId) {
        throw new Error("Verified company CRM profile identity did not match safely.");
      }

      const loadedCompanyProfile = companyProfileFromRecord(company);

      if (!loadedCompanyProfile) {
        throw new Error("Verified company CRM profile could not be loaded safely.");
      }
      setProfile(loadedCompanyProfile);
      setLoadedProfile(loadedCompanyProfile);
      configureBookerForCompany(Number(company.id), allBookers);
      setCompanySelection(String(company.id));
      setProfileMode("edit");
      setMessage(
        allBookers.some(
          (candidate: BookerProfile) =>
            candidate.company_id === Number(company.id) &&
            candidate.customer_id === positiveProfileId(customerId),
        )
          ? `Editing the exact Company + Booker profile for ${String(company.company_name || customerName).trim()}.`
          : "Company loaded. Select an unlinked Booker or create one explicitly; Traveller is optional.",
      );
      setStatus("ready");
    } catch (error) {
      setMessage(safeErrorMessage(error));
      setStatus("error");
    }
  }

  async function saveProfile() {
    if (!profile || !booker) {
      return;
    }

    if (identityDraftDirty) {
      setMessage(
        "Traveller changes are not saved yet. Save or cancel the Traveller draft first.",
      );
      setStatus("error");
      const identitySaveButton = document.querySelector<HTMLButtonElement>(
        '[data-customer-save-booker-traveler="true"]',
      );
      identitySaveButton?.scrollIntoView({ behavior: "smooth", block: "center" });
      identitySaveButton?.focus();
      return;
    }

    const companyName = profile.company_name.trim();
    const normalizedCustomerFolderName = customerFolderName.replace(/\s+/g, " ").trim();
    const safeBookerName = booker.booker_name.replace(/\s+/g, " ").trim();
    const selectedBookerId = bookerSelection === createBookerValue
      ? null
      : positiveProfileId(bookerSelection);

    if (!companyName) {
      setMessage("Company name is required before saving.");
      setStatus("error");
      return;
    }

    if (!safeBookerName) {
      setMessage("Booker / PA name is required. Traveller remains optional.");
      setStatus("error");
      return;
    }

    if (!normalizedCustomerFolderName || normalizedCustomerFolderName.length > 120) {
      setMessage("Customer folder name is required and must be 120 characters or fewer.");
      setStatus("error");
      return;
    }

    if (
      !window.confirm(
        `Save the exact Company + Booker profile ${companyName} (${safeBookerName})? Customer folder, Company and Booker changes save together. Traveller is optional. This does not change any booking, passenger, Traveller, invoice, monthly billing, access, Calendar, message, notification, push, Driver, rate, payment or provider.`,
      )
    ) {
      setMessage("Profile save cancelled. No customer record was changed.");
      setStatus("ready");
      return;
    }

    setStatus("saving");
    setMessage(`Saving the exact Company + Booker profile for ${companyName}...`);

    try {
      const accountResponse = await fetch(adminCustomerAccountsApiPath, {
        body: JSON.stringify({
          action_type: "customer_company_booker_profile_overwrite",
          booker_id: selectedBookerId,
          booker_profile: bookerProfileSnapshot(booker),
          company_id: profile.id,
          company_profile: companyProfileSnapshot(profile),
          customer_display_name: normalizedCustomerFolderName,
          customer_id: customerId,
          expected_booker_profile: loadedBooker ? bookerProfileSnapshot(loadedBooker) : null,
          expected_booker_customer_id: loadedBooker?.customer_id ?? null,
          expected_company_profile: loadedProfile ? companyProfileSnapshot(loadedProfile) : null,
          expected_customer_display_name: loadedCustomerFolderName,
        }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "PATCH",
      });
      const accountResult = await accountResponse.json().catch(() => null);
      const saved = accountResult?.account;

      if (
        !accountResponse.ok ||
        accountResult?.ok !== true ||
        positiveProfileId(saved?.customer_id) !== positiveProfileId(customerId) ||
        positiveProfileId(saved?.company_id) === null ||
        positiveProfileId(saved?.booker_id) === null ||
        profileValue(saved?.customer_display_name) !== normalizedCustomerFolderName ||
        profileValue(saved?.company_name) !== companyName ||
        profileValue(saved?.booker_name) !== safeBookerName
      ) {
        throw new Error(accountResult?.error || "Customer Company + Booker profile save failed safely.");
      }

      setCustomerFolderName(normalizedCustomerFolderName);
      setLoadedCustomerFolderName(normalizedCustomerFolderName);
      const expectedTitle = `${companyName} (${safeBookerName})`;
      setAccountTitle(expectedTitle);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set("name", normalizedCustomerFolderName);
      router.replace(`${nextUrl.pathname}${nextUrl.search}`, { scroll: false });
      const reloadedTitle = await loadAccountTitle();

      if (reloadedTitle !== expectedTitle) {
        throw new Error("Customer profile saved but authoritative title reload failed.");
      }

      setMessage(`Saved, reloaded and verified ${expectedTitle}.`);
      setStatus("saved");
      setProfile(null);
      setBooker(null);
      setLoadedBooker(null);
    } catch (error) {
      setMessage(safeErrorMessage(error));
      setStatus("error");
    }
  }

  if (!profile) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-normal text-slate-950" data-customer-authoritative-title={customerId}>
          {accountTitle}
        </h1>
        <div className="inline-flex flex-col items-start gap-1">
          <button
            className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 transition hover:border-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
            data-customer-company-profile-edit={customerId}
            disabled={status === "loading"}
            onClick={openProfileEditor}
            type="button"
          >
            {status === "loading" ? "Loading profile" : "Edit profile"}
          </button>
          {message ? (
            <p className={`max-w-sm rounded-md border px-2 py-1 text-xs font-semibold ${feedbackClass(status)}`}>
              {message}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <section
      className="w-full rounded-md border border-slate-200 bg-slate-50 p-3"
      data-customer-company-profile-editor={customerId}
    >
      <h1
        className="mb-3 text-2xl font-bold tracking-normal text-slate-950"
        data-customer-authoritative-title={customerId}
      >
        {accountTitle}
      </h1>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-950">
            {profileMode === "create" ? "Create customer company profile" : "Edit customer company profile"}
          </p>
          <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-600">
            {profileMode === "create" ? "Creates" : "Changes"} this exact Customer + Company + Booker
            profile in one guarded save. Jobs, invoices, payments, and messages are not affected.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CustomerAccountDangerZone compact customerId={customerId} customerName={customerName} />
          <button
            className="min-h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={status === "saving"}
            onClick={() => {
              setIdentityDraftDirty(false);
              setProfile(null);
              setLoadedProfile(null);
              setBooker(null);
              setLoadedBooker(null);
              setBookerOptions([]);
              setAvailableBookers([]);
              setCompanyOptions([]);
              setCompanySelection("create-new-company");
              setBookerSelection(createBookerValue);
              setProfileMode("edit");
              setMessage("");
              setStatus("idle");
            }}
            type="button"
          >
            Cancel
          </button>
          <button
            className="min-h-8 rounded-md border border-slate-900 bg-slate-900 px-3 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            data-customer-company-profile-save={customerId}
            disabled={status === "saving"}
            onClick={saveProfile}
            type="button"
          >
            {status === "saving"
              ? "Saving"
              : "Save Company + Booker profile"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-slate-700 sm:col-span-2">
          Customer folder name
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-folder-name={customerId}
            maxLength={120}
            onChange={(event) => setCustomerFolderName(event.target.value)}
            value={customerFolderName}
          />
          <span className="font-semibold text-slate-500">
            Controls only the internal customer folder label. The visible customer title comes only from verified Company + Booker. Passenger names stay on their bookings.
          </span>
        </label>
        {profileMode === "create" ? (
          <label className="grid gap-1 text-xs font-bold text-slate-700 sm:col-span-2">
            Exact Company
            <select
              className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
              data-customer-company-selection="true"
              onChange={(event) => void chooseCompany(event.target.value)}
              value={companySelection}
            >
              <option value="create-new-company">Create new Company explicitly</option>
              {companyOptions.map((candidate) => (
                <option key={candidate.id} value={String(candidate.id)}>{candidate.name}</option>
              ))}
            </select>
            <span className="font-semibold text-slate-500">No Company is inferred from the old folder, passenger, Traveller or contact text.</span>
          </label>
        ) : null}
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Company name
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-name={customerId}
            onChange={(event) => setProfile((current) => (current ? { ...current, company_name: event.target.value } : current))}
            value={profile.company_name}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Website
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-website={customerId}
            onChange={(event) => setProfile((current) => (current ? {
              ...current,
              domain: event.target.value,
              website: event.target.value,
            } : current))}
            placeholder="example.com"
            value={profile.website}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700 sm:col-span-2">
          Billing address
          <textarea
            className="min-h-16 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-billing-address={customerId}
            onChange={(event) => setProfile((current) => (current ? { ...current, billing_address: event.target.value } : current))}
            value={profile.billing_address}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Main telephone
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-main-phone={customerId}
            onChange={(event) => setProfile((current) => (current ? { ...current, main_phone: event.target.value } : current))}
            value={profile.main_phone}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Mobile
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-mobile-phone={customerId}
            onChange={(event) => setProfile((current) => (current ? { ...current, mobile_phone: event.target.value } : current))}
            value={profile.mobile_phone}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Contact name
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-primary-contact={customerId}
            onChange={(event) => setProfile((current) => (current ? { ...current, primary_contact_name: event.target.value } : current))}
            value={profile.primary_contact_name}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Secondary email
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-billing-email={customerId}
            onChange={(event) => setProfile((current) => (current ? { ...current, billing_email: event.target.value } : current))}
            type="email"
            value={profile.billing_email}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Accounts email
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-accounts-email={customerId}
            onChange={(event) => setProfile((current) => (current ? { ...current, accounts_email: event.target.value } : current))}
            type="email"
            value={profile.accounts_email}
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-slate-700">
          Operations email
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-operations-email={customerId}
            onChange={(event) => setProfile((current) => (current ? { ...current, operations_email: event.target.value } : current))}
            type="email"
            value={profile.operations_email}
          />
        </label>
      </div>

      <section className="mt-3 rounded-md border border-sky-200 bg-white p-3" data-customer-company-booker-required="true">
        <p className="text-xs font-bold text-slate-950">Company + Booker Customer Account</p>
        <p className="mt-1 text-xs font-semibold text-slate-600">
          Booker / PA is mandatory. Traveller is optional and stays separate.
        </p>
        {!loadedBooker && profile.id ? (
          <label className="mt-3 grid gap-1 text-xs font-bold text-slate-700">
            Exact Booker / PA
            <select
              className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
              data-customer-booker-selection="true"
              onChange={(event) => {
                const next = event.target.value;
                setBookerSelection(next);
                const selected = bookerOptions.find((candidate) => String(candidate.id) === next);
                setLoadedBooker(selected || null);
                setBooker(selected || blankBookerProfile(profile.id || 0));
              }}
              value={bookerSelection}
            >
              <option value={createBookerValue}>Create new Booker explicitly</option>
              {bookerOptions.map((candidate) => (
                <option key={candidate.id} value={String(candidate.id)}>
                  {candidate.booker_name || `Booker ${candidate.id}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Booker / PA name
            <input
              className="min-h-9 rounded-md border border-slate-300 px-2 text-sm font-semibold text-slate-950"
              data-customer-required-booker-name="true"
              onChange={(event) => setBooker((current) => current ? { ...current, booker_name: event.target.value } : current)}
              value={booker?.booker_name || ""}
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Booker email
            <input
              className="min-h-9 rounded-md border border-slate-300 px-2 text-sm font-semibold text-slate-950"
              onChange={(event) => setBooker((current) => current ? { ...current, email: event.target.value } : current)}
              type="email"
              value={booker?.email || ""}
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-slate-700">
            Booker contact
            <input
              className="min-h-9 rounded-md border border-slate-300 px-2 text-sm font-semibold text-slate-950"
              onChange={(event) => setBooker((current) => current ? { ...current, phone: event.target.value } : current)}
              value={booker?.phone || ""}
            />
          </label>
        </div>
      </section>

      {profile.id && loadedBooker?.customer_id === positiveProfileId(customerId) ? (
        <CustomerVerifiedIdentitiesEditor
          customerId={customerId}
          companyId={profile.id}
          companyName={profile.company_name}
          onDraftDirtyChange={handleIdentityDraftDirtyChange}
        />
      ) : (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
          Save the exact Company + Booker profile first. No Traveller is required.
        </p>
      )}

      <p className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${feedbackClass(status)}`}>
        {message}
      </p>
    </section>
  );
}
