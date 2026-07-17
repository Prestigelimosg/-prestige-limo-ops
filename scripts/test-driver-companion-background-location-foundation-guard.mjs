import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  app: "driver-companion/App.tsx",
  config: "driver-companion/app.json",
  contract: "driver-companion/src/driver-job-contract.ts",
  index: "driver-companion/index.ts",
  ledger: "docs/current-implementation-ledger.md",
  locationTask: "driver-companion/src/background-location-task.ts",
  package: "driver-companion/package.json",
  preactivation: "scripts/test-preactivation-verification-suite.mjs",
  readme: "driver-companion/README.md",
  secureStore: "driver-companion/src/active-job-store.ts",
  tracking: "driver-companion/src/tracking.ts",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);

function includes(key, fragment) {
  assert.equal(
    source[key].includes(fragment),
    true,
    `${files[key]} must include ${fragment}`,
  );
}

function excludes(key, pattern) {
  assert.equal(
    pattern.test(source[key]),
    false,
    `${files[key]} must exclude ${pattern}`,
  );
}

for (const fragment of [
  '"expo": "~57.0.6"',
  '"expo-location": "~57.0.4"',
  '"expo-secure-store": "~57.0.1"',
  '"expo-task-manager": "~57.0.4"',
  '"react-native-safe-area-context": "~5.7.0"',
  '"typecheck": "tsc --noEmit"',
]) {
  includes("package", fragment);
}

for (const fragment of [
  '"owner": "prestige-limo-ops"',
  '"projectId": "2a797181-d09d-4384-8d01-583456e83c3e"',
  '"bundleIdentifier": "sg.prestigelimo.drivercompanion"',
  '"package": "sg.prestigelimo.drivercompanion"',
  '"isIosBackgroundLocationEnabled": true',
  '"isAndroidBackgroundLocationEnabled": true',
  '"isAndroidForegroundServiceEnabled": true',
  '"android.permission.RECEIVE_BOOT_COMPLETED"',
]) {
  includes("config", fragment);
}

includes("index", 'import "./src/background-location-task";');
includes("locationTask", "TaskManager.defineTask(DRIVER_LOCATION_TASK_NAME");
includes("locationTask", "postDriverLocation");
includes("locationTask", "stopTrackingAfterTerminalResponse");
includes("secureStore", "SecureStore.AFTER_FIRST_UNLOCK");
includes("secureStore", "requireAuthentication: false");
includes("contract", 'const productionOrigin = "https://app.prestigelimo.sg";');
includes("contract", "/api/driver-job/${encodeURIComponent(job.token)}/live-location");
includes("contract", "customerVisible !== false || body.external_send !== false");
includes("tracking", "Location.requestForegroundPermissionsAsync");
includes("tracking", "Location.requestBackgroundPermissionsAsync");
includes("tracking", "Location.startLocationUpdatesAsync");
includes("tracking", "Location.stopLocationUpdatesAsync");
includes("tracking", 'notificationTitle: "Prestige trip tracking active"');
includes("tracking", "showsBackgroundLocationIndicator: true");
includes("tracking", "waiting for the first server update");
includes("app", "Start trip tracking");
includes("app", "Stop trip tracking");
includes("app", 'from "react-native-safe-area-context"');
includes("app", "<SafeAreaProvider initialMetrics={initialWindowMetrics}>");
includes("app", 'edges={["top", "right", "bottom", "left"]}');
includes("app", "Tracking does not start automatically");
includes("app", "Force-quitting the app,");
includes("readme", "Expo Go cannot test this background-location workflow.");
includes("preactivation", "scripts/test-driver-companion-background-location-foundation-guard.mjs");

const combinedNativeSource = [
  source.app,
  source.contract,
  source.index,
  source.locationTask,
  source.secureStore,
  source.tracking,
].join("\n");

for (const pattern of [
  /SUPABASE_SERVICE_ROLE_KEY|service[_ -]?role/i,
  /NEXT_PUBLIC_|EXPO_PUBLIC_/,
  /createClient\(|\.from\(/,
  /setInterval|setTimeout|watchPosition/,
  /sendBeacon|websocket|EventSource/,
  /prestige-driver:\/\//,
  /customer[_ -]?price|billing|invoice|payment|driver[_ -]?payout|paynow|payout|internal[_ -]?(?:admin|finance)|mock[_ -]?(?:qa|archive)|parser|debug/i,
  /customerVisible\s*[:=]\s*true|external_send\s*[:=]\s*true/,
]) {
  assert.equal(pattern.test(combinedNativeSource), false, `native companion must exclude ${pattern}`);
}

excludes(
  "app",
  /import\s*\{[^}]*\bSafeAreaView\b[^}]*\}\s*from\s*"react-native"/,
);

for (const pattern of [
  /Start trip tracking[\s\S]{0,120}onPress=\{startTripTracking\}/,
  /Stop trip tracking[\s\S]{0,120}onPress=\{stopTripTracking\}/,
]) {
  assert.equal(pattern.test(source.app), true, `explicit tracking control must match ${pattern}`);
}

const ledgerHeading = "### Driver Companion iPhone/Android Background-Location Foundation";
const ledgerStart = source.ledger.indexOf(ledgerHeading);
assert.notEqual(ledgerStart, -1, `ledger must include ${ledgerHeading}`);
const ledgerSection = source.ledger.slice(ledgerStart, source.ledger.indexOf("\n### ", ledgerStart + ledgerHeading.length) || undefined);

for (const phrase of [
  "one cross-platform Driver Companion foundation for iPhone and Android",
  "reuses the existing token-scoped `GET`, `POST`, and `DELETE /api/driver-job/[token]/live-location` contract",
  "does not add a route, table, writer, admin map, timer, customer lane, provider send, or Supabase key to the phone",
  "starts only after the driver pastes the exact private Driver Job URL and taps `Start trip tracking`",
  "iOS background indicator and Android persistent foreground-service notification",
  "Real screen-off evidence still requires a development/native build installed on one physical iPhone and one physical Android phone",
  "EAS generated and remotely stored one new Android keystore without exposing or downloading its values",
  "Internal development build `6cb117cf-a67f-4223-b6b2-5fe975d0c56b`",
  "The APK was not installed or run, no location permission was granted, no job token was entered, no live GPS or booking record was touched",
  "successful cloud build proves only that Android native compilation/signing completed",
  "No iOS build, Apple credential, certificate, provisioning profile, device registration, or App Store change was started",
  "The first approved Start attempt reproduced two real defects and was halted",
  "Requested job cannot be persisted without holding android.permission.RECEIVE_BOOT_COMPLETED permission",
  "replaces React Native's deprecated `SafeAreaView` with Expo-compatible `react-native-safe-area-context`",
  "declares `android.permission.RECEIVE_BOOT_COMPLETED` alongside the existing precise/background/foreground-service permissions",
  "replacement APK must be built, installed on the Pixel 6, and rerun through Start, visible notification, background/lock, admin-marker, and Stop cleanup evidence",
  "EAS replacement internal-development build `bcbf3c15-e377-41a2-822c-f5f132f1c3c1`",
  "using the existing remotely stored Android keystore; no new signing credential was created",
  "replacement APK has not yet been installed or rerun on the Pixel 6",
  "old crashed installation's persisted task/token state must be cleared before retesting",
]) {
  assert.equal(ledgerSection.includes(phrase), true, `ledger section must include ${phrase}`);
}

console.log("Driver Companion background-location foundation guard passed");
