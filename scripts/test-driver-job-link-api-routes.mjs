import assert from "node:assert/strict";
import { GET } from "../app/api/driver-job/[token]/route.ts";
import { PATCH } from "../app/api/driver-job/[token]/status/route.ts";
import {
  mockDriverJobTokens,
  resetMockDriverJobLinkDataForTests,
} from "../lib/driver-job-link-mock-store.ts";

process.env.DRIVER_JOB_LINK_MODE = "mock";

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

  assert.doesNotMatch(text, /SECRET_BOOKER_EMAIL/);
  assert.doesNotMatch(text, /SECRET_NESTED_BOOKER_EMAIL/);
  assert.doesNotMatch(text, /SECRET_BOOKER_NAME/);
  assert.doesNotMatch(text, /SECRET_CRM_COMPANY/);
  assert.doesNotMatch(text, /secret-crm\.example\.com/);
  assert.doesNotMatch(text, /SECRET_CUSTOMER_OVERRIDE_REASON/);
  assert.doesNotMatch(text, /SECRET_DRIVER_OVERRIDE_REASON/);
  assert.doesNotMatch(text, /SECRET_DRIVER_DATABASE_ROW/);
  assert.doesNotMatch(text, /SECRET_DRIVER_DATABASE_LIST/);
  assert.doesNotMatch(text, /BOOKING_B_SECRET_/);
  assert.doesNotMatch(text, /\b160\b/, "Response should not expose customer price.");
  assert.doesNotMatch(text, /\b95\b/, "Response should not expose driver payout.");
}

for (const [token, expectedStatus, expectedReason] of [
  ["not-a-real-token", 401, "unauthorized"],
  [mockDriverJobTokens.expired, 410, "expired"],
  [mockDriverJobTokens.revoked, 403, "revoked"],
]) {
  resetMockDriverJobLinkDataForTests();

  const result = await getDriverJob(token);

  assert.equal(result.status, expectedStatus);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, expectedReason);
  assert.equal(result.body.payload, null);
  assertNoSensitiveData(result);
}

{
  resetMockDriverJobLinkDataForTests();

  const result = await getDriverJob(mockDriverJobTokens.validA);

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.mode, "mock");
  assert.equal(result.body.payload.reference, "MOCK-DRIVER-JOB-A");
  assert.equal(result.body.payload.pickupLocation, "Mock Pickup A");
  assert.equal(result.body.payload.dropoffLocation, "Mock Dropoff A");
  assert.equal(result.body.payload.route, "Mock Pickup A > Mock Waypoint A > Mock Dropoff A");
  assert.deepEqual(result.body.payload.waypoints, ["Mock Waypoint A"]);
  assert.equal(result.body.payload.status, "assigned");
  assertNoSensitiveData(result);
}

for (const [requestedStatus, expectedStatus] of [
  ["OTW", "driver_otw"],
  ["POB", "pob"],
  ["Job Completed", "completed"],
]) {
  resetMockDriverJobLinkDataForTests();

  const patchResult = await patchDriverJobStatus(mockDriverJobTokens.validA, requestedStatus);
  const linkedResult = await getDriverJob(mockDriverJobTokens.validA);
  const unrelatedResult = await getDriverJob(mockDriverJobTokens.validB);

  assert.equal(patchResult.status, 200);
  assert.equal(patchResult.body.ok, true);
  assert.equal(patchResult.body.status, expectedStatus);
  assert.equal(patchResult.body.payload.reference, "MOCK-DRIVER-JOB-A");
  assert.equal(patchResult.body.payload.status, expectedStatus);
  assert.equal(linkedResult.body.payload.status, expectedStatus);
  assert.equal(unrelatedResult.body.payload.reference, "MOCK-DRIVER-JOB-B");
  assert.equal(unrelatedResult.body.payload.status, "assigned");
  assertNoSensitiveData(patchResult);
  assertNoSensitiveData(linkedResult);
}

{
  resetMockDriverJobLinkDataForTests();

  const result = await patchDriverJobStatus(mockDriverJobTokens.validA, "cancelled");
  const linkedResult = await getDriverJob(mockDriverJobTokens.validA);
  const unrelatedResult = await getDriverJob(mockDriverJobTokens.validB);

  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, "invalid_status");
  assert.equal(result.body.payload, null);
  assert.equal(linkedResult.body.payload.status, "assigned");
  assert.equal(unrelatedResult.body.payload.status, "assigned");
  assertNoSensitiveData(result);
}

console.log("Driver job link API route tests passed.");
