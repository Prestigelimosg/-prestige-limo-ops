import * as SecureStore from "expo-secure-store";

import {
  parseDriverJobUrl,
  type ActiveDriverJob,
} from "./driver-job-contract.ts";

const nativeNotificationTokenStorageKey =
  "prestige-driver-native-notification-token-v1";
const nativeNotificationJobStoragePrefix =
  "prestige-driver-native-notification-job-v1.";

function validJobKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
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
    openTarget: notification.open_target === "messages" ? ("messages" as const) : null,
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
