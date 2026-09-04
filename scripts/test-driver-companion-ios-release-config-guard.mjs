import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const configPath = "driver-companion/app.json";
const easConfigPath = "driver-companion/eas.json";
const appPath = "driver-companion/App.tsx";
const iconPath = "driver-companion/assets/icon.png";
const packagePath = "driver-companion/package.json";
const packageLockPath = "driver-companion/package-lock.json";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";

const [configSource, easConfigSource, appSource, iconBytes, packageSource, packageLockSource, ledgerSource, preactivationSource] =
  await Promise.all([
    readFile(configPath, "utf8"),
    readFile(easConfigPath, "utf8"),
    readFile(appPath, "utf8"),
    readFile(iconPath),
    readFile(packagePath, "utf8"),
    readFile(packageLockPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(preactivationPath, "utf8"),
  ]);

const companionConfig = JSON.parse(configSource).expo;
const easConfig = JSON.parse(easConfigSource);
const packageConfig = JSON.parse(packageSource);
const packageLock = JSON.parse(packageLockSource);
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
assert.equal(
  companionConfig.ios.buildNumber,
  "18",
  "The proposed eighteenth Driver release checkpoint build number must be explicit",
);
assert.equal(
  easConfig.submit?.production?.ios?.ascAppId,
  "6800706103",
  "The production iOS submit profile must target the exact existing Prestige SG Driver App Store record",
);
assert.equal(
  companionConfig.ios.config.usesNonExemptEncryption,
  false,
  "The iOS build must declare its HTTPS-only exempt encryption posture",
);

const expectedSdk57Patches = {
  expo: ["~57.0.20", "57.0.20"],
  "expo-constants": ["~57.0.17", "57.0.17"],
  "expo-dev-client": ["~57.0.18", "57.0.18"],
  "expo-location": ["~57.0.16", "57.0.16"],
  "expo-notifications": ["~57.0.17", "57.0.17"],
  "expo-secure-store": ["~57.0.3", "57.0.3"],
  "expo-task-manager": ["~57.0.16", "57.0.16"],
};
for (const [packageName, [expectedRange, expectedResolvedVersion]] of Object.entries(
  expectedSdk57Patches,
)) {
  assert.equal(
    packageConfig.dependencies?.[packageName],
    expectedRange,
    `${packagePath} must retain the approved ${packageName} SDK 57 patch range`,
  );
  assert.equal(
    packageLock.packages?.[`node_modules/${packageName}`]?.version,
    expectedResolvedVersion,
    `${packageLockPath} must resolve the approved ${packageName} SDK 57 patch`,
  );
}

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
  "bf866745d1f7a59791eea43204df17083a857a0943d7365ac3adf0161e008552",
  "The App Store icon must remain the exact owner-supplied Prestige artwork",
);

for (const phrase of [
  "<WebView",
  "style={styles.webView}",
  'webView: { backgroundColor: "#f8fafc", flex: 1 }',
  "Prestige Driver",
  "allowsBackForwardNavigationGestures",
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
  "production EAS submit profile targets only App Store Connect app `6800706103`",
  "Driver iOS TestFlight Build 2 (2026-08-15)",
  "`ios.buildNumber` is explicitly `2`",
  "Driver iOS TestFlight Build 3 (2026-08-15)",
  "`ios.buildNumber` is explicitly `3`",
  "Driver iOS TestFlight Build 4 (2026-08-15)",
  "`ios.buildNumber` is explicitly `4`",
  "Driver iOS TestFlight Build 5 (2026-08-15)",
  "`ios.buildNumber` is explicitly `5`",
  "Driver iOS TestFlight Build 6 (2026-08-15)",
  "`ios.buildNumber` is explicitly `6`",
  "Driver iOS TestFlight Build 7 (2026-08-16)",
  "`ios.buildNumber` is explicitly `7`",
  "Driver iOS TestFlight Build 8 (2026-08-16)",
  "`ios.buildNumber` is explicitly `8`",
  "Driver iOS TestFlight Build 9 (2026-08-16)",
  "`ios.buildNumber` is explicitly `9`",
  "Driver iOS TestFlight Build 10 (2026-08-17)",
  "`ios.buildNumber` is explicitly `10`",
  "Driver iOS TestFlight Build 11 (2026-08-17)",
  "`ios.buildNumber` is explicitly `11`",
  "Driver iOS TestFlight Build 12 (2026-08-17)",
  "`ios.buildNumber` is explicitly `12`",
  "Driver iOS TestFlight Build 13 (2026-08-17)",
  "`ios.buildNumber` is explicitly `13`",
  "Driver iOS TestFlight Build 14 Logo Replacement (2026-08-18)",
  "`ios.buildNumber` is explicitly `14`",
  "Driver iOS TestFlight Build 15 Type 2 Native Handoff (source checkpoint 2026-08-22)",
  "`ios.buildNumber` is explicitly `15`",
  "`bf866745d1f7a59791eea43204df17083a857a0943d7365ac3adf0161e008552`",
  "No commit, push, pull request, merge, EAS build, Apple upload, TestFlight assignment, external testing, App Review submission, or public release is included in this local checkpoint",
  "94e64ea215a39acfd2a04e3281bd899919494392",
  "one-hour-before-pickup reminder keep opening the normal exact job",
  "13d2598347057b719c516a93453d9f2b8b4edc57",
  "857ea362-40ca-4891-acae-f74cac5eec28",
  "ad80844dd958208ba99ce3f76eca889c63a3b2cae5b08bb50c60c16c7ebeaa0f",
  "0ab0561e-c0b7-4c75-847b-e30ac6b36788",
  "195386d2-621a-460c-9ab8-02bf895c364a",
  "Apple processed exact Build 13",
  "only that Build 13 was assigned to the existing internal `Owner Testing` group",
  "independent EAS/App Store status read reported `IN_BETA_TESTING`",
  "ad86ccd7-5b8f-4435-85aa-4ea15d5fbe31",
  "b97e106196b76ca5ba30e1811fa3e3baa7053bd8f7403ae6b2eb650cb9ee8fe6",
  "d2ccdb5d-298f-44e6-b244-2fca96e83ab9",
  "Apple successfully processed `1.0.0 - 11`",
  "live GPS continued while the phone was locked and that Pickup Risk worked on that iPhone",
  "Customer 30-Minute Tracking Gate And Driver Build 17 Repairs",
  "only Driver `ios.buildNumber` advances from processed Build 16 to `17`",
  "2e04a122-c005-47ef-9aba-e11eb5c03dbf",
  "e9efaf28-615c-4631-bd0d-92f4a3e4eb9d",
  "24e47f73455c5493376ae47e5017e4ae908477ed866c99911ac40c5b5a3ec34d",
  "internal state `IN_BETA_TESTING`",
  "Build 17 acceptance remains pending",
  "Reusable QA booking `10906`",
  "Prestige SG Driver Build 18 Release Checkpoint (source checkpoint 2026-09-04)",
  "advances only Prestige SG Driver `ios.buildNumber` from accepted TestFlight Build `17` to proposed Build `18`",
  "Build 17 remains the accepted physical TestFlight baseline",
  "Build 18 is only a prepared source checkpoint",
  "no paid EAS build, IPA creation, Apple upload, TestFlight assignment, external notification, Driver Pool offer, booking, device or Production-data mutation is included",
  "does not recreate QA bookings `10906` or `10908`",
  "Expo Doctor now passes `21/21`",
  "no package was added or removed",
  "no permission/config plugin was changed",
  "0687fdc06b98d0146afa1be79966fdede42127a48f9293b0ed12e594233d6891",
  "all 22/22 focused Driver/native/protected-lane guards",
  "Source checks still do not prove a signed Build 18 binary",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `${ledgerPath} must include ${phrase}`);
}

assert.equal(
  preactivationSource.includes("scripts/test-driver-companion-ios-release-config-guard.mjs"),
  true,
  "The iOS release configuration guard must run in preactivation verification",
);

console.log("Driver Companion iOS release configuration guard passed");
