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
  getPresentedNotificationsAsync: () => Promise<Array<{ date?: number; request: { identifier: string; content: { data?: unknown } } }>>;
  dismissNotificationAsync: (identifier: string) => Promise<void>;
  setBadgeCountAsync: (count: number) => Promise<boolean>;
}, before?: number) {
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
    // Automatic cleanup is revision bounded. Unknown legacy dates remain untouched.
    const sentAt = typeof dataRecord?.sent_at === "number" ? dataRecord.sent_at : notification.date;
    if (matches && (before === undefined ||
      (typeof sentAt === "number" && Number.isFinite(sentAt) && sentAt > 0 && sentAt < before))) {
      await notifications.dismissNotificationAsync(notification.request.identifier);
    }
  }
  const remaining = (await notifications.getPresentedNotificationsAsync()).length;
  await notifications.setBadgeCountAsync(Math.min(99, remaining));
  return Math.min(99, remaining);
}

// Each marker contains only a cutoff or terminal-offer flag, never job details or credentials.
const nativeCleanupPrefix = "prestige-driver-notice-cleanup-v1.";
let nativeCleanupPending: Promise<unknown> = Promise.resolve();
type NativeNoticeApi = Parameters<typeof dismissNativeJobNotifications>[1];

export function nativeNoticeTaskData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const task = value as Record<string, unknown>;
  // Responses still use the established tap handler; this task never navigates.
  if ("actionIdentifier" in task) return null;
  const data = task.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const encoded = (data as Record<string, unknown>).dataString;
  if (typeof encoded === "string") {
    try { return JSON.parse(encoded); } catch { return null; }
  }
  return data;
}

export async function applyNativeNoticeCleanup(value: unknown, notifications: NativeNoticeApi) {
  // Serialise cleanup only. Visible notification handling never waits on this work.
  const operation = nativeCleanupPending.catch(() => undefined).then(async () => {
    const data = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
    if (data?.driver_pool_refresh === true && validJobKey(data.job_key)) {
      const cutoff = data.dismiss_before;
      if (typeof cutoff === "number" && Number.isSafeInteger(cutoff) && cutoff > 0 && cutoff <= Date.now()) {
        const key = nativeCleanupPrefix + data.job_key;
        const stored = await SecureStore.getItemAsync(key);
        const previous = Number(stored);
        // Only terminal/losing pool offers are immutable; private links always keep a cutoff.
        const retired = stored === "retired_offer" || data.dismiss_retired_offer === true;
        await SecureStore.setItemAsync(key, retired ? "retired_offer" : String(Math.max(Number.isSafeInteger(previous) ? previous : 0, cutoff)), {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        });
        await dismissNativeJobNotifications(data.job_key, notifications, retired ? undefined : cutoff);
      }
    }
    // Retry persisted cleanup on launch/resume and on delayed notification arrival.
    // Exact identity is read through the existing remover, including Android's foreign tag.
    const presented = await notifications.getPresentedNotificationsAsync();
    const keys = new Set<string>();
    for (const notice of presented) {
      const content = notice.request.content.data;
      const record = content && typeof content === "object" && !Array.isArray(content)
        ? content as Record<string, unknown> : null;
      if (validJobKey(record?.job_key)) keys.add(record.job_key);
      else if (!record?.job_key) {
        try {
          const tag = new URL(notice.request.identifier).searchParams.get("tag") ?? "";
          const key = tag.slice("prestige-driver-job-".length);
          if (tag.startsWith("prestige-driver-job-") && validJobKey(key)) keys.add(key);
        } catch { /* The exact remover also rejects malformed/foreign identities. */ }
      }
    }
    for (const key of keys) {
      const stored = await SecureStore.getItemAsync(nativeCleanupPrefix + key);
      const cutoff = Number(stored);
      if (stored === "retired_offer") {
        await dismissNativeJobNotifications(key, notifications);
      } else if (Number.isSafeInteger(cutoff) && cutoff > 0 && cutoff <= Date.now()) {
        await dismissNativeJobNotifications(key, notifications, cutoff);
      }
    }
  });
  nativeCleanupPending = operation;
  return operation;
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
