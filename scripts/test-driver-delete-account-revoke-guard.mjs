import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const helperPath = "lib/admin-full-driver-profile-runtime-write-action.ts";
const migrationPath = "supabase/migrations/20260816040725_driver_account_device_lock.sql";
const portalRoutePath = "app/api/driver-portal/jobs/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-delete-account-revoke-guard.mjs";

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function excludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), false, `${label} must exclude ${fragment}.`);
}

function sectionBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker after ${start}: ${end}`);
  return source.slice(startIndex, endIndex);
}

const [appPage, helper, migration, portalRoute, ledger, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(migrationPath, "utf8"),
  readFile(portalRoutePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const deleteDriverProfile = sectionBetween(
  appPage,
  "async function deleteDriverProfile",
  "async function saveBooking",
);
includes(
  deleteDriverProfile,
  "permanently revoke this selected driver's Driver app account",
  "Existing Delete confirmation",
);
includes(
  deleteDriverProfile,
  "Private Driver Job Links remain separately controlled",
  "Existing Job Link separation warning",
);
includes(deleteDriverProfile, "accountRevoked", "Delete result account-revoked proof");
includes(
  deleteDriverProfile,
  "Driver deleted and Driver app account revoked.",
  "Delete success feedback",
);
includes(
  appPage,
  "data-driver-delete-button={driver.id}",
  "Existing Driver Database Delete button",
);
excludes(appPage, "data-driver-account-revoke-button", "No second revoke button");
excludes(appPage, "data-driver-account-suspend-button", "No second suspension button");

includes(helper, "PRESTIGE_DRIVER_ACCOUNT_AUTH_ENABLED", "Driver account gate");
includes(
  helper,
  '.rpc("admin_revoke_driver_account_and_delete_profile"',
  "Atomic revoke-and-delete RPC",
);
includes(helper, "p_driver_id", "Exact selected Driver id RPC argument");
includes(helper, "p_actor_role", "Verified Admin actor role RPC argument");
includes(helper, "p_actor_label", "Verified Admin actor label RPC argument");
includes(helper, "driver_account_revoked", "Bounded revocation result");

for (const fragment of [
  "create or replace function public.admin_revoke_driver_account_and_delete_profile",
  "security invoker",
  "for update",
  "account_status = 'revoked'",
  "active_device_id_hash = null",
  "event_type",
  "'account_revoked'",
  "delete from public.drivers",
  "revoke execute on function public.admin_revoke_driver_account_and_delete_profile",
  "from public, anon, authenticated",
  "grant execute on function public.admin_revoke_driver_account_and_delete_profile",
  "to service_role",
]) {
  includes(migration.toLowerCase(), fragment.toLowerCase(), `Migration ${fragment}`);
}

includes(portalRoute, "clearDriverPortalSessionCookie", "Revoked session cookie clearing");
includes(
  portalRoute,
  "inactiveDriverAccountResponse",
  "Revoked Driver app session rejection response",
);

includes(
  ledger,
  "### Selected Driver Delete Revokes Driver App Account",
  "Implementation ledger section",
);
includes(preactivationSuite, guardScript, "Preactivation guard registration");

console.log("selected Driver delete account-revoke guard passed");
