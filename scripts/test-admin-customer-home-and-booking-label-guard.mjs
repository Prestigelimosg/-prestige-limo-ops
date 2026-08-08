import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const customerFolderPagePath = "app/customers/[customerId]/page.tsx";
const bookPagePath = "app/book/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-customer-home-and-booking-label-guard.mjs";

function countMatches(source, fragment) {
  return source.split(fragment).length - 1;
}

const [customersPage, customerFolderPage, bookPage, preactivationSuite] = await Promise.all([
  readFile(customersPagePath, "utf8"),
  readFile(customerFolderPagePath, "utf8"),
  readFile(bookPagePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assert.equal(
  countMatches(customersPage, 'data-admin-customers-home-link="true"'),
  1,
  "Admin Customers must contain exactly one compact Home link.",
);
assert.match(
  customersPage,
  /data-admin-customers-home-link="true"[\s\S]*?href="\/"[\s\S]*?>\s*Home\s*<\/Link>/,
  "Admin Customers Home must retain the exact root destination and label.",
);

assert.equal(
  countMatches(customerFolderPage, 'data-admin-customer-folder-home-link="true"'),
  1,
  "The exact customer folder must contain exactly one compact Home link.",
);
assert.match(
  customerFolderPage,
  /data-admin-customer-folder-home-link="true"[\s\S]*?href="\/"[\s\S]*?>\s*Home\s*<\/Link>/,
  "Customer folder Home must retain the exact root destination and label.",
);
assert.equal(
  countMatches(customerFolderPage, "Back to customer dashboard"),
  1,
  "The established Back to customer dashboard link must remain exactly once.",
);
assert.match(
  customerFolderPage,
  /href="\/customers"[\s\S]*?>\s*Back to customer dashboard\s*<\/Link>/,
  "The established customer dashboard destination must remain unchanged.",
);

assert.equal(
  countMatches(bookPage, 'data-customer-booking-portal-link="true"'),
  1,
  "The customer booking header must retain exactly one existing portal link.",
);
assert.match(
  bookPage,
  /data-customer-booking-portal-link="true"[\s\S]*?href="\/my-bookings"[\s\S]*?>\s*My Bookings\s*<\/Link>/,
  "The customer header label must be My Bookings without changing its route.",
);
assert.equal(
  countMatches(bookPage, 'href="/my-bookings"'),
  1,
  "The customer booking page must not add a second My Bookings route link.",
);

assert.equal(
  preactivationSuite.includes(guardScript),
  true,
  "The navigation guard must remain registered in the preactivation suite.",
);

console.log("Admin customer Home and customer My Bookings navigation guard passed");
