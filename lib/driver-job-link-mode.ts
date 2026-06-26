export type DriverJobLinkMode = "mock" | "production";
export type DriverJobLinkDisabledReason = "not_configured";

export type DriverJobLinkModeEnv = {
  DRIVER_JOB_LINK_MODE?: string;
  NEXT_PUBLIC_DRIVER_JOB_LINK_MODE?: string;
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED?: string;
  PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_URL?: string;
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
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
      process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
    PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:
      process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
  };
  const requestedMode = clean(sourceEnv.DRIVER_JOB_LINK_MODE) || clean(sourceEnv.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE);

  if (productionDriverJobLinksConfigured(sourceEnv)) {
    return "production";
  }

  return requestedMode === "production" ? "production" : "mock";
}

export function isProductionDriverJobLinkMode(env?: DriverJobLinkModeEnv) {
  const sourceEnv = env ?? {
    DRIVER_JOB_LINK_MODE: process.env.DRIVER_JOB_LINK_MODE,
    NEXT_PUBLIC_DRIVER_JOB_LINK_MODE: process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
      process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
    PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:
      process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
  };
  const requestedMode = clean(sourceEnv.DRIVER_JOB_LINK_MODE) || clean(sourceEnv.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE);

  if (productionDriverJobLinksConfigured(sourceEnv)) {
    return true;
  }

  if (requestedMode === "production") {
    return true;
  }

  if (requestedMode) {
    return false;
  }

  return productionDriverJobLinksConfigured(sourceEnv);
}

export function productionDriverJobLinksConfigured(env?: DriverJobLinkModeEnv) {
  const sourceEnv = env ?? {
    DRIVER_JOB_LINK_MODE: process.env.DRIVER_JOB_LINK_MODE,
    NEXT_PUBLIC_DRIVER_JOB_LINK_MODE: process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
      process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
    PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:
      process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
  };

  if (clean(sourceEnv.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED) === "true") {
    return true;
  }

  return (
    clean(sourceEnv.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED) === "true" &&
    clean(sourceEnv.SUPABASE_URL) !== "" &&
    clean(sourceEnv.SUPABASE_SERVICE_ROLE_KEY) !== ""
  );
}

export function productionDriverJobLinksDisabledResult(): DriverJobLinkDisabledResult {
  return {
    ok: false,
    reason: "not_configured",
    payload: null,
  };
}
