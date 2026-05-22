import assert from "node:assert/strict";
import { GET } from "../app/api/driver-job/[token]/route.ts";
import { PATCH } from "../app/api/driver-job/[token]/status/route.ts";
import {
  applyProductionDriverJobStatusUpdate,
  getProductionDriverJobPayloadForToken,
} from "../lib/driver-job-link-production.ts";
import {
  mockDriverJobTokens,
  resetMockDriverJobLinkDataForTests,
} from "../lib/driver-job-link-mock-store.ts";

const originalDriverMode = process.env.DRIVER_JOB_LINK_MODE;
const originalPublicDriverMode = process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE;

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

function assertDisabledResult(result) {
  const text = JSON.stringify(result);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "not_configured");
  assert.equal(result.payload, null);
  assert.doesNotMatch(text, /Driver Database/i);
  assert.doesNotMatch(text, /driverDatabase/);
  assert.doesNotMatch(text, /drivers/);
  assert.doesNotMatch(text, /pricing/i);
  assert.doesNotMatch(text, /payout/i);
  assert.doesNotMatch(text, /crm/i);
  assert.doesNotMatch(text, /booker email/i);
  assert.doesNotMatch(text, /SECRET_/);
  assert.doesNotMatch(text, /BOOKING_B_SECRET_/);
  assert.doesNotMatch(text, /Mock Pickup A/);
  assert.doesNotMatch(text, /Mock Dropoff A/);
  assert.doesNotMatch(text, /\b160\b/, "Disabled production result should not expose customer price.");
  assert.doesNotMatch(text, /\b95\b/, "Disabled production result should not expose driver payout.");
}

function assertDisabledRouteResponse(result) {
  assert.equal(result.status, 503);
  assertDisabledResult(result.body);
}

try {
  assertDisabledResult(await getProductionDriverJobPayloadForToken(mockDriverJobTokens.validA));
  assertDisabledResult(
    await applyProductionDriverJobStatusUpdate({
      status: "OTW",
      token: mockDriverJobTokens.validA,
    }),
  );

  process.env.DRIVER_JOB_LINK_MODE = "production";
  delete process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE;

  resetMockDriverJobLinkDataForTests();

  assertDisabledRouteResponse(await getDriverJob(mockDriverJobTokens.validA));
  assertDisabledRouteResponse(await patchDriverJobStatus(mockDriverJobTokens.validA, "POB"));

  process.env.DRIVER_JOB_LINK_MODE = "mock";

  resetMockDriverJobLinkDataForTests();

  const mockGet = await getDriverJob(mockDriverJobTokens.validA);
  assert.equal(mockGet.status, 200);
  assert.equal(mockGet.body.ok, true);
  assert.equal(mockGet.body.mode, "mock");
  assert.equal(mockGet.body.payload.reference, "MOCK-DRIVER-JOB-A");
  assert.equal(mockGet.body.payload.pickupLocation, "Mock Pickup A");

  const mockPatch = await patchDriverJobStatus(mockDriverJobTokens.validA, "Job Completed");
  assert.equal(mockPatch.status, 200);
  assert.equal(mockPatch.body.ok, true);
  assert.equal(mockPatch.body.mode, "mock");
  assert.equal(mockPatch.body.status, "completed");
  assert.equal(mockPatch.body.payload.reference, "MOCK-DRIVER-JOB-A");
  assert.equal(mockPatch.body.payload.status, "completed");
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

console.log("Driver job link production adapter tests passed.");
