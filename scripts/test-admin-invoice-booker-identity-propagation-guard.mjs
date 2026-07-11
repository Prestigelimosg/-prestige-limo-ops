import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [read, page] = await Promise.all([
  readFile("lib/admin-customer-saved-bookings-read.ts", "utf8"),
  readFile("app/customers/page.tsx", "utf8"),
]);
const persistence = await readFile("lib/customer-invoice-record-persistence.ts", "utf8");

for (const fragment of [
  "company_id: safeIdentityId(booking.company_id)",
  "booker_id: safeIdentityId(booking.booker_id)",
  "companyId: booking.company_id ?? null",
  "bookerId: booking.booker_id ?? null",
  "bookerId: customerInvoicePrepRow.bookerId",
  "if (!customerInvoicePrepRow.bookerId)",
  "Assign a verified PA / booker to the exact saved booking before issuing.",
  'data-plain-invoice-booking-reference="true"',
  "updatePlainInvoiceSavedBooking(",
  "plainInvoiceSavedBookingRequestSequenceRef",
  "setPlainInvoiceSavedBookings(result.savedBookings)",
  "Loading exact saved bookings for",
  "referenceClearsVerifiedOwnership",
  "Reference changed. Select the exact saved booking and verified PA again before Issue or Email.",
  "const exactBooking = await loadCustomerFolderExactBookingForEdit(targetBooking)",
  "setPlainInvoiceSavedBookings([targetBooking])",
  "bookerId: exactBookerId",
  "bookingReference,",
  "Exact customer-folder job ${bookingReference} loaded with its verified PA.",
  "Exact customer-folder job ${bookingReference} has no verified PA.",
  "bookerId: plainInvoiceForm.bookerId",
  "bookingReference: plainInvoiceForm.bookingReference",
  "Select an exact saved booking with a verified PA / booker before issuing Create Invoice.",
  "Select an exact saved booking with a verified PA / booker before emailing Create Invoice.",
]) assert.ok((read + page).includes(fragment), `Missing ${fragment}`);

console.log("Admin invoice booker identity propagation guard passed.");
assert.ok(persistence.includes("bookerId?: unknown"));
assert.ok(persistence.includes("booker_id: sanitized.data.bookerId"));
assert.ok(persistence.includes('sanitized.data.documentState === "issued"'));
assert.ok(persistence.includes('.from("bookings")'));
assert.ok(persistence.includes('.eq("booking_reference", sanitized.data.bookingReference)'));
assert.ok(persistence.includes('.eq("customer_id", sanitized.data.customerId)'));
assert.ok(persistence.includes('.eq("booker_id", sanitized.data.bookerId)'));
assert.ok(persistence.includes(", booker_id, document_type"));
