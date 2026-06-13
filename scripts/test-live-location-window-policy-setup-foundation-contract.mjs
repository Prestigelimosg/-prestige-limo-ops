import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/live-location-window-policy-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Live-location window policy helper must stay server-only.");
assert.equal(/navigator\.geolocation|getCurrentPosition|watchPosition/i.test(source), false, "Policy helper must not activate GPS capture.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Policy helper must not use network APIs.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/i.test(source), false, "Policy helper must not read env/provider secrets.");
assert.equal(/createClient|supabase|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i.test(source), false, "Policy helper must not use database writes.");
assert.equal(/localStorage|sessionStorage|indexedDB|storageBucket|storage\.from/i.test(source), false, "Policy helper must not activate browser or object storage.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Policy helper must not define API behavior.");
assert.equal(
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram|stripe|mapbox-gl|@googlemaps\/google-maps-services-js)["']|require\(\s*["'](?:nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram|stripe|mapbox-gl|@googlemaps\/google-maps-services-js)["']\s*\)|\b(?:Mailgun|Postmark|Resend|SendGrid|Stripe|TelegramBot|Twilio|Vonage)\b/.test(
    source,
  ),
  false,
  "Policy helper must not reference provider, map, notification, or payment SDKs.",
);
assert.equal(/sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|client\.messages|publish\s*\(/i.test(source), false, "Policy helper must not include send operations.");

for (const fragment of [
  "liveLocationWindowPolicySetupFoundationVersion",
  "buildLiveLocationWindowPolicySetup",
  "live_location_window_policy_setup_only",
  "customer_visible_window_minutes_before_pickup: 30",
  "auto_stop_minutes_after_pob: 5",
  "admin_live_map_planned: true",
  "customer_live_map_link_planned: true",
  "gpsCaptureEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "locationStorageEnabled: false",
  "liveAccessEnabled: false",
]) {
  assert.ok(source.includes(fragment), `Missing live-location window policy setup fragment: ${fragment}`);
}

function transpileTypescript(tsSource, filename) {
  return ts.transpileModule(tsSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-live-location-window-policy-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, helperPath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(outputPath),
  };
}

function assertPolicyDisabled(value, label) {
  assert.equal(value.gpsCaptureEnabled, false, `${label} must keep gpsCaptureEnabled false.`);
  assert.equal(value.liveMapEnabled, false, `${label} must keep liveMapEnabled false.`);
  assert.equal(value.customerVisible, false, `${label} must keep customerVisible false.`);
  assert.equal(value.locationStorageEnabled, false, `${label} must keep locationStorageEnabled false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
}

const harness = await loadHelper();

try {
  const { buildLiveLocationWindowPolicySetup } = harness.helper;
  const policy = buildLiveLocationWindowPolicySetup({
    booking_reference: "PLO-LIVE-001",
    pickup_at: "2026-06-13T10:00:00+08:00",
    pob_at: "2026-06-13T10:45:00+08:00",
  });

  assert.deepEqual(policy, {
    admin_live_map_planned: true,
    auto_stop_minutes_after_pob: 5,
    booking_reference: "PLO-LIVE-001",
    customer_live_map_link_planned: true,
    customer_visible_window_minutes_before_pickup: 30,
    customerVisible: false,
    gpsCaptureEnabled: false,
    liveAccessEnabled: false,
    liveMapEnabled: false,
    locationStorageEnabled: false,
    policyReady: true,
    policy_surface: "live_location_window_policy_setup_only",
    planned_windows: {
      admin_live_map: "planned_only",
      auto_stop_after_pob_minutes: 5,
      customer_live_map_link: "planned_only",
      customer_window_before_pickup_minutes: 30,
    },
    status: "setup_only",
    version: "live-location-window-policy-setup-foundation-v1",
  });
  assertPolicyDisabled(policy, "ready policy");

  const fallback = buildLiveLocationWindowPolicySetup();
  assert.equal(fallback.booking_reference, null);
  assertPolicyDisabled(fallback, "fallback policy");
} finally {
  await harness.cleanup();
}

console.log("live-location window policy setup foundation contract passed");
