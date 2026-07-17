import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import {
  DriverJobRequestError,
  loadDriverJobSummary,
  postDriverLocation,
} from "./driver-job-contract";
import { readActiveJob } from "./active-job-store";
import { stopTrackingAfterTerminalResponse } from "./tracking";
import { DRIVER_LOCATION_TASK_NAME } from "./tracking-constants";

type LocationTaskData = {
  locations?: Location.LocationObject[];
};

TaskManager.defineTask(DRIVER_LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    return;
  }

  const job = await readActiveJob();

  if (!job) {
    await stopTrackingAfterTerminalResponse();
    return;
  }

  const locations = (data as LocationTaskData | undefined)?.locations;
  const latestLocation = Array.isArray(locations) ? locations.at(-1) : null;

  if (!latestLocation) {
    return;
  }

  try {
    const summary = await loadDriverJobSummary(job);

    if (summary.status === "completed") {
      await stopTrackingAfterTerminalResponse();
      return;
    }

    await postDriverLocation(job, latestLocation);
  } catch (requestFailure) {
    if (
      requestFailure instanceof DriverJobRequestError &&
      requestFailure.terminal
    ) {
      await stopTrackingAfterTerminalResponse();
    }
  }
});
