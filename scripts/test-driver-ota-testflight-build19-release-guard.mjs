import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminConfigSource, customerConfigSource, driverConfigSource, driverEasSource, driverPackageSource, driverAppSource, ledgerSource, preactivationSource] =
  await Promise.all([
    readFile("admin-companion/app.json", "utf8"),
    readFile("customer-companion/app.json", "utf8"),
    readFile("driver-companion/app.json", "utf8"),
    readFile("driver-companion/eas.json", "utf8"),
    readFile("driver-companion/package.json", "utf8"),
    readFile("driver-companion/App.tsx", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  ]);

const admin = JSON.parse(adminConfigSource).expo;
const customer = JSON.parse(customerConfigSource).expo;
const driver = JSON.parse(driverConfigSource).expo;
const driverEas = JSON.parse(driverEasSource);
const driverPackage = JSON.parse(driverPackageSource);

assert.deepEqual(
  [admin.ios.buildNumber, customer.ios.buildNumber],
  ["7", "12"],
  "Admin and Customer native builds must remain parked",
);
assert.deepEqual(
  [
    driver.name,
    driver.ios.infoPlist?.CFBundleDisplayName,
    driver.ios.version,
    driver.ios.buildNumber,
    driver.ios.bundleIdentifier,
    driver.extra?.eas?.projectId,
    driverEas.submit?.production?.ios?.ascAppId,
  ],
  [
    "Prestige SG Driver",
    "Prestige Driver",
    "1.0.0",
    "19",
    "sg.prestigelimo.drivercompanion",
    "2a797181-d09d-4384-8d01-583456e83c3e",
    "6800706103",
  ],
  "Driver Build 19 must keep the exact existing Apple and Expo identities",
);
assert.equal(driver.userInterfaceStyle, "light");
assert.deepEqual(driver.runtimeVersion, { policy: "appVersion" });
assert.deepEqual(driver.updates, {
  checkAutomatically: "ON_LOAD",
  fallbackToCacheTimeout: 0,
  url: "https://u.expo.dev/2a797181-d09d-4384-8d01-583456e83c3e",
});
assert.match(driverPackage.dependencies?.["expo-updates"] || "", /^~57\./);
assert.equal(driverEas.build?.production?.channel, "production");
assert.equal(driverAppSource.includes('from "expo-updates"'), false);
assert.equal(driverAppSource.includes("Updates.reloadAsync"), false);

for (const phrase of [
  "Prestige SG Driver Build 19 OTA Foundation TestFlight Release Checkpoint (source checkpoint 2026-09-05)",
  "advances only Driver `ios.buildNumber` from completed Build `18` to `19`",
  "Admin Build `7` and Customer Build `12` remain parked",
  "No OTA update is published by this checkpoint",
  "Driver Native Visible Alert Badge Persistence Repair",
  "Driver Pool Winner Driver Alert, Silent Loser Refresh And Pre-Link Assignment Recovery",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `Implementation ledger must include ${phrase}`);
}
assert.equal(
  preactivationSource.includes("scripts/test-driver-ota-testflight-build19-release-guard.mjs"),
  true,
  "The Driver Build 19 release guard must run in preactivation verification",
);

console.log("Driver Build 19 OTA-foundation TestFlight release guard passed.");
