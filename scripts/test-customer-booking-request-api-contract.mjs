import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/customer-booking-requests/route.ts";
const pagePath = "app/book/page.tsx";
const bookingPersistencePath = "lib/admin-booking-persistence.ts";
const requestAdapterPath = "lib/customer-booking-request-adapter.ts";
const supabaseAdapterPath = "lib/admin-booking-supabase-adapter.ts";
const smokePath = "scripts/test-app-smoke-browser.mjs";
const unsafeCustomerRequestLeakPattern =
  /admin_internal_status|short_notice_review_status|internal_admin_note|internal_finance_note|driver_payout|paynow|pay_now|invoice|payment|billing|finance|parser_debug|raw_ai|mock_archive|mock_qa|dev_workbench|session_token|service_role|secret|sql|stack/i;

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function loadRouteHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-booking-request-api-"));
  const sourcePath = path.join(process.cwd(), routePath);
  const outputPath = path.join(tempDir, routePath.replace(/\.ts$/, ".js"));
  const routeSource = await readFile(sourcePath, "utf8");
  const persistencePath = path.join(tempDir, "lib/admin-booking-persistence.js");
  const adapterPath = path.join(tempDir, "lib/admin-booking-supabase-adapter.js");
  const emailAlertPath = path.join(tempDir, "lib/admin-new-booking-email-alert.js");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(persistencePath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(routeSource, sourcePath));
  await writeFile(
    persistencePath,
    [
      "function mock() { return globalThis.__prestigeCustomerBookingRequestApiMock; }",
      "async function createAdminBooking(data, actor, audit) {",
      "  const state = mock();",
      "  state.createCalls.push({ actor, audit, data });",
      "  return state.createResult;",
      "}",
      "function parseCustomerBookingRequestPayload(payload) {",
      "  const state = mock();",
      "  state.parseCalls.push(payload);",
      "  return state.parseResult;",
      "}",
      "module.exports = { createAdminBooking, parseCustomerBookingRequestPayload };",
    ].join("\n"),
  );
  await writeFile(
    adapterPath,
    [
      "module.exports = {",
      "  customerBookingRequestPersistenceAdapterActor: {",
      "    actor_label: 'Customer booking request',",
      "    actor_role: 'system',",
      "    boundary_mode: 'customer-booking-request-surface',",
      "    source_surface: 'customer_booking_request',",
      "  },",
      "};",
    ].join("\n"),
  );
  await writeFile(
    emailAlertPath,
    [
      "function mock() { return globalThis.__prestigeCustomerBookingRequestApiMock; }",
      "async function sendAdminNewBookingEmailAlert(booking) {",
      "  const state = mock();",
      "  state.alertCalls.push(booking);",
      "  if (state.alertThrows) {",
      "    throw new Error('mock alert failure');",
      "  }",
      "  return { ok: false, reason: 'alert_gate_closed', status: 'blocked' };",
      "}",
      "module.exports = { sendAdminNewBookingEmailAlert };",
    ].join("\n"),
  );

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(outputPath),
  };
}

function installMock(overrides = {}) {
  const state = {
    alertCalls: [],
    alertThrows: false,
    createCalls: [],
    createResult: {
      data: {
        admin_internal_status: "Admin Review Required",
        booking_reference: "CUST-SAFE-001",
        customer_facing_status: "Request Received",
        short_notice_review_status: "Admin Review Required",
      },
      ok: true,
    },
    parseCalls: [],
    parseResult: {
      data: {
        booking: {
          booking_reference: "CUST-SAFE-001",
        },
      },
      ok: true,
    },
    ...overrides,
  };

  globalThis.__prestigeCustomerBookingRequestApiMock = state;

  return state;
}

function validHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    origin: "http://localhost",
    referer: "http://localhost/book",
    "x-prestige-customer-purpose": "customer-booking-request",
    ...extra,
  };
}

function postRequest(body, headers = validHeaders()) {
  return new Request("http://localhost/api/customer-booking-requests", {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

async function readJson(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertSafeCustomerBody(value, label) {
  assert.equal(
    unsafeCustomerRequestLeakPattern.test(JSON.stringify(value)),
    false,
    `${label}: customer booking request response leaked internal/admin/finance/payout/parser/token text.`,
  );
}

const [routeSource, pageSource, bookingPersistenceSource, requestAdapterSource, supabaseAdapterSource, smokeSource] =
  await Promise.all(
    [routePath, pagePath, bookingPersistencePath, requestAdapterPath, supabaseAdapterPath, smokePath].map(
      (relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8"),
    ),
  );
const requestAdapterAllowedResponseFields =
  requestAdapterSource.match(/const allowedApiRequestFields = new Set\(\[[\s\S]+?\]\);/)?.[0] || "";

assert.equal(
  /admin_internal_status\s*:|short_notice_review_status\s*:/.test(routeSource.match(/return Response\.json\(\{[\s\S]+?\n    \}\);/)?.[0] || ""),
  false,
  "Customer booking request API response must not include internal admin status fields.",
);
assert.equal(
  pageSource.includes("submitCustomerBookingRequest") &&
    requestAdapterAllowedResponseFields.includes("short_notice_review_required") &&
    !pageSource.includes("short_notice_review_status") &&
    !pageSource.includes("admin_internal_status") &&
    !requestAdapterAllowedResponseFields.includes("short_notice_review_status") &&
    !requestAdapterAllowedResponseFields.includes("admin_internal_status"),
  true,
  "/book should consume only customer-safe booking request response fields.",
);
assert.equal(
  smokeSource.includes("short_notice_review_required") &&
    !/request:\s*\{[\s\S]+?admin_internal_status|request:\s*\{[\s\S]+?short_notice_review_status/.test(smokeSource),
  true,
  "Browser smoke mock should use customer-safe booking request response fields.",
);
assert.equal(
  supabaseAdapterSource.includes("isVerifiedCustomerBookingRequestActor") &&
    supabaseAdapterSource.includes('actor?.actor_label === "Customer booking request"') &&
    supabaseAdapterSource.includes('actor.actor_role === "system"') &&
    supabaseAdapterSource.includes('actor.boundary_mode === "customer-booking-request-surface"') &&
    supabaseAdapterSource.includes('actor.source_surface === "customer_booking_request"') &&
    supabaseAdapterSource.includes("!isVerifiedAdminDispatcherActor(actor)") &&
    supabaseAdapterSource.includes("!isVerifiedCustomerBookingRequestActor(actor)"),
  true,
  "Customer booking request persistence must allow only the exact /book request actor in addition to admin/dispatcher actors.",
);
assert.equal(
  supabaseAdapterSource.includes("checkCustomerBookingRequestPersistenceConfigReadiness") &&
    supabaseAdapterSource.includes("? checkCustomerBookingRequestPersistenceConfigReadiness()") &&
    supabaseAdapterSource.includes(": checkAdminBookingPersistenceStagingConfigReadiness()"),
  true,
  "Customer booking request persistence must use a customer-specific DB readiness path instead of admin dispatcher readiness.",
);
assert.equal(
  bookingPersistenceSource.includes("passenger_name: passengerName"),
  true,
  "Customer booking request persistence must map passengerName into the safe passenger_name booking field.",
);

const harness = await loadRouteHarness();

try {
  installMock();
  const success = await readJson(
    await harness.route.POST(
      postRequest({
        passengerName: "Safe Passenger",
      }),
    ),
  );

  assert.equal(success.status, 200);
  assert.deepEqual(success.body, {
    ok: true,
    request: {
      booking_reference: "CUST-SAFE-001",
      customer_facing_status: "Request Received",
      short_notice_review_required: true,
    },
  });
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.alertCalls.length, 1);
  assert.equal(
    globalThis.__prestigeCustomerBookingRequestApiMock.alertCalls[0].booking_reference,
    "CUST-SAFE-001",
  );
  assertSafeCustomerBody(success.body, "short-notice success body");

  installMock({
    alertThrows: true,
    createResult: {
      data: {
        admin_internal_status: "Admin Review Required",
        booking_reference: "CUST-SAFE-ALERT-FAIL",
        customer_facing_status: "Request Received",
        short_notice_review_status: "Admin Review Required",
      },
      ok: true,
    },
  });
  const alertFailureStillSucceeds = await readJson(
    await harness.route.POST(postRequest({ passengerName: "Safe Passenger" })),
  );

  assert.equal(alertFailureStillSucceeds.status, 200);
  assert.deepEqual(alertFailureStillSucceeds.body, {
    ok: true,
    request: {
      booking_reference: "CUST-SAFE-ALERT-FAIL",
      customer_facing_status: "Request Received",
      short_notice_review_required: true,
    },
  });
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.alertCalls.length, 1);
  assertSafeCustomerBody(alertFailureStillSucceeds.body, "alert-failure success body");

  installMock({
    createResult: {
      data: {
        admin_internal_status: "Draft",
        booking_reference: "CUST-SAFE-002",
        customer_facing_status: "Request Received",
        short_notice_review_status: "Not Required",
      },
      ok: true,
    },
  });
  const nonShortNotice = await readJson(await harness.route.POST(postRequest({ passengerName: "Safe Passenger" })));

  assert.equal(nonShortNotice.status, 200);
  assert.equal(nonShortNotice.body.request.short_notice_review_required, false);
  assertSafeCustomerBody(nonShortNotice.body, "non-short-notice success body");

  const blocked = await readJson(
    await harness.route.POST(
      postRequest(
        { passengerName: "Safe Passenger" },
        {
          "Content-Type": "application/json",
          "x-prestige-customer-purpose": "customer-booking-request",
        },
      ),
    ),
  );

  assert.equal(blocked.status, 403);
  assertSafeCustomerBody(blocked.body, "blocked boundary body");

  for (const method of ["GET", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const methodMock = installMock();
    const blockedMethod = await readJson(await harness.route[method]());

    assert.equal(blockedMethod.status, 403, `${method} should fail closed.`);
    assert.deepEqual(blockedMethod.body, {
      error: "Booking requests can be submitted only from the customer booking form.",
      ok: false,
    });
    assert.equal(methodMock.parseCalls.length, 0, `${method} must not parse a customer payload.`);
    assert.equal(methodMock.createCalls.length, 0, `${method} must not create a booking.`);
    assertSafeCustomerBody(blockedMethod.body, `${method} blocked body`);
  }

  const validationMock = installMock({
    parseResult: {
      error: "Forbidden customerPrice rejected before persistence.",
      ok: false,
      status: 400,
    },
  });
  const forbidden = await readJson(await harness.route.POST(postRequest({ customerPrice: "999" })));

  assert.equal(forbidden.status, 400);
  assert.deepEqual(forbidden.body, {
    error: "Booking request includes fields outside the approved request scope.",
    ok: false,
  });
  assert.equal(validationMock.createCalls.length, 0);
  assertSafeCustomerBody(forbidden.body, "forbidden validation body");

  installMock({
    createResult: {
      error: "SQL failed with service_role secret stack",
      ok: false,
      status: 500,
    },
  });
  const failure = await readJson(await harness.route.POST(postRequest({ passengerName: "Safe Passenger" })));

  assert.equal(failure.status, 500);
  assert.deepEqual(failure.body, {
    error: "Booking request could not be saved safely.",
    ok: false,
  });
  assertSafeCustomerBody(failure.body, "safe failure body");
} finally {
  delete globalThis.__prestigeCustomerBookingRequestApiMock;
  await harness.cleanup();
}

console.log("Customer booking request API contract passed.");
