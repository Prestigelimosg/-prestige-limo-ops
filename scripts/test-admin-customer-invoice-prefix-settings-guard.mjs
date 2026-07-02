import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperPath = "lib/admin-customer-invoice-prefix-settings.ts";
const routePath = "app/api/admin-customer-invoice-prefix-settings/route.ts";
const panelPath = "app/customers/[customerId]/invoice-prefix-settings-panel.tsx";
const customerFolderPath = "app/customers/[customerId]/page.tsx";
const appPagePath = "app/page.tsx";
const customerBookingPagePath = "app/book/page.tsx";
const customerPortalPagePath = "app/my-bookings/page.tsx";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-customer-invoice-prefix-settings-guard.mjs";

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

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [
  helper,
  route,
  panel,
  customerFolder,
  appPage,
  customerBookingPage,
  customerPortalPage,
  driverJobPage,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(panelPath, "utf8"),
  readFile(customerFolderPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(customerBookingPagePath, "utf8"),
  readFile(customerPortalPagePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

for (const fragment of [
  'export const customerInvoiceSequencesTableName = "customer_invoice_sequences";',
  'number_format: "PREFIX-0001";',
  'sequence_scope: "lifetime";',
  "prefixLockedError",
  "last_reserved_invoice_number",
  "last_reserved_sequence_number",
  "next_sequence_number",
  "const prefixLocked = true;",
  "current?.prefix_locked",
  "current.invoice_prefix !== input.invoice_prefix",
  "Customer invoice prefix is locked after it is saved or auto-created for this customer/account.",
  "databaseErrorStatus(error)",
  'code === "23505" ? 409 : 500',
]) {
  assertIncludes(helper, fragment, `prefix helper fragment ${fragment}`);
}

for (const forbiddenHelperFragment of [
  "reserve_monthly_invoice_number_for_issue_record",
  "customer_invoice_records",
  "createCustomerInvoiceRecord",
  "downloadCustomerInvoicePdf",
  "sendEmail",
  "sendWhatsapp",
  "sendWhatsApp",
  "sendSms",
  "sendTelegram",
  "driver_payout_rules",
]) {
  assertExcludes(helper, forbiddenHelperFragment, "prefix helper side-effect boundary");
}

for (const fragment of [
  'refererUrl.pathname === "/customers"',
  'refererUrl.pathname.startsWith("/customers/")',
  'method === "GET" || method === "POST"',
  'boundary.context.role !== "admin" && boundary.context.role !== "local-dev-admin"',
  '"x-prestige-admin-purpose"',
  "loadAdminCustomerInvoicePrefixSetting",
  "saveAdminCustomerInvoicePrefixSetting",
]) {
  assertIncludes(route, fragment, `prefix route boundary fragment ${fragment}`);
}

for (const forbiddenRouteFragment of [
  'refererUrl.pathname === "/"',
  '"/settings/invoice"',
  "resolveAdminDispatcherBoundary(request",
  "reserveAdminMonthlyInvoiceNumber",
  "createCustomerInvoiceRecord",
]) {
  assertExcludes(route, forbiddenRouteFragment, "prefix route narrow boundary");
}

for (const fragment of [
  'const adminCustomerInvoicePrefixSettingsApiPath =',
  '"/api/admin-customer-invoice-prefix-settings"',
  'data-admin-customer-invoice-prefix-settings="true"',
  'data-admin-customer-invoice-prefix-input="true"',
  'data-admin-customer-invoice-prefix-load-action="true"',
  'data-admin-customer-invoice-prefix-save-action="true"',
  'data-admin-customer-invoice-prefix-policy="true"',
  'data-admin-customer-invoice-prefix-feedback="true"',
  '"PREFIX-0001"',
  '"Lifetime"',
  "lockedPrefixFeedback",
  "This customer already has locked prefix",
  "This customer already has a locked prefix and it is not changeable.",
  "await fetchPrefixSetting()",
  "prefixSettingsFailureMessage",
  "Prefix ${prefix || \"this value\"} is already used by another customer/account.",
  "Invoice prefix was not saved. No invoice number was reserved; reload this customer folder and try again.",
  'method: "GET"',
  'method: "POST"',
  '"x-prestige-admin-purpose": "admin-booking-persistence"',
]) {
  assertIncludes(panel, fragment, `prefix panel fragment ${fragment}`);
}

assertIncludes(
  customerFolder,
  'import { CustomerInvoicePrefixSettingsPanel } from "./invoice-prefix-settings-panel";',
  "customer folder prefix panel import",
);
assertIncludes(
  customerFolder,
  "<CustomerInvoicePrefixSettingsPanel",
  "customer folder prefix panel mount",
);
assertIncludes(
  customerFolder,
  "customerAccount={customer.companyName}",
  "customer folder account binding",
);
assertIncludes(
  customerFolder,
  "suggestedPrefix={customer.invoicePrefix}",
  "customer folder suggested prefix binding",
);

for (const forbiddenAppPageFragment of [
  "/api/admin-customer-invoice-prefix-settings",
  "CustomerInvoicePrefixSettingsPanel",
]) {
  assertExcludes(appPage, forbiddenAppPageFragment, "active dashboard invoice workbench unchanged");
}

assertIncludes(
  appPage,
  "function deriveAdminMonthlyInvoicePrefix(customerAccount: string | null | undefined)",
  "existing monthly reservation prefix derivation still present",
);
assertIncludes(
  appPage,
  'const adminMonthlyInvoiceNumberReservationsApiPath =',
  "existing monthly invoice reservation route still present",
);

for (const publicSource of [customerBookingPage, customerPortalPage, driverJobPage]) {
  for (const forbiddenPublicFragment of [
    "/api/admin-customer-invoice-prefix-settings",
    "data-admin-customer-invoice-prefix-settings",
    "CustomerInvoicePrefixSettingsPanel",
    "customer_invoice_sequences",
  ]) {
    assertExcludes(publicSource, forbiddenPublicFragment, "public/customer/driver source boundary");
  }
}

const ledgerSection = sectionBetween(
  ledger,
  "### Admin Customer Invoice Prefix Settings Lane",
);

for (const phrase of [
  "Customer-specific invoice prefix settings are now owner-approved for an admin customer-folder lane only.",
  "The approved policy is `PREFIX-0001`, lifetime sequence, prefix locked once the customer/account row is admin-saved or auto-created, no reuse of voided/cancelled numbers, and no automatic prefix change on customer/company rename.",
  "The implementation stores settings in the existing `customer_invoice_sequences` table through `lib/admin-customer-invoice-prefix-settings.ts` and `/api/admin-customer-invoice-prefix-settings`.",
  "The existing admin monthly invoice number reservation RPC now treats the browser-derived prefix as an auto-generated fallback only: an existing saved `customer_invoice_sequences` prefix wins, and if no row exists the RPC creates one from the fallback prefix and starts at `-0001`.",
  "The new route allows same-origin `/customers` and `/customers/*` referers only, requires the existing admin purpose header, allows guarded reads for admin/dispatcher server sessions, and requires the admin role or local admin surface for writes.",
  "The UI is limited to the existing customer folder Invoices area via `CustomerInvoicePrefixSettingsPanel`; `/settings/invoice`, the dashboard monthly invoice reservation workbench, customer portal, public booking, and driver pages are not wired to this prefix route.",
  "This lane does not create invoices, execute invoice-number reservations, generate PDFs, send invoice/customer/provider messages, activate payment links, record payments, create payouts, change the running-number digit width, change DB schema, change env, use Vercel CLI, or touch GPS/live-location.",
  "Focused guard coverage lives in `scripts/test-admin-customer-invoice-prefix-settings-guard.mjs` and `scripts/test-admin-monthly-invoice-saved-prefix-precedence-guard.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `prefix settings ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation prefix settings guard registration");
assertIncludes(
  preactivationSuite,
  "scripts/test-admin-monthly-invoice-saved-prefix-precedence-guard.mjs",
  "preactivation saved-prefix precedence guard registration",
);

console.log("Admin customer invoice prefix settings guard passed.");
