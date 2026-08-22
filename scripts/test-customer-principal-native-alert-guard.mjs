import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const ledger = read("docs/current-implementation-ledger.md");
const preactivation = read("scripts/test-preactivation-verification-suite.mjs");

for (const phrase of [
  "Customer Principal Access, Shared Boss/PA Customer Copy, And Native Alerts",
  "separate PA and Boss identities never share a credential",
  "No migration has been applied",
  "Runtime database migration",
]) {
  assert.match(ledger, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
}
assert.match(preactivation, /scripts\/test-customer-principal-native-alert-guard\.mjs/);

const migrationName = readdirSync(join(root, "supabase/migrations"))
  .filter((name) => name.endsWith("_customer_principal_access_native_alerts.sql"))
  .sort()
  .at(-1);

assert.ok(migrationName, "customer principal/native-alert migration must be created by Supabase CLI");

const migration = read(`supabase/migrations/${migrationName}`);
for (const table of [
  "customer_access_principals",
  "customer_access_memberships",
  "customer_access_invitations",
  "customer_access_email_challenges",
  "customer_access_devices",
  "customer_access_device_sessions",
  "customer_access_pin_attempts",
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon`));
  assert.match(migration, new RegExp(`revoke all on public\\.${table} from authenticated`));
  assert.match(migration, new RegExp(`grant select, insert, update, delete on public\\.${table} to service_role`));
}

assert.match(migration, /check \(principal_role in \('pa', 'boss'\)\)/);
assert.match(migration, /unique \(normalized_email\)/);
assert.match(migration, /expires_at timestamptz not null/);
assert.match(migration, /used_at timestamptz/);
assert.match(migration, /pin_hash text/);
assert.match(migration, /actual_sender_principal_id/);
assert.match(migration, /actual_sender_role/);
assert.match(migration, /customer_display_sender_name/);
assert.match(migration, /native_expo/);
assert.match(migration, /principal_id uuid/);
assert.match(migration, /device_id uuid/);

for (const path of [
  "lib/customer-principal-access.ts",
  "app/api/customer-principal-access/route.ts",
  "app/api/admin-customer-portal-access-links/route.ts",
  "app/api/customer-device-push-subscriptions/route.ts",
  "lib/customer-device-push-notification.ts",
  "lib/customer-saved-bookings-read.ts",
  "lib/customer-driver-app-notification-persistence.ts",
  "lib/driver-job-link-production.ts",
  "app/my-bookings/page.tsx",
  "customer-companion/App.tsx",
  "customer-companion/src/customer-installation.ts",
  "customer-companion/src/customer-native-notifications.ts",
]) {
  assert.ok(existsSync(join(root, path)), `${path} must remain in the established lane`);
}

const access = read("lib/customer-principal-access.ts");
assert.match(access, /customerPrincipalInviteLifetimeSeconds\s*=\s*30\s*\*\s*60/);
assert.match(access, /customerPinPattern\s*=\s*\/\^\\d\{6\}\$\//);
assert.match(access, /scrypt/);
assert.match(access, /timingSafeEqual/);
assert.match(access, /email_challenge/);
assert.match(access, /new_device/);
assert.match(access, /forgot_pin/);
assert.match(access, /5/);
assert.match(access, /15\s*\*\s*60/);
assert.match(access, /membership_status/);
assert.match(access, /device_status/);
assert.match(access, /session_status/);
assert.match(access, /One PA invitation must use one exact verified company and booker scope/);
assert.match(access, /\.from\("travelers"\)[\s\S]*?\.eq\("company_id", root\.company_id\)[\s\S]*?\.eq\("booker_id", root\.booker_id\)/);
assert.match(access, /access_status: "access_updated"/);
assert.match(access, /existingPrincipal\.principal_status === "active"[\s\S]*?parsed\.principalRole === "pa"/);
assert.match(access, /existingRoots\.size !== 1/);
assert.match(access, /!existingRoots\.has\(requestedRootKey\)/);
assert.match(access, /already bound to another verified company or booker/);
assert.match(access, /HttpOnly/);
assert.match(access, /SameSite=Lax/);
assert.doesNotMatch(access, /device.{0,30}cap|maximum.{0,30}device|30-day|7-day/i);

const adminAccess = read("app/api/admin-customer-portal-access-links/route.ts");
assert.match(adminAccess, /Manage Access/);
assert.match(adminAccess, /invitation/i);
assert.match(adminAccess, /revoke/i);
assert.match(access, /"pa"/);
assert.match(access, /"boss"/);
assert.doesNotMatch(adminAccess, /createCustomerPortalAccessLinkToken\(account\.data\.customer_account_reference/);

const myBookings = read("app/my-bookings/page.tsx");
assert.match(myBookings, /data-customer-managed-boss-selector/);
assert.match(myBookings, /data-customer-shared-conversation/);
assert.match(myBookings, /setInterval\([^]*?5000\)/);
assert.match(myBookings, /principal_role/);
assert.match(myBookings, /customer_driver_details/);
assert.doesNotMatch(myBookings, /actual_sender_role/);
assert.match(myBookings, /principal.*Invoices|Invoices.*principal/s);

const messages = read("lib/customer-driver-app-notification-persistence.ts");
assert.match(messages, /message_text/);
assert.match(messages, /client_message_id/);
assert.match(messages, /actual_sender_principal_id/);
assert.match(messages, /customer_display_sender_name/);
assert.match(messages, /verifiedBossName/);
assert.match(messages, /customer_to_driver/);
assert.doesNotMatch(messages, /Customer-to-admin|Admin-to-customer/);

const ack = read("lib/driver-job-link-production.ts");
assert.match(ack, /queueCustomerDriverDetailsReadyNotification/);
assert.match(ack, /best-effort|best effort/i);
assert.match(messages, /Driver details ready/);

const push = read("lib/customer-device-push-notification.ts");
assert.match(push, /native_expo/);
assert.match(push, /principal_id/);
assert.match(push, /device_id/);
assert.match(push, /managing PA|managing_pa|pa/i);
assert.match(push, /boss/i);
assert.match(push, /paMembershipRows/);
assert.match(push, /\.eq\("booker_id", bookerId\)[\s\S]*?\.eq\("membership_role", "managing_pa"\)/);
assert.match(push, /booking update|Driver details are ready/i);
assert.doesNotMatch(push, /driver_contact.*body|body.*driver_contact/s);

const companionPackage = read("customer-companion/package.json");
assert.match(companionPackage, /expo-notifications/);
assert.match(companionPackage, /expo-device/);
assert.match(companionPackage, /expo-constants/);

const companion = read("customer-companion/App.tsx");
assert.match(companion, /registerCustomerNativeNotifications/);
assert.match(companion, /Use 6-digit PIN/);
assert.match(companion, /customerUniversalLinkUrl/);
assert.match(companion, /function isCustomerBookingsUrl/);
assert.match(companion, /isCustomerBookingsUrl\(navigation\.url\)/);
assert.match(companion, /isCustomerBookingsUrl\(safeUrl\)/);
assert.match(companion, /Enable Face ID to protect your Customer bookings/);
assert.match(companion, /Customer bookings remain locked on this iPhone/);
assert.doesNotMatch(companion, /booking pages remain available/i);

const nativeNotifications = read("customer-companion/src/customer-native-notifications.ts");
assert.match(nativeNotifications, /getExpoPushTokenAsync/);
assert.match(nativeNotifications, /addNotificationResponseReceivedListener/);
assert.match(nativeNotifications, /booking_reference/);
assert.match(nativeNotifications, /installation/);

console.log("Customer principal access and native alert guard passed.");
