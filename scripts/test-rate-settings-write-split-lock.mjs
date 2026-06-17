import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const rateSetupRoutePath = "app/api/admin-rate-setup/route.ts";
const rateSetupReadPath = "lib/admin-rate-setup-read.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);

  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);

  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const [ledger, appPage, legacyRoute, rateSetupRoute, rateSetupRead, preactivationSuite] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(appPagePath, "utf8"),
    readFile(legacyRoutePath, "utf8"),
    readFile(rateSetupRoutePath, "utf8"),
    readFile(rateSetupReadPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);

const lockSection = sectionBetween(ledger, "### Rate Settings Default Write Split Lock");

for (const phrase of [
  "Rate settings default write split is locked by `scripts/test-rate-settings-write-split-lock.mjs`.",
  "`rate_settings` read path is already typed through `GET /api/admin-rate-setup`.",
  "Typed rate setup read is covered by `scripts/test-admin-rate-setup-api-contract.mjs`.",
  "`rate_settings` save/upsert remains parked in `saveDefaultRates` on the legacy `rate_settings` path.",
  "`rate_settings` is rate/pricing-related and must stay disabled/no-write until a separate explicit approval.",
  "`customer_rates`, `driver_payout_rules`, pricing, payout, rate overrides, company/traveler override writes, and booking price/payout snapshots remain parked.",
  "No runtime implementation is approved by this lock.",
  "No UI/API behavior change, DB/write, env, deployment, migration, Supabase key use, package change, or new shim is approved.",
  "Future implementation must be one typed lane only",
]) {
  assertIncludes(lockSection, phrase, `Rate settings write split lock phrase: ${phrase}`);
}

for (const blockedFragment of [
  "customer_rates",
  "driver_payout_rules",
  "pricing",
  "payout",
  "rate overrides",
  "booking price/payout snapshots",
  "DB/write",
  "new shim",
]) {
  assertIncludes(lockSection, blockedFragment, `Rate settings write split blocked fragment: ${blockedFragment}`);
}

assertIncludes(appPage, 'const adminRateSetupApiPath = "/api/admin-rate-setup";', "Typed rate setup API path");
assertIncludes(rateSetupRoute, "export async function GET", "Typed rate setup route");
assertIncludes(rateSetupRoute, "loadAdminRateSetup", "Typed rate setup route");
assertExcludes(rateSetupRoute, /export async function (POST|PUT|PATCH|DELETE)/, "Typed rate setup route");
assertIncludes(rateSetupRead, '.from("rate_settings")', "Typed rate setup read helper");
assertIncludes(rateSetupRead, ".select(rateSettingsSelect)", "Typed rate setup read helper");

const saveDefaultRates = sliceBetween(
  appPage,
  "async function saveDefaultRates",
  "async function saveRateOverride",
);

for (const fragment of [
  "adminLegacyDataClient",
  ".from(adminLegacyTables.rateSettings)",
  ".upsert({",
  "const scalarRateSettings = buildDefaultRateSettingsScalarPayload(rateSettings);",
  "const legacyRateMapFields = buildDefaultRateSettingsLegacyRateMapsPayload(rateSettings);",
  "const legacyScalarFields = buildDefaultRateSettingsLegacyScalarFallbackPayload(",
  "scalarRuntimeSave.saved",
  "...legacyScalarFields",
  "customer_rates: customerRates",
  "driver_payout_rules: driverPayoutRules",
]) {
  assertIncludes(saveDefaultRates, fragment, `Parked rate_settings default save fragment: ${fragment}`);
}

for (const fragment of [
  "id: scalarRateSettings.id",
  "midnight_surcharge: scalarRateSettings.midnight_surcharge",
  "extra_stop_surcharge: scalarRateSettings.extra_stop_surcharge",
  "midnight_payout: scalarRateSettings.midnight_payout",
  "extra_stop_payout: scalarRateSettings.extra_stop_payout",
  "child_seat_customer_surcharge: scalarRateSettings.child_seat_customer_surcharge",
  "child_seat_driver_payout: scalarRateSettings.child_seat_driver_payout",
]) {
  assertExcludes(saveDefaultRates, fragment, `Parked rate_settings direct scalar duplication: ${fragment}`);
}

for (const fragment of [
  "rate_settings: new Set",
  '"customer_rates"',
  '"driver_payout_rules"',
  '"midnight_surcharge"',
  '"extra_stop_surcharge"',
  '"midnight_payout"',
  '"extra_stop_payout"',
  '"child_seat_customer_surcharge"',
  '"child_seat_driver_payout"',
]) {
  assertIncludes(legacyRoute, fragment, `Parked legacy rate_settings allowlist fragment: ${fragment}`);
}

assertIncludes(
  preactivationSuite,
  "scripts/test-rate-settings-write-split-lock.mjs",
  "Preactivation suite rate settings write split lock entry",
);
assertExcludes(lockSection, /runtime implementation approved|safe to implement now|write path active/i, "Rate settings write split lock");

console.log("rate settings write split lock guard passed");
