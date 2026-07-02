import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docPath = "docs/customer-copy-multi-channel-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPath = "app/page.tsx";
const noLiveGuardPath = "scripts/test-customer-copy-multi-channel-no-live-guard.mjs";
const emailSendActionRoutePath =
  "app/api/admin-customer-driver-details-email-send-action/route.ts";
const whatsappDisabledRoutePath =
  "app/api/admin-whatsapp-customer-driver-details-send-disabled-setup/route.ts";
const smsDisabledRoutePath = "app/api/admin-sms-customer-driver-details-send-disabled-setup/route.ts";
const guardScript = "scripts/test-customer-copy-multi-channel-existing-workflow-lock.mjs";

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

function assertNotMatches(source, pattern, label) {
  assert.doesNotMatch(source, pattern, `${label} must not match ${pattern}.`);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n## ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function extractBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);

  assert.notEqual(start, -1, `Missing ${label} start marker.`);
  assert.notEqual(end, -1, `Missing ${label} end marker.`);

  return source.slice(start, end);
}

const [
  doc,
  ledger,
  docsIndex,
  preactivationSuite,
  appPage,
  noLiveGuard,
  emailSendActionRoute,
  whatsappDisabledRoute,
  smsDisabledRoute,
] = await Promise.all([
  readFile(docPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(noLiveGuardPath, "utf8"),
  readFile(emailSendActionRoutePath, "utf8"),
  readFile(whatsappDisabledRoutePath, "utf8"),
  readFile(smsDisabledRoutePath, "utf8"),
]);

for (const fragment of [
  "# Customer Copy Multi-Channel Existing Workflow Lock",
  "Email now uses the existing approved gated POST route `POST /api/admin-customer-driver-details-email-send-action` from the same compact row.",
  "WhatsApp and SMS remain parked on setup-only/no-op GET paths: `GET /api/admin-whatsapp-customer-driver-details-send-disabled-setup` and `GET /api/admin-sms-customer-driver-details-send-disabled-setup`.",
  "Customer In-App and Driver In-App remain the existing admin-selected app notification path through `POST /api/admin-customer-driver-app-notifications`.",
  "Telegram remains the existing internal-admin alert send path only: `POST /api/admin-telegram-internal-admin-alert-send`.",
  "`scripts/test-customer-copy-multi-channel-no-live-guard.mjs` owns the parked SMS/WhatsApp no-live guard and the Email UI-to-gated-route source guard.",
  "Email may be triggered only by explicit admin click through `POST /api/admin-customer-driver-details-email-send-action`, using the gated Resend helper and allowlist safeguards.",
  "SMS and WhatsApp remain parked setup-only/no-op for now.",
  "Activating SMS or WhatsApp sends, customer/driver Telegram sends, automatic fallback, automatic multi-channel blast, batch send, scheduler, polling, retry automation, payment/PDF/pricing/payout/auth/location/photo/calendar behavior, parser-learning behavior, or broad DB writes.",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.",
]) {
  assertIncludes(doc, fragment, `customer copy lock doc fragment ${fragment}`);
}

const customerCopySection = extractBetween(
  appPage,
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-dispatch-workflow-step="driver-dispatch-copy"',
  "Customer Copy section",
);
const appOutsideCustomerCopy = appPage.replace(customerCopySection, "");

for (const fragment of [
  'const adminCustomerDriverDetailsEmailReviewItemApiPath =\n  "/api/admin-customer-driver-details-email-review-item-setup";',
  'const adminCustomerDriverDetailsEmailSendActionApiPath =\n  "/api/admin-customer-driver-details-email-send-action";',
  'const adminWhatsAppCustomerDriverDetailsSendDisabledApiPath =\n  "/api/admin-whatsapp-customer-driver-details-send-disabled-setup";',
  'const adminSmsCustomerDriverDetailsSendDisabledApiPath =\n  "/api/admin-sms-customer-driver-details-send-disabled-setup";',
  'const adminEmailActivationPreflightApiPath =\n  "/api/admin-email-activation-preflight-setup";',
  'const adminTelegramInternalAdminAlertSendApiPath =\n  "/api/admin-telegram-internal-admin-alert-send";',
  'const adminCustomerDriverAppNotificationsApiPath =\n  "/api/admin-customer-driver-app-notifications";',
  "async function sendAdminCustomerDriverDetailsEmail()",
  "async function checkAdminCustomerDriverDetailsMessageDisabledSend(",
  "async function sendAdminCustomerDriverDetailsCustomerInAppNotification()",
  "async function sendAdminCustomerDriverDetailsDriverInAppNotification()",
  "const adminCustomerDriverDetailsMultiChannelDisabledStatusText =",
  "Email uses the gated email route. WhatsApp and SMS are parked setup-only/no-live.",
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-copy-edit-button="customerCopy"',
  'data-copy-copy-button="customerCopy"',
  'data-copy-preview="customerCopy"',
  'data-customer-live-location-helper="true"',
  'data-admin-customer-driver-details-email-review-item="true"',
  'data-admin-customer-driver-details-email-disabled-send-action="true"',
  'data-admin-customer-driver-details-whatsapp-disabled-send-action="true"',
  'data-admin-customer-driver-details-sms-disabled-send-action="true"',
  'data-admin-customer-driver-details-customer-in-app-send-action="true"',
  'data-admin-email-activation-preflight-status="true"',
  'onClick={sendAdminCustomerDriverDetailsEmail}',
  'onClick={() => checkAdminCustomerDriverDetailsMessageDisabledSend("whatsapp")}',
  'onClick={() => checkAdminCustomerDriverDetailsMessageDisabledSend("sms")}',
  "SMS/WA off",
  "Email gate off",
  "Send In-App",
]) {
  assertIncludes(appPage, fragment, `existing app Customer Copy fragment ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-dispatch-workflow-step="customer-whatsapp-copy"', 1],
  ['data-copy-edit-button="customerCopy"', 1],
  ['data-copy-copy-button="customerCopy"', 1],
  ['data-copy-preview="customerCopy"', 1],
  ['data-customer-live-location-helper="true"', 1],
  ['data-admin-customer-driver-details-email-review-item="true"', 1],
  ['data-admin-customer-driver-details-email-disabled-send-action="true"', 1],
  ['data-admin-customer-driver-details-whatsapp-disabled-send-action="true"', 1],
  ['data-admin-customer-driver-details-sms-disabled-send-action="true"', 1],
  ['data-admin-customer-driver-details-customer-in-app-send-action="true"', 1],
  ['data-admin-email-activation-preflight-status="true"', 1],
]) {
  assert.equal(countOccurrences(appPage, fragment), expectedCount);
  assert.equal(countOccurrences(customerCopySection, fragment), expectedCount);
}

for (const fragment of [
  'data-admin-customer-driver-details-email-review-item="true"',
  'data-admin-customer-driver-details-email-disabled-send-action="true"',
  'data-admin-customer-driver-details-whatsapp-disabled-send-action="true"',
  'data-admin-customer-driver-details-sms-disabled-send-action="true"',
  'data-admin-customer-driver-details-customer-in-app-send-action="true"',
  'data-admin-email-activation-preflight-status="true"',
]) {
  assertExcludes(appOutsideCustomerCopy, fragment, `Customer Copy fragment outside section ${fragment}`);
}

assertIncludes(emailSendActionRoute, "export async function POST", "email send action route POST");
assertIncludes(
  emailSendActionRoute,
  'allowServerSessionRoleMethodsWithoutRequestToken: ["POST"]',
  "email send action dashboard server-session boundary",
);
assertExcludes(emailSendActionRoute, "export async function GET", "email send action route GET");

for (const [label, routeSource] of [
  ["WhatsApp disabled-send route", whatsappDisabledRoute],
  ["SMS disabled-send route", smsDisabledRoute],
]) {
  assertIncludes(routeSource, "export async function GET", `${label} GET`);
  assertNotMatches(routeSource, /export async function (POST|PUT|PATCH|DELETE)/, `${label} write verbs`);
  assertIncludes(routeSource, "reason", `${label} disabled reason`);
  assertIncludes(routeSource, "status", `${label} blocked status`);
  assertIncludes(routeSource, "external_send: false", `${label} external_send false`);
  assertIncludes(routeSource, "sendingEnabled: false", `${label} sendingEnabled false`);
}

for (const fragment of [
  "Email gated send must include",
  "Customer Copy WhatsApp/SMS disabled-send handlers must use GET.",
  "Customer Copy WhatsApp disabled-send API",
  "Customer Copy SMS disabled-send API",
  "Customer Copy multi-channel no-live guard passed",
]) {
  assertIncludes(noLiveGuard, fragment, `Customer Copy no-live guard fragment ${fragment}`);
}

const ledgerSection = sectionBetween(ledger, "## Customer Copy Multi-Channel Existing Workflow Lock");

for (const fragment of [
  "The existing admin Customer Copy Email/WhatsApp/SMS customer driver-details workflow is locked by `docs/customer-copy-multi-channel-existing-workflow-lock.md`.",
  "Email now uses the existing approved gated POST route `POST /api/admin-customer-driver-details-email-send-action` from the same compact row.",
  "WhatsApp and SMS remain parked on setup-only/no-op GET paths.",
  "Customer In-App and Driver In-App remain explicit admin-selected in-app notification actions through `POST /api/admin-customer-driver-app-notifications`.",
  "Telegram remains the existing internal-admin alert send path only through `POST /api/admin-telegram-internal-admin-alert-send`.",
  "Do not add duplicate Email, WhatsApp, SMS, customer-message, driver-notification, provider-send, or customer driver-details workflow sectors, buttons, cards, routes, helpers, or shims.",
  "SMS and WhatsApp sends remain parked unless separately approved.",
  "Customer/driver Telegram sends remain parked unless separately approved.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger Customer Copy lock fragment ${fragment}`);
}

for (const fragment of [
  "[Customer Copy Multi-Channel Existing Workflow Lock](customer-copy-multi-channel-existing-workflow-lock.md)",
  "existing admin Customer Copy Email/WhatsApp/SMS customer driver-details review row and no-duplicate rule",
]) {
  assertIncludes(docsIndex, fragment, `docs index Customer Copy lock fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite Customer Copy lock registration");

for (const [label, text] of [
  ["doc", doc],
  ["ledgerSection", ledgerSection],
  ["docsIndex", docsIndex],
]) {
  assertNotMatches(text, /```(?:bash|sql)/i, `${label} runnable shell or SQL block`);
  assertNotMatches(
    text,
    /SUPABASE_URL\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=|SESSION_TOKEN\s*=|https:\/\/[^\s)`]+\.supabase\.co|eyJ[A-Za-z0-9_-]{20,}|kvvsg[a-z0-9]+hxatm/i,
    `${label} secret leak`,
  );
}

console.log("Customer Copy multi-channel existing workflow lock passed");
