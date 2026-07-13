"use client";

import { useState } from "react";

type CustomerAccountDangerZoneProps = {
  customerId: string;
  customerName: string;
};

type Inspection = {
  blockers: string[];
  counts: {
    bookings: number;
    contacts: number;
    invoice_records: number;
    monthly_billing_drafts: number;
    monthly_invoice_drafts: number;
    portal_access_accounts: number;
  };
  customer: { display_name: string; id: number };
  eligible: boolean;
};

type Status = "idle" | "checking" | "blocked" | "ready" | "deleting" | "error";

const accountApiPath = "/api/admin-customer-account";

function safeErrorMessage(error: unknown) {
  const text = error instanceof Error ? error.message.toLowerCase() : "";

  if (/not found|invalid/.test(text)) {
    return "This folder is not connected to a verified customer account ID, so deletion is blocked.";
  }

  if (/protected records|cannot be deleted/.test(text)) {
    return "This customer still has protected records and cannot be deleted.";
  }

  if (/admin|dispatcher|session|forbidden|boundary/.test(text)) {
    return "Customer deletion requires the verified internal admin session.";
  }

  return "Customer deletion could not be checked safely. Nothing was deleted.";
}

function blockerLabel(blocker: string) {
  const labels: Record<string, string> = {
    bookings: "saved jobs",
    invoice_records: "invoice records",
    monthly_billing_drafts: "monthly billing drafts",
    monthly_invoice_drafts: "monthly invoice drafts",
  };

  return labels[blocker] || "protected records";
}

export function CustomerAccountDangerZone({ customerId, customerName }: CustomerAccountDangerZoneProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState(
    "Deletion is available only after the app verifies the exact customer ID and confirms that no protected records remain.",
  );
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [confirmationName, setConfirmationName] = useState("");

  async function checkDeletion() {
    setStatus("checking");
    setInspection(null);
    setConfirmationName("");
    setMessage("Checking this exact customer account and its protected records...");

    try {
      const response = await fetch(`${accountApiPath}/${encodeURIComponent(customerId)}`, {
        headers: { "x-prestige-admin-purpose": "admin-booking-persistence" },
        method: "GET",
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok !== true || !result?.inspection) {
        throw new Error(result?.error || "Customer account check failed safely.");
      }

      const nextInspection = result.inspection as Inspection;
      setInspection(nextInspection);

      if (!nextInspection.eligible) {
        const blockers = nextInspection.blockers.map(blockerLabel).join(", ");
        setStatus("blocked");
        setMessage(`Deletion blocked. Remove or resolve this customer's ${blockers} first.`);
        return;
      }

      setStatus("ready");
      setMessage(
        `Eligible for deletion. Type the exact customer name “${nextInspection.customer.display_name}” to unlock permanent deletion.`,
      );
    } catch (error) {
      setStatus("error");
      setMessage(safeErrorMessage(error));
    }
  }

  async function deleteCustomerAccount() {
    if (!inspection?.eligible || confirmationName !== inspection.customer.display_name) {
      setStatus("error");
      setMessage("The confirmation name must exactly match the verified customer name.");
      return;
    }

    if (
      !window.confirm(
        `Permanently delete customer account ${inspection.customer.display_name}? Portal access will be revoked. This cannot be undone.`,
      )
    ) {
      setMessage("Deletion cancelled. Nothing was changed.");
      setStatus("ready");
      return;
    }

    setStatus("deleting");
    setMessage(`Deleting exact customer account ${inspection.customer.display_name}...`);

    try {
      const response = await fetch(`${accountApiPath}/${encodeURIComponent(customerId)}`, {
        body: JSON.stringify({ confirmation_name: confirmationName }),
        headers: {
          "Content-Type": "application/json",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "DELETE",
      });
      const result = await response.json().catch(() => null);

      if (
        !response.ok ||
        result?.ok !== true ||
        Number(result?.deleted_customer?.id) !== inspection.customer.id
      ) {
        throw new Error(result?.error || "Customer account deletion failed safely.");
      }

      window.location.assign("/customers");
    } catch (error) {
      setStatus("error");
      setMessage(safeErrorMessage(error));
    }
  }

  return (
    <section
      className="rounded-md border border-rose-300 bg-rose-50 p-3"
      data-customer-account-danger-zone={customerId}
    >
      <h2 className="text-sm font-bold text-rose-950">Danger zone</h2>
      <p className="mt-1 text-xs font-semibold leading-5 text-rose-900">
        Delete only this verified customer account. Company, booker, traveler, invoices, jobs, payments, and
        other customers are never deleted from this action.
      </p>

      {inspection ? (
        <dl className="mt-2 grid gap-1 text-xs text-rose-950 sm:grid-cols-3">
          <div><dt className="font-bold">Saved jobs</dt><dd>{inspection.counts.bookings}</dd></div>
          <div><dt className="font-bold">Invoice records</dt><dd>{inspection.counts.invoice_records}</dd></div>
          <div><dt className="font-bold">Portal access</dt><dd>{inspection.counts.portal_access_accounts}</dd></div>
        </dl>
      ) : null}

      {status === "ready" && inspection?.eligible ? (
        <label className="mt-3 grid max-w-lg gap-1 text-xs font-bold text-rose-950">
          Type {inspection.customer.display_name} to confirm
          <input
            className="min-h-9 rounded-md border border-rose-300 bg-white px-2 text-sm text-slate-950"
            data-customer-account-delete-confirmation={customerId}
            onChange={(event) => setConfirmationName(event.target.value)}
            value={confirmationName}
          />
        </label>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {status === "ready" && inspection?.eligible ? (
          <button
            className="min-h-9 rounded-md bg-rose-700 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-rose-300"
            data-customer-account-delete-confirm={customerId}
            disabled={confirmationName !== inspection.customer.display_name}
            onClick={deleteCustomerAccount}
            type="button"
          >
            Permanently delete customer
          </button>
        ) : (
          <button
            className="min-h-9 rounded-md border border-rose-700 bg-white px-3 text-xs font-bold text-rose-800 disabled:cursor-not-allowed disabled:border-rose-300 disabled:text-rose-400"
            data-customer-account-delete-check={customerId}
            disabled={status === "checking" || status === "deleting"}
            onClick={checkDeletion}
            type="button"
          >
            {status === "checking" ? "Checking account" : "Delete customer account"}
          </button>
        )}
      </div>

      <p className="mt-2 text-xs font-semibold text-rose-950" role="status">
        {message || `No change made to ${customerName}.`}
      </p>
    </section>
  );
}
