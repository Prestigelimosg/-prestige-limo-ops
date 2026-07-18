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
  "Customer app link copy may be triggered only by explicit admin click through the existing `POST /api/admin-customer-portal-access-links` route, using the saved booking `customer_id`/customer account reference only; it must not fall back to passenger, booker, company, or display names as the account reference.",
  "WhatsApp and SMS remain parked on setup-only/no-op GET paths: `GET /api/admin-whatsapp-customer-driver-details-send-disabled-setup` and `GET /api/admin-sms-customer-driver-details-send-disabled-setup`.",
  "Customer In-App and Driver In-App remain the existing admin-selected app notification path through `POST /api/admin-customer-driver-app-notifications`.",
  "Telegram provider sending remains the existing internal-admin alert send path only: `POST /api/admin-telegram-internal-admin-alert-send`.",
  "Customer and driver Telegram controls are admin manual-copy only; they write already-visible safe copy to the clipboard and keep `external_send=false`.",
  "`scripts/test-customer-copy-multi-channel-no-live-guard.mjs` owns the parked SMS/WhatsApp no-live guard and the Email UI-to-gated-route source guard.",
  "Email may be triggered only by explicit admin click through `POST /api/admin-customer-driver-details-email-send-action`, using the gated Resend helper and allowlist safeguards.",
  "A closed gate produces no send-action POST from the browser.",
  "Resend retains that protection for 24 hours; changed customer booking or driver details produce a different key.",
  "This same-page lock and the provider key are duplicate-click safeguards, not permanent send history.",
  "The existing send-audit payload foundation remains setup-only with `auditWriteEnabled: false`",
  "Customer/driver Telegram may only be prepared through the existing admin manual clipboard controls.",
  "SMS and WhatsApp remain parked setup-only/no-op for now.",
  "Activating SMS or WhatsApp sends, customer/driver Telegram provider sends, automatic fallback, automatic multi-channel blast, batch send, scheduler, polling, retry automation, payment/PDF/pricing/payout/auth/location/photo/calendar behavior, parser-learning behavior, or broad DB writes.",
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
const customerPortalLinkCopyHandler = extractBetween(
  appPage,
  "async function createCustomerDriverDetailsPortalLink()",
  "async function copyManualTelegramMessage(",
  "customer driver details portal link copy handler",
);
const appOutsideCustomerCopy = appPage.replace(customerCopySection, "");

for (const fragment of [
  'const adminCustomerDriverDetailsEmailReviewItemApiPath =\n  "/api/admin-customer-driver-details-email-review-item-setup";',
  'const adminCustomerDriverDetailsEmailSendActionApiPath =\n  "/api/admin-customer-driver-details-email-send-action";',
  'const adminCustomerPortalAccessLinksApiPath = "/api/admin-customer-portal-access-links";',
  "const customerDriverDetailsPortalAccountReference =",
  "cleanReferenceText(appliedAdminBookingSnapshot?.customer_id)",
  "cleanReferenceText(dispatchReleaseLoadedBookingRecord?.customer_id)",
  "cleanReferenceText(customerDriverDetailsPortalLastSavedRecord?.customer_id)",
  'const adminWhatsAppCustomerDriverDetailsSendDisabledApiPath =\n  "/api/admin-whatsapp-customer-driver-details-send-disabled-setup";',
  'const adminSmsCustomerDriverDetailsSendDisabledApiPath =\n  "/api/admin-sms-customer-driver-details-send-disabled-setup";',
  'const adminEmailActivationPreflightApiPath =\n  "/api/admin-email-activation-preflight-setup";',
  'const adminCustomerDriverAppNotificationsApiPath =\n  "/api/admin-customer-driver-app-notifications";',
  "async function sendAdminCustomerDriverDetailsEmail()",
  "async function checkAdminCustomerDriverDetailsMessageDisabledSend(",
  "async function copyCustomerDriverDetailsWithCustomerAppLink()",
  "async function copyManualTelegramMessage(",
  "async function sendAdminCustomerDriverDetailsCustomerInAppNotification()",
  "const adminCustomerDriverDetailsMultiChannelDisabledStatusText =",
  "Email uses the gated email route. WhatsApp and SMS are parked setup-only/no-live.",
  "driverDetailsEmailSendGateOpen",
  "!adminCustomerDriverDetailsEmailSent",
  'data-admin-customer-driver-details-email-send-gate-open=',
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-copy-edit-button="customerCopy"',
  'data-copy-copy-button="customerCopy"',
  'data-admin-customer-driver-details-copy-with-portal-link="true"',
  'data-admin-customer-driver-details-copy-with-portal-link-external-send="false"',
  'data-admin-customer-driver-details-copy-with-portal-link-no-provider-send="true"',
  'data-copy-preview="customerCopy"',
  'data-customer-live-location-helper="true"',
  'data-admin-customer-driver-details-email-review-item="true"',
  'data-admin-customer-driver-details-email-disabled-send-action="true"',
  'data-admin-customer-driver-details-whatsapp-disabled-send-action="true"',
  'data-admin-customer-driver-details-sms-disabled-send-action="true"',
  'data-admin-customer-driver-details-telegram-manual-copy-action="true"',
  'data-admin-customer-driver-details-telegram-manual-copy-status="true"',
  'data-admin-customer-driver-details-customer-in-app-send-action="true"',
  'data-admin-customer-driver-details-manual-channel-note="true"',
  'data-admin-email-activation-preflight-status="true"',
  'onClick={sendAdminCustomerDriverDetailsEmail}',
  'onClick={() => checkAdminCustomerDriverDetailsMessageDisabledSend("whatsapp")}',
  'onClick={() => checkAdminCustomerDriverDetailsMessageDisabledSend("sms")}',
  'onClick={() => copyManualTelegramMessage("customerDriverDetails")}',
  'data-driver-job-link-telegram-manual-copy-button="true"',
  'onClick={() => copyManualTelegramMessage("driverJobLink")}',
  "WhatsApp/SMS are off in-app. Use Copy, then send manually outside the app.",
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
  ['data-admin-customer-driver-details-copy-with-portal-link="true"', 1],
  ['data-admin-customer-driver-details-copy-with-portal-link-external-send="false"', 1],
  ['data-admin-customer-driver-details-copy-with-portal-link-no-provider-send="true"', 1],
  ['data-copy-preview="customerCopy"', 1],
  ['data-customer-live-location-helper="true"', 1],
  ['data-admin-customer-driver-details-email-review-item="true"', 1],
  ['data-admin-customer-driver-details-email-disabled-send-action="true"', 1],
  ['data-admin-customer-driver-details-email-send-gate-open=', 1],
  ['data-admin-customer-driver-details-whatsapp-disabled-send-action="true"', 1],
  ['data-admin-customer-driver-details-sms-disabled-send-action="true"', 1],
  ['data-admin-customer-driver-details-telegram-manual-copy-action="true"', 1],
  ['data-admin-customer-driver-details-telegram-manual-copy-status="true"', 1],
  ['data-admin-customer-driver-details-customer-in-app-send-action="true"', 1],
  ['data-admin-customer-driver-details-manual-channel-note="true"', 1],
  ['data-admin-email-activation-preflight-status="true"', 1],
]) {
  assert.equal(countOccurrences(appPage, fragment), expectedCount);
  assert.equal(countOccurrences(customerCopySection, fragment), expectedCount);
}

for (const fragment of [
  'data-admin-customer-driver-details-email-review-item="true"',
  'data-admin-customer-driver-details-copy-with-portal-link="true"',
  'data-admin-customer-driver-details-email-disabled-send-action="true"',
  'data-admin-customer-driver-details-whatsapp-disabled-send-action="true"',
  'data-admin-customer-driver-details-sms-disabled-send-action="true"',
  'data-admin-customer-driver-details-telegram-manual-copy-action="true"',
  'data-admin-customer-driver-details-telegram-manual-copy-status="true"',
  'data-admin-customer-driver-details-customer-in-app-send-action="true"',
  'data-admin-customer-driver-details-manual-channel-note="true"',
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
  "const customerAccountReference = customerDriverDetailsPortalAccountReference;",
  "if (!customerDriverDetailsPortalLinkCopyReady)",
  "fetch(adminCustomerPortalAccessLinksApiPath",
  "customerAccountReference,",
  "safeDisplayLabel: customerDriverDetailsPortalSafeDisplayLabel || customerAccountReference",
  '"x-prestige-admin-purpose": adminLegacyDataPurpose',
  "navigator.clipboard.writeText(",
  "customerDriverDetailsWithPortalLinkText(messageText, portalUrl, booking.bookingType)",
  "portalUrl,",
  "Paste/send manually; no provider message was sent.",
  "external_send: false",
  "noProviderSend: true",
]) {
  assertIncludes(customerPortalLinkCopyHandler, fragment, `customer app link copy handler fragment ${fragment}`);
}

for (const forbidden of [
  /copyManualTelegramMessage\s*\(/,
  /adminTelegram/i,
  /telegram\.org/i,
  /(?:^|[/:.])t\.me(?:[/:?]|$)/i,
  /chat_id/i,
  /sendMessage/i,
  /sendAdminCustomerDriverDetailsEmail\s*\(/,
  /adminWhatsAppCustomerDriverDetailsSendDisabledApiPath/,
  /adminSmsCustomerDriverDetailsSendDisabledApiPath/,
]) {
  assertExcludes(customerPortalLinkCopyHandler, forbidden, "customer app link copy handler");
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
  "Copy + App Link remains explicit admin-selected manual clipboard preparation through the existing `POST /api/admin-customer-portal-access-links` route; it requires the saved booking `customer_id` / customer account reference and must not fall back to passenger, booker, company, or display names.",
  "Telegram provider sending remains the existing internal-admin alert send path only through `POST /api/admin-telegram-internal-admin-alert-send`.",
  "Customer/driver Telegram controls are manual clipboard-only and keep `external_send=false`, no provider call, no chat ID, no `t.me` URL, no DB write, and no notification write.",
  "Do not add duplicate Email, WhatsApp, SMS, Telegram, customer-message, driver-notification, provider-send, or customer driver-details workflow sectors, buttons, cards, routes, helpers, or shims.",
  "SMS and WhatsApp sends remain parked unless separately approved.",
  "Customer/driver Telegram provider sends remain parked unless separately approved.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger Customer Copy lock fragment ${fragment}`);
}

for (const fragment of [
  "[Customer Copy Multi-Channel Existing Workflow Lock](customer-copy-multi-channel-existing-workflow-lock.md)",
  "existing admin Customer Copy Email/WhatsApp/SMS customer driver-details review row, explicit Copy + App Link action, admin manual Telegram clipboard controls, and no-duplicate rule",
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
