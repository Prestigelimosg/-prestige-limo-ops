import {
  parseDriverJobUrl,
  productionOrigin,
} from "./driver-job-contract.ts";

export { parseDriverJobUrl } from "./driver-job-contract.ts";

export type DriverTrackingBridgeMessage = {
  type: "tracking_start" | "tracking_stop" | "tracking_terminal";
};

export type DriverBridgeMessage =
  | DriverTrackingBridgeMessage
  | {type:"native_account_setup_save";email:string;password:string}
  | {type:"native_account_setup_cancel"}
  | {type:"native_account_setup_activated";setup_id:string;complete:boolean}
  | { jobKeys: string[]; expectedBadgeCount: number | null; requestId?: string; type: "native_alerts_dismiss" }
  | { type: "native_biometrics_enable" }
  | { jobKey: string; openTarget?: "messages"; type: "native_job_open" }
  | { jobKey: string; type: "native_job_remember" }
  | { jobKey?: string; accountSession?: true; type: "native_notifications_register" }
  | { requestId: string; registered: boolean; type: "native_notifications_registration_result" };

export type DriverTrackingResult = {
  active: boolean;
  message: string;
  ok: boolean;
  request: DriverTrackingBridgeMessage["type"];
};

const nativeCalendarOauthStartPath =
  "/api/driver-google-calendar-oauth/native-start";
const allowedReadOnlyPaths = new Set([
  "/google-calendar",
  "/privacy",
  "/terms",
]);
const driverPortalPath = "/driver-portal";
const nativeDriverJobHandoffPathPattern =
  /^\/api\/driver-native-job-open\/[0-9a-f]{64}$/;
const installationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseDriverBridgeMessage(value: string): DriverBridgeMessage | null {
  try {
    const parsed = asRecord(JSON.parse(value));
    const keys = Object.keys(parsed);

    if (parsed.type === "native_notifications_register" && keys.length === 2 && parsed.account_session === true) {
      return { type: "native_notifications_register", accountSession: true };
    }
    if (parsed.type === "native_notifications_registration_result" && keys.length === 3 &&
      typeof parsed.request_id === "string" && /^\d{1,16}-\d{1,6}$/.test(parsed.request_id) && typeof parsed.registered === "boolean") {
      return { type: "native_notifications_registration_result", requestId: parsed.request_id, registered: parsed.registered };
    }
    if (parsed.type === "native_alerts_dismiss" && (keys.length===3 || (keys.length===4 && typeof parsed.request_id==="string" && /^[a-f0-9-]{36}$/.test(parsed.request_id))) &&
      (parsed.expected_badge_count===null || (Number.isInteger(parsed.expected_badge_count) && Number(parsed.expected_badge_count)>=0 && Number(parsed.expected_badge_count)<=99)) && Array.isArray(parsed.job_keys) &&
      parsed.job_keys.length<=100 && parsed.job_keys.every(key=>typeof key==='string' && /^[a-f0-9]{64}$/.test(key))) {
      return {type:"native_alerts_dismiss",jobKeys:parsed.job_keys,expectedBadgeCount:parsed.expected_badge_count as number | null,requestId:parsed.request_id as string | undefined};
    }
    if (parsed.type === "native_account_setup_save" && keys.length === 3
      && typeof parsed.email === "string" && parsed.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.email)
      && typeof parsed.password === "string" && /^\d{6}$/.test(parsed.password)) {
      return {type:parsed.type,email:parsed.email,password:parsed.password};
    }
    if (parsed.type === "native_account_setup_cancel" && keys.length === 1) return {type:parsed.type};
    if (parsed.type === "native_account_setup_activated" && keys.length === 3
      && typeof parsed.setup_id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(parsed.setup_id)
      && typeof parsed.complete === "boolean") return {type:parsed.type,setup_id:parsed.setup_id,complete:parsed.complete};

    if (
      parsed.type === "native_job_open" &&
      parsed.open_target === "messages" &&
      keys.length === 3 &&
      keys.includes("job_key") && keys.includes("type") && keys.includes("open_target") &&
      typeof parsed.job_key === "string" && /^[0-9a-f]{64}$/.test(parsed.job_key)
    ) {
      return { jobKey: parsed.job_key, openTarget: "messages", type: "native_job_open" };
    }

    if (
      ["native_job_open", "native_job_remember", "native_notifications_register"].includes(
        String(parsed.type),
      ) &&
      keys.length === 2 &&
      keys.includes("job_key") &&
      keys.includes("type") &&
      typeof parsed.job_key === "string" &&
      /^[0-9a-f]{64}$/.test(parsed.job_key)
    ) {
      return {
        jobKey: parsed.job_key,
        type: parsed.type as
          | "native_job_open"
          | "native_job_remember"
          | "native_notifications_register",
      };
    }

    if (
      keys.length !== 1 ||
      keys[0] !== "type" ||
      ![
        "native_notifications_register",
        "native_biometrics_enable",
        "tracking_start",
        "tracking_stop",
        "tracking_terminal",
      ].includes(
        String(parsed.type),
      )
    ) {
      return null;
    }

    return {
      type: parsed.type as
        | DriverTrackingBridgeMessage["type"]
        | "native_biometrics_enable"
        | "native_notifications_register",
    };
  } catch {
    return null;
  }
}

function parseSameOriginUrl(value: string) {
  try {
    const parsed = new URL(value);

    return parsed.origin === productionOrigin && !parsed.username && !parsed.password
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isAllowedDriverPortalNavigation(parsed: URL) {
  if (parsed.pathname !== driverPortalPath || parsed.hash) {
    return false;
  }

  return !parsed.search ||
    (parsed.searchParams.size === 1 &&
      parsed.searchParams.get("view") === "available-jobs");
}

export function parseNativeCalendarOauthStartUrl(value: string) {
  const parsed = parseSameOriginUrl(value);

  if (
    !parsed ||
    parsed.pathname !== nativeCalendarOauthStartPath ||
    parsed.hash ||
    parsed.searchParams.size !== 1
  ) {
    return null;
  }

  const state = parsed.searchParams.get("state") || "";
  const stateParts = state.split(".");

  if (
    state.length < 80 ||
    state.length > 4096 ||
    stateParts.length !== 4 ||
    stateParts[0] !== "v1" ||
    stateParts.slice(1).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    return null;
  }

  return parsed.toString();
}

export function parseNativeDriverJobHandoffUrl(value: string) {
  const parsed = parseSameOriginUrl(value);
  return parsed &&
    nativeDriverJobHandoffPathPattern.test(parsed.pathname) &&
    !parsed.search &&
    !parsed.hash
    ? parsed.toString()
    : null;
}

export function shouldAllowDriverWebViewNavigation(
  requestedUrl: string,
  currentUrl: string,
) {
  const requested = parseSameOriginUrl(requestedUrl);
  const current = parseSameOriginUrl(currentUrl);
  if (!requested || !current) return false;

  if (isAllowedDriverPortalNavigation(requested)) {
    return true;
  }

  const requestedNativeHandoff = parseNativeDriverJobHandoffUrl(requestedUrl);
  const currentNativeHandoff = parseNativeDriverJobHandoffUrl(currentUrl);
  if (
    requestedNativeHandoff &&
    (isAllowedDriverPortalNavigation(current) || Boolean(currentNativeHandoff))
  ) {
    return true;
  }

  if (
    allowedReadOnlyPaths.has(requested.pathname) &&
    !requested.search &&
    !requested.hash
  ) {
    return true;
  }

  try {
    const requestedJob = parseDriverJobUrl(requestedUrl);
    if (
      isAllowedDriverPortalNavigation(current) ||
      Boolean(currentNativeHandoff)
    ) {
      return Boolean(requestedJob.token);
    }

    const currentJob = parseDriverJobUrl(currentUrl);
    return requestedJob.token === currentJob.token;
  } catch {
    return false;
  }
}

export function embeddedDriverBridgeBootstrap(
  installationId: string,
  biometricEnabled: boolean,
  notificationsEnabled = false,
  openTarget: "available_jobs" | "messages" | null = null,
) {
  if (!installationIdPattern.test(installationId)) {
    throw new Error("A valid native Driver installation is required.");
  }

  return `
(function () {
  Object.defineProperty(window, "__PRESTIGE_DRIVER_NATIVE_APP__", {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_DRIVER_INSTALLATION_ID__", {
    configurable: false,
    enumerable: false,
    value: ${JSON.stringify(installationId.toLowerCase())},
    writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_DRIVER_BIOMETRIC_ENABLED__", {
    configurable: false,
    enumerable: false,
    value: ${biometricEnabled === true},
    writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_DRIVER_ACCOUNT_ALERT_REGISTRATION_SUPPORTED__", {
    configurable: false, enumerable: false, value: true, writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_DRIVER_NOTIFICATIONS_ENABLED__", {
    configurable: false,
    enumerable: false,
    value: ${notificationsEnabled === true},
    writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_DRIVER_OPEN_TARGET__", {
    configurable: false,
    enumerable: false,
    value: ${openTarget === "messages" ? '"messages"' : openTarget === "available_jobs" ? '"available_jobs"' : "null"},
    writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_DRIVER_MESSAGE_OPEN_SUPPORTED__", {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_DRIVER_PENDING_JOB_OPEN_SUPPORTED__", {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_DRIVER_ALERT_DISMISS_SUPPORTED__", {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false
  });
  try {
    Object.defineProperty(navigator, "geolocation", {
      configurable: false,
      value: undefined,
      writable: false
    });
  } catch (_) {}
})();
true;
`;
}

export function driverTrackingResultScript(result: DriverTrackingResult) {
  const safeResult = {
    active: result.active === true,
    message: result.message.slice(0, 240),
    ok: result.ok === true,
    request: result.request,
  };

  return `window.dispatchEvent(new CustomEvent("prestige-driver-native-tracking-result", { detail: ${JSON.stringify(
    safeResult,
  )} })); true;`;
}

// Run in the signed-in WebView so its HttpOnly account cookie remains server-bound.
export function driverNativeAccountNotificationRegistrationScript(token: string, installationId: string, requestId: string) {
  if (!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(token) ||
    !installationIdPattern.test(installationId) || !/^\d{1,16}-\d{1,6}$/.test(requestId)) throw new Error("Invalid registration request.");
  return `void (async () => {
    if (location.origin !== ${JSON.stringify(productionOrigin)} || location.pathname !== "/driver-portal") return;
    let registered = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/driver-portal/jobs", {
        method: "POST", credentials: "same-origin", signal: controller.signal,
        headers: {"Content-Type":"application/json", "x-prestige-driver-purpose":"driver-portal-device-alert-registration",
          "x-prestige-driver-installation-id":${JSON.stringify(installationId)}},
        body: ${JSON.stringify(JSON.stringify({ native_push_token: token }))}
      });
      const body = await response.json();
      registered = response.ok && body.ok === true && body.device_alerts?.subscription_registered === true;
    } catch {} finally { clearTimeout(timeout); }
    window.ReactNativeWebView?.postMessage(JSON.stringify({type:"native_notifications_registration_result",
      request_id:${JSON.stringify(requestId)}, registered}));
  })(); true;`;
}

export function driverNativeNotificationResultScript(result: {
  ok: boolean;
  state: "denied" | "enabled" | "failed";
}) {
  const safeResult = {
    ok: result.ok === true,
    state: result.state,
  };

  return `window.dispatchEvent(new CustomEvent("prestige-driver-native-notification-result", { detail: ${JSON.stringify(
    safeResult,
  )} })); true;`;
}

export function driverNativeBiometricResultScript(result: { ok: boolean }) {
  return `window.dispatchEvent(new CustomEvent("prestige-driver-native-biometric-result", { detail: ${JSON.stringify({
    ok: result.ok === true,
  })} })); true;`;
}

export function driverNativeJobOpenResultScript(result: {
  jobKey: string;
  ok: boolean;
}) {
  const safeResult = {
    jobKey: /^[0-9a-f]{64}$/.test(result.jobKey) ? result.jobKey : "",
    ok: result.ok === true,
  };

  return `window.dispatchEvent(new CustomEvent("prestige-driver-native-job-open-result", { detail: ${JSON.stringify(
    safeResult,
  )} })); true;`;
}
