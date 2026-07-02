import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const savedPrefixMigrationPath =
  "supabase/migrations/202607020001_monthly_invoice_number_saved_prefix_precedence.sql";
const appPagePath = "app/page.tsx";
const reservationHelperPath = "lib/admin-monthly-invoice-number-reservation.ts";
const prefixHelperPath = "lib/admin-customer-invoice-prefix-settings.ts";
const prefixRoutePath = "app/api/admin-customer-invoice-prefix-settings/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const customerBookingPagePath = "app/book/page.tsx";
const customerPortalPagePath = "app/my-bookings/page.tsx";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const guardScript =
  "scripts/test-admin-monthly-invoice-saved-prefix-precedence-guard.mjs";

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
  savedPrefixMigration,
  appPage,
  reservationHelper,
  prefixHelper,
  prefixRoute,
  ledger,
  preactivationSuite,
  customerBookingPage,
  customerPortalPage,
  driverJobPage,
] = await Promise.all([
  readFile(savedPrefixMigrationPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(reservationHelperPath, "utf8"),
  readFile(prefixHelperPath, "utf8"),
  readFile(prefixRoutePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(customerBookingPagePath, "utf8"),
  readFile(customerPortalPagePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
]);

for (const fragment of [
  "create or replace function public.reserve_monthly_invoice_number_for_issue_record",
  "v_requested_invoice_prefix text := upper(btrim(coalesce(p_invoice_prefix, '')))",
  "on conflict (customer_account) do nothing",
  "from public.customer_invoice_sequences as cis",
  "for update",
  "v_invoice_prefix := v_sequence.invoice_prefix",
  "v_invoice_number := v_invoice_prefix || '-' || lpad(v_sequence_number::text, 4, '0')",
  "update public.monthly_invoice_issue_records as mir",
  "update public.customer_invoice_sequences as cis",
]) {
  assertIncludes(savedPrefixMigration, fragment, `saved-prefix migration fragment ${fragment}`);
}

assertExcludes(
  savedPrefixMigration,
  "invoice_prefix_mismatch",
  "saved prefix must beat browser fallback instead of mismatching",
);

for (const fragment of [
  "function deriveAdminMonthlyInvoicePrefix(customerAccount: string | null | undefined)",
  "const invoicePrefix = deriveAdminMonthlyInvoicePrefix(customerAccount);",
  "invoice_prefix: invoicePrefix",
  ': "Reserve number";',
]) {
  assertIncludes(appPage, fragment, `reservation fallback UI fragment ${fragment}`);
}
assertExcludes(
  appPage,
  "monthlyInvoiceNumberReservationPrefix",
  "invoice reservation button must not preview a browser fallback prefix as final",
);
assertExcludes(
  appPage,
  "Reserve ${monthlyInvoiceNumberReservationPrefix}",
  "invoice reservation button must not display stale derived prefix",
);

for (const fragment of [
  "reserve_monthly_invoice_number_for_issue_record",
  "p_invoice_prefix: input.invoice_prefix",
  "new RegExp(`^${invoicePrefix}-[0-9]{4,}$`).test(invoiceNumber)",
]) {
  assertIncludes(reservationHelper, fragment, `reservation helper fragment ${fragment}`);
}
assertExcludes(
  reservationHelper,
  ".from(",
  "reservation helper must reserve only through the server RPC",
);

for (const fragment of [
  "number_format: \"PREFIX-0001\";",
  "sequence_scope: \"lifetime\";",
  "const prefixLocked = true;",
  "current?.prefix_locked",
  "Customer invoice prefix is locked after it is saved or auto-created for this customer/account.",
]) {
  assertIncludes(prefixHelper, fragment, `customer prefix helper fragment ${fragment}`);
}

for (const fragment of [
  'refererUrl.pathname === "/customers"',
  'refererUrl.pathname.startsWith("/customers/")',
  'boundary.context.role !== "admin" && boundary.context.role !== "local-dev-admin"',
]) {
  assertIncludes(prefixRoute, fragment, `customer prefix route admin boundary fragment ${fragment}`);
}
for (const forbiddenRouteFragment of [
  'refererUrl.pathname === "/"',
  '"/settings/invoice"',
  '"/book"',
  '"/my-bookings"',
  '"/driver-job"',
]) {
  assertExcludes(prefixRoute, forbiddenRouteFragment, "customer prefix route forbidden referer");
}

for (const publicSource of [customerBookingPage, customerPortalPage, driverJobPage]) {
  for (const forbiddenPublicFragment of [
    "/api/admin-customer-invoice-prefix-settings",
    "CustomerInvoicePrefixSettingsPanel",
    "data-admin-customer-invoice-prefix-settings",
    "customer_invoice_sequences",
  ]) {
    assertExcludes(publicSource, forbiddenPublicFragment, "public/customer/driver prefix boundary");
  }
}

const ledgerSection = sectionBetween(
  ledger,
  "### Admin Customer Invoice Prefix Settings Lane",
);

for (const phrase of [
  "The approved policy is `PREFIX-0001`, lifetime sequence, prefix locked once the customer/account row is admin-saved or auto-created, no reuse of voided/cancelled numbers, and no automatic prefix change on customer/company rename.",
  "The existing admin monthly invoice number reservation RPC now treats the browser-derived prefix as an auto-generated fallback only: an existing saved `customer_invoice_sequences` prefix wins, and if no row exists the RPC creates one from the fallback prefix and starts at `-0001`.",
  "This lane does not create invoices, execute invoice-number reservations, generate PDFs, send invoice/customer/provider messages, activate payment links, record payments, create payouts, change the running-number digit width, change DB schema, change env, use Vercel CLI, or touch GPS/live-location.",
]) {
  assertIncludes(ledgerSection, phrase, `saved-prefix ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation saved-prefix guard registration");

console.log("Admin monthly invoice saved-prefix precedence guard passed.");
