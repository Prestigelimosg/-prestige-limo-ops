"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PublicAppBuildMarker } from "@/app/public-app-build-marker";
import type { SafeDriverJobPayload } from "../../lib/driver-job-link";

type DriverPortalJob = {
  job_key: string;
  payload: SafeDriverJobPayload;
  state: "assigned" | "driver_otw" | "ots" | "pob";
  state_label: string;
};

type DriverPoolAvailableJob = {
  closes_at: string;
  offer_key: string;
  offer_payout_sgd: number;
  pickup_at: string;
  public_booking_reference: string;
  safe_dropoff_area: string;
  safe_pickup_area: string;
  safe_trip_summary: string | null;
  safe_vehicle_label: string | null;
  updated_at: string;
};

type DriverPortalNotificationAlert = {
  notification_ids: string[];
  created_at: string;
  job_key: string;
  job_reference: string;
  latest_message: string;
  latest_title: string;
  priority: "low" | "normal" | "high" | "urgent";
  update_count: number;
};

type DriverPortalReadState =
  | { kind: "loading" }
  | {
      accountSession: boolean;
      alertCount: number;
      alerts: DriverPortalNotificationAlert[];
      alertsAvailable: boolean;
      kind: "ready";
      jobs: DriverPortalJob[];
    }
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

const driverPoolAvailableJobsRefreshIntervalMs = 3_000;

type DriverNativeWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void };
  __PRESTIGE_DRIVER_BIOMETRIC_ENABLED__?: boolean;
  __PRESTIGE_DRIVER_INSTALLATION_ID__?: string;
  __PRESTIGE_DRIVER_NATIVE_APP__?: boolean;
  __PRESTIGE_DRIVER_NOTIFICATIONS_ENABLED__?: boolean;
  __PRESTIGE_DRIVER_MESSAGE_OPEN_SUPPORTED__?: boolean;
};

type DriverAccountSignInState = "idle" | "signing_in" | "failed";

const driverAlertDatabaseName = "prestige-driver-device-alerts";
const driverAlertDatabaseVersion = 1;
const driverJobLinkStoreName = "driver-job-links";

function displayValue(value: string | null | undefined) {
  return value?.trim() || "—";
}

function pickupDisplay(job: SafeDriverJobPayload) {
  return [job.pickupDate, job.pickupTime].filter(Boolean).join(" · ") || "Schedule pending";
}

function notificationTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })
    : "Time unavailable";
}

function currentNativeInstallationId() {
  const nativeWindow = window as DriverNativeWindow;
  const value = nativeWindow.__PRESTIGE_DRIVER_INSTALLATION_ID__;
  return nativeWindow.__PRESTIGE_DRIVER_NATIVE_APP__ === true && typeof value === "string"
    ? value
    : "";
}

function currentNativeBiometricEnabled() {
  return (window as DriverNativeWindow).__PRESTIGE_DRIVER_BIOMETRIC_ENABLED__ === true;
}

function currentNativeNotificationsEnabled() {
  return (window as DriverNativeWindow).__PRESTIGE_DRIVER_NOTIFICATIONS_ENABLED__ === true;
}

function subscribeToStaticNativeBridge() {
  return () => undefined;
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

async function readDriverPortalAlertState(): Promise<DriverPortalAlertState> {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return "unavailable";
  }
  if (Notification.permission === "denied") {
    return "blocked";
  }
  if (Notification.permission !== "granted") {
    return "available";
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration("/driver-job/");
    const subscription = await registration?.pushManager.getSubscription();
    return subscription ? "enabled" : "available";
  } catch {
    return "available";
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
  const [availableJobs, setAvailableJobs] = useState<DriverPoolAvailableJob[]>([]);
  const [availableJobsEnabled, setAvailableJobsEnabled] = useState(false);
  const [availableJobsReadAvailable, setAvailableJobsReadAvailable] = useState(false);
  const [availableJobsHasMore, setAvailableJobsHasMore] = useState(false);
  const [availableJobsPage, setAvailableJobsPage] = useState(1);
  const [availableJobsBusy, setAvailableJobsBusy] = useState(false);
  const [availableJobsFeedback, setAvailableJobsFeedback] = useState<Record<string, string>>({});
  const [availableJobsAcceptedConfirmation, setAvailableJobsAcceptedConfirmation] = useState("");
  const [notificationCentreOpen, setNotificationCentreOpen] = useState(false);
  const [clearingAlerts, setClearingAlerts] = useState(false);
  const [clearAlertsFeedback, setClearAlertsFeedback] = useState("");
  const clearingAlertsRef = useRef(false);
  const jobsReadRevisionRef = useRef(0);
  const availableJobsReadRevisionRef = useRef(0);
  const installationId = useSyncExternalStore(
    subscribeToStaticNativeBridge,
    currentNativeInstallationId,
    () => "",
  );
  const nativeBiometricEnabled = useSyncExternalStore(
    subscribeToStaticNativeBridge,
    currentNativeBiometricEnabled,
    () => false,
  );
  const nativeBridgeReady = Boolean(
    installationId &&
    typeof (window as DriverNativeWindow).ReactNativeWebView?.postMessage === "function",
  );
  const [accountEmail, setAccountEmail] = useState("");
  const [accountEmailConfirmed, setAccountEmailConfirmed] = useState(false);
  const [accountFirstSignIn, setAccountFirstSignIn] = useState(false);
  const nativePinSignIn = nativeBridgeReady && /\b(?:Android|iPhone)\b/i.test(window.navigator.userAgent);
  const accountPinOnly = nativePinSignIn && !accountFirstSignIn;
  const [accountPassword, setAccountPassword] = useState("");
  const [accountSignInState, setAccountSignInState] = useState<DriverAccountSignInState>("idle");
  const [biometricFeedback, setBiometricFeedback] = useState("");
  const [biometricEnabledThisSession, setBiometricEnabledThisSession] = useState(false);
  const biometricSetupEnabled = nativeBiometricEnabled || biometricEnabledThisSession;
  const driverPoolAccountSession = readState.kind === "ready" && readState.accountSession;
  const driverPortalSavedAlertsAvailable = readState.kind === "ready" && readState.alertsAvailable;
  const driverPortalSavedAlertCount = driverPortalSavedAlertsAvailable ? readState.alertCount : 0;
  const driverPoolVisibleAlertCount = availableJobsReadAvailable && availableJobsEnabled ? availableJobs.length : 0;
  const driverPoolHasCurrentAlerts = availableJobsReadAvailable && availableJobsEnabled && (availableJobs.length > 0 || availableJobsHasMore);
  const driverPortalCurrentAlertCount = driverPortalSavedAlertCount + driverPoolVisibleAlertCount;
  const driverPortalCountsAvailable = driverPortalSavedAlertsAvailable && availableJobsReadAvailable;
  const driverPortalAlertCountLabel = !driverPortalCountsAvailable
    ? driverPortalCurrentAlertCount > 0
      ? `${driverPortalCurrentAlertCount}+`
      : "?"
    : availableJobsEnabled && availableJobsHasMore
      ? `${driverPortalCurrentAlertCount}+`
      : String(driverPortalCurrentAlertCount);
  const installedAccountSignInRequired = Boolean(
    installationId &&
    (
      readState.kind === "blocked" ||
      (readState.kind === "ready" && !readState.accountSession)
    ),
  );

  const loadJobs = useCallback(async () => {
    if (clearingAlertsRef.current) return;
    const revision = ++jobsReadRevisionRef.current;
    try {
      const nativeInstallationId = currentNativeInstallationId();
      const response = await fetch("/api/driver-portal/jobs", {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-prestige-driver-purpose": "driver-portal-jobs-read",
          ...(nativeInstallationId
            ? { "x-prestige-driver-installation-id": nativeInstallationId }
            : {}),
        },
      });
      const result = await response.json() as {
        alert_count?: number;
        alerts?: DriverPortalNotificationAlert[];
        alerts_available?: boolean;
        device_alerts?: { public_key?: string | null; ready?: boolean };
        jobs?: DriverPortalJob[];
        ok?: boolean;
        reason?: string;
        session?: "account" | "link";
      };
      if (revision !== jobsReadRevisionRef.current) return;
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
      setAlertState(
        nativeInstallationId
          ? currentNativeNotificationsEnabled()
            ? "enabled"
            : "available"
          : await readDriverPortalAlertState(),
      );
      if (revision !== jobsReadRevisionRef.current) return;
      setReadState({
        accountSession: result.session === "account",
        alertCount: Number.isSafeInteger(result.alert_count) && Number(result.alert_count) >= 0
          ? Number(result.alert_count)
          : 0,
        alerts: Array.isArray(result.alerts) ? result.alerts : [],
        alertsAvailable: result.alerts_available === true,
        kind: "ready",
        jobs: Array.isArray(result.jobs) ? result.jobs : [],
      });
    } catch {
      if (revision !== jobsReadRevisionRef.current) return;
      setReadState({ kind: "blocked", reason: "unavailable" });
    }
  }, []);

  const loadAvailableJobs = useCallback(async (page = 1, options: { quiet?: boolean } = {}) => {
    const revision = availableJobsReadRevisionRef.current + 1;
    availableJobsReadRevisionRef.current = revision;
    if (!options.quiet) setAvailableJobsBusy(true);
    try {
      const nativeInstallationId = currentNativeInstallationId();
      const response = await fetch(`/api/driver-job-bids?page=${page}&limit=20`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-prestige-driver-purpose": "driver-pool-offers-read",
          ...(nativeInstallationId ? { "x-prestige-driver-installation-id": nativeInstallationId } : {}),
        },
      });
      const result = await response.json() as { enabled?: boolean; has_more?: boolean; jobs?: DriverPoolAvailableJob[]; ok?: boolean };
      if (!response.ok || result.ok !== true) throw new Error("Available Jobs could not be loaded.");
      if (availableJobsReadRevisionRef.current !== revision) return;
      setAvailableJobsReadAvailable(true);
      setAvailableJobsEnabled(result.enabled === true);
      const jobs = Array.isArray(result.jobs) ? result.jobs : [];
      setAvailableJobs((current) => page === 1 ? jobs : [...current, ...jobs]);
      setAvailableJobsHasMore(result.has_more === true);
      setAvailableJobsPage(page);
    } catch {
      if (availableJobsReadRevisionRef.current === revision && !options.quiet) {
        setAvailableJobsReadAvailable(false);
        setAvailableJobsEnabled(false);
      }
    } finally {
      if (availableJobsReadRevisionRef.current === revision && !options.quiet) {
        setAvailableJobsBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      void loadJobs();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [loadJobs]);

  useEffect(() => {
    if (!driverPoolAccountSession) {
      setAvailableJobs([]);
      setAvailableJobsEnabled(false);
      setAvailableJobsReadAvailable(false);
      setAvailableJobsHasMore(false);
      setAvailableJobsPage(1);
      setAvailableJobsAcceptedConfirmation("");
      setNotificationCentreOpen(false);
      return;
    }
    void loadAvailableJobs(1);
  }, [driverPoolAccountSession, loadAvailableJobs]);

  useEffect(() => {
    if (
      !driverPoolAccountSession ||
      !availableJobsEnabled ||
      new URLSearchParams(window.location.search).get("view") !== "available-jobs"
    ) {
      return;
    }

    const scrollFrame = window.requestAnimationFrame(() => {
      document.getElementById("available-jobs")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(scrollFrame);
  }, [availableJobsEnabled, driverPoolAccountSession]);

  useEffect(() => {
    if (!driverPoolAccountSession) return;
    const refresh = () => {
      if (document.visibilityState === "visible" && !availableJobsBusy) {
        void loadAvailableJobs(1, { quiet: true });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, driverPoolAvailableJobsRefreshIntervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [availableJobsBusy, driverPoolAccountSession, loadAvailableJobs]);

  async function decideAvailableJob(job: DriverPoolAvailableJob, action: "accept" | "decline") {
    availableJobsReadRevisionRef.current += 1;
    setAvailableJobsBusy(true);
    setAvailableJobsFeedback((current) => ({ ...current, [job.offer_key]: "Working…" }));
    try {
      const nativeInstallationId = currentNativeInstallationId();
      const response = await fetch("/api/driver-job-bids", {
        body: JSON.stringify({ offer_key: job.offer_key, expected_updated_at: job.updated_at, idempotency_key: crypto.randomUUID() }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "x-prestige-driver-purpose": action === "accept" ? "driver-pool-offer-accept" : "driver-pool-offer-decline",
          ...(nativeInstallationId ? { "x-prestige-driver-installation-id": nativeInstallationId } : {}) },
        method: action === "accept" ? "POST" : "PATCH",
      });
      const result = await response.json() as { accepted?: boolean; ok?: boolean; reason?: string };
      if (action === "accept" && result.reason === "vehicle_mismatch") {
        throw new Error("This job requires a different vehicle type.");
      }
      if (!response.ok || result.ok !== true) throw new Error(result.reason || "This offer is no longer available.");
      setAvailableJobs((current) => current.filter((item) => item.offer_key !== job.offer_key));
      if (result.accepted) {
        setAvailableJobsAcceptedConfirmation("Accepted! Pls ack when admin send job link");
      }
      setAvailableJobsFeedback((current) => ({ ...current, [job.offer_key]: result.accepted ? "Accepted! Pls ack when admin send job link" : "Declined." }));
    } catch (error) {
      setAvailableJobsFeedback((current) => ({ ...current, [job.offer_key]: error instanceof Error ? error.message : "This offer is no longer available." }));
      await loadAvailableJobs(1);
    } finally { setAvailableJobsBusy(false); }
  }

  useEffect(() => {
    function onBiometricResult(event: Event) {
      const result = event as CustomEvent<{ ok?: boolean }>;
      if (result.detail?.ok === true) {
        setBiometricEnabledThisSession(true);
      }
      setBiometricFeedback(
        result.detail?.ok === true
          ? "Face ID is enabled for future app unlocks."
          : "Face ID was not enabled. Your password sign-in remains active.",
      );
    }

    window.addEventListener("prestige-driver-native-biometric-result", onBiometricResult);
    return () => window.removeEventListener("prestige-driver-native-biometric-result", onBiometricResult);
  }, []);

  useEffect(() => {
    function onNativeNotificationResult(event: Event) {
      const result = event as CustomEvent<{
        ok?: boolean;
        state?: "denied" | "enabled" | "failed";
      }>;
      setAlertState(
        result.detail?.ok === true && result.detail.state === "enabled"
          ? "enabled"
          : result.detail?.state === "denied"
            ? "blocked"
            : "unavailable",
      );
    }

    window.addEventListener(
      "prestige-driver-native-notification-result",
      onNativeNotificationResult,
    );
    return () => window.removeEventListener(
      "prestige-driver-native-notification-result",
      onNativeNotificationResult,
    );
  }, []);

  useEffect(() => {
    function onNativeJobOpenResult(event: Event) {
      const result = event as CustomEvent<{ jobKey?: string; ok?: boolean }>;
      const jobKey = result.detail?.jobKey || "";
      if (result.detail?.ok !== false || !/^[0-9a-f]{64}$/.test(jobKey)) {
        return;
      }
      setOpenFeedback((current) => ({
        ...current,
        [jobKey]: "This private job is not saved in Prestige Driver yet. Open the latest link from dispatch once.",
      }));
      setOpeningJobKey((current) => current === jobKey ? "" : current);
    }

    window.addEventListener("prestige-driver-native-job-open-result", onNativeJobOpenResult);
    return () => window.removeEventListener("prestige-driver-native-job-open-result", onNativeJobOpenResult);
  }, []);

  async function signInDriverAccount() {
    if (!installationId) return;

    setAccountSignInState("signing_in");
    try {
      const response = await fetch("/api/driver-auth/session", {
        body: JSON.stringify({
          ...(accountPinOnly ? {} : { email: accountEmail }),
          installation_id: installationId,
          password: accountPassword,
        }),
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-prestige-driver-purpose": "driver-account-sign-in",
        },
        method: "POST",
      });
      const result = await response.json() as { ok?: boolean; reason?: string };
      if (!response.ok || result.ok !== true) {
        setAccountSignInState("failed");
        return;
      }

      setAccountPassword("");
      setAccountSignInState("idle");
      await loadJobs();
    } catch {
      setAccountSignInState("failed");
    }
  }

  function enableBiometricUnlock() {
    setBiometricFeedback("");
    (window as DriverNativeWindow).ReactNativeWebView?.postMessage(JSON.stringify({
      type: "native_biometrics_enable",
    }));
  }

  async function enableJobAlerts() {
    if (nativeBridgeReady) {
      const notificationJob = readState.kind === "ready" ? readState.jobs[0] : null;
      if (!notificationJob) {
        setAlertState("unavailable");
        return;
      }

      setAlertState("enabling");
      (window as DriverNativeWindow).ReactNativeWebView?.postMessage(JSON.stringify({
        job_key: notificationJob.job_key,
        type: "native_notifications_register",
      }));
      return;
    }

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
          ...(installationId
            ? { "x-prestige-driver-installation-id": installationId }
            : {}),
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

  async function clearCurrentAlerts() {
    if (clearingAlertsRef.current || readState.kind !== "ready" || !readState.alertsAvailable) return;
    const notificationIds = [...new Set(readState.alerts.flatMap((alert) => alert.notification_ids || []))];
    if (!notificationIds.length) return;
    clearingAlertsRef.current = true;
    ++jobsReadRevisionRef.current;
    setClearingAlerts(true);
    setClearAlertsFeedback("");
    try {
      for (let offset = 0; offset < notificationIds.length; offset += 100) {
        const result = await fetch("/api/driver-portal/jobs", {
          method: "PATCH", credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-prestige-driver-purpose": "driver-portal-alerts-clear",
            ...(installationId ? { "x-prestige-driver-installation-id": installationId } : {}),
          },
          body: JSON.stringify({ notification_ids: notificationIds.slice(offset, offset + 100) }),
        });
        const body = await result.json();
        if (!result.ok || body.ok !== true) throw new Error("Clear failed");
      }
    } catch {
      setClearAlertsFeedback("Some alerts could not be cleared. Refresh and try again.");
    } finally {
      clearingAlertsRef.current = false;
      await loadJobs();
      setClearingAlerts(false);
    }
  }

  function openAvailableJobsFromNotificationCentre() {
    setNotificationCentreOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("available-jobs")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function openJob(job: DriverPortalJob, openMessages = false) {
    setOpeningJobKey(job.job_key);
    setOpenFeedback((current) => ({ ...current, [job.job_key]: "" }));
    try {
      if (installationId) {
        const nativeBridge = (window as DriverNativeWindow).ReactNativeWebView;
        if (!nativeBridge) {
          throw new Error("Native Driver bridge unavailable");
        }
        nativeBridge.postMessage(JSON.stringify({
          job_key: job.job_key,
          type: "native_job_open",
          ...(openMessages && (window as DriverNativeWindow).__PRESTIGE_DRIVER_MESSAGE_OPEN_SUPPORTED__ === true
            ? { open_target: "messages" }
            : {}),
        }));
        return;
      }
      const url = await storedDriverJobUrl(job.job_key);
      if (!url) {
        setOpenFeedback((current) => ({
          ...current,
          [job.job_key]: "Open and acknowledge the latest private link from dispatch once on this device.",
        }));
        return;
      }
      setNotificationCentreOpen(false);
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
    <main
      className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5 sm:py-6"
      data-driver-portal-page="true"
    >
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rounded-2xl bg-slate-950 px-4 py-5 text-white shadow-sm sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Prestige Limo</p>
              <h1 className="mt-1 text-2xl font-bold" data-driver-portal-heading="true">
                Driver Portal
              </h1>
              <PublicAppBuildMarker tone="dark" />
            </div>
            {readState.kind === "ready" && readState.accountSession ? (
              <button
                aria-controls="driver-notification-centre"
                aria-expanded={notificationCentreOpen}
                className="min-h-11 shrink-0 rounded-full border border-slate-600 bg-slate-900 px-3 text-sm font-bold text-white"
                data-driver-notification-centre-trigger="true"
                onClick={() => setNotificationCentreOpen((current) => !current)}
                type="button"
              >
                Alerts {driverPortalAlertCountLabel}
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
            Your acknowledged upcoming and active jobs on this device.
          </p>
          {readState.kind === "ready" && readState.accountSession && notificationCentreOpen ? (
            <section
              aria-label="Driver alerts"
              className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto rounded-xl border border-slate-700 bg-white p-2 text-slate-950 shadow-lg"
              data-driver-notification-centre="true"
              id="driver-notification-centre"
            >
              <div className="px-2 py-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold">Current alerts</h2>
                  {driverPortalSavedAlertsAvailable && driverPortalSavedAlertCount > 0 ? (
                    <button type="button" data-driver-notification-centre-clear="true"
                      className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
                      disabled={clearingAlerts} onClick={() => void clearCurrentAlerts()}>
                      {clearingAlerts ? "Clearing…" : "Clear"}
                    </button>
                  ) : null}
                </div>
                {clearAlertsFeedback ? <p role="status" className="text-xs text-amber-800">{clearAlertsFeedback}</p> : null}
                <p className="text-xs font-semibold leading-5 text-slate-500">
                  Safe current actions only. Old, reassigned and completed jobs stay hidden.
                </p>
              </div>
              {driverPoolHasCurrentAlerts ? (
                <button
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-left ring-1 ring-emerald-200"
                  data-driver-notification-purpose="available-jobs"
                  onClick={openAvailableJobsFromNotificationCentre}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-emerald-950">Available jobs</span>
                    <span className="block text-xs font-semibold text-emerald-800">Review privacy-safe Driver Pool offers</span>
                  </span>
                  <span className="rounded-full bg-emerald-700 px-2.5 py-1 text-xs font-bold text-white">
                    {availableJobs.length}{availableJobsHasMore ? "+" : ""}
                  </span>
                </button>
              ) : null}
              {readState.alerts.map((alert) => {
                const job = readState.jobs.find((candidate) => candidate.job_key === alert.job_key);
                return job ? (
                  <button
                    className="flex min-h-16 w-full items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-left ring-1 ring-slate-200"
                    data-driver-notification-job={alert.job_key}
                    data-driver-notification-purpose="job-update"
                    key={alert.job_key}
                    onClick={() => void openJob(job, true)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">Job {alert.job_reference}</span>
                      <span className="mt-0.5 block truncate text-sm font-bold text-slate-950">{alert.latest_title}</span>
                      <span className="block truncate text-xs font-semibold text-slate-600">{alert.latest_message}</span>
                      <span className="mt-1 block text-[11px] font-semibold text-slate-500">{notificationTime(alert.created_at)}</span>
                      {openFeedback[job.job_key] ? (
                        <span
                          className="mt-1 block text-xs font-semibold leading-5 text-amber-900"
                          data-driver-notification-open-feedback={job.job_key}
                          role="status"
                        >
                          {openFeedback[job.job_key]}
                        </span>
                      ) : null}
                    </span>
                    <span className={`mt-1 rounded-full px-2.5 py-1 text-xs font-bold ${alert.priority === "urgent" || alert.priority === "high" ? "bg-amber-100 text-amber-950" : "bg-sky-100 text-sky-950"}`}>
                      {alert.update_count}
                    </span>
                  </button>
                ) : null;
              })}
              {driverPortalCountsAvailable && !driverPoolHasCurrentAlerts && driverPortalCurrentAlertCount === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600">
                  No current alerts.
                </p>
              ) : null}
              {!readState.alertsAvailable ? (
                <p className="px-2 py-1 text-xs font-semibold leading-5 text-amber-800">
                  Saved job updates are temporarily unavailable. Current Driver Pool offers remain authoritative.
                </p>
              ) : null}
              {!availableJobsReadAvailable ? (
                <p className="px-2 py-1 text-xs font-semibold leading-5 text-amber-800">
                  Available job offers are temporarily unavailable. Refresh before relying on this alert count.
                </p>
              ) : null}
            </section>
          ) : null}
        </header>

        {readState.kind === "loading" ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-driver-portal-loading="true">
            <p className="text-sm font-semibold text-slate-700">Loading assigned jobs…</p>
          </section>
        ) : installedAccountSignInRequired ? (
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-driver-portal-sign-in="true">
            <h2 className="text-lg font-bold text-slate-950">Driver sign in</h2>
            <p className="text-sm font-medium leading-6 text-slate-700">
              {accountPinOnly
                ? "Enter your 6-digit PIN on your registered phone."
                : <>Sign in with the account created from your acknowledged private Job Link. The first
                  successful sign-in binds this account to this Prestige Driver installation.</>}
            </p>
            {nativePinSignIn ? (
              <button
                className="text-xs font-semibold text-slate-700 underline"
                data-driver-portal-first-sign-in="true"
                disabled={accountSignInState === "signing_in"}
                onClick={() => {
                  setAccountFirstSignIn(!accountFirstSignIn);
                  setAccountEmail("");
                  setAccountEmailConfirmed(false);
                  setAccountPassword("");
                  setAccountSignInState("idle");
                }}
                type="button"
              >{accountPinOnly ? "First sign-in" : "Use PIN"}</button>
            ) : null}
            {!accountPinOnly && !accountEmailConfirmed ? (
              <form
                className="space-y-3"
                data-driver-portal-email-step="true"
                onSubmit={(event) => {
                  event.preventDefault();
                  setAccountEmail(accountEmail.trim());
                  setAccountEmailConfirmed(true);
                  setAccountSignInState("idle");
                }}
              >
                <label className="block text-sm font-semibold text-slate-800">
                  Email
                  <input
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect="off"
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950"
                    inputMode="email"
                    name="email"
                    onChange={(event) => setAccountEmail(event.target.value)}
                    required
                    spellCheck={false}
                    type="email"
                    value={accountEmail}
                  />
                </label>
                <button
                  className="h-11 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white disabled:bg-slate-400"
                  disabled={!accountEmail.trim()}
                  type="submit"
                >Continue</button>
              </form>
            ) : (
              <form
                className="space-y-3"
                data-driver-portal-password-form="true"
                onSubmit={(event) => {
                  event.preventDefault();
                  void signInDriverAccount();
                }}
              >
                {!accountPinOnly ? <div
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                  data-driver-portal-confirmed-email="true"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Email</p>
                    <p className="truncate text-sm font-semibold text-slate-900">{accountEmail}</p>
                  </div>
                  <button
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                    data-driver-portal-change-email="true"
                    onClick={() => {
                      setAccountEmailConfirmed(false);
                      setAccountPassword("");
                      setAccountSignInState("idle");
                    }}
                    type="button"
                  >
                    Change email
                  </button>
                </div> : null}
                <label className="block text-sm font-semibold text-slate-800">
                  {nativePinSignIn ? "6-digit PIN" : "Password"}
                  <input
                    autoComplete="current-password"
                    className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-950"
                    inputMode="numeric"
                    maxLength={6}
                    name="password"
                    onChange={(event) => setAccountPassword(event.target.value)}
                    pattern="[0-9]{6}"
                    required
                    type="password"
                    value={accountPassword}
                  />
                </label>
                <button
                  className="h-11 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white disabled:bg-slate-400"
                  disabled={accountSignInState === "signing_in"}
                  type="submit"
                >
                  {accountSignInState === "signing_in" ? "Signing in…" : "Sign in"}
                </button>
                {accountSignInState === "failed" ? (
                  <p className="text-sm font-semibold leading-6 text-amber-900">
                    Sign-in could not be completed. Check your details or contact Prestige admin.
                  </p>
                ) : null}
              </form>
            )}
          </section>
        ) : readState.kind === "blocked" ? (
          <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm" data-driver-installation-required="true" data-driver-portal-blocked={readState.reason}>
            <h2 className="text-lg font-bold text-amber-950">Prestige Driver app required for account sign-in</h2>
            <p className="text-sm font-medium leading-6 text-amber-900">
              Account sign-in is available only inside the installed Prestige Driver app so one
              approved account can be secured to one phone.
            </p>
            <p className="text-sm font-medium leading-6 text-amber-900">
              The app is optional for reporting. You can still open the private Job Link from
              WhatsApp in this browser, save and acknowledge the job, and submit all Driver Reports.
            </p>
          </section>
        ) : (
          <section className="space-y-3" data-driver-portal-job-count={readState.jobs.length}>
            {nativeBridgeReady && readState.accountSession && !biometricSetupEnabled ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm" data-driver-portal-biometric-setup="true">
                <h2 className="text-base font-bold text-emerald-950">Face ID app unlock</h2>
                <p className="mt-1 text-sm font-medium leading-6 text-emerald-900">
                  Enable after your approved account is signed in. Face ID unlocks this app only and
                  never overrides account suspension or the one-phone lock.
                </p>
                <button
                  className="mt-3 h-11 w-full rounded-md bg-slate-950 px-4 text-sm font-semibold text-white"
                  onClick={enableBiometricUnlock}
                  type="button"
                >
                  Enable Face ID
                </button>
                {biometricFeedback ? (
                  <p className="mt-2 text-xs font-semibold leading-5 text-emerald-900">{biometricFeedback}</p>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm" data-driver-portal-alert-setup={alertState}>
              <h2 className="text-base font-bold text-sky-950">Job alerts</h2>
              <p className="mt-1 text-sm font-medium leading-6 text-sky-900">
                Enable once on this device to receive newly issued jobs and Driver Job updates.
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
                  Alerts are blocked. Open this device&apos;s notification settings, allow notifications
                  for Driver Portal, then try again.
                </p>
              ) : alertState === "unavailable" ? (
                <p className="mt-2 text-xs font-semibold leading-5 text-amber-900">
                  {nativeBridgeReady
                    ? "Job alerts could not be enabled. Open the latest acknowledged private Job Link in Prestige Driver once, then try again."
                    : "Job alerts are unavailable. Open this installed Driver Portal from your device's Home Screen and try again."}
                </p>
              ) : alertState === "enabled" ? (
                <p className="mt-2 text-xs font-semibold leading-5 text-emerald-800">
                  This device is ready for Driver Job alerts.
                </p>
              ) : null}
            </div>

            {availableJobsEnabled ? (
              <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm" data-driver-pool-available-jobs="true" id="available-jobs">
                <div className="flex items-center justify-between gap-2">
                  <div><h2 className="text-lg font-bold text-emerald-950">Available Jobs</h2><p className="text-xs font-semibold text-emerald-800">Fixed driver payout · earliest pickup first</p></div>
                  <button className="h-9 rounded-md border border-emerald-300 bg-white px-3 text-xs font-semibold" disabled={availableJobsBusy} onClick={() => void loadAvailableJobs(1)} type="button">Refresh</button>
                </div>
                {availableJobsAcceptedConfirmation ? (
                  <p className="text-xs font-semibold text-emerald-900" data-driver-pool-accepted-confirmation="true" role="status">
                    {availableJobsAcceptedConfirmation}
                  </p>
                ) : null}
                {availableJobs.length === 0 ? <p className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700">No open job offers.</p> : availableJobs.map((job) => (
                  <article className="rounded-md border border-emerald-200 bg-white p-3" data-driver-pool-offer={job.offer_key} key={job.offer_key}>
                    <h3 className="mb-2 text-lg font-extrabold uppercase leading-snug text-slate-950" data-driver-pool-service-vehicle="true">
                      {job.safe_trip_summary || "Transfer"} · {job.safe_vehicle_label?.trim().toUpperCase() === "ALPHARD" ? "AVF" : job.safe_vehicle_label || "Vehicle TBC"}
                    </h3>
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase text-slate-500">Job {job.public_booking_reference}</p><p className="font-bold text-slate-950">{new Date(job.pickup_at).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-bold text-emerald-900">SGD {job.offer_payout_sgd.toFixed(2)}</span></div>
                    <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
                      <div className="rounded-md bg-slate-50 px-2.5 py-2"><dt className="font-bold uppercase text-slate-500">Pickup area</dt><dd className="mt-0.5 font-semibold text-slate-800">{job.safe_pickup_area}</dd></div>
                      <div className="rounded-md bg-slate-50 px-2.5 py-2"><dt className="font-bold uppercase text-slate-500">Drop-off area</dt><dd className="mt-0.5 font-semibold text-slate-800">{job.safe_dropoff_area}</dd></div>
                      <div className="rounded-md bg-slate-50 px-2.5 py-2"><dt className="font-bold uppercase text-slate-500">Offer closes</dt><dd className="mt-0.5 font-semibold text-slate-800"><time dateTime={job.closes_at}>{new Date(job.closes_at).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })}</time></dd></div>
                    </dl>
                    <div className="mt-2 flex gap-2"><button className="h-10 flex-1 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white disabled:bg-slate-400" disabled={availableJobsBusy} onClick={() => void decideAvailableJob(job, "accept")} type="button">Accept</button><button className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold" disabled={availableJobsBusy} onClick={() => void decideAvailableJob(job, "decline")} type="button">Decline</button></div>
                    {availableJobsFeedback[job.offer_key] ? <p className="mt-2 text-xs font-semibold text-slate-600" role="status">{availableJobsFeedback[job.offer_key]}</p> : null}
                  </article>
                ))}
                {availableJobsHasMore ? <button className="h-10 w-full rounded-md border border-emerald-300 bg-white text-sm font-semibold" disabled={availableJobsBusy} onClick={() => void loadAvailableJobs(availableJobsPage + 1)} type="button">{availableJobsBusy ? "Loading…" : "Load more"}</button> : null}
              </section>
            ) : null}

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
