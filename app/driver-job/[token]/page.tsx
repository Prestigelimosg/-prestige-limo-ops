"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { SafeDriverJobPayload } from "../../../lib/driver-job-link";

type DriverJobApiBlockedReason = "expired" | "revoked" | "unauthorized" | "invalid_status" | "unavailable";

type DriverJobApiResponse =
  | {
      ok: true;
      mode: "mock";
      payload: SafeDriverJobPayload;
      status?: string;
    }
  | {
      ok: false;
      reason?: DriverJobApiBlockedReason;
      payload: null;
    };

type PageState =
  | {
      kind: "loading";
    }
  | {
      kind: "ready";
      job: SafeDriverJobPayload;
    }
  | {
      kind: "blocked";
      reason: DriverJobApiBlockedReason;
    };

type StatusFeedback = {
  target: string;
  tone: "success" | "error";
  text: string;
};

const statusActions = [
  { label: "OTW", value: "OTW" },
  { label: "POB", value: "POB" },
  { label: "Job Completed", value: "Job Completed" },
] as const;

const blockedMessages: Record<DriverJobApiBlockedReason, string> = {
  expired: "This driver job link has expired. Please contact dispatch for a fresh link.",
  invalid_status: "This status update was not accepted. Please try again or contact dispatch.",
  revoked: "This driver job link is no longer active. Please contact dispatch.",
  unauthorized: "This driver job link is unavailable. Please check the link or contact dispatch.",
  unavailable: "This driver job link is unavailable right now. Please contact dispatch.",
};

function normalizeBlockedReason(value: unknown): DriverJobApiBlockedReason {
  return value === "expired" || value === "revoked" || value === "unauthorized" || value === "invalid_status"
    ? value
    : "unavailable";
}

function displayValue(value: string) {
  return value || "Not provided";
}

function statusDisplay(job: SafeDriverJobPayload) {
  return job.statusLabel || job.status || "Pending";
}

function feedbackClassName(tone: StatusFeedback["tone"]) {
  return tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-rose-200 bg-rose-50 text-rose-800";
}

function detailRows(job: SafeDriverJobPayload) {
  return [
    { label: "Date/time", value: job.pickupDateTime || [job.pickupDate, job.pickupTime].filter(Boolean).join(", ") },
    { label: "Service", value: job.bookingTypeLabel || job.bookingType },
    { label: "Pickup", value: job.pickupLocation },
    { label: "Drop-off", value: job.dropoffLocation },
    { label: "Route", value: job.route },
    { label: "Waypoints", value: job.waypoints.join(" > ") },
    { label: "Flight", value: job.flightNumber },
    { label: "Passenger", value: job.passengerName },
  ].filter((row) => row.value);
}

export default function DriverJobPage() {
  const params = useParams<{ token?: string | string[] }>();
  const token = useMemo(() => {
    const rawToken = params?.token;

    return Array.isArray(rawToken) ? rawToken[0] || "" : rawToken || "";
  }, [params]);
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [statusFeedback, setStatusFeedback] = useState<StatusFeedback | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState("");

  useEffect(() => {
    let active = true;

    async function loadJob() {
      await Promise.resolve();

      if (!active) {
        return;
      }

      if (!token) {
        setPageState({ kind: "blocked", reason: "unauthorized" });
        return;
      }

      setPageState({ kind: "loading" });
      setStatusFeedback(null);

      try {
        // Mock-backed until William approves the secure Supabase driver_job_links table and RLS/API policy.
        const response = await fetch(`/api/driver-job/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const result = await response.json() as DriverJobApiResponse;

        if (!active) {
          return;
        }

        if (!result.ok) {
          setPageState({ kind: "blocked", reason: normalizeBlockedReason(result.reason) });
          return;
        }

        if (!response.ok) {
          setPageState({ kind: "blocked", reason: "unavailable" });
          return;
        }

        setPageState({ kind: "ready", job: result.payload });
      } catch {
        if (active) {
          setPageState({ kind: "blocked", reason: "unavailable" });
        }
      }
    }

    void loadJob();

    return () => {
      active = false;
    };
  }, [token]);

  async function updateStatus(nextStatus: string, label: string) {
    if (!token || pageState.kind !== "ready") {
      return;
    }

    setUpdatingStatus(label);
    setStatusFeedback(null);

    try {
      // Mock-backed status update only. Production must verify the secure token before any Supabase write.
      const response = await fetch(`/api/driver-job/${encodeURIComponent(token)}/status`, {
        body: JSON.stringify({ status: nextStatus }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const result = await response.json() as DriverJobApiResponse;

      if (!result.ok) {
        setStatusFeedback({
          target: label,
          tone: "error",
          text: blockedMessages[normalizeBlockedReason(result.reason)],
        });
        return;
      }

      if (!response.ok) {
        setStatusFeedback({
          target: label,
          tone: "error",
          text: blockedMessages.unavailable,
        });
        return;
      }

      setPageState({ kind: "ready", job: result.payload });
      setStatusFeedback({
        target: label,
        tone: "success",
        text: `Status updated to ${statusDisplay(result.payload)}.`,
      });
    } catch {
      setStatusFeedback({
        target: label,
        tone: "error",
        text: "Status update failed. Please try again or contact dispatch.",
      });
    } finally {
      setUpdatingStatus("");
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-5 sm:max-w-lg md:max-w-2xl md:py-8">
        <header className="space-y-2 border-b border-stone-200 pb-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Prestige Limo Ops</p>
          <h1 className="text-2xl font-semibold text-slate-950">Prestige Limo Driver Job</h1>
        </header>

        {pageState.kind === "loading" ? (
          <section
            aria-live="polite"
            className="rounded-md border border-stone-200 bg-white px-4 py-5 text-sm font-semibold text-slate-700"
          >
            Loading driver job...
          </section>
        ) : null}

        {pageState.kind === "blocked" ? (
          <section
            aria-live="polite"
            className="space-y-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-5 text-rose-900"
            data-driver-job-blocked="true"
          >
            <h2 className="text-base font-semibold">Driver job link unavailable</h2>
            <p className="text-sm font-medium">{blockedMessages[pageState.reason]}</p>
          </section>
        ) : null}

        {pageState.kind === "ready" ? (
          <>
            <section className="space-y-3" aria-labelledby="driver-job-summary-heading">
              <div className="flex items-center justify-between gap-3">
                <h2 id="driver-job-summary-heading" className="text-base font-semibold text-slate-900">
                  Job Summary
                </h2>
                <span
                  className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                  data-driver-job-current-status="true"
                >
                  {statusDisplay(pageState.job)}
                </span>
              </div>

              <dl className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
                {detailRows(pageState.job).map((detail) => (
                  <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-3 text-sm" key={detail.label}>
                    <dt className="font-semibold text-slate-500">{detail.label}</dt>
                    <dd className="min-w-0 break-words text-slate-950">{displayValue(detail.value)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="space-y-3" aria-labelledby="assigned-driver-heading">
              <h2 id="assigned-driver-heading" className="text-base font-semibold text-slate-900">
                Assigned Driver
              </h2>
              <dl className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
                <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-3 text-sm">
                  <dt className="font-semibold text-slate-500">Name</dt>
                  <dd className="min-w-0 break-words text-slate-950">
                    {displayValue(pageState.job.assignedDriver.name)}
                  </dd>
                </div>
                <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-3 text-sm">
                  <dt className="font-semibold text-slate-500">Contact</dt>
                  <dd className="min-w-0 break-words text-slate-950">
                    {displayValue(pageState.job.assignedDriver.contact)}
                  </dd>
                </div>
                <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-3 text-sm">
                  <dt className="font-semibold text-slate-500">Plate</dt>
                  <dd className="min-w-0 break-words text-slate-950">
                    {displayValue(pageState.job.assignedDriver.plate)}
                  </dd>
                </div>
                <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-3 text-sm">
                  <dt className="font-semibold text-slate-500">Vehicle</dt>
                  <dd className="min-w-0 break-words text-slate-950">
                    {displayValue(pageState.job.assignedDriver.vehicleModel)}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="space-y-3 pb-6" aria-labelledby="driver-status-heading">
              <h2 id="driver-status-heading" className="text-base font-semibold text-slate-900">
                Job Status
              </h2>
              <div className="grid gap-3 md:grid-cols-3">
                {statusActions.map((statusAction) => (
                  <div className="space-y-2" key={statusAction.label}>
                    <button
                      className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-base font-semibold text-slate-900 transition active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      data-driver-job-status={statusAction.label}
                      disabled={Boolean(updatingStatus)}
                      onClick={() => updateStatus(statusAction.value, statusAction.label)}
                      type="button"
                    >
                      {updatingStatus === statusAction.label ? "Updating..." : statusAction.label}
                    </button>
                    {statusFeedback?.target === statusAction.label ? (
                      <p
                        aria-live="polite"
                        className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(statusFeedback.tone)}`}
                        data-driver-job-status-message={statusAction.label}
                      >
                        {statusFeedback.text}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
