import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const appSmokeBrowserPath = "scripts/test-app-smoke-browser.mjs";
const mobileUsabilityBrowserPath = "scripts/test-mobile-usability-browser.mjs";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-admin-setup-readiness-archive-label-guard.mjs";
const businessArchiveLabel = "Setup Readiness Archive";
const legacyVisibleArchiveLabel = "Internal QA / Mock Workbench Archive — Mock Only";

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

const [appPage, ledger, appSmokeBrowser, mobileUsabilityBrowser, preactivationSuite] =
  await Promise.all([
    readFile(appPagePath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(appSmokeBrowserPath, "utf8"),
    readFile(mobileUsabilityBrowserPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);

const ledgerSection = sectionBetween(
  ledger,
  "### Admin Setup Readiness Archive Label Hardening Lock",
);

for (const phrase of [
  "The collapsed admin archive header now uses the business-grade visible label `Setup Readiness Archive`.",
  "The old visible label `Internal QA / Mock Workbench Archive — Mock Only` is removed from `app/page.tsx`.",
  "The archive remains collapsed by default and keeps the existing `data-internal-qa-mock-archive` boundary for tests.",
  "Customer and driver public-surface browser guards treat `Setup Readiness Archive` as forbidden outside the admin shell.",
  "No UI sector/card addition, route change, parser change, Save Booking change, DB read/write, provider send, pricing/payout/payment/PDF activation, or new shim is approved by this lock.",
  "This lock adds `scripts/test-admin-setup-readiness-archive-label-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Ledger phrase: ${phrase}`);
}

assertIncludes(appPage, `aria-label="${businessArchiveLabel}"`, "business archive aria label");
assertIncludes(appPage, `              ${businessArchiveLabel}`, "business archive visible label");
assertIncludes(appPage, 'data-internal-qa-mock-archive="true"', "archive data boundary");
assertIncludes(appPage, 'data-internal-qa-mock-archive-toggle="true"', "archive toggle boundary");
assertExcludes(appPage, legacyVisibleArchiveLabel, "legacy visible archive label");

for (const [label, source] of [
  ["app smoke browser", appSmokeBrowser],
  ["mobile usability browser", mobileUsabilityBrowser],
]) {
  assertIncludes(
    source,
    `const internalQaMockArchiveLabel = "${businessArchiveLabel}";`,
    `${label} business archive label`,
  );
  assertIncludes(
    source,
    '{ label: "setup readiness archive label", pattern: /setup\\s+readiness\\s+archive/i }',
    `${label} public-surface forbidden label pattern`,
  );
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite setup readiness archive guard");

console.log("admin setup readiness archive label guard passed");
