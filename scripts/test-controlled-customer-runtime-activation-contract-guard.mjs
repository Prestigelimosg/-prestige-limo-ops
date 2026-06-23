import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const customerSavedBookingsRoutePath = "app/api/customer-saved-bookings/route.ts";
const customerPortalSessionsRoutePath = "app/api/customer-portal-sessions/route.ts";
const customerPortalSessionIssuePath = "lib/customer-portal-session-issue.ts";
const customerAppNotificationsRoutePath = "app/api/customer-app-notifications/route.ts";
const adminCustomerDriverAppNotificationsRoutePath =
  "app/api/admin-customer-driver-app-notifications/route.ts";
const customerSavedBookingsReadPath = "lib/customer-saved-bookings-read.ts";
const customerAppNotificationPersistencePath =
  "lib/customer-driver-app-notification-persistence.ts";
const appPagePath = "app/page.tsx";
const guardScript = "scripts/test-controlled-customer-runtime-activation-contract-guard.mjs";

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

const [
  ledger,
  preactivationSuite,
  customerSavedBookingsRoute,
  customerPortalSessionsRoute,
  customerPortalSessionIssue,
  customerAppNotificationsRoute,
  adminCustomerDriverAppNotificationsRoute,
  customerSavedBookingsRead,
  customerAppNotificationPersistence,
  appPage,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(customerSavedBookingsRoutePath, "utf8"),
  readFile(customerPortalSessionsRoutePath, "utf8"),
  readFile(customerPortalSessionIssuePath, "utf8"),
  readFile(customerAppNotificationsRoutePath, "utf8"),
  readFile(adminCustomerDriverAppNotificationsRoutePath, "utf8"),
  readFile(customerSavedBookingsReadPath, "utf8"),
  readFile(customerAppNotificationPersistencePath, "utf8"),
  readFile(appPagePath, "utf8"),
]);

const activationSection = sectionBetween(
  ledger,
  "### Controlled Customer Portal + Customer In-App Runtime Activation Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved controlled customer-facing runtime activation lane.",
  "This lock does not activate customer portal runtime, customer auth/session/cookie creation, customer in-app production read/write, notification row writes, env changes, DB reads/writes, provider sends, Google Maps/OneMap/FlightAware calls, deploy, production activation, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, pricing/rates/customer_rates changes, `driver_payout_rules` changes, payout/payment/PDF/billing/invoice activation, OTS/photo/storage activation, calendar activation, UI sector/card expansion, or shims.",
  "Completed prerequisites now recorded: Customer Portal saved-bookings staging read evidence, Customer In-App read/table-RLS staging evidence, and Customer In-App admin button one-row staging evidence.",
  "Those completed prerequisites do not approve broad customer-facing runtime activation, all-customer access, production activation, provider sends, live location, billing/payment/PDF, payout, or real customer notification sends/rows.",
  "Future controlled activation must be limited to exactly one owner-approved customer/account first, or an explicit owner-approved small account allowlist; broad/all-customer activation is forbidden until a later separate approval and evidence pass.",
  "Future activation approval must name the exact environment, staging or production pilot mode, customer/account reference scope, booking/reference scope if applicable, gate/env names, allowed safe fields, audit plan, rollback/disable plan, stop conditions, and checks.",
  "Future env names must be documented as names only with no values or secrets; planned gate names include `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`, and `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`.",
  "Customer portal runtime must remain authenticated, same-origin, session-bound, account-scoped, and customer-row-isolated before any real customer can read saved bookings.",
  "Customer in-app notification read runtime must remain authenticated, same-origin, session-bound, account-scoped, and customer-row-isolated before any real customer can read notifications.",
  "Customer in-app notification write runtime must remain admin-selected only through the existing compact `Send In-App` action or a separately approved equivalent; no automatic fallback, automatic multi-channel blast, scheduler, retry, polling, batch send, provider send, free-form customer message, or broad notification write is approved.",
  "Customer portal safe saved-booking fields remain limited to booking reference, customer-facing status, service type, pickup date/time, pickup location, drop-off location, passenger name, and safe created/updated/month grouping fields unless a later contract expands them.",
  "Customer in-app safe notification fields remain limited to delivery surface, notification type/status, priority, safe title, safe message, safe context, workflow area, safe booking reference/context, and created/updated timestamps unless a later contract expands them.",
  "Customer-facing runtime must exclude pricing, payout, PayNow, payout preferences/comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/driver GPS unless separately approved, and OTS/photo/storage unless separately approved.",
  "Future activation evidence must prove anonymous, missing-session, wrong-session, wrong-customer/account, cross-origin, wrong-referer, and out-of-allowlist paths are blocked.",
  "Future activation evidence must prove audit/access logging without printing row IDs, auth user IDs, customer IDs, cookies, session tokens, JWTs, API keys, DB URLs, env values, or secrets.",
  "Future activation evidence must prove rollback/disable by closing gates, removing temporary env exposure if any, redeploying closed when needed, and verifying blocked/no-read/no-write behavior after rollback.",
  "Driver In-App, Driver Details Email, Google Maps, OneMap retirement, FlightAware locks, and provider-send evidence do not unlock customer portal runtime or customer in-app runtime.",
  "This guard adds `scripts/test-controlled-customer-runtime-activation-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "The disabled-by-default controlled runtime gate scaffold is now implemented in `lib/customer-saved-bookings-read.ts`, `lib/customer-driver-app-notification-persistence.ts`, and `app/api/customer-app-notifications/route.ts`.",
  "The scaffold defaults closed unless the relevant runtime gate is explicitly enabled, mode is `one-customer` or `small-allowlist`, and the customer account reference is present in the allowlist.",
  "Customer Portal saved-bookings reads require the existing customer saved-bookings session boundary plus `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE`, and `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST` before reading booking rows.",
  "Customer In-App notification runtime reads require the existing saved-bookings session boundary plus `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`, then verify the booking belongs to the allowlisted customer account before reading notifications.",
  "Customer In-App `customer_app` writes require the existing admin/dispatcher boundary, the approved fixed `Driver details ready` template, a safe booking reference, and the controlled customer in-app account allowlist before inserting a row.",
  "`driver_app` notification writes remain separate from customer runtime activation and are not unlocked or blocked by the customer allowlist scaffold.",
]) {
  assertIncludes(activationSection, phrase, `controlled customer runtime activation phrase: ${phrase}`);
}

for (const forbidden of [
  "broad customer-facing runtime activation is approved",
  "all-customer access is approved",
  "production activation is approved",
  "provider sends are approved",
  "real customer notification sends are approved",
  "real customer notification rows are approved",
  "customer auth can be bypassed",
  "wrong-customer reads are allowed",
  "out-of-allowlist access is allowed",
  "rollback may be skipped",
  "pricing may be included",
  "payout may be included",
  "PayNow payout may be included",
  "driver_payout_rules may be included",
  "customer_rates may be included",
  "payment/PDF/billing may be included",
  "internal/admin notes may be included",
  "parser/debug fields may be included",
  "secrets/tokens may be included",
  "raw provider payloads may be included",
  "live location is approved by this lock",
]) {
  assertExcludes(activationSection, forbidden, "forbidden controlled customer activation claim");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation controlled customer runtime activation guard registration",
);

for (const fragment of [
  "resolveCustomerSavedBookingsBoundary",
  "customerSavedBookingsAuthRequiredResult",
  "loadCustomerSavedBookings",
  "export async function GET(request: Request)",
]) {
  assertIncludes(customerSavedBookingsRoute, fragment, `customer saved-bookings route gated fragment ${fragment}`);
}

for (const fragment of [
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "resolveControlledCustomerPortalRuntimeGate",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST",
  "runtime_gate",
  "customerAccountAllowedByControlledRuntime",
  'purpose !== "customer-saved-bookings-read"',
  'refererUrl.pathname !== "/my-bookings"',
  '.from("customer_access_accounts")',
  '.eq("account_status", "active")',
  '.from("bookings")',
  '.eq("customer_id", customerAccountReference)',
]) {
  assertIncludes(customerSavedBookingsRead, fragment, `customer saved-bookings auth/isolation fragment ${fragment}`);
}

for (const fragment of [
  "customerPortalSessionIssueAuthRequiredResult",
  "resolveCustomerPortalSessionIssue",
  "export async function POST(request: Request)",
  "export async function GET()",
  "export async function PATCH()",
]) {
  assertIncludes(customerPortalSessionsRoute, fragment, `customer portal sessions default-off fragment ${fragment}`);
}

for (const fragment of [
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID",
  "sameOriginMyBookingsRequest",
  "customerPortalSessionIssueAuthRequiredResult",
]) {
  assertIncludes(customerPortalSessionIssue, fragment, `customer portal session helper gate fragment ${fragment}`);
}

for (const fragment of [
  "customerAppNotificationsRequireAuthResult",
  "readCustomerAppNotificationsForControlledRuntime",
  "readCustomerAppNotificationsForStagingEvidence",
  "safeCustomerAuthRequiredResponse",
  "export async function GET(request: Request)",
  "export async function PATCH()",
]) {
  assertIncludes(customerAppNotificationsRoute, fragment, `customer app notifications gated fragment ${fragment}`);
}

for (const fragment of [
  "customerInAppNotificationRuntimeVersion",
  "resolveControlledCustomerInAppNotificationRuntimeGate",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST",
  "resolveCustomerInAppNotificationRuntimeBoundary",
  "loadCustomerAppNotificationsForControlledRuntime",
  "assertControlledCustomerAppNotificationWriteAllowed",
  "customerAppNotificationUsesApprovedRuntimeTemplate",
  'input.safe_title === "Driver details ready"',
  'input.safe_message === "Your Prestige Limo driver details are ready in your customer app."',
  '.from("customer_access_accounts")',
  '.from("bookings")',
  "resolveCustomerInAppNotificationReadEvidenceGate",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE",
  "loadCustomerAppNotificationsForStagingReference",
  "customer_driver_app_notification_outbox",
  "toSafeRecord",
]) {
  assertIncludes(
    customerAppNotificationPersistence,
    fragment,
    `customer app notification read/isolation fragment ${fragment}`,
  );
}

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  "createCustomerDriverAppNotification",
  "parseCustomerDriverAppNotificationCreatePayload",
  "adminDispatcherBoundaryToPersistenceAdapterActor",
]) {
  assertIncludes(
    adminCustomerDriverAppNotificationsRoute,
    fragment,
    `admin notification route boundary fragment ${fragment}`,
  );
}

for (const fragment of [
  "delivery_surface",
  "customer_app",
  "customerDriverAppNotificationSurfaces",
]) {
  assertIncludes(
    customerAppNotificationPersistence,
    fragment,
    `customer app notification helper surface fragment ${fragment}`,
  );
}

for (const fragment of [
  'data-admin-customer-driver-details-customer-in-app-send-action="true"',
  "sendAdminCustomerDriverDetailsCustomerInAppNotification",
  'safe_title: "Driver details ready"',
  'safe_message: "Your Prestige Limo driver details are ready in your customer app."',
  'delivery_surface: "customer_app"',
  "Send In-App",
]) {
  assertIncludes(appPage, fragment, `existing compact customer in-app button fragment ${fragment}`);
}

const runtimeSources = `${customerSavedBookingsRoute}
${customerPortalSessionsRoute}
${customerPortalSessionIssue}
${customerAppNotificationsRoute}
${adminCustomerDriverAppNotificationsRoute}
${customerSavedBookingsRead}
${customerAppNotificationPersistence}
${appPage}`;

const runtimeReadIndex = customerAppNotificationsRoute.indexOf(
  "readCustomerAppNotificationsForControlledRuntime(request)",
);
const evidenceReadIndex = customerAppNotificationsRoute.indexOf(
  "readCustomerAppNotificationsForStagingEvidence(request)",
);
assert.equal(
  runtimeReadIndex >= 0 && evidenceReadIndex > runtimeReadIndex,
  true,
  "Customer app notification route must try controlled runtime before staging evidence path.",
);

for (const forbiddenPattern of [
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']/i,
  /require\(\s*["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']\s*\)/i,
  /new\s+Resend|sendMail\s*\(|messages\.send|client\.messages\.create/i,
  /api\.telegram\.org|sendLocation|sendMessage|TELEGRAM_BOT_TOKEN/i,
  /maps\.googleapis\.com|routes\.googleapis\.com|places\.googleapis\.com/i,
  /www\.onemap\.gov\.sg|ONEMAP_TOKEN|FlightAware|AeroAPI|AEROAPI/i,
]) {
  assertExcludes(
    runtimeSources,
    forbiddenPattern,
    "controlled customer runtime contract must not introduce provider/map/flight call surface",
  );
}

console.log("Controlled Customer Portal + Customer In-App runtime activation contract guard passed");
