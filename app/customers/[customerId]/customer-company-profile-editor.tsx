"use client";

import { useState } from "react";

const adminCompanyIdentityApiPath = "/api/admin-companies-crm-identity";
const adminCompanyProfileWriteApiPath = "/api/admin-company-traveler-crm-runtime-write-action";

type CustomerCompanyProfileEditorProps = {
  customerId: string;
  customerName: string;
};

type CompanyProfile = {
  company_name: string;
  domain: string;
  id: number | null;
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
        throw new Error(result?.error || "Customer company profile lookup failed safely.");
      }

      if (!company) {
        setProfile({ company_name: customerName, domain: "", id: null });
        setProfileMode("create");
        setMessage(`No company CRM profile exists for ${customerName}. Review the name, then create it deliberately.`);
        setStatus("ready");
        return;
      }

      if (!Number.isSafeInteger(Number(company.id)) || Number(company.id) <= 0) {
        throw new Error("Customer company profile returned an invalid record id.");
      }

      setProfile({
        company_name: String(company.company_name || "").trim(),
        domain: String(company.domain || "").trim(),
        id: Number(company.id),
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
        `${isCreate ? "Create" : "Save"} customer company profile for ${companyName}? This ${isCreate ? "creates" : "updates"} only this customer company's name and domain. It does not change jobs, invoices, payments, or send any message.`,
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
        body: JSON.stringify({
          action_type: isCreate ? "company_create" : "company_update",
          company_name: companyName,
          domain: domain || undefined,
          entity_type: "company",
          ...(profile.id ? { id: profile.id } : {}),
        }),
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
        company_name: String(savedProfile.company_name || companyName).trim(),
        domain: String(savedProfile.domain || domain).trim(),
        id: Number(savedProfile.id),
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
          Company domain
          <input
            className="min-h-9 rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950"
            data-customer-company-profile-domain={customerId}
            onChange={(event) => setProfile((current) => (current ? { ...current, domain: event.target.value } : current))}
            placeholder="example.com"
            value={profile.domain}
          />
        </label>
      </div>

      <p className={`mt-3 rounded-md border px-3 py-2 text-xs font-semibold ${feedbackClass(status)}`}>
        {message}
      </p>
    </section>
  );
}
