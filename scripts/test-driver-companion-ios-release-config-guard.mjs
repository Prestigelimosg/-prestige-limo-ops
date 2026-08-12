import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const configPath = "driver-companion/app.json";
const appPath = "driver-companion/App.tsx";
const iconPath = "driver-companion/assets/icon.png";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [configSource, appSource, iconBytes, ledgerSource, preactivationSource] =
  await Promise.all([
    readFile(configPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(iconPath),
    readFile(ledgerPath, "utf8"),
    readFile(preactivationPath, "utf8"),
  ]);

const companionConfig = JSON.parse(configSource).expo;
const normalizedAppSource = appSource.replace(/\s+/g, " ");
assert.equal(
  companionConfig.name,
  "Prestige SG Driver",
  "The installed/public Driver app name must match its App Store Connect record",
);
assert.equal(companionConfig.userInterfaceStyle, "light", "The Companion must remain light mode");
assert.equal(
  companionConfig.version,
  "0.1.0",
  "The shared Android-facing version must remain unchanged by the iOS release alignment",
);
assert.equal(
  companionConfig.ios.version,
  "1.0.0",
  "The iOS public version must match the first App Store release",
);
assert.equal(companionConfig.ios.supportsTablet, true, "The iOS Companion must support iPad");
assert.equal(
  companionConfig.ios.infoPlist?.CFBundleDisplayName,
  "Prestige Driver",
  "The installed iPhone/iPad icon label must remain the owner-approved short Driver name",
);
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
assert.equal(
  createHash("sha256").update(iconBytes).digest("hex"),
  "b55f726603fbae4bf0c101fee8dc23e782089f6fcb7f963c2542c9fc297cb670",
  "The App Store icon must remain the exact owner-supplied Prestige artwork",
);

for (const phrase of [
  'alignSelf: "center"',
  "maxWidth: 720",
  'width: "100%"',
  "while your device screen is locked",
  "iOS shows its location indicator",
]) {
  assert.equal(
    normalizedAppSource.includes(phrase),
    true,
    `${appPath} must include ${phrase}`,
  );
}

for (const phrase of [
  "Driver Companion iOS Release Configuration",
  "Driver Companion iPad Support",
  "Driver App Store Name Alignment",
  "`Prestige SG Driver`",
  "`Prestige Driver`",
  "`driver-companion/assets/icon.png`",
  "`ios.version` is explicitly `1.0.0`",
  "`ios.buildNumber` is explicitly `1`",
  "`ios.supportsTablet: true`",
  "`usesNonExemptEncryption: false`",
  "does not prove a physical iPhone build",
  "does not prove physical iPad behavior",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `${ledgerPath} must include ${phrase}`);
}

assert.equal(
  preactivationSource.includes("scripts/test-driver-companion-ios-release-config-guard.mjs"),
  true,
  "The iOS release configuration guard must run in preactivation verification",
);

console.log("Driver Companion iOS release configuration guard passed");
