#!/usr/bin/env node
import { readFile } from "node:fs/promises";

function assertIncludes(source, fragment, label) {
  if (!source.includes(fragment)) {
    throw new Error(`Missing ${label}: ${fragment}`);
  }
}

function assertExcludes(source, fragment, label) {
  if (source.includes(fragment)) {
    throw new Error(`Unexpected ${label}: ${fragment}`);
  }
}

const adminPage = await readFile("app/page.tsx", "utf8");
const publicBookingPage = await readFile("app/book/page.tsx", "utf8");
const portalPage = await readFile("app/my-bookings/page.tsx", "utf8");
const ledger = await readFile("docs/current-implementation-ledger.md", "utf8");

[
  'data-admin-dispatch-form-density="slim-booking-details"',
  'data-admin-dispatch-form-density="slim-pickup-dropoff"',
  'data-admin-dispatch-form-density="slim-pricing"',
  'data-admin-dispatch-form-density="slim-trip-extras"',
  'data-admin-dispatch-form-density="slim-driver-assignment"',
  "md:grid-cols-2 xl:grid-cols-4",
  "h-8 w-full rounded-md border border-stone-300",
  "Save + CRM creates outbound and return as two linked booking records.",
].forEach((fragment) => assertIncludes(adminPage, fragment, `admin slim dispatch form fragment`));

[
  'data-customer-booking-form-density="slim"',
  'data-customer-booking-return-trip-control="true"',
  'data-customer-booking-return-trip-fields="true"',
  "mt-1 min-h-9 w-full rounded-md border bg-white",
  "md:grid-cols-2 xl:grid-cols-4",
  "min-h-20 resize-y",
].forEach((fragment) => assertIncludes(publicBookingPage, fragment, `public booking slim form fragment`));

[
  'data-customer-portal-request-form-density="slim"',
  'data-customer-portal-return-trip-control="true"',
  'data-customer-portal-return-trip-fields="true"',
  "mt-1 min-h-9 w-full rounded-md border bg-white",
  "md:grid-cols-2 xl:grid-cols-4",
  "min-h-20 resize-y",
].forEach((fragment) => assertIncludes(portalPage, fragment, `portal request slim form fragment`));

assertExcludes(
  publicBookingPage,
  "data-customer-booking-form-density=\"giant\"",
  "public booking giant form marker",
);
assertExcludes(
  portalPage,
  "data-customer-portal-request-form-density=\"giant\"",
  "portal request giant form marker",
);

[
  "### Admin And Customer Booking Form Slimming",
  "The admin Dispatch intake forms, public `/book` request form, and customer portal New Booking Request form now use slimmer operator/customer rows",
  "This is a UI-only density pass: it does not change booking submit handlers, CRM/calendar save behavior, return-trip pairing, invoices, PDFs, payments, payouts, provider sends, GPS/live-location, env, or DB schema.",
].forEach((fragment) => assertIncludes(ledger, fragment, `slim form ledger fragment`));

console.log("Admin/customer booking form slim layout guard passed");
