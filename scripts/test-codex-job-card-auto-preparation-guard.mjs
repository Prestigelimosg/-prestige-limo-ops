import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/codex-job-card-auto-preparation.ts";
const automationPath = "lib/admin-automation-runtime-control.ts";
const workflowPath = "lib/admin-booking-workflow-status-persistence.ts";
const adapterPath = "lib/admin-booking-supabase-adapter.ts";
const newBookingRoutePath = "app/api/customer-booking-requests/route.ts";
const changeRequestRoutePath = "app/api/customer-booking-change-requests/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-codex-job-card-auto-preparation-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must not match ${pattern}.`);
}

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

async function loadHelperHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-codex-job-card-auto-preparation-"));
  const sourcePath = path.join(process.cwd(), helperPath);
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const automationStubPath = path.join(tempDir, automationPath.replace(/\.ts$/, ".js"));
  const workflowStubPath = path.join(tempDir, workflowPath.replace(/\.ts$/, ".js"));
  const adapterStubPath = path.join(tempDir, adapterPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(outputPath, transpileTypescript(await readFile(sourcePath, "utf8"), sourcePath));
  await writeFile(
    automationStubPath,
    [
      "async function readAdminAutomationRuntimeControl() {",
      "  const state = globalThis.__prestigeCodexJobCardAutoPreparationMock;",
      "  state.runtimeReadCount += 1;",
      "  return state.runtimeResult;",
      "}",
      "module.exports = { readAdminAutomationRuntimeControl };",
    ].join("\n"),
  );
  await writeFile(
    workflowStubPath,
    [
      "async function saveAdminBookingWorkflowStatus(input, actor) {",
      "  const state = globalThis.__prestigeCodexJobCardAutoPreparationMock;",
      "  state.saveCalls.push({ actor, input });",
      "  return state.saveResult;",
      "}",
      "module.exports = { saveAdminBookingWorkflowStatus };",
    ].join("\n"),
  );
  await writeFile(
    adapterStubPath,
    [
      "module.exports = {",
      "  codexJobCardAutomationPersistenceAdapterActor: {",
      "    actor_label: 'Codex job-card automation',",
      "    actor_role: 'system',",
      "    boundary_mode: 'codex-job-card-automation-surface',",
      "    source_surface: 'system',",
      "  },",
      "};",
    ].join("\n"),
  );

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(outputPath)(outputPath),
  };
}

function installMock(overrides = {}) {
  const state = {
    runtimeReadCount: 0,
    runtimeResult: {
      automation_enabled: true,
      ok: true,
      reason: "runtime_active",
      runtime_status: "active",
    },
    saveCalls: [],
    saveResult: {
      data: {
        booking_reference: "CUST-AUTO-001",
        status_value: "ready",
        workflow_area: "admin_booking_review",
      },
      ok: true,
    },
    ...overrides,
  };

  globalThis.__prestigeCodexJobCardAutoPreparationMock = state;
  return state;
}

const [helper, automation, workflow, adapter, newBookingRoute, changeRequestRoute, ledger, suite] =
  await Promise.all(
    [
      helperPath,
      automationPath,
      workflowPath,
      adapterPath,
      newBookingRoutePath,
      changeRequestRoutePath,
      ledgerPath,
      suitePath,
    ].map((file) => readFile(file, "utf8")),
  );

for (const fragment of [
  'import "server-only"',
  "readAdminAutomationRuntimeControl",
  "saveAdminBookingWorkflowStatus",
  "codexJobCardAutomationPersistenceAdapterActor",
  "prepareCodexJobCardForAdminReview",
  'workflow_area: "admin_booking_review"',
  "calendar_auto_write_enabled: false",
  "external_send: false",
  "customerVisible: false",
]) {
  assertIncludes(helper, fragment, `auto-preparation helper ${fragment}`);
}
assertIncludes(
  automation,
  "readAdminAutomationRuntimeControl",
  "existing master Automation read boundary",
);

assertExcludes(
  helper,
  /customer_price|driver_payout|paynow|invoice|payment|billing|finance|parser_debug|raw_ai|mock_archive|internal_admin_note|provider_send/i,
  "auto-preparation helper private or external fields",
);

for (const fragment of [
  'boundary_mode: "codex-job-card-automation-surface"',
  'source_surface: "system"',
  'actor_role: "system"',
  'actor_label: "Codex job-card automation"',
]) {
  assertIncludes(adapter, fragment, `exact automation actor ${fragment}`);
}

assertIncludes(workflow, "isVerifiedCodexJobCardAutomationActor", "exact automation actor verifier");
for (const fragment of [
  'actor?.actor_label === "Codex job-card automation"',
  'actor.actor_role === "system"',
  'actor.boundary_mode === "codex-job-card-automation-surface"',
  'actor.source_surface === "system"',
]) {
  assertIncludes(workflow, fragment, `workflow actor boundary ${fragment}`);
}
assertIncludes(workflow, "actor.source_surface", "workflow source surface persistence");

for (const fragment of [
  'import { prepareCodexJobCardForAdminReview } from "../../../lib/codex-job-card-auto-preparation"',
  "prepareSavedCustomerBookingRequestJobCards",
  'event: "new_booking"',
  "savedRequests.map",
  "savedRequest.booking_reference?.trim()",
]) {
  assertIncludes(newBookingRoute, fragment, `new booking auto-preparation wiring ${fragment}`);
}

for (const fragment of [
  'import { prepareCodexJobCardForAdminReview } from "../../../lib/codex-job-card-auto-preparation"',
  "prepareCustomerBookingChangeJobCardReview",
  "event: parsed.request_kind",
]) {
  assertIncludes(changeRequestRoute, fragment, `change request auto-preparation wiring ${fragment}`);
}

for (const route of [newBookingRoute, changeRequestRoute]) {
  const customerSuccessResponse = route.slice(route.lastIndexOf("return Response.json({"));
  assertExcludes(
    customerSuccessResponse,
    /automation|workflow_status|internal|codex/i,
    "customer response must not expose auto-preparation internals",
  );
}

assertIncludes(suite, guardPath, "preactivation auto-preparation guard registration");
for (const phrase of [
  "### Automatic Codex Job-Card Preparation",
  "Automation OFF performs no job-card workflow-status write",
  "new saved customer requests upsert one admin-only `Ready for Admin Review` workflow status per exact booking reference",
  "Amendment and cancellation requests upsert the same exact booking-reference workflow row as review-required rather than creating a duplicate queue",
  "No calendar write, invoice, payment, payout, customer/driver message, provider send, environment change, migration, deployment, or Git push is included",
  "The route now skips preparation when the exact persisted reference is absent instead of deriving or guessing one",
  "Both browser suites reported zero test errors and zero console errors; lint remains at 160 existing warnings and zero errors.",
  "The first app-smoke attempt stopped at `ERR_CONNECTION_REFUSED` because no local server was running",
  "one existing bundled `supabaseUrl is required` diagnostic",
  "### Automatic Codex Job-Card Preparation Connected Chrome Runtime Evidence",
  "Automation OFF and exactly two existing `Ready for Admin Review` cards",
  "Two initial form submissions were stopped by client validation before the booking API",
  "Chrome's native input setters plus bubbling `input`/`change` events were used only to commit the date and terms checkbox",
  "Dashboard then changed from two to exactly three prepared cards",
  "exactly one `admin_booking_review` row with status `ready`, source/role `system`, and actor `Codex job-card automation`",
  "Calendar/Google Calendar, invoice, and payment identifiers remained null",
  "one queued internal `admin_app` notification",
  "zero remaining rows for every exact test artifact and zero active Automation settings",
  "A final visible Chrome refresh returned to Automation OFF, exactly two original prepared cards, and no test passenger card",
  "repeated HTTP 503 responses from `/api/admin-load-bookings-typed-read?limit=25`",
  "the temporary local server was stopped",
]) {
  assertIncludes(ledger, phrase, `auto-preparation ledger ${phrase}`);
}

const harness = await loadHelperHarness();

try {
  const closedMock = installMock({
    runtimeResult: {
      automation_enabled: false,
      ok: true,
      reason: "runtime_closed",
      runtime_status: "closed",
    },
  });
  const closed = await harness.helper.prepareCodexJobCardForAdminReview({
    bookingReference: "CUST-AUTO-CLOSED",
    event: "new_booking",
  });
  assert.equal(closed.prepared, false);
  assert.equal(closed.reason, "runtime_closed");
  assert.equal(closed.calendar_auto_write_enabled, false);
  assert.equal(closed.external_send, false);
  assert.equal(closedMock.saveCalls.length, 0);

  const newBookingMock = installMock();
  const prepared = await harness.helper.prepareCodexJobCardForAdminReview({
    bookingReference: "CUST-AUTO-001",
    event: "new_booking",
  });
  assert.equal(prepared.prepared, true);
  assert.equal(prepared.status, "ready");
  assert.deepEqual(newBookingMock.saveCalls[0].input, {
    booking_reference: "CUST-AUTO-001",
    safe_status_context: {
      next_action: "Admin review required before any calendar action.",
    },
    status_label: "Ready for Admin Review",
    status_value: "ready",
    workflow_area: "admin_booking_review",
  });
  assert.deepEqual(newBookingMock.saveCalls[0].actor, {
    actor_label: "Codex job-card automation",
    actor_role: "system",
    boundary_mode: "codex-job-card-automation-surface",
    source_surface: "system",
  });

  for (const [event, label] of [
    ["amendment", "Amendment Review Required"],
    ["cancellation", "Cancellation Review Required"],
  ]) {
    const eventMock = installMock();
    const result = await harness.helper.prepareCodexJobCardForAdminReview({
      bookingReference: "CUST-AUTO-001",
      event,
    });
    assert.equal(result.prepared, true);
    assert.equal(result.status, "needs_review");
    assert.equal(eventMock.saveCalls[0].input.status_label, label);
    assert.equal(eventMock.saveCalls[0].input.status_value, "needs_review");
    assert.equal(eventMock.saveCalls[0].input.booking_reference, "CUST-AUTO-001");
  }

  const invalidMock = installMock();
  const invalid = await harness.helper.prepareCodexJobCardForAdminReview({
    bookingReference: "unsafe reference with spaces",
    event: "new_booking",
  });
  assert.equal(invalid.prepared, false);
  assert.equal(invalid.reason, "invalid_booking_reference");
  assert.equal(invalidMock.runtimeReadCount, 0);
  assert.equal(invalidMock.saveCalls.length, 0);

  const failedWriteMock = installMock({
    saveResult: { error: "private database failure", ok: false, status: 500 },
  });
  const failedWrite = await harness.helper.prepareCodexJobCardForAdminReview({
    bookingReference: "CUST-AUTO-FAIL",
    event: "new_booking",
  });
  assert.equal(failedWrite.prepared, false);
  assert.equal(failedWrite.reason, "workflow_status_write_failed");
  assert.equal(JSON.stringify(failedWrite).includes("private database failure"), false);
  assert.equal(failedWriteMock.saveCalls.length, 1);
} finally {
  delete globalThis.__prestigeCodexJobCardAutoPreparationMock;
  await harness.cleanup();
}

console.log("Codex job-card automatic preparation guard passed.");
