import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GET } from "../app/api/driver-job/[token]/route.ts";
import { PATCH } from "../app/api/driver-job/[token]/status/route.ts";
import {
  productionDriverJobLinksConfigured,
  productionDriverJobLinksDisabledResult,
  resolveDriverJobLinkMode,
} from "../lib/driver-job-link-mode.ts";
import {
  mockDriverJobTokens,
  resetMockDriverJobLinkDataForTests,
} from "../lib/driver-job-link-mock-store.ts";

const checklistPath = new URL("../docs/driver-job-link-production-checklist.md", import.meta.url);
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

function assertDisabledProductionResponse(result) {
  const text = JSON.stringify(result);

  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, "not_configured");
  assert.equal(result.body.payload, null);
  assert.doesNotMatch(text, /Mock Pickup A/);
  assert.doesNotMatch(text, /Mock Dropoff A/);
  assert.doesNotMatch(text, /Driver Database/);
  assert.doesNotMatch(text, /driverDatabase/);
  assert.doesNotMatch(text, /SECRET_/);
  assert.doesNotMatch(text, /\b160\b/, "Disabled production response should not expose customer price.");
  assert.doesNotMatch(text, /\b95\b/, "Disabled production response should not expose driver payout.");
}

function assertChecklistPhrase(checklistText, phrase) {
  assert.equal(
    checklistText.toLowerCase().includes(phrase.toLowerCase()),
    true,
    `Expected production checklist to contain phrase: ${phrase}`,
  );
}

try {
  const checklistText = await readFile(checklistPath, "utf8");

  assertChecklistPhrase(checklistText, "No `supabase db reset` is allowed");
  assertChecklistPhrase(checklistText, "explicit migration approval");
  assertChecklistPhrase(checklistText, "No Driver Database exposure");
  assertChecklistPhrase(checklistText, "No pricing/payout/CRM exposure");
  assertChecklistPhrase(checklistText, "Invalid/expired/revoked tokens blocked");
  assertChecklistPhrase(checklistText, "Mobile tests required");

  assert.equal(resolveDriverJobLinkMode({}), "mock");
  assert.equal(productionDriverJobLinksConfigured(), false);
  assert.deepEqual(productionDriverJobLinksDisabledResult(), {
    ok: false,
    payload: null,
    reason: "not_configured",
  });

  process.env.DRIVER_JOB_LINK_MODE = "production";
  delete process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE;

  resetMockDriverJobLinkDataForTests();

  assert.equal(resolveDriverJobLinkMode(), "production");
  assertDisabledProductionResponse(await getDriverJob(mockDriverJobTokens.validA));
  assertDisabledProductionResponse(await patchDriverJobStatus(mockDriverJobTokens.validA, "OTW"));

  process.env.DRIVER_JOB_LINK_MODE = "mock";

  resetMockDriverJobLinkDataForTests();

  const mockGet = await getDriverJob(mockDriverJobTokens.validA);
  assert.equal(mockGet.status, 200);
  assert.equal(mockGet.body.ok, true);
  assert.equal(mockGet.body.mode, "mock");
  assert.equal(mockGet.body.payload.reference, "MOCK-DRIVER-JOB-A");
  assert.equal(mockGet.body.payload.pickupLocation, "Mock Pickup A");
  assert.equal(mockGet.body.payload.dropoffLocation, "Mock Dropoff A");

  const mockPatch = await patchDriverJobStatus(mockDriverJobTokens.validA, "POB");
  assert.equal(mockPatch.status, 200);
  assert.equal(mockPatch.body.ok, true);
  assert.equal(mockPatch.body.mode, "mock");
  assert.equal(mockPatch.body.status, "pob");
  assert.equal(mockPatch.body.payload.reference, "MOCK-DRIVER-JOB-A");
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

console.log("Driver job link production guard tests passed.");
