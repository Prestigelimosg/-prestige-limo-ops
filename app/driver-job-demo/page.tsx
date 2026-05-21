"use client";

import { useState } from "react";

type DriverDetails = {
  name: string;
  mobile: string;
  plate: string;
  vehicleModel: string;
};

type ParseFeedback = {
  tone: "error" | "success" | "warning";
  text: string;
};

type ParsedDriverDetails = Partial<DriverDetails> & {
  paymentDetailsDetected: boolean;
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

const paymentDetailsPattern = /\b(paynow|pay now|bank|account|acct)\b/i;
const vehicleModelPattern =
  /\b(alphard|vellfire|hiace|mercedes|benz|bmw|audi|toyota|honda|hyundai|kia|lexus|estima|camry|viano|voxy|noah|prius|combi|maxi\s?cab|mpv|van|bus|e\s?class|s\s?class)\b/i;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanParsedValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function cleanDriverDetails(details: DriverDetails): DriverDetails {
  return {
    mobile: cleanParsedValue(details.mobile),
    name: cleanParsedValue(details.name),
    plate: cleanParsedValue(details.plate),
    vehicleModel: cleanParsedValue(details.vehicleModel),
  };
}

function feedbackClassName(tone: ParseFeedback["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (tone === "error") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }

  return "border-amber-200 bg-amber-50 text-amber-900";
}

function lineValue(text: string, labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const matcher = new RegExp(`^\\s*(?:${labelPattern})\\s*(?::|=|-)\\s*(.+?)\\s*$`, "i");

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(matcher);

    if (match?.[1]) {
      return cleanParsedValue(match[1]);
    }
  }

  return "";
}

function driverDetailLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(cleanParsedValue)
    .filter(Boolean);
}

function isPaymentDetailLine(line: string) {
  return paymentDetailsPattern.test(line);
}

function hasFieldLabel(line: string) {
  return /^\s*[^:=\-]{1,32}\s*(?::|=|-)\s*\S/.test(line);
}

function phoneDigits(line: string) {
  return line.replace(/\D/g, "");
}

function isPhoneLikeLine(line: string) {
  if (!/^[+\d\s().-]+$/.test(line)) {
    return false;
  }

  const digits = phoneDigits(line);

  if (digits.length === 8) {
    return /^[3689]/.test(digits);
  }

  return digits.length === 10 && digits.startsWith("65") && /^[3689]/.test(digits.slice(2));
}

function isSingaporePlateLine(line: string) {
  const compactPlate = line.toUpperCase().replace(/[^A-Z0-9]/g, "");

  return /^[A-Z]{1,3}\d{1,4}[A-Z]$/.test(compactPlate);
}

function isVehicleModelLine(line: string) {
  if (hasFieldLabel(line) || isPhoneLikeLine(line) || isSingaporePlateLine(line) || /\d{5,}/.test(line)) {
    return false;
  }

  return vehicleModelPattern.test(line);
}

function isNameLikeLine(line: string) {
  if (hasFieldLabel(line) || isPhoneLikeLine(line) || isSingaporePlateLine(line) || isVehicleModelLine(line)) {
    return false;
  }

  return /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(line);
}

function freeformLineValue(lines: string[], predicate: (line: string) => boolean) {
  for (const line of lines) {
    if (!isPaymentDetailLine(line) && predicate(line)) {
      return line;
    }
  }

  return "";
}

function parseDriverDetailsText(text: string): ParsedDriverDetails {
  const lines = driverDetailLines(text);
  const labelledMobile = lineValue(text, ["contact", "mobile", "phone", "tel", "telephone", "hp", "handphone"]);
  const labelledName = lineValue(text, ["driver name", "name", "driver"]);
  const labelledPlate = lineValue(text, ["car plate", "plate number", "plate", "vehicle no", "car no"]);
  const labelledVehicleModel = lineValue(text, ["brand", "vehicle", "vehicle model", "car model", "model"]);

  return {
    mobile: labelledMobile || freeformLineValue(lines, isPhoneLikeLine),
    name: labelledName || freeformLineValue(lines, isNameLikeLine),
    paymentDetailsDetected: lines.some(isPaymentDetailLine),
    plate: labelledPlate || freeformLineValue(lines, isSingaporePlateLine),
    vehicleModel: labelledVehicleModel || freeformLineValue(lines, isVehicleModelLine),
  };
}

export default function DriverJobDemoPage() {
  const [driverDetails, setDriverDetails] = useState<DriverDetails>({
    name: "",
    mobile: "",
    plate: "",
    vehicleModel: "",
  });
  const [pastedDriverDetails, setPastedDriverDetails] = useState("");
  const [parseFeedback, setParseFeedback] = useState<ParseFeedback | null>(null);
  const [paymentHelperVisible, setPaymentHelperVisible] = useState(false);
  const [detailsFeedback, setDetailsFeedback] = useState<ParseFeedback | null>(null);
  const [status, setStatus] = useState("Assigned");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusMessageTarget, setStatusMessageTarget] = useState("");

  function updateDriverDetail(field: keyof DriverDetails, value: string) {
    setDetailsFeedback(null);
    setDriverDetails((currentDetails) => ({
      ...currentDetails,
      [field]: value,
    }));
  }

  function parsePastedDriverDetails() {
    const parsedDetails = parseDriverDetailsText(pastedDriverDetails);
    const nextDetails = {
      mobile: parsedDetails.mobile || driverDetails.mobile,
      name: parsedDetails.name || driverDetails.name,
      plate: parsedDetails.plate || driverDetails.plate,
      vehicleModel: parsedDetails.vehicleModel || driverDetails.vehicleModel,
    };
    const detectedFieldCount = [
      parsedDetails.name,
      parsedDetails.mobile,
      parsedDetails.plate,
      parsedDetails.vehicleModel,
    ].filter(Boolean).length;

    setPaymentHelperVisible(parsedDetails.paymentDetailsDetected);

    if (detectedFieldCount === 0) {
      setParseFeedback({
        tone: "warning",
        text: "No driver details detected. Please check the pasted text.",
      });
      return;
    }

    setDriverDetails(nextDetails);
    setDetailsFeedback(null);
    setParseFeedback({
      tone: "success",
      text: "Driver details parsed. Please review before saving.",
    });
  }

  function saveDriverDetails() {
    const nextDetails = cleanDriverDetails(driverDetails);

    setDriverDetails(nextDetails);

    if (!nextDetails.name && !nextDetails.mobile && !nextDetails.plate) {
      setDetailsFeedback({
        tone: "error",
        text: "Enter driver name, mobile number, or car plate before saving.",
      });
      return;
    }

    if (!nextDetails.name) {
      setDetailsFeedback({
        tone: "error",
        text: "Driver name is required before saving.",
      });
      return;
    }

    setDetailsFeedback({
      tone: "warning",
      text: "Driver link page details saved. Driver Database update requires a secure driver job link.",
    });
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
              <span>Paste Driver Details</span>
              <textarea
                className="min-h-32 w-full rounded-md border border-stone-300 bg-white px-3 py-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                data-driver-demo-paste-details="true"
                onChange={(event) => setPastedDriverDetails(event.target.value)}
                value={pastedDriverDetails}
              />
            </label>
            <div className="space-y-2">
              <button
                className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700"
                data-driver-demo-parse-details="true"
                onClick={parsePastedDriverDetails}
                type="button"
              >
                Parse Driver Details
              </button>
              {parseFeedback ? (
                <p
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(parseFeedback.tone)}`}
                  data-driver-demo-parse-message="true"
                >
                  {parseFeedback.text}
                </p>
              ) : null}
              {paymentHelperVisible ? (
                <p
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
                  data-driver-demo-payment-helper="true"
                >
                  Payment details were detected but not saved in this demo.
                </p>
              ) : null}
            </div>
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
                Save
              </button>
              {detailsFeedback ? (
                <p
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(detailsFeedback.tone)}`}
                  data-driver-demo-details-message="true"
                >
                  {detailsFeedback.text}
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
