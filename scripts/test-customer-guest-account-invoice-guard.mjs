import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  accounts: "lib/admin-customer-accounts-read.ts",
  accountsRoute: "app/api/admin-customer-accounts/route.ts",
  customersPage: "app/customers/page.tsx",
  ledger: "docs/current-implementation-ledger.md",
  migration: "supabase/migrations/202606040001_first_admin_booking_customer_persistence.sql",
  persistence: "lib/customer-invoice-record-persistence.ts",
  profile: "app/customers/[customerId]/customer-company-profile-editor.tsx",
  savedBookings: "app/customers/[customerId]/saved-bookings-panel.tsx",
  suite: "scripts/test-preactivation-verification-suite.mjs",
};
const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")])),
);

function includes(text, fragment, label) {
  assert.equal(text.includes(fragment), true, `${label} must include ${fragment}`);
}

includes(source.migration, "'hotel'", "existing customer classification schema");
includes(source.accounts, 'customer_type: enabled ? "hotel" : "corporate"', "exact classification write");
includes(source.accounts, 'guest_account_billing_enabled: record.customer_type === "hotel"', "safe classification read");
includes(source.accountsRoute, 'allowServerSessionRoleMethodsWithoutRequestToken: ["PATCH"]', "admin PATCH boundary");

const actionRowStart = source.profile.indexOf('className="flex flex-wrap items-center justify-end gap-2"');
const fieldsStart = source.profile.indexOf('className="mt-3 grid gap-2 sm:grid-cols-2"');
const actionRow = source.profile.slice(actionRowStart, fieldsStart);
assert.equal(
  actionRowStart !== -1 && fieldsStart > actionRowStart &&
    actionRow.includes("Hotel / Tour Agency") &&
    actionRow.includes("CustomerAccountDangerZone") &&
    actionRow.includes("Save profile"),
  true,
  "Hotel / Tour Agency checkbox must stay in the existing profile action row",
);

for (const fragment of [
  "customerFolderTravelerInvoiceGroups(",
  'params.set("guest_account_billing", "1")',
  "if (guestAccountBillingEnabled && bookings.length > 0)",
  "bookerId: null",
  "travelerId: null",
  'data-customer-folder-selected-identity-resolver="true"',
  "!guestAccountBillingEnabled &&",
  'surface: "invoice-review"',
]) includes(source.savedBookings, fragment, "existing blocker lane");

for (const retiredFragment of [
  'data-customer-folder-blocked-proceed="true"',
  "Proceed for this booking",
]) {
  assert.equal(
    source.savedBookings.includes(retiredFragment),
    false,
    `selected-job identity repair must not restore ${retiredFragment}`,
  );
}

for (const fragment of [
  'searchParams.get("guest_account_billing") === "1"',
  "guestAccountBillingEnabled: plainInvoiceForm.guestAccountBillingEnabled",
  "!plainInvoiceForm.guestAccountBillingEnabled",
]) includes(source.customersPage, fragment, "existing invoice handoff");

for (const fragment of [
  "hasPartialVerifiedIdentity",
  "(!hasVerifiedIdentity && !input.guestAccountBillingEnabled)",
  '.from("customers")',
  '.eq("customer_type", "hotel")',
  '.eq("customer_id", input.customerId)',
]) includes(source.persistence, fragment, "server ownership verification");

includes(source.ledger, "### Hotel And Tour Agency Guest-Account Invoice Approval", "ledger checkpoint");
includes(source.suite, "scripts/test-customer-guest-account-invoice-guard.mjs", "guard registration");

for (const forbidden of ["createCustomerInvoicePdfBytes", "sendCustomerInvoice", "stripe.checkout", "calendar.events"]) {
  assert.equal(
    source.profile.includes(forbidden) || source.savedBookings.includes(forbidden),
    false,
    `profile and blocker UI must not add ${forbidden}`,
  );
}

console.log("Customer guest-account invoice guard passed.");
