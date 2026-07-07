import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customers-remaining-queues-compact-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must not include ${fragment}.`);
}

const [customersPage, preactivationSuite] = await Promise.all([
  readFile(customersPagePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

for (const fragment of [
  "Monthly Billing Queue",
  "Prepare monthly bill",
  "Same company names stay separate by saved account ID and passenger scope.",
  'data-customer-monthly-billing-group-select="true"',
]) {
  assertIncludes(customersPage, fragment, `real monthly billing queue fragment ${fragment}`);
}

for (const fragment of [
  'data-collection-follow-up-queue="true"',
  'data-monthly-statement-preview="true"',
  'data-customer-invoice-workspace-panel="outstanding"',
  'data-customer-invoice-workspace-panel="follow-up"',
  'data-customer-advanced-booking-drawer="true"',
  'data-customer-debug-tools-drawer="true"',
  'data-regular-customer-booking-form-section="true"',
  'data-regular-customer-booking-list-preview="true"',
]) {
  assertExcludes(customersPage, fragment, `removed legacy remaining queue fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation remaining customers queue removal guard registration");

console.log("Customers legacy remaining queues removal guard passed");
