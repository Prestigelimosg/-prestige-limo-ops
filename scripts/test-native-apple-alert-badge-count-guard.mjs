import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const badgeHelper = read("lib/native-push-badge-count.ts");
const adminPush = read("lib/admin-device-push-notification.ts");
const customerPush = read("lib/customer-device-push-notification.ts");
const driverPush = read("lib/driver-device-push-notification.ts");
const adminNative = read("admin-companion/App.tsx");
const customerNative = read("customer-companion/App.tsx");
const driverNative = read("driver-companion/App.tsx");
const driverNativeOpenRoute = read("app/api/driver-native-job-open/[jobKey]/route.ts");
const migration = read("supabase/migrations/202608250001_native_push_badge_counts.sql");
const ledger = read("docs/current-implementation-ledger.md");

for (const fragment of [
  "reserveNativePushBadgeCount",
  "releaseNativePushBadgeCount",
  "resetNativePushBadgeCount",
  "nativePushBadgeMaximum = 99",
]) {
  assert.ok(badgeHelper.includes(fragment), `Missing shared badge contract: ${fragment}`);
}

for (const [label, source] of [
  ["Admin", adminPush],
  ["Customer", customerPush],
  ["Driver", driverPush],
]) {
  assert.ok(source.includes("reserveNativePushBadgeCount"), `${label} push must reserve an exact device badge`);
  assert.ok(source.includes("releaseNativePushBadgeCount"), `${label} push must roll back a rejected reservation`);
  assert.match(source, /badge:\s*(?:badgeCount|badgeReservation\.count)/, `${label} Expo payload must carry the badge`);
}

for (const [label, source] of [
  ["Admin", adminNative],
  ["Customer", customerNative],
  ["Driver", driverNative],
]) {
  assert.ok(source.includes("Notifications.setBadgeCountAsync(0)"), `${label} app must clear its badge when opened`);
  assert.ok(source.includes("shouldSetBadge: true"), `${label} app must allow the assigned iOS badge`);
}
assert.ok(customerNative.includes("Notifications.getBadgeCountAsync()"));
assert.ok(driverNative.includes("Notifications.getPresentedNotificationsAsync()"));
assert.ok(driverNativeOpenRoute.includes("resetDriverNativePushBadgeCount"));

for (const table of [
  "admin_device_push_subscriptions",
  "customer_device_push_subscriptions",
  "driver_device_push_subscriptions",
]) {
  assert.match(migration, new RegExp(`alter table if exists public\\.${table}`));
}
assert.match(migration, /badge_count integer not null default 0/);
assert.match(migration, /badge_count between 0 and 99/);
assert.match(ledger, /Native Apple Alert Badge Counts/);

console.log("Native Apple Admin, Customer, and Driver alert badge count guard passed.");
