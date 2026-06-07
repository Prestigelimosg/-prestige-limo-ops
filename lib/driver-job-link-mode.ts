export type DriverJobLinkMode = "mock" | "production";
export type DriverJobLinkDisabledReason = "not_configured";

export type DriverJobLinkModeEnv = {
  DRIVER_JOB_LINK_MODE?: string;
  NEXT_PUBLIC_DRIVER_JOB_LINK_MODE?: string;
  PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED?: string;
};

export type DriverJobLinkDisabledResult = {
  ok: false;
  reason: DriverJobLinkDisabledReason;
  payload: null;
};

function clean(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveDriverJobLinkMode(env?: DriverJobLinkModeEnv): DriverJobLinkMode {
  const sourceEnv = env ?? {
    DRIVER_JOB_LINK_MODE: process.env.DRIVER_JOB_LINK_MODE,
    NEXT_PUBLIC_DRIVER_JOB_LINK_MODE: process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE,
  };
  const requestedMode = clean(sourceEnv.DRIVER_JOB_LINK_MODE) || clean(sourceEnv.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE);

  return requestedMode === "production" ? "production" : "mock";
}

export function isProductionDriverJobLinkMode(env?: DriverJobLinkModeEnv) {
  return resolveDriverJobLinkMode(env) === "production";
}

export function productionDriverJobLinksConfigured(env?: DriverJobLinkModeEnv) {
  const sourceEnv = env ?? {
    DRIVER_JOB_LINK_MODE: process.env.DRIVER_JOB_LINK_MODE,
    NEXT_PUBLIC_DRIVER_JOB_LINK_MODE: process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE,
    PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:
      process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED,
  };

  return clean(sourceEnv.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED) === "true";
}

export function productionDriverJobLinksDisabledResult(): DriverJobLinkDisabledResult {
  return {
    ok: false,
    reason: "not_configured",
    payload: null,
  };
}
