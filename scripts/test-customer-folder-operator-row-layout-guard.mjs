import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = "app/customers/[customerId]/page.tsx";
const invoiceFolderPanelPath = "app/customers/[customerId]/customer-invoice-folder-panel.tsx";
const prefixPanelPath = "app/customers/[customerId]/invoice-prefix-settings-panel.tsx";
const savedBookingsPanelPath = "app/customers/[customerId]/saved-bookings-panel.tsx";

const [page, invoiceFolderPanel, prefixPanel, savedBookingsPanel] = await Promise.all(
  [pagePath, invoiceFolderPanelPath, prefixPanelPath, savedBookingsPanelPath].map((path) => readFile(path, "utf8")),
);

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

for (const fragment of [
  'data-customer-folder-compact-summary="true"',
  'data-customer-folder-compact-admin-rows="true"',
  'data-customer-folder-details="true"',
  'data-customer-booking-history="true"',
]) {
  assertIncludes(page, fragment, `compact customer folder marker ${fragment}`);
}

assertIncludes(
  invoiceFolderPanel,
  'data-customer-invoice-rules="true"',
  "compact customer folder marker data-customer-invoice-rules",
);

for (const forbidden of [
  'className="grid gap-4 lg:grid-cols-3"',
  'className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"',
  'className="mt-4 border-t border-slate-200 pt-4"',
]) {
  assert.equal(page.includes(forbidden), false, `Customer folder should not keep giant card pattern ${forbidden}.`);
  assert.equal(prefixPanel.includes(forbidden), false, `Prefix panel should not keep giant card pattern ${forbidden}.`);
  assert.equal(savedBookingsPanel.includes(forbidden), false, `Saved bookings panel should not keep giant card pattern ${forbidden}.`);
}

for (const fragment of [
  "rounded-md border border-slate-200 bg-slate-50 px-3 py-2",
  "text-sm font-bold text-slate-950",
  "text-xs font-semibold leading-5",
]) {
  assertIncludes(prefixPanel, fragment, `compact prefix panel fragment ${fragment}`);
}

assertIncludes(
  savedBookingsPanel,
  "rounded-md border border-slate-200 bg-white p-3 shadow-sm",
  "compact saved bookings panel",
);
assertIncludes(
  savedBookingsPanel,
  "data-customer-folder-saved-bookings-open-dispatch",
  "customer folder jobs open/edit dispatch action",
);

console.log("Customer folder operator row layout guard passed");
