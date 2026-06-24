import "server-only";

export const driverLiveLocationScaffoldVersion =
  "driver-live-location-scaffold:v1";

type DriverLiveLocationEnv = Record<string, string | undefined>;

type DriverCaptureAction = "share" | "stop";

const closedReason = "driver_live_location_scaffold_closed" as const;

function enabled(value: string | undefined) {
  return value === "true";
}

function cleanMode(value: string | undefined) {
  const cleaned = value?.trim().toLowerCase();

  return cleaned || "closed";
}

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

export function readDriverLiveLocationScaffoldGateState(
  env: DriverLiveLocationEnv = process.env,
) {
  return {
    active_jobs_map_gate_configured: enabled(
      env.PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED,
    ),
    allowed_job_references_configured: configured(
      env.PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES,
    ),
    capture_gate_configured: enabled(
      env.PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED,
    ),
    mode: cleanMode(env.PRESTIGE_DRIVER_LIVE_LOCATION_MODE),
    retention_minutes_configured: configured(
      env.PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES,
    ),
    stale_after_seconds_configured: configured(
      env.PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS,
    ),
    update_interval_seconds_configured: configured(
      env.PRESTIGE_DRIVER_LIVE_LOCATION_UPDATE_INTERVAL_SECONDS,
    ),
  };
}

function closedBase(env?: DriverLiveLocationEnv) {
  return {
    customerVisible: false,
    external_send: false,
    gate_state: readDriverLiveLocationScaffoldGateState(env),
    gpsCaptureEnabled: false,
    liveMapEnabled: false,
    locationStorageEnabled: false,
    no_op: true,
    reason: closedReason,
    result_label: "blocked/no-op",
    status: "blocked",
    version: driverLiveLocationScaffoldVersion,
  } as const;
}

export function buildDriverLiveLocationCaptureScaffoldResponse({
  action,
  env,
  tokenPresent,
}: {
  action: DriverCaptureAction;
  env?: DriverLiveLocationEnv;
  tokenPresent: boolean;
}) {
  return {
    ...closedBase(env),
    action,
    driver_surface: "driver_job_live_location_capture_scaffold",
    permission_state: "not_requested",
    sharing_state: "inactive",
    token_present: tokenPresent,
  } as const;
}

export function buildAdminActiveJobsMapScaffoldResponse(env?: DriverLiveLocationEnv) {
  return {
    ...closedBase(env),
    active_jobs: [],
    admin_surface: "admin_active_jobs_map_scaffold",
    map_rendered: false,
    marker_count: 0,
  } as const;
}
