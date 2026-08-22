import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const configPath = "admin-companion/app.json";
const easPath = "admin-companion/eas.json";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [configSource, easSource, ledgerSource, preactivationSource] =
  await Promise.all([
    readFile(configPath, "utf8"),
    readFile(easPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(preactivationPath, "utf8"),
  ]);

const config = JSON.parse(configSource).expo;
const eas = JSON.parse(easSource);

assert.equal(config.name, "Prestige Limo Ops");
assert.equal(config.slug, "prestige-admin");
assert.equal(config.owner, "prestige-limo-ops");
assert.equal(config.version, "1.0.0");
assert.equal(config.ios.version, "1.0.0");
assert.equal(
  config.ios.buildNumber,
  "2",
  "The approved second Admin TestFlight build number must be explicit",
);
assert.equal(config.ios.bundleIdentifier, "sg.prestigelimo.admin");
assert.equal(config.ios.infoPlist.CFBundleDisplayName, "Prestige Limo Ops");
assert.equal(config.ios.supportsTablet, false);
assert.equal(config.userInterfaceStyle, "light");
assert.deepEqual(config.platforms, ["ios"]);
assert.equal(
  config.extra?.eas?.projectId,
  "2dada379-f732-4e25-80a3-cdbbb8f52b11",
);
assert.equal(eas.build?.production && Object.keys(eas.build.production).length, 0);
assert.equal(eas.submit?.production?.ios?.ascAppId, "6803312296");
assert.equal(config.plugins.includes("expo-notifications"), true);
assert.equal(Object.hasOwn(config.ios, "associatedDomains"), false);

for (const phrase of [
  "Admin iOS TestFlight Build 2 Native ACK Alert (source checkpoint 2026-08-22)",
  "`ios.buildNumber` is explicitly `2`",
  "`@prestige-limo-ops/prestige-admin`",
  "`2dada379-f732-4e25-80a3-cdbbb8f52b11`",
  "`sg.prestigelimo.admin`",
  "`6803312296`",
  "existing internal `Owner Testing` group",
  "No real notification or Production subscription/data mutation",
]) {
  assert.equal(
    ledgerSource.includes(phrase),
    true,
    `${ledgerPath} must include ${phrase}`,
  );
}

assert.equal(
  preactivationSource.includes(
    "scripts/test-admin-companion-ios-build2-release-guard.mjs",
  ),
  true,
  "The Admin Build 2 release guard must run in preactivation verification",
);

console.log("Admin Companion iOS Build 2 release guard passed.");
