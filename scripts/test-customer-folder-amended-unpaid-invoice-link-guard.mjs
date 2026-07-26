import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  agents,
  invoiceFolder,
  invoicePersistence,
  invoiceRoute,
  ledger,
  savedBookings,
  suite,
] = await Promise.all([
  readFile("AGENTS.md", "utf8"),
  readFile("app/customers/[customerId]/customer-invoice-folder-panel.tsx", "utf8"),
  readFile("lib/customer-invoice-record-persistence.ts", "utf8"),
  readFile("app/api/admin-customer-invoices/route.ts", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("app/customers/[customerId]/saved-bookings-panel.tsx", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

function mustInclude(source, fragment, label) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function mustExclude(source, fragment, label) {
  assert.equal(source.includes(fragment), false, `${label} must exclude ${fragment}.`);
}

for (const fragment of [
  'export const customerInvoiceAmendedBookingRefreshAction = "refresh_amended_unpaid_invoice";',
  "refreshAdminCustomerAmendedUnpaidInvoice",
  '.from("bookings")',
  '"booking_reference, customer_id, public_booking_reference, service_type, route_type, route_summary, pickup_at, pickup_datetime, pickup_location, dropoff_location, flight_no, passenger_name, vehicle_type_or_category"',
  "loadAdminDriverJobDspActualTimeSummaries",
  "latestSummary.billing_time_source === \"admin_correction\"",
  "formatCustomerInvoiceLineDescription",
  "verifiedLineDescription",
  '.eq("status", "Unpaid")',
  '.eq("document_type", "invoice")',
  '.eq("document_state", "issued")',
  "matchingInvoiceBookingReferences",
  "matchingLineItemIndexes",
  "updatedLineItems",
  "createCustomerInvoicePdfBytes(updatedRecord, profile, logoImage)",
  "pdf_base64: base64FromBytes(pdfBytes)",
  "pdf_sha256: sha256Hex(pdfBytes)",
]) {
  mustInclude(invoicePersistence, fragment, "exact unpaid amended-invoice persistence");
}

mustExclude(
  invoicePersistence,
  "lineItem.description",
  "server-derived amended invoice line description",
);

for (const fragment of [
  "customerInvoiceAmendedBookingRefreshAction",
  "refreshAdminCustomerAmendedUnpaidInvoice",
  "body?.action === customerInvoiceAmendedBookingRefreshAction",
]) {
  mustInclude(invoiceRoute, fragment, "existing invoice PATCH route");
}

for (const fragment of [
  "formatCustomerInvoiceLineDescription",
  "customerInvoiceAmendedBookingRefreshAction",
  "customerInvoiceUpdatedEventName",
  "refreshLinkedUnpaidInvoice",
  "await refreshLinkedUnpaidInvoice(booking, amountCents)",
  "new CustomEvent(customerInvoiceUpdatedEventName",
]) {
  mustInclude(savedBookings, fragment, "existing Save price review handoff");
}

for (const fragment of [
  "customerInvoiceUpdatedEventName",
  "window.addEventListener(",
  "window.removeEventListener(",
  "applyStoredInvoice(updatedInvoice)",
]) {
  mustInclude(invoiceFolder, fragment, "existing Total invoices live refresh");
}

for (const source of [savedBookings, invoiceFolder]) {
  for (const forbidden of [
    "Update amended invoice",
    "Refresh amended invoice",
    "Second invoice",
  ]) {
    mustExclude(source, forbidden, "no duplicate invoice control or lane");
  }
}

for (const fragment of [
  "Linked Pending Jobs And Unpaid Invoice Amendment Refresh",
  "single matching unpaid issued invoice",
  "same invoice number",
  "stored PDF",
  "Paid invoices",
]) {
  mustInclude(ledger, fragment, "implementation ledger amended invoice link");
  mustInclude(agents, fragment, "startup lock amended invoice link");
}

mustInclude(
  suite,
  "scripts/test-customer-folder-amended-unpaid-invoice-link-guard.mjs",
  "preactivation suite registration",
);

console.log("Customer-folder amended unpaid-invoice link guard passed.");
