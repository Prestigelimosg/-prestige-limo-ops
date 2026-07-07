import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customers-outstanding-review-dropdown-guard.mjs";

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
  'data-customer-folder-finder="true"',
  'data-customer-monthly-billing-queue="true"',
  'data-customer-billing-workbench-drawer="true"',
  'data-customer-invoice-workspace="true"',
]) {
  assertIncludes(customersPage, fragment, `real customers workflow fragment ${fragment}`);
}

for (const fragment of [
  'data-outstanding-payments-review="true"',
  'data-collection-follow-up-queue="true"',
  'data-monthly-statement-preview="true"',
  'data-customer-advanced-booking-drawer="true"',
  'data-customer-debug-tools-drawer="true"',
  'data-regular-customer-booking-form-section="true"',
  'data-regular-customer-booking-list-preview="true"',
  'data-mock-payment-event-log="true"',
]) {
  assertExcludes(customersPage, fragment, `removed legacy customer mock queue fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customers outstanding review removal guard registration");

console.log("Customers legacy outstanding review removal guard passed");
