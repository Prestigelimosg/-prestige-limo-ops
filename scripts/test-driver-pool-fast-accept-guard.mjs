import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const names = [
  "app/admin-driver-pool-control.tsx",
  "app/api/admin-driver-job-bid-offers/route.ts",
  "app/api/driver-job-bids/route.ts",
  "app/driver-portal/page.tsx",
  "app/page.tsx",
  "driver-companion/App.tsx",
  "driver-companion/src/driver-webview-bridge.ts",
  "driver-companion/src/native-notifications.ts",
  "lib/admin-driver-job-link-persistence.ts",
  "lib/driver-device-push-notification.ts",
  "lib/driver-pool-fast-accept.ts",
  "public/prestige-driver-push-sw.js",
  "scripts/test-booking-ui-browser.mjs",
  "supabase/migrations/202606090002_driver_portal_bidding_foundation.sql",
  "supabase/migrations/20260904063351_driver_pool_fast_accept.sql",
];
const files = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(name, "utf8")])));

function includes(name, fragments) {
  for (const fragment of fragments) assert.ok(files[name].includes(fragment), `${name} missing ${fragment}`);
}
function excludes(name, patterns) {
  for (const pattern of patterns) assert.doesNotMatch(files[name], pattern, `${name} leaks or alters forbidden scope: ${pattern}`);
}

includes("lib/driver-pool-fast-accept.ts", [
  "PRESTIGE_DRIVER_POOL_ENABLED", "driverPoolIsEnabled", "parseDriverPoolPublishPayload",
  "offer_payout_sgd", "publish_driver_pool_offer", "cancel_driver_pool_offer",
  "accept_driver_pool_offer", "decline_driver_pool_offer", "list_driver_pool_available_jobs",
  "sendDriverDevicePushAlertForDriverPoolOffer", "eligible, enabled: true, offer",
  "public_booking_reference,pickup_at",
]);
excludes("lib/driver-pool-fast-accept.ts", [/customer_price|invoice|billing_amount|payment|paynow|bank_account|internal_finance|payout_comparison/i]);

includes("app/api/driver-job-bids/route.ts", [
  "verifyDriverAccountSession", "!session.claims.accountId || !session.claims.deviceIdHash",
  "x-prestige-driver-installation-id", "driver-pool-offers-read",
  "driver-pool-offer-accept", "driver-pool-offer-decline",
]);
excludes("app/api/driver-job-bids/route.ts", [/driver_reference.*request|driver_id.*request|service_role|SUPABASE/i]);
includes("app/api/admin-driver-job-bid-offers/route.ts", [
  "resolveAdminDispatcherBoundary", "parseDriverPoolPublishPayload", "publishDriverPoolOffer",
  "parseDriverPoolCancelPayload", "cancelDriverPoolOffer",
]);
includes("app/admin-driver-pool-control.tsx", [
  "Send to Driver Pool", "Cancel Offer", "Booking remains active.", "Pool offer total SGD",
  "provider_accepted_driver_count",
]);
includes("scripts/test-booking-ui-browser.mjs", [
  "__prestigeDriverPoolOfferRequests", "Pool offer total SGD\\s*Send to Driver Pool",
  'payout === "75.00"', 'sendText === "Send to Driver Pool"',
]);
assert.equal((files["app/page.tsx"].match(/<AdminDriverPoolControl/g) || []).length, 1);
includes("app/page.tsx", [
  "Manual assignment with payout control.", "Apply Driver to Draft",
  'requiresExplicitPayout={normalizeBookingType(booking.bookingType) === "DSP"}',
]);

includes("app/driver-portal/page.tsx", [
  "Available Jobs", "Fixed driver payout · earliest pickup first",
  "SGD {job.offer_payout_sgd.toFixed(2)}", ">Accept<", ">Decline<", "Load more",
  "if (!driverPoolAccountSession)", "setAvailableJobs([])",
]);
excludes("app/driver-portal/page.tsx", [/customer_price|invoice_number|paynow|bank_account|payout_comparison|internal_finance/i]);
includes("lib/driver-device-push-notification.ts", [
  '"available_jobs" | "messages"', "New job offer available. Open Driver Portal.",
  'target_path: "/driver-portal?view=available-jobs"',
]);
includes("driver-companion/App.tsx", ['request.openTarget === "available_jobs"', "/driver-portal?view=available-jobs"]);
includes("driver-companion/src/driver-webview-bridge.ts", ['"available_jobs" | "messages" | null', '"available_jobs"']);
includes("driver-companion/src/native-notifications.ts", ['notification.open_target === "available_jobs"']);
includes("public/prestige-driver-push-sw.js", ["/driver-portal?view=available-jobs"]);

const migration = files["supabase/migrations/20260904063351_driver_pool_fast_accept.sql"];
for (const fragment of [
  "offer_payout_sgd numeric(10,2)", "driver_job_bid_offers_one_open_per_booking_key",
  "publish_driver_pool_offer", "accept_driver_pool_offer", "decline_driver_pool_offer",
  "cancel_driver_pool_offer", "list_driver_pool_available_jobs", "for update", "schedule_conflict",
  "offset v_offset limit v_limit + 1", "v_count > v_limit",
  "close_driver_pool_offer_on_booking_change", "v_reason:='booking_assigned_elsewhere'",
  "v_reason:='booking_terminal'", "v_reason:='booking_amended'",
  "revoke all on table public.driver_job_bid_offers from anon, authenticated",
  "grant execute on function public.accept_driver_pool_offer", "'driver_id',null",
  "Driver ACK remains pending", "v_booking.public_booking_reference",
]) assert.ok(migration.includes(fragment), `migration missing ${fragment}`);
assert.ok(
  files["supabase/migrations/202606090002_driver_portal_bidding_foundation.sql"].includes("driver_job_bids_one_accepted_bid_per_offer_key"),
  "foundation must retain the one accepted driver per offer unique index",
);
assert.doesNotMatch(migration, /update\s+public\.bookings\s+set[\s\S]{0,500}(customer_rate|driver_payout|invoice|payment|paynow)/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.driver_job_links/i);
assert.doesNotMatch(migration, /insert\s+into\s+public\.driver_job_status_events/i);
assert.doesNotMatch(migration, /(?:insert\s+into|update|delete\s+from)\s+public\.[a-z0-9_]*(?:calendar|message|live_location|gps)/i);

includes("lib/admin-driver-job-link-persistence.ts", [
  "A Driver Job Link cannot be created for a completed or cancelled booking.",
  "Cancel the open Driver Pool offer or wait for one Driver to accept before Create Link.",
  "PRESTIGE_DRIVER_POOL_ENABLED",
]);

console.log("Driver Pool fast-accept guard passed.");
