import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const adapterPath = "lib/customer-booking-request-adapter.ts";
const pagePath = "app/book/page.tsx";
const unsafeCustomerRequestPattern =
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

async function loadAdapterHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-booking-request-adapter-"));
  const sourcePath = path.join(process.cwd(), adapterPath);
  const outputPath = path.join(tempDir, adapterPath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));

  return {
    adapter: createRequire(import.meta.url)(outputPath),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
  };
}

function assertNoUnsafeCustomerRequestText(value, label) {
  assert.equal(
    unsafeCustomerRequestPattern.test(JSON.stringify(value)),
    false,
    `${label}: expected no admin, finance, payout, parser, token, SQL, or archive fields.`,
  );
}

const [adapterSource, pageSource] = await Promise.all(
  [adapterPath, pagePath].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assert.equal(
  pageSource.includes("submitCustomerBookingRequest") && !/fetch\(/.test(pageSource),
  true,
  "/book should submit through the customer booking request adapter, not raw fetch.",
);
assert.equal(
  /from\s+["'].*admin-booking-persistence["']|from\s+["'].*admin-booking-supabase-adapter["']/.test(
    `${adapterSource}\n${pageSource}`,
  ),
  false,
  "Customer booking request client code must not import server-only admin persistence modules.",
);
assert.equal(
  /x-prestige-customer-session-token|authorization|cookie/i.test(`${adapterSource}\n${pageSource}`),
  false,
  "Customer booking request client code must not attach session-token, authorization, or cookie headers.",
);

const harness = await loadAdapterHarness();

try {
  const {
    customerBookingRequestApiPath,
    mapCustomerBookingRequestSubmitPayload,
    submitCustomerBookingRequest,
  } = harness.adapter;
  const fetchCalls = [];
  const safeInput = {
    billing: "must not be sent",
    companyName: "Customer Test Company",
    contactNo: "+65 9000 1111",
    customerPrice: "999",
    dropoffLocation: "Customer Test Dropoff",
    emailAddress: "customer-test@example.com",
    extraStops: "Customer Test Stop",
    financeNotes: "must not be sent",
    flightNumber: "SQ888",
    internalAdminNotes: "must not be sent",
    luggage: "2",
    passengerCount: "2",
    passengerName: "Customer Test Passenger",
    pickupDate: "2026-06-05",
    pickupLocation: "Customer Test Pickup",
    pickupTime: "09:30",
    returnDropoffLocation: "Customer Test Return Dropoff",
    returnExtraStops: "Customer Test Return Stop",
    returnFlightNumber: "SQ889",
    returnPickupDate: "2026-06-06",
    returnPickupLocation: "Customer Test Return Pickup",
    returnPickupTime: "18:30",
    returnTripRequested: "yes",
    serviceType: "Airport Arrival",
    specialRequest: "must not be sent",
    travelerId: "901",
    vehicleType: "Alphard / Vellfire",
  };
  const success = await submitCustomerBookingRequest(safeInput, {
    fetcher: async (url, init) => {
      fetchCalls.push({
        body: JSON.parse(init.body),
        init,
        url,
      });

      return {
        json: async () => ({
          ok: true,
          request: {
            booking_reference: "CUST-SAFE-001",
            customer_facing_status: "Request Received",
            return_booking_reference: "CUST-SAFE-001-RET",
            return_trip_requested: true,
            receipt_status: "sent",
            short_notice_review_required: true,
          },
        }),
        ok: true,
      };
    },
  });

  assert.equal(customerBookingRequestApiPath, "/api/customer-booking-requests");
  assert.deepEqual(success, {
    bookingReference: "CUST-SAFE-001",
    ok: true,
    receiptStatus: "sent",
    returnBookingReference: "CUST-SAFE-001-RET",
    returnTripRequested: true,
    shortNoticeReviewRequired: true,
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(String(fetchCalls[0].url), "/api/customer-booking-requests");
  assert.equal(fetchCalls[0].init.cache, "no-store");
  assert.equal(fetchCalls[0].init.credentials, "same-origin");
  assert.equal(fetchCalls[0].init.method, "POST");
  assert.deepEqual(fetchCalls[0].init.headers, {
    "Content-Type": "application/json",
    "x-prestige-customer-purpose": "customer-booking-request",
  });
  assert.deepEqual(
    Object.keys(fetchCalls[0].body).sort(),
    [
      "companyName",
      "contactNo",
      "dropoffLocation",
      "emailAddress",
      "extraStops",
      "flightNumber",
      "luggage",
      "passengerCount",
      "passengerName",
      "pickupDate",
      "pickupLocation",
      "pickupTime",
      "returnDropoffLocation",
      "returnExtraStops",
      "returnFlightNumber",
      "returnPickupDate",
      "returnPickupLocation",
      "returnPickupTime",
      "returnTripRequested",
      "serviceType",
      "travelerId",
      "vehicleType",
    ],
    "Adapter should submit only approved customer booking request fields.",
  );
  assert.deepEqual(
    [
      "billing",
      "customerPrice",
      "financeNotes",
      "internalAdminNotes",
      "specialRequest",
    ].filter((key) => Object.prototype.hasOwnProperty.call(fetchCalls[0].body, key)),
    [],
    "Adapter must not forward finance/internal/free-note fields.",
  );
  assertNoUnsafeCustomerRequestText(success, "mapped success result");
  assertNoUnsafeCustomerRequestText(fetchCalls[0].body, "submitted request body");

  assert.deepEqual(
    mapCustomerBookingRequestSubmitPayload({
      ok: true,
      request: {
        booking_reference: "CUST-SAFE-002",
        customer_facing_status: "Request Received",
        return_booking_reference: null,
        return_trip_requested: false,
        receipt_status: "blocked",
        short_notice_review_required: false,
      },
    }),
    {
      bookingReference: "CUST-SAFE-002",
      ok: true,
      receiptStatus: "blocked",
      returnBookingReference: null,
      returnTripRequested: false,
      shortNoticeReviewRequired: false,
    },
    "Adapter should map non-short-notice success to false.",
  );
  assert.deepEqual(
    mapCustomerBookingRequestSubmitPayload({
      admin_internal_status: "Admin Review Required",
      ok: true,
      request: {
        booking_reference: "CUST-SAFE-003",
        customer_facing_status: "Request Received",
        return_booking_reference: null,
        return_trip_requested: false,
        short_notice_review_required: true,
      },
    }),
    { ok: false },
    "Unsafe top-level response fields should fail closed.",
  );
  assert.deepEqual(
    mapCustomerBookingRequestSubmitPayload({
      ok: true,
      request: {
        booking_reference: "CUST-SAFE-004",
        customer_facing_status: "Request Received",
        return_booking_reference: null,
        return_trip_requested: false,
        short_notice_review_required: true,
        short_notice_review_status: "Admin Review Required",
      },
    }),
    { ok: false },
    "Unsafe request response fields should fail closed.",
  );
  assert.deepEqual(
    mapCustomerBookingRequestSubmitPayload({
      ok: true,
      request: {
        booking_reference: "SQL-service-role-secret",
        customer_facing_status: "Request Received",
        return_booking_reference: null,
        return_trip_requested: false,
        short_notice_review_required: true,
      },
    }),
    { ok: false },
    "Unsafe allowed-field values should fail closed.",
  );

  let blockedJsonWasRead = false;
  const blocked = await submitCustomerBookingRequest(safeInput, {
    fetcher: async () => ({
      json: async () => {
        blockedJsonWasRead = true;

        return {
          error: "SQL service_role stack",
          ok: false,
        };
      },
      ok: false,
    }),
  });

  assert.deepEqual(blocked, { ok: false });
  assert.equal(blockedJsonWasRead, false, "Blocked responses should not parse unsafe error bodies.");

  let stalePortalJsonWasRead = false;
  const stalePortal = await submitCustomerBookingRequest(safeInput, {
    fetcher: async () => ({
      json: async () => {
        stalePortalJsonWasRead = true;
        return { error: "must not be parsed", ok: false };
      },
      ok: false,
      status: 409,
    }),
  });

  assert.deepEqual(stalePortal, { ok: false, reason: "portal_access_cleared" });
  assert.equal(stalePortalJsonWasRead, false, "Stale portal responses should not parse body text.");

  const thrown = await submitCustomerBookingRequest(safeInput, {
    fetcher: async () => {
      throw new Error("network secret stack");
    },
  });

  assert.deepEqual(thrown, { ok: false });
} finally {
  await harness.cleanup();
}

console.log("Customer booking request adapter contract passed.");
