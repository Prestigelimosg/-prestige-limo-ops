import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  customerInvoiceEmailRecipientLimit,
  customerInvoiceRecipientsAllowed,
  selectedCustomerInvoiceRecipients,
} from "../lib/customer-invoice-email-recipients.ts";

const [customersPage, emailRoute, ledger] = await Promise.all([
  readFile("app/customers/page.tsx", "utf8"),
  readFile("app/api/admin-customer-invoice-email/route.ts", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

const sanitize = (value) => {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

assert.equal(customerInvoiceEmailRecipientLimit, 3);
assert.deepEqual(
  selectedCustomerInvoiceRecipients({ recipientEmail: " One@Example.com " }, sanitize),
  ["one@example.com"],
  "legacy one-recipient requests must remain supported",
);
assert.deepEqual(
  selectedCustomerInvoiceRecipients(
    { recipientEmails: ["one@example.com", "two@example.com", "three@example.com"] },
    sanitize,
  ),
  ["one@example.com", "two@example.com", "three@example.com"],
  "one guarded request must accept all three selected company emails",
);
assert.deepEqual(
  selectedCustomerInvoiceRecipients(
    { recipientEmails: ["one@example.com", "ONE@example.com"] },
    sanitize,
  ),
  ["one@example.com"],
  "duplicate recipients must collapse before provider send",
);
assert.equal(
  selectedCustomerInvoiceRecipients(
    { recipientEmails: ["one@example.com", "not-an-email"] },
    sanitize,
  ),
  null,
  "one invalid selected recipient must fail the whole send closed",
);
assert.equal(
  selectedCustomerInvoiceRecipients(
    { recipientEmails: ["one@example.com", "two@example.com", "three@example.com", "four@example.com"] },
    sanitize,
  ),
  null,
  "more than three recipients must fail closed",
);
assert.equal(
  customerInvoiceRecipientsAllowed(
    ["one@example.com", "two@example.com"],
    ["one@example.com", "two@example.com"],
  ),
  true,
);
assert.equal(
  customerInvoiceRecipientsAllowed(
    ["one@example.com", "blocked@example.com"],
    ["one@example.com"],
  ),
  false,
  "every selected address must pass the existing allowlist",
);

for (const fragment of [
  'const adminCompanyIdentityApiPath = "/api/admin-companies-crm-identity";',
  "loadPlainInvoiceRecipientOptions",
  'data-plain-invoice-recipient-options="true"',
  "data-plain-invoice-recipient-option",
  "Select up to 3. One Send click uses the same guarded invoice email.",
  "plainInvoiceRecipientEmailsFromForm(plainInvoiceForm)",
  "recipientEmails,",
]) {
  assert.ok(customersPage.includes(fragment), `Missing multi-recipient invoice UI fragment: ${fragment}`);
}

for (const fragment of [
  "selectedCustomerInvoiceRecipients(",
  "customerInvoiceRecipientsAllowed(recipients, allowlist)",
  "to: input.recipients",
  'createHash("sha256")',
  "recipientEmails: recipients",
]) {
  assert.ok(emailRoute.includes(fragment), `Missing guarded multi-recipient route fragment: ${fragment}`);
}

assert.equal(
  emailRoute.split("fetch(resendEmailApiUrl").length - 1,
  1,
  "multi-recipient delivery must reuse one existing Resend provider request",
);
assert.ok(
  ledger.includes("### Admin-Selected Invoice Email Recipients (2026-07-19)"),
  "implementation ledger must record the exact recipient extension",
);

console.log("Customer invoice multi-recipient email guard passed.");
