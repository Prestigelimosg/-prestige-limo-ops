import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const configPath = "customer-companion/app.json";
const packagePath = "customer-companion/package.json";
const appPath = "customer-companion/App.tsx";
const navigationPath = "customer-companion/src/customer-navigation.ts";
const installationPath = "customer-companion/src/customer-installation.ts";
const appStoreIconPath = "customer-companion/assets/app-icon.png";
const headerIconPath = "customer-companion/assets/icon.png";
const rootTsconfigPath = "tsconfig.json";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [
  configSource,
  packageSource,
  appSource,
  navigationSource,
  installationSource,
  appStoreIconBytes,
  headerIconBytes,
  rootTsconfigSource,
  ledgerSource,
  preactivationSource,
] = await Promise.all([
  readFile(configPath, "utf8"),
  readFile(packagePath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(navigationPath, "utf8"),
  readFile(installationPath, "utf8"),
  readFile(appStoreIconPath),
  readFile(headerIconPath),
  readFile(rootTsconfigPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationPath, "utf8"),
]);

const config = JSON.parse(configSource).expo;
const packageJson = JSON.parse(packageSource);
const rootTsconfig = JSON.parse(rootTsconfigSource);
const normalizedApp = appSource.replace(/\s+/g, " ");
const normalizedNavigation = navigationSource.replace(/\s+/g, " ");

assert.equal(config.name, "Prestige SG");
assert.equal(config.slug, "prestige-customer");
assert.equal(config.owner, "prestige-limo-ops");
assert.equal(
  config.extra?.eas?.projectId,
  "ce71ff91-7f71-4297-bcef-edf420f94316",
  "The Customer app must remain linked only to its exact EAS project",
);
assert.equal(config.scheme, "prestige-customer");
assert.equal(config.userInterfaceStyle, "light");
assert.equal(config.ios.bundleIdentifier, "sg.prestigelimo.customer");
assert.equal(config.ios.supportsTablet, false);
assert.equal(config.ios.infoPlist.CFBundleDisplayName, "Prestige SG");
assert.equal(config.ios.buildNumber, "1");
assert.equal(config.ios.infoPlist.NSFaceIDUsageDescription.includes("Prestige SG"), true);
assert.equal(config.ios.config.usesNonExemptEncryption, false);
assert.equal(
  Object.hasOwn(config.ios, "associatedDomains"),
  false,
  "Universal Links must wait for a separately approved domain-association change",
);
assert.equal(config.icon, "./assets/app-icon.png");
assert.equal(config.ios.icon, "./assets/app-icon.png");
assert.equal(
  rootTsconfig.exclude.includes("customer-companion"),
  true,
  "The root Next.js type check must exclude the isolated Customer native project",
);

for (const dependency of [
  "expo-local-authentication",
  "expo-secure-store",
  "react-native-safe-area-context",
  "react-native-webview",
]) {
  assert.equal(typeof packageJson.dependencies[dependency], "string", `Missing ${dependency}`);
}

assert.deepEqual(
  [...appStoreIconBytes.subarray(0, 8)],
  [137, 80, 78, 71, 13, 10, 26, 10],
  "The Customer App Store icon must be a PNG",
);
assert.equal(appStoreIconBytes.readUInt32BE(16), 1024, "The Customer App Store icon must be 1024 pixels wide");
assert.equal(appStoreIconBytes.readUInt32BE(20), 1024, "The Customer App Store icon must be 1024 pixels high");
assert.equal(appStoreIconBytes[25], 2, "The Customer App Store icon must be RGB without an alpha channel");
assert.equal(
  createHash("sha256").update(appStoreIconBytes).digest("hex"),
  "f04038c4b341131cc36d182943da0a1b661c6b30420f20fe4ff2db14a36f6c9e",
  "The Customer app must retain the exact owner-approved Customer artwork",
);
assert.equal(
  createHash("sha256").update(headerIconBytes).digest("hex"),
  "b55f726603fbae4bf0c101fee8dc23e782089f6fcb7f963c2542c9fc297cb670",
  "The Customer native header must retain its established artwork",
);
assert.equal(
  appSource.includes('import prestigeIcon from "./assets/icon.png"'),
  true,
  "The Customer native header must keep using its established header artwork",
);

for (const phrase of [
  "Request a Ride",
  "My Bookings",
  "Enable Face ID",
  "Unlock Prestige SG",
  "sharedCookiesEnabled",
  "thirdPartyCookiesEnabled={false}",
  'mixedContentMode="never"',
  "allowsBackForwardNavigationGestures",
  "shouldAllowCustomerWebViewNavigation",
]) {
  assert.equal(normalizedApp.includes(phrase), true, `${appPath} must include ${phrase}`);
}

for (const phrase of [
  'export const productionOrigin = "https://app.prestigelimo.sg"',
  '"/book"',
  '"/my-bookings"',
  '"/privacy"',
  '"/terms"',
  'requested.pathname.startsWith("/api/customer-portal-access/")',
  "requested.origin !== productionOrigin",
  "requested.username",
  "requested.password",
]) {
  assert.equal(
    normalizedNavigation.includes(phrase),
    true,
    `${navigationPath} must include ${phrase}`,
  );
}

for (const forbidden of [
  "/api/admin-",
  "/customers",
  "/driver-job/",
  "supabase",
  "service_role",
  "customer_rates",
  "driver_payout",
  "PayNow",
  "Stripe",
]) {
  assert.equal(
    `${appSource}\n${navigationSource}\n${installationSource}`.includes(forbidden),
    false,
    `Customer companion source must not include ${forbidden}`,
  );
}

for (const phrase of [
  "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
  "biometricsSecurityLevel: \"strong\"",
  "disableDeviceFallback: true",
  "prestige.customer.biometric-enabled.v1",
]) {
  assert.equal(installationSource.includes(phrase), true, `${installationPath} must include ${phrase}`);
}

for (const phrase of [
  "Customer iPhone Companion Foundation",
  "customer-companion/",
  "does not modify `/book` or `/my-bookings`",
  "does not prove App Store acceptance",
  "Universal Link association remains unmodified",
  "Customer iOS Store Icon And TestFlight Preparation (2026-08-18)",
  "`ios.buildNumber` remains explicitly `1`",
  "`722d9df4d237a42fedf03bffa3f48078b148d796714ff17d18467b2b320f4f0e`",
  "`b55f726603fbae4bf0c101fee8dc23e782089f6fcb7f963c2542c9fc297cb670`",
  "`customer-companion/assets/app-icon.png`",
  "No Apple App ID, App Store Connect record, EAS project, signing credential, build, submission, TestFlight assignment, external testing, App Review submission, or public release is created by this local checkpoint",
  "Customer App Store Icon Clarity And SG Approval (2026-08-18)",
  "`f04038c4b341131cc36d182943da0a1b661c6b30420f20fe4ff2db14a36f6c9e`",
  "the exact centered gold text `SG`",
  "`@prestige-limo-ops/prestige-customer`",
  "`ce71ff91-7f71-4297-bcef-edf420f94316`",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `${ledgerPath} must include ${phrase}`);
}

assert.equal(
  preactivationSource.includes("scripts/test-customer-companion-foundation-guard.mjs"),
  true,
  "The Customer companion foundation guard must run in preactivation verification",
);

assert.equal(
  normalizedNavigation.includes("new URL(value)"),
  true,
  "Navigation must be parsed as a URL rather than accepted by string prefix",
);

console.log("Customer companion foundation guard passed.");
