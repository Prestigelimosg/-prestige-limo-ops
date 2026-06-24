import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-admin-runtime-gate-readiness-guard.mjs";
const runtimeHelperPath = "lib/driver-live-location-runtime.ts";
const scaffoldHelperPath = "lib/driver-live-location-scaffold.ts";
const driverRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
const appPagePath = "app/page.tsx";
const driverPagePath = "app/driver-job/[token]/page.tsx";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [
  ledger,
  preactivationSuite,
  runtimeHelper,
  scaffoldHelper,
  driverRoute,
  adminRoute,
  appPage,
  driverPage,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(runtimeHelperPath, "utf8"),
  readFile(scaffoldHelperPath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(driverPagePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Admin-Controlled Runtime Gate Readiness Lock",
);

for (const phrase of [
  "This is a docs/test-only readiness lock for replacing temporary deploy-time live-location evidence gates with a future admin-controlled runtime gate.",
  "Normal live operation must not depend on Vercel CLI gate flips, repeated redeploys, or locally injected evidence env values.",
  "Future production operation should install stable server env names once, then use an admin/dispatcher-controlled runtime setting to open or close Driver Live Location without a redeploy.",
  "The current app remains closed by default and this lane does not add a live admin toggle, does not open GPS capture, does not open admin active-jobs map reads, does not write/read location rows, does not change env, and does not deploy.",
  "Future admin-controlled runtime gate must be disabled by default, admin/dispatcher-only, same-origin protected, audited, scoped to explicit booking/job references or a small approved allowlist, and rollbackable without a deploy.",
  "Future driver sharing must still require explicit driver consent from the job-token-scoped driver page and must never auto-start from page load, OTW, OTS, POB, Completed, customer copy, email, in-app, Telegram, WhatsApp, or SMS actions.",
  "Future admin active-jobs map reads must still require the internal admin/dispatcher boundary and must never expose driver coordinates to customers until the separate customer live-location lane is approved.",
  "Future admin gate UI must be compact and live in the existing admin dispatch/live-location area, not a new giant card, not Customer Copy, and not a duplicate sector.",
  "Future admin gate write path must prove server-session admin/dispatcher auth, exact setting row scope, audit event, wrong-admin blocked proof, rollback/disable proof, and no broad all-driver activation.",
  "Future evidence must prove the admin gate can open and close runtime without Vercel CLI, without changing env during the evidence window, and without leaving gates open after rollback.",
  "Future stable install env names are names-only and values must not be printed: `PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`, `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`, `PRESTIGE_DRIVER_LIVE_LOCATION_MODE`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.",
  "Future admin-controlled setting names are names-only and values must not be printed: `driver_live_location_capture_enabled`, `admin_active_jobs_map_enabled`, `driver_live_location_mode`, `driver_live_location_allowed_job_references`, `driver_live_location_stale_after_seconds`, and `driver_live_location_retention_minutes`.",
  "No provider sends, Email/Telegram/WhatsApp/SMS, Google Maps/OneMap/FlightAware calls, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, shim work, customer live map, free-form chat, or production activation is approved by this readiness lock.",
  "This guard adds `scripts/test-driver-live-location-admin-runtime-gate-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger admin runtime gate phrase ${phrase}`);
}

for (const forbiddenPhrase of [
  "admin runtime toggle is live now",
  "Vercel CLI is no longer required today",
  "GPS capture is open now",
  "admin active-jobs map reads are open now",
  "all drivers may be tracked now",
  "customer live map is live now",
  "provider sends are enabled",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden admin runtime gate claim");
}

assertIncludes(preactivationSuite, guardScript, "preactivation admin runtime gate guard registration");
assertIncludes(
  preactivationSuite,
  "scripts/test-driver-live-location-gated-runtime-path-guard.mjs",
  "runtime path guard remains registered",
);
assertIncludes(
  preactivationSuite,
  "scripts/test-driver-live-location-gated-runtime-evidence-contract-guard.mjs",
  "runtime evidence guard remains registered",
);

const currentRuntimeSources = `${runtimeHelper}\n${scaffoldHelper}\n${driverRoute}\n${adminRoute}`;

for (const fragment of [
  "PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED",
  "PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED",
  "PRESTIGE_DRIVER_LIVE_LOCATION_MODE",
  "PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES",
  "customerVisible: false",
  "external_send: false",
  "driverLiveLocationRuntimeGateOpen",
  "adminActiveJobsMapRuntimeGateOpen",
]) {
  assertIncludes(currentRuntimeSources, fragment, `current runtime gated source ${fragment}`);
}

for (const forbiddenPattern of [
  /admin[_-]?runtime[_-]?gate[_-]?enabled/i,
  /driver_live_location_capture_enabled['"]?\s*:\s*true/i,
  /admin_active_jobs_map_enabled['"]?\s*:\s*true/i,
  /all[_-]?drivers|all[_-]?jobs|broad[_-]?activation/i,
  /customerVisible\s*[:=]\s*true/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
]) {
  assertExcludes(
    currentRuntimeSources,
    forbiddenPattern,
    "current live-location runtime remains deploy-gated and no-live",
  );
}

for (const requiredForbiddenFilter of [
  "customer[_ -]?price",
  "driver[_ -]?payout",
  "finance",
  "invoice",
  "payment",
  "paynow",
  "payout",
  "service[_ -]?role",
]) {
  assertIncludes(
    runtimeHelper,
    requiredForbiddenFilter,
    `runtime helper forbidden text filter ${requiredForbiddenFilter}`,
  );
}

for (const forbiddenPattern of [
  /driver-live-location-admin-runtime-gate|admin-runtime-gate-toggle/i,
  /driver_live_location_capture_enabled|admin_active_jobs_map_enabled/i,
]) {
  assertExcludes(appPage, forbiddenPattern, "admin page must not include live admin runtime toggle yet");
  assertExcludes(
    driverPage,
    forbiddenPattern,
    "driver page must not include live admin runtime toggle yet",
  );
}

console.log("Driver live-location admin-controlled runtime gate readiness guard passed");
