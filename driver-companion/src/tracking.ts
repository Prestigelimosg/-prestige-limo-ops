import * as Location from "expo-location";

import {
  checkDriverLocationReadiness,
  deleteDriverLocation,
  DriverJobRequestError,
  type ActiveDriverJob,
  postDriverLocation,
} from "./driver-job-contract";
import {
  clearActiveJob,
  readActiveJob,
  saveActiveJob,
} from "./active-job-store";
import { DRIVER_LOCATION_TASK_NAME } from "./tracking-constants";

export type TrackingResult = {
  active: boolean;
  message: string;
};

async function hasStartedTracking() {
  return Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME).catch(
    () => false,
  );
}

export async function readTrackingState() {
  const [active, job] = await Promise.all([hasStartedTracking(), readActiveJob()]);

  if (active && !job) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME).catch(
      () => undefined,
    );
    return { active: false, job: null };
  }

  return { active, job };
}

export async function startDriverTracking(
  job: ActiveDriverJob,
): Promise<TrackingResult> {
  const current = await readTrackingState();

  if (current.active && current.job?.token !== job.token) {
    throw new Error("Stop the current job before starting tracking for another job.");
  }

  await checkDriverLocationReadiness(job);

  if (!(await Location.isBackgroundLocationAvailableAsync())) {
    return {
      active: false,
      message: "Background location is unavailable on this phone.",
    };
  }

  const foreground = await Location.requestForegroundPermissionsAsync();

  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    return {
      active: false,
      message: "Allow precise location while using the app, then try again.",
    };
  }

  const background = await Location.requestBackgroundPermissionsAsync();

  if (background.status !== Location.PermissionStatus.GRANTED) {
    return {
      active: false,
      message: "Choose Always or Allow all the time in phone Settings, then try again.",
    };
  }

  await saveActiveJob(job);

  if (!current.active) {
    try {
      await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        activityType: Location.ActivityType.AutomotiveNavigation,
        deferredUpdatesDistance: 20,
        deferredUpdatesInterval: 15000,
        distanceInterval: 20,
        foregroundService: {
          killServiceOnDestroy: false,
          notificationBody: "Location is shared with Prestige dispatch for this assigned job.",
          notificationColor: "#0f766e",
          notificationTitle: "Prestige trip tracking active",
        },
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        timeInterval: 10000,
      });
    } catch (error) {
      await clearActiveJob();
      throw error;
    }
  }

  try {
    const currentLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    await postDriverLocation(job, currentLocation);
  } catch (error) {
    if (error instanceof DriverJobRequestError && error.terminal) {
      await stopTrackingAfterTerminalResponse();
      throw error;
    }

    return {
      active: true,
      message: "Trip tracking is active and waiting for the first server update.",
    };
  }

  return {
    active: true,
    message: "Trip tracking is active. You may lock the screen or use another app.",
  };
}

export async function stopTrackingAfterTerminalResponse() {
  if (await hasStartedTracking()) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME).catch(
      () => undefined,
    );
  }
  await clearActiveJob();
}

export async function stopDriverTracking(): Promise<TrackingResult> {
  const job = await readActiveJob();

  if (await hasStartedTracking()) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK_NAME);
  }

  let markerCleared = true;

  if (job) {
    try {
      await deleteDriverLocation(job);
    } catch {
      markerCleared = false;
    }
  }

  await clearActiveJob();

  return {
    active: false,
    message: markerCleared
      ? "Trip tracking stopped. The admin map marker was cleared."
      : "Phone tracking stopped. The admin map will show the last update as stale until it is cleared.",
  };
}
