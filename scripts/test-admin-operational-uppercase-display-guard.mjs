import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, customerBook, customerPortal, customerInvoicePanel, preactivationSuite] =
  await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/book/page.tsx", "utf8"),
    readFile("app/my-bookings/page.tsx", "utf8"),
    readFile("app/customers/[customerId]/customer-invoice-folder-panel.tsx", "utf8"),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  ]);

function sliceBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);
  return source.slice(start, end);
}

const helper = sliceBetween(
  adminPage,
  "type AdminOperationalUppercaseField =",
  "const initialRateOverrideDraft",
);
const customerCopy = sliceBetween(
  adminPage,
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-dispatch-workflow-step="driver-dispatch-copy"',
);

assert.match(helper, /function AdminOperationalUppercaseValue/);
assert.match(helper, /className="uppercase"/);
assert.match(helper, /data-admin-operational-uppercase-value=\{field\}/);
assert.doesNotMatch(helper, /toUpperCase\(|setBooking|fetch\(|localStorage|sessionStorage/);

for (const field of [
  "company",
  "dropoff",
  "extra-stops",
  "flight",
  "passenger",
  "pickup",
  "plate",
  "vehicle",
]) {
  assert.match(adminPage, new RegExp(`field="${field}"`), `Missing admin uppercase field ${field}.`);
}

for (const marker of [
  'data-ai-assist-draft="true"',
  'data-current-upcoming-bookings-list="true"',
  'data-completed-history-list="true"',
  'data-job-card-readable-summary="true"',
]) {
  assert.match(adminPage, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.doesNotMatch(customerCopy, /AdminOperationalUppercaseValue|data-admin-operational-uppercase-value/);
assert.match(
  adminPage,
  /!\["Company", "Extra stops", "Flight", "Vehicle"\]\.includes\(item\.label\)/,
  "New admin-only uppercase rows must stay out of the existing Customer Copy layout.",
);
assert.doesNotMatch(
  `${customerBook}\n${customerPortal}\n${customerInvoicePanel}`,
  /data-admin-operational-uppercase-value|AdminOperationalUppercaseValue/,
  "Customer and invoice surfaces must not inherit admin operational uppercase formatting.",
);
assert.doesNotMatch(
  helper,
  /email|phone|contact|note|request|message|password|token|url|invoice|payment|billing|payout|paynow|finance|debug|archive/i,
  "The admin uppercase field allowlist must exclude protected/non-operational values.",
);
assert.match(
  preactivationSuite,
  /scripts\/test-admin-operational-uppercase-display-guard\.mjs/,
);

console.log("Admin operational uppercase display guard passed.");
