import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const configPath = "driver-companion/app.json";
const iconPath = "driver-companion/assets/icon.png";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [configSource, iconBytes, ledgerSource, preactivationSource] = await Promise.all([
  readFile(configPath, "utf8"),
  readFile(iconPath),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationPath, "utf8"),
]);

const companionConfig = JSON.parse(configSource).expo;
assert.equal(companionConfig.userInterfaceStyle, "light", "The Companion must remain light mode");
assert.equal(companionConfig.ios.icon, "./assets/icon.png", "iOS must use the bounded Prestige icon");
assert.equal(companionConfig.ios.buildNumber, "1", "The first iOS build number must be explicit");
assert.equal(
  companionConfig.ios.config.usesNonExemptEncryption,
  false,
  "The iOS build must declare its HTTPS-only exempt encryption posture",
);

assert.deepEqual(
  [...iconBytes.subarray(0, 8)],
  [137, 80, 78, 71, 13, 10, 26, 10],
  "The App Store icon must be a PNG",
);
assert.equal(iconBytes.readUInt32BE(16), 1024, "The App Store icon must be 1024 pixels wide");
assert.equal(iconBytes.readUInt32BE(20), 1024, "The App Store icon must be 1024 pixels high");
assert.equal(iconBytes[25], 2, "The App Store icon must be RGB without an alpha channel");

for (const phrase of [
  "Driver Companion iOS Release Configuration",
  "`driver-companion/assets/icon.png`",
  "`ios.buildNumber` is explicitly `1`",
  "`usesNonExemptEncryption: false`",
  "does not prove a physical iPhone build",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `${ledgerPath} must include ${phrase}`);
}

assert.equal(
  preactivationSource.includes("scripts/test-driver-companion-ios-release-config-guard.mjs"),
  true,
  "The iOS release configuration guard must run in preactivation verification",
);

console.log("Driver Companion iOS release configuration guard passed");
