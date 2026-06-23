import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const customerRoutePath = "app/api/customer-app-notifications/route.ts";
const adminRoutePath = "app/api/admin-customer-driver-app-notifications/route.ts";
const driverRoutePath = "app/api/driver-job/[token]/notifications/route.ts";
const persistencePath = "lib/customer-driver-app-notification-persistence.ts";
const migrationPath =
  "supabase/migrations/202606080001_customer_driver_app_notification_outbox_foundation.sql";
const guardScript =
  "scripts/test-customer-in-app-notification-read-table-rls-evidence-contract-guard.mjs";

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
  customerRoute,
  adminRoute,
  driverRoute,
  persistence,
  migration,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(customerRoutePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(migrationPath, "utf8"),
]);

const evidenceSection = sectionBetween(
  ledger,
  "### Customer In-App Notification Read Table/RLS Evidence Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved Customer In-App Notification read/table-RLS evidence pass.",
  "Customer In-App Notification runtime/read and customer in-app button remain blocked.",
  "`GET/PATCH /api/customer-app-notifications` must stay fail-closed through `customerAppNotificationsRequireAuthResult` by default.",
  "The only allowed customer notification read path is the disabled-by-default staging evidence path behind `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE`, the existing saved-bookings customer session boundary, and server-side Supabase credentials read only after that gate passes.",
  "`PATCH /api/customer-app-notifications` remains fail-closed and cannot read or write notification rows.",
  "Future evidence requires table/RLS proof for `public.customer_driver_app_notification_outbox` before any customer-visible notification read can be considered.",
  "Future evidence may create exactly one fake staging `customer_app` notification row and must clean it up.",
  "Future evidence must prove anonymous, missing-session, wrong-session, wrong-customer, cross-origin, and wrong-referer paths are blocked.",
  "Future evidence must prove customer row isolation so the fake customer sees only the fake `customer_app` notification row and cannot see another customer/account row.",
  "Future evidence must prove safe audit/access logging without printing row IDs, auth user IDs, customer IDs, cookies, session tokens, JWTs, API keys, DB URLs, env values, or secrets.",
  "Future evidence must prove cleanup/zero-row rollback and closed-gate/no-read behavior after the evidence window.",
  "Customer-safe notification payload fields remain limited to delivery surface, notification type/status, priority, safe title, safe message, safe context, workflow area, safe booking reference/context, and created/updated timestamps.",
  "Customer-visible in-app notification payloads must exclude pricing, payout, PayNow, payout preferences/comparisons, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, provider-send payloads, live-location/driver GPS unless separately approved, and OTS/photo/storage unless separately approved.",
  "Customer Portal saved-bookings evidence completion does not unlock customer in-app notification runtime, `customer_app` notification writes, or a customer in-app button.",
  "Driver in-app notification evidence/runtime and the Driver Dispatch `Send Driver In-App` button do not unlock customer in-app notification runtime, `customer_app` notification writes, or a customer in-app button.",
  "No provider sends, Email/Resend, Telegram, WhatsApp, SMS, push, Google Maps, OneMap, FlightAware, live location, driver GPS, OTS/photo/storage, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, parser, Save Booking, `/api/admin-saved-bookings`, shim, env change, deploy, production activation, or UI button is approved by this lock.",
  "This guard adds `scripts/test-customer-in-app-notification-read-table-rls-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(evidenceSection, phrase, `customer in-app read/table-RLS phrase: ${phrase}`);
}

for (const forbidden of [
  "customer in-app button is approved now",
  "customer_app notification writes are enabled now",
  "customer notification read is live now",
  "customer auth can be bypassed",
  "wrong-customer reads are allowed",
  "cleanup may be skipped",
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
  "provider send may be used",
  "live location may be included now",
  "OTS/photo may be included now",
]) {
  assertExcludes(evidenceSection, forbidden, "forbidden customer in-app read/table-RLS phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation customer in-app read/table-RLS evidence guard registration",
);

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
  assertExcludes(customerRoute, fragment, "customer in-app route activated read/write/session surface");
}

for (const fragment of [
  'customerDriverAppNotificationSurfaces = ["customer_app", "driver_app"]',
  "Customer app notifications require secure customer account auth before saved notifications can be read.",
  "customerAppNotificationsRequireAuthResult",
  "readCustomerAppNotificationsForStagingEvidence",
  "resolveCustomerInAppNotificationReadEvidenceGate",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE",
  "loadCustomerAppNotificationsForStagingReference",
  "customer_driver_app_notification_outbox",
  "delivery_surface",
  "safe_title",
  "safe_message",
  "safe_context",
  "toSafeRecord",
]) {
  assertIncludes(persistence, fragment, `persistence read/table-RLS fragment ${fragment}`);
}

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  "createCustomerDriverAppNotification",
  "loadCustomerDriverAppNotifications",
  "updateCustomerDriverAppNotificationStatus",
]) {
  assertIncludes(adminRoute, fragment, `admin route remains separate fragment ${fragment}`);
}

for (const fragment of [
  "loadDriverAppNotificationsForToken",
  "updateDriverAppNotificationStatusForToken",
  'delivery_surface: "driver_app"',
]) {
  assertIncludes(driverRoute, fragment, `driver route remains separate fragment ${fragment}`);
}

for (const fragment of [
  "create table if not exists public.customer_driver_app_notification_outbox",
  "delivery_surface in ('customer_app', 'driver_app')",
  "alter table public.customer_driver_app_notification_outbox enable row level security",
  "Customer access must wait for customer auth.",
  "Driver access must go through the server-only hashed-token API.",
]) {
  assertIncludes(migration, fragment, `notification table/RLS foundation fragment ${fragment}`);
}

const routeAndHelperSources = `${customerRoute}\n${adminRoute}\n${driverRoute}\n${persistence}`;

for (const forbiddenPattern of [
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']/i,
  /require\(\s*["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']\s*\)/i,
  /new\s+Resend|sendMail\s*\(|messages\.send|client\.messages\.create/i,
  /api\.telegram\.org|sendLocation|sendMessage|TELEGRAM_BOT_TOKEN/i,
  /maps\.googleapis\.com|routes\.googleapis\.com|places\.googleapis\.com/i,
  /www\.onemap\.gov\.sg|ONEMAP_TOKEN|FlightAware|AeroAPI|AEROAPI/i,
]) {
  assertExcludes(
    routeAndHelperSources,
    forbiddenPattern,
    "customer in-app read/table-RLS route/helper provider or map/flight call surface",
  );
}

console.log("Customer In-App Notification read/table-RLS evidence contract guard passed");
