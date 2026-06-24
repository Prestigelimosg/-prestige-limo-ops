import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const approvalEnvName =
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_RUNTIME_EVIDENCE_APPROVED";
const phaseEnvName =
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_RUNTIME_EVIDENCE_PHASE";
const expectedApproval =
  "driver-live-location-share-stop-runtime-evidence-approved";
const allowedPhases = new Set(["mock-unit"]);

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must not match ${pattern}.`);
}

function safeBlocked(reason) {
  console.log(
    JSON.stringify({
      db_write: false,
      default_closed: true,
      evidence_run: false,
      ok: false,
      provider_send: false,
      real_gps: false,
      reason,
      secrets_printed: false,
    }),
  );
  process.exit(1);
}

if (process.env[approvalEnvName] !== expectedApproval) {
  safeBlocked("missing_share_stop_runtime_evidence_approval");
}

const phase = process.env[phaseEnvName] || "";

if (!allowedPhases.has(phase)) {
  safeBlocked("missing_share_stop_runtime_evidence_phase");
}

const [driverJobPage, driverLiveLocationRoute, runtimeHelper] = await Promise.all([
  readFile("app/driver-job/[token]/page.tsx", "utf8"),
  readFile("app/api/driver-job/[token]/live-location/route.ts", "utf8"),
  readFile("lib/driver-live-location-runtime.ts", "utf8"),
]);
const liveLocationTypeStart = driverJobPage.indexOf("type DriverLiveLocationApiResponse");
const liveLocationSafetyStart = driverJobPage.indexOf("function driverLiveLocationRoute");
const liveLocationFunctionEnd = driverJobPage.indexOf("async function updateStatus");
assert.notEqual(liveLocationTypeStart, -1, "driver page live-location types must exist.");
assert.notEqual(liveLocationSafetyStart, -1, "driver page live-location route helper must exist.");
assert.notEqual(liveLocationFunctionEnd, -1, "driver page updateStatus boundary must exist.");
const driverPageLiveLocationSafetySource = driverJobPage.slice(
  liveLocationSafetyStart,
  liveLocationFunctionEnd,
);
const requiredFragmentSource = `${driverJobPage}\n${driverLiveLocationRoute}\n${runtimeHelper}`;
const safetySource = `${driverPageLiveLocationSafetySource}\n${driverLiveLocationRoute}\n${runtimeHelper}`;
const sourceWithoutDenylist = safetySource.replace(
  /function hasForbiddenSafeText[\s\S]*?\n}\n\nfunction asRecord/,
  "function asRecord",
);

for (const fragment of [
  "NEXT_PUBLIC_PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_UI_ENABLED",
  "NEXT_PUBLIC_PRESTIGE_DRIVER_LIVE_LOCATION_BROWSER_GPS_ENABLED",
  "driverLiveLocationShareStopRuntimeUiEnabled",
  "driverLiveLocationBrowserGpsEnabled",
  "requestDriverLiveLocationPosition",
  "shareDriverLiveLocation",
  "stopDriverLiveLocation",
  "navigator.geolocation.getCurrentPosition",
  "onClick={shareDriverLiveLocation}",
  "onClick={stopDriverLiveLocation}",
  "customerVisible !== false",
  "external_send !== false",
  "handleDriverLiveLocationRuntimeRequest",
]) {
  assertIncludes(requiredFragmentSource, fragment, `share/stop runtime source ${fragment}`);
}

for (const pattern of [
  /watchPosition|clearWatch|sendBeacon|localStorage|sessionStorage/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /google\.maps|maps\.google|maps\.googleapis\.com|OneMap|ONEMAP|FlightAware|AeroAPI/i,
]) {
  assertExcludes(safetySource, pattern, "driver live-location share/stop runtime wiring");
}

assertExcludes(
  sourceWithoutDenylist,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  "driver live-location share/stop runtime wiring without safety denylist",
);

assertExcludes(
  driverJobPage,
  /useEffect\s*\([\s\S]{0,500}shareDriverLiveLocation|void\s+shareDriverLiveLocation\(|updateStatus[\s\S]{0,800}shareDriverLiveLocation/i,
  "driver page auto-start sharing",
);

console.log(
  JSON.stringify({
    customer_live_map: false,
    db_write: false,
    default_closed: true,
    evidence_run: "mock-unit",
    ok: true,
    phase,
    provider_send: false,
    real_gps: false,
    result: "driver_live_location_share_stop_runtime_mock_evidence_ready",
    secrets_printed: false,
  }),
);
