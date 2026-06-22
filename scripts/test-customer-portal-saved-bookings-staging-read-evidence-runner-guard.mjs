import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const runnerPath = "scripts/run-customer-portal-saved-bookings-staging-read-evidence.mjs";
const guardScript =
  "scripts/test-customer-portal-saved-bookings-staging-read-evidence-runner-guard.mjs";

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

const runnerSection = sectionBetween(
  ledger,
  "### Customer Portal Saved-Bookings Staging Evidence Runner Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard plus a manual future runner for a separately approved Customer Portal saved-bookings staging evidence pass.",
  "The runner is `scripts/run-customer-portal-saved-bookings-staging-read-evidence.mjs`.",
  "The runner is not executed by this commit, and customer portal saved-bookings evidence remains not run.",
  "The runner requires `PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_READ_EVIDENCE_APPROVED=customer-portal-saved-bookings-staging-read-approved` before any phase runs.",
  "The runner requires `PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_READ_EVIDENCE_PHASE` to be one of `pre-window`, `read-window`, or `post-rollback`.",
  "The runner is staging-only and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_STAGING_TARGET_URL` or its default.",
  "The runner does not open gates, close gates, edit Vercel env, deploy, or print env values.",
  "The `read-window` phase requires the existing customer saved-bookings and customer portal session gates to already be open in staging.",
  "The `read-window` phase requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE`, and `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN`.",
  "The `pre-window` and `post-rollback` phases perform blocked/no-read route proof only and do not write to the database.",
  "The `read-window` phase creates exactly one staging-safe fake customer, one matching customer access account, one matching saved booking, and one safe audit event.",
  "The `read-window` phase reads the saved booking through the guarded customer portal session and `/api/customer-saved-bookings` route.",
  "The `read-window` phase verifies anonymous, missing-session, wrong-session, cross-origin, unmatched-reference, safe-projection, wrong-auth-user no-account, and audit proof.",
  "The runner cleans up the exact staging evidence customer, access account, booking, and audit event, then verifies zero matching rows remain.",
  "The runner must not use real customer data, notification row writes, customer in-app runtime/buttons, provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, shims, or production activation.",
  "The runner output is normalized and must not print secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, or real customer data.",
  "A future evidence pass still requires separate owner approval for staging env/gate/deploy window, runner execution, rollback/disable proof, docs evidence recording, and staging promotion.",
  "This guard adds `scripts/test-customer-portal-saved-bookings-staging-read-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(runnerSection, phrase, `customer portal saved-bookings runner phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation runner guard registration");

for (const fragment of [
  'const approvalEnvName = "PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_READ_EVIDENCE_APPROVED";',
  'const expectedApproval = "customer-portal-saved-bookings-staging-read-approved";',
  'const phaseEnvName = "PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_READ_EVIDENCE_PHASE";',
  'const allowedPhases = new Set(["pre-window", "read-window", "post-rollback"]);',
  'const targetUrlEnvName = "PRESTIGE_CUSTOMER_PORTAL_SAVED_BOOKINGS_STAGING_TARGET_URL";',
  'const defaultStagingTarget = "https://prestige-limo-ops-staging.vercel.app";',
  'parsed.hostname !== "prestige-limo-ops-staging.vercel.app"',
  "requiredReadWindowEnvNames",
  '"SUPABASE_URL"',
  '"SUPABASE_SERVICE_ROLE_KEY"',
  '"PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED"',
  '"PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE"',
  '"PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID"',
  '"PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN"',
  '"PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED"',
  '"PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE"',
  '"PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN"',
]) {
  assertIncludes(runner, fragment, `runner required config fragment ${fragment}`);
}

for (const fragment of [
  '.from("customers")',
  '.from("customer_access_accounts")',
  '.from("bookings")',
  '.from("customer_driver_access_audit_events")',
  ".insert({",
  ".delete()",
  "verifyCleanup",
  "zero_matching_rows",
  "wrong_auth_user_active_account_rows",
  "unmatched_booking_reference_rows",
  "booking_reference",
  "customer_facing_status",
  "service_type",
  "pickup_at",
  "pickup_location",
  "dropoff_location",
  "passenger_name",
  "customer-saved-bookings-read",
  "customer-portal-session-issue",
  "safe_projection_only",
  "rollback_proof_required_after_this_runner",
]) {
  assertIncludes(runner, fragment, `runner evidence fragment ${fragment}`);
}

for (const fragment of [
  "anonymous customer saved-bookings boundary",
  "missing customer session boundary",
  "wrong customer session boundary",
  "cross-origin customer boundary",
  "authenticated customer saved-bookings read",
  "unmatched booking reference isolation",
  "cleanup verify bookings",
  "cleanup verify customer access account",
  "cleanup verify customer access audit events",
  "cleanup verify staging customer",
]) {
  assertIncludes(runner, fragment, `runner proof label ${fragment}`);
}

for (const forbiddenPattern of [
  /console\.log\s*\([^)]*process\.env/i,
  /VERCEL_|vercel\s+(?:env|--prod|deploy)|npx\s+vercel/i,
  /maps\.googleapis\.com|google_maps|ONEMAP|onemap\.gov|FlightAware|AeroAPI/i,
  /new\s+Resend|resend\.|api\.telegram\.org|sendMessage|sendMail|twilio|whatsapp|sms/i,
  /customer_driver_app_notification_outbox/i,
  /NEXT_PUBLIC|production deploy|manual deploy/i,
  /row_id|customer_id.*console|auth_user_id.*console/i,
]) {
  assertExcludes(runner, forbiddenPattern, "runner forbidden surface");
}

for (const forbiddenPhrase of [
  "customer portal saved-bookings evidence is complete",
  "customer auth is active",
  "customer in-app button is active",
  "provider sends are approved",
  "Google Maps may run in customer portal evidence",
  "OneMap may run in customer portal evidence",
  "rollback proof may be skipped",
]) {
  assertExcludes(runnerSection, forbiddenPhrase, "forbidden runner ledger claim");
}

console.log("Customer Portal saved-bookings staging read evidence runner guard passed.");
