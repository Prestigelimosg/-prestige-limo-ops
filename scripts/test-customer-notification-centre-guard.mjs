import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = "app/my-bookings/page.tsx";
const adapterPath = "lib/customer-portal-trip-updates-adapter.ts";
const savedBookingsAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const persistencePath = "lib/customer-driver-app-notification-persistence.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-customer-notification-centre-guard.mjs";

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function excludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must stay excluded.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n## ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [page, adapter, savedBookingsAdapter, persistence, ledger, suite] = await Promise.all(
  [pagePath, adapterPath, savedBookingsAdapterPath, persistencePath, ledgerPath, suitePath].map((path) =>
    readFile(path, "utf8"),
  ),
);

for (const fragment of [
  "loadCustomerNotificationCentre",
  "customerNotificationCentreOpen",
  'data-customer-notification-centre-trigger="true"',
  'aria-controls="customer-notification-centre"',
  'data-customer-notification-centre="true"',
  'id="customer-notification-centre"',
  'data-customer-notification-purpose="booking-update"',
  "Current alerts",
  "Booking {alert.publicBookingReference}",
  "No current alerts.",
  "Customer alerts are temporarily unavailable. Refresh before relying on this count.",
  "customerNotificationTime(alert.createdAt)",
  "void openCustomerNotificationBooking(alert.publicBookingReference)",
  'nextUrl.searchParams.set("booking", publicBookingReference)',
  'nextUrl.searchParams.set("tracking", "1")',
  'nextUrl.searchParams.set("saved_page", String(target.page))',
  'nextUrl.searchParams.set("traveler_id", String(travelerId))',
  "findCustomerPortalSavedBooking",
]) {
  includes(page, fragment, `Customer notification centre UI ${fragment}`);
}

for (const fragment of [
  "export async function findCustomerPortalSavedBooking",
  'params.set("page", String(page))',
  'params.set("traveler_id", String(travelerId))',
  "hasNextPage",
  "publicBookingReference",
]) {
  includes(savedBookingsAdapter, fragment, `Customer saved-booking exact-alert lookup ${fragment}`);
}

const notificationOpenSource = page.slice(
  page.indexOf("async function openCustomerNotificationBooking"),
  page.indexOf("return (", page.indexOf("async function openCustomerNotificationBooking")),
);
excludes(
  notificationOpenSource,
  /verified_boss_name|passengerName|companyName|bookerName/i,
  "Customer notification exact-booking lookup identity inference",
);

assert.match(
  page,
  /customerNotificationCentreStatus === "ready"\s*\? String\(customerNotificationCentreCount\)\s*:\s*customerNotificationCentreCount > 0\s*\? `\$\{customerNotificationCentreCount\}\+`\s*:\s*"\?"/,
  "Unavailable Customer alert reads must never claim a complete zero count.",
);
assert.match(
  page,
  /portalBookingsLoadState !== "ready"[\s\S]*?return;[\s\S]*?refreshCustomerNotificationCentre\(\{ signal: controller\.signal \}\)/,
  "Customer alert reads must run only after the authenticated booking lane is ready.",
);

for (const fragment of [
  "export type CustomerNotificationCentreAlert",
  "export type CustomerNotificationCentreResult",
  "export async function loadCustomerNotificationCentre",
  'params.set("view", "centre")',
  '"x-prestige-customer-purpose": "customer-in-app-notification-read"',
  'credentials: "same-origin"',
  'cache: "no-store"',
  'record.delivery_surface !== "customer_app"',
  "record.external_send !== false",
  "record.provider_send !== false",
]) {
  includes(adapter, fragment, `Customer notification centre adapter ${fragment}`);
}

for (const fragment of [
  '"view"',
  'requestUrl.searchParams.get("view") === "centre"',
  "loadCustomerNotificationCentreForBoundary",
  "loadCustomerNotificationCentreRowsSnapshot",
  "const firstSnapshot = await loadCustomerNotificationCentreRowsSnapshot",
  "const secondSnapshot = await loadCustomerNotificationCentreRowsSnapshot",
  "secondSnapshot.data[index]?.id !== id",
  'eq("delivery_surface", "customer_app")',
  'eq("notification_status", "queued")',
  '.in("booking_reference", bookingReferenceBatch)',
  '.order("id", { ascending: false })',
  '.gt("booking_reference", bookingReferenceCursor)',
  '.lt("id", notificationIdCursor)',
  ".limit(customerNotificationCentrePageSize)",
  '{ column: "company_id", value: membership.company_id }',
  '{ column: "booker_id", value: membership.booker_id }',
  'filters.push({ column: "traveler_id", value: membership.traveler_id })',
  'value: activeAccessAccount.data.customer_account_reference',
  "public_booking_reference",
  "notification_count",
  "alert_count",
  'delivery_surface: "customer_app"',
  "external_send: false",
  "provider_send: false",
]) {
  includes(persistence, fragment, `Customer notification centre persistence ${fragment}`);
}

const centreSource = page.slice(
  page.indexOf('data-customer-notification-centre="true"'),
  page.indexOf("companyContactLines.length > 0"),
);
excludes(
  centreSource,
  /customer price|driver payout|paynow|billing|invoice amount|internal admin note|parser debug|raw token/i,
  "Customer notification centre rendered privacy boundary",
);

const ledgerSection = sectionBetween(
  ledger,
  "## Customer My Bookings Current-Alert Purpose Centre (source checkpoint 2026-09-06)",
);
for (const phrase of [
  "one compact `Alerts N` control",
  "verified Company + Booker account",
  "existing `/api/customer-app-notifications` GET route",
  "No notification status is mutated",
  "No schema, migration, Expo OTA, EAS build, Apple/TestFlight action",
  "`scripts/test-customer-notification-centre-guard.mjs`",
]) {
  includes(ledgerSection, phrase, `Customer notification centre ledger ${phrase}`);
}

includes(suite, guardPath, "Customer notification centre preactivation registration");

console.log("Customer notification centre guard passed");
