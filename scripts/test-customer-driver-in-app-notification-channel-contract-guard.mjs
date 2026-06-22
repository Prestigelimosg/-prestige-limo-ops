import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPagePath = "app/page.tsx";
const persistencePath = "lib/customer-driver-app-notification-persistence.ts";
const adminRoutePath = "app/api/admin-customer-driver-app-notifications/route.ts";
const customerRoutePath = "app/api/customer-app-notifications/route.ts";
const driverRoutePath = "app/api/driver-job/[token]/notifications/route.ts";
const guardScript = "scripts/test-customer-driver-in-app-notification-channel-contract-guard.mjs";

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
  persistence,
  adminRoute,
  customerRoute,
  driverRoute,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
  readFile(customerRoutePath, "utf8"),
  readFile(driverRoutePath, "utf8"),
]);

const inAppSection = sectionBetween(
  ledger,
  "### Customer/Driver In-App Notification Admin-Selected Channel Contract Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for future customer/driver in-app notification channel selection; it does not activate runtime UI, provider sends, credentials, env changes, DB reads/writes, deployment, route/helper behavior, scheduler, fallback, or blast behavior.",
  "Existing foundations to reuse are `POST /api/admin-customer-driver-app-notifications`, `GET/PATCH /api/customer-app-notifications`, `GET/PATCH /api/driver-job/[token]/notifications`, and `lib/customer-driver-app-notification-persistence.ts`.",
  "Future admin choices must stay separated: Send in-app to customer; Send in-app to driver; Send driver details by Email through the gated Resend action; Generate/copy driver details for Telegram manual send; Generate/copy driver details for WhatsApp manual send.",
  "Future In-app buttons must be compact controls aligned in the same Customer Copy action row as Email, Telegram, and WhatsApp/WA choices; no giant cards, no duplicate UI sectors, no duplicate cards, and no duplicate provider-send panels are approved.",
  "Future in-app notification controls must reuse the existing Customer Copy area and existing compact customerCopy preview/copy/edit controls where possible.",
  "Admin must explicitly choose exactly one channel/action for each future in-app message.",
  "No automatic fallback is approved.",
  "No automatic multi-channel blast is approved.",
  "No provider send is approved for in-app notifications; in-app notification is a separate app-visible message path, not Email, Telegram, WhatsApp, SMS, Resend, SMTP, IMAP, or provider delivery.",
  "Customer app notification read remains blocked until secure customer auth/portal read is separately approved; customer-visible in-app notification runtime must not bypass customer auth.",
  "Driver app notification read may use the existing driver job token notification route, but future driver-visible messages must stay scoped to the verified driver job link or safe booking reference.",
  "Future persistence requires separate owner approval, table/policy proof for `customer_driver_app_notification_outbox`, rollback/disable proof, and no secret/env value printing before any staging DB write.",
  "Allowed in-app notification records remain limited to booking reference, delivery surface, notification type/status, priority, safe title/message/context, workflow area, id, and created/updated timestamps.",
  "Driver-details in-app message content must use the approved CUSTOMER BOOKING DETAILS and DRIVER DETAILS payload contract when sending driver details.",
  "Customer/driver in-app messages must exclude pricing, payout, PayNow payout, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/location/photo/calendar/OTS data outside the selected approved lane, live-location streaming payloads, and mock QA/dev archive fields.",
  "This lock does not approve Google Maps, OneMap retry, live location, auth activation, provider sends, env changes, DB writes, Save Booking changes, `/api/admin-saved-bookings` changes, parser changes, pricing/rates/customer_rates changes, driver_payout_rules changes, payout/payment/PDF/billing changes, UI sector/card expansion, or new shims.",
  "This lock adds `scripts/test-customer-driver-in-app-notification-channel-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(inAppSection, phrase, `in-app notification contract phrase: ${phrase}`);
}

for (const forbidden of [
  "In-app notification sending is active now",
  "in-app notification sending is active now",
  "customer auth can be bypassed",
  "driver token scope can be bypassed",
  "Automatic fallback may be used",
  "Automatic multi-channel blast may be used",
  "Provider send may be used for in-app notifications",
  "Email provider send may be used for in-app notifications",
  "Telegram provider send may be used for in-app notifications",
  "WhatsApp provider send may be used for in-app notifications",
  "SMS provider send may be used for in-app notifications",
  "giant card is approved",
  "duplicate UI sector is approved",
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
  "Save Booking internals may be included",
  "/api/admin-saved-bookings internals may be included",
]) {
  assertExcludes(inAppSection, forbidden, "forbidden in-app notification contract phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite in-app notification channel contract registration",
);

for (const fragment of [
  'data-copy-preview="customerCopy"',
  'data-copy-copy-button="customerCopy"',
  'data-copy-edit-button="customerCopy"',
  'data-admin-customer-driver-details-email-review-item="true"',
  'data-admin-customer-driver-details-whatsapp-disabled-send-action="true"',
]) {
  assertIncludes(appPage, fragment, `existing compact Customer Copy control ${fragment}`);
}

for (const fragment of [
  'customerDriverAppNotificationSurfaces = ["customer_app", "driver_app"]',
  '"booking_status"',
  '"driver_status"',
  '"trip_update"',
  '"system_notice"',
  "Customer/driver app notification persistence is not enabled on this server.",
  "Customer app notifications require secure customer account auth before saved notifications can be read.",
  "customer_driver_app_notification_outbox",
  "driver_job_link_id",
  "safe_title",
  "safe_message",
  "safe_context",
]) {
  assertIncludes(persistence, fragment, `customer/driver app notification persistence contract ${fragment}`);
}

for (const source of [adminRoute, customerRoute, driverRoute, persistence]) {
  assertExcludes(
    source,
    /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']|require\(\s*["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']\s*\)|new\s+Resend|sendMail\s*\(|messages\.send|client\.messages\.create|fetch\s*\(/i,
    "in-app route/helper provider-send imports or calls",
  );
}

console.log("Customer/Driver In-App Notification channel contract guard passed");
