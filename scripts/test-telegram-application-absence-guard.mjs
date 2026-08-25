import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const retiredTelegramPaths = [
  "app/api/admin-telegram-internal-admin-alert-preview-readiness-setup/route.ts",
  "app/api/admin-telegram-internal-admin-alert-send-disabled-setup/route.ts",
  "app/api/admin-telegram-internal-admin-alert-send/route.ts",
  "lib/admin-telegram-alert-disabled-adapter.ts",
  "lib/admin-telegram-internal-admin-alert-live-send.ts",
  "lib/admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation.ts",
  "lib/admin-telegram-internal-admin-alert-setup-foundation.ts",
  "docs/telegram-driver-alert-workflow-plan.md",
  "docs/telegram-mock-alert-preview-ui-plan.md",
  "docs/telegram-whatsapp-readiness-audit.md",
  "scripts/test-admin-manual-telegram-copy-channel-guard.mjs",
  "scripts/test-admin-telegram-alert-disabled-adapter-contract.mjs",
  "scripts/test-admin-telegram-internal-admin-alert-preview-readiness-setup-api-contract.mjs",
  "scripts/test-admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation-contract.mjs",
  "scripts/test-admin-telegram-internal-admin-alert-send-disabled-setup-api-contract.mjs",
  "scripts/test-admin-telegram-internal-admin-alert-setup-foundation-contract.mjs",
  "scripts/test-telegram-internal-admin-alert-live-send-guard.mjs",
  "scripts/test-telegram-internal-admin-alert-no-live-guard.mjs",
  "scripts/test-telegram-live-location-evidence-contract-guard.mjs",
  "scripts/test-telegram-provider-no-send-approval-packet.mjs",
];

const privacyDenylistPaths = [
  "lib/admin-app-notification-persistence.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-booking-workflow-status-persistence.ts",
  "lib/admin-completed-booking-closeout-persistence.ts",
  "lib/admin-customer-invoice-prefix-settings.ts",
  "lib/admin-customer-name-memory-read.ts",
  "lib/admin-driver-job-link-persistence.ts",
  "lib/admin-driver-job-status-read.ts",
  "lib/admin-map-location-search.ts",
  "lib/admin-map-route-estimates.ts",
  "lib/admin-monthly-billing-draft-plan-persistence.ts",
  "lib/admin-monthly-invoice-billable-item-price-review-persistence.ts",
  "lib/admin-monthly-invoice-draft-item-review-persistence.ts",
  "lib/admin-monthly-invoice-draft-persistence.ts",
  "lib/admin-monthly-invoice-draft-trip-candidates.ts",
  "lib/admin-monthly-invoice-issue-record-persistence.ts",
  "lib/admin-monthly-invoice-issue-review-persistence.ts",
  "lib/admin-monthly-invoice-number-reservation.ts",
  "lib/customer-booking-memory-adapter.ts",
  "lib/customer-booking-memory-read.ts",
  "lib/customer-booking-request-adapter.ts",
  "lib/customer-booking-status-read.ts",
  "lib/customer-driver-app-notification-persistence.ts",
  "lib/customer-driver-auth-foundation.ts",
  "lib/customer-portal-booking-change-request-adapter.ts",
  "lib/customer-portal-driver-tracking-adapter.ts",
  "lib/customer-portal-saved-bookings-adapter.ts",
  "lib/customer-portal-trip-updates-adapter.ts",
  "lib/customer-runtime-session-map.ts",
  "lib/customer-saved-bookings-read.ts",
  "lib/driver-job-status-persistence.ts",
  "lib/driver-portal-bidding-persistence.ts",
];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

for (const retiredPath of retiredTelegramPaths) {
  assert.equal(await exists(retiredPath), false, `retired Telegram path must be absent: ${retiredPath}`);
}

const [appPage, devicePush, ledger, preactivationSuite, publicPrivacyGuard] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("lib/admin-device-push-notification.ts", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  readFile("scripts/test-public-api-source-privacy-boundary-guard.mjs", "utf8"),
]);

assert.doesNotMatch(appPage, /telegram/i, "admin application UI must not retain Telegram state, handlers, controls, or copy");

for (const directory of ["app/api", "lib", "docs"]) {
  const telegramNamedFiles = (await listFiles(directory)).filter((file) =>
    path.basename(file).toLowerCase().includes("telegram"),
  );

  assert.deepEqual(telegramNamedFiles, [], `${directory} must not retain Telegram-named application files`);
}

const telegramNamedGuardScripts = (await listFiles("scripts"))
  .filter((file) => path.basename(file).toLowerCase().includes("telegram"))
  .map((file) => file.replaceAll(path.sep, "/"));

assert.deepEqual(
  telegramNamedGuardScripts,
  ["scripts/test-telegram-application-absence-guard.mjs"],
  "the focused absence guard must replace all Telegram-retention guards",
);

assert.match(devicePush, /telegram_enabled:\s*false;/, "Telegram push capability type must remain disabled");
assert.equal(
  (devicePush.match(/telegram_enabled:\s*false/g) || []).length >= 3,
  true,
  "Telegram push capability results must remain disabled",
);

for (const privacyPath of privacyDenylistPaths) {
  const source = await readFile(privacyPath, "utf8");
  assert.match(source, /["']telegram["']/i, `Telegram privacy denylist must remain in ${privacyPath}`);
}

assert.match(publicPrivacyGuard, /telegram/i, "public API Telegram privacy boundary must remain guarded");
assert.match(ledger, /## Telegram Application Removal Lock/, "ledger must record the Telegram removal lock");
assert.match(
  preactivationSuite,
  /scripts\/test-telegram-application-absence-guard\.mjs/,
  "preactivation suite must register the Telegram absence guard",
);

console.log("Telegram application absence guard passed");
