import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ledgerPath = "docs/current-implementation-ledger.md";
const requiredGuardScripts = [
  "scripts/test-email-no-live-guard.mjs",
  "scripts/test-whatsapp-customer-driver-details-no-live-guard.mjs",
  "scripts/test-sms-customer-driver-details-no-live-guard.mjs",
  "scripts/test-customer-copy-multi-channel-no-live-guard.mjs",
  "scripts/test-customer-driver-details-link-no-live-guard.mjs",
  "scripts/test-telegram-internal-admin-alert-no-live-guard.mjs",
  "scripts/test-live-location-no-live-guard.mjs",
  "scripts/test-admin-ots-photo-proof-no-live-guard.mjs",
  "scripts/test-customer-driver-auth-no-live-guard.mjs",
  "scripts/test-admin-billing-payment-no-live-guard.mjs",
  "scripts/test-customer-amendment-no-live-guard.mjs",
  "scripts/test-admin-calendar-event-lifecycle-no-live-guard.mjs",
  "scripts/test-admin-production-deployment-hardening-no-live-guard.mjs",
  "scripts/test-admin-company-traveler-crm-write-no-live-guard.mjs",
  "scripts/test-shim-cleanup-no-new-shim-guard.mjs",
];
const setupRouteNameFragments = [
  "admin-billing-payment",
  "admin-calendar-event-lifecycle",
  "admin-company-traveler-crm-identity-contact-write",
  "admin-company-traveler-crm-write",
  "admin-customer-amendment",
  "admin-customer-driver-auth",
  "admin-customer-driver-details-email",
  "admin-customer-driver-details-link",
  "admin-email",
  "admin-live-location",
  "admin-ots-photo-proof",
  "admin-production-deployment-hardening",
  "admin-rate-settings-write-action",
  "admin-sms-customer-driver-details",
  "admin-telegram-internal-admin-alert",
  "admin-whatsapp-customer-driver-details",
];
const requiredMasterModules = [
  "Customer Copy Email/WhatsApp/SMS driver-details messaging",
  "secure customer driver-details link",
  "Telegram internal admin alerts",
  "live location",
  "OTS photo proof",
  "customer/driver auth",
  "billing/payment",
  "customer amendment/cancellation review flow",
  "calendar event lifecycle",
  "company/traveler CRM write-blocked readiness",
  "production hardening",
];
const requiredBlockedPhrases = [
  "live DB/write",
  "migrations",
  "deployment",
  "provider/env activation",
  "external APIs",
  "live sending",
  "payment/PDF/payout",
  "auth activation",
  "live location activation",
  "photo upload/storage",
  "CRM/calendar amendment updates",
  "calendar event lifecycle create/update/cancel and live sync",
  "risky shim write paths",
];
const requiredLedgerFragments = [
  "Master Pre-Activation Completion Audit Lock",
  "Still blocked unless explicitly approved",
  "Manual approval remains required for any live activation",
  "No live DB, migrations, payment, PDF, payout, auth activation, live sending, external APIs, live location, or photo upload unless explicitly approved.",
  "Rule: no new shims. Replace remaining shim usage only with typed helpers, typed API routes, and direct contract tests.",
  "customer amendment/cancellation never auto-updates calendar",
  "calendar create/update/cancel remains blocked until explicit approval",
  "calendar event lifecycle status: readiness foundation, preview/readiness API, disabled action API, action audit payload setup foundation, no-live guard, and final pre-activation lock are done",
  "production hardening status: readiness foundation, preview/readiness API, disabled production action API, action audit payload setup foundation, no-live guard, and pre-activation audit lock are done",
  "Shim cleanup status: inventory and no-new-shim guard are done",
  "risky full-driver profile write/delete",
  "`rate_settings` save/upsert",
  "`customer_rates`",
  "`driver_payout_rules`",
];
const forbiddenRouteVerbPattern = /export async function (POST|PUT|PATCH|DELETE)/;
const directLiveActivationPattern =
  /calendar\.events|events\.insert|events\.update|events\.delete|checkout\.sessions|paymentIntent|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|client\.messages|publish\s*\(|watchPosition|getCurrentPosition|storage\.from\s*\([^)]*\)\.upload|deploy\s*\(|migrate\s*\(|db\s+push/i;

async function fileExists(file) {
  await access(file);
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n## ") {
  const start = source.indexOf(startHeading);

  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);

  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function assertIncludes(source, fragment, label) {
  assert.equal(
    source.toLowerCase().includes(fragment.toLowerCase()),
    true,
    `${label} missing expected fragment: ${fragment}`,
  );
}

for (const guardScript of requiredGuardScripts) {
  await fileExists(guardScript);
}

const ledger = await readFile(ledgerPath, "utf8");
const masterSection = sectionBetween(ledger, "## Master Pre-Activation Completion Audit Lock");

for (const moduleName of requiredMasterModules) {
  assertIncludes(masterSection, moduleName, "Master pre-activation audit");
}

for (const blockedPhrase of requiredBlockedPhrases) {
  assertIncludes(masterSection, blockedPhrase, "Master blocked-live list");
}

for (const ledgerFragment of requiredLedgerFragments) {
  assertIncludes(ledger, ledgerFragment, "Global pre-activation ledger");
}

assert.match(
  ledger,
  /manual approval remains required for any live activation/i,
  "Ledger must state manual approval remains required for live activation.",
);
assert.match(
  ledger,
  /explicit(?:ly)? approval|explicitly approved/i,
  "Ledger must state explicit approval is required for live activation.",
);

const routeFiles = (await listFiles("app/api"))
  .filter((file) => file.endsWith("route.ts"))
  .filter((file) => setupRouteNameFragments.some((fragment) => file.includes(fragment)))
  .sort();

assert.ok(routeFiles.length > 0, "Global guard must find completed setup route files.");

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only setup surface.`);
  assert.equal(
    forbiddenRouteVerbPattern.test(source),
    false,
    `${routeFile} must not expose POST/PUT/PATCH/DELETE live activation verbs.`,
  );
  assert.equal(
    directLiveActivationPattern.test(source),
    false,
    `${routeFile} must not contain direct live activation calls.`,
  );
}

for (const guardScript of requiredGuardScripts) {
  await import(pathToFileURL(path.resolve(guardScript)).href);
}

console.log("global pre-activation no-live guard passed");
