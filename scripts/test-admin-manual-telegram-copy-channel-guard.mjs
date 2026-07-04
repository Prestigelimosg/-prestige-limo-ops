import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const docsPath = "docs/customer-copy-multi-channel-existing-workflow-lock.md";
const auditPath = "docs/telegram-whatsapp-readiness-audit.md";
const ledgerPath = "docs/current-implementation-ledger.md";

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

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function extractBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);

  assert.notEqual(start, -1, `Missing ${label} start marker.`);
  assert.notEqual(end, -1, `Missing ${label} end marker.`);

  return source.slice(start, end);
}

const [appPage, docs, audit, ledger] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(docsPath, "utf8"),
  readFile(auditPath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);

const telegramHandler = extractBetween(
  appPage,
  "async function copyManualTelegramMessage(",
  "function adminDriverJobLinkFailureMessage(",
  "manual Telegram copy handler",
);
const customerCopySection = extractBetween(
  appPage,
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-dispatch-workflow-step="driver-dispatch-copy"',
  "Customer Copy section",
);
const driverJobLinkSection = extractBetween(
  appPage,
  'data-dispatch-workflow-step="driver-job-link"',
  'data-dispatch-workflow-step="admin-lower-status"',
  "Driver Job Link section",
);
const appWithoutApprovedManualTelegram = appPage
  .replace(customerCopySection, "")
  .replace(driverJobLinkSection, "");

for (const [fragment, expectedCount] of [
  ['data-admin-customer-driver-details-telegram-manual-copy-action="true"', 1],
  ['data-admin-customer-driver-details-telegram-manual-copy-external-send="false"', 2],
  ['data-admin-customer-driver-details-telegram-manual-copy-no-provider-send="true"', 2],
  ['data-admin-customer-driver-details-telegram-manual-copy-status="true"', 1],
  ['onClick={() => copyManualTelegramMessage("customerDriverDetails")}', 1],
]) {
  assertIncludes(customerCopySection, fragment, `Customer manual Telegram fragment ${fragment}`);
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `${fragment} must appear exactly ${expectedCount} time(s).`,
  );
}

for (const [fragment, expectedCount] of [
  ['data-driver-job-link-telegram-manual-copy-button="true"', 1],
  ['data-driver-job-link-telegram-manual-copy-external-send="false"', 2],
  ['data-driver-job-link-telegram-manual-copy-no-provider-send="true"', 2],
  ['data-driver-job-link-telegram-manual-copy-status="true"', 1],
  ['onClick={() => copyManualTelegramMessage("driverJobLink")}', 1],
]) {
  assertIncludes(driverJobLinkSection, fragment, `Driver-link manual Telegram fragment ${fragment}`);
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `${fragment} must appear exactly ${expectedCount} time(s).`,
  );
}

for (const fragment of [
  "navigator.clipboard.writeText(messageText)",
  'target === "customerDriverDetails"',
  'getDispatchCopyText("customerCopy")',
  "driverJobLinkMessage",
  "Create a fresh driver job link before copying Telegram text.",
  "Paste into Telegram manually; no provider message was sent.",
  "external_send: false",
  "noProviderSend: true",
]) {
  assertIncludes(telegramHandler, fragment, `manual Telegram handler fragment ${fragment}`);
}

for (const forbidden of [
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /sendBeacon/,
  /api\.telegram\.org/i,
  /telegram\.org/i,
  /(?:^|[/:.])t\.me(?:[/:?]|$)/i,
  /\/api\/telegram/i,
  /\/api\/notifications\/telegram/i,
  /\/api\/driver-alerts\/telegram/i,
  /process\.env/,
  /chat_id/i,
  /getUpdates/i,
  /sendMessage/i,
  /setWebhook/i,
  /deleteWebhook/i,
]) {
  assertExcludes(telegramHandler, forbidden, "manual Telegram copy handler");
}

for (const forbidden of [
  /driver_payout/i,
  /customer_price/i,
  /driverPayout/,
  /customerPrice/,
  /draftPricing/,
  /PayNow/i,
  /payment/i,
  /billing/i,
  /invoice/i,
  /internal_admin/i,
  /internalFinance/i,
  /parser/i,
  /mock_archive/i,
]) {
  assertExcludes(telegramHandler, forbidden, "manual Telegram copy handler leakage");
}

assertExcludes(
  appWithoutApprovedManualTelegram,
  /data-[^=]*telegram-manual-copy/i,
  "manual Telegram copy controls outside approved Dispatch sections",
);

for (const fragment of [
  "Telegram customer/driver use is limited to admin manual clipboard preparation inside the existing Dispatch rows.",
  "Customer/driver Telegram may only be prepared through the existing admin manual clipboard controls.",
  "Customer and driver Telegram controls are admin manual-copy only; they write already-visible safe copy to the clipboard and keep `external_send=false`.",
]) {
  assertIncludes(docs, fragment, `manual Telegram docs fragment ${fragment}`);
}

for (const fragment of [
  "Dispatch has admin manual Telegram clipboard controls for customer driver details and driver job link copy.",
  "Telegram customer/driver buttons must remain manual clipboard-only unless separately approved.",
]) {
  assertIncludes(audit, fragment, `manual Telegram audit fragment ${fragment}`);
}

for (const fragment of [
  "customer/driver Telegram is manual clipboard preparation in Dispatch",
  "Customer/driver Telegram controls are manual clipboard-only and keep `external_send=false`",
]) {
  assertIncludes(ledger, fragment, `manual Telegram ledger fragment ${fragment}`);
}

console.log("Admin manual Telegram copy channel guard passed");
