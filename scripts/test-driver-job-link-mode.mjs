import assert from "node:assert/strict";
import {
  isProductionDriverJobLinkMode,
  productionDriverJobLinksConfigured,
  productionDriverJobLinksDisabledResult,
  resolveDriverJobLinkMode,
} from "../lib/driver-job-link-mode.ts";
import { GET } from "../app/api/driver-job/[token]/route.ts";
import { PATCH } from "../app/api/driver-job/[token]/status/route.ts";
import {
  mockDriverJobTokens,
  resetMockDriverJobLinkDataForTests,
} from "../lib/driver-job-link-mock-store.ts";

function routeContext(token) {
  return {
    params: Promise.resolve({ token }),
  };
}

async function getDriverJob(token) {
  const response = await GET(new Request(`http://localhost/api/driver-job/${token}`), routeContext(token));

  return {
    body: await response.json(),
    status: response.status,
  };
}

async function patchDriverJobStatus(token, status) {
  const response = await PATCH(
    new Request(`http://localhost/api/driver-job/${token}/status`, {
      body: JSON.stringify({ status }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    routeContext(token),
  );

  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoSensitiveData(value) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, /SECRET_/);
  assert.doesNotMatch(text, /BOOKING_B_SECRET_/);
  assert.doesNotMatch(text, /Driver Database/);
  assert.doesNotMatch(text, /driverDatabase/);
  assert.doesNotMatch(text, /drivers/);
  assert.doesNotMatch(text, /Mock Pickup A/);
  assert.doesNotMatch(text, /Mock Dropoff A/);
  assert.doesNotMatch(text, /\b160\b/, "Disabled production response should not expose customer price.");
  assert.doesNotMatch(text, /\b95\b/, "Disabled production response should not expose driver payout.");
}

const originalDriverMode = process.env.DRIVER_JOB_LINK_MODE;
const originalPublicDriverMode = process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE;

try {
  assert.equal(resolveDriverJobLinkMode({}), "mock");
  assert.equal(resolveDriverJobLinkMode({ DRIVER_JOB_LINK_MODE: "production" }), "production");
  assert.equal(resolveDriverJobLinkMode({ NEXT_PUBLIC_DRIVER_JOB_LINK_MODE: "production" }), "production");
  assert.equal(isProductionDriverJobLinkMode({ DRIVER_JOB_LINK_MODE: "production" }), true);
  assert.equal(
    isProductionDriverJobLinkMode({ PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED: "true" }),
    true,
    "Driver job route should use production reads when production links are enabled and no explicit mock mode is set.",
  );
  assert.equal(
    isProductionDriverJobLinkMode({
      DRIVER_JOB_LINK_MODE: "mock",
      PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED: "true",
    }),
    false,
    "Explicit mock mode must still keep local demo/test routes mock-backed.",
  );
  assert.equal(
    isProductionDriverJobLinkMode({
      DRIVER_JOB_LINK_MODE: "mock",
      PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED: "true",
      VERCEL_ENV: "production",
    }),
    true,
    "Vercel production must prefer the approved production gate over stale mock env drift.",
  );
  assert.equal(
    isProductionDriverJobLinkMode({
      NEXT_PUBLIC_DRIVER_JOB_LINK_MODE: "mock",
      PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED: "true",
      VERCEL_ENV: "production",
    }),
    true,
    "Vercel production must ignore stale public mock mode when the production gate is approved.",
  );
  assert.equal(
    resolveDriverJobLinkMode({
      DRIVER_JOB_LINK_MODE: "mock",
      PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED: "true",
      VERCEL_ENV: "production",
    }),
    "production",
    "Resolved mode should be production for approved Vercel production runtime.",
  );
  assert.equal(productionDriverJobLinksConfigured(), false);
  assert.deepEqual(productionDriverJobLinksDisabledResult(), {
    ok: false,
    payload: null,
    reason: "not_configured",
  });

  process.env.DRIVER_JOB_LINK_MODE = "production";
  delete process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE;

  resetMockDriverJobLinkDataForTests();

  const disabledGet = await getDriverJob(mockDriverJobTokens.validA);
  assert.equal(disabledGet.status, 503);
  assert.equal(disabledGet.body.ok, false);
  assert.equal(disabledGet.body.reason, "not_configured");
  assert.equal(disabledGet.body.payload, null);
  assertNoSensitiveData(disabledGet);

  const disabledPatch = await patchDriverJobStatus(mockDriverJobTokens.validA, "OTW");
  assert.equal(disabledPatch.status, 503);
  assert.equal(disabledPatch.body.ok, false);
  assert.equal(disabledPatch.body.reason, "not_configured");
  assert.equal(disabledPatch.body.payload, null);
  assertNoSensitiveData(disabledPatch);

  process.env.DRIVER_JOB_LINK_MODE = "mock";

  resetMockDriverJobLinkDataForTests();

  const mockGet = await getDriverJob(mockDriverJobTokens.validA);
  assert.equal(mockGet.status, 200);
  assert.equal(mockGet.body.ok, true);
  assert.equal(mockGet.body.mode, "mock");
  assert.equal(mockGet.body.payload.reference, "MOCK-DRIVER-JOB-A");
  assert.equal(mockGet.body.payload.pickupLocation, "Mock Pickup A");

  const mockPatch = await patchDriverJobStatus(mockDriverJobTokens.validA, "POB");
  assert.equal(mockPatch.status, 200);
  assert.equal(mockPatch.body.ok, true);
  assert.equal(mockPatch.body.mode, "mock");
  assert.equal(mockPatch.body.status, "pob");
  assert.equal(mockPatch.body.payload.status, "pob");
} finally {
  if (originalDriverMode === undefined) {
    delete process.env.DRIVER_JOB_LINK_MODE;
  } else {
    process.env.DRIVER_JOB_LINK_MODE = originalDriverMode;
  }

  if (originalPublicDriverMode === undefined) {
    delete process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE;
  } else {
    process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE = originalPublicDriverMode;
  }
}

console.log("Driver job link mode tests passed.");
