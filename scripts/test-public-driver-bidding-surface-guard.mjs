import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import "./test-driver-pool-fast-accept-guard.mjs";

const paths = {
  ledger: "docs/current-implementation-ledger.md",
  preactivation: "scripts/test-preactivation-verification-suite.mjs",
  adminRoute: "app/api/admin-driver-job-bid-offers/route.ts",
  driverRoute: "app/api/driver-job-bids/route.ts",
  driverPortal: "app/driver-portal/page.tsx",
  driverJobPage: "app/driver-job/[token]/page.tsx",
  driverJobDemo: "app/driver-job-demo/page.tsx",
  rootApp: "app/page.tsx",
  adminControl: "app/admin-driver-pool-control.tsx",
  pushHelper: "lib/driver-device-push-notification.ts",
  serviceWorker: "public/prestige-driver-push-sw.js",
  nativeApp: "driver-companion/App.tsx",
  nativeNotifications: "driver-companion/src/native-notifications.ts",
  nativeBridge: "driver-companion/src/driver-webview-bridge.ts",
};

const files = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

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

function sectionBetween(source, heading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(heading);
  assert.notEqual(start, -1, `Missing ledger section ${heading}`);
  const next = source.indexOf(nextHeadingPrefix, start + heading.length);
  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const driverPoolSection = sectionBetween(files.ledger, "## Optional Driver Pool Fast Accept (source checkpoint 2026-09-04)", "\n## ");
for (const phrase of [
  "Direct allocation remains the existing default Assigned Driver workflow.",
  "One compact, feature-gated `Pool offer total SGD` plus `Send to Driver Pool` row",
  "Eligible installed-app Drivers with an active alert subscription receive a generic notification",
  "A fully signed-out Driver may still receive that device alert, but must sign back in on the bound phone before seeing or accepting the offer.",
  "The authenticated Driver Portal `Available Jobs` list shows only public job reference, pickup time, safe service/vehicle labels and the exact fixed SGD offer",
  "The first valid acceptance assigns the verified Driver fields and exact accepted fixed payout override on the existing booking; it does not execute payout, create a Driver Job Link or count as Driver ACK.",
  "Admin then uses the sole existing Create Link lane",
  "`Cancel Offer` exists only while that exact offer is open.",
  "It expires pending recipients but never cancels, removes or completes the booking.",
  "Driver Job Link/ACK, both Calendar lanes, existing push senders/badge behavior, status reports, customer/driver messages, GPS/live location, Admin completion, invoices/billing/payments, payout execution and PayNow remain established protected lanes and are not duplicated or redesigned.",
]) {
  assertIncludes(driverPoolSection, phrase, `Driver Pool ledger public-surface contract ${phrase}`);
}

assertIncludes(files.preactivation, "scripts/test-public-driver-bidding-surface-guard.mjs", "preactivation public bidding guard registration");

for (const [label, source] of [
  ["private Driver Job page", files.driverJobPage],
  ["public Driver Job demo", files.driverJobDemo],
]) {
  for (const forbidden of [
    "/api/driver-job-bids",
    "/api/admin-driver-job-bid-offers",
    "driver-pool-offers-read",
    "driver-pool-offer-accept",
    "driver-pool-offer-decline",
    "x-prestige-admin",
    "bid_offer_id",
    "offer_key",
    "driver_reference",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    assertExcludes(source, forbidden, `${label} Driver Pool public isolation ${forbidden}`);
  }
}

for (const fragment of [
  "/api/driver-job-bids?page=",
  "\"x-prestige-driver-purpose\": \"driver-pool-offers-read\"",
  "\"x-prestige-driver-purpose\": action === \"accept\" ? \"driver-pool-offer-accept\" : \"driver-pool-offer-decline\"",
  "\"x-prestige-driver-installation-id\": nativeInstallationId",
  "credentials: \"same-origin\"",
  "cache: \"no-store\"",
  "data-driver-pool-available-jobs=\"true\"",
  "Job {job.public_booking_reference}",
  "SGD {job.offer_payout_sgd.toFixed(2)}",
  "safe_trip_summary",
  "safe_vehicle_label",
  "Accept",
  "Decline",
  "Load more",
]) {
  assertIncludes(files.driverPortal, fragment, `Driver Portal active bidding surface ${fragment}`);
}

for (const forbidden of [
  /\/api\/admin-driver-job-bid-offers/i,
  /x-prestige-admin/i,
  /Authorization/i,
  /Cookie/i,
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /customer_price|invoice|payment|paynow|billing|bank|internal_admin_notes|parser_debug/i,
]) {
  assertExcludes(files.driverPortal, forbidden, "Driver Portal Driver Pool visible/caller privacy boundary");
}

for (const fragment of [
  "resolveDriverPortalSession(request.headers.get(\"cookie\"))",
  "verifyDriverAccountSession",
  "request.headers.get(\"x-prestige-driver-installation-id\")",
  "\"driver-pool-offers-read\"",
  "\"driver-pool-offer-accept\"",
  "\"driver-pool-offer-decline\"",
  "loadAvailableDriverPoolJobs(account.client, account.driverId, page, limit)",
  "decideDriverPoolOffer(account.client, account.driverId, parsed.data, action)",
]) {
  assertIncludes(files.driverRoute, fragment, `Driver Pool driver route auth boundary ${fragment}`);
}
for (const forbidden of [
  /x-prestige-admin/i,
  /x-prestige-admin-session-token/i,
  /request\.headers\.get\(["']authorization["']\)/i,
  /driver_id\s*[:=]\s*.*(?:body|request|parsed)/i,
  /customer_price|invoice|payment|paynow|billing|bank|internal_admin_notes|parser_debug/i,
]) {
  assertExcludes(files.driverRoute, forbidden, "Driver Pool driver route public/auth/privacy boundary");
}

for (const fragment of [
  "resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose)",
  "adminDispatcherBoundaryToPersistenceAdapterActor(access.context)",
  "parseDriverPoolPublishPayload(await body(request))",
  "parseDriverPoolCancelPayload(await body(request))",
  "publishDriverPoolOffer(database.client, parsed.data, actor)",
  "cancelDriverPoolOffer(database.client, parsed.data, actor)",
]) {
  assertIncludes(files.adminRoute, fragment, `Admin Driver Pool route internal boundary ${fragment}`);
}
assertExcludes(files.adminRoute, /x-prestige-driver-purpose|resolveDriverPortalSession|verifyDriverAccountSession/i, "Admin Driver Pool route must not use public driver session");

for (const fragment of [
  "<AdminDriverPoolControl",
  "disabled={Boolean(assignedDriverId) || adminBookingPersistenceAction !== null}",
  "requiresExplicitPayout={normalizeBookingType(booking.bookingType) === \"DSP\"}",
  "normalizeBookingType(booking.bookingType) === \"DSP\"\n                    ? 0\n                    : Number(draftPricing.driverPayout) || 0",
]) {
  assertIncludes(files.rootApp, fragment, `Admin Dispatch Driver Pool insertion ${fragment}`);
}
for (const fragment of [
  "Send to Driver Pool",
  "Cancel Offer",
  "eligible Drivers",
  "push-capable Drivers",
  "app-only Drivers",
  "Drivers had a push request accepted by provider; delivery not confirmed.",
  "Offer cancelled. Booking remains active.",
]) {
  assertIncludes(files.adminControl, fragment, `Admin Driver Pool compact control ${fragment}`);
}

for (const fragment of [
  "driverPoolOfferPayload",
  "A driver-pool job is available. Open the app to review.",
  "target_path: \"/driver-portal?view=available-jobs\"",
  "sendDriverDevicePushAlertForDriverPoolOffer",
]) {
  assertIncludes(files.pushHelper, fragment, `Driver Pool generic push privacy ${fragment}`);
}
for (const forbidden of [
  /booking_reference|public_booking_reference|offer_payout_sgd|pickup|drop|customer|passenger|invoice|payment|paynow|billing/i,
]) {
  const payloadStart = files.pushHelper.indexOf("function driverPoolOfferPayload");
  const payloadEnd = files.pushHelper.indexOf("\nasync function sendWebPush", payloadStart);
  assert.notEqual(payloadStart, -1, "Missing driver pool offer payload builder.");
  assert.notEqual(payloadEnd, -1, "Missing driver pool offer sender after payload builder.");
  assertExcludes(files.pushHelper.slice(payloadStart, payloadEnd), forbidden, "Driver Pool generic push payload detail");
}

for (const fragment of [
  "prestige-driver-pool-",
  "/driver-portal?view=available-jobs",
  "A driver-pool job is available. Open the app to review.",
]) {
  assertIncludes(files.serviceWorker, fragment, `Driver Pool service worker generic target ${fragment}`);
}
assertExcludes(files.serviceWorker, /offer_payout_sgd|customer_price|invoice|payment|paynow|billing|passenger/i, "Driver Pool service worker privacy boundary");

for (const [label, source] of [
  ["native app", files.nativeApp],
  ["native notification parser", files.nativeNotifications],
  ["native webview bridge", files.nativeBridge],
]) {
  assertIncludes(source, "available_jobs", `Driver Pool native routing ${label}`);
}
assertIncludes(files.nativeApp, "/driver-portal?view=available-jobs", "Driver Pool native app opens Available Jobs");
assertIncludes(files.nativeBridge, 'openTarget === "available_jobs"', "Driver Pool native bridge injects Available Jobs target");

console.log("Public Driver Pool surface guard passed.");
