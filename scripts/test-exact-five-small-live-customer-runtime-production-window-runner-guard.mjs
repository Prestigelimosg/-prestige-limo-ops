import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runnerPath = "scripts/run-small-live-customer-runtime-production-window.mjs";
const helperPath = "lib/customer-runtime-session-map.ts";
const customerSavedBookingsReadPath = "lib/customer-saved-bookings-read.ts";
const customerAppNotificationPersistencePath =
  "lib/customer-driver-app-notification-persistence.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const thisGuardPath =
  "scripts/test-exact-five-small-live-customer-runtime-production-window-runner-guard.mjs";

const [
  runner,
  helper,
  customerSavedBookingsRead,
  customerAppNotificationPersistence,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(runnerPath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(customerSavedBookingsReadPath, "utf8"),
  readFile(customerAppNotificationPersistencePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const exactFiveSection = sectionBetween(
  ledger,
  "### Exact-5 Small Live Customer Production Runtime Window Runner Guard Lock",
);

for (const fragment of [
  "PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED",
  "exact-5-small-live-customer-runtime-window-approved",
  "PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE",
  "PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_DEPLOY_APPROVED",
  "exact-5-small-live-customer-runtime-window-deploy-approved",
  "PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_TARGET_URL",
  "exactFiveAllowlistSize = 5",
  "exactFiveProfileRequested",
  "selectExactFiveLiveWindowTargets",
  "activeExactAllowlistSize",
  "activeProofChecklist",
  "EXACT-5-SMALL-LIVE-CUSTOMER-RUNTIME-WINDOW",
  "exactly five hidden active production customer account references approved privately",
  "exactly five customer sessions mapped privately with no token values printed",
  "exactly five private customer sessions to exactly five allowlisted customer accounts",
  "customer portal read proof for all five allowlisted customers",
  "customer in-app read proof for all five allowlisted customers",
  "admin Send In-App fixed-template proof for all five allowlisted customers",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
  "deploymentEnvOverrides",
  "provePostRollbackBlocked",
  "verifyZeroNotificationRows",
]) {
  assertIncludes(runner, fragment, `runner exact-5 fragment ${fragment}`);
}

for (const fragment of [
  "exactFiveCustomerRuntimeSessionMapEntryCount = 5",
  "expectedEntryCount = exactCustomerRuntimeSessionMapEntryCount",
  "supportedEntryCounts",
  "exactFiveCustomerRuntimeSessionMapEntryCount",
  "entries.length !== expectedEntryCount",
  "uniqueAuthUsers.size !== expectedEntryCount",
  "uniqueCustomerAccounts.size !== expectedEntryCount",
  "uniqueTokens.size !== expectedEntryCount",
]) {
  assertIncludes(helper, fragment, `session-map exact-5 fragment ${fragment}`);
}

for (const fragment of [
  "expectedEntryCount: runtimeGate.data.account_allowlist.size",
  "resolveExactTwoCustomerRuntimeSessionMap",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
]) {
  assertIncludes(customerSavedBookingsRead, fragment, `saved-bookings exact-5 boundary ${fragment}`);
}

for (const fragment of [
  "expectedEntryCount: runtimeGate.account_allowlist.size",
  "resolveExactTwoCustomerRuntimeSessionMap",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
]) {
  assertIncludes(
    customerAppNotificationPersistence,
    fragment,
    `customer in-app exact-5 boundary ${fragment}`,
  );
}

for (const fragment of [
  "This is a disabled-by-default exact-5 extension",
  "The exact-2 and exact-3 live-window evidence history remains preserved",
  "The exact-5 profile requires `PRESTIGE_EXACT5_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED=exact-5-small-live-customer-runtime-window-approved`",
  "The exact-5 execution phase is disabled by default",
  "The exact-5 live-window scope is exactly five hidden active production customer accounts, with one latest active booking per allowlisted account.",
  "Execution mode must use `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP` to map exactly five private customer sessions to exactly five allowlisted customer accounts without printing token values.",
  "Execution mode may create exactly one temporary `customer_app` notification row per allowlisted customer",
  "prove zero matching rows remain",
  "Provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules",
  "all-customer activation remain blocked",
]) {
  assertIncludes(exactFiveSection, fragment, `ledger exact-5 fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /all-customer activation is approved/i,
  /provider sends are approved/i,
  /billing\/payment\/PDF is approved/i,
  /may print secrets/i,
  /may print tokens/i,
  /may print booking references/i,
  /may print customer names/i,
  /process\.env\.[A-Z0-9_]+\s*=/,
  /vercel\s+env\s+add/i,
]) {
  assertExcludes(runner, forbiddenPattern, "exact-5 runner forbidden surface");
  assertExcludes(exactFiveSection, forbiddenPattern, "exact-5 ledger forbidden surface");
}

assertIncludes(preactivationSuite, thisGuardPath, "preactivation suite exact-5 registration");

console.log("Exact-5 small live customer production runtime window runner guard passed.");
