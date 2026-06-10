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
  pageSource.includes("customerPortalSavedBookingsApiPath") &&
    pageSource.includes("mapCustomerSavedBookingsPayload") &&
    pageSource.includes("x-prestige-customer-purpose") &&
    pageSource.includes("customer-saved-bookings-read"),
  true,
  "/my-bookings should be wired to the guarded customer saved-bookings read path.",
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
    mapCustomerSavedBookingsPayload,
  } = harness.adapter;

  assert.equal(customerPortalSavedBookingsApiPath, "/api/customer-saved-bookings");

  const mapped = mapCustomerSavedBookingsPayload({
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
        customer_facing_status: "confirmed",
        dropoff_location: "Raffles Singapore",
        passenger_name: "Safe Passenger",
        pickup_at: "2026-06-08T09:00:00.000Z",
        pickup_location: "Changi Airport",
        service_type: "Airport Arrival",
        updated_at: "2026-06-08T01:30:00.000Z",
      },
    ],
    version: "stage-customer-saved-bookings-read-api-v1",
  });

  assert.deepEqual(mapped, [
    {
      dropoffLocation: "Raffles Singapore",
      id: "saved-SAFE-PORTAL-001",
      passengerName: "Safe Passenger",
      pickupDateTime: "8 June 2026, 09:00",
      pickupLocation: "Changi Airport",
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
    "Unsafe top-level API fields should fail closed to sample fallback.",
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
    "Unsafe saved-booking fields should fail closed to sample fallback.",
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
      pickupDateTime: "10 June 2026, 09:00",
      pickupLocation: "Pickup to confirm",
      serviceType: "Service to confirm",
      status: "Confirmed",
      vehicleType: "To confirm",
    },
  ]);
  assertNoVisibleLeak(sanitized, "sanitized unsafe value booking");
} finally {
  await harness.cleanup();
}

console.log("Customer portal saved bookings adapter contract passed.");
