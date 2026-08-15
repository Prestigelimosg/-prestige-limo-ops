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
  currentJobUrl: string,
) {
  let currentJob;

  try {
    currentJob = parseDriverJobUrl(currentJobUrl);
  } catch {
    return false;
  }

  try {
    const requestedJob = parseDriverJobUrl(requestedUrl);
    return requestedJob.token === currentJob.token;
  } catch {
    const requested = parseSameOriginUrl(requestedUrl);

    return Boolean(
      requested &&
        allowedReadOnlyPaths.has(requested.pathname) &&
        !requested.search &&
        !requested.hash,
    );
  }
}

export const embeddedDriverBridgeBootstrap = `
(function () {
  Object.defineProperty(window, "__PRESTIGE_DRIVER_NATIVE_APP__", {
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
