import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  migration: "supabase/migrations/20260719064413_traveler_invoice_separation.sql",
  travelerIndexMigration:
    "supabase/migrations/20260719070000_traveler_invoice_record_traveler_index.sql",
  identityScopeRepairMigration:
    "supabase/migrations/20260719084000_fix_traveler_invoice_sequence_identity_scope.sql",
  prefixHelper: "lib/admin-customer-invoice-prefix-settings.ts",
  prefixPanel: "app/customers/[customerId]/invoice-prefix-settings-panel.tsx",
  folderPage: "app/customers/[customerId]/page.tsx",
  savedBookingsPanel: "app/customers/[customerId]/saved-bookings-panel.tsx",
  customersPage: "app/customers/page.tsx",
  persistence: "lib/customer-invoice-record-persistence.ts",
  ledger: "docs/current-implementation-ledger.md",
  suite: "scripts/test-preactivation-verification-suite.mjs",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}`);
}

for (const fragment of [
  "add column if not exists traveler_id bigint",
  "add column if not exists booker_id bigint",
  "customer_invoice_sequences_traveler_key",
  "where traveler_id is not null",
  "customer_invoice_sequences_legacy_account_key",
  "add column if not exists traveler_id bigint",
  "customer_invoice_records_invoice_number_check",
  "customer_invoice_records_credit_note_original_check",
  "reserve_customer_invoice_number",
  "security invoker",
  "revoke all on function public.reserve_customer_invoice_number",
  "grant execute on function public.reserve_customer_invoice_number",
]) {
  includes(sources.migration, fragment, `traveller invoice migration ${fragment}`);
}

includes(
  sources.travelerIndexMigration,
  "customer_invoice_records_traveler_idx",
  "stored invoice traveller foreign-key index",
);

for (const fragment of [
  "create or replace function public.reserve_customer_invoice_number(",
  "where sequence.booker_id = p_booker_id",
  "and sequence.traveler_id = p_traveler_id",
  "Customer display labels are document metadata and never identity evidence",
  "revoke all on function public.reserve_customer_invoice_number",
  "grant execute on function public.reserve_customer_invoice_number",
]) {
  includes(
    sources.identityScopeRepairMigration,
    fragment,
    `traveller invoice identity-scope repair ${fragment}`,
  );
}

assert.equal(
  sources.identityScopeRepairMigration.includes("where sequence.customer_account = v_customer_account"),
  false,
  "verified traveller invoice reservation must not use a mutable customer display label as sequence identity",
);

for (const fragment of [
  "booker_id: number | null",
  "traveler_id: number | null",
  '"booker_id"',
  '"traveler_id"',
  '.eq("traveler_id", input.traveler_id)',
  '.eq("booker_id", input.booker_id)',
  '.from("travelers")',
  "mismatchedTravelerPrefixSettingsError",
]) {
  includes(sources.prefixHelper, fragment, `traveller prefix helper ${fragment}`);
}

for (const fragment of [
  "customerId: string",
  'data-admin-customer-traveler-invoice-prefix="true"',
  'data-admin-customer-traveler-invoice-prefix-load="true"',
  'data-admin-customer-traveler-invoice-prefix-save="true"',
  '"/api/admin-customer-saved-bookings"',
  "traveler_id",
  "booker_id",
  "passenger_name",
  "One locked lifetime sequence per verified traveller",
]) {
  includes(sources.prefixPanel, fragment, `traveller prefix panel ${fragment}`);
}

includes(sources.folderPage, "customerId={customer.id}", "existing prefix panel customer folder binding");

for (const fragment of [
  "booker_id?: number | null",
  "customerFolderTravelerInvoiceGroups",
  "Missing verified traveller identity",
  'data-customer-folder-traveler-invoice-group="true"',
  "Review {group.passengerName} invoice",
]) {
  includes(sources.savedBookingsPanel, fragment, `customer folder traveller grouping ${fragment}`);
}

for (const fragment of [
  "travelerId: number | null",
  "exactTravelerId",
  "mismatchedTraveler",
  "The selected jobs do not share one verified traveller",
  "travelerId: exactTravelerId",
  "travelerId: plainInvoiceForm.travelerId",
]) {
  includes(sources.customersPage, fragment, `invoice handoff traveller boundary ${fragment}`);
}

for (const fragment of [
  "travelerId?: unknown",
  "travelerId: number | null",
  'select("booking_reference, traveler_id")',
  '.eq("traveler_id", input.travelerId)',
  "traveler_id: sanitized.data.travelerId",
  'sanitized.data.documentState === "issued"',
  '"reserve_customer_invoice_number"',
  "p_traveler_id: input.travelerId",
]) {
  includes(sources.persistence, fragment, `stored invoice traveller ownership ${fragment}`);
}

for (const forbidden of ["stripe.checkout", "checkout.sessions", "payment_intent"]) {
  assert.equal(
    [sources.prefixHelper, sources.prefixPanel, sources.savedBookingsPanel, sources.persistence].some((source) =>
      source.includes(forbidden),
    ),
    false,
    `traveller separation must not activate ${forbidden}`,
  );
}

includes(
  sources.ledger,
  "### Verified Traveller Invoice Separation and Prefix Ownership (2026-07-19)",
  "traveller invoice ledger checkpoint",
);
includes(
  sources.suite,
  "scripts/test-customer-traveler-invoice-separation-guard.mjs",
  "traveller invoice guard registration",
);

console.log("Customer traveller invoice separation guard passed.");
