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
  | { type: "native_biometrics_enable" }
  | { type: "native_notifications_register" };

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

    return { type: parsed.type as DriverBridgeMessage["type"] };
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

export function shouldAllowDriverWebViewNavigation(
  requestedUrl: string,
  currentUrl: string,
) {
  const requested = parseSameOriginUrl(requestedUrl);
  const current = parseSameOriginUrl(currentUrl);
  if (!requested || !current) return false;

  if (
    requested.pathname === driverPortalPath &&
    !requested.search &&
    !requested.hash
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
    if (current.pathname === driverPortalPath && !current.search && !current.hash) {
      return Boolean(requestedJob.token);
    }

    const currentJob = parseDriverJobUrl(currentUrl);
    return requestedJob.token === currentJob.token;
  } catch {
    return false;
  }
}

export function embeddedDriverBridgeBootstrap(installationId: string) {
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
