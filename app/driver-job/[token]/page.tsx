"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SafeDriverJobPayload,
  SafeDriverJobStatusHistoryItem,
} from "../../../lib/driver-job-link";
import {
  driverJobIssueChoices,
  getDriverJobIssueChoice,
} from "../../../lib/driver-job-issue-alert";
import {
  driverJobStatusDisplayLabels,
  guardDriverJobStatusTransition,
} from "../../../lib/driver-job-status-workflow";

type DriverJobApiBlockedReason =
  | "already_completed"
  | "expired"
  | "invalid_details"
  | "invalid_status"
  | "out_of_order"
  | "revoked"
  | "unauthorized"
  | "unavailable";

type DriverJobApiResponse =
  | {
      device_alerts?: DriverDeviceAlertApiState;
      driver_portal?: {
        enrolled: boolean;
        link_key: string | null;
      };
      ok: true;
      mode: "mock" | "production";
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

type DriverCalendarApiResponse =
  | {
      action?: "authorize" | "saved" | "status";
      google_consent_url?: string;
      connected?: boolean;
      ok: true;
      status: "cal_saved" | "save_to_calendar" | "update_calendar";
    }
  | {
      ok: false;
      reason?:
        | "expired"
        | "invalid_oauth"
        | "not_acknowledged"
        | "not_configured"
        | "provider_failed"
        | "revoked"
        | "unauthorized"
        | "unverified_driver";
    };

type DriverCalendarBlockedReason =
  | "expired"
  | "invalid_oauth"
  | "not_acknowledged"
  | "not_configured"
  | "provider_failed"
  | "revoked"
  | "unauthorized"
  | "unverified_driver"
  | undefined;

type DriverCalendarState = {
  action: "idle" | "saving";
  connected: boolean;
  feedback: ControlFeedback | null;
  status: "cal_saved" | "loading" | "save_to_calendar" | "unavailable" | "update_calendar";
};

type DriverQuickReplyState = {
  feedback: ControlFeedback | null;
  sendingKey: string;
};

type DriverAppUpdateRecord = {
  created_at?: string | null;
  id?: string | null;
  notification_status?: string | null;
  priority?: string | null;
  safe_message?: string | null;
  safe_title?: string | null;
  updated_at?: string | null;
};

type DriverAppUpdateApiResponse =
  | {
      notifications?: DriverAppUpdateRecord[];
      ok: true;
    }
  | {
      error?: string;
      ok: false;
    };

type DriverIssueAlertApiResponse =
  | {
      alert?: {
        issue_label?: string | null;
        issue_type?: string | null;
        notification_status?: string | null;
      };
      external_send?: false;
      ok: true;
    }
  | {
      error?: string;
      ok: false;
      reason?: DriverJobApiBlockedReason;
    };

type DriverLiveLocationApiResponse =
  | {
      customerVisible?: false;
      external_send?: false;
      last_shared_at?: string | null;
      ok: true;
      sharing_state?: string | null;
      stale_after?: string | null;
    }
  | {
      customerVisible?: false;
      external_send?: false;
      ok: false;
      reason?: string;
    };

type DriverOtsPhotoProofApiResponse =
  | {
      mode?: "mock" | "production";
      ok: true;
      proof?: {
        customerVisible?: false;
        external_send?: false;
        uploaded_at?: string | null;
      };
    }
  | {
      ok: false;
      reason?: DriverJobApiBlockedReason | "invalid_file" | "not_configured" | "ots_required" | "storage_failed" | "too_large" | "unsupported_type";
      proof?: null;
    };

type DriverAppUpdateState = {
  feedback: ControlFeedback | null;
  kind: "idle" | "loading" | "loaded" | "empty" | "unavailable" | "error";
  updates: DriverAppUpdateRecord[];
};

type DriverDeviceAlertApiState = {
  enabled?: boolean;
  link_key?: string | null;
  public_key?: string | null;
  ready?: boolean;
  reason?: string;
  subscription_registered?: boolean;
  version?: string;
};

type DriverDeviceAlertReadiness = {
  enabled: boolean;
  publicKey: string;
  ready: boolean;
};

type DriverDeviceAlertPreparation = {
  permission: "denied" | "granted" | "not_requested" | "unavailable";
  registration: ServiceWorkerRegistration | null;
  subscription: PushSubscriptionJSON | null;
};

type DriverLiveLocationBrowserPosition = {
  coords: {
    accuracy: number;
    heading: number | null;
    latitude: number;
    longitude: number;
    speed: number | null;
  };
  timestamp: number;
};

type DriverLiveLocationState = {
  action: "idle" | "sharing" | "stopping";
  feedback: ControlFeedback | null;
  lastSharedAt: string;
  permissionState: "denied" | "granted" | "not_requested" | "unavailable";
  sharingState: "active" | "inactive" | "stopped";
  staleState: "active" | "inactive" | "stale";
};

type DriverOtsPhotoProofState = {
  action: "idle" | "uploading";
  feedback: ControlFeedback | null;
  selectedFileName: string;
  uploadedAt: string;
};

type DriverDetails = {
  contact: string;
  name: string;
  plate: string;
  vehicleModel: string;
};

type ParsedDriverDetails = Partial<DriverDetails>;

type ActivityLogEvent = {
  detail: string;
  id: number;
  label: string;
  time: string;
};

type DriverStatusTimingStep = {
  aliases: string[];
  key: string;
  label: string;
};

type DriverStatusTimingRow = {
  key: string;
  label: string;
  occurredAt: string;
  timeText: string;
};

const statusActions = [
  { displayLabel: "I'm on the way", label: "OTW", value: "OTW" },
  { displayLabel: "I've arrived", label: "OTS", value: "OTS" },
  { displayLabel: "Passenger on board", label: "POB", value: "POB" },
  { displayLabel: "Completed", label: "Job Completed", value: "Job Completed" },
] as const;

const driverCustomerQuickReplies = [
  { key: "driver_on_the_way", label: "I am on the way." },
  { key: "driver_arrived", label: "I have arrived." },
  { key: "driver_meet_pickup", label: "Please meet me at pickup point." },
  { key: "driver_waiting_nearby", label: "I am waiting nearby." },
] as const;

const statusTimingSteps: DriverStatusTimingStep[] = [
  { aliases: ["driver_otw", "otw"], key: "otw", label: "I'm on the way" },
  { aliases: ["ots"], key: "ots", label: "I've arrived" },
  { aliases: ["pob"], key: "pob", label: "Passenger on board" },
  { aliases: ["completed", "job_completed"], key: "jc", label: "Completed" },
];

const emptyDriverDetails: DriverDetails = {
  contact: "",
  name: "",
  plate: "",
  vehicleModel: "",
};

const driverPaymentDetailLinePattern = /\b(bank|account|acct|paynow|pay\s+now|payment|payout)\b/i;
const vehicleModelPattern =
  /\b(alphard|vellfire|hiace|mercedes|benz|bmw|audi|toyota|honda|hyundai|kia|lexus|estima|camry|viano|voxy|noah|prius|combi|maxi\s?cab|mpv|van|bus|e\s?class|s\s?class)\b/i;

const emptyDriverAppUpdateState: DriverAppUpdateState = {
  feedback: null,
  kind: "idle",
  updates: [],
};
const emptyDriverDeviceAlertReadiness: DriverDeviceAlertReadiness = {
  enabled: false,
  publicKey: "",
  ready: false,
};
const defaultAcknowledgedDetailsFeedback = {
  tone: "success" as const,
  text: "Driver details saved and job acknowledged.",
};

const emptyDriverLiveLocationState: DriverLiveLocationState = {
  action: "idle",
  feedback: null,
  lastSharedAt: "",
  permissionState: "not_requested",
  sharingState: "inactive",
  staleState: "inactive",
};
const emptyDriverOtsPhotoProofState: DriverOtsPhotoProofState = {
  action: "idle",
  feedback: null,
  selectedFileName: "",
  uploadedAt: "",
};
const emptyDriverCalendarState: DriverCalendarState = {
  action: "idle",
  connected: false,
  feedback: null,
  status: "loading",
};
const driverLiveLocationContinuousShareMinMs = 5000;
const driverLiveLocationPositionOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 15000,
};

const blockedMessages: Record<DriverJobApiBlockedReason, string> = {
  already_completed: "This job is already completed. Contact dispatch if this is incorrect.",
  expired: "This driver job link has expired. Please contact dispatch for a fresh link.",
  invalid_details: "Driver details were not accepted. Check the name and contact dispatch if this continues.",
  invalid_status: "This status update was not accepted. Please try again or contact dispatch.",
  out_of_order: "Update the previous job status before this one.",
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
const driverWorkflowStatusOrder = ["driver_otw", "ots", "pob", "completed"];
const driverOtsPhotoMaxRequestBytes = 4 * 1024 * 1024;
const driverOtsPhotoMaxDimension = 1600;
const driverOtsPhotoJpegQualities = [0.82, 0.68, 0.54];

type PreparedDriverOtsPhoto = {
  blob: Blob;
  fileName: string;
};

function normalizeBlockedReason(value: unknown): DriverJobApiBlockedReason {
  return value === "already_completed" ||
    value === "expired" ||
    value === "revoked" ||
    value === "unauthorized" ||
    value === "invalid_details" ||
    value === "invalid_status" ||
    value === "out_of_order"
    ? value
    : "unavailable";
}

function driverWorkflowHasReachedOts(status: string) {
  return driverWorkflowStatusOrder.indexOf(status) >= driverWorkflowStatusOrder.indexOf("ots");
}

function driverOtsPhotoReducedFileName(fileName: string) {
  const stem = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${stem || "ots-photo"}-reduced.jpg`;
}

function driverOtsPhotoCanvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

async function prepareDriverOtsPhotoForUpload(file: File): Promise<PreparedDriverOtsPhoto | null> {
  if (file.size <= driverOtsPhotoMaxRequestBytes) {
    return {
      blob: file,
      fileName: file.name || "ots-photo.jpg",
    };
  }

  try {
    const imageBitmap = await createImageBitmap(file);

    try {
      const largestDimension = Math.max(imageBitmap.width, imageBitmap.height);
      const scale = Math.min(1, driverOtsPhotoMaxDimension / largestDimension);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
      canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));
      const context = canvas.getContext("2d");

      if (!context) {
        return null;
      }

      context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of driverOtsPhotoJpegQualities) {
        const reducedPhoto = await driverOtsPhotoCanvasBlob(canvas, quality);

        if (
          reducedPhoto &&
          reducedPhoto.size > 0 &&
          reducedPhoto.size <= driverOtsPhotoMaxRequestBytes
        ) {
          return {
            blob: reducedPhoto,
            fileName: driverOtsPhotoReducedFileName(file.name),
          };
        }
      }

      return null;
    } finally {
      imageBitmap.close();
    }
  } catch {
    return null;
  }
}

function otsPhotoProofBlockedMessage(reason: unknown) {
  if (reason === "ots_required") {
    return "Press OTS before sending the photo to admin.";
  }

  if (reason === "invalid_file") {
    return "Choose a photo before sending.";
  }

  if (reason === "too_large") {
    return "Photo is too large. Send a smaller photo.";
  }

  if (reason === "unsupported_type") {
    return "Photo type was not accepted. Use JPEG, PNG, WebP, HEIC, or HEIF.";
  }

  if (reason === "not_configured" || reason === "storage_failed") {
    return "Admin photo storage is not ready. Contact dispatch.";
  }

  return blockedMessages[normalizeBlockedReason(reason)] || "Photo could not be sent. Contact dispatch.";
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanParsedValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function lineValue(text: string, labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const matcher = new RegExp(`^\\s*(?:${labelPattern})\\s*(?::|=|-)\\s*(.+?)\\s*$`, "i");

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(matcher);

    if (match?.[1] && !driverPaymentDetailLinePattern.test(line)) {
      return cleanParsedValue(match[1]);
    }
  }

  return "";
}

function driverDetailLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(cleanParsedValue)
    .filter(Boolean)
    .filter((line) => !driverPaymentDetailLinePattern.test(line));
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
    if (predicate(line)) {
      return line;
    }
  }

  return "";
}

function parseDriverDetailsText(text: string): ParsedDriverDetails {
  const lines = driverDetailLines(text);
  const contact = lineValue(text, ["contact", "mobile", "mobile number", "phone", "tel", "telephone", "hp", "handphone"]);
  const name = lineValue(text, ["driver name", "name", "driver"]);
  const plate = lineValue(text, ["car plate", "plate number", "plate", "vehicle no", "car no"]);
  const vehicleModel = lineValue(text, ["brand", "vehicle", "vehicle model", "car model", "model"]);

  return {
    contact: contact || freeformLineValue(lines, isPhoneLikeLine),
    name: name || freeformLineValue(lines, isNameLikeLine),
    plate: plate || freeformLineValue(lines, isSingaporePlateLine),
    vehicleModel: vehicleModel || freeformLineValue(lines, isVehicleModelLine),
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

function driverAppUpdateStateClassName(kind: DriverAppUpdateState["kind"]) {
  if (kind === "loaded") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (kind === "error") {
    return "border-rose-200 bg-rose-50 text-rose-900";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function driverAppUpdateStatusLabel(value: unknown) {
  const status = String(value || "").replace(/[_-]+/g, " ").trim();

  if (!status) {
    return "Queued";
  }

  return status
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function safeDisplayText(value: unknown, fallback: string) {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallback;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || fallback;
}

function formatDriverAppUpdateTime(value: unknown) {
  const text = safeDisplayText(value, "");
  const date = text ? new Date(text) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Time not provided";
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDriverLiveLocationTime(value: string) {
  const date = value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "Not shared";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function driverLiveLocationPermissionLabel(value: DriverLiveLocationState["permissionState"]) {
  if (value === "granted") {
    return "Allowed";
  }

  if (value === "denied") {
    return "Denied";
  }

  if (value === "unavailable") {
    return "Unavailable";
  }

  return "Not requested";
}

function driverLiveLocationStaleLabel(value: DriverLiveLocationState["staleState"]) {
  if (value === "active") {
    return "Active";
  }

  if (value === "stale") {
    return "Stale";
  }

  return "Not active";
}

function normalizeStatusKey(value: unknown) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function formatDriverStatusTiming(value: unknown) {
  const text = safeDisplayText(value, "");
  const date = text ? new Date(text) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return text || "Not recorded";
  }

  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusTimingRows(statusHistory: SafeDriverJobStatusHistoryItem[]): DriverStatusTimingRow[] {
  return statusTimingSteps.map((step) => {
    const event = statusHistory.find((historyItem) => {
      const statusKey = normalizeStatusKey(historyItem.status);
      const statusLabelKey = normalizeStatusKey(historyItem.statusLabel);

      return step.aliases.includes(statusKey) || step.aliases.includes(statusLabelKey);
    });
    const occurredAt = event?.occurredAt || "";

    return {
      key: step.key,
      label: step.label,
      occurredAt,
      timeText: occurredAt ? formatDriverStatusTiming(occurredAt) : "Not recorded",
    };
  });
}

function detailRows(job: SafeDriverJobPayload) {
  return [
    { label: "Reference", value: job.reference },
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

function activityTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function driverCalendarBlockedMessage(reason: DriverCalendarBlockedReason) {
  if (reason === "unverified_driver") {
    return "Ask dispatch to confirm your assigned driver profile before connecting Google Calendar.";
  }

  if (reason === "not_acknowledged") {
    return "Save & Acknowledge Job before connecting Google Calendar.";
  }

  if (reason === "provider_failed" || reason === "invalid_oauth") {
    return "Google Calendar could not be updated. Try again or contact dispatch.";
  }

  return "Google Calendar is not ready for this job. Contact dispatch.";
}

function safeGoogleConsentUrl(value: string | undefined) {
  try {
    const url = new URL(value || "");

    return url.protocol === "https:" &&
      url.hostname === "accounts.google.com" &&
      url.pathname === "/o/oauth2/v2/auth"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function driverDeviceAlertReadinessFromApi(
  value: DriverDeviceAlertApiState | undefined,
): DriverDeviceAlertReadiness {
  return {
    enabled: value?.enabled === true,
    publicKey: typeof value?.public_key === "string" ? value.public_key : "",
    ready: value?.ready === true && typeof value.public_key === "string" && Boolean(value.public_key),
  };
}

function driverDeviceAlertApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function prepareDriverDeviceAlert(
  readiness: DriverDeviceAlertReadiness,
): Promise<DriverDeviceAlertPreparation> {
  if (!readiness.ready || !readiness.publicKey) {
    return { permission: "not_requested", registration: null, subscription: null };
  }

  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { permission: "unavailable", registration: null, subscription: null };
  }

  try {
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

    if (permission !== "granted") {
      return {
        permission: permission === "denied" ? "denied" : "not_requested",
        registration: null,
        subscription: null,
      };
    }

    await navigator.serviceWorker.register("/prestige-driver-push-sw.js", {
      scope: "/driver-job/",
    });
    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription ?? await registration.pushManager.subscribe({
      applicationServerKey: driverDeviceAlertApplicationServerKey(readiness.publicKey),
      userVisibleOnly: true,
    });

    return {
      permission: "granted",
      registration,
      subscription: subscription.toJSON(),
    };
  } catch {
    return { permission: "unavailable", registration: null, subscription: null };
  }
}

function rememberAcknowledgedDriverJobLink(
  registration: ServiceWorkerRegistration,
  jobKey: string,
) {
  if (!/^[0-9a-f]{64}$/.test(jobKey)) {
    return;
  }
  const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!url.startsWith("/driver-job/")) {
    return;
  }
  registration.active?.postMessage({
    jobKey,
    type: "PRESTIGE_REMEMBER_DRIVER_JOB_LINK",
    url,
  });
}

async function rememberAcknowledgedDriverPortalLink(jobKey: string) {
  if (!/^[0-9a-f]{64}$/.test(jobKey) || !("indexedDB" in window)) {
    return;
  }

  const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!url.startsWith("/driver-job/")) {
    return;
  }

  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("prestige-driver-device-alerts", 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains("driver-job-links")) {
        request.result.createObjectStore("driver-job-links", { keyPath: "jobKey" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("driver-job-links", "readwrite");
      transaction.objectStore("driver-job-links").put({ jobKey, url });
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () => reject(transaction.error));
    });
  } finally {
    database.close();
  }
}

export default function DriverJobPage() {
  const params = useParams<{ token?: string | string[] }>();
  const token = useMemo(() => {
    const rawToken = params?.token;

    return Array.isArray(rawToken) ? rawToken[0] || "" : rawToken || "";
  }, [params]);
  const [pageState, setPageState] = useState<PageState>({ kind: "loading" });
  const [acknowledged, setAcknowledged] = useState(false);
  const [driverDetails, setDriverDetails] = useState<DriverDetails>(emptyDriverDetails);
  const [driverDetailsRaw, setDriverDetailsRaw] = useState("");
  const [driverPortalEnrolled, setDriverPortalEnrolled] = useState(false);
  const [detailsFeedback, setDetailsFeedback] = useState<ControlFeedback | null>(null);
  const [parseDetailsFeedback, setParseDetailsFeedback] = useState<ControlFeedback | null>(null);
  const [savingDriverDetails, setSavingDriverDetails] = useState(false);
  const [savedDriverDetails, setSavedDriverDetails] = useState<DriverDetails | null>(null);
  const [, setActivityLog] = useState<ActivityLogEvent[]>([]);
  const [driverIssueFeedback, setDriverIssueFeedback] = useState<ControlFeedback | null>(null);
  const [reportingDriverIssue, setReportingDriverIssue] = useState(false);
  const [selectedDriverIssue, setSelectedDriverIssue] = useState("");
  const [driverAppUpdates, setDriverAppUpdates] =
    useState<DriverAppUpdateState>(emptyDriverAppUpdateState);
  const [driverDeviceAlertReadiness, setDriverDeviceAlertReadiness] =
    useState<DriverDeviceAlertReadiness>(emptyDriverDeviceAlertReadiness);
  const [driverQuickReply, setDriverQuickReply] = useState<DriverQuickReplyState>({
    feedback: null,
    sendingKey: "",
  });
  const [driverLiveLocation, setDriverLiveLocation] =
    useState<DriverLiveLocationState>(emptyDriverLiveLocationState);
  const [driverOtsPhotoProof, setDriverOtsPhotoProof] =
    useState<DriverOtsPhotoProofState>(emptyDriverOtsPhotoProofState);
  const [driverCalendar, setDriverCalendar] =
    useState<DriverCalendarState>(emptyDriverCalendarState);
  const [statusFeedback, setStatusFeedback] = useState<StatusFeedback | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState("assigned");
  const [updatingStatus, setUpdatingStatus] = useState("");
  const driverOtsPhotoProofInputRef = useRef<HTMLInputElement | null>(null);
  const driverLiveLocationWatchIdRef = useRef<number | null>(null);
  const driverLiveLocationPostInFlightRef = useRef(false);
  const driverLiveLocationLastPostAtRef = useRef(0);
  const driverLiveLocationShareActiveRef = useRef(false);
  const savedStatusHistory = useMemo(
    () => (pageState.kind === "ready" ? pageState.job.statusHistory : []),
    [pageState],
  );
  const driverStatusTimingRows = useMemo(
    () => statusTimingRows(savedStatusHistory),
    [savedStatusHistory],
  );

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

  async function sendDriverCustomerQuickReply(templateKey: string, message: string) {
    if (!token || driverQuickReply.sendingKey) return;

    setDriverQuickReply({ feedback: null, sendingKey: templateKey });

    try {
      const response = await fetch(
        `/api/driver-job/${encodeURIComponent(token)}/quick-replies`,
        {
          body: JSON.stringify({ template_key: templateKey }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || result?.direction !== "driver_to_customer") {
        throw new Error(
          response.status === 409
            ? "Customer replies close after Passenger on board."
            : result?.error || "Reply could not be sent. Please contact dispatch.",
        );
      }

      setDriverQuickReply({
        feedback: { tone: "success", text: `Sent to customer: ${message}` },
        sendingKey: "",
      });
    } catch (error) {
      setDriverQuickReply({
        feedback: {
          tone: "error",
          text: error instanceof Error ? error.message : "Reply could not be sent. Please contact dispatch.",
        },
        sendingKey: "",
      });
    }
  }

  const stopDriverLiveLocationBrowserWatch = useCallback((options: { resetLastPostAt?: boolean } = {}) => {
    driverLiveLocationShareActiveRef.current = false;
    driverLiveLocationPostInFlightRef.current = false;

    if (options.resetLastPostAt !== false) {
      driverLiveLocationLastPostAtRef.current = 0;
    }

    if (driverLiveLocationWatchIdRef.current === null || !("geolocation" in navigator)) {
      driverLiveLocationWatchIdRef.current = null;
      return;
    }

    navigator.geolocation.clearWatch(driverLiveLocationWatchIdRef.current);
    driverLiveLocationWatchIdRef.current = null;
  }, []);

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

      const searchParams = new URLSearchParams(window.location.search);
      const calendarReturnState = searchParams.get("calendar");

      if (calendarReturnState) {
        searchParams.delete("calendar");
        const nextSearch = searchParams.toString();
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
        );
      }

      setPageState({ kind: "loading" });
      setAcknowledged(false);
      setDetailsFeedback(null);
      setDriverDetailsRaw("");
      setParseDetailsFeedback(null);
      setDriverDetails(emptyDriverDetails);
      setActivityLog([]);
      setDriverIssueFeedback(null);
      setReportingDriverIssue(false);
      setSelectedDriverIssue("");
      setDriverAppUpdates({ feedback: null, kind: "loading", updates: [] });
      setDriverDeviceAlertReadiness(emptyDriverDeviceAlertReadiness);
      stopDriverLiveLocationBrowserWatch();
      setDriverLiveLocation(emptyDriverLiveLocationState);
      setDriverOtsPhotoProof(emptyDriverOtsPhotoProofState);
      setDriverCalendar(emptyDriverCalendarState);
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

        const loadedDriverDetails = {
          contact: result.payload.assignedDriver.contact,
          name: result.payload.assignedDriver.name,
          plate: result.payload.assignedDriver.plate,
          vehicleModel: result.payload.assignedDriver.vehicleModel,
        };

        setDriverDetails(loadedDriverDetails);
        setSavedDriverDetails(result.payload.acknowledged ? loadedDriverDetails : null);
        setAcknowledged(result.payload.acknowledged);
        setDriverDeviceAlertReadiness(
          driverDeviceAlertReadinessFromApi(result.device_alerts),
        );
        setWorkflowStatus(result.payload.status || "assigned");
        setPageState({ kind: "ready", job: result.payload });

        if (result.payload.acknowledged) {
          try {
            const calendarResponse = await fetch(
              `/api/driver-job/${encodeURIComponent(token)}/calendar`,
              { cache: "no-store" },
            );
            const calendarResult = await calendarResponse.json() as DriverCalendarApiResponse;

            if (active) {
              setDriverCalendar(
                calendarResponse.ok && calendarResult.ok
                  ? {
                      action: "idle",
                      connected: calendarResult.connected === true,
                      feedback:
                        calendarReturnState === "saved" && calendarResult.status === "cal_saved"
                          ? {
                              tone: "success",
                              text: "Calendar connected and saved. Open the event and tap Open Driver Job for reporting.",
                            }
                          : calendarReturnState === "error"
                            ? {
                                tone: "error",
                                text: "Google Calendar connection was not completed. Try Add / Update Calendar again.",
                              }
                            : null,
                      status: calendarResult.status,
                    }
                  : {
                      action: "idle",
                      connected: false,
                      feedback:
                        calendarReturnState === "error"
                          ? {
                              tone: "error",
                              text: "Google Calendar connection was not completed. Try Add / Update Calendar again.",
                            }
                          : null,
                      status: "unavailable",
                    },
              );
            }
          } catch {
            if (active) {
              setDriverCalendar({
                action: "idle",
                connected: false,
                feedback:
                  calendarReturnState === "error"
                    ? {
                        tone: "error",
                        text: "Google Calendar connection was not completed. Try Add / Update Calendar again.",
                      }
                    : null,
                status: "unavailable",
              });
            }
          }
        }

        try {
          const updateResponse = await fetch(
            `/api/driver-job/${encodeURIComponent(token)}/notifications?limit=5&page=1`,
            {
              cache: "no-store",
            },
          );
          const updateResult = await updateResponse.json() as DriverAppUpdateApiResponse;

          if (!active) {
            return;
          }

          if (!updateResponse.ok || !updateResult.ok) {
            setDriverAppUpdates({
              feedback: {
                tone: updateResponse.status === 503 ? "success" : "error",
                text:
                  updateResponse.status === 503
                    ? "Saved app updates are not enabled for this driver link yet."
                    : "Saved app updates could not be loaded. Contact dispatch if you need the latest instructions.",
              },
              kind: updateResponse.status === 503 ? "unavailable" : "error",
              updates: [],
            });
            return;
          }

          const updates = Array.isArray(updateResult.notifications)
            ? updateResult.notifications.slice(0, 5)
            : [];

          setDriverAppUpdates({
            feedback: {
              tone: "success",
              text:
                updates.length > 0
                  ? `Loaded ${updates.length} saved app update${updates.length === 1 ? "" : "s"}.`
                  : "No saved app updates for this job.",
            },
            kind: updates.length > 0 ? "loaded" : "empty",
            updates,
          });
        } catch {
          if (active) {
            setDriverAppUpdates({
              feedback: {
                tone: "error",
                text: "Saved app updates could not be loaded. Contact dispatch if you need the latest instructions.",
              },
              kind: "error",
              updates: [],
            });
          }
        }
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
  }, [stopDriverLiveLocationBrowserWatch, token]);

  useEffect(() => {
    return () => {
      stopDriverLiveLocationBrowserWatch();
    };
  }, [stopDriverLiveLocationBrowserWatch]);

  function updateDriverDetail(field: keyof DriverDetails, value: string) {
    setDetailsFeedback(null);
    setParseDetailsFeedback(null);
    setSavedDriverDetails(null);
    setDriverDetails((currentDetails) => ({
      ...currentDetails,
      [field]: value,
    }));
  }

  function parsePastedDriverDetails() {
    const parsedDetails = parseDriverDetailsText(driverDetailsRaw);
    const detectedFieldCount = [
      parsedDetails.contact,
      parsedDetails.name,
      parsedDetails.plate,
      parsedDetails.vehicleModel,
    ].filter(Boolean).length;

    if (detectedFieldCount === 0) {
      setParseDetailsFeedback({
        tone: "error",
        text: "Paste driver name, contact, car plate, or vehicle model before parsing.",
      });
      return;
    }

    setDriverDetails((currentDetails) => ({
      contact: parsedDetails.contact || currentDetails.contact,
      name: parsedDetails.name || currentDetails.name,
      plate: parsedDetails.plate || currentDetails.plate,
      vehicleModel: parsedDetails.vehicleModel || currentDetails.vehicleModel,
    }));
    setDetailsFeedback(null);
    setSavedDriverDetails(null);
    setParseDetailsFeedback({
      tone: "success",
      text: "Driver details parsed. Review and save to acknowledge.",
    });
  }

  async function saveAndAcknowledgeJob() {
    const nextDetails = cleanDriverDetails(driverDetails);

    setDriverDetails(nextDetails);

    if (!nextDetails.name && !nextDetails.contact && !nextDetails.plate && !nextDetails.vehicleModel) {
      setDetailsFeedback({
        tone: "error",
        text: "Confirm driver name, contact, car plate, or vehicle model before acknowledging.",
      });
      setSavedDriverDetails(null);
      return;
    }

    if (!nextDetails.name) {
      setDetailsFeedback({
        tone: "error",
        text: "Driver name is required before acknowledging.",
      });
      setSavedDriverDetails(null);
      return;
    }

    setSavingDriverDetails(true);
    setDetailsFeedback({
      tone: "success",
      text: "Saving driver details...",
    });

    const deviceAlertPreparation = await prepareDriverDeviceAlert(
      driverDeviceAlertReadiness,
    );

    try {
      const response = await fetch(`/api/driver-job/${encodeURIComponent(token)}`, {
        body: JSON.stringify({
          driver_contact: nextDetails.contact,
          driver_name: nextDetails.name,
          driver_plate_number: nextDetails.plate,
          driver_vehicle_model: nextDetails.vehicleModel,
          device_push_subscription: deviceAlertPreparation.subscription,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });
      const result = await response.json() as DriverJobApiResponse;

      if (!response.ok || !result.ok) {
        const blockedReason = result.ok ? "unavailable" : normalizeBlockedReason(result.reason);

        setSavedDriverDetails(null);
        setDetailsFeedback({
          tone: "error",
          text: blockedMessages[blockedReason],
        });
        return;
      }

      const confirmedDetails = cleanDriverDetails({
        contact: result.payload.assignedDriver.contact || nextDetails.contact,
        name: result.payload.assignedDriver.name || nextDetails.name,
        plate: result.payload.assignedDriver.plate || nextDetails.plate,
        vehicleModel: result.payload.assignedDriver.vehicleModel || nextDetails.vehicleModel,
      });

      setDriverDetails(confirmedDetails);
      setSavedDriverDetails(confirmedDetails);
      setAcknowledged(true);
      setDriverCalendar(emptyDriverCalendarState);
      setStatusFeedback(null);
      setWorkflowStatus(result.payload.status || "assigned");
      setPageState({ kind: "ready", job: result.payload });
      const driverPortalReady =
        result.driver_portal?.enrolled === true &&
        typeof result.driver_portal.link_key === "string" &&
        /^[0-9a-f]{64}$/.test(result.driver_portal.link_key);
      setDriverPortalEnrolled(driverPortalReady);
      if (driverPortalReady && result.driver_portal?.link_key) {
        await rememberAcknowledgedDriverPortalLink(result.driver_portal.link_key).catch(() => undefined);
      }
      const deviceAlertsRegistered =
        result.device_alerts?.subscription_registered === true &&
        typeof result.device_alerts.link_key === "string" &&
        Boolean(deviceAlertPreparation.registration);

      if (
        deviceAlertsRegistered &&
        deviceAlertPreparation.registration &&
        result.device_alerts?.link_key
      ) {
        rememberAcknowledgedDriverJobLink(
          deviceAlertPreparation.registration,
          result.device_alerts.link_key,
        );
      }

      const deviceAlertFeedback = deviceAlertsRegistered
        ? " Device alerts are enabled on this device."
        : driverDeviceAlertReadiness.ready
          ? deviceAlertPreparation.permission === "denied"
            ? " Device alerts were not allowed; reopen this page to check App Updates."
            : " Device alerts could not be enabled; reopen this page to check App Updates."
          : "";
      const driverPortalFeedback = driverPortalReady
        ? " Driver Portal is ready on this device."
        : "";
      setDetailsFeedback(
        deviceAlertFeedback || driverPortalFeedback
          ? {
              tone: "success",
              text: `Driver details saved and job acknowledged.${driverPortalFeedback}${deviceAlertFeedback}`,
            }
          : defaultAcknowledgedDetailsFeedback,
      );
      addActivity("Job acknowledged", "Driver and vehicle details were confirmed for this assigned job.");
    } catch {
      setSavedDriverDetails(null);
      setDetailsFeedback({
        tone: "error",
        text: "Driver details could not be saved. Please try again or contact dispatch.",
      });
    } finally {
      setSavingDriverDetails(false);
    }
  }

  async function openDriverJobCalendar() {
    if (!acknowledged || !token) {
      return;
    }

    setDriverCalendar((current) => ({
      ...current,
      action: "saving",
      feedback: null,
    }));

    try {
      const response = await fetch(`/api/driver-job/${encodeURIComponent(token)}/calendar`, {
        cache: "no-store",
        method: "POST",
      });
      const result = await response.json() as DriverCalendarApiResponse;

      if (!response.ok || !result.ok) {
        setDriverCalendar((current) => ({
          ...current,
          action: "idle",
          feedback: {
            tone: "error",
            text: driverCalendarBlockedMessage(result.ok ? undefined : result.reason),
          },
          status: "unavailable",
        }));
        return;
      }

      if (result.action === "authorize") {
        const googleConsentUrl = safeGoogleConsentUrl(result.google_consent_url);

        if (!googleConsentUrl) {
          setDriverCalendar((current) => ({
            ...current,
            action: "idle",
            feedback: {
              tone: "error",
              text: "Google Calendar connection could not start. Contact dispatch.",
            },
          }));
          return;
        }

        window.location.assign(googleConsentUrl);
        return;
      }

      setDriverCalendar({
        action: "idle",
        connected: true,
        feedback: {
          tone: "success",
          text: "Calendar saved. Open the event and tap Open Driver Job for reporting.",
        },
        status: "cal_saved",
      });
      addActivity("Calendar saved", "Google Calendar now has the latest pickup schedule and Driver Job shortcut.");
    } catch {
      setDriverCalendar((current) => ({
        ...current,
        action: "idle",
        feedback: {
          tone: "error",
          text: "Google Calendar could not be updated. Try again or contact dispatch.",
        },
        status: "unavailable",
      }));
    }
  }

  async function reportDriverIssue() {
    if (!token || pageState.kind !== "ready") {
      return;
    }

    const issueChoice = getDriverJobIssueChoice(selectedDriverIssue);

    if (!issueChoice) {
      setDriverIssueFeedback({
        tone: "error",
        text: "Choose an issue before alerting admin.",
      });
      return;
    }

    setReportingDriverIssue(true);
    setDriverIssueFeedback(null);

    try {
      const response = await fetch(`/api/driver-job/${encodeURIComponent(token)}/issue-alert`, {
        body: JSON.stringify({ issue_type: issueChoice.value }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await response.json() as DriverIssueAlertApiResponse;

      if (!response.ok || !result.ok) {
        setDriverIssueFeedback({
          tone: "error",
          text: "Admin alert could not be saved. Contact dispatcher directly.",
        });
        return;
      }

      setDriverIssueFeedback({
        tone: "success",
        text: `Admin alerted in-app: ${issueChoice.label}. No external message was sent.`,
      });
      addActivity("Admin alert prepared", `Driver reported: ${issueChoice.label}.`);
    } catch {
      setDriverIssueFeedback({
        tone: "error",
        text: "Admin alert failed. Contact dispatcher directly.",
      });
    } finally {
      setReportingDriverIssue(false);
    }
  }

  function driverLiveLocationRoute() {
    return `/api/driver-job/${encodeURIComponent(token)}/live-location`;
  }

  async function checkDriverLiveLocationReadiness() {
    try {
      const response = await fetch(driverLiveLocationRoute(), {
        cache: "no-store",
        method: "GET",
      });
      const result = await response.json() as DriverLiveLocationApiResponse;

      if (!response.ok || !result.ok || result.customerVisible !== false || result.external_send !== false) {
        setDriverLiveLocation((currentState) => ({
          ...currentState,
          action: "idle",
          feedback: {
            tone: "error",
            text: "Dispatch has not opened live location for this job.",
          },
          sharingState: "inactive",
          staleState: "inactive",
        }));
        return false;
      }

      const sharingState = result.sharing_state === "active" ? "active" : "inactive";

      setDriverLiveLocation((currentState) => ({
        ...currentState,
        lastSharedAt: result.last_shared_at || currentState.lastSharedAt,
        sharingState,
        staleState: result.sharing_state === "stale" ? "stale" : sharingState === "active" ? "active" : "inactive",
      }));

      return true;
    } catch {
      setDriverLiveLocation((currentState) => ({
        ...currentState,
        action: "idle",
        feedback: {
          tone: "error",
          text: "Location sharing readiness failed. Contact dispatch.",
        },
      }));
      return false;
    }
  }

  async function requestDriverLiveLocationPosition() {
    if (!("geolocation" in navigator)) {
      setDriverLiveLocation((currentState) => ({
        ...currentState,
        action: "idle",
        feedback: {
          tone: "error",
          text: "Location is not available in this browser.",
        },
        permissionState: "unavailable",
      }));
      return null;
    }

    try {
      const position = await new Promise<DriverLiveLocationBrowserPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, driverLiveLocationPositionOptions);
      });

      setDriverLiveLocation((currentState) => ({
        ...currentState,
        permissionState: "granted",
      }));

      return position;
    } catch {
      setDriverLiveLocation((currentState) => ({
        ...currentState,
        action: "idle",
        feedback: {
          tone: "error",
          text: "Location permission was not granted. Share only when you approve browser location.",
        },
        permissionState: "denied",
      }));
      return null;
    }
  }

  async function postDriverLiveLocationPosition(
    position: DriverLiveLocationBrowserPosition,
    options: {
      feedbackText?: string;
      logActivity?: boolean;
      stopOnFailure?: boolean;
    } = {},
  ) {
    if (!token || pageState.kind !== "ready" || driverLiveLocationPostInFlightRef.current) {
      return false;
    }

    driverLiveLocationPostInFlightRef.current = true;

    try {
      const response = await fetch(driverLiveLocationRoute(), {
        body: JSON.stringify({
          accuracy_meters: position.coords.accuracy,
          captured_at: new Date(position.timestamp).toISOString(),
          heading_degrees: position.coords.heading,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speed_meters_per_second: position.coords.speed,
        }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await response.json() as DriverLiveLocationApiResponse;

      if (!response.ok || !result.ok || result.customerVisible !== false || result.external_send !== false) {
        if (options.stopOnFailure !== false) {
          stopDriverLiveLocationBrowserWatch();
        }

        setDriverLiveLocation((currentState) => ({
          ...currentState,
          action: "idle",
          feedback: {
            tone: "error",
            text: "Location sharing was not accepted. Contact dispatch.",
          },
          sharingState: "inactive",
          staleState: "inactive",
        }));
        return false;
      }

      const sharedAt = new Date(position.timestamp).toISOString();
      driverLiveLocationLastPostAtRef.current = Date.now();

      setDriverLiveLocation((currentState) => ({
        ...currentState,
        action: "idle",
        feedback: options.feedbackText
          ? {
              tone: "success",
              text: options.feedbackText,
            }
          : currentState.feedback,
        lastSharedAt: sharedAt,
        permissionState: "granted",
        sharingState: "active",
        staleState: "active",
      }));

      if (options.logActivity) {
        addActivity("Location sharing started", "Driver location is sharing in-app for this assigned job only.");
      }

      return true;
    } catch {
      if (options.stopOnFailure !== false) {
        stopDriverLiveLocationBrowserWatch();
      }

      setDriverLiveLocation((currentState) => ({
        ...currentState,
        action: "idle",
        feedback: {
          tone: "error",
          text: "Location sharing failed. Contact dispatch.",
        },
        sharingState: "inactive",
        staleState: "inactive",
      }));
      return false;
    } finally {
      driverLiveLocationPostInFlightRef.current = false;
    }
  }

  function startDriverLiveLocationBrowserWatch() {
    if (!("geolocation" in navigator) || !navigator.geolocation.watchPosition) {
      setDriverLiveLocation((currentState) => ({
        ...currentState,
        feedback: {
          tone: "error",
          text: "Location shared once, but continuous sharing is not available in this browser.",
        },
        sharingState: "active",
        staleState: "active",
      }));
      return;
    }

    stopDriverLiveLocationBrowserWatch({ resetLastPostAt: false });
    driverLiveLocationShareActiveRef.current = true;
    driverLiveLocationWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!driverLiveLocationShareActiveRef.current) {
          return;
        }

        const now = Date.now();

        if (
          driverLiveLocationPostInFlightRef.current ||
          now - driverLiveLocationLastPostAtRef.current < driverLiveLocationContinuousShareMinMs
        ) {
          return;
        }

        void postDriverLiveLocationPosition(position, {
          stopOnFailure: true,
        });
      },
      () => {
        stopDriverLiveLocationBrowserWatch();
        setDriverLiveLocation((currentState) => ({
          ...currentState,
          action: "idle",
          feedback: {
            tone: "error",
            text: "Browser GPS became unavailable. Stop Sharing is still available to clear the marker.",
          },
          permissionState: "denied",
          sharingState: "active",
          staleState: "stale",
        }));
      },
      driverLiveLocationPositionOptions,
    );
  }

  async function shareDriverLiveLocation() {
    if (!token || pageState.kind !== "ready") {
      setDriverLiveLocation((currentState) => ({
        ...currentState,
        feedback: {
          tone: "error",
          text: "Location sharing is closed for this job.",
        },
      }));
      return;
    }

    stopDriverLiveLocationBrowserWatch();
    setDriverLiveLocation((currentState) => ({
      ...currentState,
      action: "sharing",
      feedback: null,
    }));

    const ready = await checkDriverLiveLocationReadiness();

    if (!ready) {
      return;
    }

    const position = await requestDriverLiveLocationPosition();

    if (!position) {
      return;
    }

    const posted = await postDriverLiveLocationPosition(position, {
      feedbackText: "Live location is sharing for this job. Keep this page open; dispatch map updates automatically.",
      logActivity: true,
      stopOnFailure: true,
    });

    if (posted) {
      startDriverLiveLocationBrowserWatch();
    }
  }

  async function stopDriverLiveLocation() {
    if (!token || pageState.kind !== "ready") {
      setDriverLiveLocation((currentState) => ({
        ...currentState,
        feedback: {
          tone: "error",
          text: "Location sharing is closed for this job.",
        },
      }));
      return;
    }

    stopDriverLiveLocationBrowserWatch();
    setDriverLiveLocation((currentState) => ({
      ...currentState,
      action: "stopping",
      feedback: null,
    }));

    try {
      const response = await fetch(driverLiveLocationRoute(), {
        cache: "no-store",
        method: "DELETE",
      });
      const result = await response.json() as DriverLiveLocationApiResponse;

      if (!response.ok || !result.ok || result.customerVisible !== false || result.external_send !== false) {
        setDriverLiveLocation((currentState) => ({
          ...currentState,
          action: "idle",
          feedback: {
            tone: "error",
            text: "Local sharing stopped, but dispatch cleanup failed. Contact dispatch.",
          },
          sharingState: "inactive",
          staleState: "inactive",
        }));
        return;
      }

      setDriverLiveLocation((currentState) => ({
        ...currentState,
        action: "idle",
        feedback: {
          tone: "success",
          text: "Location sharing stopped for this job.",
        },
        sharingState: "stopped",
        staleState: "inactive",
      }));
      addActivity("Location stopped", "Driver location sharing was stopped for this assigned job.");
    } catch {
      setDriverLiveLocation((currentState) => ({
        ...currentState,
        action: "idle",
        feedback: {
          tone: "error",
          text: "Local sharing stopped, but dispatch cleanup failed. Contact dispatch.",
        },
        sharingState: "inactive",
        staleState: "inactive",
      }));
    }
  }

  function driverOtsPhotoProofRoute() {
    return `/api/driver-job/${encodeURIComponent(token)}/ots-photo`;
  }

  function handleDriverOtsPhotoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    setDriverOtsPhotoProof((currentState) => ({
      ...currentState,
      feedback: null,
      selectedFileName: file?.name || "",
    }));
  }

  async function uploadDriverOtsPhotoProof() {
    if (!token || pageState.kind !== "ready") {
      return;
    }

    if (!driverWorkflowHasReachedOts(workflowStatus)) {
      setDriverOtsPhotoProof((currentState) => ({
        ...currentState,
        feedback: {
          tone: "error",
          text: "Press OTS before sending the photo to admin.",
        },
      }));
      return;
    }

    const photoFile = driverOtsPhotoProofInputRef.current?.files?.[0] || null;

    if (!photoFile) {
      setDriverOtsPhotoProof((currentState) => ({
        ...currentState,
        feedback: {
          tone: "error",
          text: "Choose a photo before sending.",
        },
      }));
      return;
    }

    setDriverOtsPhotoProof((currentState) => ({
      ...currentState,
      action: "uploading",
      feedback: null,
    }));

    try {
      const preparedPhoto = await prepareDriverOtsPhotoForUpload(photoFile);

      if (!preparedPhoto) {
        setDriverOtsPhotoProof((currentState) => ({
          ...currentState,
          action: "idle",
          feedback: {
            tone: "error",
            text: "Photo is too large to prepare. Take a screenshot or choose a smaller photo.",
          },
        }));
        return;
      }

      const formData = new FormData();
      formData.append("photo", preparedPhoto.blob, preparedPhoto.fileName);
      const response = await fetch(driverOtsPhotoProofRoute(), {
        body: formData,
        cache: "no-store",
        method: "POST",
      });
      const result = await response.json().catch(() => null) as DriverOtsPhotoProofApiResponse | null;

      if (
        !response.ok ||
        !result?.ok ||
        result.proof?.customerVisible !== false ||
        result.proof?.external_send !== false
      ) {
        const blockedReason = response.status === 413 ? "too_large" : result?.ok === false
          ? result.reason
          : "unavailable";

        setDriverOtsPhotoProof((currentState) => ({
          ...currentState,
          action: "idle",
          feedback: {
            tone: "error",
            text: otsPhotoProofBlockedMessage(blockedReason),
          },
        }));
        return;
      }

      if (driverOtsPhotoProofInputRef.current) {
        driverOtsPhotoProofInputRef.current.value = "";
      }

      setDriverOtsPhotoProof({
        action: "idle",
        feedback: {
          tone: "success",
          text: "OTS photo sent to admin.",
        },
        selectedFileName: "",
        uploadedAt: result.proof.uploaded_at || new Date().toISOString(),
      });
      addActivity("OTS photo sent", "Driver sent an admin-only OTS photo proof.");
    } catch {
      setDriverOtsPhotoProof((currentState) => ({
        ...currentState,
        action: "idle",
        feedback: {
          tone: "error",
          text: "Photo could not be sent. Contact dispatch.",
        },
      }));
    }
  }

  async function updateStatus(nextStatus: string, label: string, displayLabel = label) {
    if (!token || pageState.kind !== "ready") {
      return;
    }

    if (!acknowledged) {
      setStatusFeedback({
        target: label,
        tone: "error",
        text: "Save & Acknowledge Job before updating status.",
      });
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

    setUpdatingStatus(label);
    setStatusFeedback(null);

    try {
      const requestBody: Record<string, unknown> = {
        status: transitionGuard.status,
      };

      // Mock-backed status update only. Production must verify the secure token before any Supabase write.
      const response = await fetch(`/api/driver-job/${encodeURIComponent(token)}/status`, {
        body: JSON.stringify(requestBody),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const result = await response.json() as DriverJobApiResponse;

      if (!result.ok) {
        const blockedReason = normalizeBlockedReason(result.reason);

        setStatusFeedback({
          target: label,
          tone: "error",
          text: blockedMessages[blockedReason],
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

      setWorkflowStatus(result.payload.status);
      setPageState({ kind: "ready", job: result.payload });
      addActivity(`${displayLabel} marked`, `Driver status updated to ${nextStatusText}.`);
      if (result.payload.status === "ots") {
        setDriverOtsPhotoProof((currentState) => ({
          ...currentState,
          feedback: {
            tone: "success",
            text: "OTS recorded. Photo to admin is optional.",
          },
        }));
      }
      setStatusFeedback({
        target: label,
        tone: "success",
        text: `Status updated to ${nextStatusText}.`,
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

  const driverLiveLocationControlsDisabled =
    driverLiveLocation.action !== "idle" ||
    pageState.kind !== "ready";
  const driverLiveLocationShareDisabled =
    driverLiveLocationControlsDisabled || driverLiveLocation.sharingState === "active";
  const driverLiveLocationStopDisabled =
    driverLiveLocationControlsDisabled || driverLiveLocation.sharingState !== "active";
  const driverLiveLocationUiState = pageState.kind === "ready" ? "runtime-check" : "disabled";
  const driverLiveLocationHelperText =
    "Share only when dispatch opens live location for this job. Keep this page open; Stop Sharing ends it.";
  const driverLiveLocationSharingLabel =
    driverLiveLocation.sharingState === "active"
      ? "Sharing"
      : driverLiveLocation.sharingState === "stopped"
        ? "Stopped"
        : "Off";
  const driverOtsPhotoProofReady =
    pageState.kind === "ready" &&
    acknowledged &&
    driverWorkflowHasReachedOts(workflowStatus);
  const driverOtsPhotoProofUploadDisabled =
    !driverOtsPhotoProofReady ||
    driverOtsPhotoProof.action !== "idle" ||
    !driverOtsPhotoProof.selectedFileName;
  const driverOtsPhotoProofStatusLabel = driverOtsPhotoProof.uploadedAt
    ? "Sent"
    : driverOtsPhotoProofReady
      ? "Ready"
      : "Locked";

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-4 sm:max-w-lg md:max-w-2xl md:py-6">
        <header className="space-y-1 border-b border-stone-200 pb-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Prestige Limo Ops</p>
          <h1 className="text-xl font-semibold text-slate-950">Prestige Limo Driver Job</h1>
          <p
            className="border-l-2 border-sky-300 bg-sky-50/70 px-3 py-1.5 text-sm font-medium leading-6 text-sky-950"
            data-driver-job-mobile-web-note="true"
          >
            Mobile web driver card. Keep this link private and use it only for this assigned job.
          </p>
        </header>

        {pageState.kind === "loading" ? (
          <section
            aria-live="polite"
            className="rounded-md border border-stone-200 bg-white px-3 py-4 text-sm font-semibold text-slate-700"
          >
            Loading driver job...
          </section>
        ) : null}

        {pageState.kind === "blocked" ? (
          <section
            aria-live="polite"
            className="space-y-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-4 text-rose-900"
            data-driver-job-blocked="true"
          >
            <h2 className="text-base font-semibold">Driver job link unavailable</h2>
            <p className="text-sm font-medium">{blockedMessages[pageState.reason]}</p>
          </section>
        ) : null}

        {pageState.kind === "ready" ? (
          <>
            <section
              className="order-1 space-y-2"
              aria-labelledby="driver-job-summary-heading"
              data-driver-primary-step="job-summary"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id="driver-job-summary-heading" className="text-base font-semibold text-slate-900">
                  Driver Job Card
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
                  <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-3 py-2 text-sm" key={detail.label}>
                    <dt className="font-semibold text-slate-500">{detail.label}</dt>
                    <dd className="min-w-0 break-words text-slate-950">{displayValue(detail.value)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <details
              className="order-[88] rounded-md border border-stone-200 bg-white p-2.5"
              data-driver-job-workflow-handoff="true"
            >
              <summary
                className="cursor-pointer text-sm font-semibold text-slate-900"
                data-driver-job-workflow-handoff-summary="true"
              >
                How this page works
              </summary>
              <p
                className="mt-2 text-sm font-medium leading-6 text-slate-600"
                data-driver-job-workflow-handoff-helper="true"
              >
                This is the driver page for this assigned job.
              </p>
              <ul
                className="mt-2 grid gap-1.5 text-sm font-medium leading-6 text-slate-700"
                data-driver-job-workflow-handoff-list="true"
              >
                <li className="border-l-2 border-slate-200 pl-3">
                  Review pickup time, pickup place, drop-off, route, and job notes before starting.
                </li>
                <li className="border-l-2 border-slate-200 pl-3">
                  Confirm driver and vehicle details once, then use the status buttons only when ready.
                </li>
                <li className="border-l-2 border-slate-200 pl-3">
                  Use Report Issue when admin needs an in-app alert.
                </li>
              </ul>
              <p
                className="mt-2 text-sm font-semibold leading-6 text-slate-700"
                data-driver-job-workflow-handoff-boundary="true"
              >
                Private account and internal compensation details are not shown here.
              </p>
            </details>

            <section
              className="order-[90] space-y-2"
              aria-labelledby="driver-app-updates-heading"
              data-driver-job-app-updates="true"
            >
              <h2 id="driver-app-updates-heading" className="text-base font-semibold text-slate-900">
                App Updates
              </h2>
              <div className="space-y-2 rounded-md border border-stone-200 bg-white p-2.5">
                <p className="text-sm font-medium leading-6 text-slate-600">
                  Saved dispatch updates for this job link. External messages are not sent from this page.
                </p>
                <p
                  aria-live="polite"
                  className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${driverAppUpdateStateClassName(driverAppUpdates.kind)}`}
                  data-driver-job-app-updates-feedback="true"
                  data-driver-job-app-updates-state={driverAppUpdates.kind}
                >
                  {driverAppUpdates.kind === "loading"
                    ? "Checking saved app updates..."
                    : driverAppUpdates.feedback?.text || "Saved app updates are ready to check."}
                </p>
                {driverAppUpdates.updates.length > 0 ? (
                  <ol className="space-y-1.5" data-driver-job-app-updates-list="true">
                    {driverAppUpdates.updates.map((update, index) => (
                      <li
                        className="space-y-1.5 rounded-md bg-slate-50 px-2.5 py-2 text-sm text-slate-700 ring-1 ring-slate-200"
                        data-driver-job-app-update-row="true"
                        key={update.id || `${update.safe_title || "driver-app-update"}-${index}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p
                            className="min-w-0 break-words font-semibold text-slate-900"
                            data-driver-job-app-update-title="true"
                          >
                            {safeDisplayText(update.safe_title, "Dispatch update")}
                          </p>
                          <span
                            className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                            data-driver-job-app-update-status="true"
                          >
                            {driverAppUpdateStatusLabel(update.notification_status)}
                          </span>
                        </div>
                        <p
                          className="break-words font-medium leading-6 text-slate-700"
                          data-driver-job-app-update-message="true"
                        >
                          {safeDisplayText(update.safe_message, "Contact dispatch for the latest job update.")}
                        </p>
                        <div className="grid gap-1 text-xs font-semibold text-slate-500 sm:grid-cols-2">
                          <span data-driver-job-app-update-priority="true">
                            Priority: {driverAppUpdateStatusLabel(update.priority || "normal")}
                          </span>
                          <span data-driver-job-app-update-time="true">
                            {formatDriverAppUpdateTime(update.created_at || update.updated_at)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            </section>

            <section
              aria-labelledby="driver-customer-message-heading"
              className="order-[91] space-y-2"
              data-driver-customer-quick-replies="true"
            >
              <h2 id="driver-customer-message-heading" className="text-base font-semibold text-slate-900">
                Message Customer
              </h2>
              <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-2.5">
                <p className="text-sm font-medium text-sky-950">
                  Tap one reply. The customer receives it in My Bookings and admin can see it.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {driverCustomerQuickReplies.map((reply) => (
                    <button
                      className="min-h-11 rounded-md border border-sky-700 bg-white px-3 py-2 text-left text-sm font-semibold text-sky-950 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                      data-driver-customer-quick-reply={reply.key}
                      disabled={Boolean(driverQuickReply.sendingKey) || ["pob", "completed"].includes(workflowStatus)}
                      key={reply.key}
                      onClick={() => void sendDriverCustomerQuickReply(reply.key, reply.label)}
                      type="button"
                    >
                      {driverQuickReply.sendingKey === reply.key ? "Sending..." : reply.label}
                    </button>
                  ))}
                </div>
                {["pob", "completed"].includes(workflowStatus) ? (
                  <p className="text-xs font-semibold text-slate-600">Customer replies close after Passenger on board.</p>
                ) : null}
                {driverQuickReply.feedback ? (
                  <p
                    aria-live="polite"
                    className={`rounded-md border px-2.5 py-2 text-sm font-semibold ${feedbackClassName(driverQuickReply.feedback.tone)}`}
                    data-driver-customer-quick-reply-feedback="true"
                  >
                    {driverQuickReply.feedback.text}
                  </p>
                ) : null}
              </div>
            </section>

            <section
              className="order-2 space-y-2"
              aria-labelledby="driver-details-heading"
              data-driver-primary-step="confirm-details"
            >
              <h2 id="driver-details-heading" className="text-base font-semibold text-slate-900">
                Driver Details
              </h2>
              <div className="space-y-2.5 rounded-md border border-stone-200 bg-white p-2.5">
                <p
                  className="rounded-md bg-slate-50 px-2.5 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                  data-driver-job-acknowledged-state="true"
                >
                  {acknowledged ? "Acknowledged" : "Paste or confirm driver details once before starting the job."}
                </p>
                <div className="grid gap-2">
                  <label className="block space-y-1 text-sm font-semibold text-slate-700">
                    <span>Paste Driver Details</span>
                    <textarea
                      className="min-h-16 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-6 text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      data-driver-job-details-raw="true"
                      onChange={(event) => {
                        setDriverDetailsRaw(event.target.value);
                        setParseDetailsFeedback(null);
                      }}
                      value={driverDetailsRaw}
                    />
                  </label>
                  <div className="space-y-2">
                    <button
                      className="h-11 w-full rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition active:bg-slate-700"
                      data-driver-job-parse-details="true"
                      onClick={parsePastedDriverDetails}
                      type="button"
                    >
                      Parse Driver Details
                    </button>
                    {parseDetailsFeedback ? (
                      <p
                        aria-live="polite"
                        className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${feedbackClassName(parseDetailsFeedback.tone)}`}
                        data-driver-job-parse-details-message="true"
                      >
                        {parseDetailsFeedback.text}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-2.5 md:grid-cols-2">
                  <label className="block space-y-1 text-sm font-semibold text-slate-700">
                    <span>Driver name</span>
                    <input
                      className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      data-driver-job-detail-name="true"
                      onChange={(event) => updateDriverDetail("name", event.target.value)}
                      type="text"
                      value={driverDetails.name}
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-semibold text-slate-700">
                    <span>Contact / Mobile number</span>
                    <input
                      className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
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
                      className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      data-driver-job-detail-plate="true"
                      onChange={(event) => updateDriverDetail("plate", event.target.value)}
                      type="text"
                      value={driverDetails.plate}
                    />
                  </label>
                  <label className="block space-y-1 text-sm font-semibold text-slate-700">
                    <span>Vehicle model</span>
                    <input
                      className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      data-driver-job-detail-vehicle-model="true"
                      onChange={(event) => updateDriverDetail("vehicleModel", event.target.value)}
                      type="text"
                      value={driverDetails.vehicleModel}
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <button
                    className="h-11 w-full rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition active:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    data-driver-job-save-acknowledge="true"
                    data-driver-primary-step="save-acknowledge"
                    disabled={savingDriverDetails}
                    onClick={saveAndAcknowledgeJob}
                    type="button"
                  >
                    {savingDriverDetails ? "Saving..." : "Save & Acknowledge Job"}
                  </button>
                  {detailsFeedback ? (
                    <p
                      aria-live="polite"
                      className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${feedbackClassName(detailsFeedback.tone)}`}
                      data-driver-job-details-message="true"
                    >
                      {detailsFeedback.text}
                    </p>
                  ) : null}
                  <p
                    className="text-xs font-medium leading-5 text-slate-500"
                    data-driver-job-device-alert-helper="true"
                  >
                    This same action enables Driver Job alerts on this device when supported and allowed.
                  </p>
                  <p className="text-xs font-medium leading-5 text-slate-500" data-driver-portal-enrolment-helper="true">
                    When securely configured, acknowledgement also enrols this device in Driver Portal.
                  </p>
                </div>
                {savedDriverDetails ? (
                  <div
                    className="space-y-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-sm text-emerald-900"
                    data-driver-job-saved-details="true"
                  >
                    <p className="font-semibold">Confirmed driver and vehicle details</p>
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
                {acknowledged ? (
                  <div className="space-y-1.5 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-sky-950">Google Calendar</p>
                      {driverCalendar.status === "cal_saved" ? (
                        <span
                          className="rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900"
                          data-driver-job-calendar-saved="true"
                        >
                          Calendar saved
                        </span>
                      ) : driverCalendar.status === "update_calendar" ? (
                        <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                          Update needed
                        </span>
                      ) : null}
                    </div>
                    <button
                      className="flex h-11 w-full items-center justify-center rounded-md border border-sky-700 bg-white px-3 text-sm font-semibold text-sky-950 transition hover:bg-sky-100"
                      data-driver-job-calendar-action="true"
                      data-driver-job-calendar-source="current-driver-job-schedule"
                      disabled={driverCalendar.action === "saving"}
                      onClick={openDriverJobCalendar}
                      type="button"
                    >
                      {driverCalendar.action === "saving" ? "Saving Calendar..." : "Add / Update Calendar"}
                    </button>
                    <p className="text-xs font-medium leading-5 text-sky-900">
                      First use connects your Google account. The same action updates this one event after an
                      amendment—no file download. Open the event and tap Open Driver Job for OTW, OTS, POB and
                      Job Completed reporting. Do not share the calendar event.
                    </p>
                    <div
                      className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold"
                      data-driver-job-calendar-policy-links="true"
                    >
                      <Link className="text-sky-800 underline" href="/google-calendar" rel="noreferrer">
                        Calendar data use
                      </Link>
                      <Link className="text-sky-800 underline" href="/privacy" rel="noreferrer">
                        Privacy Policy
                      </Link>
                      <Link className="text-sky-800 underline" href="/terms" rel="noreferrer">
                        Terms of Service
                      </Link>
                    </div>
                    {driverCalendar.feedback ? (
                      <p
                        className={`text-xs font-semibold leading-5 ${
                          driverCalendar.feedback.tone === "success" ? "text-emerald-800" : "text-red-700"
                        }`}
                        data-driver-job-calendar-feedback={driverCalendar.feedback.tone}
                      >
                        {driverCalendar.feedback.text}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {driverPortalEnrolled ? (
                  <div
                    className="space-y-2 rounded-md border border-violet-200 bg-violet-50 px-2.5 py-2"
                    data-driver-portal-entry="enrolled"
                  >
                    <p className="text-sm font-semibold text-violet-950">Driver Portal</p>
                    <p className="text-xs font-medium leading-5 text-violet-900">
                      Open all acknowledged upcoming and active jobs assigned to this verified driver. On
                      iPhone, use Add to Home Screen from this page to install the reusable Driver Portal.
                    </p>
                    <Link
                      className="flex h-11 w-full items-center justify-center rounded-md border border-violet-700 bg-white px-3 text-sm font-semibold text-violet-950 transition hover:bg-violet-100"
                      data-driver-portal-open="true"
                      href="/driver-portal"
                    >
                      Open Driver Portal
                    </Link>
                  </div>
                ) : null}
              </div>
            </section>

            <section
              className="order-[82] space-y-2"
              aria-labelledby="driver-live-location-heading"
              data-driver-live-location-consent-ui={driverLiveLocationUiState}
              data-driver-primary-step="live-location-consent"
            >
              <div className="space-y-2 rounded-md border border-slate-200 bg-white p-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 id="driver-live-location-heading" className="text-base font-semibold text-slate-900">
                      Live Location
                    </h2>
                    <p
                      className="mt-1 text-sm font-medium leading-5 text-slate-600"
                      data-driver-live-location-helper="true"
                    >
                      {driverLiveLocationHelperText}
                    </p>
                  </div>
                  <span
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
                    data-driver-live-location-sharing-state={driverLiveLocation.sharingState}
                  >
                    {driverLiveLocationSharingLabel}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    className="h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-500 disabled:cursor-not-allowed disabled:opacity-70"
                    data-driver-live-location-share-button={driverLiveLocationUiState}
                    disabled={driverLiveLocationShareDisabled}
                    onClick={shareDriverLiveLocation}
                    type="button"
                  >
                    {driverLiveLocation.action === "sharing" ? "Sharing..." : "Share Location"}
                  </button>
                  <button
                    className="h-11 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm font-semibold text-slate-500 disabled:cursor-not-allowed disabled:opacity-70"
                    data-driver-live-location-stop-button={driverLiveLocationUiState}
                    disabled={driverLiveLocationStopDisabled}
                    onClick={stopDriverLiveLocation}
                    type="button"
                  >
                    {driverLiveLocation.action === "stopping" ? "Stopping..." : "Stop Sharing"}
                  </button>
                </div>
                {driverLiveLocation.feedback ? (
                  <p
                    aria-live="polite"
                    className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${feedbackClassName(driverLiveLocation.feedback.tone)}`}
                    data-driver-live-location-feedback="true"
                  >
                    {driverLiveLocation.feedback.text}
                  </p>
                ) : null}
                <dl className="grid gap-1.5 text-xs font-semibold text-slate-600 sm:grid-cols-3">
                  <div className="rounded-md bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-200">
                    <dt className="uppercase text-slate-500">Permission</dt>
                    <dd
                      className="mt-1 text-slate-800"
                      data-driver-live-location-permission-state={driverLiveLocation.permissionState}
                    >
                      {driverLiveLocationPermissionLabel(driverLiveLocation.permissionState)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-200">
                    <dt className="uppercase text-slate-500">Last shared</dt>
                    <dd
                      className="mt-1 text-slate-800"
                      data-driver-live-location-last-shared={driverLiveLocation.lastSharedAt ? "shared" : "not_shared"}
                    >
                      {formatDriverLiveLocationTime(driverLiveLocation.lastSharedAt)}
                    </dd>
                  </div>
                  <div className="rounded-md bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-200">
                    <dt className="uppercase text-slate-500">State</dt>
                    <dd
                      className="mt-1 text-slate-800"
                      data-driver-live-location-stale-state={driverLiveLocation.staleState}
                    >
                      {driverLiveLocationStaleLabel(driverLiveLocation.staleState)}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            <section
              className="order-3 flex flex-col gap-2 pb-4"
              aria-labelledby="driver-status-heading"
              data-driver-primary-step="status-workflow"
            >
              <h2 id="driver-status-heading" className="text-base font-semibold text-slate-900">
                Job Status
              </h2>
              <div className="order-1 grid gap-2 md:grid-cols-4" data-driver-primary-step="status-buttons">
                {statusActions.map((statusAction) => (
                  <div className="space-y-2" key={statusAction.label}>
                    <button
                      className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 transition active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      data-driver-job-status={statusAction.label}
                      disabled={Boolean(updatingStatus)}
                      onClick={() => updateStatus(statusAction.value, statusAction.label, statusAction.displayLabel)}
                      type="button"
                    >
                      {updatingStatus === statusAction.label ? "Updating..." : statusAction.label}
                    </button>
                    {statusFeedback?.target === statusAction.label ? (
                      <p
                        aria-live="polite"
                        className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${feedbackClassName(statusFeedback.tone)}`}
                        data-driver-job-status-message={statusAction.label}
                      >
                        {statusFeedback.text}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              {driverOtsPhotoProofReady ? (
                <div
                  className="order-2 space-y-2 rounded-md border border-sky-200 bg-sky-50/70 p-2.5"
                  data-driver-job-ots-photo-proof="true"
                  data-driver-primary-step="ots-photo-proof"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-semibold text-sky-950">OTS Photo to Admin</h3>
                      <p className="text-xs font-semibold leading-5 text-sky-900">
                        Send one arrival photo after OTS. Admin sees it inside Dispatch.
                        Large phone photos are reduced automatically before sending.
                      </p>
                    </div>
                    <span
                      className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-sky-900 ring-1 ring-sky-200"
                      data-driver-job-ots-photo-proof-state={driverOtsPhotoProofStatusLabel.toLowerCase()}
                    >
                      {driverOtsPhotoProofStatusLabel}
                    </span>
                  </div>
                  <label className="block space-y-1 text-sm font-semibold text-sky-950">
                    <span>Photo</span>
                    <input
                      accept="image/heic,image/heif,image/jpeg,image/png,image/webp,image/*"
                      capture="environment"
                      className="block w-full rounded-md border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 file:mr-3 file:rounded file:border-0 file:bg-sky-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-sky-950"
                      data-driver-job-ots-photo-proof-input="true"
                      onChange={handleDriverOtsPhotoFileChange}
                      ref={driverOtsPhotoProofInputRef}
                      type="file"
                    />
                  </label>
                  <button
                    className="h-11 w-full rounded-md border border-sky-400 bg-white px-3 text-sm font-semibold text-sky-950 transition active:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                    data-driver-job-ots-photo-proof-upload="true"
                    disabled={driverOtsPhotoProofUploadDisabled}
                    onClick={uploadDriverOtsPhotoProof}
                    type="button"
                  >
                    {driverOtsPhotoProof.action === "uploading" ? "Sending..." : "Send Photo to Admin"}
                  </button>
                  {driverOtsPhotoProof.feedback ? (
                    <p
                      aria-live="polite"
                      className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${feedbackClassName(driverOtsPhotoProof.feedback.tone)}`}
                      data-driver-job-ots-photo-proof-message="true"
                    >
                      {driverOtsPhotoProof.feedback.text}
                    </p>
                  ) : null}
                  <p
                    className="text-xs font-semibold leading-5 text-sky-900"
                    data-driver-job-ots-photo-proof-boundary="true"
                  >
                    Admin-only proof. No customer message or external send is created from here.
                  </p>
                </div>
              ) : null}
              <div
                className="order-3 space-y-2 rounded-md border border-slate-200 bg-white p-2.5"
                data-driver-job-status-timing-evidence="true"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">Status Timing</p>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    Read-only
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                  {driverStatusTimingRows.map((timingRow) => (
                    <div
                      className="rounded-md bg-slate-50 px-2.5 py-1.5 ring-1 ring-slate-200"
                      data-driver-job-status-timing-row={timingRow.key}
                      data-driver-job-status-timing-state={timingRow.occurredAt ? "recorded" : "pending"}
                      key={timingRow.key}
                    >
                      <p
                        className="text-xs font-semibold uppercase text-slate-500"
                        data-driver-job-status-timing-label="true"
                      >
                        {timingRow.label}
                      </p>
                      {timingRow.occurredAt ? (
                        <time
                          className="mt-1 block break-words text-sm font-semibold text-slate-900"
                          data-driver-job-status-timing-time="true"
                          dateTime={timingRow.occurredAt}
                        >
                          {timingRow.timeText}
                        </time>
                      ) : (
                        <span
                          className="mt-1 block text-sm font-semibold text-slate-500"
                          data-driver-job-status-timing-time="true"
                        >
                          {timingRow.timeText}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs font-semibold leading-5 text-slate-600" data-driver-job-status-timing-boundary="true">
                  Times are recorded automatically after accepted status updates.
                </p>
              </div>
            </section>

            <section
              className="order-[92] space-y-2 rounded-md border border-amber-200 bg-amber-50/70 p-2.5"
              data-driver-job-report-issue="true"
              data-driver-primary-step="report-issue"
            >
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-amber-950">Report Issue</h2>
                <p className="text-sm font-medium leading-6 text-amber-900">
                  Choose the issue and alert admin inside the app.
                </p>
              </div>
              <label className="block space-y-1 text-sm font-semibold text-amber-950">
                <span>Issue type</span>
                <select
                  className="h-10 w-full rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  data-driver-job-report-issue-select="true"
                  onChange={(event) => {
                    setSelectedDriverIssue(event.target.value);
                    setDriverIssueFeedback(null);
                  }}
                  value={selectedDriverIssue}
                >
                  <option value="">Choose issue</option>
                  {driverJobIssueChoices.map((choice) => (
                    <option data-driver-job-report-issue-choice={choice.value} key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-2">
                <button
                  className="h-11 w-full rounded-md bg-amber-700 px-3 text-sm font-semibold text-white transition active:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                  data-driver-job-report-issue-submit="true"
                  disabled={reportingDriverIssue}
                  onClick={reportDriverIssue}
                  type="button"
                >
                  {reportingDriverIssue ? "Alerting..." : "Alert Admin"}
                </button>
                {driverIssueFeedback ? (
                  <p
                    aria-live="polite"
                    className={`rounded-md border px-2.5 py-1.5 text-sm font-semibold ${feedbackClassName(driverIssueFeedback.tone)}`}
                    data-driver-job-report-issue-message="true"
                  >
                    {driverIssueFeedback.text}
                  </p>
                ) : null}
              </div>
              <p className="text-xs font-semibold leading-5 text-amber-900" data-driver-job-report-issue-boundary="true">
                Internal app alert only. No external messages, live location, or photo upload.
              </p>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
