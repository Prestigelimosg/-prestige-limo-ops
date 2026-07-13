import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mockCustomersPath = "app/customers/_data/mock-customers.ts";
const customerFolderPagePath = "app/customers/[customerId]/page.tsx";
const customersPagePath = "app/customers/page.tsx";
const dispatchPagePath = "app/page.tsx";
const parserGuardPath = "scripts/test-booking-parser.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-retired-ritz-mock-customer-guard.mjs";

const [mockCustomers, customerFolderPage, customersPage, dispatchPage, parserGuard, ledger, preactivationSuite] =
  await Promise.all([
    readFile(mockCustomersPath, "utf8"),
    readFile(customerFolderPagePath, "utf8"),
    readFile(customersPagePath, "utf8"),
    readFile(dispatchPagePath, "utf8"),
    readFile(parserGuardPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);

for (const retiredFixtureFragment of [
  'id: "ritz-carlton"',
  'companyName: "Ritz Carlton"',
  'invoiceNumber: "RITZ-0003"',
  'invoiceNumber: "RITZ-0004"',
  "billing-ritz@example.test",
]) {
  assert.equal(
    mockCustomers.includes(retiredFixtureFragment),
    false,
    `retired Ritz mock fixture must exclude ${retiredFixtureFragment}`,
  );
}

for (const retiredFollowUpFragment of ['"RITZ-0003":', '"RITZ-0004":']) {
  assert.equal(
    customersPage.includes(retiredFollowUpFragment),
    false,
    `Customers mock follow-up data must exclude ${retiredFollowUpFragment}`,
  );
}

for (const retiredVisibleAccountPattern of [
  /(?:account|customer|customerAccount|relatedJobAccount):\s*"[^"\n]*Ritz-Carlton/i,
  /Selected mock exception:\s*Ritz-Carlton/i,
]) {
  assert.equal(
    retiredVisibleAccountPattern.test(dispatchPage),
    false,
    `admin runtime must not render retired Ritz mock account identity: ${retiredVisibleAccountPattern}`,
  );
}
assert.equal(/RITZ-000|billing-ritz/i.test(dispatchPage), false, "admin runtime must exclude retired Ritz mock billing data");

for (const routeFragment of [
  'import { notFound } from "next/navigation";',
  'const retiredMockCustomerFolderIds = new Set(["ritz-carlton"]);',
  "if (retiredMockCustomerFolderIds.has(customerId.trim().toLowerCase())) {",
  "notFound();",
  "fallbackCustomerFolder(customerId, resolvedSearchParams.name ?? \"\")",
]) {
  assert.equal(
    customerFolderPage.includes(routeFragment),
    true,
    `customer folder retirement boundary must include ${routeFragment}`,
  );
}

for (const preservedCrmMatcherFragment of [
  '["marriott.com", "ritz-carlton"]',
  '["ritzcarlton.com", "ritz-carlton"]',
  '["ritzcarlton.com.sg", "ritz-carlton"]',
]) {
  assert.equal(
    dispatchPage.includes(preservedCrmMatcherFragment),
    true,
    `existing CRM/domain matcher must remain unchanged: ${preservedCrmMatcherFragment}`,
  );
}

for (const preservedLocationParserFragment of [
  "dropoff: 'Ritz Carlton'",
  "pickup: 'Ritz Carlton'",
]) {
  assert.equal(
    parserGuard.includes(preservedLocationParserFragment),
    true,
    `real Ritz pickup/drop-off parser coverage must remain: ${preservedLocationParserFragment}`,
  );
}

const ledgerHeading = "### Ritz Carlton Mock Customer Fixture Retirement";
assert.equal(ledger.includes(ledgerHeading), true, `ledger must include ${ledgerHeading}`);
assert.equal(
  preactivationSuite.includes(guardScript),
  true,
  "preactivation suite must register the retired Ritz mock customer guard",
);

console.log("retired Ritz mock customer guard passed");
