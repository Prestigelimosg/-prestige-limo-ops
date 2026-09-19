import * as SecureStore from "expo-secure-store";

import {
  parseDriverJobUrl,
  productionOrigin,
  type ActiveDriverJob,
} from "./driver-job-contract.ts";

const nativeNotificationTokenStorageKey =
  "prestige-driver-native-notification-token-v1";
const nativeNotificationJobStoragePrefix =
  "prestige-driver-native-notification-job-v1.";

function validJobKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

// Remove only notifications for this exact opaque job identity. Other jobs stay unread.
export async function dismissNativeJobNotifications(jobKey: string, notifications: {
  getPresentedNotificationsAsync: () => Promise<Array<{ request: { identifier: string; content: { data?: unknown } } }>>;
  dismissNotificationAsync: (identifier: string) => Promise<void>;
  setBadgeCountAsync: (count: number) => Promise<boolean>;
}) {
  if (!validJobKey(jobKey)) return null;
  const presented = await notifications.getPresentedNotificationsAsync();
  for (const notification of presented) {
    const data = notification.request.content.data;
    const dataRecord = data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown> : null;
    let matches = dataRecord?.job_key === jobKey;
    // Background Android FCM notices may lose custom data in the system tray.
    // Expo preserves their tag in this URI; never guess from message text.
    if (!matches && !dataRecord?.job_key) {
      try {
        const identifier = new URL(notification.request.identifier);
        matches = identifier.protocol === "expo-notifications:" &&
          identifier.host === "foreign_notifications" && !identifier.username && !identifier.password &&
          !identifier.pathname && !identifier.hash &&
          identifier.searchParams.getAll("tag").length === 1 &&
          identifier.searchParams.getAll("id").length === 1 &&
          /^-?\d+$/.test(identifier.searchParams.get("id") ?? "") &&
          identifier.searchParams.get("tag") === `prestige-driver-job-${jobKey}`;
      } catch { /* Unidentifiable older notices must remain untouched. */ }
    }
    if (matches) {
      await notifications.dismissNotificationAsync(notification.request.identifier);
    }
  }
  const remaining = (await notifications.getPresentedNotificationsAsync()).length;
  await notifications.setBadgeCountAsync(Math.min(99, remaining));
  return Math.min(99, remaining);
}

export function nativeDriverJobHandoffUrl(jobKey: string) {
  if (!validJobKey(jobKey)) {
    throw new Error("Invalid native notification job key.");
  }

  return `${productionOrigin}/api/driver-native-job-open/${jobKey}`;
}

export function nativeNotificationOpenRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const notification = value as Record<string, unknown>;
  const jobKey = notification.job_key;
  if (!validJobKey(jobKey)) {
    return null;
  }

  return {
    jobKey,
    openTarget: notification.open_target === "messages"
      ? ("messages" as const)
      : notification.open_target === "available_jobs"
        ? ("available_jobs" as const)
        : null,
  };
}

export async function rememberNativeDriverJob(
  jobKey: string,
  job: ActiveDriverJob,
) {
  if (!validJobKey(jobKey)) {
    throw new Error("Invalid native notification job key.");
  }

  const baseJobUrl = `${job.origin}/driver-job/${encodeURIComponent(job.token)}`;
  await SecureStore.setItemAsync(
    `${nativeNotificationJobStoragePrefix}${jobKey}`,
    baseJobUrl,
  );
}

export async function loadNativeDriverJob(jobKey: string) {
  if (!validJobKey(jobKey)) {
    return null;
  }

  const stored = await SecureStore.getItemAsync(
    `${nativeNotificationJobStoragePrefix}${jobKey}`,
  );
  if (!stored) {
    return null;
  }

  try {
    return parseDriverJobUrl(stored);
  } catch {
    return null;
  }
}

export async function readNativeNotificationToken() {
  return SecureStore.getItemAsync(nativeNotificationTokenStorageKey);
}

export async function forgetNativeNotificationToken() {
  await SecureStore.deleteItemAsync(nativeNotificationTokenStorageKey);
}

export async function rememberNativeNotificationToken(value: string) {
  await SecureStore.setItemAsync(nativeNotificationTokenStorageKey, value);
}
