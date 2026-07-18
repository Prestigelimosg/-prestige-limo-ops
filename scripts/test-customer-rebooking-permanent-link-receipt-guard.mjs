import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(
  await Promise.all(
    [
      "app/api/admin-customer-portal-access-links/route.ts",
      "app/api/customer-booking-requests/route.ts",
      "app/book/page.tsx",
      "app/page.tsx",
      "docs/current-implementation-ledger.md",
      "lib/admin-booking-persistence.ts",
      "lib/customer-booking-memory-adapter.ts",
      "lib/customer-booking-memory-read.ts",
      "lib/customer-booking-receipt-email.ts",
      "lib/customer-booking-request-adapter.ts",
      "lib/customer-portal-access-account.ts",
      "lib/customer-portal-access-link.ts",
      "scripts/test-preactivation-verification-suite.mjs",
    ].map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);

function includes(path, fragment) {
  assert.ok(files[path].includes(fragment), `${path} must include ${fragment}`);
}

const linkHelper = "lib/customer-portal-access-link.ts";
const accountHelper = "lib/customer-portal-access-account.ts";
const adminLinkRoute = "app/api/admin-customer-portal-access-links/route.ts";
const memoryRead = "lib/customer-booking-memory-read.ts";
const memoryAdapter = "lib/customer-booking-memory-adapter.ts";
const bookingRoute = "app/api/customer-booking-requests/route.ts";
const bookingAdapter = "lib/customer-booking-request-adapter.ts";
const bookingPage = "app/book/page.tsx";
const receiptHelper = "lib/customer-booking-receipt-email.ts";

for (const fragment of [
  "link_revision",
  "options.linkRevision",
  "link_revision: safeLinkRevision(payload.rev)",
]) {
  includes(linkHelper, fragment);
}
for (const fragment of [
  "updated_at",
  "link_revision",
  "companyId",
  "bookerId",
  'onConflict: "customer_account_reference"',
]) {
  includes(accountHelper, fragment);
}
assert.doesNotMatch(
  files[accountHelper],
  /onConflict:\s*referenceRecord\s*\?\s*["']customer_account_reference["']\s*:\s*["']booker_id["']/,
  "portal account creation must not target the partial booker index as an upsert conflict column",
);
for (const fragment of [
  "companyId: body.companyId",
  "bookerId: body.bookerId",
  "linkRevision: account.data.link_revision",
]) {
  includes(adminLinkRoute, fragment);
}
for (const fragment of [
  "booker_profile",
  "travelers",
  '.from("bookers")',
  '.from("travelers")',
  '.eq("booker_id", bookerId)',
]) {
  includes(memoryRead, fragment);
  includes(memoryAdapter, fragment === '.from("bookers")' || fragment === '.from("travelers")' || fragment === '.eq("booker_id", bookerId)' ? "CustomerBookingMemoryProfile" : fragment);
}
for (const fragment of [
  "context.mode === \"server-session-cookie\"",
  "Boolean(context.customer_account_reference)",
  "Boolean(context.portal_link_revision)",
  "context.portal_link_issued_at != null",
  "Number.isInteger(context.portal_link_issued_at)",
  "getServerOnlyCustomerBookingMemoryClient(context)",
]) {
  includes(memoryRead, fragment);
}
for (const fragment of [
  '"travelerId"',
  '"emailAddress"',
]) {
  includes("lib/admin-booking-persistence.ts", fragment);
}
for (const fragment of [
  "travelerId?: string",
  "bookingReference: string",
  "receiptStatus",
]) {
  includes(bookingAdapter, fragment);
}
for (const fragment of [
  "resolveCustomerSavedBookingsVerifiedIdentity(portalBoundary.data, body.travelerId)",
  "traveler_id: verifiedIdentity.data.traveler_id",
  "sendCustomerBookingReceiptEmail",
  "receipt_status",
]) {
  includes(bookingRoute, fragment);
}
for (const fragment of [
  '"emailAddress",',
  "loadCustomerBookingMemoryProfile",
  'data-customer-booking-traveler-select="true"',
  "result.bookingReference",
  "result.receiptStatus",
  "This portal link is no longer active.",
]) {
  includes(bookingPage, fragment);
}
assert.equal(
  files[bookingPage].includes("Your old saved portal access was cleared."),
  false,
  "The customer stale-link message must not claim their portal was cleared.",
);
for (const fragment of [
  'import "server-only";',
  "PRESTIGE_CUSTOMER_BOOKING_RECEIPT_EMAIL_ENABLED",
  "PRESTIGE_CUSTOMER_BOOKING_RECEIPT_EMAIL_FROM",
  "PRESTIGE_CUSTOMER_BOOKING_RECEIPT_EMAIL_RECIPIENT_ALLOWLIST",
  "https://api.resend.com/emails",
  '"Idempotency-Key"',
  "Request received — pending review",
  "This is not a booking confirmation.",
]) {
  includes(receiptHelper, fragment);
}

assert.equal(
  /driver_payout|customer_price|paynow|internal_admin|parser_debug|billing|invoice/i.test(files[receiptHelper]),
  false,
  "Customer receipt helper must not contain customer-forbidden operational fields.",
);

includes("app/page.tsx", "const companyId = customerDriverDetailsPortalCompanyId");
includes("app/page.tsx", "const customerDriverDetailsPortalBookerId =");
includes("app/page.tsx", "const customerDriverDetailsPortalCompanyId =");
includes("scripts/test-preactivation-verification-suite.mjs", "scripts/test-customer-rebooking-permanent-link-receipt-guard.mjs");
includes("docs/current-implementation-ledger.md", "### Permanent Booker Link, Rebooking Identity, and Request Receipt");

console.log("Customer permanent-link rebooking and receipt guard passed.");
