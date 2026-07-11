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
]) assert.ok((read + page).includes(fragment), `Missing ${fragment}`);

console.log("Admin invoice booker identity propagation guard passed.");
assert.ok(persistence.includes("bookerId?: unknown"));
assert.ok(persistence.includes("booker_id: sanitized.data.bookerId"));
assert.ok(persistence.includes(", booker_id, document_type"));
