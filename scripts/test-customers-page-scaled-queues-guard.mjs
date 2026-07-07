import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customerPagePath = "app/customers/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customers-page-scaled-queues-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must not include ${fragment}.`);
}

const [customerPage, preactivationSuite] = await Promise.all([
  readFile(customerPagePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

for (const fragment of [
  "const customerFolderFinderPageSize = 10;",
  "const paginatedCustomerFolderFinderRows = filteredCustomers.slice(",
  'data-customer-folder-finder-page-numbers="true"',
  'data-unbilled-customers-scroll-list="true"',
]) {
  assertIncludes(customerPage, fragment, `real customers scaled queue fragment ${fragment}`);
}

for (const fragment of [
  'data-collection-follow-up-pagination="true"',
  'data-monthly-statement-pagination="true"',
  'data-customer-debug-tools-drawer="true"',
]) {
  assertExcludes(customerPage, fragment, `removed legacy scaled queue fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customers scaled queue removal guard registration");

console.log("Customers legacy scaled queues removal guard passed");
