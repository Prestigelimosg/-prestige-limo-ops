import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const packageJsonPath = "package.json";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-customer-driver-visibility-boundary-guard.mjs";

const contractChecks = [
  {
    label: "customer booking request API contract",
    script: "scripts/test-customer-booking-request-api-contract.mjs",
    stripTypes: true,
  },
  {
    label: "customer saved bookings API contract",
    script: "scripts/test-customer-saved-bookings-api-contract.mjs",
    stripTypes: true,
  },
  {
    label: "customer booking memory API contract",
    script: "scripts/test-customer-booking-memory-api-contract.mjs",
    stripTypes: true,
  },
  {
    label: "customer booking status API contract",
    script: "scripts/test-customer-booking-status-api-contract.mjs",
    stripTypes: true,
  },
  {
    label: "customer portal session issue API contract",
    script: "scripts/test-customer-portal-session-issue-api-contract.mjs",
    stripTypes: true,
  },
  {
    label: "customer portal saved bookings adapter contract",
    script: "scripts/test-customer-portal-saved-bookings-adapter.mjs",
    stripTypes: true,
  },
  {
    label: "customer saved bookings auth handoff readiness",
    script: "scripts/test-customer-saved-bookings-auth-handoff-readiness.mjs",
    stripTypes: false,
  },
  {
    label: "customer booking page API audit",
    script: "scripts/test-customer-booking-page-api-audit.mjs",
    stripTypes: false,
  },
  {
    label: "driver job link API contract",
    script: "scripts/test-driver-job-link-api-contract.mjs",
    stripTypes: true,
  },
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

const [ledger, packageJson, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(packageJsonPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Public Customer/Driver Visibility Boundary Guard Lock",
);

for (const phrase of [
  "Public customer/driver visibility is guarded across customer booking, customer portal, and driver job contract surfaces.",
  "This is a docs/test-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, customer/driver auth activation, payment/PDF/pricing/payout activation, UI sectors, or runtime behavior changes.",
  "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive details.",
  "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive details.",
  "The customer booking request, customer booking memory, customer saved bookings, customer booking status, customer portal session, customer portal saved-bookings adapter, customer saved-bookings auth handoff, customer booking-page API audit, and driver job link API contracts are coordinated by this guard.",
  "The driver job browser privacy checks remain in `npm run test:safe` and are not moved into the preactivation suite because they require a running app/browser harness.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-customer-driver-visibility-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public visibility ledger phrase: ${phrase}`);
}

for (const forbiddenPhrase of [
  "customers may see driver payout",
  "drivers may see customer price",
  "PayNow payout approved",
  "endpoint migration is approved",
  "DB write approved",
  "provider send approved",
  "pricing approved",
  "payout approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, `Forbidden public visibility phrase: ${forbiddenPhrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public visibility guard registration");

for (const { script } of contractChecks) {
  assertIncludes(ledgerSection, script, `ledger public visibility contract ${script}`);
}

assertIncludes(packageJson, "npm run test:driver-job-page-browser", "test:safe driver browser privacy coverage");
assertIncludes(
  packageJson,
  "npm run test:driver-job-page-production-disabled-browser",
  "test:safe production-disabled driver browser privacy coverage",
);

for (const { label, script, stripTypes } of contractChecks) {
  const args = stripTypes ? ["--experimental-strip-types", script] : [script];
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(
    result.status,
    0,
    [
      `${label} failed while running ${script}.`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

console.log("Public customer/driver visibility boundary guard passed");
