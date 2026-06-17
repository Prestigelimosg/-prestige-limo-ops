import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-rate-settings-scalar-runtime-legacy-fallback-guard.mjs";

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

const [appPage, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Rate Settings Scalar Runtime Legacy Fallback Guard Lock",
);

for (const phrase of [
  "Rate settings scalar runtime legacy fallback is guarded.",
  "Closed-gate/no-op typed scalar responses keep the existing legacy `rate_settings` fallback behavior unchanged.",
  "When the typed scalar runtime reports saved, `saveDefaultRates` keeps scalar fields out of the legacy shim follow-up.",
  "The legacy follow-up still carries parked `customer_rates` and `driver_payout_rules` map fields until those maps are separately migrated.",
  "No Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/card, provider send, env change, deployment, live DB write execution, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Rate settings scalar fallback ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite rate settings scalar runtime legacy fallback guard",
);

const scalarRuntimeHelper = sliceBetween(
  appPage,
  "async function saveDefaultRateSettingsScalarRuntime",
  "type CompanyCrmIdentityContactPayload",
);
assertIncludes(
  scalarRuntimeHelper,
  "Promise<{ ok: true; saved: boolean }",
  "Rate settings scalar runtime saved result type",
);
assertIncludes(
  scalarRuntimeHelper,
  "return { ok: true, saved: rateSettingsRuntimeWriteSaved(responseBody) };",
  "Rate settings scalar runtime saved signal",
);
assertIncludes(
  scalarRuntimeHelper,
  "return { ok: true, saved: false };",
  "Rate settings scalar runtime closed-gate fallback signal",
);
assertExcludes(scalarRuntimeHelper, "customer_rates", "Rate settings scalar runtime customer maps");
assertExcludes(scalarRuntimeHelper, "driver_payout_rules", "Rate settings scalar runtime payout maps");

const scalarFallbackHelper = sliceBetween(
  appPage,
  "function buildDefaultRateSettingsLegacyScalarFallbackPayload",
  "function rateSettingsRuntimeRejectedFields",
);
assertIncludes(scalarFallbackHelper, "typedScalarSaved", "Scalar fallback typed saved branch");
assertIncludes(
  scalarFallbackHelper,
  "return {\n      id: settings.id,\n    };",
  "Scalar fallback typed saved id-only branch",
);
for (const fragment of [
  "child_seat_customer_surcharge: settings.child_seat_customer_surcharge",
  "child_seat_driver_payout: settings.child_seat_driver_payout",
  "extra_stop_payout: settings.extra_stop_payout",
  "extra_stop_surcharge: settings.extra_stop_surcharge",
  "midnight_payout: settings.midnight_payout",
  "midnight_surcharge: settings.midnight_surcharge",
]) {
  assertIncludes(scalarFallbackHelper, fragment, `Scalar fallback closed-gate scalar field ${fragment}`);
}
assertExcludes(scalarFallbackHelper, "customer_rates", "Scalar fallback customer maps");
assertExcludes(scalarFallbackHelper, "driver_payout_rules", "Scalar fallback payout maps");

const saveDefaultRates = sliceBetween(
  appPage,
  "async function saveDefaultRates",
  "async function saveRateOverride",
);
assertIncludes(
  saveDefaultRates,
  "const legacyScalarFields = buildDefaultRateSettingsLegacyScalarFallbackPayload(",
  "saveDefaultRates scalar fallback helper call",
);
assertIncludes(saveDefaultRates, "scalarRuntimeSave.saved", "saveDefaultRates scalar saved signal");
assertIncludes(saveDefaultRates, "...legacyScalarFields", "saveDefaultRates legacy scalar spread");
assertIncludes(saveDefaultRates, "customer_rates: customerRates", "saveDefaultRates parked customer rates maps");
assertIncludes(
  saveDefaultRates,
  "driver_payout_rules: driverPayoutRules",
  "saveDefaultRates parked driver payout maps",
);
for (const fragment of [
  "midnight_surcharge: scalarRateSettings.midnight_surcharge",
  "extra_stop_surcharge: scalarRateSettings.extra_stop_surcharge",
  "midnight_payout: scalarRateSettings.midnight_payout",
  "extra_stop_payout: scalarRateSettings.extra_stop_payout",
  "child_seat_customer_surcharge: scalarRateSettings.child_seat_customer_surcharge",
  "child_seat_driver_payout: scalarRateSettings.child_seat_driver_payout",
]) {
  assertExcludes(saveDefaultRates, fragment, `saveDefaultRates direct legacy scalar ${fragment}`);
}

console.log("rate settings scalar runtime legacy fallback guard passed");
