import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const paths = {
  app: new URL("../driver-companion/App.tsx", import.meta.url),
  bridge: new URL(
    "../driver-companion/src/driver-webview-bridge.ts",
    import.meta.url,
  ),
  calendarRoute: new URL(
    "../app/api/driver-job/[token]/calendar/route.ts",
    import.meta.url,
  ),
  cameraPlugin: new URL(
    "../driver-companion/plugins/with-driver-camera-query.js",
    import.meta.url,
  ),
  contract: new URL(
    "../driver-companion/src/driver-job-contract.ts",
    import.meta.url,
  ),
  driverPage: new URL("../app/driver-job/[token]/page.tsx", import.meta.url),
  nativeOauthRoute: new URL(
    "../app/api/driver-google-calendar-oauth/native-start/route.ts",
    import.meta.url,
  ),
  package: new URL("../driver-companion/package.json", import.meta.url),
  config: new URL("../driver-companion/app.json", import.meta.url),
  androidAssociation: new URL(
    "../app/.well-known/assetlinks.json/route.ts",
    import.meta.url,
  ),
};

for (const [label, path] of Object.entries(paths)) {
  assert.ok(existsSync(path), `${label} source must exist for the embedded Driver workflow`);
}

const source = Object.fromEntries(
  Object.entries(paths).map(([label, path]) => [label, readFileSync(path, "utf8")]),
);

for (const fragment of [
  'from "react-native-webview"',
  'import * as WebBrowser from "expo-web-browser"',
  "onShouldStartLoadWithRequest",
  "onMessage",
  "injectedJavaScriptBeforeContentLoaded",
  "geolocationEnabled={false}",
  'originWhitelist={[productionOrigin]}',
  "preferUniversalLinks: true",
  "if (pendingOauthTokenRef.current)",
]) {
  assert.ok(source.app.includes(fragment), `native app must include ${fragment}`);
}

for (const forbidden of [
  "TextInput",
  "saveAndAcknowledgeDriverJob",
  "updateDriverJobStatus",
  "nextDriverJobStatusAction",
  'title="Save & Acknowledge Job"',
  'title="OTW"',
  'title="OTS"',
  'title="POB"',
  'title="Job Completed"',
  "Linking.openURL(",
]) {
  assert.ok(
    !source.app.includes(forbidden),
    `native shell must not retain the duplicate operational lane ${forbidden}`,
  );
}

assert.doesNotMatch(
  source.contract,
  /saveAndAcknowledgeDriverJob|updateDriverJobStatus|nextDriverJobStatusAction|driver_contact|driver_name|driver_plate_number|driver_vehicle_model|\/status/,
  "native contract must retain only safe summary and native live-location transport",
);
assert.match(source.package, /"react-native-webview": "13\.16\.1"/);
assert.match(source.package, /"expo-web-browser": "~57\.0\.[0-9]+"/);

const companionConfig = JSON.parse(source.config).expo;
assert.equal(
  companionConfig.ios.infoPlist.NSCameraUsageDescription,
  "Prestige uses the camera only when you choose to attach the required OTS proof photo.",
);
assert.equal(
  companionConfig.ios.infoPlist.NSPhotoLibraryUsageDescription,
  "Prestige accesses a photo only when you choose it for the required OTS proof.",
);
assert.ok(
  companionConfig.plugins.includes("./plugins/with-driver-camera-query"),
  "Android must expose only the external camera intent needed by the OTS file input",
);
assert.match(source.cameraPlugin, /android\.media\.action\.IMAGE_CAPTURE/);
assert.doesNotMatch(source.config, /android\.permission\.CAMERA/);

const {
  embeddedDriverBridgeBootstrap,
  parseDriverBridgeMessage,
  parseDriverJobUrl,
  parseNativeCalendarOauthStartUrl,
  shouldAllowDriverWebViewNavigation,
} = await import(paths.bridge.href);

const token = "a".repeat(32);
const baseJobUrl = `https://app.prestigelimo.sg/driver-job/${token}`;
assert.equal(parseDriverJobUrl(baseJobUrl).jobUrl, baseJobUrl);
for (const calendar of ["saved", "error"]) {
  assert.equal(
    parseDriverJobUrl(`${baseJobUrl}?calendar=${calendar}`).jobUrl,
    `${baseJobUrl}?calendar=${calendar}`,
  );
}
for (const unsafeUrl of [
  `${baseJobUrl}?calendar=other`,
  `${baseJobUrl}?calendar=saved&next=https://example.com`,
  `${baseJobUrl}#secret`,
  `https://example.com/driver-job/${token}`,
  `https://user@app.prestigelimo.sg/driver-job/${token}`,
]) {
  assert.throws(() => parseDriverJobUrl(unsafeUrl));
}

assert.deepEqual(parseDriverBridgeMessage('{"type":"tracking_start"}'), {
  type: "tracking_start",
});
assert.deepEqual(parseDriverBridgeMessage('{"type":"tracking_stop"}'), {
  type: "tracking_stop",
});
assert.deepEqual(parseDriverBridgeMessage('{"type":"tracking_terminal"}'), {
  type: "tracking_terminal",
});
for (const unsafeMessage of [
  "not-json",
  '{"type":"tracking_start","token":"secret"}',
  '{"type":"tracking_stop","jobUrl":"https://example.com"}',
  '{"type":"status","status":"OTW"}',
]) {
  assert.equal(parseDriverBridgeMessage(unsafeMessage), null);
}

const state = `v1.${"b".repeat(40)}.${"c".repeat(40)}.${"d".repeat(80)}`;
const oauthStartUrl =
  `https://app.prestigelimo.sg/api/driver-google-calendar-oauth/native-start?state=${state}`;
assert.equal(parseNativeCalendarOauthStartUrl(oauthStartUrl), oauthStartUrl);
for (const unsafeOauthUrl of [
  `https://example.com/api/driver-google-calendar-oauth/native-start?state=${state}`,
  `https://app.prestigelimo.sg/api/driver-google-calendar-oauth/native-start?state=${state}&next=x`,
  "https://app.prestigelimo.sg/api/driver-google-calendar-oauth/native-start",
]) {
  assert.equal(parseNativeCalendarOauthStartUrl(unsafeOauthUrl), null);
}

assert.equal(shouldAllowDriverWebViewNavigation(baseJobUrl, baseJobUrl), true);
assert.equal(
  shouldAllowDriverWebViewNavigation(`${baseJobUrl}?calendar=saved`, baseJobUrl),
  true,
);
for (const blockedNavigation of [
  "https://accounts.google.com/o/oauth2/v2/auth",
  "https://app.prestigelimo.sg/driver-portal",
  "https://app.prestigelimo.sg/customers",
  `https://app.prestigelimo.sg/driver-job/${"e".repeat(32)}`,
]) {
  assert.equal(
    shouldAllowDriverWebViewNavigation(blockedNavigation, baseJobUrl),
    false,
  );
}
assert.match(embeddedDriverBridgeBootstrap, /__PRESTIGE_DRIVER_NATIVE_APP__/);
assert.match(
  embeddedDriverBridgeBootstrap,
  /Object\.defineProperty\(navigator, "geolocation"/,
);
assert.doesNotMatch(embeddedDriverBridgeBootstrap, /token|jobUrl|console\./i);

for (const fragment of [
  "isVerifiedEmbeddedDriverApp",
  "postEmbeddedDriverBridgeMessage",
  'type: "tracking_start"',
  'type: "tracking_stop"',
  'type: "tracking_terminal"',
  "safeDriverNativeCalendarOauthStartUrl",
]) {
  assert.ok(source.driverPage.includes(fragment), `Driver Job page must include ${fragment}`);
}
assert.match(source.driverPage, /isVerifiedEmbeddedDriverApp\(\)[\s\S]*?prepareDriverDeviceAlert/);
assert.match(source.driverPage, /isVerifiedEmbeddedDriverApp\(\)[\s\S]*?native-start/);
assert.match(source.driverPage, /isVerifiedEmbeddedDriverApp\(\)[\s\S]*?tracking_start/);
assert.match(source.driverPage, /isVerifiedEmbeddedDriverApp\(\)[\s\S]*?tracking_stop/);

assert.match(source.nativeOauthRoute, /export async function GET/);
assert.doesNotMatch(source.nativeOauthRoute, /export async function (?:POST|PATCH|DELETE)/);
assert.match(source.nativeOauthRoute, /driverGoogleCalendarOauthCookieName/);
assert.match(source.nativeOauthRoute, /readDriverGoogleCalendarNativeOauthStart/);
assert.match(
  source.nativeOauthRoute,
  /const response = new Response\(null, \{[\s\S]*?location: result\.authorization_url,[\s\S]*?status: 303,/,
);
assert.doesNotMatch(source.nativeOauthRoute, /Response\.redirect|response\.headers\.set/);
assert.doesNotMatch(source.nativeOauthRoute, /\.from\(|createClient|SUPABASE|POST|PATCH|DELETE/);
assert.match(source.calendarRoute, /google_consent_url/);

const associationModule = await import(paths.androidAssociation.href);
const associationResponse = associationModule.GET();
assert.equal(associationResponse.status, 200);
assert.deepEqual((await associationResponse.json())[0].target, {
  namespace: "android_app",
  package_name: "sg.prestigelimo.drivercompanion",
  sha256_cert_fingerprints: [
    "2C:15:46:61:3E:14:DA:3E:CB:C0:F9:0D:2A:30:6E:B7:C3:F8:13:D5:53:EF:E6:C3:7C:95:B7:C9:8F:42:24:24",
  ],
});

for (const forbidden of [
  "customer_price",
  "driver_payout",
  "paynow",
  "internal_admin_note",
  "parser_debug",
]) {
  assert.ok(
    !`${source.app}\n${source.bridge}`.toLowerCase().includes(forbidden),
    `embedded native source must not expose ${forbidden}`,
  );
}

console.log("Driver Companion complete embedded workflow guard passed");
