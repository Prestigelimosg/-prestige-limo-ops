import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const adapterPath = "lib/customer-booking-memory-adapter.ts";
const pagePath = "app/book/page.tsx";
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-booking-memory-ui-"));
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

const [adapterSource, pageSource] = await Promise.all(
  [adapterPath, pagePath].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);
const clientSource = `${adapterSource}\n${pageSource}`;

assert.equal(
  /from\s+["'].*customer-booking-memory-read["']|lib\/customer-booking-memory-read/.test(clientSource),
  false,
  "The booking page client must not import the server-only booking memory reader.",
);
assert.equal(
  /x-prestige-customer-session-token|PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN|PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH/.test(
    clientSource,
  ),
  false,
  "The booking page client must not expose customer session-token or server auth plumbing.",
);
assert.equal(
  /\.(?:insert|upsert|delete|update)\s*\(/.test(clientSource),
  false,
  "The customer booking memory client path must remain read-only.",
);
assert.equal(
  pageSource.includes("loadCustomerBookingMemorySuggestions") &&
    pageSource.includes("applyCustomerBookingMemorySuggestion") &&
    pageSource.includes("data-customer-booking-memory-passenger-input") &&
    pageSource.includes("data-customer-booking-memory-passenger-list") &&
    pageSource.includes("<datalist") &&
    pageSource.includes('autoComplete="off"') &&
    pageSource.includes("onFocus={ensureBookingMemorySuggestions}") &&
    pageSource.includes("onPointerDown={ensureBookingMemorySuggestions}") &&
    pageSource.includes("onChange={(event) => updatePassengerName(event.target.value)}"),
  true,
  "/book should wire booking memory through the safe compact passenger datalist only.",
);
assert.equal(
  /saved passenger|saved address|memory helper|choose boss|select boss|booking memory/i.test(pageSource),
  false,
  "/book should not add extra visible booking-memory instructional text.",
);
for (const field of [
  "passengerName",
  "pickupDate",
  "pickupTime",
  "flightNumber",
  "pickupLocation",
  "dropoffLocation",
]) {
  assert.equal(pageSource.includes(`data-customer-booking-field="${field}"`), true, `/book should keep ${field}.`);
}

const harness = await loadAdapterHarness();

try {
  const {
    applyCustomerBookingMemorySuggestion,
    customerBookingMemoryApiPath,
    loadCustomerBookingMemorySuggestions,
    mapCustomerBookingMemoryPayload,
  } = harness.adapter;
  const safePayload = {
    memories: [
      {
        dropoff_location: "Changi Airport Terminal 3",
        last_used_at: "2026-06-09T03:00:00.000Z",
        passenger_name: "Boss A",
        pickup_location: "West Coast Residence",
        service_type: "Airport Departure",
        vehicle_type: "Mercedes S-Class",
      },
      {
        dropoff_location: "Raffles Singapore",
        last_used_at: "2026-06-09T02:00:00.000Z",
        passenger_name: "Boss B",
        pickup_location: "Orchard Office",
        service_type: "Point-to-Point Transfer",
        vehicle_type: "Alphard / Vellfire",
      },
    ],
    ok: true,
    version: "customer-booking-memory-read-v1",
  };

  assert.equal(customerBookingMemoryApiPath, "/api/customer-booking-memory");

  const mapped = mapCustomerBookingMemoryPayload(safePayload);

  assert.deepEqual(mapped, [
    {
      dropoffLocation: "Changi Airport Terminal 3",
      passengerName: "Boss A",
      pickupLocation: "West Coast Residence",
      serviceType: "Airport Departure",
      vehicleType: "Mercedes S-Class",
    },
    {
      dropoffLocation: "Raffles Singapore",
      passengerName: "Boss B",
      pickupLocation: "Orchard Office",
      serviceType: "Point-to-Point Transfer",
      vehicleType: "Alphard / Vellfire",
    },
  ]);
  assertNoVisibleLeak(mapped, "safe mapped memory suggestions");

  assert.equal(
    mapCustomerBookingMemoryPayload({
      admin_internal_status: "confirmed",
      memories: [],
      ok: true,
    }),
    null,
    "Unsafe top-level API fields should fail closed.",
  );
  assert.equal(
    mapCustomerBookingMemoryPayload({
      memories: [
        {
          admin_internal_status: "confirmed",
          passenger_name: "Boss C",
        },
      ],
      ok: true,
    }),
    null,
    "Unsafe memory fields should fail closed.",
  );
  assert.equal(
    mapCustomerBookingMemoryPayload({
      memories: [
        {
          passenger_name: "driver_payout boss",
          pickup_location: "Safe location",
        },
      ],
      ok: true,
    }),
    null,
    "Unsafe passenger memory values should fail closed.",
  );

  const fetchCalls = [];
  const successfulLoad = await loadCustomerBookingMemorySuggestions({
    fetcher: async (url, init) => {
      fetchCalls.push({ init, url });

      return {
        json: async () => safePayload,
        ok: true,
      };
    },
    limit: 10,
    q: "Boss",
  });

  assert.deepEqual(successfulLoad, mapped, "A safe API response should map to compact booking suggestions.");
  assert.equal(String(fetchCalls[0].url), "/api/customer-booking-memory?limit=10&q=Boss");
  assert.equal(fetchCalls[0].init.cache, "no-store");
  assert.equal(fetchCalls[0].init.credentials, "same-origin");
  assert.deepEqual(fetchCalls[0].init.headers, {
    "x-prestige-customer-purpose": "customer-booking-memory-read",
  });
  assert.equal(
    /x-prestige-customer-session-token|authorization|cookie/i.test(JSON.stringify(fetchCalls[0].init.headers)),
    false,
    "The booking memory fetch must not attach session-token, authorization, or cookie headers.",
  );

  const blockedLoad = await loadCustomerBookingMemorySuggestions({
    fetcher: async () => ({
      json: async () => {
        throw new Error("blocked JSON should not be read");
      },
      ok: false,
      status: 403,
    }),
  });

  assert.equal(blockedLoad, null, "Blocked customer booking memory reads should fail closed.");

  const unsafeQueryLoad = await loadCustomerBookingMemorySuggestions({
    fetcher: async () => {
      throw new Error("unsafe query should not call fetch");
    },
    q: "driver_payout",
  });

  assert.equal(unsafeQueryLoad, null, "Unsafe customer booking memory queries should fail before fetch.");

  const applied = applyCustomerBookingMemorySuggestion(
    {
      dropoffLocation: "",
      passengerName: "",
      pickupDate: "2026-06-22",
      pickupLocation: "",
      pickupTime: "09:30",
      serviceType: "Other / To Confirm",
      vehicleType: "",
    },
    mapped[0],
  );

  assert.deepEqual(
    applied,
    {
      dropoffLocation: "Changi Airport Terminal 3",
      passengerName: "Boss A",
      pickupDate: "2026-06-22",
      pickupLocation: "West Coast Residence",
      pickupTime: "09:30",
      serviceType: "Airport Departure",
      vehicleType: "Mercedes S-Class",
    },
    "Applying Boss A should fill saved passenger/address/service/vehicle while preserving date and pickup time.",
  );
  assertNoVisibleLeak(applied, "applied booking memory suggestion");
} finally {
  await harness.cleanup();
}

console.log("Customer booking memory UI contract tests passed.");
