import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildCustomerInvoiceActionEmail } from "../lib/customer-invoice-action-email.ts";

const [panel, emailRoute, invoiceRoute, persistence, migration, ledger] = await Promise.all([
  readFile("app/customers/[customerId]/customer-invoice-folder-panel.tsx", "utf8"),
  readFile("app/api/admin-customer-invoice-email/route.ts", "utf8"),
  readFile("app/api/admin-customer-invoices/route.ts", "utf8"),
  readFile("lib/customer-invoice-record-persistence.ts", "utf8"),
  readFile("supabase/migrations/20260719172500_customer_invoice_reminder_payment_actions.sql", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);

const reminder = buildCustomerInvoiceActionEmail(
  {
    amountCents: 15500,
    dueDateLabel: "26 Jul 2026",
    invoiceNumber: "DEEP-0001",
    kind: "reminder",
  },
  new Date("2026-07-19T09:00:00+08:00"),
);

assert.equal(reminder.subject, "Payment reminder – DEEP-0001 – SGD155.00 due 26 Jul 2026");
assert.match(reminder.text, /invoice DEEP-0001 for SGD155\.00 remains unpaid and is due on 26 Jul 2026\./);
assert.match(reminder.text, /If payment has already been arranged, please disregard this reminder/);
assert.match(reminder.text, /Finance Team\nPrestige Limo SG\n\+65 9655 0807/);

const overdue = buildCustomerInvoiceActionEmail(
  {
    amountCents: 15500,
    dueDateLabel: "18 Jul 2026",
    invoiceNumber: "DEEP-0001",
    kind: "reminder",
  },
  new Date("2026-07-19T09:00:00+08:00"),
);
assert.match(overdue.text, /was due on 18 Jul 2026 and is now overdue/);

const thankYou = buildCustomerInvoiceActionEmail({
  amountCents: 15500,
  dueDateLabel: "26 Jul 2026",
  invoiceNumber: "DEEP-0001",
  kind: "payment_thank_you",
  paymentMethod: "Bank transfer",
});
assert.equal(thankYou.subject, "Payment received – DEEP-0001 – SGD155.00");
assert.match(thankYou.text, /recorded payment of SGD155\.00 for invoice DEEP-0001 by Bank transfer/);

for (const fragment of [
  'data-customer-invoice-folder-open={invoice.invoiceNumber}',
  "data-customer-invoice-folder-selected-reminder=",
  "data-customer-invoice-folder-reminder-preview=",
  "data-customer-invoice-folder-send-reminder-email=",
  "data-customer-invoice-folder-payment-confirmation=",
  'data-customer-invoice-folder-payment-thank-you="true"',
  "data-customer-invoice-folder-confirm-paid=",
  '"Mark paid & send thank-you"',
  '"Mark paid only"',
  'sendInvoiceActionEmail(invoice, "reminder")',
  '"payment_thank_you"',
]) {
  assert.ok(panel.includes(fragment), `Missing consolidated invoice action fragment: ${fragment}`);
}

for (const forbidden of [
  "data-customer-invoice-folder-reminder={invoice.invoiceNumber}",
  "data-customer-invoice-folder-paid-method={invoice.invoiceNumber}",
  "data-customer-invoice-folder-mark-paid={invoice.invoiceNumber}",
  "if (!/^INV-/.test(invoiceNumber))",
  "Thank you message ready",
]) {
  assert.equal(panel.includes(forbidden), false, `Duplicate or non-persistent action must stay removed: ${forbidden}`);
}

assert.equal(
  panel.split("data-customer-invoice-folder-selected-reminder=").length - 1,
  1,
  "Selected invoice must have one reminder button",
);
assert.equal(
  panel.split("data-customer-invoice-folder-selected-mark-paid=").length - 1,
  1,
  "Selected invoice must have one mark-paid button",
);

for (const fragment of [
  'value === "reminder" || value === "payment_thank_you"',
  'invoiceResult.data.status !== "Unpaid"',
  'invoiceResult.data.status !== "Paid"',
  "buildCustomerInvoiceActionEmail({",
  "recordCustomerInvoiceActionEmailDelivery(",
  "customerInvoiceRecipientsAllowed(recipients, allowlist)",
  'fetch(resendEmailApiUrl',
]) {
  assert.ok(emailRoute.includes(fragment), `Missing existing-sender action guard: ${fragment}`);
}
assert.equal(emailRoute.split("fetch(resendEmailApiUrl").length - 1, 1, "Reminder and thank-you must reuse one sender");

assert.match(invoiceRoute, /paymentMethod: body\?\.paymentMethod/);
for (const fragment of [
  "payment_method",
  "paid_at",
  "reminder_send_count",
  "last_reminder_sent_at",
  "thank_you_sent_at",
]) {
  assert.ok(persistence.includes(fragment), `Missing invoice action persistence fragment: ${fragment}`);
  assert.ok(migration.includes(fragment), `Missing invoice action migration fragment: ${fragment}`);
}
for (const fragment of ["loadAdminCustomerInvoiceRecord(", "recordCustomerInvoiceActionEmailDelivery("]) {
  assert.ok(persistence.includes(fragment), `Missing invoice action persistence helper: ${fragment}`);
}

assert.ok(
  ledger.includes("### Consolidated Invoice Reminder And Payment Confirmation Lane (2026-07-19)"),
  "Implementation ledger must record the consolidated action repair",
);

console.log("Customer invoice reminder/payment action guard passed.");
