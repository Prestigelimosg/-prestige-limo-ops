import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const emailNotificationSetupPath = "lib/admin-email-notification-setup-foundation.ts";
const guardScript = "scripts/test-email-provider-staging-send-safety-contract.mjs";

const setupRouteFiles = [
  "app/api/admin-customer-driver-details-email-preview-readiness-setup/route.ts",
  "app/api/admin-customer-driver-details-email-review-item-setup/route.ts",
  "app/api/admin-customer-driver-details-email-send-disabled-setup/route.ts",
  "app/api/admin-email-activation-preflight-setup/route.ts",
  "app/api/admin-email-provider-readiness-setup/route.ts",
  "app/api/admin-email-provider-selection-setup/route.ts",
];

const setupHelperFiles = [
  "lib/admin-email-notification-setup-foundation.ts",
  "lib/admin-email-provider-readiness-setup-foundation.ts",
  "lib/admin-email-provider-selection-setup-foundation.ts",
  "lib/admin-email-recipient-safety-setup-foundation.ts",
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/admin-email-send-policy-setup-foundation.ts",
  "lib/admin-email-sender-selection-setup-foundation.ts",
  "lib/customer-driver-details-email-readiness-setup-foundation.ts",
  "lib/customer-driver-details-email-send-audit-payload-setup-foundation.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/driver-ack-customer-message-handoff-setup-foundation.ts",
];

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

const [ledger, preactivationSuite, emailNotificationSetup, ...setupSources] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    readFile(emailNotificationSetupPath, "utf8"),
    ...[...setupRouteFiles, ...setupHelperFiles].map((file) => readFile(file, "utf8")),
  ]);

const safetySection = sectionBetween(
  ledger,
  "### Email Provider Staging Send Safety Contract Lock",
);
const productionTestSection = sectionBetween(
  ledger,
  "### Controlled Production Driver Details Email Test Approval",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved one-message staging Email send evidence pass.",
  "This lock does not activate Email sending, provider credentials, provider SDKs, SMTP/API calls, env changes, deployment, DB read/write, or live send behavior.",
  "Future Email provider handling must list env names only; env values, secrets, API keys, SMTP passwords, access tokens, provider tokens, and connection strings must never be printed, logged, committed, echoed, or surfaced.",
  "A recipient allowlist is required before any future staging Email send evidence pass.",
  "Future Email send content must exclude pricing, payout, payment/PDF/billing, auth/location/photo/calendar/OTS, parser/internal debug, internal notes, secrets/tokens, `customer_rates`, and `driver_payout_rules`.",
  "Future staging Email send scope must be exactly one message only; batch send, resend automation, scheduler, polling, retry loop, customer-visible auto-refresh, and background sends remain forbidden.",
  "Future staging Email send evidence requires explicit owner approval naming the staging target, provider, env-name handling, allowlisted recipient, content fixture, one-message boundary, rollback/disable proof, and checks.",
  "Future Driver Details Email may be app-sent through Resend only when admin explicitly clicks the Email action, the exact Email driver-details gate is approved/opened, and staging recipient allowlist proof passes; this does not approve Telegram/WhatsApp provider sends.",
  "Rollback/disable proof is required after any future send evidence; the provider gate must be closed again and disabled/no-op behavior must be verified.",
  "Future Email may include an admin-selected secure tracking-link live-location email only after separate owner approval for that exact channel/action gate.",
  "Email must not auto-send live location, must not send native/streaming live location, and must not be the future automatic live-location channel.",
  "No provider activation or provider send is approved by this guard.",
  "Current `e8cfd8ea` controlled-test packet status is prepared but execution-blocked; this record does not approve a deployment, Preview env assignment, send-gate change, provider request, or external Email.",
  "The exact candidate runtime is `e8cfd8ea Repair multi-segment booking status updates`, which retains the established `f6806723` Driver Details Email hardening; any later docs/test-only commit must prove that `e8cfd8ea` remains the latest runtime-path commit before a test deployment.",
  "Any `app/` or `lib/` runtime change after `e8cfd8ea` invalidates that old controlled-test candidate for execution instead of blocking unrelated preactivation verification.",
  "A future Email test must first name and review a fresh exact runtime candidate under separate owner approval; this stale packet can never authorize deploying or sending from a later commit.",
  "The only approved candidate recipient is the owner mailbox `info@prestigelimo.sg`; the sender remains `Prestige Limo Dispatch <info@prestigelimo.sg>` and Reply-To remains `info@prestigelimo.sg`.",
  "The owner must name one exact existing non-operational test booking and its exact assigned-driver test record at action time; no booking, driver, or customer may be guessed, inferred, duplicated, or recorded in this packet.",
  "On 2026-07-15 the owner confirmed that all current bookings, customers, invoices, and drivers are test-only, thereby confirming exact fixture `ADM-20260712063110` with assigned driver `TEST DRIVER CRM 20260516` as non-operational test data; this fixture confirmation does not approve Preview configuration, deployment, provider access, or an external Email.",
  "The content review must use only CUSTOMER BOOKING DETAILS and DRIVER DETAILS fields already allowlisted by the established gated route, with `Passenger name:` as the customer-facing identity label.",
  "The controlled test, if later approved, is exactly one explicit admin Email click, one route POST, one provider request, and one delivered message; no live duplicate request is required because deterministic idempotency remains guard-proven.",
  "Required send evidence is one HTTP 200 `send_succeeded` response, `provider_request_count: 1`, one safe provider message id, one received owner-mailbox message, same-page `Emailed` disabled state, zero follow-up send-route request, and zero database or notification-table write.",
  "A later test requires a fresh protected Preview because the verified `f6806723` Preview is credential-free and gate-closed; temporary Preview-only env assignments must never change or expose Production values.",
  "Rollback must close `PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED`, remove every temporary Driver Details Email/Resend Preview assignment, redeploy the credential-free gate-closed artifact, verify exactly one disabled `Email gate off` control, verify no later send-route request, keep automation-bypass count at zero, and preserve the Vercel SSO redirect.",
  "Do not use `vercel curl` for the protected application check because its automatic protection-bypass creation would change project configuration; use the signed-in Browser and sanitized deployment logs instead.",
  "Execution remains blocked pending separate action-time owner approval of the exact booking/driver fixture, temporary Preview configuration, fresh protected Preview deployment, and exactly one external Email send.",
  "Preparing this packet requires no deployment because it changes only the ledger and its existing focused guard.",
]) {
  assertIncludes(safetySection, phrase, `Email staging-send safety phrase: ${phrase}`);
}

const candidateRuntimeCommit = "e8cfd8ea351f1bd5b47a7c759a43f33ccea4bbb6";
const resolvedCandidate = spawnSync(
  "git",
  ["rev-parse", `${candidateRuntimeCommit}^{commit}`],
  { encoding: "utf8" },
);

assert.equal(resolvedCandidate.status, 0, "Driver Details Email candidate runtime commit must exist.");
assert.equal(
  resolvedCandidate.stdout.trim(),
  candidateRuntimeCommit,
  "Driver Details Email candidate runtime commit must resolve exactly.",
);

const laterRuntimePaths = spawnSync(
  "git",
  ["diff", "--name-only", `${candidateRuntimeCommit}..HEAD`, "--", "app", "lib"],
  { encoding: "utf8" },
);

assert.equal(laterRuntimePaths.status, 0, "Driver Details Email later runtime-path check must complete.");
if (laterRuntimePaths.stdout.trim()) {
  assertIncludes(
    safetySection,
    "Any `app/` or `lib/` runtime change after `e8cfd8ea` invalidates that old controlled-test candidate for execution",
    "later runtime changes invalidate the old Email controlled-test candidate",
  );
}

for (const forbidden of [
  "Email sending is approved now",
  "provider credentials may be configured now",
  "live Email send is approved",
  "batch send is approved",
  "auto-send live location email is approved",
  "native live location email is approved",
  "streaming live location email is approved",
  "env values may be printed",
]) {
  assertExcludes(safetySection, forbidden, `forbidden Email staging-send approval phrase`);
}

for (const phrase of [
  "The owner approved exactly one controlled Production Driver Details Email test on 2026-07-15.",
  "`ADM-20260712063110`",
  "`TEST DRIVER CRM 20260516`",
  "`info@prestigelimo.sg`",
  "Only `PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED` may be temporarily changed for this test",
  "The established route, helper, Customer Copy Email button, recipient allowlist, privacy allowlist, same-origin admin boundary, same-page success lock, and deterministic Resend idempotency key must be reused without duplication.",
  "Production must first receive an isolated `origin/main`-based candidate containing only the existing booking-status repair and the reviewed Driver Details Email hardening; `staging` must not be deployed or merged.",
  "Success requires exactly one send-route POST, HTTP 200 `send_succeeded`, `provider_request_count: 1`, one safe provider message id, one disabled same-page `Emailed` state, and owner-mailbox receipt confirmation.",
  "Rollback must set the Production gate closed again, redeploy the same source, verify `Email gate off`, and prove no later send-route request.",
  "No Supabase branch, Supabase configuration/data change, Automation toggle, calendar/map action, invoice/payment/payout action, customer/driver in-app message, or second external Email is approved.",
  "The saved fixture's `Booker email (optional)` field was blank when loaded from Completed / History.",
  "The one browser click attempt ended with a Playwright selector deadline before any success state was observed; it was not retried.",
  "Production logs contained zero requests to `/api/admin-customer-driver-details-email-send-action` during the bounded test window.",
  "The controlled live-send acceptance therefore remains unproven: no provider request, provider message id, `Emailed` UI state, or mailbox receipt was produced.",
  "Gate-closed rollback reached READY Production deployment `dpl_77KXer37vPym14tjc5yKAH3iDTka`",
]) {
  assertIncludes(productionTestSection, phrase, `Controlled Production Email test phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite Email staging-send safety registration",
);

assertIncludes(emailNotificationSetup, '"live_location"', "Email content blocked live_location field");

const setupCombined = setupSources.join("\n");

for (const fragment of [
  "external_send: false",
  "sendingEnabled: false",
  "liveSendingEnabled: false",
  "providerConfigured: false",
]) {
  assertIncludes(setupCombined, fragment, `current Email setup-only flag ${fragment}`);
}

for (const forbiddenPattern of [
  /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/,
  /^\s*import\s+.*from\s+["'](?:@aws-sdk\/client-ses|@sendgrid\/client|@sendgrid\/mail|aws-sdk|mailgun-js|mailgun\.js|nodemailer|postmark|resend)["']/im,
  /require\(\s*["'](?:@aws-sdk\/client-ses|@sendgrid\/client|@sendgrid\/mail|aws-sdk|mailgun-js|mailgun\.js|nodemailer|postmark|resend)["']\s*\)/i,
  /\b(?:SESClient|SendEmailCommand)\b/,
  /\bprocess\.env\b|\bSMTP_[A-Z_]*\b|\bSENDGRID_[A-Z_]*\b|\bMAILGUN_[A-Z_]*\b|\bRESEND_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b/i,
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|createTransport|smtpTransport|sendMail\s*\(|messages\.send|transporter\.sendMail/i,
  /external_send\s*[:=]\s*true|sendingEnabled\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|providerConfigured\s*[:=]\s*true/i,
  /setInterval|setTimeout|cron|scheduler|polling|retryLoop|retry_loop|queueMicrotask|new Worker/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(/i,
]) {
  assertExcludes(setupCombined, forbiddenPattern, "Email staging-send setup surface");
}

console.log("Email provider staging send safety contract guard passed");
