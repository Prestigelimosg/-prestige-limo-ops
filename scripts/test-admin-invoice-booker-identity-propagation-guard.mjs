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
  "travelerId: customerInvoicePrepRow.travelerId",
  "if (!customerInvoicePrepRow.bookerId || !customerInvoicePrepRow.travelerId)",
  "Assign a verified traveller and PA / booker to the exact saved booking before issuing.",
  'data-plain-invoice-booking-reference="true"',
  "updatePlainInvoiceSavedBooking(",
  "plainInvoiceSavedBookingRequestSequenceRef",
  "setPlainInvoiceSavedBookings(result.savedBookings)",
  "Loading exact saved bookings for",
  "referenceClearsVerifiedOwnership",
  "Reference changed. Select the exact saved booking and verified PA again before Issue or Email.",
  "readCustomerFolderExactBooking(safeCustomerFolderDispatchHandoffReference(booking))",
  "setPlainInvoiceSavedBookings(targetBookings)",
  "bookerId: exactBookerId",
  "travelerId: exactTravelerId",
  "bookingReference: firstInvoiceRow.bookingReference",
  "All ${invoiceRows.length} selected job",
  "The selected jobs do not share the same verified customer and PA / booker.",
  "bookerId: plainInvoiceForm.bookerId",
  "bookingReference: plainInvoiceForm.bookingReference",
  "Select an exact saved booking with a verified traveller and PA / booker before issuing Create Invoice.",
  "Select an exact saved booking with a verified traveller and PA / booker before emailing Create Invoice.",
]) assert.ok((read + page).includes(fragment), `Missing ${fragment}`);

assert.ok(persistence.includes("bookerId?: unknown"));
assert.ok(persistence.includes("travelerId?: unknown"));
assert.ok(persistence.includes("booker_id: sanitized.data.bookerId"));
assert.ok(persistence.includes('sanitized.data.documentState === "issued"'));
assert.ok(persistence.includes('.from("bookings")'));
assert.ok(persistence.includes('.in("booking_reference", bookingReferences)'));
assert.ok(persistence.includes('.eq("customer_id", input.customerId)'));
assert.ok(persistence.includes('.eq("booker_id", input.bookerId)'));
assert.ok(persistence.includes('.eq("traveler_id", input.travelerId)'));
assert.ok(persistence.includes('bookingReferences.includes("ADM-20260712063110")'));
assert.ok(persistence.includes('item.bookingReference || sanitized.data.bookingReference'));
assert.ok(persistence.includes(", booker_id, traveler_id, document_type"));
console.log("Admin invoice booker identity propagation guard passed.");
