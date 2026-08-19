import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  app: "admin-companion/App.tsx",
  config: "admin-companion/app.json",
  eas: "admin-companion/eas.json",
  installation: "admin-companion/src/admin-installation.ts",
  ledger: "docs/current-implementation-ledger.md",
  navigation: "admin-companion/src/admin-navigation.ts",
  package: "admin-companion/package.json",
  preactivation: "scripts/test-preactivation-verification-suite.mjs",
  rootTsconfig: "tsconfig.json",
  stagedGuard: "scripts/test-staged-app-change-ledger-guard.mjs",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);
const config = JSON.parse(source.config).expo;
const eas = JSON.parse(source.eas);
const packageJson = JSON.parse(source.package);
const rootTsconfig = JSON.parse(source.rootTsconfig);
const normalizedApp = source.app.replace(/\s+/g, " ");
const normalizedNavigation = source.navigation.replace(/\s+/g, " ");

assert.equal(config.name, "Prestige SG Admin");
assert.equal(config.slug, "prestige-admin");
assert.equal(config.owner, "prestige-limo-ops");
assert.equal(config.version, "1.0.0");
assert.equal(config.userInterfaceStyle, "light");
assert.equal(config.scheme, "prestige-admin");
assert.deepEqual(config.platforms, ["ios"]);
assert.equal(config.ios.version, "1.0.0");
assert.equal(config.ios.buildNumber, "1");
assert.equal(config.ios.bundleIdentifier, "sg.prestigelimo.admin");
assert.equal(config.ios.supportsTablet, false);
assert.equal(config.ios.infoPlist.CFBundleDisplayName, "Prestige Admin");
assert.equal(config.ios.config.usesNonExemptEncryption, false);
assert.match(config.ios.infoPlist.NSFaceIDUsageDescription, /Prestige Admin/);
assert.equal(config.extra?.eas?.projectId, undefined, "Provider identity must remain unset before approval");
assert.equal(eas.submit?.production?.ios?.ascAppId, undefined, "Apple app identity must remain unset before approval");
assert.equal(Object.hasOwn(config.ios, "associatedDomains"), false);

for (const dependency of [
  "expo-local-authentication",
  "expo-secure-store",
  "react-native-safe-area-context",
  "react-native-webview",
]) {
  assert.equal(typeof packageJson.dependencies[dependency], "string", `Missing ${dependency}`);
}

for (const phrase of [
  "Prestige SG Admin",
  "Admin sign in",
  "Face ID is required",
  "Unlock Prestige Admin",
  "Retry Face ID",
  "sharedCookiesEnabled",
  "thirdPartyCookiesEnabled={false}",
  'mixedContentMode="never"',
  "shouldAllowAdminWebViewNavigation",
  "enableAdminBiometricUnlock",
  "authenticateAdminAppUnlock",
  "adminSignInUrl",
  "injectJavaScript",
  '"admin-account-sign-out"',
]) {
  assert.equal(normalizedApp.includes(phrase), true, `${paths.app} must include ${phrase}`);
}

for (const phrase of [
  'export const productionOrigin = "https://app.prestigelimo.sg"',
  '"/admin-sign-in"',
  'pathname === "/"',
  'pathname === "/customers"',
  'pathname.startsWith("/customers/")',
  'pathname === "/settings/invoice"',
  "requested.origin !== productionOrigin",
  "requested.username",
  "requested.password",
]) {
  assert.equal(normalizedNavigation.includes(phrase), true, `${paths.navigation} must include ${phrase}`);
}

for (const forbidden of [
  "/book",
  "/my-bookings",
  "/driver-job/",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN",
  "PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET",
  "service_role",
  "expo-notifications",
  "expo-location",
  "PayNow",
]) {
  assert.equal(
    `${source.app}\n${source.navigation}\n${source.installation}`.includes(forbidden),
    false,
    `Admin companion source must not include ${forbidden}`,
  );
}

for (const phrase of [
  "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
  'biometricsSecurityLevel: "strong"',
  "disableDeviceFallback: true",
  "prestige.admin.biometric-enabled.v1",
]) {
  assert.equal(source.installation.includes(phrase), true, `${paths.installation} must include ${phrase}`);
}

assert.equal(rootTsconfig.exclude.includes("admin-companion"), true);
assert.equal(source.stagedGuard.includes('"admin-companion/"'), true);
assert.equal(source.preactivation.includes("scripts/test-admin-companion-foundation-guard.mjs"), true);
for (const phrase of [
  "Admin iPhone Companion Foundation (2026-08-19)",
  "server login succeeds",
  "Face ID",
  "No EAS project, Apple App ID, App Store Connect record, cloud build, submission, or TestFlight assignment",
]) {
  assert.equal(source.ledger.includes(phrase), true, `${paths.ledger} must include ${phrase}`);
}

console.log("Admin companion foundation guard passed.");
