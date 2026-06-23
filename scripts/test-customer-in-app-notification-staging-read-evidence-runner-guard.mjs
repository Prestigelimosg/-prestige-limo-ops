import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const runnerPath = "scripts/run-customer-in-app-notification-staging-read-evidence.mjs";
const customerRoutePath = "app/api/customer-app-notifications/route.ts";
const persistencePath = "lib/customer-driver-app-notification-persistence.ts";
const guardScript =
  "scripts/test-customer-in-app-notification-staging-read-evidence-runner-guard.mjs";

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

const [ledger, preactivationSuite, runner, customerRoute, persistence] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(runnerPath, "utf8"),
  readFile(customerRoutePath, "utf8"),
  readFile(persistencePath, "utf8"),
]);

const runnerSection = sectionBetween(
  ledger,
  "### Customer In-App Notification Staging Read Evidence Runner Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard plus a disabled-by-default runner scaffold for a future separately approved Customer In-App Notification read/table-RLS staging evidence pass.",
  "The runner is `scripts/run-customer-in-app-notification-staging-read-evidence.mjs`.",
  "The runner is not executed by this commit, and Customer In-App Notification read evidence remains not run.",
  "The runner requires `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_APPROVED=customer-in-app-notification-staging-read-approved` before any phase runs.",
  "The runner requires `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_PHASE` to be one of `pre-window`, `read-window`, or `post-rollback`.",
  "The runner is staging-only and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_TARGET_URL` or its default.",
  "The runner does not open gates, close gates, edit Vercel env, deploy, run evidence automatically, or print env values.",
  "`pre-window` and `post-rollback` perform blocked/no-read route proof only and do not read/write the database.",
  "The `read-window` path is implemented as a disabled-by-default gated staging evidence path and must not run unless the explicit runner approval, phase, staging target, read gate, saved-bookings customer session boundary, Supabase env names, and staging reference are present.",
  "Future `read-window` evidence requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE`.",
  "Future `read-window` evidence may create exactly one fake staging `customer_app` notification row for the approved staging reference only, then must clean it up.",
  "Future evidence must prove anonymous, missing-session, wrong-session, wrong-customer, cross-origin, wrong-referer, customer row isolation, safe payload projection, audit/access logging, cleanup/zero-row rollback, and closed-gate/no-read behavior after rollback.",
  "Customer-safe notification fields remain limited to delivery surface, notification type/status, priority, safe title, safe message, safe context, workflow area, safe booking reference/context, and created/updated timestamps.",
  "Customer-visible in-app notification payloads must exclude pricing, payout, PayNow, payout preferences/comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/driver GPS unless separately approved, and OTS/photo/storage unless separately approved.",
  "The customer route remains fail-closed by default; this gated evidence path does not activate customer in-app runtime, customer auth/session, customer portal behavior, notification row writes outside the one fake future evidence fixture, provider sends, maps, FlightAware, UI buttons, env changes, deploys, or production.",
  "The runner output is normalized and must not print secrets, cookies, session tokens, API keys, DB URLs, env values, row IDs, auth user IDs, customer IDs, or real customer data.",
  "A future evidence pass still requires separate owner approval for staging env/gate/deploy window, runner execution, cleanup/zero-row proof, rollback/disable proof, docs evidence recording, and staging promotion.",
  "This guard adds `scripts/test-customer-in-app-notification-staging-read-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(runnerSection, phrase, `customer in-app runner ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer in-app runner registration");

for (const fragment of [
  'const approvalEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_APPROVED";',
  'const expectedApproval = "customer-in-app-notification-staging-read-approved";',
  'const phaseEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_EVIDENCE_PHASE";',
  'const allowedPhases = new Set(["pre-window", "read-window", "post-rollback"]);',
  'const targetUrlEnvName = "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_TARGET_URL";',
  'const defaultStagingTarget = "https://prestige-limo-ops-staging.vercel.app";',
  'parsed.hostname !== "prestige-limo-ops-staging.vercel.app"',
  "requiredReadWindowEnvNames",
  '"SUPABASE_URL"',
  '"SUPABASE_SERVICE_ROLE_KEY"',
  '"PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED"',
  '"PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED"',
  '"PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE"',
  '"PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID"',
  '"PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN"',
  '"PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED"',
  '"PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE"',
  '"PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE"',
]) {
  assertIncludes(runner, fragment, `runner required config fragment ${fragment}`);
}

for (const fragment of [
  "/api/customer-app-notifications",
  "verifyBlockedCustomerNotificationRoute",
  "anonymous_get_blocked",
  "anonymous_patch_blocked",
  "createFakeCustomerNotificationFixture",
  "readCorrectCustomerNotification",
  "verifyBlockedReadRequest",
  "cleanupEvidenceRows",
  "verifyZeroMatchingRows",
  "zero_matching_rows",
  'delivery_surface: "customer_app"',
  'notification_type: "trip_update"',
  'notification_status: "queued"',
  'priority: "normal"',
  'safe_title: "Trip update"',
  'safe_message: "Your Prestige Limo booking update is ready."',
  '"safe_context"',
  'booking_reference: "STAGING-CUSTOMER-IN-APP-NOTIFICATION-EVIDENCE"',
  "forbiddenPayloadFragments",
  "customer_in_app_notification_payload_forbidden_field",
  "missing_required_read_window_env_names_safely",
  "customer_in_app_notification_staging_read_window_evidence_passed",
]) {
  assertIncludes(runner, fragment, `runner evidence scaffold fragment ${fragment}`);
}

for (const fragment of [
  "customerAppNotificationsRequireAuthResult",
  "readCustomerAppNotificationsForStagingEvidence",
  "safeCustomerAuthRequiredResponse",
  "export async function GET(request: Request)",
  "export async function PATCH()",
]) {
  assertIncludes(customerRoute, fragment, `customer route fail-closed fragment ${fragment}`);
}

for (const fragment of [
  "process.env",
  "createClient",
  ".from(",
  "createCustomerDriverAppNotification",
  "updateCustomerDriverAppNotificationStatus",
  "request.json",
  "cookies(",
  "Set-Cookie",
  "NextResponse",
  "notification:",
  "notifications:",
]) {
  assertExcludes(customerRoute, fragment, "customer route must remain fail-closed");
}

for (const fragment of [
  "customerInAppNotificationReadEvidenceVersion",
  "resolveCustomerInAppNotificationReadEvidenceGate",
  "resolveCustomerInAppNotificationReadBoundary",
  "loadCustomerAppNotificationsForStagingReference",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "customerInAppNotificationReadSelect",
  "loadCustomerAppNotificationsForBookingReference",
  ".eq(\"delivery_surface\", \"customer_app\")",
  ".eq(\"booking_reference\", bookingReference)",
  "stagingReference",
]) {
  assertIncludes(persistence, fragment, `gated customer read helper fragment ${fragment}`);
}

const gateIndex = persistence.indexOf("resolveCustomerInAppNotificationReadEvidenceGate()");
const loadIndex = persistence.indexOf("loadCustomerAppNotificationsForStagingReference(");
const clientIndex = persistence.indexOf("getCustomerInAppNotificationReadClient()");
assert.equal(gateIndex >= 0 && loadIndex > gateIndex, true, "read helper must resolve gate before loading rows");
assert.equal(clientIndex >= 0 && clientIndex > gateIndex, true, "Supabase client helper must appear after gated read helpers");

for (const forbiddenPattern of [
  /console\.log\s*\([^)]*process\.env/i,
  /VERCEL_|vercel\s+(?:env|--prod|deploy)|npx\s+vercel/i,
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']/i,
  /new\s+Resend|resend\.|api\.telegram\.org|sendMessage|sendMail|twilio|whatsapp|sms/i,
  /maps\.googleapis\.com|routes\.googleapis\.com|places\.googleapis\.com/i,
  /www\.onemap\.gov\.sg|ONEMAP_TOKEN|FlightAware|AeroAPI|AEROAPI/i,
  /SUPABASE_SERVICE_ROLE_KEY.*console|row_id|customer_id.*console|auth_user_id.*console/i,
  /production deploy|manual deploy/i,
]) {
  assertExcludes(runner, forbiddenPattern, "runner forbidden side-effect surface");
}

for (const forbiddenPhrase of [
  "Customer In-App Notification read evidence is complete",
  "customer in-app button is active",
  "customer route is live",
  "notification row writes are active",
  "provider sends are approved",
  "Google Maps may run in customer in-app evidence",
  "OneMap may run in customer in-app evidence",
  "rollback proof may be skipped",
]) {
  assertExcludes(runnerSection, forbiddenPhrase, "forbidden customer in-app runner ledger claim");
}

console.log("Customer In-App Notification staging read evidence runner guard passed");
