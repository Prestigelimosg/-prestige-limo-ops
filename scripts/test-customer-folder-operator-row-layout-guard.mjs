import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { formatSingaporePickupDisplay } from "../lib/singapore-pickup-display.ts";

const pagePath = "app/customers/[customerId]/page.tsx";
const customersPagePath = "app/customers/page.tsx";
const invoiceFolderPanelPath = "app/customers/[customerId]/customer-invoice-folder-panel.tsx";
const prefixPanelPath = "app/customers/[customerId]/invoice-prefix-settings-panel.tsx";
const savedBookingsPanelPath = "app/customers/[customerId]/saved-bookings-panel.tsx";

const [page, customersPage, invoiceFolderPanel, prefixPanel, savedBookingsPanel] = await Promise.all(
  [pagePath, customersPagePath, invoiceFolderPanelPath, prefixPanelPath, savedBookingsPanelPath].map((path) =>
    readFile(path, "utf8"),
  ),
);

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

for (const fragment of [
  'data-customer-booking-history="true"',
]) {
  assertIncludes(page, fragment, `compact customer folder marker ${fragment}`);
}

assertIncludes(
  invoiceFolderPanel,
  'data-customer-invoice-rules="true"',
  "compact customer folder marker data-customer-invoice-rules",
);
assertIncludes(
  invoiceFolderPanel,
  "Paid this month",
  "customer invoice card paid-this-month summary",
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
  page,
  "rounded-xl border border-amber-500 border-l-[12px] border-t-8 border-t-slate-950 bg-amber-50 p-4 shadow-md",
  "classic black-and-gold customer profile sector",
);
assertIncludes(
  invoiceFolderPanel,
  "overflow-hidden rounded-xl border border-amber-500 border-l-[12px] border-t-8 border-t-slate-950 bg-amber-50 shadow-md",
  "classic black-and-gold total invoices sector",
);
assertIncludes(
  savedBookingsPanel,
  "rounded-xl border border-amber-500 border-l-[12px] border-t-8 border-t-slate-950 bg-amber-50 p-4 shadow-md",
  "classic black-and-gold saved bookings sector",
);
assertIncludes(
  savedBookingsPanel,
  "rounded-xl border border-amber-500 border-l-[12px] border-t-8 border-t-slate-950 bg-amber-50 p-4 shadow-md",
  "classic black-and-gold selected invoice review sector",
);
for (const fragment of [
  "data-customer-folder-saved-bookings-edit",
  "data-customer-folder-saved-bookings-delete",
  "data-customer-folder-saved-bookings-create-invoice",
]) {
  assertIncludes(savedBookingsPanel, fragment, `customer folder jobs action ${fragment}`);
}

assertIncludes(
  savedBookingsPanel,
  'formatSingaporePickupDisplay(booking.pickup_at, "Pickup not available")',
  "customer folder unbilled row Singapore pickup display",
);
assertIncludes(
  savedBookingsPanel,
  '["Pickup time", formatSingaporePickupDisplay(booking.pickup_at)]',
  "customer folder expanded Singapore pickup display",
);
assertIncludes(
  customersPage,
  'formatSingaporePickupDisplay(booking.pickup_at, "Not available")',
  "main Customers saved-job detail Singapore pickup display",
);
assert.equal(
  savedBookingsPanel.includes("{displayText(booking.pickup_at"),
  false,
  "customer folder rows must not render raw pickup_at values",
);
assert.equal(
  customersPage.includes("{savedBookingDisplayText(booking.pickup_at"),
  false,
  "main Customers saved-job details must not render raw pickup_at values",
);
assert.equal(
  formatSingaporePickupDisplay("2026-07-13T03:00:00+00:00"),
  "13 Jul 2026, 1100hrs SGT",
  "UTC saved pickup must render in Singapore local time",
);
assert.equal(
  formatSingaporePickupDisplay("2026-07-13 11:00"),
  "13 Jul 2026, 1100hrs SGT",
  "bare saved pickup must retain its Singapore-local clock face",
);

console.log("Customer folder operator row layout guard passed");
