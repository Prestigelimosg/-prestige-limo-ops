const installationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const expoPushTokenPattern = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{20,400}\]$/;

export type AdminBridgeMessage =
  | { type: "admin_notifications_register" }
  | { type: "admin_notifications_unregister" }
  | {
      action: "register" | "unregister";
      context: "badge_reset" | "sign_out" | "toggle";
      ok: boolean;
      type: "admin_native_subscription_complete";
    };

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parseAdminBridgeMessage(value: string): AdminBridgeMessage | null {
  try {
    const parsed = asRecord(JSON.parse(value));
    const keys = Object.keys(parsed).sort();
    if (
      keys.length === 1 &&
      keys[0] === "type" &&
      (parsed.type === "admin_notifications_register" ||
        parsed.type === "admin_notifications_unregister")
    ) {
      return { type: parsed.type };
    }

    if (
      keys.join(",") === "action,context,ok,type" &&
      parsed.type === "admin_native_subscription_complete" &&
      (parsed.action === "register" || parsed.action === "unregister") &&
      (parsed.context === "badge_reset" ||
        parsed.context === "toggle" ||
        parsed.context === "sign_out") &&
      typeof parsed.ok === "boolean"
    ) {
      return {
        action: parsed.action,
        context: parsed.context,
        ok: parsed.ok,
        type: "admin_native_subscription_complete",
      };
    }
  } catch {
    // Invalid WebView messages fail closed.
  }

  return null;
}

export function embeddedAdminBridgeBootstrap(
  installationId: string,
  notificationsEnabled: boolean,
  notificationPermission: "denied" | "granted" | "undetermined",
) {
  if (!installationIdPattern.test(installationId)) {
    throw new Error("A valid native Admin installation is required.");
  }

  return `
(function () {
  const nativeNotificationState = {
    enabled: ${notificationsEnabled === true},
    permission: ${JSON.stringify(notificationPermission)}
  };
  Object.defineProperty(window, "__PRESTIGE_ADMIN_NATIVE_APP__", {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_ADMIN_INSTALLATION_ID__", {
    configurable: false,
    enumerable: false,
    value: ${JSON.stringify(installationId.toLowerCase())},
    writable: false
  });
  Object.defineProperty(window, "__PRESTIGE_ADMIN_NOTIFICATIONS_ENABLED__", {
    configurable: false,
    enumerable: false,
    get: function () { return nativeNotificationState.enabled; }
  });
  Object.defineProperty(window, "__PRESTIGE_ADMIN_NOTIFICATION_PERMISSION__", {
    configurable: false,
    enumerable: false,
    get: function () { return nativeNotificationState.permission; }
  });
  window.addEventListener("prestige-admin-native-notification-result", function (event) {
    const state = event && event.detail && event.detail.state;
    if (state === "enabled") {
      nativeNotificationState.enabled = true;
      nativeNotificationState.permission = "granted";
    } else if (state === "denied") {
      nativeNotificationState.enabled = false;
      nativeNotificationState.permission = "denied";
    } else if (state === "disabled") {
      nativeNotificationState.enabled = false;
    }
  });
})();
true;
`;
}

export function adminNativeNotificationResultScript(result: {
  ok: boolean;
  state: "denied" | "disabled" | "enabled" | "failed";
}) {
  const safeResult = {
    ok: result.ok === true,
    state: result.state,
  };
  return `window.dispatchEvent(new CustomEvent("prestige-admin-native-notification-result", { detail: ${JSON.stringify(
    safeResult,
  )} })); true;`;
}

export function adminNativeSubscriptionRequestScript(input: {
  action: "register" | "unregister";
  context: "badge_reset" | "sign_out" | "toggle";
  installationId: string;
  nativeToken: string;
  previousToken?: string | null;
}) {
  if (
    !installationIdPattern.test(input.installationId) ||
    !expoPushTokenPattern.test(input.nativeToken) ||
    (input.previousToken && !expoPushTokenPattern.test(input.previousToken))
  ) {
    throw new Error("A valid native Admin notification subscription is required.");
  }

  const requestBody = (token: string) => ({
    channel: "admin_native_ios",
    installation_id: input.installationId.toLowerCase(),
    native_token: token,
  });
  const previousToken =
    input.previousToken && input.previousToken !== input.nativeToken
      ? input.previousToken
      : null;

  return `
(async function () {
  const endpoint = "/api/admin-device-push-subscriptions";
  const headers = {
    "Content-Type": "application/json",
    "x-prestige-admin-purpose": "admin-booking-persistence"
  };
  const request = async function (method, body) {
    const response = await fetch(endpoint, {
      body: JSON.stringify(body),
      credentials: "same-origin",
      headers: headers,
      method: method
    });
    const result = await response.json().catch(function () { return null; });
    if (!response.ok || !result || result.ok !== true) {
      throw new Error("native_admin_subscription_failed");
    }
  };
  try {
    ${previousToken ? `await request("PATCH", ${JSON.stringify(requestBody(previousToken))});` : ""}
    await request(${input.action === "register" ? '"POST"' : '"PATCH"'}, ${JSON.stringify(
      requestBody(input.nativeToken),
    )});
    window.dispatchEvent(new CustomEvent("prestige-admin-native-notification-result", {
      detail: { ok: true, state: ${input.action === "register" ? '"enabled"' : '"disabled"'} }
    }));
    window.ReactNativeWebView.postMessage(JSON.stringify({
      action: ${JSON.stringify(input.action)},
      context: ${JSON.stringify(input.context)},
      ok: true,
      type: "admin_native_subscription_complete"
    }));
  } catch (_) {
    window.dispatchEvent(new CustomEvent("prestige-admin-native-notification-result", {
      detail: { ok: false, state: "failed" }
    }));
    window.ReactNativeWebView.postMessage(JSON.stringify({
      action: ${JSON.stringify(input.action)},
      context: ${JSON.stringify(input.context)},
      ok: false,
      type: "admin_native_subscription_complete"
    }));
  }
})();
true;
`;
}
