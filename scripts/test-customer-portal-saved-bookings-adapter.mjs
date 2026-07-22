import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const adapterPath = "lib/customer-portal-saved-bookings-adapter.ts";
const pagePath = "app/my-bookings/page.tsx";
const smokePath = "scripts/test-app-smoke-browser.mjs";
const forbiddenVisibleTextPattern =
  /admin_internal_status|admin_status|billing|contact_phone|contact_email|passenger_phone|customer_price|quoted_price|rate_amount|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|parser_learning|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note|internal_note|admin_note|server_secret|session_token|raw_token|token_hash|driver_token/i;

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-portal-saved-bookings-"));
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

function assertNoVisibleLeak(value, label) {
  assert.equal(
    forbiddenVisibleTextPattern.test(JSON.stringify(value)),
    false,
    `${label}: expected no admin, finance, payout, parser, token, notification, or archive text`,
  );
}

const [adapterSource, pageSource, smokeSource] = await Promise.all(
  [adapterPath, pagePath, smokePath].map((relativePath) =>
    readFile(path.join(process.cwd(), relativePath), "utf8"),
  ),
);
const clientSource = `${adapterSource}\n${pageSource}`;

assert.equal(
  /from\s+["'].*customer-saved-bookings-read["']|lib\/customer-saved-bookings-read/.test(clientSource),
  false,
  "The customer portal client must not import the server-only saved-bookings reader.",
);
assert.equal(
  /x-prestige-customer-session-token|PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN/.test(clientSource),
  false,
  "The customer portal client must not expose customer session-token plumbing.",
);
assert.equal(
  /\.(?:insert|upsert|delete|update)\s*\(/.test(clientSource),
  false,
  "The customer portal saved-bookings client path must remain read-only.",
);
assert.equal(
  pageSource.includes("loadCustomerPortalSavedBookings") &&
    pageSource.includes("useState<CustomerPortalBooking[]>([])") &&
    pageSource.includes('useState<PortalBookingsLoadState>("loading")') &&
    pageSource.includes("setPortalBookings(loadedBookings || [])") &&
    pageSource.includes('setPortalBookingsLoadState(loadedBookings === null ? "blocked" : "ready")') &&
    pageSource.includes('data-customer-portal-access-state={portalBookingsLoadState}'),
  true,
  "/my-bookings should start empty, clear rows after blocked reads, and use only guarded customer saved-bookings API rows.",
);
assert.equal(
  pageSource.includes("refreshCustomerPortalSavedBookings") &&
    pageSource.includes('window.addEventListener("focus", refreshOnForeground)') &&
    pageSource.includes('document.addEventListener("visibilitychange", refreshOnForeground)') &&
    pageSource.includes('window.removeEventListener("focus", refreshOnForeground)') &&
    pageSource.includes('document.removeEventListener("visibilitychange", refreshOnForeground)'),
  true,
  "/my-bookings should reuse its guarded saved-bookings loader when the installed customer app returns to the foreground.",
);
const foregroundRefreshStart = pageSource.indexOf("let activeController: AbortController | null = null;");
const foregroundRefreshEnd = pageSource.indexOf(
  "}, [refreshCustomerPortalSavedBookings]);",
  foregroundRefreshStart,
);
assert.notEqual(
  foregroundRefreshStart,
  -1,
  "/my-bookings should keep one bounded foreground saved-bookings refresh effect.",
);
assert.notEqual(
  foregroundRefreshEnd,
  -1,
  "/my-bookings should close the bounded foreground saved-bookings refresh effect.",
);
assert.equal(
  /setInterval\s*\(/.test(pageSource.slice(foregroundRefreshStart, foregroundRefreshEnd)),
  false,
  "/my-bookings foreground synchronization must not add a polling lane.",
);
assert.equal(
  pageSource.includes('"Sign in to view bookings."') &&
    pageSource.includes("portalBookingsLoadState === \"blocked\""),
  true,
  "/my-bookings should fail closed to a compact sign-in-required state when saved-bookings read is blocked.",
);
assert.equal(
  /const bookings: CustomerPortalBooking\[\]|buildSampleBooking|samplePickupLocations|Alicia Tan|Daniel Lim|Priya Shah|Completed Guest|Cancelled Guest/.test(
    pageSource,
  ),
  false,
  "/my-bookings must not keep sample booking rows as customer-visible data.",
);
assert.equal(
  pageSource.includes("getCurrentPortalMonthInfo") && !/portalCurrentMonthKey|portalCurrentMonthLabel/.test(pageSource),
  true,
  "/my-bookings past-booking filters should not use stale sample-month constants.",
);
assert.equal(
  smokeSource.includes("customerPortalSavedBookingsApiPattern"),
  true,
  "Browser smoke checks should allow only the guarded customer saved-bookings read call on /my-bookings.",
);

const harness = await loadAdapterHarness();

try {
  const {
    customerPortalSavedBookingsApiPath,
    loadCustomerPortalSavedBookings,
    mapCustomerSavedBookingsPayload,
  } = harness.adapter;
  const safePayload = {
    ok: true,
    pagination: {
      has_next_page: false,
      has_previous_page: false,
      page: 1,
      page_size: 10,
    },
    saved_bookings: [
      {
        booking_month: "2026-06",
        booking_reference: "SAFE-PORTAL-001",
        created_at: "2026-06-08T01:00:00.000Z",
        customer_driver_details: {
          car_plate: "SLA1234X",
          car_type: "Mercedes E-Class",
          driver_contact: "+65 8888 0000",
          driver_name: "Safe Driver",
        },
        customer_facing_status: "confirmed",
        dropoff_location: "Raffles Singapore",
        passenger_name: "Safe Passenger",
        pickup_at: "2026-06-08T09:00:00.000Z",
        pickup_location: "Changi Airport",
        public_booking_reference: "SAFE-00001",
        service_type: "Airport Arrival",
        updated_at: "2026-06-08T01:30:00.000Z",
      },
    ],
    version: "stage-customer-saved-bookings-read-api-v1",
  };

  assert.equal(customerPortalSavedBookingsApiPath, "/api/customer-saved-bookings");

  const mapped = mapCustomerSavedBookingsPayload(safePayload);

  assert.deepEqual(mapped, [
    {
      driverDetails: {
        carPlate: "SLA1234X",
        carType: "Mercedes E-Class",
        driverContact: "+65 8888 0000",
        driverName: "Safe Driver",
      },
      dropoffLocation: "Raffles Singapore",
      id: "saved-SAFE-PORTAL-001",
      passengerName: "Safe Passenger",
      pickupDateTime: "8 June 2026, 17:00",
      pickupLocation: "Changi Airport",
      publicBookingReference: "SAFE-00001",
      serviceType: "Airport Arrival",
      status: "Confirmed",
      vehicleType: "To confirm",
    },
  ]);
  assertNoVisibleLeak(mapped, "safe mapped booking");

  assert.deepEqual(
    mapCustomerSavedBookingsPayload({
      ok: true,
      saved_bookings: [],
    }),
    [],
    "An available guarded API with no rows should replace samples with an empty safe list.",
  );

  assert.equal(
    mapCustomerSavedBookingsPayload({
      admin_internal_status: "confirmed",
      ok: true,
      saved_bookings: [],
    }),
    null,
    "Unsafe top-level API fields should fail closed to an empty portal.",
  );
  assert.equal(
    mapCustomerSavedBookingsPayload({
      ok: true,
      saved_bookings: [
        {
          admin_internal_status: "confirmed",
          booking_reference: "SAFE-PORTAL-002",
        },
      ],
    }),
    null,
    "Unsafe saved-booking fields should fail closed to an empty portal.",
  );

  const sanitized = mapCustomerSavedBookingsPayload({
    ok: true,
    saved_bookings: [
      {
        booking_reference: "SAFE-PORTAL-003",
        customer_facing_status: "confirmed",
        dropoff_location: "internal_admin_note holding room",
        passenger_name: "finance note passenger",
        pickup_at: "2026-06-10T09:00:00.000Z",
        pickup_location: "driver_payout office",
        service_type: "payment transfer",
      },
    ],
  });

  assert.deepEqual(sanitized, [
    {
      dropoffLocation: "Drop-off to confirm",
      id: "saved-SAFE-PORTAL-003",
      passengerName: "Passenger to confirm",
      pickupDateTime: "10 June 2026, 17:00",
      pickupLocation: "Pickup to confirm",
      publicBookingReference: "SAFE-PORTAL-003",
      serviceType: "Service to confirm",
      status: "Confirmed",
      vehicleType: "To confirm",
    },
  ]);
  assertNoVisibleLeak(sanitized, "sanitized unsafe value booking");

  assert.deepEqual(
    mapCustomerSavedBookingsPayload({
      ok: true,
      saved_bookings: [
        {
          booking_reference: "SAFE-PORTAL-004",
          customer_facing_status: "confirmed",
          dropoff_location: "Changi Airport Terminal 3 Departure",
          passenger_name: "Safe Passenger",
          pickup_at: "2026-07-05T18:45:00+00:00",
          pickup_location: "Raffles Hotel Singapore Lobby",
          service_type: "Departure",
        },
      ],
    }),
    [
      {
        dropoffLocation: "Changi Airport Terminal 3 Departure",
        id: "saved-SAFE-PORTAL-004",
        passengerName: "Safe Passenger",
        pickupDateTime: "6 July 2026, 02:45",
        pickupLocation: "Raffles Hotel Singapore Lobby",
        publicBookingReference: "SAFE-PORTAL-004",
        serviceType: "Departure",
        status: "Confirmed",
        vehicleType: "To confirm",
      },
    ],
    "Customer portal should display offset timestamps in Singapore local time after admin-approved amendments.",
  );

  const fetchCalls = [];
  const successfulLoad = await loadCustomerPortalSavedBookings({
    fetcher: async (url, init) => {
      fetchCalls.push({ init, url });

      return {
        json: async () => safePayload,
        ok: true,
      };
    },
  });

  assert.deepEqual(successfulLoad, mapped, "A safe API response should replace samples with mapped safe rows.");
  assert.equal(String(fetchCalls[0].url), "/api/customer-saved-bookings?limit=25&page=1");
  assert.equal(fetchCalls[0].init.cache, "no-store");
  assert.equal(fetchCalls[0].init.credentials, "same-origin");
  assert.deepEqual(fetchCalls[0].init.headers, {
    "x-prestige-customer-purpose": "customer-saved-bookings-read",
  });
  assert.equal(
    /x-prestige-customer-session-token|authorization|cookie/i.test(JSON.stringify(fetchCalls[0].init.headers)),
    false,
    "The customer portal saved-bookings fetch must not attach session-token, authorization, or cookie headers.",
  );

  let blockedJsonWasRead = false;
  const blockedLoad = await loadCustomerPortalSavedBookings({
    fetcher: async () => ({
      json: async () => {
        blockedJsonWasRead = true;

        return {
          error: "Customer saved bookings read requires secure customer account access before saved bookings can be read.",
          ok: false,
        };
      },
      ok: false,
      status: 403,
    }),
  });

  assert.equal(blockedLoad, null, "Blocked customer saved-bookings reads should keep the portal empty.");
  assert.equal(blockedJsonWasRead, false, "Blocked responses should not be parsed into customer-visible state.");

  const unavailableLoad = await loadCustomerPortalSavedBookings({
    fetcher: async () => {
      throw new Error("network unavailable");
    },
  });

  assert.equal(unavailableLoad, null, "Unavailable customer saved-bookings reads should keep the portal empty.");

  const unsafeLoad = await loadCustomerPortalSavedBookings({
    fetcher: async () => ({
      json: async () => ({
        admin_internal_status: "confirmed",
        ok: true,
        saved_bookings: [],
      }),
      ok: true,
    }),
  });

  assert.equal(unsafeLoad, null, "Unsafe customer saved-bookings payloads should keep the portal empty.");
} finally {
  await harness.cleanup();
}

console.log("Customer portal saved bookings adapter contract passed.");
