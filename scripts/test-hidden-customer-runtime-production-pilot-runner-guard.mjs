import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runnerPath = "scripts/run-hidden-customer-runtime-production-pilot.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const [runner, ledger, preactivationSuite] = await Promise.all([
  readFile(runnerPath, "utf8"),
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

const lockSection = sectionBetween(
  ledger,
  "### Controlled Hidden Customer Production Runtime Pilot Runner Guard Lock",
);

for (const fragment of [
  "PRESTIGE_HIDDEN_CUSTOMER_PRODUCTION_PILOT_APPROVED",
  "hidden-customer-production-pilot-approved",
  "expectedMaskedProductionProjectRef = \"kvv...atm\"",
  "targetLabel = \"hidden active customer\"",
  "one latest active hidden production customer booking",
  "businessCustomerLabelPattern",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
  "findHiddenCustomerTarget",
  ".from(\"customers\")",
  ".from(\"bookings\")",
  ".from(\"customer_access_accounts\")",
  ".from(notificationTable)",
  "openRuntimeGates",
  "closeRuntimeGates",
  "cleanupPilotRows",
  "verifyZeroRows",
  "assertSafePortalProjection",
  "assertSafeCustomerNotificationProjection",
  "noProviderSends: true",
  "noBillingPaymentPdfPayout: true",
  "noCustomerPrivateDataPrinted: true",
  "rowIdsPrinted: false",
  "gates_opened_in_process_only: true",
  "gates_closed_after: true",
]) {
  assertIncludes(runner, fragment, `runner fragment ${fragment}`);
}

for (const fragment of [
  "This is a disabled-by-default production evidence runner guard for the separately approved hidden active customer controlled one-customer production pilot.",
  "The runner is `scripts/run-hidden-customer-runtime-production-pilot.mjs`.",
  "The runner requires `PRESTIGE_HIDDEN_CUSTOMER_PRODUCTION_PILOT_APPROVED=hidden-customer-production-pilot-approved` before it can run.",
  "The runner selects one owner-approved hidden active production customer candidate internally and one latest active booking for that customer/account.",
  "The runner intentionally does not print the customer name, customer ID, auth user ID, booking reference, booking row ID, row IDs, tokens, cookies, env values, contacts, or private customer data.",
  "The runner uses production Supabase credentials only from existing local env files and validates the masked production project ref `kvv...atm`; no values are printed.",
  "The runner opens runtime gates only in the local process harness and does not edit env files, Vercel env, or deploy.",
  "The runner creates one temporary `customer_access_accounts` mapping and one temporary `customer_app` notification row, then deletes both and verifies zero matching rows remain.",
  "The runner proves customer portal read, customer in-app read, admin `Send In-App`, blocked missing/wrong session, out-of-scope booking isolation, and post-rollback blocked behavior.",
  "The runner is forbidden from provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing, payout, `customer_rates`, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, UI changes, deploy, or broad/all-customer runtime activation.",
  "The runner output must not print secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, booking references, customer names, phone/email, contacts, or private customer data.",
]) {
  assertIncludes(lockSection, fragment, `ledger lock fragment ${fragment}`);
}

for (const forbidden of [
  "all-customer production pilot is approved",
  "small-allowlist production pilot is approved",
  "provider send is approved",
  "free-form customer message is approved",
  "billing/payment/PDF is approved",
  "payout is approved",
  "may print secrets",
  "may print tokens",
  "may print booking references",
]) {
  assertExcludes(lockSection, forbidden, "forbidden ledger claim");
}

const runnerLines = runner.split(/\r?\n/);

for (const forbiddenPattern of [
  /console\.log\(.*process\.env/i,
  /console\.log\(.*SUPABASE/i,
  /console\.log\(.*TOKEN/i,
]) {
  assert.equal(
    runnerLines.some((line) => forbiddenPattern.test(line)),
    false,
    `runner must not include ${forbiddenPattern}`,
  );
}

for (const forbiddenPattern of [
  /vercel\s+env\s+add/i,
  /npx\s+--yes\s+vercel/i,
  /display_name\.ilike\.%Ritz%/i,
  /account_code\.ilike\.%Ritz%/i,
  /fetch\(["'`]https:\/\/maps\.googleapis\.com/i,
  /fetch\(["'`]https:\/\/www\.onemap/i,
  /resend/i,
  /sendgrid/i,
  /mailgun/i,
]) {
  assertExcludes(runner, forbiddenPattern, "forbidden runner behavior");
}

assertIncludes(
  preactivationSuite,
  "scripts/test-hidden-customer-runtime-production-pilot-runner-guard.mjs",
  "preactivation suite registration",
);

console.log("Controlled hidden customer runtime production pilot runner guard passed.");
