import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const adapterPath = "lib/customer-portal-driver-tracking-adapter.ts";

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-tracking-"));
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

const harness = await loadAdapterHarness();

try {
  const {
    customerPortalDriverTrackingApiPath,
    loadCustomerPortalDriverTracking,
    mapCustomerPortalDriverTrackingPayload,
  } = harness.adapter;

  assert.equal(customerPortalDriverTrackingApiPath, "/api/customer-live-location-map");

  assert.deepEqual(
    mapCustomerPortalDriverTrackingPayload({
      active_driver_marker: {
        accuracy_meters: 18.4,
        latitude: 1.3521,
        longitude: 103.8198,
        updated_at: "2026-07-05T10:30:00.000Z",
      },
      customerVisible: true,
      marker_count: 1,
      ok: true,
    }),
    {
      accuracyLabel: "Accuracy 18m",
      mapEmbedUrl: "https://www.google.com/maps?q=1.3521,103.8198&z=16&output=embed",
      mapUrl: "https://www.google.com/maps/search/?api=1&query=1.3521,103.8198",
      message: "Driver location is available now.",
      status: "available",
      updatedAt: "2026-07-05T10:30:00.000Z",
    },
    "Customer-visible bounded coordinates should become safe in-app and fallback map URLs.",
  );

  assert.deepEqual(
    mapCustomerPortalDriverTrackingPayload({
      active_driver_marker: {
        latitude: 91,
        longitude: 103.8198,
      },
      customerVisible: true,
      marker_count: 1,
      ok: true,
    }),
    {
      message: "Driver location is not ready yet.",
      status: "not_ready",
    },
    "Out-of-range coordinates should not produce a map URL.",
  );

  assert.deepEqual(
    mapCustomerPortalDriverTrackingPayload({
      customerVisible: true,
      marker_count: 0,
      ok: true,
      reason: "customer_live_location_map_no_active_position",
    }),
    {
      message: "Driver has not shared an active location yet.",
      status: "not_ready",
    },
    "Customer-visible reads without an active marker should stay not-ready.",
  );

  assert.deepEqual(
    mapCustomerPortalDriverTrackingPayload({
      customerVisible: false,
      ok: false,
    }),
    {
      message: "Live location is available only after driver OTW and admin approval.",
      status: "blocked",
    },
    "Closed customer visibility should stay blocked.",
  );

  let fetchCall = null;
  const loaded = await loadCustomerPortalDriverTracking({
    bookingReference: "ADM-TRACK-001",
    fetcher: async (url, init) => {
      fetchCall = { init, url };

      return {
        json: async () => ({
          active_driver_marker: {
            latitude: "1.3",
            longitude: "103.8",
          },
          customerVisible: true,
          marker_count: "1",
          ok: true,
        }),
        ok: true,
      };
    },
  });

  assert.equal(loaded.status, "available");
  assert.equal(String(fetchCall.url), "/api/customer-live-location-map?booking_reference=ADM-TRACK-001");
  assert.equal(fetchCall.init.cache, "no-store");
  assert.equal(fetchCall.init.credentials, "same-origin");
  assert.deepEqual(fetchCall.init.headers, {
    "x-prestige-customer-purpose": "customer-live-location-map-read",
  });

  let invalidFetchCalled = false;
  const invalid = await loadCustomerPortalDriverTracking({
    bookingReference: "driver_token",
    fetcher: async () => {
      invalidFetchCalled = true;
      throw new Error("should not fetch invalid booking references");
    },
  });

  assert.deepEqual(invalid, {
    message: "Live location is not available for this booking.",
    status: "blocked",
  });
  assert.equal(invalidFetchCalled, false);
} finally {
  await harness.cleanup();
}

console.log("Customer portal driver tracking adapter contract passed.");
