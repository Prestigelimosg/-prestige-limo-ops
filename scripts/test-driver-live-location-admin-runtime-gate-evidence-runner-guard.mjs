import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const runnerPath = "scripts/run-driver-live-location-admin-runtime-gate-evidence.mjs";
const runtimeHelperPath = "lib/driver-live-location-runtime.ts";
const guardScript =
  "scripts/test-driver-live-location-admin-runtime-gate-evidence-runner-guard.mjs";

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

const [ledger, preactivationSuite, runner, runtimeHelper] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(runnerPath, "utf8"),
  readFile(runtimeHelperPath, "utf8"),
]);
const runnerWithoutDenylist = runner.replace(
  /const forbiddenSafeTextPattern =[\s\S]*?;\n\nclass EvidenceFailure/,
  "class EvidenceFailure",
);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Admin-Controlled Runtime Gate Evidence Runner Guard Lock",
);

for (const phrase of [
  "This adds a disabled-by-default runner scaffold for future Driver Live Location admin-controlled runtime gate evidence.",
  "The runner is `scripts/run-driver-live-location-admin-runtime-gate-evidence.mjs`.",
  "The runner is not executed by this commit, no env was changed, no database read/write occurred, no GPS capture was activated, and no provider send occurred.",
  "The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_APPROVED=driver-live-location-admin-runtime-evidence-approved` before any phase runs.",
  "The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_PHASE` to be one of `pre-window`, `runtime-window`, or `post-rollback`.",
  "The runner is staging-only by default and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_TARGET_URL` or its default.",
  "`pre-window` and `post-rollback` prove driver capture and admin active-jobs map routes are blocked/closed without database access.",
  "`runtime-window` requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`, `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_REFERENCE`, `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_DRIVER_JOB_LINK_TOKEN`, and `PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_BOOKING_REFERENCE`.",
  "Future `runtime-window` evidence may create exactly one temporary fake `driver_job_links` row, one temporary admin runtime setting row, one fake latest-position row through the driver route, and audit rows produced by the runtime path.",
  "The runner must restore the previous `driver_live_location_runtime_settings` row or delete the temporary row if none existed, then clean up temporary driver link, latest-position, and audit rows and prove zero matching evidence rows remain.",
  "The runner must prove correct driver share, admin active-jobs map read, wrong-origin admin block, missing-admin block, wrong-driver block, customer visibility false, external_send false, and rollback/closed proof.",
  "The runner output is normalized and must not print Supabase URLs, service-role keys, admin session tokens, raw driver tokens, token hashes, row IDs, booking references, private customer data, coordinates from real users, cookies, JWTs, API keys, or env values.",
  "This runner does not edit Vercel env, deploy, apply migrations, activate browser GPS automatically, activate customer live map links, call Google Maps/OneMap/FlightAware, send provider messages, or touch billing/payment/PDF/payout.",
  "A future evidence pass still requires separate owner approval for stable server env gate state, staging-safe fake driver job token/reference, runtime DB window, cleanup/zero-row proof, rollback/disable proof, docs evidence recording, and staging promotion.",
  "This guard adds `scripts/test-driver-live-location-admin-runtime-gate-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger admin runtime evidence runner phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation admin runtime evidence runner registration");

for (const fragment of [
  'const approvalEnvName = "PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_APPROVED";',
  'const expectedApproval = "driver-live-location-admin-runtime-evidence-approved";',
  'const phaseEnvName = "PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_PHASE";',
  'const allowedPhases = new Set(["pre-window", "runtime-window", "post-rollback"]);',
  'const targetUrlEnvName = "PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_TARGET_URL";',
  'const defaultTargetUrl = "https://prestige-limo-ops-staging.vercel.app";',
  'parsed.hostname !== "prestige-limo-ops-staging.vercel.app"',
  '"SUPABASE_URL"',
  '"SUPABASE_SERVICE_ROLE_KEY"',
  '"PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN"',
  '"PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_EVIDENCE_REFERENCE"',
  '"PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_DRIVER_JOB_LINK_TOKEN"',
  '"PRESTIGE_DRIVER_LIVE_LOCATION_ADMIN_RUNTIME_BOOKING_REFERENCE"',
]) {
  assertIncludes(runner, fragment, `runner required config fragment ${fragment}`);
}

for (const fragment of [
  'const runtimeSettingsTable = "driver_live_location_runtime_settings";',
  'const runtimeSettingName = "driver_live_location_runtime";',
  'const driverJobLinkTable = "driver_job_links";',
  'const latestPositionsTable = "driver_live_location_latest_positions";',
  'const auditEventsTable = "driver_live_location_audit_events";',
  "readCurrentRuntimeSetting",
  "restoreRuntimeSetting",
  "openAdminRuntimeSetting",
  "insertEvidenceDriverLink",
  "tokenHash(rawToken)",
  "driver_live_location_allowed_job_references: [bookingReference]",
  'driver_live_location_mode: "runtime"',
  "driver_live_location_capture_enabled: true",
  "admin_active_jobs_map_enabled: true",
  ".from(runtimeSettingsTable).upsert",
  ".from(driverJobLinkTable)",
  ".from(latestPositionsTable).delete().eq(\"evidence_reference\", evidenceReference)",
  ".from(auditEventsTable).delete().eq(\"evidence_reference\", evidenceReference)",
  ".eq(\"id\", driverJobLinkId)",
  ".eq(\"booking_reference\", bookingReference)",
  "/api/admin-active-jobs-map-locations",
  "/api/driver-job/",
  "/live-location",
  '"x-prestige-admin-purpose": "admin-booking-persistence"',
  '"x-prestige-admin-session-token": envValue(adminSessionTokenEnvName)',
  "wrongOrigin.status !== 403",
  "missingAdmin.status !== 403",
  "wrongDriver.status !== 401",
  "result.body?.customerVisible !== false",
  "result.body?.external_send !== false",
  "result.body?.marker_count !== 1",
  "cleanup_zero_rows: true",
  "runtime_setting_restored: true",
  "secrets_printed: false",
]) {
  assertIncludes(runner, fragment, `runner evidence fragment ${fragment}`);
}

for (const fragment of [
  'const runtimeSettingsTable = "driver_live_location_runtime_settings";',
  'const runtimeSettingName = "driver_live_location_runtime";',
  "readAdminControlledRuntimePolicy",
  ".from(runtimeSettingsTable)",
  "runtimePolicy.policy.allowedJobReferences.includes",
]) {
  assertIncludes(runtimeHelper, fragment, `runtime helper admin gate fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /console\.log\s*\([^)]*process\.env/i,
  /console\.log\s*\([^)]*(?:SUPABASE|SERVICE_ROLE|SESSION_TOKEN|DRIVER_JOB_LINK_TOKEN|BOOKING_REFERENCE|TOKEN_HASH|COOKIE|JWT)/i,
  /VERCEL_|vercel\s+(?:env|--prod|deploy)|npx\s+vercel/i,
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /google\.maps|maps\.google|maps\.googleapis\.com|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /Set-Cookie|cookies\(|localStorage|sessionStorage/i,
]) {
  assertExcludes(
    runnerWithoutDenylist,
    forbiddenPattern,
    "driver live-location admin runtime evidence runner",
  );
}

for (const forbiddenPhrase of [
  "Driver Live Location admin runtime evidence is complete",
  "GPS capture is active",
  "admin active-jobs map is live",
  "customer live map is approved",
  "provider sends are approved",
  "billing is approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden admin runtime runner ledger claim");
}

console.log("Driver live-location admin runtime evidence runner guard passed");
