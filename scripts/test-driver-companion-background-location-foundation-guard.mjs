import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  app: "driver-companion/App.tsx",
  bridge: "driver-companion/src/driver-webview-bridge.ts",
  config: "driver-companion/app.json",
  contract: "driver-companion/src/driver-job-contract.ts",
  index: "driver-companion/index.ts",
  ledger: "docs/current-implementation-ledger.md",
  locationTask: "driver-companion/src/background-location-task.ts",
  package: "driver-companion/package.json",
  preactivation: "scripts/test-preactivation-verification-suite.mjs",
  readme: "driver-companion/README.md",
  rootTsconfig: "tsconfig.json",
  secureStore: "driver-companion/src/active-job-store.ts",
  tracking: "driver-companion/src/tracking.ts",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]),
  ),
);
const companionConfig = JSON.parse(source.config).expo;

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

function countOccurrences(sourceValue, fragment) {
  return sourceValue.split(fragment).length - 1;
}

for (const fragment of [
  '"expo": "~57.0.20"',
  '"expo-location": "~57.0.16"',
  '"expo-secure-store": "~57.0.3"',
  '"expo-system-ui": "~57.0.3"',
  '"expo-task-manager": "~57.0.16"',
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

assert.deepEqual(
  companionConfig.ios.associatedDomains,
  [
    "applinks:app.prestigelimo.sg",
    "webcredentials:app.prestigelimo.sg",
  ],
  "iOS must claim only the established production Driver Job and HTTPS auth callback origin",
);
assert.equal(companionConfig.userInterfaceStyle, "light", "Companion must remain light mode");
assert.deepEqual(
  companionConfig.android.intentFilters,
  [
    {
      action: "VIEW",
      autoVerify: true,
      category: ["BROWSABLE", "DEFAULT"],
      data: [
        {
          host: "app.prestigelimo.sg",
          pathPrefix: "/driver-job/",
          scheme: "https",
        },
      ],
    },
  ],
  "Android must claim only the established HTTPS Driver Job path",
);

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
includes("app", "handleBridgeMessage");
includes("app", 'request.type === "tracking_start"');
includes("app", 'request.type === "tracking_stop"');
includes("app", "startDriverTracking(job)");
includes("app", "stopDriverTracking()");
includes("app", "<WebView");
includes("bridge", 'type: "tracking_start" | "tracking_stop" | "tracking_terminal"');
includes("app", 'from "react-native-safe-area-context"');
includes("app", "<SafeAreaProvider initialMetrics={initialWindowMetrics}>");
includes("app", 'edges={["top", "right", "bottom", "left"]}');
includes("app", "Tracking does not start automatically");
includes("app", "Force-quitting the app,");
includes("app", "Linking.getInitialURL()");
includes("app", 'Linking.addEventListener("url"');
includes("app", "parseDriverJobUrl(incomingUrl)");
includes("app", "Driver Portal is ready.");
includes("app", "trackingState.active && trackingState.job");
includes("readme", "Expo Go cannot prove the complete embedded workflow or background location.");
const rootTsconfig = JSON.parse(source.rootTsconfig);
assert.equal(
  rootTsconfig.exclude.includes("driver-companion"),
  true,
  "The root Next.js type check must exclude the isolated Driver native project",
);
includes("preactivation", "scripts/test-driver-companion-background-location-foundation-guard.mjs");

const combinedNativeSource = [
  source.app,
  source.bridge,
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
excludes("app", /privateJobUrl|Paste the private Driver Job URL|title="Check job"/);
assert.equal(
  countOccurrences(source.app, "startDriverTracking("),
  1,
  "Only the existing explicit Start action may call native tracking",
);
const incomingLinkStart = source.app.indexOf("const receiveDriverJobUrl");
const incomingLinkEnd = source.app.indexOf("useEffect(() =>", incomingLinkStart);
assert.notEqual(incomingLinkStart, -1, "Incoming Driver Job link handler must exist");
assert.notEqual(incomingLinkEnd, -1, "Incoming Driver Job link handler must be bounded");
const incomingLinkBlock = source.app.slice(incomingLinkStart, incomingLinkEnd);
assert.equal(
  /startDriverTracking|requestForegroundPermissionsAsync|requestBackgroundPermissionsAsync/.test(
    incomingLinkBlock,
  ),
  false,
  "Opening a Driver Job link must not start tracking or request location permission",
);

assert.equal(
  /parseDriverBridgeMessage\(event\.nativeEvent\.data\)[\s\S]*?request\.type === "tracking_start"[\s\S]*?startDriverTracking\(job\)/.test(
    source.app,
  ),
  true,
  "Only the exact embedded OTW bridge may start native tracking",
);
assert.equal(
  /request\.type === "tracking_start"[\s\S]*?startDriverTracking\(job\)[\s\S]*?: await stopDriverTracking\(\)/.test(
    source.app,
  ),
  true,
  "Only the exact embedded Stop Sharing bridge may stop native tracking",
);

const ledgerHeading = "### Driver Companion iPhone/Android Background-Location Foundation";
const ledgerStart = source.ledger.indexOf(ledgerHeading);
assert.notEqual(ledgerStart, -1, `ledger must include ${ledgerHeading}`);
const ledgerSection = source.ledger.slice(ledgerStart, source.ledger.indexOf("\n### ", ledgerStart + ledgerHeading.length) || undefined);

for (const phrase of [
  "one cross-platform Driver Companion foundation for iPhone and Android",
  "reuses the existing token-scoped `GET`, `POST`, and `DELETE /api/driver-job/[token]/live-location` contract",
  "does not add a route, table, writer, admin map, timer, customer lane, provider send, or Supabase key to the phone",
  "accepts only the established exact HTTPS private Driver Job URL on cold start or while already open",
  "A received link loads the safe job summary but never starts location sharing or requests location permission automatically",
  "No Apple Team ID, Android signing fingerprint, store URL, domain-association file, signing credential, OAuth client, or provider setting is invented or changed",
  "Expo SDK 57-compatible `expo-system-ui` keeps the generated native app in the existing light appearance",
  "The current local source produced one unsigned iOS Simulator `BUILD SUCCEEDED`",
  "one Android `:app:assembleDebug` `BUILD SUCCESSFUL`",
  "Expo Doctor reported 19/20 because its current metadata expects five newer patch versions",
  "Those five versions were unchanged from `main`; they were not upgraded after the physical Pixel proof",
  "This changed build remains untested on a physical iPhone",
  "Android warm private-link launch, explicit foreground/background permission, screen-lock updates, the persistent OS notification, and exact Stop cleanup are now physically verified",
  "iOS background indicator and Android persistent foreground-service notification",
  "Android screen-off evidence now exists for the current local source on one physical Pixel 6 Pro",
  "Full cross-platform acceptance still requires a physical iPhone test",
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
  "At that historical checkpoint the replacement APK had not been installed or rerun on the Pixel 6",
  "used a temporary development-only custom scheme only inside that disposable native copy",
  "The Pixel 6 Pro warm-link test used assigned booking `10871`",
  "safe booking summary loaded with tracking OFF",
  "ADB reported `mWakefulness=Dozing`",
  "remained an Android location-type foreground service with its persistent private notification for more than five minutes",
  "advanced its current-location time from 19:37 to 19:39 SGT while the screen remained off",
  "returned the Companion to `TRACKING OFF`, removed foreground-service status, and cleared the server marker",
  "Live Dispatch then showed `0 live`",
  "The test did not verify iPhone behavior, cold standalone release routing, production domain association, completed-job automatic stop, stale/offline display, customer visibility, signing, review, or store publication",
]) {
  assert.equal(ledgerSection.includes(phrase), true, `ledger section must include ${phrase}`);
}

console.log("Driver Companion background-location foundation guard passed");
