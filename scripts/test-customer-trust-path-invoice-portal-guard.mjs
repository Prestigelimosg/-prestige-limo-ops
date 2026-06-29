import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bookPagePath = "app/book/page.tsx";
const portalPagePath = "app/my-bookings/page.tsx";
const customersPagePath = "app/customers/page.tsx";
const savedBookingsAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const hourlyBillingPath = "lib/hourly-billing.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScriptPath = "scripts/test-customer-trust-path-invoice-portal-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);

  return source.slice(start, end);
}

const [
  bookPage,
  portalPage,
  customersPage,
  savedBookingsAdapter,
  hourlyBilling,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(bookPagePath, "utf8"),
  readFile(portalPagePath, "utf8"),
  readFile(customersPagePath, "utf8"),
  readFile(savedBookingsAdapterPath, "utf8"),
  readFile(hourlyBillingPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const bookRequiredFieldsSection = sectionBetween(
  bookPage,
  "const requiredFields: Array<keyof BookingRequestForm> = [",
  "];",
);
const portalRequiredFieldsSection = sectionBetween(
  portalPage,
  "const requiredBookingRequestFields: Array<keyof BookingRequestForm> = [",
  "];",
);
const portalInvoiceSection = sectionBetween(
  portalPage,
  'activeSection === "Invoices"',
  'aria-labelledby="booking-search-title"',
);
const unbilledSection = sectionBetween(
  customersPage,
  'data-unbilled-customers-sector="true"',
  'data-customer-invoice-workspace="true"',
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Trust Path And Portal Invoice Folder Lock",
  "\n### ",
);

for (const fragment of [
  'import { submitCustomerBookingRequest } from "../../lib/customer-booking-request-adapter";',
  'data-customer-booking-form="true"',
  'data-customer-booking-field="pickupLocation"',
  'data-customer-booking-field="dropoffLocation"',
  'data-customer-booking-terms-acceptance="true"',
  'await submitCustomerBookingRequest(form)',
]) {
  assertIncludes(bookPage, fragment, `public booking request source fragment ${fragment}`);
}

for (const field of [
  '"contactNo"',
  '"passengerName"',
  '"pickupDate"',
  '"pickupTime"',
  '"pickupLocation"',
  '"dropoffLocation"',
]) {
  assertIncludes(bookRequiredFieldsSection, field, `public /book required field ${field}`);
  assertIncludes(portalRequiredFieldsSection, field, `customer portal request required field ${field}`);
}

assertIncludes(
  portalPage,
  "Please complete contact no., passenger name, pickup date, pickup time, pickup location, and drop-off location before submitting your request.",
  "customer portal route-field validation message",
);

for (const fragment of [
  'type InvoiceFolder = "Paid" | "Unpaid";',
  'type PortalSection = "New Booking Request" | "Invoices" | BookingFilter;',
  'const invoiceFolders: InvoiceFolder[] = ["Unpaid", "Paid"];',
  'const portalSections: PortalSection[] = ["New Booking Request", "Invoices", ...bookingFilters];',
  "const [customerInvoiceRecords, setCustomerInvoiceRecords] = useState<CustomerLocalInvoiceRecord[]>([]);",
]) {
  assertIncludes(portalPage, fragment, `customer portal invoice source fragment ${fragment}`);
}

for (const fragment of [
  'data-customer-portal-invoice-folders="true"',
  'data-customer-portal-invoice-folder={folderKey}',
  'data-customer-portal-invoice-folder-count={folderKey}',
  'data-customer-portal-invoice-month-group={folderKey}',
  'data-customer-portal-invoice-empty-row={folderKey}',
  'data-customer-portal-invoice-download={folderKey}',
  'data-customer-portal-invoice-row={invoice.invoiceNumber}',
  'data-customer-portal-invoice-download={invoice.invoiceNumber}',
  "No {folder.toLowerCase()} invoice PDFs are available in this customer folder yet.",
  "Download PDF",
  "disabled",
]) {
  assertIncludes(portalInvoiceSection, fragment, `customer portal invoice folder fragment ${fragment}`);
}

for (const fragment of [
  'data-unbilled-customers-sector="true"',
  'data-unbilled-customers-dropdown="true"',
  'data-unbilled-customers-select="true"',
  'data-unbilled-customers-scroll-list="true"',
  'data-unbilled-customers-list="true"',
  'data-unbilled-customer-prepare-invoice={row.key}',
  'data-customer-invoice-workspace="true"',
  "Review-only checkpoint. Opening a folder does not create invoice numbers, generate invoices/PDFs, send",
]) {
  assertIncludes(customersPage, fragment, `admin customers invoice checkpoint fragment ${fragment}`);
}

for (const duplicateFragment of [
  'data-unbilled-customers-selected-label="true"',
  "preparedUnbilledCustomerLabel",
]) {
  assertExcludes(unbilledSection, duplicateFragment, "unbilled customer duplicate wording under dropdown");
}

for (const fragment of [
  '"invoice"',
  '"payment"',
  '"pdf"',
  "allowedApiRecordFields",
  "allowedApiPayloadFields",
  "hasUnsafeApiRecordKeys",
  "hasUnsafeApiPayloadKeys",
]) {
  assertIncludes(savedBookingsAdapter, fragment, `customer saved-bookings privacy fragment ${fragment}`);
}

for (const fragment of [
  "export const hourlyBillingGraceMinutes = 15;",
  "Math.ceil(Math.max(0, roundedTotalMinutes - hourlyBillingGraceMinutes) / hourlyBillingUnitMinutes)",
  "Hourly bookings include 15 minutes grace after each hour; 16 minutes or more starts the next chargeable hour.",
]) {
  assertIncludes(hourlyBilling, fragment, `hourly billing lock fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /mockCustomers|mock-customers|app\/customers\/_data/i,
  /sendMail|new\s+Resend|api\.telegram\.org|twilio/i,
  /paymentIntent|checkout\.sessions|payment_link|loadStripe|new\s+Stripe/i,
  /\/api\/admin|createClient|service_role|process\.env/i,
  /driver payout|PayNow payout|payout comparisons|customer price/i,
  /internal admin notes|internal finance notes|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(portalInvoiceSection, forbiddenPattern, "customer portal invoice folder privacy/payment boundary");
}

for (const phrase of [
  "Customer `/book` and `/my-bookings` request forms both require contact number, passenger name, pickup date, pickup time, pickup location, and drop-off location before submission.",
  "The customer portal now has a compact `Invoices` section with `Unpaid` and `Paid` folders grouped by month, using browser-local issued invoice records until a customer-authenticated invoice/PDF API is approved.",
  "The portal invoice folders do not import admin mock customer data and do not call admin APIs, Stripe/payment providers, email/SMS/WhatsApp providers, or DB writes.",
  "Admin Customers keeps the Unbilled Customers checkpoint as one dropdown plus a compact scrollable table; the duplicate wording block below the dropdown is removed.",
  "Customer saved-booking reads remain booking-only and strip invoice/payment/PDF/finance/internal fields, so invoice rows need their own future customer-scoped source before downloads or email sending go live.",
  "Hourly billing remains locked to the 15-minute grace rule: 16 minutes or more starts the next chargeable hour.",
  "This trust-path pass does not send invoices, activate payment links, write invoice/payment records, change env, call providers, activate GPS/live location, or deploy database migrations.",
  "Guard coverage lives in `scripts/test-customer-trust-path-invoice-portal-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScriptPath, "preactivation customer trust path guard registration");

console.log("Customer trust path invoice portal guard passed");
