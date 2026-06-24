import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const runtimeHelperPath = "lib/driver-live-location-runtime.ts";
const driverRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
const guardScript =
  "scripts/test-driver-live-location-admin-runtime-gate-scaffold-guard.mjs";

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

const [ledger, preactivationSuite, runtimeHelper, driverRoute, adminRoute] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    readFile(runtimeHelperPath, "utf8"),
    readFile(driverRoutePath, "utf8"),
    readFile(adminRoutePath, "utf8"),
  ]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Admin-Controlled Runtime Gate Scaffold",
);

for (const phrase of [
  "This lane adds the disabled-by-default server-side scaffold for a future admin-controlled Driver Live Location runtime gate.",
  "No admin toggle UI, no setting write route, no DB migration, no env change, no deploy, no GPS activation, no customer live map, and no provider send is included.",
  "The existing env gates remain the stable server-side kill switch and must still be open before any runtime setting can be read.",
  "`evidence` mode preserves the existing bounded env-gated evidence path and still requires explicit allowed job references.",
  "`runtime` mode requires the server to read exactly one admin-controlled setting row from `driver_live_location_runtime_settings` with `setting_name=driver_live_location_runtime`.",
  "The runtime setting row must be `active`, `driver_live_location_mode=runtime`, have the relevant purpose enabled, and name explicit safe job references before capture or admin map reads can proceed.",
  "Missing settings, closed settings, missing references, invalid references, or missing Supabase config fail closed with safe 503/no-op responses.",
  "The scaffold rejects broad/all-driver activation by requiring explicit safe booking/job references and rejecting wildcard or empty reference lists.",
  "Driver capture remains job-token scoped and explicit-driver-consent scoped; admin active-jobs map remains admin/dispatcher-boundary scoped; customer visibility remains false.",
  "No pricing, payout, PayNow, billing/payment/PDF, internal/admin notes, parser/debug, secrets/tokens, raw provider payloads, customer contact data, phone numbers, OTS/photo/storage, or mock QA/dev archive fields are exposed.",
  "This guard adds `scripts/test-driver-live-location-admin-runtime-gate-scaffold-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger scaffold phrase ${phrase}`);
}

for (const forbiddenPhrase of [
  "admin runtime toggle is live now",
  "GPS capture is live now",
  "customer live map is live now",
  "all drivers may be tracked now",
  "provider sends are enabled",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden scaffold claim");
}

assertIncludes(preactivationSuite, guardScript, "preactivation scaffold guard registration");

for (const fragment of [
  'const runtimeSettingsTable = "driver_live_location_runtime_settings";',
  'const runtimeSettingName = "driver_live_location_runtime";',
  "readAdminControlledRuntimePolicy",
  'gateState.mode === "evidence"',
  "envEvidenceRuntimePolicy(env)",
  'gateState.mode !== "runtime"',
  ".from(runtimeSettingsTable)",
  '.eq("setting_name", runtimeSettingName)',
  "setting.setting_status",
  "setting.driver_live_location_mode",
  "setting.driver_live_location_capture_enabled",
  "setting.admin_active_jobs_map_enabled",
  "setting.driver_live_location_allowed_job_references",
  'settingStatus !== "active"',
  'settingMode !== "runtime"',
  'purpose === "capture" && !captureOpen',
  'purpose === "admin_map" && !adminMapOpen',
  "allowedReferences.length === 0",
  "driver_live_location_admin_runtime_gate_closed",
  "driver_live_location_admin_runtime_config_not_ready",
  "runtimePolicy.policy.allowedJobReferences.includes",
  "runtimePolicy.policy.staleAfterSeconds",
]) {
  assertIncludes(runtimeHelper, fragment, `runtime scaffold fragment ${fragment}`);
}

for (const fragment of [
  "readDriverLiveLocationScaffoldGateState",
  "runtimeGateOpen()",
]) {
  assertIncludes(driverRoute, fragment, `driver route stable scaffold gate ${fragment}`);
  assertIncludes(adminRoute, fragment, `admin route stable scaffold gate ${fragment}`);
}

assertIncludes(
  driverRoute,
  "handleDriverLiveLocationRuntimeRequest",
  "driver route runtime handler stays behind scaffold gate",
);
assertIncludes(
  adminRoute,
  "requireAdminDispatcherBoundary(request)",
  "admin route keeps admin/dispatcher boundary",
);
assertIncludes(
  adminRoute,
  "handleAdminActiveJobsMapRuntimeRequest",
  "admin route runtime handler stays behind scaffold gate",
);

for (const forbiddenPattern of [
  /all[_-]?drivers|all[_-]?jobs|wildcard/i,
  /customerVisible\s*[:=]\s*true/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
]) {
  assertExcludes(runtimeHelper, forbiddenPattern, "admin runtime gate scaffold source");
}

console.log("Driver live-location admin runtime gate scaffold guard passed");
