import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import "./test-driver-pool-fast-accept-guard.mjs";

// authenticated Driver Pool guard: this file keeps the route/API-specific auth,
// method, payload, pagination, response and unrelated-lane boundaries explicit.

const paths = {
  adminRoute: "app/api/admin-driver-job-bid-offers/route.ts",
  driverRoute: "app/api/driver-job-bids/route.ts",
  driverPortal: "app/driver-portal/page.tsx",
  fastAccept: "lib/driver-pool-fast-accept.ts",
  migration: "supabase/migrations/20260904112430_driver_pool_fast_accept.sql",
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

function exportedMethods(source) {
  return [...source.matchAll(/export\s+async\s+function\s+([A-Z]+)\s*\(/g)].map((match) => match[1]).sort();
}

assert.deepEqual(exportedMethods(files.adminRoute), ["GET", "PATCH", "POST"], "Admin Driver Pool route methods");
assert.deepEqual(exportedMethods(files.driverRoute), ["GET", "PATCH", "POST"], "Driver Pool route methods");

for (const fragment of [
  "resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose)",
  "adminDispatcherBoundaryToPersistenceAdapterActor(access.context)",
  "parseDriverPoolPublishPayload(await body(request))",
  "parseDriverPoolCancelPayload(await body(request))",
  "getDriverPoolClientForProduction()",
  "loadAdminDriverPoolOffer(database.client, reference)",
  "publishDriverPoolOffer(database.client, parsed.data, actor)",
  "cancelDriverPoolOffer(database.client, parsed.data, actor)",
  "\"Driver Pool request failed safely.\"",
  "\"Cache-Control\": \"no-store\"",
]) {
  assertIncludes(files.adminRoute, fragment, `Admin Driver Pool API contract ${fragment}`);
}

for (const fragment of [
  "function sameOrigin(request: Request, purpose: string)",
  "resolveDriverPortalSession(request.headers.get(\"cookie\"))",
  "verifyDriverAccountSession",
  "request.headers.get(\"x-prestige-driver-installation-id\")",
  "\"driver-pool-offers-read\"",
  "\"driver-pool-offer-accept\"",
  "\"driver-pool-offer-decline\"",
  "parseDriverPoolDecisionPayload(await body(request))",
  "loadAvailableDriverPoolJobs(account.client, account.driverId, page, limit)",
  "decideDriverPoolOffer(account.client, account.driverId, parsed.data, action)",
  "clearDriverPortalSessionCookie()",
  "\"Cache-Control\": \"no-store\"",
  "Vary: \"Cookie\"",
  "return response({ jobs: [], ok: false, reason: \"unauthorized\" }, 401)",
  "return response({ ok: false, reason: \"unauthorized\" }, 401)",
]) {
  assertIncludes(files.driverRoute, fragment, `Driver Pool driver API contract ${fragment}`);
}

for (const forbidden of [
  /request\.headers\.get\(["']authorization["']\)/i,
  /request\.headers\.get\(["']x-prestige-admin-session-token["']\)/i,
  /request\.headers\.get\(["']x-prestige-driver-id["']\)/i,
  /driver_id\s*[:=]\s*.*(?:body|parsed|request)/i,
  "createClient(",
  "SUPABASE_SERVICE_ROLE_KEY",
  "driverBidRuntimeAccessBlocked",
  "blockedDriverBidResponse",
]) {
  assertExcludes(files.driverRoute, forbidden, "Driver Pool driver route unsafe auth/runtime path");
}

for (const fragment of [
  "driverPoolIsEnabled",
  "PRESTIGE_DRIVER_POOL_ENABLED",
  "exactKeys(record, [\"booking_reference\", \"expected_updated_at\", \"offer_payout_sgd\", \"idempotency_key\"])",
  "exactKeys(record, [\"offer_key\", \"expected_updated_at\"])",
  "exactKeys(record, [\"offer_key\", \"expected_updated_at\", \"idempotency_key\"])",
  ".rpc(\"publish_driver_pool_offer\"",
  ".rpc(\"cancel_driver_pool_offer\"",
  ".rpc(action === \"accept\" ? \"accept_driver_pool_offer\" : \"decline_driver_pool_offer\"",
  "from(\"driver_job_bid_offers\")",
  "from(\"bookings\")",
  "p_limit: boundedLimit",
  "p_page: boundedPage",
  "has_more: result.has_more === true",
]) {
  assertIncludes(files.fastAccept, fragment, `Driver Pool persistence helper contract ${fragment}`);
}

for (const forbidden of [
  "customer_price",
  "invoice_number",
  "payment_status",
  "paynow",
  "bank_account",
  "internal_admin_notes",
  "parser_debug",
  "driver_job_links",
  "driver_job_status_events",
  "customer_driver_app_messages",
  "driver_live_location_latest_positions",
]) {
  assertExcludes(files.fastAccept, forbidden, `Driver Pool helper unrelated lane ${forbidden}`);
}

for (const fragment of [
  "create or replace function public.publish_driver_pool_offer(",
  "create or replace function public.cancel_driver_pool_offer(",
  "create or replace function public.decline_driver_pool_offer(",
  "create or replace function public.accept_driver_pool_offer(",
  "create or replace function public.close_driver_pool_offer_on_booking_change()",
  "create or replace function public.guard_driver_job_link_against_driver_pool_offer()",
  "for update",
  "recipient_count",
  "push_target_count",
  "order by o.pickup_at asc, o.offer_key asc",
  "offset v_offset limit v_limit + 1",
  "grant execute on function public.publish_driver_pool_offer",
  "grant execute on function public.accept_driver_pool_offer",
  "revoke all on function public.accept_driver_pool_offer",
  "set search_path = ''",
  "security invoker",
]) {
  assertIncludes(files.migration, fragment, `Driver Pool migration contract ${fragment}`);
}

for (const forbidden of [
  /insert\s+into\s+public\.driver_job_links/i,
  /insert\s+into\s+public\.driver_job_status_events/i,
  /insert\s+into\s+public\.(?:customer_invoices|customer_payments|customer_driver_app_messages|driver_live_location_latest_positions)/i,
  /update\s+public\.(?:customer_invoices|customer_payments|driver_job_status_events|driver_live_location_latest_positions)/i,
]) {
  assertExcludes(files.migration, forbidden, "Driver Pool migration unrelated write/privacy lane");
}

for (const fragment of [
  "/api/driver-job-bids?page=",
  "\"x-prestige-driver-purpose\": \"driver-pool-offers-read\"",
  "\"x-prestige-driver-purpose\": action === \"accept\" ? \"driver-pool-offer-accept\" : \"driver-pool-offer-decline\"",
  "credentials: \"same-origin\"",
  "cache: \"no-store\"",
  "availableJobs.map((job)",
  "Job {job.public_booking_reference}",
  "SGD {job.offer_payout_sgd.toFixed(2)}",
  "safe_trip_summary",
  "safe_vehicle_label",
  "Accept",
  "Decline",
  "Load more",
]) {
  assertIncludes(files.driverPortal, fragment, `Driver Portal Available Jobs contract ${fragment}`);
}

assertExcludes(files.driverPortal, /\/api\/admin-driver-job-bid-offers|x-prestige-admin|Authorization|Cookie|SUPABASE_SERVICE_ROLE_KEY/i, "Driver Portal Available Jobs public caller secrets");

console.log("Driver portal bidding API contract passed.");
