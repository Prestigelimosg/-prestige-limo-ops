import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  account: "lib/driver-account-device-lock.ts",
  accountRoute: "app/api/driver-job/[token]/account/route.ts",
  authRoute: "app/api/driver-auth/session/route.ts",
  bridge: "driver-companion/src/driver-webview-bridge.ts",
  config: "driver-companion/app.json",
  installation: "driver-companion/src/driver-installation.ts",
  jobPage: "app/driver-job/[token]/page.tsx",
  leastPrivilegeMigration:
    "supabase/migrations/20260816064957_driver_account_enrollments_service_role_least_privilege.sql",
  migration: "supabase/migrations/20260816040725_driver_account_device_lock.sql",
  nativeApp: "driver-companion/App.tsx",
  nativePackage: "driver-companion/package.json",
  portalPage: "app/driver-portal/page.tsx",
  portalRoute: "app/api/driver-portal/jobs/route.ts",
  session: "lib/driver-portal-session.ts",
  status: "lib/driver-job-status-persistence.ts",
};

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);

function includes(key, fragment, label = fragment) {
  assert.equal(sources[key].includes(fragment), true, `${label} must include ${fragment}.`);
}

function excludes(key, pattern, label) {
  assert.equal(pattern.test(sources[key]), false, `${label} must remain excluded.`);
}

includes("status", '"already_acknowledged"', "acknowledgement replay lock reason");
includes("status", "lockedAcknowledgedDriverDetailsMatch", "exact saved Driver detail replay check");
includes("status", "return detailsBlockedResult(\"already_acknowledged\")", "changed acknowledgement rejection");

for (const fragment of [
  "driver_account_enrollments",
  "unique (driver_job_link_id)",
  "unique (driver_id)",
  "active_device_id_hash",
  "device_bound_at",
  "enable row level security",
  "revoke all on table public.driver_account_enrollments from anon, authenticated",
]) {
  includes("migration", fragment, `device-lock migration ${fragment}`);
}

for (const fragment of [
  "revoke all on table public.driver_account_enrollments from service_role",
  "grant select, insert, update on table public.driver_account_enrollments to service_role",
]) {
  includes(
    "leastPrivilegeMigration",
    fragment,
    `Driver account enrollment least-privilege migration ${fragment}`,
  );
}

for (const fragment of [
  "createDriverAccountForAcknowledgedLink",
  "driverId !== authorizedDriverId",
  "signInDriverAccountForInstallation",
  "verifyDriverAccountSession",
  "PRESTIGE_DRIVER_ACCOUNT_AUTH_ENABLED",
  "PRESTIGE_DRIVER_ACCOUNT_DEVICE_SECRET",
  "SUPABASE_PUBLISHABLE_KEY",
  ".eq(\"driver_job_link_id\", linkId)",
  ".eq(\"active_device_id_hash\", input.deviceIdHash)",
  ".is(\"active_device_id_hash\", null)",
  "requestDeviceHash !== input.deviceIdHash",
  "authAdmin.deleteUser(authUserId)",
]) {
  includes("account", fragment, `server account/device boundary ${fragment}`);
}
excludes("account", /signUp\s*\(/, "public Supabase sign-up");
excludes("account", /user_metadata/i, "user-editable metadata authorization");
excludes(
  "account",
  /NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY)/,
  "browser-exposed Supabase configuration in the server-only Driver account helper",
);

includes("accountRoute", "createDriverAccountForAcknowledgedLink", "Job Link account creation route");
includes("accountRoute", '"driver-account-create"', "exact account creation purpose");
includes("accountRoute", "resolveDriverPortalSession", "same acknowledged browser session");
includes("authRoute", "signInDriverAccountForInstallation", "approved account sign-in route");
includes("authRoute", "clearDriverPortalSessionCookie", "account logout cookie clearing");

includes("jobPage", "Create Driver Account", "acknowledged Job Link account action");
includes("jobPage", "driver-account-create", "Job Link account purpose header");
for (const fragment of [
  'stage: "email" | "password"',
  'stage: "email"',
  'data-driver-account-email-step="true"',
  'driverAccountSetup.stage === "email"',
  'autoComplete="email"',
  'name="email"',
  '>Continue</button>',
  'data-driver-account-confirmed-email="true"',
  'data-driver-account-creation-form="true"',
  'driverAccountSetup.stage === "password"',
  'Change email',
  'spellCheck={false}',
  'autoComplete="new-password"',
  'name="new-password"',
]) {
  includes("jobPage", fragment, `iOS-safe email-first Driver account form ${fragment}`);
}
excludes("jobPage", /autoComplete="username"/, "iOS Password AutoFill username classification on the acknowledged Job Link");
includes("portalPage", "Driver sign in", "Driver Portal sign-in form");
includes("portalPage", "driver-installation-required", "native installation requirement");
includes("portalPage", "nativeBridgeReady && readState.accountSession", "Face ID after account session only");
includes("portalPage", "x-prestige-driver-installation-id", "native installation request proof");
includes("portalRoute", "verifyDriverAccountSession", "server account revalidation");
includes("portalRoute", "x-prestige-driver-installation-id", "server installation proof check");

includes("installation", "prestige.driver.installation.v1", "one-installation SecureStore key");
includes("installation", "LocalAuthentication.authenticateAsync", "native biometric unlock");
includes("installation", "disableDeviceFallback: true", "Face ID device-passcode fallback prohibition");
includes("nativePackage", '"expo-local-authentication"', "Face ID dependency");
includes("nativePackage", '"expo-crypto"', "native installation identity dependency");
includes("config", '"expo-local-authentication"', "Face ID config plugin");
includes("config", "use Face ID to unlock the approved Driver account", "Face ID permission explanation");
includes("bridge", "__PRESTIGE_DRIVER_INSTALLATION_ID__", "native installation bridge marker");
includes("nativeApp", "readOrCreateDriverInstallationId", "native installation binding");
includes("nativeApp", "authenticateDriverAppUnlock", "native biometric gate");

for (const sourceKey of ["account", "accountRoute", "authRoute", "installation"]) {
  excludes(
    sourceKey,
    /customer_price|driver_payout|paynow|invoice|billing|payment|internal_admin_note|parser_debug/i,
    `${sourceKey} finance and internal-data isolation`,
  );
}

console.log("Driver account one-device and acknowledged-link lock guard passed.");
