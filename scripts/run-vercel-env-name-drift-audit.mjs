import { spawnSync } from "node:child_process";

const requiredEnvNames = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
  "PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL",
  "PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED",
  "PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED",
  "PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED",
  "PRESTIGE_DRIVER_LIVE_LOCATION_MODE",
  "PRESTIGE_GOOGLE_MAPS_API_KEY",
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED",
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER",
  "RESEND_API_KEY",
  "PRESTIGE_EMAIL_PROVIDER",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_FROM",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED",
];

function fail(reason, details = {}) {
  console.error(
    JSON.stringify({
      ok: false,
      audit: "vercel_env_name_drift",
      reason,
      ...details,
    }),
  );
  process.exit(1);
}

const environment = process.env.PRESTIGE_VERCEL_ENV_DRIFT_AUDIT_ENVIRONMENT || "production";
if (!["production", "preview"].includes(environment)) {
  fail("invalid_environment", { allowed: ["production", "preview"] });
}

const result = spawnSync("npx", ["--yes", "vercel", "env", "ls", environment], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: {
    ...process.env,
    NO_UPDATE_NOTIFIER: "1",
    VERCEL_NO_UPDATE_NOTIFIER: "1",
  },
});

if (result.status !== 0) {
  fail("vercel_env_names_unavailable", {
    environment,
    status: result.status,
  });
}

const foundNames = new Set();
for (const line of result.stdout.split("\n")) {
  const match = line.match(/\b[A-Z][A-Z0-9_]{2,}\b/);
  if (match) {
    foundNames.add(match[0]);
  }
}

const missing = requiredEnvNames.filter((name) => !foundNames.has(name));

if (missing.length > 0) {
  fail("missing_required_env_names", {
    environment,
    missing,
    required_count: requiredEnvNames.length,
    found_required_count: requiredEnvNames.length - missing.length,
  });
}

console.log(
  JSON.stringify({
    ok: true,
    audit: "vercel_env_name_drift",
    environment,
    required_count: requiredEnvNames.length,
    missing_count: 0,
    values_read: false,
    values_printed: false,
    env_mutated: false,
    deploy_triggered: false,
  }),
);
