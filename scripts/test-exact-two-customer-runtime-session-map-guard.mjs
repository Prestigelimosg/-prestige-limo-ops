import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperPath = "lib/customer-runtime-session-map.ts";
const customerSavedBookingsReadPath = "lib/customer-saved-bookings-read.ts";
const customerAppNotificationPersistencePath =
  "lib/customer-driver-app-notification-persistence.ts";
const liveWindowRunnerPath = "scripts/run-small-live-customer-runtime-production-window.mjs";
const liveWindowGuardPath =
  "scripts/test-small-live-customer-runtime-production-window-runner-guard.mjs";
const controlledRuntimeGuardPath =
  "scripts/test-controlled-customer-runtime-activation-contract-guard.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const thisGuardPath = "scripts/test-exact-two-customer-runtime-session-map-guard.mjs";

const [
  helper,
  customerSavedBookingsRead,
  customerAppNotificationPersistence,
  liveWindowRunner,
  liveWindowGuard,
  controlledRuntimeGuard,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(customerSavedBookingsReadPath, "utf8"),
  readFile(customerAppNotificationPersistencePath, "utf8"),
  readFile(liveWindowRunnerPath, "utf8"),
  readFile(liveWindowGuardPath, "utf8"),
  readFile(controlledRuntimeGuardPath, "utf8"),
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

const controlledSection = sectionBetween(
  ledger,
  "### Controlled Customer Portal + Customer In-App Runtime Activation Contract Guard Lock",
);
const liveWindowSection = sectionBetween(
  ledger,
  "### Small Live Customer Production Runtime Allowlist Window Runner Guard Lock",
);

for (const fragment of [
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
  "exactCustomerRuntimeSessionMapEntryCount = 2",
  "resolveExactTwoCustomerRuntimeSessionMap",
  '.split(";")',
  'entry.split("|")',
  "entries.length !== exactCustomerRuntimeSessionMapEntryCount",
  "uniqueAuthUsers.size !== exactCustomerRuntimeSessionMapEntryCount",
  "uniqueCustomerAccounts.size !== exactCustomerRuntimeSessionMapEntryCount",
  "uniqueTokens.size !== exactCustomerRuntimeSessionMapEntryCount",
  'reason: "invalid_config"',
  'reason: "token_not_matched"',
  "value.includes(\"|\")",
  "value.includes(\";\")",
]) {
  assertIncludes(helper, fragment, `session-map helper fragment ${fragment}`);
}

for (const fragment of [
  "import { resolveExactTwoCustomerRuntimeSessionMap }",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
  "mappedSession.configured",
  "customer_account_reference",
  "customerAccountAllowedByControlledRuntime(customerAccountReference, runtimeGate.data)",
  "let customerAccountReference = validBookingReference(context.customer_account_reference)",
  ".from(\"customer_access_accounts\")",
  ".eq(\"auth_user_id\", context.auth_user_id)",
]) {
  assertIncludes(customerSavedBookingsRead, fragment, `saved-bookings runtime map fragment ${fragment}`);
}

for (const fragment of [
  "import { resolveExactTwoCustomerRuntimeSessionMap }",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
  "mappedSession.configured",
  "customer_account_reference",
  "customerAccountAllowedByControlledRuntime(customerAccountReference, runtimeGate)",
  "const mappedAccountReference = safeIdentifier(",
  "loadControlledCustomerAccountReference",
  "verifyControlledCustomerBookingReference",
]) {
  assertIncludes(
    customerAppNotificationPersistence,
    fragment,
    `customer in-app runtime map fragment ${fragment}`,
  );
}

for (const source of [liveWindowRunner, liveWindowGuard, controlledRuntimeGuard, controlledSection, liveWindowSection]) {
  assertIncludes(source, "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP", "session map source registration");
  assertIncludes(
    source,
    "exactly two private customer sessions to exactly two allowlisted customer accounts",
    "exact-2 session map policy",
  );
}

assertIncludes(preactivationSuite, thisGuardPath, "preactivation suite exact-2 session map registration");

for (const forbiddenPattern of [
  /console\.log\s*\([^)]*process\.env/i,
  /session_map.*console\.log/i,
  /PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP\s*=/,
  /all-customer activation is approved/i,
  /provider sends are approved/i,
]) {
  assertExcludes(helper, forbiddenPattern, "session-map helper forbidden surface");
  assertExcludes(ledger, forbiddenPattern, "session-map ledger forbidden surface");
}

console.log("Exact-2 customer runtime session map guard passed.");
