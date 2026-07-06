import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const adapterPath = "lib/customer-portal-trip-updates-adapter.ts";

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-trip-updates-"));
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
  const { mapCustomerPortalTripUpdatesPayload } = harness.adapter;

  const mapped = mapCustomerPortalTripUpdatesPayload({
    delivery_surface: "customer_app",
    external_send: false,
    notifications: [
      {
        booking_reference: "ADM-TRACK-001",
        created_at: "2026-07-06T11:57:41.758155+00:00",
        delivery_surface: "customer_app",
        notification_status: "queued",
        notification_type: "driver_status",
        priority: "normal",
        safe_context: {},
        safe_message: "Your Prestige Limo driver is on the way to pickup.",
        safe_title: "Driver on the way",
        updated_at: "2026-07-06T11:57:41.758155+00:00",
        workflow_area: "dispatch",
      },
    ],
    ok: true,
    provider_send: false,
  });

  assert.equal(mapped.status, "ready");
  assert.equal(mapped.updates.length, 1);
  assert.equal(mapped.updates[0].createdAt, "06 Jul 2026, 19:57 SGT");
  assert.equal(
    mapped.updates[0].createdAt.includes("+00:00"),
    false,
    "Customer trip update timestamps must not expose raw UTC offsets.",
  );
} finally {
  await harness.cleanup();
}

console.log("Customer portal trip updates adapter contract passed.");
