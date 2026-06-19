import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docPath = "docs/customer-copy-multi-channel-existing-workflow-lock.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const appPath = "app/page.tsx";
const appSmokePath = "scripts/test-app-smoke-browser.mjs";
const bookingUiBrowserPath = "scripts/test-booking-ui-browser.mjs";
const mobileUsabilityBrowserPath = "scripts/test-mobile-usability-browser.mjs";
const noLiveGuardPath = "scripts/test-customer-copy-multi-channel-no-live-guard.mjs";
const emailDisabledRoutePath =
  "app/api/admin-customer-driver-details-email-send-disabled-setup/route.ts";
const whatsappDisabledRoutePath =
  "app/api/admin-whatsapp-customer-driver-details-send-disabled-setup/route.ts";
const smsDisabledRoutePath = "app/api/admin-sms-customer-driver-details-send-disabled-setup/route.ts";
const guardScript = "scripts/test-customer-copy-multi-channel-existing-workflow-lock.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must not include ${fragment}.`);
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
  appSmoke,
  bookingUiBrowser,
  mobileUsabilityBrowser,
  noLiveGuard,
  emailDisabledRoute,
  whatsappDisabledRoute,
  smsDisabledRoute,
] = await Promise.all([
  readFile(docPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(appSmokePath, "utf8"),
  readFile(bookingUiBrowserPath, "utf8"),
  readFile(mobileUsabilityBrowserPath, "utf8"),
  readFile(noLiveGuardPath, "utf8"),
  readFile(emailDisabledRoutePath, "utf8"),
  readFile(whatsappDisabledRoutePath, "utf8"),
  readFile(smsDisabledRoutePath, "utf8"),
]);

for (const fragment of [
  "# Customer Copy Multi-Channel Existing Workflow Lock",
  "This document is docs/test-only.",
  "It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, customer/driver portal changes, or new shims.",
  "The admin Customer Copy Email/WhatsApp/SMS customer driver-details workflow already exists in the current app. Do not rebuild it as duplicate Email, WhatsApp, or SMS workflow sectors.",
  "`app/page.tsx` owns the existing Customer Copy section at `data-dispatch-workflow-step=\"customer-whatsapp-copy\"`.",
  "`app/page.tsx` owns the existing Customer Copy text edit/copy controls at `data-copy-edit-button=\"customerCopy\"`, `data-copy-copy-button=\"customerCopy\"`, and `data-copy-preview=\"customerCopy\"`.",
  "`app/page.tsx` owns the existing customer live-location helper inside Customer Copy at `data-customer-live-location-helper`.",
  "`app/page.tsx` owns the existing compact customer driver-details Email review item at `data-admin-customer-driver-details-email-review-item`.",
  "`app/page.tsx` owns the existing disabled/no-op Email, WhatsApp, and SMS review buttons at `data-admin-customer-driver-details-email-disabled-send-action`, `data-admin-customer-driver-details-whatsapp-disabled-send-action`, and `data-admin-customer-driver-details-sms-disabled-send-action`.",
  "`app/page.tsx` owns the existing Email activation preflight status at `data-admin-email-activation-preflight-status`.",
  "The existing disabled-send setup paths are `GET /api/admin-customer-driver-details-email-send-disabled-setup`, `GET /api/admin-whatsapp-customer-driver-details-send-disabled-setup`, and `GET /api/admin-sms-customer-driver-details-send-disabled-setup`.",
  "These surfaces are admin-only setup/review controls. They do not send Email, WhatsApp, SMS, Telegram, push, customer messages, or driver notifications.",
  "`scripts/test-customer-copy-multi-channel-no-live-guard.mjs` owns the no-live/provider/env/DB-write guard for the existing Customer Copy Email/WhatsApp/SMS review controls.",
  "`scripts/test-app-smoke-browser.mjs` covers the compact Customer Copy email review row and setup-only disabled send state.",
  "`scripts/test-booking-ui-browser.mjs` covers the Customer Copy driver-details review item, saved-booking review-item GET, disabled Email send no-op GET, copy output protections, and no private/finance/internal leakage.",
  "`scripts/test-mobile-usability-browser.mjs` covers the Customer Copy surface in mobile layout checks.",
  "Future work must reuse the existing compact Customer Copy multi-channel row instead of adding another Email, WhatsApp, SMS, provider-send, customer-message, or driver-notification UI sector, card, route, helper, or shim for the same purpose.",
  "Allowed future work, only after explicit owner approval, must stay compact and colocated with the existing Customer Copy controls.",
  "Adding duplicate Email, WhatsApp, SMS, customer-message, driver-notification, provider-send, or customer driver-details workflow sectors, buttons, cards, routes, helpers, or shims.",
  "Activating live Email, WhatsApp, SMS, Telegram, push, provider/env reads, provider sends, recipient sends, notification sends, customer messages, driver notifications, payment/PDF/pricing/payout/auth/location/photo/calendar behavior, parser-learning behavior, or DB writes.",
  "Moving Customer Copy multi-channel controls into customer or driver surfaces.",
  "Exposing customer price, driver payout, PayNow payout details, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, mock QA/dev archive, raw provider payloads, tokens, or secrets.",
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
  'const adminCustomerDriverDetailsEmailSendDisabledApiPath =\n  "/api/admin-customer-driver-details-email-send-disabled-setup";',
  'const adminWhatsAppCustomerDriverDetailsSendDisabledApiPath =\n  "/api/admin-whatsapp-customer-driver-details-send-disabled-setup";',
  'const adminSmsCustomerDriverDetailsSendDisabledApiPath =\n  "/api/admin-sms-customer-driver-details-send-disabled-setup";',
  'const adminEmailActivationPreflightApiPath =\n  "/api/admin-email-activation-preflight-setup";',
  "async function checkAdminCustomerDriverDetailsEmailDisabledSend()",
  "async function checkAdminCustomerDriverDetailsMessageDisabledSend(",
  "const adminCustomerDriverDetailsMultiChannelDisabledStatusText =",
  "Setup-only / send disabled, sendingEnabled false, external_send false",
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-copy-edit-button="customerCopy"',
  'data-copy-copy-button="customerCopy"',
  'data-copy-preview="customerCopy"',
  'data-customer-live-location-helper="true"',
  'data-admin-customer-driver-details-email-review-item="true"',
  'data-admin-customer-driver-details-email-disabled-send-action="true"',
  'data-admin-customer-driver-details-whatsapp-disabled-send-action="true"',
  'data-admin-customer-driver-details-sms-disabled-send-action="true"',
  'data-admin-email-activation-preflight-status="true"',
  'onClick={checkAdminCustomerDriverDetailsEmailDisabledSend}',
  'onClick={() => checkAdminCustomerDriverDetailsMessageDisabledSend("whatsapp")}',
  'onClick={() => checkAdminCustomerDriverDetailsMessageDisabledSend("sms")}',
  "Review Email",
  "Review WhatsApp",
  "Review SMS",
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
  ['data-admin-email-activation-preflight-status="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected one existing Customer Copy surface for ${fragment}`,
  );
  assert.equal(
    countOccurrences(customerCopySection, fragment),
    expectedCount,
    `Expected existing Customer Copy surface inside Customer Copy for ${fragment}`,
  );
}

for (const fragment of [
  'data-admin-customer-driver-details-email-review-item="true"',
  'data-admin-customer-driver-details-email-disabled-send-action="true"',
  'data-admin-customer-driver-details-whatsapp-disabled-send-action="true"',
  'data-admin-customer-driver-details-sms-disabled-send-action="true"',
  'data-admin-email-activation-preflight-status="true"',
]) {
  assertExcludes(appOutsideCustomerCopy, fragment, `Customer Copy fragment outside section ${fragment}`);
}

for (const [label, routeSource] of [
  ["email disabled-send route", emailDisabledRoute],
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
  "Customer Copy multi-channel setup must not add provider/payment SDK package",
  "Customer Copy multi-channel UI must not add standalone Email/WhatsApp/SMS workflow sectors.",
  "Customer Copy multi-channel UI must not add standalone Email/WhatsApp/SMS cards.",
  "Customer Copy disabled-send handlers must use GET.",
  "Customer Copy disabled-send handlers must not use write methods.",
  "Customer Copy email disabled-send API",
  "Customer Copy WhatsApp disabled-send API",
  "Customer Copy SMS disabled-send API",
  "Customer Copy multi-channel no-live guard passed",
]) {
  assertIncludes(noLiveGuard, fragment, `Customer Copy no-live guard fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-customer-driver-details-email-review-item]",
  "[data-admin-customer-driver-details-email-review-action]",
  "[data-admin-customer-driver-details-email-review-label]",
  "data-admin-customer-driver-details-email-review-ready-state",
  "[data-admin-customer-driver-details-email-review-ready-status]",
  "[data-admin-customer-driver-details-email-review-send-state]",
  "expected compact setup-only customer driver details email review row in Customer Copy",
]) {
  assertIncludes(appSmoke, fragment, `app smoke Customer Copy fragment ${fragment}`);
}

for (const fragment of [
  "[data-admin-customer-driver-details-email-review-item='true']",
  "[data-admin-customer-driver-details-email-review-action='true']",
  "[data-admin-customer-driver-details-email-disabled-send-action='true']",
  "[data-admin-customer-driver-details-email-disabled-send-status='true']",
  "GET /api/admin-customer-driver-details-email-review-item-setup",
  "Expected saved booking load to GET the customer driver details email review item through the guarded setup-only API path",
  "Expected Customer Copy disabled email send button to GET the no-op setup-only API",
  "Expected Customer Copy not to include vehicle type, payout, override reason, admin notes, or booking type code",
  "Expected completed booking Customer Copy to keep customer-facing copy protections after load",
]) {
  assertIncludes(bookingUiBrowser, fragment, `booking UI Customer Copy fragment ${fragment}`);
}

assertIncludes(mobileUsabilityBrowser, '"Customer Copy"', "mobile Customer Copy surface");

const ledgerSection = sectionBetween(ledger, "## Customer Copy Multi-Channel Existing Workflow Lock");

for (const fragment of [
  "The existing admin Customer Copy Email/WhatsApp/SMS customer driver-details workflow is locked by `docs/customer-copy-multi-channel-existing-workflow-lock.md`.",
  "This is a docs/test-only lock; it does not approve runtime implementation, UI/API behavior change, UI sectors/buttons/cards, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, customer/driver portal changes, or new shims.",
  "Do not add duplicate Email, WhatsApp, SMS, customer-message, driver-notification, provider-send, or customer driver-details workflow sectors, buttons, cards, routes, helpers, or shims.",
  "Existing surfaces are `data-dispatch-workflow-step=\"customer-whatsapp-copy\"`, `data-copy-edit-button=\"customerCopy\"`, `data-copy-copy-button=\"customerCopy\"`, `data-copy-preview=\"customerCopy\"`, `data-customer-live-location-helper`, `data-admin-customer-driver-details-email-review-item`, the existing Email/WhatsApp/SMS disabled-send review buttons, and `data-admin-email-activation-preflight-status` in `app/page.tsx`.",
  "Existing disabled-send setup paths are `GET /api/admin-customer-driver-details-email-send-disabled-setup`, `GET /api/admin-whatsapp-customer-driver-details-send-disabled-setup`, and `GET /api/admin-sms-customer-driver-details-send-disabled-setup`; they remain setup-only/no-op/no-live.",
  "Existing coverage lives in `scripts/test-customer-copy-multi-channel-no-live-guard.mjs`, `scripts/test-app-smoke-browser.mjs`, `scripts/test-booking-ui-browser.mjs`, and `scripts/test-mobile-usability-browser.mjs`.",
  "Future approved changes must stabilize or extend the existing compact Customer Copy multi-channel row only, stay colocated with Customer Copy, keep provider/env reads, provider sends, notification sends, customer messages, driver notifications, payment/PDF/pricing/payout/auth/location/photo/calendar behavior, parser changes, and DB writes blocked unless separately approved, and keep customer/driver privacy boundaries intact.",
  "This lock adds `scripts/test-customer-copy-multi-channel-existing-workflow-lock.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
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
