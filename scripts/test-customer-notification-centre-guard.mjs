import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pagePath = "app/my-bookings/page.tsx";
const adapterPath = "lib/customer-portal-trip-updates-adapter.ts";
const savedBookingsAdapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const persistencePath = "lib/customer-driver-app-notification-persistence.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const migrationPath =
  "supabase/migrations/20260906162227_customer_notification_centre_atomic_dismiss.sql";
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

const [page, adapter, savedBookingsAdapter, persistence, ledger, migration, suite] = await Promise.all(
  [
    pagePath,
    adapterPath,
    savedBookingsAdapterPath,
    persistencePath,
    ledgerPath,
    migrationPath,
    suitePath,
  ].map((path) =>
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
  'data-customer-notification-centre-clear="true"',
  'aria-label="Clear current alerts"',
  "clearCustomerNotificationCentre",
  "customerNotificationCentreRequestSequenceRef",
  "requestSequence !== customerNotificationCentreRequestSequenceRef.current",
  "Clearing...",
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
  "clearCustomerPortalBookingDeepLink",
  "portalSavedBookingsServerPageRef.current = 1",
  "refreshCustomerPortalSavedBookings({ signal: new AbortController().signal })",
  "deepLink.travelerId !== selectedManagedBossId",
  "portalSavedBookingsTravelerIdRef.current = selectedManagedBossId",
  "portalSavedBookingsServerPageRef.current !== deepLink.savedPage",
  "portalSavedBookingsTravelerIdRef.current !== selectedManagedBossId",
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
  "export async function dismissCustomerNotificationCentre",
  'params.set("view", "centre")',
  'method: "PATCH"',
  '"x-prestige-customer-purpose": "customer-in-app-notification-read"',
  '"x-prestige-customer-purpose": "customer-in-app-notification-dismiss"',
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
  "dismissCustomerNotificationCentreForAuthenticatedRuntime",
  "dismissCustomerNotificationCentreForBoundary",
  "loadCustomerNotificationCentreRowsSnapshot",
  "const firstSnapshot = await loadCustomerNotificationCentreRowsSnapshot",
  "const secondSnapshot = await loadCustomerNotificationCentreRowsSnapshot",
  "secondSnapshot.data[index]?.id !== id",
  'eq("delivery_surface", "customer_app")',
  'eq("notification_status", "queued")',
  '"dismiss_customer_notification_centre"',
  "{ p_notification_ids: exactNotificationIds }",
  "rpcRow.updated_ids",
  "rpcRow.updated_count",
  '.select(notificationSelect, { count: "exact" })',
  ".or(intendedDriverHistoryScope)",
  ".or(driverLinkNotificationScope)",
  ".range(offset, offset + params.limit - 1)",
  "const uniqueRecords = new Map",
  '.in("booking_reference", bookingReferenceBatch)',
  '.order("id", { ascending: false })',
  '.gt("booking_reference", bookingReferenceCursor)',
  '.gte("pickup_at", customerPortalHistoryWindowStartIso())',
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

for (const fragment of [
  "create or replace function public.dismiss_customer_notification_centre",
  "p_notification_ids uuid[]",
  "returns table (updated_ids uuid[], updated_count bigint)",
  "security invoker",
  "set search_path = ''",
  "update public.customer_driver_app_notification_outbox as notification",
  "notification.delivery_surface = 'customer_app'",
  "notification.notification_status = 'queued'",
  "notification.id = any(coalesce(p_notification_ids, array[]::uuid[]))",
  "returning notification.id",
  "array_agg(updated.id order by updated.id)",
  "count(*)::bigint as updated_count",
  "revoke execute on function public.dismiss_customer_notification_centre(uuid[]) from public",
  "revoke execute on function public.dismiss_customer_notification_centre(uuid[]) from anon",
  "revoke execute on function public.dismiss_customer_notification_centre(uuid[]) from authenticated",
  "grant execute on function public.dismiss_customer_notification_centre(uuid[]) to service_role",
]) {
  includes(migration, fragment, `Customer notification centre atomic-dismiss migration ${fragment}`);
}
excludes(migration, /security\s+definer/i, "Customer notification centre RPC privilege mode");
excludes(
  migration,
  /\b(?:create|alter|drop)\s+table\b|\bcreate\s+(?:unique\s+)?index\b|\bdelete\s+from\b|\binsert\s+into\b|\btruncate\b/i,
  "Customer notification centre migration unrelated DDL/DML",
);

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
  "one tiny `Clear` control",
  "POST body of one service-role-only `SECURITY INVOKER` RPC",
  "exact booking and current-link eligibility",
  "Defensive exact-ID dedupe",
  "older in-flight read cannot restore stale alerts",
  "keeps Trip Updates history",
  "Production Supabase project `kvvsguhklmfgkebhxatm`",
  "recorded as migration `20260906162227`",
  "SHA-256 0621c63983f2a1f4563fe391e8d1cd986a49b438407cba8f7a66ba9dd4a3d3c8",
  "`updated_count = 0`",
  "outbox remained at 163 rows",
  "No Expo OTA, EAS build, Apple/TestFlight action",
  "`scripts/test-customer-notification-centre-guard.mjs`",
]) {
  includes(ledgerSection, phrase, `Customer notification centre ledger ${phrase}`);
}
excludes(
  ledgerSection,
  /Production application remains a separate owner-approved action-time gate/,
  "Customer notification centre ledger superseded Production gate",
);

includes(suite, guardPath, "Customer notification centre preactivation registration");

console.log("Customer notification centre guard passed");
