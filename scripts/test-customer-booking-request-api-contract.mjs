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
const ledgerPath = "docs/current-implementation-ledger.md";
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
  const adminAppNotificationPath = path.join(tempDir, "lib/admin-app-notification-persistence.js");
  const adapterPath = path.join(tempDir, "lib/admin-booking-supabase-adapter.js");
  const emailAlertPath = path.join(tempDir, "lib/admin-new-booking-email-alert.js");
  const devicePushAlertPath = path.join(tempDir, "lib/admin-device-push-notification.js");
  const receiptEmailPath = path.join(tempDir, "lib/customer-booking-receipt-email.js");
  const customerSavedBookingsReadPath = path.join(tempDir, "lib/customer-saved-bookings-read.js");
  const customerPortalAccessLinkPath = path.join(tempDir, "lib/customer-portal-access-link.js");
  const codexJobCardAutoPreparationPath = path.join(
    tempDir,
    "lib/codex-job-card-auto-preparation.js",
  );

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
      "  return Array.isArray(state.createResults) && state.createResults.length > 0 ? state.createResults.shift() : state.createResult;",
      "}",
      "function parseCustomerBookingRequestPayload(payload) {",
      "  const state = mock();",
      "  state.parseCalls.push(payload);",
      "  return state.parseResult;",
      "}",
      "function parseCustomerBookingRequestPayloads(payload) {",
      "  const state = mock();",
      "  state.parseCalls.push(payload);",
      "  return state.parsePayloadsResult || state.parseResult;",
      "}",
      "module.exports = { createAdminBooking, parseCustomerBookingRequestPayload, parseCustomerBookingRequestPayloads };",
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
    adminAppNotificationPath,
    [
      "function mock() { return globalThis.__prestigeCustomerBookingRequestApiMock; }",
      "async function createCustomerBookingRequestAdminAppNotification(input) {",
      "  const state = mock();",
      "  state.adminAppNotificationCalls.push(input);",
      "  if (state.adminAppNotificationThrows) {",
      "    throw new Error('mock admin app notification failure');",
      "  }",
      "  return { data: { booking_reference: input.booking_reference }, ok: true };",
      "}",
      "module.exports = { createCustomerBookingRequestAdminAppNotification };",
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
  await writeFile(
    devicePushAlertPath,
    [
      "function mock() { return globalThis.__prestigeCustomerBookingRequestApiMock; }",
      "async function sendAdminNewBookingDevicePushAlert(booking) {",
      "  const state = mock();",
      "  state.devicePushAlertCalls.push(booking);",
      "  if (state.devicePushAlertThrows) {",
      "    throw new Error('mock device push failure');",
      "  }",
      "  return { ok: false, reason: 'push_gate_closed', status: 'blocked' };",
      "}",
      "module.exports = { sendAdminNewBookingDevicePushAlert };",
    ].join("\n"),
  );
  await writeFile(
    receiptEmailPath,
    [
      "function mock() { return globalThis.__prestigeCustomerBookingRequestApiMock; }",
      "async function sendCustomerBookingReceiptEmail(bookings, options) {",
      "  const state = mock();",
      "  state.receiptCalls = [...(state.receiptCalls || []), { bookings, options }];",
      "  return state.receiptResult || { ok: false, reason: 'gate_closed', status: 'blocked' };",
      "}",
      "module.exports = { sendCustomerBookingReceiptEmail };",
    ].join("\n"),
  );
  await writeFile(
    customerSavedBookingsReadPath,
    [
      "function mock() { return globalThis.__prestigeCustomerBookingRequestApiMock; }",
      "function resolveCustomerSavedBookingsBoundaryForPurpose() {",
      "  const state = mock();",
      "  return state.portalBoundary || { ok: false, error: 'no portal session', status: 403 };",
      "}",
      "async function resolveCustomerSavedBookingsVerifiedIdentity(context, travelerId) {",
      "  const state = mock();",
      "  state.identityCalls.push({ context, travelerId });",
      "  return state.verifiedIdentity || { ok: false, error: 'identity unavailable', status: 403 };",
      "}",
      "function expiredCustomerSavedBookingsSessionCookieHeaders() {",
      "  const state = mock();",
      "  return state.expiredSessionCookieHeaders || [",
      "    'prestige_customer_saved_bookings_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax; Priority=High',",
      "  ];",
      "}",
      "module.exports = { expiredCustomerSavedBookingsSessionCookieHeaders, resolveCustomerSavedBookingsBoundaryForPurpose, resolveCustomerSavedBookingsVerifiedIdentity };",
    ].join("\n"),
  );
  await writeFile(
    customerPortalAccessLinkPath,
    [
      "function createCustomerPortalAccessLinkToken() {",
      "  const state = globalThis.__prestigeCustomerBookingRequestApiMock;",
      "  return state.portalLinkResult || { ok: false, error: 'portal link unavailable', status: 403 };",
      "}",
      "function safeCustomerPortalPublicBookingReference(value) {",
      "  const cleaned = typeof value === 'string' || typeof value === 'number' ? String(value).trim().toUpperCase() : '';",
      "  return /^(?:[0-9]{5}|[A-Z0-9]{2,12}-[0-9]{5})$/.test(cleaned) ? cleaned : null;",
      "}",
      "module.exports = { createCustomerPortalAccessLinkToken, safeCustomerPortalPublicBookingReference };",
    ].join("\n"),
  );
  await writeFile(
    codexJobCardAutoPreparationPath,
    [
      "function mock() { return globalThis.__prestigeCustomerBookingRequestApiMock; }",
      "async function prepareCodexJobCardForAdminReview(input) {",
      "  const state = mock();",
      "  state.codexPreparationCalls.push(input);",
      "  if (state.codexPreparationThrows) {",
      "    throw new Error('mock internal preparation failure');",
      "  }",
      "  return { prepared: true, reason: 'prepared', status: 'ready' };",
      "}",
      "module.exports = { prepareCodexJobCardForAdminReview };",
    ].join("\n"),
  );

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(outputPath),
  };
}

function installMock(overrides = {}) {
  const state = {
    adminAppNotificationCalls: [],
    adminAppNotificationThrows: false,
    alertCalls: [],
    alertThrows: false,
    createCalls: [],
    codexPreparationCalls: [],
    codexPreparationThrows: false,
    createResult: {
      data: {
        admin_internal_status: "Admin Review Required",
        booking_reference: "CUST-SAFE-001",
        customer_facing_status: "Request Received",
        short_notice_review_status: "Admin Review Required",
      },
      ok: true,
    },
    devicePushAlertCalls: [],
    devicePushAlertThrows: false,
    identityCalls: [],
    parseCalls: [],
    parseResult: {
      data: {
        groupReference: "CUST-SAFE-001",
        requests: [
          {
            booking: {
              booking_reference: "CUST-SAFE-001",
            },
          },
        ],
        returnTripRequested: false,
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

const [routeSource, pageSource, bookingPersistenceSource, requestAdapterSource, supabaseAdapterSource, ledgerSource, smokeSource] =
  await Promise.all(
    [routePath, pagePath, bookingPersistencePath, requestAdapterPath, supabaseAdapterPath, ledgerPath, smokePath].map(
      (relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8"),
    ),
  );
const requestAdapterAllowedResponseFields =
  requestAdapterSource.match(/const allowedApiRequestFields = new Set\(\[[\s\S]+?\]\);/)?.[0] || "";
const customerBookingRequestSmokeMockStart = smokeSource.indexOf(
  'if (url.includes("/api/customer-booking-requests"))',
);
const customerBookingRequestSmokeMockEnd = smokeSource.indexOf(
  'if (url.includes("/api/customer-booking-memory"))',
  customerBookingRequestSmokeMockStart,
);
const customerBookingRequestSmokeMock =
  customerBookingRequestSmokeMockStart >= 0 && customerBookingRequestSmokeMockEnd > customerBookingRequestSmokeMockStart
    ? smokeSource.slice(customerBookingRequestSmokeMockStart, customerBookingRequestSmokeMockEnd)
    : "";

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
  customerBookingRequestSmokeMock.includes("short_notice_review_required") &&
    !/request:\s*\{[\s\S]+?admin_internal_status|request:\s*\{[\s\S]+?short_notice_review_status/.test(
      customerBookingRequestSmokeMock,
    ),
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
assert.equal(
  bookingPersistenceSource.includes("flight_no?: string | null;") &&
    bookingPersistenceSource.includes('"flight_no"') &&
    bookingPersistenceSource.includes("flight_no: textOrNull(record.flight_no)") &&
    bookingPersistenceSource.includes("flight_no: flightNumber"),
  true,
  "Customer booking request persistence must map flightNumber into the safe flight_no booking field.",
);
assert.equal(
  supabaseAdapterSource.includes("passenger_phone, flight_no, driver_name") &&
    supabaseAdapterSource.includes("contact_email, flight_no, pax_count") &&
    supabaseAdapterSource.includes("flight_no: textOrNull(booking.flight_no)") &&
    supabaseAdapterSource.includes("flight_no: textOrNull(row.flight_no)"),
  true,
  "Admin booking persistence adapter must write and reload flight_no so Dispatch Customer Copy receives the flight.",
);
for (const phrase of [
  "### Customer Booking Request Flight Persistence Fix",
  "Public `/book` flight number input now persists into the safe operational `flight_no` booking field",
  "Admin booking persistence save and reload include `flight_no`, so a customer request loaded into Dispatch carries the flight into Customer Copy.",
  "departure bookings append flight detail to drop-off, arrival bookings append flight detail to pickup",
  "Guard coverage lives in `scripts/test-customer-booking-request-api-contract.mjs` and `scripts/test-dispatch-flight-location-copy-guard.mjs`.",
]) {
  assert.equal(ledgerSource.includes(phrase), true, `Ledger must include flight persistence fix phrase: ${phrase}`);
}

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
      receipt_status: "blocked",
      return_booking_reference: null,
      return_trip_requested: false,
      short_notice_review_required: true,
    },
  });
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.alertCalls.length, 1);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.adminAppNotificationCalls.length, 1);
  assert.equal(
    globalThis.__prestigeCustomerBookingRequestApiMock.adminAppNotificationCalls[0].booking_reference,
    "CUST-SAFE-001",
  );
  assert.equal(
    globalThis.__prestigeCustomerBookingRequestApiMock.alertCalls[0].booking_reference,
    "CUST-SAFE-001",
  );
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.devicePushAlertCalls.length, 1);
  assert.equal(
    globalThis.__prestigeCustomerBookingRequestApiMock.receiptCalls[0].options.portalUrl,
    null,
    "A first-time request must not receive portal access inferred from contact fields.",
  );
  assert.equal(
    globalThis.__prestigeCustomerBookingRequestApiMock.devicePushAlertCalls[0].booking_reference,
    "CUST-SAFE-001",
  );
  assert.deepEqual(globalThis.__prestigeCustomerBookingRequestApiMock.codexPreparationCalls, [
    {
      bookingReference: "CUST-SAFE-001",
      event: "new_booking",
    },
  ]);
  assertSafeCustomerBody(success.body, "short-notice success body");

  const verifiedPaMock = installMock({
    createResult: {
      data: {
        admin_internal_status: "Admin Review Required",
        booking_reference: "CUST-SAFE-001",
        contact_email: "william@prestigelimo.sg",
        customer_facing_status: "Request Received",
        public_booking_reference: "10841",
        short_notice_review_status: "Admin Review Required",
      },
      ok: true,
    },
    portalBoundary: {
      data: {
        auth_user_id: "verified-pa",
        portal_link_revision: "verified-link-revision",
      },
      ok: true,
    },
    portalLinkResult: {
      data: { token: "customer-portal-access-link-v1.test.signature" },
      ok: true,
    },
    verifiedIdentity: {
      data: {
        booker_email: "william@prestigelimo.sg",
        booker_id: 5,
        company_id: 1,
        customer_account_reference: "120",
        traveler_id: 901,
        traveler_name: "Verified Traveller",
      },
      ok: true,
    },
  });
  const verifiedPaSuccess = await readJson(
    await harness.route.POST(postRequest({ passengerName: "Tampered Passenger", travelerId: "901" })),
  );

  assert.equal(verifiedPaSuccess.status, 200);
  assert.deepEqual(verifiedPaMock.createCalls[0].data.booking, {
    booking_reference: "CUST-SAFE-001",
    booker_id: 5,
    company_id: 1,
    customer_id: "120",
    passenger_name: "Verified Traveller",
    traveler_id: 901,
  });
  assert.equal(verifiedPaMock.identityCalls[0].travelerId, "901");
  assert.match(
    verifiedPaMock.receiptCalls[0].options.portalUrl,
    /^http:\/\/localhost\/api\/customer-portal-access\/customer-portal-access-link-v1\.test\.signature\?booking=10841&tracking=1$/,
  );
  assertSafeCustomerBody(verifiedPaSuccess.body, "verified PA success body");

  const mismatchedEmailMock = installMock({
    createResult: {
      data: {
        admin_internal_status: "Admin Review Required",
        booking_reference: "CUST-SAFE-001",
        contact_email: "other@example.com",
        customer_facing_status: "Request Received",
        short_notice_review_status: "Admin Review Required",
      },
      ok: true,
    },
    portalBoundary: {
      data: {
        auth_user_id: "verified-pa",
        portal_link_revision: "verified-link-revision",
      },
      ok: true,
    },
    portalLinkResult: {
      data: { token: "customer-portal-access-link-v1.test.signature" },
      ok: true,
    },
    verifiedIdentity: {
      data: {
        booker_email: "william@prestigelimo.sg",
        booker_id: 5,
        company_id: 1,
        customer_account_reference: "120",
        traveler_id: 901,
        traveler_name: "Verified Traveller",
      },
      ok: true,
    },
  });
  const mismatchedEmailSuccess = await readJson(
    await harness.route.POST(postRequest({ passengerName: "Tampered Passenger", travelerId: "901" })),
  );
  assert.equal(mismatchedEmailSuccess.status, 200);
  assert.equal(
    mismatchedEmailMock.receiptCalls[0].options.portalUrl,
    null,
    "A receipt sent to an address other than the verified booker email must not include portal access.",
  );

  const stalePortalMock = installMock({
    portalBoundary: { data: { auth_user_id: "removed-portal-account" }, ok: true },
    verifiedIdentity: {
      error: "identity unavailable",
      ok: false,
      status: 403,
    },
  });
  const stalePortalResponse = await harness.route.POST(
    postRequest({ passengerName: "Safe Retry Passenger" }),
  );
  const stalePortal = await readJson(stalePortalResponse);

  assert.equal(stalePortal.status, 409);
  assert.deepEqual(stalePortal.body, {
    error: "Saved customer portal access was cleared. Review the request and submit it again.",
    ok: false,
  });
  assert.match(stalePortalResponse.headers.get("set-cookie") || "", /Max-Age=0/);
  assert.match(stalePortalResponse.headers.get("set-cookie") || "", /HttpOnly/);
  assert.match(stalePortalResponse.headers.get("set-cookie") || "", /Secure/);
  assert.equal(stalePortalMock.createCalls.length, 0);
  assertSafeCustomerBody(stalePortal.body, "stale portal retry body");

  const unsafeCookieNameMock = installMock({
    expiredSessionCookieHeaders: [],
    portalBoundary: { data: { auth_user_id: "unsafe-cookie-config" }, ok: true },
    verifiedIdentity: {
      error: "identity unavailable",
      ok: false,
      status: 403,
    },
  });
  const unsafeCookieNameResponse = await harness.route.POST(
    postRequest({ passengerName: "Safe Fail Closed Passenger" }),
  );
  const unsafeCookieName = await readJson(unsafeCookieNameResponse);

  assert.equal(unsafeCookieName.status, 403);
  assert.equal(unsafeCookieNameResponse.headers.get("set-cookie"), null);
  assert.equal(unsafeCookieNameMock.createCalls.length, 0);
  assertSafeCustomerBody(unsafeCookieName.body, "unsafe cookie-name fail-closed body");

  installMock({
    createResults: [
      {
        data: {
          admin_internal_status: "Admin Review Required",
          booking_reference: "CUST-RETURN-001-OUT",
          customer_facing_status: "Request Received",
          short_notice_review_status: "Not Required",
        },
        ok: true,
      },
      {
        data: {
          admin_internal_status: "Admin Review Required",
          booking_reference: "CUST-RETURN-001-RET",
          customer_facing_status: "Request Received",
          short_notice_review_status: "Admin Review Required",
        },
        ok: true,
      },
    ],
    parsePayloadsResult: {
      data: {
        groupReference: "CUST-RETURN-001",
        requests: [
          {
            booking: {
              booking_reference: "CUST-RETURN-001-OUT",
            },
          },
          {
            booking: {
              booking_reference: "CUST-RETURN-001-RET",
            },
          },
        ],
        returnTripRequested: true,
      },
      ok: true,
    },
  });
  const returnTripSuccess = await readJson(
    await harness.route.POST(
      postRequest({
        passengerName: "Safe Passenger",
        returnTripRequested: "yes",
      }),
    ),
  );

  assert.equal(returnTripSuccess.status, 200);
  assert.deepEqual(returnTripSuccess.body, {
    ok: true,
    request: {
      booking_reference: "CUST-RETURN-001-OUT",
      customer_facing_status: "Request Received",
      receipt_status: "blocked",
      return_booking_reference: "CUST-RETURN-001-RET",
      return_trip_requested: true,
      short_notice_review_required: true,
    },
  });
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.createCalls.length, 2);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.alertCalls.length, 1);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.adminAppNotificationCalls.length, 1);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.devicePushAlertCalls.length, 1);
  assert.deepEqual(
    globalThis.__prestigeCustomerBookingRequestApiMock.codexPreparationCalls,
    [
      { bookingReference: "CUST-RETURN-001-OUT", event: "new_booking" },
      { bookingReference: "CUST-RETURN-001-RET", event: "new_booking" },
    ],
  );
  assertSafeCustomerBody(returnTripSuccess.body, "return-trip success body");

  installMock({
    codexPreparationThrows: true,
    createResult: {
      data: {
        admin_internal_status: "Admin Review Required",
        booking_reference: "CUST-SAFE-PREPARATION-FAIL",
        customer_facing_status: "Request Received",
        short_notice_review_status: "Admin Review Required",
      },
      ok: true,
    },
  });
  const codexPreparationFailureStillSucceeds = await readJson(
    await harness.route.POST(postRequest({ passengerName: "Safe Passenger" })),
  );

  assert.equal(codexPreparationFailureStillSucceeds.status, 200);
  assert.equal(
    codexPreparationFailureStillSucceeds.body.request.booking_reference,
    "CUST-SAFE-PREPARATION-FAIL",
  );
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.codexPreparationCalls.length, 1);
  assertSafeCustomerBody(
    codexPreparationFailureStillSucceeds.body,
    "Codex-preparation-failure success body",
  );

  installMock({
    adminAppNotificationThrows: true,
    createResult: {
      data: {
        admin_internal_status: "Admin Review Required",
        booking_reference: "CUST-SAFE-INAPP-FAIL",
        customer_facing_status: "Request Received",
        short_notice_review_status: "Admin Review Required",
      },
      ok: true,
    },
  });
  const adminAppNotificationFailureStillSucceeds = await readJson(
    await harness.route.POST(postRequest({ passengerName: "Safe Passenger" })),
  );

  assert.equal(adminAppNotificationFailureStillSucceeds.status, 200);
  assert.deepEqual(adminAppNotificationFailureStillSucceeds.body, {
    ok: true,
    request: {
      booking_reference: "CUST-SAFE-INAPP-FAIL",
      customer_facing_status: "Request Received",
      receipt_status: "blocked",
      return_booking_reference: null,
      return_trip_requested: false,
      short_notice_review_required: true,
    },
  });
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.adminAppNotificationCalls.length, 1);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.alertCalls.length, 1);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.devicePushAlertCalls.length, 1);
  assertSafeCustomerBody(adminAppNotificationFailureStillSucceeds.body, "admin-app-notification-failure success body");

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
      receipt_status: "blocked",
      return_booking_reference: null,
      return_trip_requested: false,
      short_notice_review_required: true,
    },
  });
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.alertCalls.length, 1);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.adminAppNotificationCalls.length, 1);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.devicePushAlertCalls.length, 1);
  assertSafeCustomerBody(alertFailureStillSucceeds.body, "alert-failure success body");

  installMock({
    createResult: {
      data: {
        admin_internal_status: "Admin Review Required",
        booking_reference: "CUST-SAFE-PUSH-FAIL",
        customer_facing_status: "Request Received",
        short_notice_review_status: "Admin Review Required",
      },
      ok: true,
    },
    devicePushAlertThrows: true,
  });
  const devicePushFailureStillSucceeds = await readJson(
    await harness.route.POST(postRequest({ passengerName: "Safe Passenger" })),
  );

  assert.equal(devicePushFailureStillSucceeds.status, 200);
  assert.deepEqual(devicePushFailureStillSucceeds.body, {
    ok: true,
    request: {
      booking_reference: "CUST-SAFE-PUSH-FAIL",
      customer_facing_status: "Request Received",
      receipt_status: "blocked",
      return_booking_reference: null,
      return_trip_requested: false,
      short_notice_review_required: true,
    },
  });
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.alertCalls.length, 1);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.adminAppNotificationCalls.length, 1);
  assert.equal(globalThis.__prestigeCustomerBookingRequestApiMock.devicePushAlertCalls.length, 1);
  assertSafeCustomerBody(devicePushFailureStillSucceeds.body, "device-push-failure success body");

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
