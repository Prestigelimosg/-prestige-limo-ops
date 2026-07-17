import * as SecureStore from "expo-secure-store";

import {
  type ActiveDriverJob,
  parseDriverJobUrl,
} from "./driver-job-contract";

const activeJobKey = "prestige.driver.active_job.v1";
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  requireAuthentication: false,
};

export async function saveActiveJob(job: ActiveDriverJob) {
  await SecureStore.setItemAsync(activeJobKey, JSON.stringify(job), secureStoreOptions);
}

export async function readActiveJob(): Promise<ActiveDriverJob | null> {
  const stored = await SecureStore.getItemAsync(activeJobKey, secureStoreOptions);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<ActiveDriverJob>;
    const job = parseDriverJobUrl(typeof parsed.jobUrl === "string" ? parsed.jobUrl : "");

    if (parsed.token !== job.token || parsed.origin !== job.origin) {
      throw new Error("Stored job does not match its private URL.");
    }

    return job;
  } catch {
    await clearActiveJob();
    return null;
  }
}

export async function clearActiveJob() {
  await SecureStore.deleteItemAsync(activeJobKey, secureStoreOptions);
}
