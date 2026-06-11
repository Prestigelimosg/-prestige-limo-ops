import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const adapterPath = "lib/customer-booking-memory-adapter.ts";
const formHelperPath = "lib/customer-booking-memory-form.ts";
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

  for (const relativePath of [adapterPath, formHelperPath]) {
    const sourcePath = path.join(process.cwd(), relativePath);
    const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
    const source = await readFile(sourcePath, "utf8");

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transpileTypescript(source, sourcePath));
  }

  return {
    adapter: createRequire(import.meta.url)(path.join(tempDir, adapterPath.replace(/\.ts$/, ".js"))),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    form: createRequire(import.meta.url)(path.join(tempDir, formHelperPath.replace(/\.ts$/, ".js"))),
  };
}

function assertNoVisibleLeak(value, label) {
  assert.equal(
    forbiddenVisibleTextPattern.test(JSON.stringify(value)),
    false,
    `${label}: expected no admin, finance, payout, parser, token, notification, or archive text`,
  );
}

const [adapterSource, formHelperSource, pageSource] = await Promise.all(
  [adapterPath, formHelperPath, pagePath].map((relativePath) =>
    readFile(path.join(process.cwd(), relativePath), "utf8"),
  ),
);
const clientSource = `${adapterSource}\n${formHelperSource}\n${pageSource}`;

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
    pageSource.includes("applyCustomerBookingMemoryToRequestForm") &&
    pageSource.includes("findCustomerBookingMemorySuggestion") &&
    pageSource.includes("bookingMemoryLoadStarted = useRef(false)") &&
    pageSource.includes("bookingMemoryLoadStarted.current = true") &&
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
  /setFeedback|bookingMemoryError|login required|please log in|sign in/i.test(
    pageSource.match(/async function ensureBookingMemorySuggestions\(\) {[\s\S]+?\n  }/)?.[0] || "",
  ),
  false,
  "/book memory auth failures should stay silent and not add customer-facing text.",
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
  const {
    applyCustomerBookingMemoryToRequestForm,
    findCustomerBookingMemorySuggestion,
  } = harness.form;
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
  assert.deepEqual(
    findCustomerBookingMemorySuggestion(mapped, "boss a"),
    mapped[0],
    "Passenger lookup should match exact names case-insensitively.",
  );
  assert.equal(
    findCustomerBookingMemorySuggestion(mapped, "Boss"),
    undefined,
    "Passenger lookup should not partial-match and fill the wrong traveler.",
  );

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

  let blockedJsonWasRead = false;
  const blockedFetchCalls = [];
  const blockedLoad = await loadCustomerBookingMemorySuggestions({
    fetcher: async (url, init) => {
      blockedFetchCalls.push({ init, url });

      return {
        json: async () => {
          blockedJsonWasRead = true;

          throw new Error("blocked JSON should not be read");
        },
        ok: false,
        status: 403,
      };
    },
  });

  assert.equal(blockedLoad, null, "Blocked customer booking memory reads should fail closed.");
  assert.equal(blockedJsonWasRead, false, "Blocked customer booking memory reads should not parse body text.");
  assert.equal(blockedFetchCalls.length, 1, "Blocked customer booking memory reads should use one quiet request.");
  assert.deepEqual(blockedFetchCalls[0].init.headers, {
    "x-prestige-customer-purpose": "customer-booking-memory-read",
  });

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

  assert.deepEqual(
    applyCustomerBookingMemoryToRequestForm({
      form: {
        dropoffLocation: "",
        passengerName: "",
        pickupDate: "2026-06-22",
        pickupLocation: "",
        pickupTime: "09:30",
        serviceType: "Other / To Confirm",
        vehicleType: "Alphard / Vellfire",
      },
      serviceOptions: ["Airport Arrival", "Other / To Confirm"],
      suggestion: {
        dropoffLocation: "Safe Dropoff",
        passengerName: "Boss C",
        pickupLocation: "Safe Pickup",
        serviceType: "Unknown Private Service",
        vehicleType: "Unknown Private Vehicle",
      },
      vehicleOptions: ["Alphard / Vellfire"],
    }),
    {
      dropoffLocation: "Safe Dropoff",
      passengerName: "Boss C",
      pickupDate: "2026-06-22",
      pickupLocation: "Safe Pickup",
      pickupTime: "09:30",
      serviceType: "Other / To Confirm",
      vehicleType: "Alphard / Vellfire",
    },
    "Unsupported saved service/vehicle values should not replace customer-safe form choices.",
  );
} finally {
  await harness.cleanup();
}

console.log("Customer booking memory UI contract tests passed.");
