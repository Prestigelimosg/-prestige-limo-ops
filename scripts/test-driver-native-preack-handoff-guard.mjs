import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

function read(path) {
  return fs.readFileSync(new URL(path, import.meta.url), "utf8");
}

const adminPersistence = read("../lib/admin-driver-job-link-persistence.ts");
const adminPage = read("../app/page.tsx");
const devicePush = read("../lib/driver-device-push-notification.ts");
const handoff = read("../lib/driver-native-job-handoff.ts");
const resolver = read("../app/api/driver-native-job-open/[jobKey]/route.ts");
const nativeApp = read("../driver-companion/App.tsx");
const nativeStorage = read("../driver-companion/src/native-notifications.ts");

for (const fragment of [
  "sealDriverNativeJobHandoffToken",
  "openDriverNativeJobHandoff",
  "native_handoff_ciphertext",
  "PRESTIGE_DRIVER_PORTAL_SESSION_SECRET",
  "createCipheriv",
  "createDecipheriv",
]) {
  assert.match(handoff + adminPersistence, new RegExp(fragment), `missing secure native handoff ${fragment}`);
}

assert.doesNotMatch(
  devicePush,
  /payload\.target_path\s*\?\s*loaded\.subscriptions\.filter\(\(subscription\)\s*=>\s*subscription\.channel\s*===\s*"web"\)/,
  "new-link native delivery must not remain silently filtered to web only",
);
assert.match(devicePush, /native_ios/);
assert.match(devicePush, /provider_accepted/);
assert.match(devicePush, /driverHasActiveOnePhoneAccount/);
assert.match(devicePush, /nativeSubscriptionCount === 1/);

for (const fragment of [
  "resolveDriverPortalSession",
  "verifyDriverAccountSession",
  "x-prestige-driver-installation-id",
  "driver_id",
  "booking_reference",
  "link_status",
  "revoked_at",
  "created_at",
  "opaqueDriverJobLinkKey",
  "openDriverNativeJobHandoff",
  "new Response\\(null",
  "Location: destination\\.toString\\(\\)",
  "status: 302",
  '"Cache-Control": "no-store"',
]) {
  assert.match(resolver, new RegExp(fragment), `native resolver must preserve ${fragment}`);
}

assert.doesNotMatch(
  resolver,
  /Response\.redirect|response\.headers\.set/,
  "native resolver must construct its redirect and privacy headers atomically",
);

const redirectCanaryDestination = new URL(
  "https://app.prestigelimo.sg/driver-job/redacted-canary-token",
);
const redirectCanary = new Response(null, {
  headers: {
    "Cache-Control": "no-store",
    Location: redirectCanaryDestination.toString(),
    "Referrer-Policy": "no-referrer",
    Vary: "Cookie, x-prestige-driver-installation-id",
  },
  status: 302,
});
assert.equal(redirectCanary.status, 302);
assert.equal(redirectCanary.headers.get("location"), redirectCanaryDestination.toString());
assert.equal(redirectCanary.headers.get("cache-control"), "no-store");
assert.equal(redirectCanary.headers.get("referrer-policy"), "no-referrer");
assert.equal(
  redirectCanary.headers.get("vary"),
  "Cookie, x-prestige-driver-installation-id",
);
assert.equal(await redirectCanary.text(), "");

for (const forbidden of [
  "customer_price",
  "billing",
  "invoice",
  "payment",
  "payout",
  "paynow",
]) {
  assert.doesNotMatch(resolver.toLowerCase(), new RegExp(forbidden), `native resolver must exclude ${forbidden}`);
}

assert.match(nativeStorage, /nativeDriverJobHandoffUrl/);
assert.match(nativeApp, /nativeDriverJobHandoffUrl/);
assert.match(nativeApp, /x-prestige-driver-installation-id/);
assert.match(nativeApp, /loadNativeDriverJob/);
assert.match(nativeApp, /if \(!installationId\) \{\s*return;/);
assert.match(adminPage, /provider; delivery to the phone is not guaranteed/i);

for (const sourceText of [nativeApp, nativeStorage]) {
  assert.doesNotMatch(
    sourceText,
    /driver_job_token|target_path.*native|private.*token.*notification/i,
    "native notification source must not carry the private Driver Job token/path",
  );
}

// Execute the native job-opening branch with no saved private link, as on a missed push.
const openBranchStart = nativeApp.indexOf('        if (request.type === "native_job_open") {', nativeApp.indexOf('      bridgeBusyRef.current = true;'));
const openBranchEnd = nativeApp.indexOf('        if (request.type === "native_biometrics_enable")', openBranchStart);
assert.ok(openBranchStart > 0 && openBranchEnd > openBranchStart);
const executeOpen = new Function("deps", `return (async()=>{const {request,loadNativeDriverJob,readTrackingState,readDriverAccountSetup,installationId,sendNativeJobOpenResult,dismissNativeJobNotifications,Notifications,nativeDriverJobHandoffUrl,currentWebViewUrlRef,webViewRequestHeadersRef,setCanGoBack,setScreen,receiveDriverJobUrl}=deps;${nativeApp.slice(openBranchStart,openBranchEnd)}})()`);
const nativeCalls = [];
const deps = {
  request:{type:"native_job_open",jobKey:"a".repeat(64)},
  loadNativeDriverJob:async()=>null, readTrackingState:async()=>({active:false}), readDriverAccountSetup:async()=>null, installationId:"test-installation",
  sendNativeJobOpenResult:value=>nativeCalls.push(["result",value]),
  dismissNativeJobNotifications:async key=>{nativeCalls.push(["dismiss",key]);return 2;},
  Notifications:{}, nativeDriverJobHandoffUrl:key=>`https://app.prestigelimo.sg/api/driver-native-job-open/${key}`,
  currentWebViewUrlRef:{current:"https://app.prestigelimo.sg/driver-portal"},webViewRequestHeadersRef:{current:null},
  setCanGoBack:()=>{},setScreen:updater=>nativeCalls.push(["screen",updater({navigationKey:3,active:false})]),
  receiveDriverJobUrl:async(...args)=>nativeCalls.push(["stored",...args]),
};
await executeOpen(deps);
assert.equal(deps.webViewRequestHeadersRef.current["x-prestige-driver-purpose"],"driver-native-job-open");
assert.equal(deps.webViewRequestHeadersRef.current["x-prestige-driver-installation-id"],"test-installation");
assert.equal(deps.webViewRequestHeadersRef.current["x-prestige-driver-badge-count"],"2");
assert.equal(nativeCalls.find(row=>row[0]==="screen")[1].jobUrl,`https://app.prestigelimo.sg/api/driver-native-job-open/${"a".repeat(64)}`);
assert.equal(nativeCalls.some(row=>row[0]==="stored"),false);
nativeCalls.length=0;
await executeOpen({...deps,installationId:""});
assert.deepEqual(nativeCalls,[["result",{jobKey:"a".repeat(64),ok:false}]],"Missing installation must not navigate.");
nativeCalls.length=0;
await executeOpen({...deps,loadNativeDriverJob:async()=>({jobUrl:"existing-private-job"})});
assert.deepEqual(nativeCalls,[["stored","existing-private-job"]],"Existing acknowledged shortcuts remain unchanged.");
nativeCalls.length=0;
await executeOpen({...deps,readTrackingState:async()=>({active:true,job:{jobUrl:"active-trip"}})});
assert.equal(nativeCalls[0][0],"stored");
assert.equal(nativeCalls[0][1],"active-trip");
assert.equal(nativeCalls.some(row=>row[0]==="dismiss"),false,"Pending open cannot consume alerts or leave an active trip.");
nativeCalls.length=0;
await executeOpen({...deps,readDriverAccountSetup:async()=>({jobUrl:"setup-job"})});
assert.deepEqual(nativeCalls,[["stored","setup-job"]],"Unfinished setup keeps its original job.");
const portalRead = read("../app/api/driver-portal/jobs/route.ts");
assert.match(portalRead,/includePendingAcknowledgement: Boolean\(session.claims.accountId && session.claims.deviceIdHash &&[\s\S]*?x-prestige-driver-installation-id[\s\S]*?x-prestige-driver-pending-jobs/);
const bridge = read("../driver-companion/src/driver-webview-bridge.ts");
assert.match(bridge,/__PRESTIGE_DRIVER_PENDING_JOB_OPEN_SUPPORTED__/);

const nativeSenderStart = devicePush.indexOf("async function sendNativePush(");
const nativeSenderEnd = devicePush.indexOf("function providerStatusCode", nativeSenderStart);
assert.notEqual(nativeSenderStart, -1);
assert.notEqual(nativeSenderEnd, -1);
assert.doesNotMatch(
  devicePush.slice(nativeSenderStart, nativeSenderEnd),
  /target_path|driver_job_token|driver-job\//,
  "Expo/APNs sender must carry only the opaque job key and safe visible copy",
);

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-native-preack-handoff-"));
try {
  const helperPath = path.join(tempDir, "driver-native-job-handoff.cjs");
  const compiled = ts.transpileModule(
    handoff.replace('import "server-only";', ""),
    {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  await writeFile(helperPath, compiled);
  const helper = createRequire(import.meta.url)(helperPath);
  const env = {
    PRESTIGE_DRIVER_PORTAL_SESSION_SECRET:
      "native-preack-focused-guard-secret-value-123456789",
  };
  const bookingReference = "NATIVE-PREACK-GUARD-001";
  const token = "NativePreackPrivateToken_1234567890";
  const tokenHash = "a".repeat(64);
  const ciphertext = helper.sealDriverNativeJobHandoffToken(
    { bookingReference, token, tokenHash },
    env,
  );
  assert.match(ciphertext, /^driver-native-job-handoff-v1\./);
  assert.equal(ciphertext.includes(token), false);
  assert.equal(
    helper.openDriverNativeJobHandoff(
      { bookingReference, ciphertext, tokenHash },
      env,
    ),
    token,
  );
  assert.equal(
    helper.openDriverNativeJobHandoff(
      { bookingReference: "WRONG", ciphertext, tokenHash },
      env,
    ),
    null,
  );
  assert.equal(
    helper.openDriverNativeJobHandoff(
      { bookingReference, ciphertext, tokenHash: "b".repeat(64) },
      env,
    ),
    null,
  );
  assert.equal(
    helper.sealDriverNativeJobHandoffToken(
      { bookingReference, token, tokenHash },
      {},
    ),
    null,
  );
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

// Execute the real Admin click handler: saving a link must not turn an
// unconfirmed phone alert into a green success notification.
const createLinkSource = adminPage.slice(
  adminPage.indexOf("  async function createDriverJobLink()"),
  adminPage.indexOf("  async function copyDriverJobLink()"),
);
assert.ok(createLinkSource.length > 0);
const createLinkJs = ts.transpileModule(createLinkSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
for (const reason of ["provider_accepted", "provider_failed", "not_available", "recent_attempt", "missing"]) {
  for (const disposition of ["created", "reused", "amended"]) {
    let state = {};
    let requests = 0;
    const dependencies = {
      buildAdminDriverJobLinkCreatePayload: () => ({ ok: true, data: { booking_reference: "TEST" } }),
      setDriverJobLinkCopyMessage: () => {},
      setAdminDriverJobLinkState: (next) => { state = typeof next === "function" ? next(state) : next; },
      dispatchPublicBookingReference: "TEST",
      driverJobLinkCreateAttemptRef: { current: null },
      crypto: { randomUUID: () => "synthetic-request" },
      adminDriverJobLinksApiPath: "/api/admin-driver-job-links",
      adminLegacyDataPurpose: "admin-booking-persistence",
      fetch: async (url, options) => {
        requests++;
        assert.equal(url, "/api/admin-driver-job-links");
        assert.equal(options.method, "POST");
        return { ok: true, json: async () => ({
          ok: true, disposition,
          link: { booking_reference: "TEST", safe_summary: { acknowledged: false } },
          driver_job_url: "https://example.invalid/driver-job/synthetic",
          ...(reason === "missing" ? {} : { native_app_alert: { reason, provider_accepted: reason === "provider_accepted" } }),
        }) };
      },
      clean: (value) => String(value || "").trim(),
      cleanReferenceText: (value) => String(value || "").trim(),
      setAdminActiveJobsMapReadState: () => {},
      setDashboardDriverJobLinksReadState: () => {},
      adminDriverJobLinkFailureMessage: (error) => { throw error; },
    };
    const createLink = new Function(...Object.keys(dependencies), `${createLinkJs}; return createDriverJobLink;`)(...Object.values(dependencies));
    await createLink();
    assert.equal(requests, 1, "Feedback must not automatically resend or recreate the link");
    assert.equal(state.oneTimeUrl, "https://example.invalid/driver-job/synthetic", "The created link remains available for manual sharing");
    assert.equal(state.message.tone, reason === "provider_accepted" ? "success" : reason === "recent_attempt" ? "info" : "error",
      `${disposition}/${reason}: link creation alone must not imply phone-alert success`);
  }
}

console.log("Driver native pre-ACK handoff and Admin alert feedback guards passed");
