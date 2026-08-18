import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const configPath = "customer-companion/app.json";
const packagePath = "customer-companion/package.json";
const appPath = "customer-companion/App.tsx";
const navigationPath = "customer-companion/src/customer-navigation.ts";
const installationPath = "customer-companion/src/customer-installation.ts";
const iconPath = "customer-companion/assets/icon.png";
const approvedIconPath = "driver-companion/assets/icon.png";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [
  configSource,
  packageSource,
  appSource,
  navigationSource,
  installationSource,
  iconBytes,
  approvedIconBytes,
  ledgerSource,
  preactivationSource,
] = await Promise.all([
  readFile(configPath, "utf8"),
  readFile(packagePath, "utf8"),
  readFile(appPath, "utf8"),
  readFile(navigationPath, "utf8"),
  readFile(installationPath, "utf8"),
  readFile(iconPath),
  readFile(approvedIconPath),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationPath, "utf8"),
]);

const config = JSON.parse(configSource).expo;
const packageJson = JSON.parse(packageSource);
const normalizedApp = appSource.replace(/\s+/g, " ");
const normalizedNavigation = navigationSource.replace(/\s+/g, " ");

assert.equal(config.name, "Prestige SG");
assert.equal(config.slug, "prestige-customer");
assert.equal(config.scheme, "prestige-customer");
assert.equal(config.userInterfaceStyle, "light");
assert.equal(config.ios.bundleIdentifier, "sg.prestigelimo.customer");
assert.equal(config.ios.supportsTablet, false);
assert.equal(config.ios.infoPlist.CFBundleDisplayName, "Prestige SG");
assert.equal(config.ios.infoPlist.NSFaceIDUsageDescription.includes("Prestige SG"), true);
assert.equal(config.ios.config.usesNonExemptEncryption, false);
assert.equal(
  Object.hasOwn(config.ios, "associatedDomains"),
  false,
  "Universal Links must wait for a separately approved domain-association change",
);
assert.equal(config.ios.icon, "./assets/icon.png");

for (const dependency of [
  "expo-local-authentication",
  "expo-secure-store",
  "react-native-safe-area-context",
  "react-native-webview",
]) {
  assert.equal(typeof packageJson.dependencies[dependency], "string", `Missing ${dependency}`);
}

assert.deepEqual(
  createHash("sha256").update(iconBytes).digest("hex"),
  createHash("sha256").update(approvedIconBytes).digest("hex"),
  "The Customer app must retain the exact current approved Prestige icon",
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
