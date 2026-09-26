import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  "11",
  "The Admin Face ID load-recovery release uses Build 11",
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
assert.deepEqual(eas.build?.production, {
  channel: "production",
  ios: { image: "macos-tahoe-26.5-xcode-26.6" },
}, "Pin the verified Xcode 26 toolchain; an automatic image may introduce the iOS 27 scene requirement");

// Source configuration cannot prove a local/cloud builder actually used that SDK.
// Before upload, run this same guard with --ipa /absolute/path/to/finished.ipa.
const ipaFlag = process.argv.indexOf("--ipa");
if (ipaFlag !== -1) {
  assert.ok(process.argv[ipaFlag + 1], "--ipa requires the finished artifact path");
  const metadata = JSON.parse(execFileSync("python3", ["-c", `
import json, plistlib, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    names = [n for n in archive.namelist() if n.startswith('Payload/') and n.count('/') == 2 and n.endswith('/Info.plist')]
    assert len(names) == 1, 'Expected one main app Info.plist'
    p = plistlib.loads(archive.read(names[0]))
    keys = ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion', 'DTSDKName', 'DTXcode', 'DTPlatformVersion']
    print(json.dumps({k: p.get(k) for k in keys}))
`, process.argv[ipaFlag + 1]], { encoding: "utf8" }));
  assert.equal(metadata.CFBundleIdentifier, "sg.prestigelimo.admin");
  assert.equal(metadata.CFBundleShortVersionString, "1.0.0");
  assert.match(metadata.DTSDKName ?? "", /^iphoneos26\./, "Legacy Admin startup must not ship an iOS 27 SDK binary without an approved scene migration");
  assert.match(metadata.DTXcode ?? "", /^26\d{2}$/);
  assert.match(metadata.DTPlatformVersion ?? "", /^26\./);
  assert.equal(metadata.CFBundleVersion, config.ios.buildNumber);
  console.log("Finished Admin IPA toolchain compatibility passed.");
}
assert.equal(eas.submit?.production?.ios?.ascAppId, "6803312296");
assert.equal(config.plugins.includes("expo-notifications"), true);
assert.equal(Object.hasOwn(config.ios, "associatedDomains"), false);

for (const phrase of [
  "Admin iOS TestFlight Build 2 Native ACK Alert (source checkpoint 2026-08-22)",
  "`ios.buildNumber` is explicitly `2`",
  "Admin iOS TestFlight Build 3 Blank Sign-In Recovery (source checkpoint 2026-08-24)",
  "`ios.buildNumber` advances only from processed Build 2 to `3`",
  "`caf3f563c4505f71a850a6ac646dfce7b4e13c09`",
  "`@prestige-limo-ops/prestige-admin`",
  "`2dada379-f732-4e25-80a3-cdbbb8f52b11`",
  "`sg.prestigelimo.admin`",
  "`6803312296`",
  "existing internal `Owner Testing` group",
  "No real notification or Production subscription/data mutation",
  "No Production data change, notification, status, message, booking, Calendar, invoice, payment, payout, PayNow, schema, environment, or external send",
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

console.log("Admin Companion Build 11 release identity guard passed.");
