"use client";

import { useState } from "react";
import {
  guardDriverJobStatusTransition,
  validateDriverJobStatusUpdate,
} from "../../lib/driver-job-status-workflow";

type DriverDetails = {
  name: string;
  mobile: string;
  payNowNumber: string;
  plate: string;
  vehicleModel: string;
};

type ParseFeedback = {
  tone: "error" | "success" | "warning";
  text: string;
};

type TargetedFeedback = ParseFeedback & {
  target: string;
};

type ParsedDriverDetails = Partial<DriverDetails> & {
  paymentDetailsDetected: boolean;
};

type ActivityLogEvent = {
  detail: string;
  id: number;
  label: string;
  time: string;
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
  { label: "OTW", message: "Status updated: OTW", value: "OTW" },
  { label: "OTS", message: "Status updated: OTS", value: "OTS" },
  { label: "POB", message: "Status updated: POB", value: "POB" },
  { label: "Job Completed", message: "Status updated: Completed", value: "Job Completed" },
];

const dispatcherExceptionActions = [
  {
    feedback:
      "Mock cancel note recorded locally. No real driver assignment was cancelled and no cancel API was called.",
    key: "cancel-assignment",
    label: "Cancel current driver assignment — Mock Only",
  },
  {
    feedback:
      "Mock replacement details note recorded locally. No replacement car or driver details were saved to any live system.",
    key: "replacement-details",
    label: "Replacement driver/car details — Mock Only",
  },
  {
    feedback:
      "Future reassign placeholder acknowledged locally. No reassign API or dispatch change was called.",
    key: "reassign-later",
    label: "Reassign replacement driver later — Future staff-controlled workflow",
  },
];

const bankDetailsPattern = /\b(bank|account|acct)\b/i;
const payNowDetailsPattern = /\b(paynow|pay\s+now)\b/i;
const vehicleModelPattern =
  /\b(alphard|vellfire|hiace|mercedes|benz|bmw|audi|toyota|honda|hyundai|kia|lexus|estima|camry|viano|voxy|noah|prius|combi|maxi\s?cab|mpv|van|bus|e\s?class|s\s?class)\b/i;
const isArrivalStyleDemoJob = true;
const mockLatestFlightEta = "15:45";

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
    payNowNumber: cleanParsedValue(details.payNowNumber),
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

function hasReachedOts(status: string) {
  const normalizedStatus = validateDriverJobStatusUpdate(status);

  return normalizedStatus === "ots" || normalizedStatus === "pob" || normalizedStatus === "completed";
}

function workflowStepIndex(status: string) {
  const normalizedStatus = validateDriverJobStatusUpdate(status);

  if (normalizedStatus === "driver_otw") {
    return 0;
  }

  if (normalizedStatus === "ots") {
    return 1;
  }

  if (normalizedStatus === "pob") {
    return 2;
  }

  if (normalizedStatus === "completed") {
    return 3;
  }

  return -1;
}

function hasReachedOtw(status: string) {
  return workflowStepIndex(status) >= 0;
}

function hasReachedPassengerPickup(status: string) {
  const normalizedStatus = validateDriverJobStatusUpdate(status);

  return normalizedStatus === "pob" || normalizedStatus === "completed";
}

function hasReachedCompleted(status: string) {
  return validateDriverJobStatusUpdate(status) === "completed";
}

function workflowChecklistState(done: boolean) {
  return done ? "Done" : "Pending";
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
  return payNowDetailsPattern.test(line) || bankDetailsPattern.test(line);
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

function cleanPayNowNumber(value: string) {
  return cleanParsedValue(
    value
      .replace(/\bpay\s*now\b/gi, " ")
      .replace(/[()]/g, " ")
      .replace(/[:=-]/g, " "),
  );
}

function payNowNumberValue(text: string, lines: string[]) {
  const labelledPayNow = lineValue(text, ["paynow", "pay now", "paynow number", "pay now number"]);

  if (labelledPayNow) {
    return cleanPayNowNumber(labelledPayNow);
  }

  const payNowLine = lines.find((line) => payNowDetailsPattern.test(line));

  return payNowLine ? cleanPayNowNumber(payNowLine) : "";
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
    payNowNumber: payNowNumberValue(text, lines),
    plate: labelledPlate || freeformLineValue(lines, isSingaporePlateLine),
    vehicleModel: labelledVehicleModel || freeformLineValue(lines, isVehicleModelLine),
  };
}

function activityTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DriverJobDemoPage() {
  const [driverDetails, setDriverDetails] = useState<DriverDetails>({
    name: "",
    mobile: "",
    payNowNumber: "",
    plate: "",
    vehicleModel: "",
  });
  const [pastedDriverDetails, setPastedDriverDetails] = useState("");
  const [parseFeedback, setParseFeedback] = useState<ParseFeedback | null>(null);
  const [paymentHelperVisible, setPaymentHelperVisible] = useState(false);
  const [detailsFeedback, setDetailsFeedback] = useState<ParseFeedback | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [acknowledgementFeedback, setAcknowledgementFeedback] = useState<ParseFeedback | null>(null);
  const [mockLiveLocationActive, setMockLiveLocationActive] = useState(false);
  const [mockLiveLocationFeedback, setMockLiveLocationFeedback] = useState<ParseFeedback | null>(null);
  const [mockReminderFeedback, setMockReminderFeedback] = useState<ParseFeedback | null>(null);
  const [mockDriverReminderState, setMockDriverReminderState] = useState("Not triggered");
  const [mockDriverReminderStatus, setMockDriverReminderStatus] = useState("Pending local trigger");
  const [mockDispatcherNotificationLog, setMockDispatcherNotificationLog] = useState("");
  const [mockLatestEtaAcknowledged, setMockLatestEtaAcknowledged] = useState(false);
  const [mockLatestEtaFeedback, setMockLatestEtaFeedback] = useState<ParseFeedback | null>(null);
  const [mockOtsPhotoProofAdded, setMockOtsPhotoProofAdded] = useState(false);
  const [mockOtsPhotoProofFeedback, setMockOtsPhotoProofFeedback] = useState<ParseFeedback | null>(null);
  const [dispatcherExceptionFeedback, setDispatcherExceptionFeedback] = useState<TargetedFeedback | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEvent[]>([]);
  const [status, setStatus] = useState("Assigned");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusMessageTone, setStatusMessageTone] = useState<ParseFeedback["tone"]>("success");
  const [statusMessageTarget, setStatusMessageTarget] = useState("");
  const showMockLatestFlightEta = isArrivalStyleDemoJob;
  const showMockOtsPhotoProof = isArrivalStyleDemoJob && hasReachedOts(status);
  const mockDispatcherWorkflowChecklist = [
    {
      key: "job-acknowledged",
      label: "Job acknowledged",
      value: acknowledged ? "Acknowledged" : "Waiting",
    },
    {
      key: "reminder-status",
      label: "Mock 1-hour reminder status",
      value: `${mockDriverReminderStatus} (${mockDriverReminderState})`,
    },
    ...(showMockLatestFlightEta
      ? [
          {
            key: "latest-eta",
            label: "Arrival/MNG latest ETA acknowledged",
            value: mockLatestEtaAcknowledged ? "Acknowledged" : "Pending acknowledgement",
          },
        ]
      : []),
    {
      key: "otw",
      label: "OTW",
      value: workflowChecklistState(hasReachedOtw(status)),
    },
    {
      key: "ots",
      label: "OTS",
      value: workflowChecklistState(hasReachedOts(status)),
    },
    ...(isArrivalStyleDemoJob
      ? [
          {
            key: "ots-photo-proof",
            label: "Arrival/MNG mock OTS photo proof added",
            value: mockOtsPhotoProofAdded ? "Added" : "Pending proof",
          },
        ]
      : []),
    {
      key: "pob",
      label: "POB",
      value: workflowChecklistState(hasReachedPassengerPickup(status)),
    },
    {
      key: "completed",
      label: "Job Completed",
      value: workflowChecklistState(hasReachedCompleted(status)),
    },
    {
      key: "live-location",
      label: "Mock live location state",
      value: mockLiveLocationActive ? "Active" : "Inactive",
    },
    {
      key: "dispatcher-log",
      label: "Mock dispatcher notification log",
      value: mockDispatcherNotificationLog || "No mock dispatcher notification recorded yet.",
    },
  ];

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
      payNowNumber: parsedDetails.payNowNumber || driverDetails.payNowNumber,
      plate: parsedDetails.plate || driverDetails.plate,
      vehicleModel: parsedDetails.vehicleModel || driverDetails.vehicleModel,
    };
    const detectedFieldCount = [
      parsedDetails.name,
      parsedDetails.mobile,
      parsedDetails.payNowNumber,
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
      tone: "success",
      text: "Driver details saved locally for this mock driver page.",
    });
    addActivity("Mock driver details saved", "Driver name/contact/vehicle/PayNow details were saved locally.");
  }

  function acknowledgeLatestEta() {
    if (!showMockLatestFlightEta || mockLatestEtaAcknowledged) {
      return;
    }

    setMockLatestEtaAcknowledged(true);
    setMockLatestEtaFeedback({
      tone: "success",
      text: "Latest mock flight ETA acknowledged locally. No real flight API or notification was used.",
    });
    setStatusMessage("");
    setStatusMessageTarget("");
    addActivity("Latest ETA acknowledged", "Driver acknowledged the latest mock flight ETA locally.");
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
    setStatusMessage("");
    setStatusMessageTarget("");
    addActivity(
      "Mock OTS photo proof added",
      "Mock/local OTS photo proof was added. No file upload, camera, or storage was used.",
    );
  }

  function markDispatcherExceptionPlaceholder(action: (typeof dispatcherExceptionActions)[number]) {
    setDispatcherExceptionFeedback({
      target: action.key,
      text: action.feedback,
      tone: "success",
    });
  }

  function acknowledgeJob() {
    setAcknowledged(true);
    setStatusMessage("");
    setStatusMessageTarget("");
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

    if (status === "POB" || status === "Job Completed") {
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

  function triggerMockDriverReminder() {
    if (hasReachedPassengerPickup(status)) {
      setMockReminderFeedback({
        tone: "error",
        text: "Mock reminder is blocked after POB or Job Completed.",
      });
      setMockDriverReminderState("Blocked");
      setMockDriverReminderStatus("Blocked locally");
      setMockDispatcherNotificationLog(
        "Mock dispatcher notification log: Reminder blocked locally after POB or Job Completed. Mock only. No message was sent.",
      );
      addActivity("Mock reminder blocked", "Mock reminder was blocked after POB or Job Completed. No message was sent.");
      return;
    }

    setMockReminderFeedback({
      tone: "success",
      text: "Mock 1-hour reminder triggered locally. No real notification, WhatsApp, or SMS was sent.",
    });
    setMockDriverReminderState("Triggered");
    setMockDriverReminderStatus("Triggered locally");
    setMockDispatcherNotificationLog(
      "Mock dispatcher notification log: Driver reminder recorded locally. Mock only. No message was sent.",
    );
    addActivity(
      "Mock 1-hour reminder triggered",
      "Mock reminder tells the driver to activate mock live location and continue the workflow.",
    );
  }

  function updateStatus(nextStatus: string, label: string, message: string) {
    const transitionGuard = guardDriverJobStatusTransition({
      acknowledged,
      currentStatus: status,
      nextStatus,
    });

    if (!transitionGuard.ok) {
      setStatusMessage(transitionGuard.message);
      setStatusMessageTone("error");
      setStatusMessageTarget(label);
      return;
    }

    if (transitionGuard.status === "driver_otw" && isArrivalStyleDemoJob && !mockLatestEtaAcknowledged) {
      setStatusMessage("Acknowledge latest mock flight ETA before OTW.");
      setStatusMessageTone("error");
      setStatusMessageTarget(label);
      addActivity("OTW blocked", "OTW was blocked because latest ETA acknowledgement is missing.");
      return;
    }

    if (transitionGuard.status === "pob" && isArrivalStyleDemoJob && !mockOtsPhotoProofAdded) {
      setStatusMessage("Add mock OTS photo proof before POB.");
      setStatusMessageTone("error");
      setStatusMessageTarget(label);
      addActivity("POB blocked", "POB was blocked because OTS photo proof is missing.");
      return;
    }

    setStatus(nextStatus);
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

    setStatusMessage(
      transitionGuard.status === "pob" && mockLiveLocationActive
        ? "Status updated: POB. Mock live location ended locally."
        : message,
    );
    setStatusMessageTone("success");
    setStatusMessageTarget(nextStatus);
    addActivity(`${label} marked`, `Driver status updated to ${label}.`);
    if (transitionGuard.status === "ots" && isArrivalStyleDemoJob) {
      addActivity("OTS photo proof requested", "Mock/local OTS photo proof is required before POB.");
    }
    if (transitionGuard.status === "pob" && mockLiveLocationActive) {
      addActivity("Mock live location auto-ended at POB", "Local mock live location state ended after POB.");
    }
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

        <section
          className="space-y-3"
          aria-labelledby="driver-demo-workflow-summary-heading"
          data-driver-demo-workflow-summary="true"
        >
          <h2 id="driver-demo-workflow-summary-heading" className="text-base font-semibold text-slate-900">
            Mock Dispatcher Driver Workflow Summary
          </h2>
          <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-600">
              Mock/local only. Dispatcher-facing workflow checklist for this mock driver page.
            </p>
            <dl className="grid gap-2">
              {mockDispatcherWorkflowChecklist.map((item) => (
                <div
                  className="grid gap-1 rounded-md bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200"
                  data-driver-demo-workflow-summary-row={item.key}
                  key={item.key}
                >
                  <dt className="font-semibold text-slate-500" data-driver-demo-workflow-summary-label="true">
                    {item.label}
                  </dt>
                  <dd
                    className="break-words font-semibold text-slate-800"
                    data-driver-demo-workflow-summary-value="true"
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="font-semibold text-slate-800" data-driver-demo-workflow-summary-mock-only="true">
              Mock only. No real message was sent.
            </p>
          </div>
        </section>

        <section
          className="space-y-3"
          aria-labelledby="driver-demo-dispatcher-exception-heading"
          data-driver-demo-dispatcher-exception="true"
        >
          <h2 id="driver-demo-dispatcher-exception-heading" className="text-base font-semibold text-slate-900">
            Dispatcher Exception / Replacement — Mock Only
          </h2>
          <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
            <p
              className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
              data-driver-demo-dispatcher-exception-mock-only="true"
            >
              Staff/demo placeholder only. Not shown on the secure public driver token page.
            </p>
            <p className="text-sm font-medium text-slate-600">
              Mock/local only for car breakdown, driver missed job, late driver, replacement car, and
              replacement driver planning. No real cancel/reassign API, Supabase write, notification, or
              dispatch change runs from this demo.
            </p>
            <div className="grid gap-3">
              {dispatcherExceptionActions.map((action) => (
                <div className="space-y-2" key={action.key}>
                  <button
                    className="min-h-12 w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 transition active:bg-slate-100"
                    data-driver-demo-dispatcher-exception-action={action.key}
                    onClick={() => markDispatcherExceptionPlaceholder(action)}
                    type="button"
                  >
                    {action.label}
                  </button>
                  {dispatcherExceptionFeedback?.target === action.key ? (
                    <p
                      className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(dispatcherExceptionFeedback.tone)}`}
                      data-driver-demo-dispatcher-exception-message={action.key}
                    >
                      {dispatcherExceptionFeedback.text}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="driver-acknowledgement-heading">
          <h2 id="driver-acknowledgement-heading" className="text-base font-semibold text-slate-900">
            Job Acknowledgement
          </h2>
          <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
            <p
              className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
              data-driver-demo-acknowledged-state="true"
            >
              {acknowledged ? "Acknowledged" : "Waiting for driver acknowledgement"}
            </p>
            <div className="space-y-2">
              <button
                className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700"
                data-driver-demo-acknowledge="true"
                onClick={acknowledgeJob}
                type="button"
              >
                Acknowledge Job
              </button>
              {acknowledgementFeedback ? (
                <p
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(acknowledgementFeedback.tone)}`}
                  data-driver-demo-acknowledge-message="true"
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
              data-driver-demo-live-location-state="true"
            >
              {mockLiveLocationActive ? "Mock live location active" : "Mock live location inactive"}
            </p>
            <p className="text-sm font-medium text-slate-600">
              Mock/local only. No phone location is captured or sent.
            </p>
            <div className="space-y-2">
              <button
                className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700"
                data-driver-demo-live-location="true"
                onClick={activateMockLiveLocation}
                type="button"
              >
                Activate Mock Live Location
              </button>
              {mockLiveLocationFeedback ? (
                <p
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(mockLiveLocationFeedback.tone)}`}
                  data-driver-demo-live-location-message="true"
                >
                  {mockLiveLocationFeedback.text}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section
          className="space-y-3"
          aria-labelledby="driver-demo-reminder-heading"
          data-driver-demo-reminder-section="true"
        >
          <h2 id="driver-demo-reminder-heading" className="text-base font-semibold text-slate-900">
            Mock Driver Reminder
          </h2>
          <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-600">
              Mock/local only. No real notification, WhatsApp, or SMS is sent.
            </p>
            <p
              className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
              data-driver-demo-reminder-timing="true"
            >
              Mock reminder: 1 hour before pickup
            </p>
            <p className="text-sm font-medium text-slate-600">
              Reminder tells the driver to activate mock live location and continue workflow.
            </p>
            <div
              className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700"
              data-driver-demo-reminder-summary="true"
            >
              <p className="font-semibold text-slate-900">Mock dispatcher reminder summary</p>
              <dl className="grid gap-2">
                <div className="grid gap-1">
                  <dt className="font-semibold text-slate-500">Mock driver reminder status</dt>
                  <dd data-driver-demo-reminder-summary-status="true">{mockDriverReminderStatus}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="font-semibold text-slate-500">Reminder triggered / blocked state</dt>
                  <dd data-driver-demo-reminder-summary-state="true">{mockDriverReminderState}</dd>
                </div>
                <div className="grid gap-1">
                  <dt className="font-semibold text-slate-500">Mock dispatcher notification log</dt>
                  <dd data-driver-demo-reminder-summary-log="true">
                    {mockDispatcherNotificationLog || "No mock dispatcher notification recorded yet."}
                  </dd>
                </div>
              </dl>
              <p className="font-semibold text-slate-800" data-driver-demo-reminder-summary-mock-only="true">
                Mock only. No real message was sent.
              </p>
            </div>
            <div className="space-y-2">
              <button
                className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700"
                data-driver-demo-reminder="true"
                onClick={triggerMockDriverReminder}
                type="button"
              >
                Trigger Mock 1-Hour Reminder
              </button>
              {mockReminderFeedback ? (
                <p
                  className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(mockReminderFeedback.tone)}`}
                  data-driver-demo-reminder-message="true"
                >
                  {mockReminderFeedback.text}
                </p>
              ) : null}
              {mockDispatcherNotificationLog ? (
                <p
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
                  data-driver-demo-dispatcher-notification-log="true"
                >
                  {mockDispatcherNotificationLog}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {showMockLatestFlightEta ? (
          <section
            className="space-y-3"
            aria-labelledby="driver-demo-latest-eta-heading"
            data-driver-demo-latest-eta-section="true"
          >
            <h2 id="driver-demo-latest-eta-heading" className="text-base font-semibold text-slate-900">
              Mock Latest Flight ETA
            </h2>
            <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
              <p
                className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                data-driver-demo-latest-eta-state="true"
              >
                {mockLatestEtaAcknowledged
                  ? "Latest mock flight ETA acknowledged"
                  : "Latest mock flight ETA acknowledgement required before OTW"}
              </p>
              <p className="text-sm font-medium text-slate-600">
                Mock/local only. No real flight API is called and no notification is sent.
              </p>
              <p
                className="text-sm font-semibold text-slate-800"
                data-driver-demo-latest-eta-value="true"
              >
                Latest mock flight ETA: {mockLatestFlightEta}
              </p>
              <div className="space-y-2">
                <button
                  className="h-12 w-full rounded-md bg-slate-950 px-4 text-base font-semibold text-white transition active:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  data-driver-demo-latest-eta="true"
                  disabled={mockLatestEtaAcknowledged}
                  onClick={acknowledgeLatestEta}
                  type="button"
                >
                  Acknowledge Latest ETA
                </button>
                {mockLatestEtaFeedback ? (
                  <p
                    className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(mockLatestEtaFeedback.tone)}`}
                    data-driver-demo-latest-eta-message="true"
                  >
                    {mockLatestEtaFeedback.text}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {showMockOtsPhotoProof ? (
          <section
            className="space-y-3"
            aria-labelledby="driver-demo-ots-photo-proof-heading"
            data-driver-demo-ots-photo-proof-section="true"
          >
            <h2 id="driver-demo-ots-photo-proof-heading" className="text-base font-semibold text-slate-900">
              Mock OTS Photo Proof
            </h2>
            <div className="space-y-3 rounded-md border border-stone-200 bg-white p-3">
              <p
                className="rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                data-driver-demo-ots-photo-proof-state="true"
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
                  data-driver-demo-ots-photo-proof="true"
                  disabled={mockOtsPhotoProofAdded}
                  onClick={addMockOtsPhotoProof}
                  type="button"
                >
                  Add Mock OTS Photo Proof
                </button>
                {mockOtsPhotoProofFeedback ? (
                  <p
                    className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(mockOtsPhotoProofFeedback.tone)}`}
                    data-driver-demo-ots-photo-proof-message="true"
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
                  PayNow or bank details were detected. PayNow is local driver info only; no payment or bank action is created.
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
              <span>Contact / Mobile number</span>
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
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              <span>PayNow number</span>
              <input
                className="h-12 w-full rounded-md border border-stone-300 bg-white px-3 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                data-driver-demo-paynow="true"
                inputMode="tel"
                onChange={(event) => updateDriverDetail("payNowNumber", event.target.value)}
                type="tel"
                value={driverDetails.payNowNumber}
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

        <section className="space-y-3" aria-labelledby="driver-activity-log-heading">
          <h2 id="driver-activity-log-heading" className="text-base font-semibold text-slate-900">
            Driver Activity Log
          </h2>
          <div
            className="space-y-3 rounded-md border border-stone-200 bg-white p-3"
            data-driver-demo-activity-log="true"
          >
            {activityLog.length > 0 ? (
              <ol className="space-y-2">
                {activityLog.map((event) => (
                  <li
                    className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700 ring-1 ring-slate-200"
                    data-driver-demo-activity-log-item="true"
                    key={event.id}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold" data-driver-demo-activity-log-label="true">
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
            {statusOptions.map((statusOption) => (
              <div className="space-y-2" key={statusOption.label}>
                <button
                  className="h-12 w-full rounded-md border border-slate-300 bg-white px-4 text-base font-semibold text-slate-900 transition active:bg-slate-100"
                  data-driver-demo-status={statusOption.label}
                  onClick={() => updateStatus(statusOption.label, statusOption.label, statusOption.message)}
                  type="button"
                >
                  {statusOption.label}
                </button>
                {statusMessageTarget === statusOption.label ? (
                  <p
                    className={`rounded-md border px-3 py-2 text-sm font-semibold ${feedbackClassName(statusMessageTone)}`}
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
