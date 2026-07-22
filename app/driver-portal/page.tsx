"use client";

import { useCallback, useEffect, useState } from "react";
import type { SafeDriverJobPayload } from "../../lib/driver-job-link";

type DriverPortalJob = {
  job_key: string;
  payload: SafeDriverJobPayload;
  state: "assigned" | "driver_otw" | "ots" | "pob";
  state_label: string;
};

type DriverPortalReadState =
  | { kind: "loading" }
  | { kind: "ready"; jobs: DriverPortalJob[] }
  | { kind: "blocked"; reason: "not_configured" | "unauthorized" | "unavailable" };

type DriverPortalAlertReadiness = {
  publicKey: string;
  ready: boolean;
};

type DriverPortalAlertState =
  | "available"
  | "blocked"
  | "enabled"
  | "enabling"
  | "unavailable";

const driverAlertDatabaseName = "prestige-driver-device-alerts";
const driverAlertDatabaseVersion = 1;
const driverJobLinkStoreName = "driver-job-links";

function displayValue(value: string | null | undefined) {
  return value?.trim() || "—";
}

function pickupDisplay(job: SafeDriverJobPayload) {
  return [job.pickupDate, job.pickupTime].filter(Boolean).join(" · ") || "Schedule pending";
}

function driverDeviceAlertApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function openDriverAlertDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(driverAlertDatabaseName, driverAlertDatabaseVersion);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(driverJobLinkStoreName)) {
        request.result.createObjectStore(driverJobLinkStoreName, { keyPath: "jobKey" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function storedDriverJobUrl(jobKey: string) {
  if (!/^[0-9a-f]{64}$/.test(jobKey) || !("indexedDB" in window)) {
    return null;
  }

  const database = await openDriverAlertDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const transaction = database.transaction(driverJobLinkStoreName, "readonly");
      const request = transaction.objectStore(driverJobLinkStoreName).get(jobKey);
      request.addEventListener("success", () => {
        const url = request.result?.url;
        resolve(typeof url === "string" && url.startsWith("/driver-job/") ? url : null);
      });
      request.addEventListener("error", () => reject(request.error));
    });
  } finally {
    database.close();
  }
}

export default function DriverPortalPage() {
  const [readState, setReadState] = useState<DriverPortalReadState>({ kind: "loading" });
  const [alertReadiness, setAlertReadiness] = useState<DriverPortalAlertReadiness>({
    publicKey: "",
    ready: false,
  });
  const [alertState, setAlertState] = useState<DriverPortalAlertState>("available");
  const [openingJobKey, setOpeningJobKey] = useState("");
  const [openFeedback, setOpenFeedback] = useState<Record<string, string>>({});

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/driver-portal/jobs", {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-prestige-driver-purpose": "driver-portal-jobs-read",
        },
      });
      const result = await response.json() as {
        device_alerts?: { public_key?: string | null; ready?: boolean };
        jobs?: DriverPortalJob[];
        ok?: boolean;
        reason?: string;
      };
      if (!response.ok || result.ok !== true) {
        setReadState({
          kind: "blocked",
          reason: response.status === 401
            ? "unauthorized"
            : response.status === 503
              ? "not_configured"
              : "unavailable",
        });
        return;
      }

      const publicKey = typeof result.device_alerts?.public_key === "string"
        ? result.device_alerts.public_key
        : "";
      setAlertReadiness({
        publicKey,
        ready: result.device_alerts?.ready === true && Boolean(publicKey),
      });
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setAlertState("unavailable");
      } else if (Notification.permission === "denied") {
        setAlertState("blocked");
      }
      setReadState({ kind: "ready", jobs: Array.isArray(result.jobs) ? result.jobs : [] });
    } catch {
      setReadState({ kind: "blocked", reason: "unavailable" });
    }
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      void loadJobs();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [loadJobs]);

  async function enableJobAlerts() {
    if (!alertReadiness.ready || !alertReadiness.publicKey) {
      setAlertState("unavailable");
      return;
    }
    if (
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setAlertState("unavailable");
      return;
    }

    setAlertState("enabling");
    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setAlertState(permission === "denied" ? "blocked" : "available");
        return;
      }

      const registration = await navigator.serviceWorker.register(
        "/prestige-driver-push-sw.js",
        { scope: "/driver-job/" },
      );
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription = existingSubscription ?? await registration.pushManager.subscribe({
        applicationServerKey: driverDeviceAlertApplicationServerKey(alertReadiness.publicKey),
        userVisibleOnly: true,
      });
      const response = await fetch("/api/driver-portal/jobs", {
        body: JSON.stringify({ device_push_subscription: subscription.toJSON() }),
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-prestige-driver-purpose": "driver-portal-device-alert-registration",
        },
        method: "POST",
      });
      const result = await response.json() as {
        device_alerts?: { subscription_registered?: boolean };
        ok?: boolean;
      };
      setAlertState(
        response.ok && result.ok === true && result.device_alerts?.subscription_registered === true
          ? "enabled"
          : "unavailable",
      );
    } catch {
      setAlertState("unavailable");
    }
  }

  async function openJob(job: DriverPortalJob) {
    setOpeningJobKey(job.job_key);
    setOpenFeedback((current) => ({ ...current, [job.job_key]: "" }));
    try {
      const url = await storedDriverJobUrl(job.job_key);
      if (!url) {
        setOpenFeedback((current) => ({
          ...current,
          [job.job_key]: "Open and acknowledge the latest private link from dispatch once on this device.",
        }));
        return;
      }
      window.location.assign(url);
    } catch {
      setOpenFeedback((current) => ({
        ...current,
        [job.job_key]: "This private job shortcut is unavailable. Open the latest link from dispatch.",
      }));
    } finally {
      setOpeningJobKey("");
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rounded-2xl bg-slate-950 px-4 py-5 text-white shadow-sm sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Prestige Limo</p>
          <h1 className="mt-1 text-2xl font-bold" data-driver-portal-heading="true">
            Driver Portal
          </h1>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
            Your acknowledged upcoming and active jobs on this device.
          </p>
        </header>

        {readState.kind === "loading" ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-driver-portal-loading="true">
            <p className="text-sm font-semibold text-slate-700">Loading assigned jobs…</p>
          </section>
        ) : readState.kind === "blocked" ? (
          <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm" data-driver-portal-blocked={readState.reason}>
            <h2 className="text-lg font-bold text-amber-950">Secure enrolment required</h2>
            <p className="text-sm font-medium leading-6 text-amber-900">
              Open your current private Driver Job link on this device, confirm your details, and use
              Save &amp; Acknowledge Job. Then reopen Driver Portal.
            </p>
            <button
              className="h-11 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white"
              onClick={() => void loadJobs()}
              type="button"
            >
              Try again
            </button>
          </section>
        ) : (
          <section className="space-y-3" data-driver-portal-job-count={readState.jobs.length}>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm" data-driver-portal-alert-setup={alertState}>
              <h2 className="text-base font-bold text-sky-950">Job alerts</h2>
              <p className="mt-1 text-sm font-medium leading-6 text-sky-900">
                Enable once on this iPhone to receive newly issued jobs and Driver Job updates.
              </p>
              <button
                className="mt-3 h-11 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white disabled:bg-slate-400"
                data-driver-portal-enable-alerts="true"
                disabled={alertState === "enabled" || alertState === "enabling"}
                onClick={() => void enableJobAlerts()}
                type="button"
              >
                {alertState === "enabled"
                  ? "Job Alerts Enabled"
                  : alertState === "enabling"
                    ? "Enabling…"
                    : "Enable Job Alerts"}
              </button>
              {alertState === "blocked" ? (
                <p className="mt-2 text-xs font-semibold leading-5 text-amber-900">
                  Alerts are blocked. Open iPhone Settings, choose Driver Portal, then allow Notifications.
                </p>
              ) : alertState === "unavailable" ? (
                <p className="mt-2 text-xs font-semibold leading-5 text-amber-900">
                  Job alerts are unavailable. On iPhone, open this installed Driver Portal from the Home Screen and try again.
                </p>
              ) : alertState === "enabled" ? (
                <p className="mt-2 text-xs font-semibold leading-5 text-emerald-800">
                  This device is ready for Driver Job alerts.
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Upcoming &amp; active jobs</h2>
                <p className="text-xs font-semibold text-slate-500">
                  Completed or cancelled jobs are not shown.
                </p>
              </div>
              <button
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
                onClick={() => void loadJobs()}
                type="button"
              >
                Refresh
              </button>
            </div>

            {readState.jobs.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-driver-portal-empty="true">
                <p className="text-sm font-semibold text-slate-700">No acknowledged upcoming or active jobs.</p>
              </div>
            ) : readState.jobs.map((job) => (
              <article
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                data-driver-portal-job={job.payload.reference}
                key={job.job_key}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Job {job.payload.reference}</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-950">{pickupDisplay(job.payload)}</h3>
                  </div>
                  <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-900 ring-1 ring-sky-200" data-driver-portal-job-state={job.state}>
                    {job.state_label}
                  </span>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-slate-500">Pickup</dt>
                    <dd className="mt-1 font-semibold text-slate-900">{displayValue(job.payload.pickupLocation)}</dd>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-slate-500">Drop-off</dt>
                    <dd className="mt-1 font-semibold text-slate-900">{displayValue(job.payload.dropoffLocation)}</dd>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-slate-500">Passenger</dt>
                    <dd className="mt-1 font-semibold text-slate-900">{displayValue(job.payload.passengerName)}</dd>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-slate-500">Flight</dt>
                    <dd className="mt-1 font-semibold text-slate-900">{displayValue(job.payload.flightNumber)}</dd>
                  </div>
                </dl>
                <button
                  className="h-11 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white disabled:bg-slate-400"
                  data-driver-portal-open-job={job.job_key}
                  disabled={openingJobKey === job.job_key}
                  onClick={() => void openJob(job)}
                  type="button"
                >
                  {openingJobKey === job.job_key ? "Opening…" : "Open Driver Job"}
                </button>
                {openFeedback[job.job_key] ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900" data-driver-portal-open-feedback={job.job_key}>
                    {openFeedback[job.job_key]}
                  </p>
                ) : null}
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
