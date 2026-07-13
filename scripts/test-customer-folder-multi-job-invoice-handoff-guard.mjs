import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardScript = "scripts/test-customer-folder-multi-job-invoice-handoff-guard.mjs";
const [folderPage, folderShell, invoiceFolder, savedBookingsRead, customersPage, invoicePersistence, localInvoices, ledger, preactivation, appSmoke] =
  await Promise.all([
    readFile("app/customers/[customerId]/saved-bookings-panel.tsx", "utf8"),
    readFile("app/customers/[customerId]/page.tsx", "utf8"),
    readFile("app/customers/[customerId]/customer-invoice-folder-panel.tsx", "utf8"),
    readFile("lib/admin-customer-saved-bookings-read.ts", "utf8"),
    readFile("app/customers/page.tsx", "utf8"),
    readFile("lib/customer-invoice-record-persistence.ts", "utf8"),
    readFile("lib/customer-local-invoices.ts", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
    readFile("scripts/test-app-smoke-browser.mjs", "utf8"),
  ]);

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

for (const fragment of [
  "const customerFolderInvoiceSelectionLimit = 4;",
  'source: returnContext ? "return" : "manual"',
  "The customer folder performs exactly one guarded read on mount or return from Dispatch.",
  'data-customer-folder-selected-invoice-layout="true"',
  "data-customer-folder-selected-invoice-job",
  "Review invoice &amp; email",
  "selected_booking_references",
  "selectedUnbilledBookings.map((booking)",
  'limit: "200"',
  'data-customer-folder-sector="unbilled-jobs"',
  'data-customer-folder-unbilled-scroll="true"',
  "max-h-[32rem] overflow-x-auto overflow-y-auto",
  "3 · Pending jobs for payment",
  "4 · Selected jobs invoice review",
]) {
  includes(folderPage, fragment, `customer folder four-sector fragment ${fragment}`);
}

includes(folderShell, 'data-customer-folder-sector="profile"', "profile sector marker");
includes(folderShell, "1 · Customer profile &amp; invoice prefix", "profile sector label");
includes(folderShell, "bg-slate-100", "customer folder contrasting page background");
includes(
  appSmoke,
  '"[data-customer-folder-sector=\'profile\']"',
  "browser customer-folder profile readiness marker",
);
includes(
  ledger,
  "The customer-detail portion of that sweep waits for the established numbered profile sector",
  "customer-folder browser marker ledger checkpoint",
);
includes(invoiceFolder, 'data-customer-folder-sector="invoices"', "invoices sector marker");
includes(invoiceFolder, "2 · Total invoices", "invoices sector label");
includes(
  savedBookingsRead,
  "const maxLimit = customerFolderSavedBookingSourceReadLimit;",
  "customer folder returns its complete bounded source read",
);

assert.equal(
  folderPage.includes("Load unbilled jobs"),
  false,
  "Customer folder must auto-load pending jobs without the retired manual button.",
);
assert.equal(
  folderPage.includes("data-customer-folder-saved-bookings-summary"),
  false,
  "Customer folder must not restore the removed noisy pending-job summary boxes.",
);

for (const fragment of [
  "function selectedInvoiceBookingReferences(value: string)",
  ".slice(0, plainInvoiceMaxLineItems)",
  "selectedBookingReferences = \"\"",
  "selectedInvoiceBookingReferences(selectedBookingReferences)",
  "targetBookings.map((booking) =>",
  "readCustomerFolderExactBooking(safeCustomerFolderDispatchHandoffReference(booking))",
  "mismatchedCustomer",
  "mismatchedBooker",
  "setPlainInvoiceSavedBookings(targetBookings)",
  "bookingReference: firstInvoiceRow.bookingReference",
  "bookingReference: row.bookingReference",
  "All ${invoiceRows.length} selected job",
]) {
  includes(customersPage, fragment, `multi-job invoice handoff fragment ${fragment}`);
}

for (const fragment of [
  "bookingReference?: string;",
  "const bookingReference = text(item.bookingReference);",
]) {
  includes(localInvoices, fragment, `stored invoice line reference fragment ${fragment}`);
}

for (const fragment of [
  "if (value.length > 4)",
  "function uniqueInvoiceBookingReferences",
  "function verifyIssuedInvoiceBookingOwnership",
  'bookingReferences.includes("ADM-20260712063110")',
  '.in("booking_reference", bookingReferences)',
  '.eq("customer_id", input.customerId)',
  '.eq("booker_id", input.bookerId)',
  "Invoice already contains one or more selected jobs.",
  "item.bookingReference || sanitized.data.bookingReference",
]) {
  includes(invoicePersistence, fragment, `server multi-job verification fragment ${fragment}`);
}

for (const forbidden of [
  "sendMail",
  "new Resend",
  "navigator.geolocation",
  "watchPosition",
  "driver payout",
  "PayNow payout",
  "parser/debug",
]) {
  assert.equal(
    folderPage.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    `Customer folder invoice selection must exclude ${forbidden}.`,
  );
}

includes(ledger, "### Customer Folder Four-Sector Invoice Workflow");
includes(preactivation, guardScript, "preactivation guard registration");

console.log("Customer folder multi-job invoice handoff guard passed");
