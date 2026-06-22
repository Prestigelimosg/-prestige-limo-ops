import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPagePath = "app/page.tsx";
const customerRoutePath = "app/api/customer-app-notifications/route.ts";
const adminRoutePath = "app/api/admin-customer-driver-app-notifications/route.ts";
const driverRoutePath = "app/api/driver-job/[token]/notifications/route.ts";
const persistencePath = "lib/customer-driver-app-notification-persistence.ts";
const migrationPath =
  "supabase/migrations/202606080001_customer_driver_app_notification_outbox_foundation.sql";
const guardScript =
  "scripts/test-customer-in-app-notification-read-prereq-contract-guard.mjs";

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
  appPage,
  customerRoute,
  adminRoute,
  driverRoute,
  persistence,
  migration,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(customerRoutePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(migrationPath, "utf8"),
]);

const prereqSection = sectionBetween(
  ledger,
  "### Customer In-App Notification Read Prerequisite Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for the prerequisites required before Customer In-App Notification runtime, customer read, or a customer in-app button can be considered.",
  "Customer In-App Notification read/runtime remains blocked.",
  "`GET/PATCH /api/customer-app-notifications` must stay fail-closed through `customerAppNotificationsRequireAuthResult` until secure customer auth/portal proof is separately approved.",
  "The customer route must not parse request bodies, read env, create Supabase clients, set cookies, create sessions, create tokens, read notification rows, write notification rows, or expose notification records while this lock is active.",
  "A customer in-app button must not be added before customer read proof.",
  "Customer notification writes for `customer_app` must not be enabled before customer read/isolation proof.",
  "Future proof must include customer auth/session proof, customer portal/read path proof, `customer_driver_app_notification_outbox` table/RLS proof, customer row isolation proof, customer-safe booking projection proof, `customer_access_accounts` and audit proof if applicable, and rollback/disable proof.",
  "Customer-visible in-app payloads must remain limited to safe customer-facing notification title/message/context and safe booking context approved by a later customer-read lane.",
  "Customer-visible in-app payloads must exclude pricing, billing, invoice/payment/PDF, payout, PayNow, payout preferences/comparisons, `driver_payout_rules`, `customer_rates`, internal/admin/finance notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, live location unless separately approved, and OTS/photo/storage unless separately approved.",
  "Driver in-app completion and the Driver Dispatch `Send Driver In-App` button do not unlock customer in-app runtime or customer in-app reads.",
  "Provider sends remain separate from in-app notifications; this lock does not approve Email, Resend, Telegram, WhatsApp, SMS, SMTP, IMAP, push, fallback, blast, scheduler, polling, or retry behavior.",
  "Google Maps evidence completion does not unlock customer in-app runtime, customer in-app reads, customer in-app writes, or customer in-app buttons.",
  "OneMap remains parked after safe provider failure and must not be retried by this lane.",
  "This lane does not activate auth, portal behavior, DB reads/writes, notification row writes, provider sends, UI, env changes, deploy, or production.",
  "This guard adds `scripts/test-customer-in-app-notification-read-prereq-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(prereqSection, phrase, `customer in-app read prereq phrase: ${phrase}`);
}

for (const forbidden of [
  "Customer In-App Notification read/runtime is active",
  "customer in-app button is approved now",
  "customer auth can be bypassed",
  "customer portal can be bypassed",
  "customer notification writes are enabled now",
  "driver in-app completion unlocks customer in-app",
  "Google Maps evidence unlocks customer in-app",
  "provider send is approved for customer in-app",
  "automatic fallback is approved for customer in-app",
  "multi-channel blast is approved for customer in-app",
]) {
  assertExcludes(prereqSection, forbidden, "forbidden customer in-app prereq phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation customer in-app read prereq guard registration",
);

for (const fragment of [
  "customerAppNotificationsRequireAuthResult",
  "safeCustomerAuthRequiredResponse",
  "export async function GET()",
  "export async function PATCH()",
]) {
  assertIncludes(customerRoute, fragment, `customer route fail-closed fragment ${fragment}`);
}

for (const fragment of [
  "process.env",
  "createClient",
  ".from(",
  "loadCustomerDriverAppNotifications",
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
  "customer_driver_app_notification_outbox",
  "safe_title",
  "safe_message",
  "safe_context",
  "toSafeRecord",
]) {
  assertIncludes(persistence, fragment, `persistence prereq fragment ${fragment}`);
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

for (const fragment of [
  'deliverySurface: "customer_app"',
  'delivery_surface: "customer_app"',
  "Send Customer In-App",
  "data-admin-customer-in-app",
  "customer-in-app-send",
]) {
  assertExcludes(appPage, fragment, "customer in-app button or runtime app wiring");
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
    "customer in-app prereq route/helper provider or map/flight call surface",
  );
}

console.log("Customer In-App Notification read prerequisite contract guard passed");
