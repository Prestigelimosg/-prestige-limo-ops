"use client";

import { useState } from "react";

import { CustomerAccountDangerZone } from "./customer-account-danger-zone";

const adminCompanyIdentityApiPath = "/api/admin-companies-crm-identity";
const adminCompanyProfileWriteApiPath = "/api/admin-company-traveler-crm-runtime-write-action";

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
  id: number | null;
  main_phone: string;
  mobile_phone: string;
  operations_email: string;
  primary_contact_name: string;
  website: string;
};

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

  return "Customer profile could not be loaded or saved. No customer record was changed.";
}

function profileValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function blankCreateProfile(customerName: string): CompanyProfile {
  return {
    accounts_email: "",
    billing_address: "",
    billing_email: "",
    company_name: customerName,
    domain: "",
    id: null,
    main_phone: "",
    mobile_phone: "",
    operations_email: "",
    primary_contact_name: "",
    website: "",
  };
}

function isMissingCompanyProfileResult(response: Response, result: unknown) {
  const record = result !== null && typeof result === "object" ? (result as Record<string, unknown>) : {};
  const message = typeof record.error === "string" ? record.error.toLowerCase() : "";

  return response.status === 404 || /not found|no company/.test(message);
}

function profilePayload(profile: CompanyProfile, isCreate: boolean) {
  const website = profile.website.trim().toLowerCase();

  return {
    action_type: isCreate ? "company_create" : "company_update",
    accounts_email: profile.accounts_email.trim().toLowerCase() || undefined,
    billing_address: profile.billing_address.trim() || undefined,
    billing_email: profile.billing_email.trim().toLowerCase() || undefined,
    company_name: profile.company_name.trim(),
    domain: website || profile.domain.trim().toLowerCase() || undefined,
    entity_type: "company",
    main_phone: profile.main_phone.trim() || undefined,
    mobile_phone: profile.mobile_phone.trim() || undefined,
    operations_email: profile.operations_email.trim().toLowerCase() || undefined,
    primary_contact_name: profile.primary_contact_name.trim() || undefined,
    website: website || undefined,
    ...(profile.id ? { id: profile.id } : {}),
  };
}

export function CustomerCompanyProfileEditor({
  customerId,
  customerName,
}: CustomerCompanyProfileEditorProps) {
  const [status, setStatus] = useState<EditorStatus>("idle");
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileMode, setProfileMode] = useState<ProfileMode>("edit");

  async function openProfileEditor() {
    setStatus("loading");
    setMessage("Loading customer company profile...");

    try {
      const params = new URLSearchParams({ company_name: customerName });
      const response = await fetch(`${adminCompanyIdentityApiPath}?${params.toString()}`, {
        headers: {
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "GET",
      });
      const result = await response.json().catch(() => null);
      const company = result?.company;

      if (!response.ok || !result?.ok) {
        if (isMissingCompanyProfileResult(response, result)) {
          setProfile(blankCreateProfile(customerName));
          setProfileMode("create");
          setMessage(`No company CRM profile exists for ${customerName}. Review the name, then create it deliberately.`);
          setStatus("ready");
          return;
        }

        throw new Error(result?.error || "Customer company profile lookup failed safely.");
      }

      if (!company) {
        setProfile(blankCreateProfile(customerName));
        setProfileMode("create");
        setMessage(`No company CRM profile exists for ${customerName}. Review the name, then create it deliberately.`);
        setStatus("ready");
        return;
      }

      if (!Number.isSafeInteger(Number(company.id)) || Number(company.id) <= 0) {
        throw new Error("Customer company profile returned an invalid record id.");
      }

      setProfile({
        accounts_email: profileValue(company.accounts_email),
        billing_address: profileValue(company.billing_address),
        billing_email: profileValue(company.billing_email),
        company_name: profileValue(company.company_name),
        domain: profileValue(company.domain),
        id: Number(company.id),
        main_phone: profileValue(company.main_phone),
        mobile_phone: profileValue(company.mobile_phone),
        operations_email: profileValue(company.operations_email),
        primary_contact_name: profileValue(company.primary_contact_name),
        website: profileValue(company.website) || profileValue(company.domain),
      });
      setProfileMode("edit");
      setMessage(`Editing the company profile for ${String(company.company_name || customerName).trim()}.`);
      setStatus("ready");
    } catch (error) {
      setMessage(safeErrorMessage(error));
      setStatus("error");
    }
  }

  async function saveProfile() {
    if (!profile) {
      return;
    }

    const companyName = profile.company_name.trim();
    const domain = profile.domain.trim().toLowerCase();
    const isCreate = profileMode === "create";

    if (!companyName) {
      setMessage("Company name is required before saving.");
      setStatus("error");
      return;
    }

    if (
      !window.confirm(
        `${isCreate ? "Create" : "Save"} customer company profile for ${companyName}? This ${isCreate ? "creates" : "updates"} only this customer company's contact profile. It does not change jobs, invoices, payments, or send any message.`,
      )
    ) {
      setMessage("Profile save cancelled. No customer record was changed.");
      setStatus("ready");
      return;
    }

    setStatus("saving");
    setMessage(`${isCreate ? "Creating" : "Saving"} customer company profile for ${companyName}...`);

    try {
      const response = await fetch(adminCompanyProfileWriteApiPath, {
        body: JSON.stringify(profilePayload(profile, isCreate)),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      });
      const result = await response.json().catch(() => null);
      const savedProfile = result?.record;

      if (!response.ok || !result?.ok || result?.status !== "saved" || !savedProfile) {
        throw new Error(result?.error || "Customer company profile save failed safely.");
      }

      setProfile({
        accounts_email: profileValue(savedProfile.accounts_email),
        billing_address: profileValue(savedProfile.billing_address),
        billing_email: profileValue(savedProfile.billing_email),
        company_name: profileValue(savedProfile.company_name) || companyName,
        domain: profileValue(savedProfile.domain) || domain,
        id: Number(savedProfile.id),
        main_phone: profileValue(savedProfile.main_phone),
        mobile_phone: profileValue(savedProfile.mobile_phone),
        operations_email: profileValue(savedProfile.operations_email),
        primary_contact_name: profileValue(savedProfile.primary_contact_name),
        website: profileValue(savedProfile.website) || profileValue(savedProfile.domain) || domain,
      });
      setProfileMode("edit");
      setMessage(`Saved customer company profile for ${String(savedProfile.company_name || companyName).trim()}.`);
      setStatus("saved");
    } catch (error) {
      setMessage(safeErrorMessage(error));
      setStatus("error");
    }
  }

  if (!profile) {
    return (
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
    );
  }

  return (
    <section
      className="w-full rounded-md border border-slate-200 bg-slate-50 p-3"
      data-customer-company-profile-editor={customerId}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-slate-950">
            {profileMode === "create" ? "Create customer company profile" : "Edit customer company profile"}
          </p>
          <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-600">
            {profileMode === "create" ? "Creates" : "Changes"} this customer company record only. Jobs,
            invoices, payments, and messages are not affected.
          </p>
        </div>
        <div className="flex gap-2">
          <CustomerAccountDangerZone compact customerId={customerId} customerName={customerName} />
          <button
            className="min-h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 transition hover:border-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={status === "saving"}
            onClick={() => {
              setProfile(null);
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
            {status === "saving" ? "Saving" : profileMode === "create" ? "Create profile" : "Save profile"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
            onChange={(event) => setProfile((current) => (current ? { ...current, website: event.target.value } : current))}
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
          Billing email
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

      <p className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${feedbackClass(status)}`}>
        {message}
      </p>
    </section>
  );
}
