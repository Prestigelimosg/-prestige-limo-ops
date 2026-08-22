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
  "Response.redirect",
  '"Cache-Control": "no-store"',
]) {
  assert.match(resolver, new RegExp(fragment), `native resolver must preserve ${fragment}`);
}

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

console.log("Driver native pre-ACK handoff guard passed");
