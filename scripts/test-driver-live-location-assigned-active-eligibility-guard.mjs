import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const guardScript =
  "scripts/test-driver-live-location-assigned-active-eligibility-guard.mjs";
const runtimeHelperPath = "lib/driver-live-location-runtime.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const agentsPath = "AGENTS.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const bookingReference = "CUST-ASSIGNED-ACTIVE-GUARD";
const token = "assigned-active-eligibility-token";

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

async function loadRuntimeHarness() {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "prestige-live-location-assigned-active-"),
  );
  const files = [
    "lib/driver-job-link.ts",
    "lib/driver-job-status-workflow.ts",
    "lib/driver-live-location-scaffold.ts",
    runtimeHelperPath,
  ];

  await Promise.all([
    mkdir(path.join(tempDir, "lib"), { recursive: true }),
    mkdir(path.join(tempDir, "node_modules", "server-only"), { recursive: true }),
    mkdir(path.join(tempDir, "node_modules", "@supabase", "supabase-js"), {
      recursive: true,
    }),
  ]);
  await Promise.all([
    writeFile(
      path.join(tempDir, "node_modules", "server-only", "index.js"),
      "module.exports = {};\n",
    ),
    writeFile(
      path.join(tempDir, "node_modules", "@supabase", "supabase-js", "index.js"),
      "exports.createClient = () => { throw new Error('Unexpected live client creation'); };\n",
    ),
    ...files.map(async (file) => {
      const output = path.join(tempDir, file.replace(/\.ts$/, ".js"));
      const compiled = transpile(await readFile(file, "utf8")).replaceAll(
        'require("./driver-job-status-workflow.ts")',
        'require("./driver-job-status-workflow.js")',
      );
      await writeFile(output, compiled);
    }),
  ]);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    runtime: createRequire(import.meta.url)(
      path.join(tempDir, runtimeHelperPath.replace(/\.ts$/, ".js")),
    ),
  };
}

function createRuntimeClient(booking) {
  const state = {
    audits: [],
    booking,
    deletes: 0,
    upserts: [],
  };
  const link = {
    booking_reference: bookingReference,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    id: "11111111-1111-4111-8111-111111111111",
    link_status: "active",
    revoked_at: null,
    safe_link_context: {
      driver_job_payload: {
        assigned_driver_name: "Me",
        pickup_datetime: "2026-07-18T11:00:00+08:00",
        route: "Pickup > Dropoff",
        status: "admin_review_required",
      },
    },
  };

  function queryFor(table) {
    return {
      delete() {
        return {
          async eq() {
            state.deletes += 1;
            return { error: null };
          },
        };
      },
      eq() {
        return this;
      },
      async insert(payload) {
        state.audits.push(payload);
        return { error: null };
      },
      async maybeSingle() {
        if (table === "driver_job_links") {
          return { data: link, error: null };
        }

        if (table === "bookings") {
          return { data: state.booking, error: null };
        }

        if (table === "driver_live_location_latest_positions") {
          return { data: null, error: null };
        }

        return { data: null, error: new Error(`Unexpected table read: ${table}`) };
      },
      select() {
        return this;
      },
      async upsert(payload) {
        state.upserts.push(payload);
        return { error: null };
      },
    };
  }

  return {
    client: {
      from(table) {
        return queryFor(table);
      },
    },
    state,
  };
}

function runtimeEnv() {
  return {
    PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED: "true",
    PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES: bookingReference,
    PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED: "true",
    PRESTIGE_DRIVER_LIVE_LOCATION_MODE: "evidence",
    PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE:
      "ASSIGNED-ACTIVE-ELIGIBILITY-GUARD",
  };
}

function shareRequest() {
  return new Request("https://app.prestigelimo.sg/api/driver-job/token/live-location", {
    body: JSON.stringify({
      accuracy_meters: 8,
      captured_at: new Date().toISOString(),
      heading_degrees: 90,
      latitude: 1.2948,
      longitude: 103.8545,
      speed_meters_per_second: 0,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

const harness = await loadRuntimeHarness();

try {
  assert.equal(
    typeof harness.runtime.partitionAdminLiveLocationRowsForRetention,
    "function",
    "Admin map runtime must expose the bounded retention partition for executable guard coverage.",
  );

  const retentionNowMs = Date.parse("2026-07-20T12:00:00.000Z");
  const activeBooking = {
    admin_internal_status: "admin_review_required",
    booking_reference: bookingReference,
    cancellation_review_status: null,
    customer_facing_status: "confirmed",
    driver_id: 7,
    driver_name: "Me",
    status: "admin_review_required",
  };
  const locationRow = (updatedAt) => ({
    booking_reference: bookingReference,
    driver_job_link_id: "11111111-1111-4111-8111-111111111111",
    latitude: 1.361,
    longitude: 103.886,
    sharing_state: "active",
    stale_after: "2026-07-20T09:05:00.000Z",
    updated_at: updatedAt,
  });

  const retainedStalePin = harness.runtime.partitionAdminLiveLocationRowsForRetention({
    bookings: [activeBooking],
    nowMs: retentionNowMs,
    retentionMinutes: 120,
    rows: [locationRow("2026-07-20T10:30:00.000Z")],
  });
  assert.equal(retainedStalePin.visibleRows.length, 1);
  assert.equal(retainedStalePin.cleanupTargets.length, 0);

  const expiredPin = harness.runtime.partitionAdminLiveLocationRowsForRetention({
    bookings: [activeBooking],
    nowMs: retentionNowMs,
    retentionMinutes: 120,
    rows: [locationRow("2026-07-20T09:59:59.000Z")],
  });
  assert.equal(expiredPin.visibleRows.length, 0);
  assert.deepEqual(expiredPin.cleanupTargets, [
    {
      bookingReference,
      driverJobLinkId: "11111111-1111-4111-8111-111111111111",
      updatedAt: "2026-07-20T09:59:59.000Z",
    },
  ]);

  const orphanPin = harness.runtime.partitionAdminLiveLocationRowsForRetention({
    bookings: [],
    nowMs: retentionNowMs,
    retentionMinutes: 120,
    rows: [locationRow("2026-07-20T11:59:00.000Z")],
  });
  assert.equal(orphanPin.visibleRows.length, 0);
  assert.equal(orphanPin.cleanupTargets.length, 1);

  const terminalPin = harness.runtime.partitionAdminLiveLocationRowsForRetention({
    bookings: [{ ...activeBooking, admin_internal_status: "completed" }],
    nowMs: retentionNowMs,
    retentionMinutes: 120,
    rows: [locationRow("2026-07-20T11:59:00.000Z")],
  });
  assert.equal(terminalPin.visibleRows.length, 0);
  assert.equal(terminalPin.cleanupTargets.length, 1);

  const unassigned = createRuntimeClient({
    admin_internal_status: "admin_review_required",
    booking_reference: bookingReference,
    cancellation_review_status: null,
    customer_facing_status: "confirmed",
    driver_id: null,
    driver_name: "Driver TBC",
    status: "admin_review_required",
  });
  harness.runtime.setDriverLiveLocationRuntimeClientForTests(unassigned.client);

  const unassignedReadiness =
    await harness.runtime.handleDriverLiveLocationReadinessRuntimeRequest({
      env: runtimeEnv(),
      token,
    });
  assert.equal(unassignedReadiness.status, 403);
  assert.equal(
    unassignedReadiness.body.reason,
    "driver_live_location_job_not_assigned_active",
  );

  const unassignedShare = await harness.runtime.handleDriverLiveLocationRuntimeRequest({
    action: "share",
    env: runtimeEnv(),
    request: shareRequest(),
    token,
  });
  assert.equal(unassignedShare.status, 403);
  assert.equal(unassignedShare.body.reason, "driver_live_location_job_not_assigned_active");
  assert.equal(unassigned.state.upserts.length, 0);
  assert.equal(unassigned.state.audits.length, 0);

  const assigned = createRuntimeClient({
    admin_internal_status: "admin_review_required",
    booking_reference: bookingReference,
    cancellation_review_status: null,
    customer_facing_status: "confirmed",
    driver_id: null,
    driver_name: "Me",
    status: "admin_review_required",
  });
  harness.runtime.setDriverLiveLocationRuntimeClientForTests(assigned.client);

  const assignedReadiness =
    await harness.runtime.handleDriverLiveLocationReadinessRuntimeRequest({
      env: runtimeEnv(),
      token,
    });
  assert.equal(assignedReadiness.status, 200);

  const assignedShare = await harness.runtime.handleDriverLiveLocationRuntimeRequest({
    action: "share",
    env: runtimeEnv(),
    request: shareRequest(),
    token,
  });
  assert.equal(assignedShare.status, 200);
  assert.equal(assigned.state.upserts.length, 1);
  assert.equal(assigned.state.audits.length, 1);

  const terminal = createRuntimeClient({
    admin_internal_status: "completed",
    booking_reference: bookingReference,
    cancellation_review_status: null,
    customer_facing_status: "completed",
    driver_id: 7,
    driver_name: "Me",
    status: "completed",
  });
  harness.runtime.setDriverLiveLocationRuntimeClientForTests(terminal.client);

  const terminalShare = await harness.runtime.handleDriverLiveLocationRuntimeRequest({
    action: "share",
    env: runtimeEnv(),
    request: shareRequest(),
    token,
  });
  assert.equal(terminalShare.status, 403);
  assert.equal(terminalShare.body.reason, "driver_live_location_job_not_assigned_active");
  assert.equal(terminal.state.upserts.length, 0);

  harness.runtime.setDriverLiveLocationRuntimeClientForTests(unassigned.client);
  const unassignedStop = await harness.runtime.handleDriverLiveLocationRuntimeRequest({
    action: "stop",
    env: runtimeEnv(),
    request: new Request(
      "https://app.prestigelimo.sg/api/driver-job/token/live-location",
      { method: "DELETE" },
    ),
    token,
  });
  assert.equal(unassignedStop.status, 200);
  assert.equal(unassigned.state.deletes, 1);
  assert.equal(unassigned.state.audits.at(-1)?.event_type, "share_stopped");

  const [runtimeSource, ledger, agents, preactivationSuite] = await Promise.all([
    readFile(runtimeHelperPath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(agentsPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);
  assert.equal(runtimeSource.includes("driver_live_location_job_not_assigned_active"), true);
  assert.equal(runtimeSource.includes('const bookingsTable = "bookings"'), true);
  assert.equal(runtimeSource.includes("readDriverAssignedActiveEligibility"), true);
  assert.equal(runtimeSource.includes("partitionAdminLiveLocationRowsForRetention"), true);
  assert.equal(runtimeSource.includes("retained.cleanupTargets"), true);
  assert.equal(runtimeSource.includes('.from(latestPositionsTable)\n      .delete()'), true);
  assert.equal(runtimeSource.includes('eventType: "position_expired"'), true);
  assert.equal(
    runtimeSource.includes('.from("driver_job_status_events").delete()'),
    false,
    "Expired GPS cleanup must never delete Driver Reports timestamp evidence.",
  );
  assert.equal(
    ledger.includes("### Driver Live Location Assigned-Active Eligibility Repair"),
    true,
  );
  assert.equal(
    ledger.includes("### Live Dispatch Expired Pin Cleanup With Driver Reports Preservation (2026-07-20)"),
    true,
  );
  assert.equal(
    ledger.includes("It does not delete or update the booking, driver assignment, Driver Job Link, `driver_job_status_events`, OTW/OTS/POB/Job Completed timestamps, Driver Reports card"),
    true,
  );
  assert.equal(
    agents.includes("# Owner-locked Driver Reports evidence during Live Location cleanup"),
    true,
  );
  assert.equal(
    agents.includes("It must never delete or alter `driver_job_status_events`, OTW/OTS/POB/Job Completed timestamps, the visible Driver Reports card"),
    true,
  );
  assert.equal(preactivationSuite.includes(guardScript), true);
} finally {
  harness.runtime.setDriverLiveLocationRuntimeClientForTests(null);
  await harness.cleanup();
}

console.log("Driver live-location assigned-active eligibility guard passed");
