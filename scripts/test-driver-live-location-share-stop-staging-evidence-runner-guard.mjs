import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const runnerPath = "scripts/run-driver-live-location-share-stop-staging-evidence.mjs";
const guardScript =
  "scripts/test-driver-live-location-share-stop-staging-evidence-runner-guard.mjs";

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

const [ledger, preactivationSuite, runner] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(runnerPath, "utf8"),
]);
const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Share/Stop Staging Evidence Runner Guard Lock",
);
const runnerWithoutDenylist = runner.replace(
  /const forbiddenSafeTextPattern =[\s\S]*?;\n\nclass EvidenceFailure/,
  "class EvidenceFailure",
);

for (const phrase of [
  "This adds a disabled-by-default runner scaffold for future Driver Live Location Share/Stop staging evidence.",
  "The runner is `scripts/run-driver-live-location-share-stop-staging-evidence.mjs`.",
  "The runner is not executed by this commit, no env was changed, no database read/write occurred, no GPS capture was activated, and no provider send occurred.",
  "The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_APPROVED=driver-live-location-share-stop-staging-evidence-approved` before any phase runs.",
  "The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_PHASE` to be one of `pre-window`, `runtime-window`, or `post-rollback`.",
  "The runner is staging-only by default and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_TARGET_URL` or its default.",
  "`pre-window` and `post-rollback` prove driver Share/Stop and admin active-jobs map routes are blocked/closed without database access.",
  "`runtime-window` requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN`, `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_REFERENCE`, `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_DRIVER_JOB_LINK_TOKEN`, and `PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_BOOKING_REFERENCE`.",
  "Future `runtime-window` evidence may create exactly one temporary fake `driver_job_links` row, one temporary runtime setting row, one fake latest-position row through Share Location, and audit rows produced by Share/Stop and admin read paths.",
  "The runner must prove Share Location, admin active-jobs map sees one safe fake marker, wrong-origin admin block, missing-admin block, wrong-driver block, Stop Sharing, admin active-jobs map drops back to zero markers, cleanup zero rows, and rollback/closed proof.",
  "The runner must restore the previous `driver_live_location_runtime_settings` row or delete the temporary row if none existed, then clean up temporary driver link, latest-position, and audit rows and prove zero matching evidence rows remain.",
  "The runner output is normalized and must not print Supabase URLs, service-role keys, admin session tokens, raw driver tokens, token hashes, row IDs, booking references, private customer data, real coordinates, cookies, JWTs, API keys, or env values.",
  "This runner does not edit Vercel env, deploy, apply migrations, activate browser GPS automatically, activate customer live map links, call Google Maps/OneMap/FlightAware, send provider messages, or touch billing/payment/PDF/payout.",
  "A future evidence pass still requires separate owner approval for stable server env gate state, staging-safe fake driver job token/reference, runtime DB window, cleanup/zero-row proof, rollback/disable proof, docs evidence recording, and staging promotion.",
  "This guard adds `scripts/test-driver-live-location-share-stop-staging-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger Share/Stop evidence runner phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation Share/Stop evidence runner registration");

for (const fragment of [
  'const approvalEnvName =',
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_APPROVED",
  "driver-live-location-share-stop-staging-evidence-approved",
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_PHASE",
  'const allowedPhases = new Set(["pre-window", "runtime-window", "post-rollback"]);',
  "https://prestige-limo-ops-staging.vercel.app",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_EVIDENCE_REFERENCE",
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_DRIVER_JOB_LINK_TOKEN",
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_STAGING_BOOKING_REFERENCE",
]) {
  assertIncludes(runner, fragment, `runner config fragment ${fragment}`);
}

for (const fragment of [
  'const runtimeSettingsTable = "driver_live_location_runtime_settings";',
  'const runtimeSettingName = "driver_live_location_runtime";',
  'const driverJobLinkTable = "driver_job_links";',
  'const latestPositionsTable = "driver_live_location_latest_positions";',
  'const auditEventsTable = "driver_live_location_audit_events";',
  "readCurrentRuntimeSetting",
  "restoreRuntimeSetting",
  "openRuntimeSetting",
  "insertEvidenceDriverLink",
  "tokenHash(rawToken)",
  "driver_live_location_allowed_job_references: [bookingReference]",
  "driver_live_location_capture_enabled: true",
  "admin_active_jobs_map_enabled: true",
  'driver_live_location_mode: "runtime"',
  ".from(runtimeSettingsTable).upsert",
  ".from(driverJobLinkTable)",
  ".from(latestPositionsTable).delete().eq(\"evidence_reference\", evidenceReference)",
  ".from(auditEventsTable).delete().eq(\"evidence_reference\", evidenceReference)",
  "callDriverShare",
  "callDriverStop",
  "callAdminMap(target, 1)",
  "callAdminMap(target, 0)",
  "expectBlockedBoundaries",
  "wrongOrigin.status !== 403",
  "missingAdmin.status !== 403",
  "wrongDriver.status !== 401",
  "result.body?.customerVisible !== false",
  "result.body?.external_send !== false",
  "result.body?.sharing_state !== \"active\"",
  "result.body?.sharing_state !== \"stopped\"",
  "cleanup_zero_rows: true",
  "runtime_setting_restored: true",
  "customer_live_map: false",
  "provider_send: false",
  "real_gps: false",
  "secrets_printed: false",
]) {
  assertIncludes(runner, fragment, `runner evidence fragment ${fragment}`);
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
    "driver live-location Share/Stop staging evidence runner",
  );
}

for (const forbiddenPhrase of [
  "Driver Live Location Share/Stop staging evidence is complete",
  "GPS capture is active",
  "customer live map is approved",
  "provider sends are approved",
  "billing is approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden Share/Stop evidence ledger claim");
}

console.log("Driver live-location Share/Stop staging evidence runner guard passed");
