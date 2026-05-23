"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { SafeDriverJobPayload } from "../../../lib/driver-job-link";
import {
  driverJobStatusDisplayLabels,
  guardDriverJobStatusTransition,
  validateDriverJobStatusUpdate,
} from "../../../lib/driver-job-status-workflow";

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

type ControlFeedback = {
  tone: "success" | "error";
  text: string;
};

type DriverDetails = {
  contact: string;
  name: string;
  plate: string;
  vehicleModel: string;
};

type ActivityLogEvent = {
  detail: string;
  id: number;
  label: string;
  time: string;
};

const statusActions = [
  { label: "OTW", value: "OTW" },
  { label: "OTS", value: "OTS" },
  { label: "POB", value: "POB" },
  { label: "Job Completed", value: "Job Completed" },
] as const;

const emptyDriverDetails: DriverDetails = {
  contact: "",
  name: "",
  plate: "",
  vehicleModel: "",
};

const blockedMessages: Record<DriverJobApiBlockedReason, string> = {
  expired: "This driver job link has expired. Please contact dispatch for a fresh link.",
  invalid_status: "This status update was not accepted. Please try again or contact dispatch.",
  revoked: "This driver job link is no longer active. Please contact dispatch.",
  unauthorized: "This driver job link is unavailable. Please check the link or contact dispatch.",
  unavailable: "This driver job link is unavailable right now. Please contact dispatch.",
};

const statusLabels: Record<string, string> = {
  assigned: "Assigned",
  confirmed: "Confirmed",
  pending: "Pending",
  ...driverJobStatusDisplayLabels,
};

function normalizeBlockedReason(value: unknown): DriverJobApiBlockedReason {
  return value === "expired" || value === "revoked" || value === "unauthorized" || value === "invalid_status"
    ? value
    : "unavailable";
}

function displayValue(value: string) {
  return value || "Not provided";
}

function cleanDriverDetails(details: DriverDetails): DriverDetails {
  return {
    contact: details.contact.trim().replace(/\s+/g, " "),
    name: details.name.trim().replace(/\s+/g, " "),
    plate: details.plate.trim().replace(/\s+/g, " "),
    vehicleModel: details.vehicleModel.trim().replace(/\s+/g, " "),
  };
}

function statusDisplay(status: string, fallbackLabel = "") {
  return statusLabels[status.toLowerCase()] || fallbackLabel || status || "Pending";
}

function feedbackClassName(tone: StatusFeedback["tone"] | ControlFeedback["tone"]) {
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

function isArrivalStyleJob(job: SafeDriverJobPayload) {
  return job.bookingType.trim().toUpperCase() === "MNG" || job.bookingTypeLabel.toLowerCase().includes("arrival");
}

function hasReachedOts(status: string) {
  const normalizedStatus = validateDriverJobStatusUpdate(status);

  return normalizedStatus === "ots" || normalizedStatus === "pob" || normalizedStatus === "completed";
}

function activityTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DriverJobPage() {
  const params = useParams<{ token?: string | string[] }>();
  const token = useMemo(() => {
    const rawToken = params?.token;

    return Array.isArray(rawToken) ? rawToken[0] || "" : rawToken || "";
  }, [params]);
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [acknowledged, setAcknowledged] = useState(false);
  const [acknowledgementFeedback, setAcknowledgementFeedback] = useState<ControlFeedback | null>(null);
  const [driverDetails, setDriverDetails] = useState<DriverDetails>(emptyDriverDetails);
  const [detailsFeedback, setDetailsFeedback] = useState<ControlFeedback | null>(null);
  const [savedDriverDetails, setSavedDriverDetails] = useState<DriverDetails | null>(null);
  const [mockLiveLocationActive, setMockLiveLocationActive] = useState(false);
  const [mockLiveLocationFeedback, setMockLiveLocationFeedback] = useState<ControlFeedback | null>(null);
  const [mockOtsPhotoProofAdded, setMockOtsPhotoProofAdded] = useState(false);
  const [mockOtsPhotoProofFeedback, setMockOtsPhotoProofFeedback] = useState<ControlFeedback | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEvent[]>([]);
  const [statusFeedback, setStatusFeedback] = useState<StatusFeedback | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState("assigned");
  const [updatingStatus, setUpdatingStatus] = useState("");
  const readyJob = pageState.kind === "ready" ? pageState.job : null;
  const requiresMockOtsPhotoProof = readyJob ? isArrivalStyleJob(readyJob) : false;
  const showMockOtsPhotoProof = requiresMockOtsPhotoProof && hasReachedOts(workflowStatus);

  function addActivity(label: string, detail: string) {
    setActivityLog((currentLog) => [
      ...currentLog,
      {
        detail,
        id: currentLog.length + 1,
        label,
        time: activityTime(),
      },
    ]);
  }

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
      setAcknowledged(false);
      setAcknowledgementFeedback(null);
      setDetailsFeedback(null);
      setDriverDetails(emptyDriverDetails);
      setMockLiveLocationActive(false);
      setMockLiveLocationFeedback(null);
      setMockOtsPhotoProofAdded(false);
      setMockOtsPhotoProofFeedback(null);
      setActivityLog([]);
      setSavedDriverDetails(null);
      setStatusFeedback(null);
      setWorkflowStatus("assigned");

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

        setDriverDetails({
          contact: result.payload.assignedDriver.contact,
          name: result.payload.assignedDriver.name,
          plate: result.payload.assignedDriver.plate,
          vehicleModel: result.payload.assignedDriver.vehicleModel,
        });
        setWorkflowStatus(result.payload.status || "assigned");
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

  function acknowledgeJob() {
    setAcknowledged(true);
    setStatusFeedback(null);
    setAcknowledgementFeedback({
      tone: "success",
      text: "Job acknowledged locally for this mock driver page.",
    });
    addActivity("Job acknowledged", "Driver acknowledged this mock job locally.");
  }

  function activateMockLiveLocation() {
    if (!acknowledged) {
      setMockLiveLocationFeedback({
        tone: "error",
        text: "Acknowledge this job before activating mock live location.",
      });
      return;
    }

    if (workflowStatus === "pob" || workflowStatus === "completed") {
      setMockLiveLocationActive(false);
      setMockLiveLocationFeedback({
        tone: "error",
        text: "Mock live location has ended for this job.",
      });
      return;
    }

    setMockLiveLocationActive(true);
    setMockLiveLocationFeedback({
      tone: "success",
      text: "Mock live location active locally for this mock driver page. No phone location is captured or sent.",
    });
    addActivity("Mock live location activated", "Local mock live location state is active. No location was sent.");
  }

  function updateDriverDetail(field: keyof DriverDetails, value: string) {
    setDetailsFeedback(null);
    setSavedDriverDetails(null);
    setDriverDetails((currentDetails) => ({
      ...currentDetails,
      [field]: value,
    }));
  }

  function saveDriverDetails() {
    const nextDetails = cleanDriverDetails(driverDetails);

    setDriverDetails(nextDetails);

    if (!nextDetails.name && !nextDetails.contact && !nextDetails.plate) {
      setDetailsFeedback({
        tone: "error",
        text: "Enter driver name, contact, or car plate before saving.",
      });
      setSavedDriverDetails(null);
      return;
    }

    if (!nextDetails.name) {
      setDetailsFeedback({
        tone: "error",
        text: "Driver name is required before saving.",
      });
      setSavedDriverDetails(null);
      return;
    }

    setSavedDriverDetails(nextDetails);
    setDetailsFeedback({
      tone: "success",
      text: "Driver details saved locally for this mock driver page.",
    });
    addActivity("Mock driver details saved", "Driver name/contact/vehicle details were saved locally.");
  }

  function addMockOtsPhotoProof() {
    if (!showMockOtsPhotoProof) {
      return;
    }

    setMockOtsPhotoProofAdded(true);
    setMockOtsPhotoProofFeedback({
      tone: "success",
      text: "Mock OTS photo proof added locally. No real file upload, camera, or storage was used.",
    });
    setStatusFeedback(null);
    addActivity(
      "Mock OTS photo proof added",
      "Mock/local OTS photo proof was added. No file upload, camera, or storage was used.",
    );
  }

  async function updateStatus(nextStatus: string, label: string) {
    if (!token || pageState.kind !== "ready") {
      return;
    }

    const transitionGuard = guardDriverJobStatusTransition({
      acknowledged,
      currentStatus: workflowStatus,
      nextStatus,
    });

    if (!transitionGuard.ok) {
      setStatusFeedback({
        target: label,
        tone: "error",
        text: transitionGuard.message,
      });
      return;
    }

    if (transitionGuard.status === "pob" && isArrivalStyleJob(pageState.job) && !mockOtsPhotoProofAdded) {
      setStatusFeedback({
        target: label,
        tone: "error",
        text: "Add mock OTS photo proof before POB.",
      });
      addActivity("POB blocked", "POB was blocked because OTS photo proof is missing.");
      return;
    }

    setUpdatingStatus(label);
    setStatusFeedback(null);

    try {
      // Mock-backed status update only. Production must verify the secure token before any Supabase write.
      const response = await fetch(`/api/driver-job/${encodeURIComponent(token)}/status`, {
        body: JSON.stringify({ status: transitionGuard.status }),
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

      const nextStatusText = statusDisplay(result.payload.status, result.payload.statusLabel);

      if (transitionGuard.status === "pob") {
        setMockLiveLocationActive(false);
        if (mockLiveLocationActive) {
          setMockLiveLocationFeedback({
            tone: "success",
            text: "Mock live location ended locally after POB.",
          });
        }
      }

      if (transitionGuard.status === "completed") {
        setMockLiveLocationActive(false);
      }

      setWorkflowStatus(result.payload.status);
      setPageState({ kind: "ready", job: result.payload });
      addActivity(`${label} marked`, `Driver status updated to ${nextStatusText}.`);
      if (transitionGuard.status === "ots" && isArrivalStyleJob(result.payload)) {
        addActivity("OTS photo proof requested", "Mock/local OTS photo proof is required before POB.");
      }
      if (transitionGuard.status === "pob" && mockLiveLocationActive) {
        addActivity("Mock live location auto-ended at POB", "Local mock live location state ended after POB.");
      }
      setStatusFeedback({
        target: label,
        tone: "success",
        text:
          transitionGuard.status === "pob" && mockLiveLocationActive
            ? `Status updated to ${nextStatusText}. Mock live location ended locally.`
            : `Status updated to ${nextStatusText}.`,
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
                  {statusDisplay(pageState.job.status, pageState.job.statusLabel)}
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

            <section className="space-y-3" aria-labelledby="driver-acknowledgement-heading">
              <h2 id="driver-acknowledgement-heading" className="text-base font-semibold text-slate-900">
                Job Acknowledgement
              </h2>
              <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
                <p
                  className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                  data-driver-job-acknowledged-state="true"
                >
                  {acknowledged ? "Acknowledged" : "Waiting for driver acknowledgement"}
                </p>
                <div className="space-y-2">
                  <button
                    className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700"
                    data-driver-job-acknowledge="true"
                    onClick={acknowledgeJob}
                    type="button"
                  >
                    Acknowledge Job
                  </button>
                  {acknowledgementFeedback ? (
                    <p
                      aria-live="polite"
                      className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(acknowledgementFeedback.tone)}`}
                      data-driver-job-acknowledge-message="true"
                    >
                      {acknowledgementFeedback.text}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="space-y-3" aria-labelledby="driver-live-location-heading">
              <h2 id="driver-live-location-heading" className="text-base font-semibold text-slate-900">
                Mock Live Location
              </h2>
              <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
                <p
                  className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                  data-driver-job-live-location-state="true"
                >
                  {mockLiveLocationActive ? "Mock live location active" : "Mock live location inactive"}
                </p>
                <p className="text-sm font-medium text-slate-600">
                  Mock/local only. No phone location is captured or sent.
                </p>
                <div className="space-y-2">
                  <button
                    className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700"
                    data-driver-job-live-location="true"
                    onClick={activateMockLiveLocation}
                    type="button"
                  >
                    Activate Mock Live Location
                  </button>
                  {mockLiveLocationFeedback ? (
                    <p
                      aria-live="polite"
                      className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(mockLiveLocationFeedback.tone)}`}
                      data-driver-job-live-location-message="true"
                    >
                      {mockLiveLocationFeedback.text}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            {showMockOtsPhotoProof ? (
              <section
                className="space-y-3"
                aria-labelledby="driver-ots-photo-proof-heading"
                data-driver-job-ots-photo-proof-section="true"
              >
                <h2 id="driver-ots-photo-proof-heading" className="text-base font-semibold text-slate-900">
                  Mock OTS Photo Proof
                </h2>
                <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
                  <p
                    className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                    data-driver-job-ots-photo-proof-state="true"
                  >
                    {mockOtsPhotoProofAdded
                      ? "Mock OTS photo proof added"
                      : "Mock OTS photo proof required before POB"}
                  </p>
                  <p className="text-sm font-medium text-slate-600">
                    Mock/local only. No real file upload, camera, or storage is used.
                  </p>
                  <div className="space-y-2">
                    <button
                      className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                      data-driver-job-ots-photo-proof="true"
                      disabled={mockOtsPhotoProofAdded}
                      onClick={addMockOtsPhotoProof}
                      type="button"
                    >
                      Add Mock OTS Photo Proof
                    </button>
                    {mockOtsPhotoProofFeedback ? (
                      <p
                        aria-live="polite"
                        className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(mockOtsPhotoProofFeedback.tone)}`}
                        data-driver-job-ots-photo-proof-message="true"
                      >
                        {mockOtsPhotoProofFeedback.text}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="space-y-3" aria-labelledby="driver-details-heading">
              <h2 id="driver-details-heading" className="text-base font-semibold text-slate-900">
                Driver Details
              </h2>
              <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  <span>Driver name</span>
                  <input
                    className="h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    data-driver-job-detail-name="true"
                    onChange={(event) => updateDriverDetail("name", event.target.value)}
                    type="text"
                    value={driverDetails.name}
                  />
                </label>
                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  <span>Contact</span>
                  <input
                    className="h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    data-driver-job-detail-contact="true"
                    inputMode="tel"
                    onChange={(event) => updateDriverDetail("contact", event.target.value)}
                    type="tel"
                    value={driverDetails.contact}
                  />
                </label>
                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  <span>Car plate</span>
                  <input
                    autoCapitalize="characters"
                    className="h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    data-driver-job-detail-plate="true"
                    onChange={(event) => updateDriverDetail("plate", event.target.value)}
                    type="text"
                    value={driverDetails.plate}
                  />
                </label>
                <label className="block space-y-1 text-sm font-semibold text-slate-700">
                  <span>Vehicle model</span>
                  <input
                    className="h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    data-driver-job-detail-vehicle-model="true"
                    onChange={(event) => updateDriverDetail("vehicleModel", event.target.value)}
                    type="text"
                    value={driverDetails.vehicleModel}
                  />
                </label>
                <div className="space-y-2">
                  <button
                    className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700"
                    data-driver-job-save-details="true"
                    onClick={saveDriverDetails}
                    type="button"
                  >
                    Save
                  </button>
                  {detailsFeedback ? (
                    <p
                      aria-live="polite"
                      className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(detailsFeedback.tone)}`}
                      data-driver-job-details-message="true"
                    >
                      {detailsFeedback.text}
                    </p>
                  ) : null}
                </div>
                {savedDriverDetails ? (
                  <div
                    className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900"
                    data-driver-job-saved-details="true"
                  >
                    <p className="font-semibold">Saved driver details</p>
                    <dl className="grid gap-1">
                      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                        <dt className="font-semibold">Name</dt>
                        <dd className="min-w-0 break-words">{displayValue(savedDriverDetails.name)}</dd>
                      </div>
                      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                        <dt className="font-semibold">Contact</dt>
                        <dd className="min-w-0 break-words">{displayValue(savedDriverDetails.contact)}</dd>
                      </div>
                      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                        <dt className="font-semibold">Plate</dt>
                        <dd className="min-w-0 break-words">{displayValue(savedDriverDetails.plate)}</dd>
                      </div>
                      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
                        <dt className="font-semibold">Vehicle</dt>
                        <dd className="min-w-0 break-words">{displayValue(savedDriverDetails.vehicleModel)}</dd>
                      </div>
                    </dl>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-3" aria-labelledby="driver-activity-log-heading">
              <h2 id="driver-activity-log-heading" className="text-base font-semibold text-slate-900">
                Driver Activity Log
              </h2>
              <div
                className="space-y-3 rounded-md border border-stone-200 bg-white p-3"
                data-driver-job-activity-log="true"
              >
                {activityLog.length > 0 ? (
                  <ol className="space-y-2">
                    {activityLog.map((event) => (
                      <li
                        className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200"
                        data-driver-job-activity-log-item="true"
                        key={event.id}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-semibold" data-driver-job-activity-log-label="true">
                            {event.label}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">{event.time}</span>
                        </div>
                        <p className="mt-1 break-words text-slate-600">{event.detail}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm font-medium text-slate-600">No mock driver activity recorded yet.</p>
                )}
              </div>
            </section>

            <section className="space-y-3 pb-6" aria-labelledby="driver-status-heading">
              <h2 id="driver-status-heading" className="text-base font-semibold text-slate-900">
                Job Status
              </h2>
              <div className="grid gap-3 md:grid-cols-4">
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
