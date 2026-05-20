"use client";

import { useState } from "react";

type DriverDetails = {
  name: string;
  mobile: string;
  plate: string;
  vehicleModel: string;
};

const mockJobDetails = [
  { label: "Date/time", value: "27 May 2026, 1530hrs" },
  { label: "Booking type", value: "MNG / Arrival" },
  { label: "Vehicle", value: "Alphard" },
  { label: "Pickup", value: "Changi Airport T3 Arrival Pickup" },
  { label: "Drop-off", value: "Raffles Hotel Singapore" },
  { label: "Flight", value: "SQ333" },
  { label: "Passenger", value: "Mr Tan" },
  { label: "Pax", value: "2" },
  { label: "Notes", value: "Meet at arrival pickup point after passenger clears immigration." },
];

const statusOptions = [
  { label: "OTW", message: "Status updated: OTW" },
  { label: "POB", message: "Status updated: POB" },
  { label: "Job Completed", message: "Status updated: Completed" },
];

export default function DriverJobDemoPage() {
  const [driverDetails, setDriverDetails] = useState<DriverDetails>({
    name: "",
    mobile: "",
    plate: "",
    vehicleModel: "",
  });
  const [detailsMessage, setDetailsMessage] = useState("");
  const [status, setStatus] = useState("Assigned");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusMessageTarget, setStatusMessageTarget] = useState("");

  function updateDriverDetail(field: keyof DriverDetails, value: string) {
    setDriverDetails((currentDetails) => ({
      ...currentDetails,
      [field]: value,
    }));
  }

  function saveDriverDetails() {
    setDetailsMessage("Driver details saved.");
  }

  function updateStatus(nextStatus: string, message: string) {
    setStatus(nextStatus);
    setStatusMessage(message);
    setStatusMessageTarget(nextStatus);
  }

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-5 sm:max-w-lg md:max-w-2xl md:py-8">
        <header className="space-y-3 border-b border-stone-200 pb-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Prestige Limo Ops</p>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-950">Prestige Limo Driver Job</h1>
            <p
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
              data-driver-demo-warning="true"
            >
              Demo only — not connected to live bookings yet.
            </p>
          </div>
        </header>

        <section className="space-y-3" aria-labelledby="driver-job-summary-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="driver-job-summary-heading" className="text-base font-semibold text-slate-900">
              Job Summary
            </h2>
            <span
              className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
              data-driver-demo-current-status="true"
            >
              {status}
            </span>
          </div>
          <div className="divide-y divide-stone-200 rounded-md border border-stone-200 bg-white">
            {mockJobDetails.map((detail) => (
              <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-3 text-sm" key={detail.label}>
                <dt className="font-semibold text-slate-500">{detail.label}</dt>
                <dd className="min-w-0 break-words text-slate-950">{detail.value}</dd>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="driver-details-heading">
          <h2 id="driver-details-heading" className="text-base font-semibold text-slate-900">
            Driver Details
          </h2>
          <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              <span>Driver name</span>
              <input
                className="h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                data-driver-demo-name="true"
                onChange={(event) => updateDriverDetail("name", event.target.value)}
                type="text"
                value={driverDetails.name}
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              <span>Mobile number</span>
              <input
                className="h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                data-driver-demo-mobile="true"
                inputMode="tel"
                onChange={(event) => updateDriverDetail("mobile", event.target.value)}
                type="tel"
                value={driverDetails.mobile}
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              <span>Car plate</span>
              <input
                autoCapitalize="characters"
                className="h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                data-driver-demo-plate="true"
                onChange={(event) => updateDriverDetail("plate", event.target.value)}
                type="text"
                value={driverDetails.plate}
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              <span>Vehicle model</span>
              <input
                className="h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                data-driver-demo-vehicle-model="true"
                onChange={(event) => updateDriverDetail("vehicleModel", event.target.value)}
                type="text"
                value={driverDetails.vehicleModel}
              />
            </label>
            <div className="space-y-2">
              <button
                className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700"
                data-driver-demo-save-details="true"
                onClick={saveDriverDetails}
                type="button"
              >
                Save Driver Details
              </button>
              {detailsMessage ? (
                <p
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
                  data-driver-demo-details-message="true"
                >
                  {detailsMessage}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="space-y-3 pb-6" aria-labelledby="driver-status-heading">
          <h2 id="driver-status-heading" className="text-base font-semibold text-slate-900">
            Job Status
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            {statusOptions.map((statusOption) => (
              <div className="space-y-2" key={statusOption.label}>
                <button
                  className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-base font-semibold text-slate-900 transition active:bg-slate-100"
                  data-driver-demo-status={statusOption.label}
                  onClick={() => updateStatus(statusOption.label, statusOption.message)}
                  type="button"
                >
                  {statusOption.label}
                </button>
                {statusMessageTarget === statusOption.label ? (
                  <p
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
                    data-driver-demo-status-message={statusOption.label}
                  >
                    {statusMessage}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
