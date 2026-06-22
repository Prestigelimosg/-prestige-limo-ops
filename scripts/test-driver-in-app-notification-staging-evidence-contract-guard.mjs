import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-in-app-notification-staging-evidence-contract-guard.mjs";

const persistencePath = "lib/customer-driver-app-notification-persistence.ts";
const adminRoutePath = "app/api/admin-customer-driver-app-notifications/route.ts";
const customerRoutePath = "app/api/customer-app-notifications/route.ts";
const driverRoutePath = "app/api/driver-job/[token]/notifications/route.ts";
const driverPagePath = "app/driver-job/[token]/page.tsx";
const schemaContractPath = "scripts/test-customer-driver-app-notification-schema-contract.mjs";

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
  persistence,
  adminRoute,
  customerRoute,
  driverRoute,
  driverPage,
  schemaContract,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
  readFile(customerRoutePath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(driverPagePath, "utf8"),
  readFile(schemaContractPath, "utf8"),
]);

const evidenceSection = sectionBetween(
  ledger,
  "### Driver In-App Notification Staging Evidence Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved Driver In-App Notification staging evidence pass.",
  "This lock is distinct from the Customer/Driver In-App Notification Admin-Selected Channel Contract Lock; it locks the exact future one-row staging evidence window for driver notifications.",
  "This lock does not activate runtime notification writes, DB reads/writes, auth, sessions, cookies, customer portal, driver portal changes beyond the existing token read path, provider sends, env changes, deployment, UI sectors/cards/buttons, shims, or production activation.",
  "Future Driver In-App Notification staging evidence requires explicit owner approval.",
  "Future evidence requires explicit owner approval for one safe driver notification row write.",
  "Future evidence requires explicit owner approval for a staging target allowlist.",
  "Future evidence requires explicit owner approval for a staging driver-job token or synthetic/staging booking reference.",
  "Future evidence requires explicit owner approval for table/policy/RLS proof.",
  "Future evidence requires explicit owner approval for rollback/cleanup proof.",
  "Future gate/env names are names-only: `PRESTIGE_DRIVER_IN_APP_NOTIFICATIONS_STAGING_WRITE_ENABLED`, `PRESTIGE_DRIVER_IN_APP_NOTIFICATIONS_STAGING_READ_ENABLED`, `PRESTIGE_DRIVER_IN_APP_NOTIFICATIONS_STAGING_TARGET_ALLOWLIST`, and `PRESTIGE_ADMIN_IN_APP_NOTIFICATIONS_WRITE_ENABLED`.",
  "Future evidence must prove the admin/dispatcher write boundary on `POST /api/admin-customer-driver-app-notifications`.",
  "Future evidence must prove the driver token/read boundary on `GET /api/driver-job/[token]/notifications`.",
  "Future evidence must prove exactly one driver notification row is written.",
  "Future evidence must prove the driver page App Updates read path displays the safe notification.",
  "Future read/unread or status transition proof is optional and requires separate owner approval.",
  "Future evidence must prove no external provider send, no Email, no Resend, no Telegram, no WhatsApp, no SMS, no Google Maps call, no OneMap call, and no FlightAware call.",
  "Customer in-app read activation remains blocked until secure customer auth/portal proof is separately approved.",
  "Customer auth and customer portal activation are not part of this driver evidence lane.",
  "Allowed future driver notification fields are booking reference, service type, pickup date, pickup time, pickup location, drop-off location, passenger count if safe for driver, customer-facing flight number if safe for driver, safe title/message/context, workflow area, and driver job status context if already driver-safe.",
  "Forbidden driver notification fields are customer price, pricing, billing, invoice/payment, payment/PDF, payout, PayNow, payout preferences, payout comparisons, `driver_payout_rules`, `customer_rates`, internal/admin/finance notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, live location, and OTS photo/storage unless separately approved.",
  "Rollback/cleanup proof must use exact cleanup of the one staging evidence row by safe event key or staging booking reference.",
  "Rollback/cleanup proof must include post-cleanup zero-row proof, gate closed proof, no follow-up notification row writes, and no provider sends.",
  "Driver-side evidence can proceed separately from customer-side auth/portal read because the existing driver read path is scoped through the verified driver job token route.",
  "Driver In-App Notification staging evidence must remain separate from customer in-app read activation, customer auth/portal activation, Email, Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, live location, driver GPS, OTS/photo/storage, calendar, billing/payment/PDF/invoice, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, parser, Save Booking, `/api/admin-saved-bookings`, UI sector/card/button expansion, shims, and production activation.",
  "This guard adds `scripts/test-driver-in-app-notification-staging-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(evidenceSection, phrase, `Driver in-app staging evidence phrase: ${phrase}`);
}

for (const forbidden of [
  "Driver in-app notification writes are active now",
  "runtime notification writes are approved in this lane",
  "customer notification write is approved in this lane",
  "customer notification read is approved in this lane",
  "external provider sends are approved in this lane",
  "automatic fallback is approved for driver in-app notification",
  "multi-channel blast is approved for driver in-app notification",
  "UI expansion is approved for driver in-app notification",
  "auth activation is approved for driver in-app notification",
  "DB/RLS changes are approved in this lane",
  "production activation is approved for driver in-app notification",
  "one-row-only proof may be skipped",
  "driver token/read boundary proof may be skipped",
  "cleanup proof may be skipped",
]) {
  assertExcludes(evidenceSection, forbidden, "forbidden driver in-app staging evidence phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation driver in-app staging evidence guard registration",
);

for (const fragment of [
  "createCustomerDriverAppNotification",
  "parseCustomerDriverAppNotificationCreatePayload",
  "customer_driver_app_notification_outbox",
  '"customer_app"',
  '"driver_app"',
  "driver_job_link_id",
  "safe_title",
  "safe_message",
  "safe_context",
  "Customer app notifications require secure customer account auth before saved notifications can be read.",
]) {
  assertIncludes(persistence, fragment, `customer/driver notification persistence fragment ${fragment}`);
}

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  "createCustomerDriverAppNotification",
  "loadCustomerDriverAppNotifications",
  "updateCustomerDriverAppNotificationStatus",
  "export async function POST",
  "export async function GET",
  "export async function PATCH",
]) {
  assertIncludes(adminRoute, fragment, `admin notification route fragment ${fragment}`);
}

for (const fragment of [
  "customerAppNotificationsRequireAuthResult",
  "export async function GET",
  "export async function PATCH",
]) {
  assertIncludes(customerRoute, fragment, `customer notification route fragment ${fragment}`);
}

for (const fragment of [
  "loadDriverAppNotificationsForToken",
  "updateDriverAppNotificationStatusForToken",
  "parseCustomerDriverAppNotificationUpdatePayload",
  "export async function GET",
  "export async function PATCH",
]) {
  assertIncludes(driverRoute, fragment, `driver notification route fragment ${fragment}`);
}

for (const fragment of [
  "App Updates",
  'data-driver-job-app-updates="true"',
  'data-driver-job-app-updates-list="true"',
  'data-driver-job-app-update-row="true"',
  'data-driver-job-app-update-message="true"',
  "`/api/driver-job/${encodeURIComponent(token)}/notifications?limit=5&page=1`",
]) {
  assertIncludes(driverPage, fragment, `driver page App Updates fragment ${fragment}`);
}

for (const fragment of [
  "create table if not exists public.customer_driver_app_notification_outbox",
  "delivery_surface in ('customer_app', 'driver_app')",
  "driver access must go through the server-only hashed-token api",
  "customer access must wait for customer auth",
  "without public, anonymous, broad authenticated",
]) {
  assertIncludes(schemaContract, fragment, `notification schema contract fragment ${fragment}`);
}

const routeAndHelperSources = `${adminRoute}\n${customerRoute}\n${driverRoute}\n${persistence}`;

for (const forbiddenPattern of [
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']/i,
  /require\(\s*["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']\s*\)/i,
  /new\s+Resend|sendMail\s*\(|messages\.send|client\.messages\.create/i,
  /api\.telegram\.org|sendLocation|sendMessage|TELEGRAM_BOT_TOKEN/i,
  /maps\.googleapis\.com|routes\.googleapis\.com|places\.googleapis\.com/i,
  /FlightAware|AeroAPI|AEROAPI|ONEMAP_TOKEN/i,
]) {
  assertExcludes(
    routeAndHelperSources,
    forbiddenPattern,
    "driver in-app notification route/helper provider-send or external-call surface",
  );
}

console.log("Driver In-App Notification staging evidence contract guard passed");
