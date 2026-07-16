import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/codex-calendar-conflict.ts";
const policyPath = "lib/admin-booking-calendar-policy.ts";
const calendarEventPath = "lib/admin-booking-calendar-event.ts";
const appPath = "app/page.tsx";
const browserPath = "scripts/test-booking-ui-browser.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardPath = "scripts/test-codex-calendar-conflict-detection-guard.mjs";

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

async function loadHelperHarness(helperSource, policySource) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-codex-calendar-conflict-"));
  const helperOutputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const policyOutputPath = path.join(tempDir, policyPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(helperOutputPath), { recursive: true });
  await writeFile(helperOutputPath, transpileTypescript(helperSource, helperPath));
  await writeFile(policyOutputPath, transpileTypescript(policySource, policyPath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(helperOutputPath)(helperOutputPath),
  };
}

function booking(overrides = {}) {
  return {
    active: true,
    driverName: "Driver One",
    identity: "BOOKING-1",
    pickupTimeMs: Date.parse("2026-07-15T02:00:00.000Z"),
    vehiclePlate: "SLA1234A",
    ...overrides,
  };
}

const [helperSource, policySource, calendarEventSource, appSource, browser, ledger, suite] =
  await Promise.all(
    [helperPath, policyPath, calendarEventPath, appPath, browserPath, ledgerPath, suitePath].map((filePath) =>
      readFile(filePath, "utf8"),
    ),
  );

assert.match(policySource, /adminBookingCalendarDefaultDurationMinutes\s*=\s*90/);
assert.match(calendarEventSource, /adminBookingCalendarDefaultDurationMinutes/);
assert.doesNotMatch(calendarEventSource, /const defaultDurationMinutes\s*=\s*90/);
assert.doesNotMatch(helperSource, /\b(?:fetch|insert|update|delete)\s*\(|supabase/i);

const harness = await loadHelperHarness(helperSource, policySource);

try {
  const { evaluateCodexCalendarConflict } = harness.helper;
  const candidate = booking();

  const sameDriverConflict = evaluateCodexCalendarConflict(candidate, [
    candidate,
    booking({
      identity: "BOOKING-2",
      pickupTimeMs: candidate.pickupTimeMs + 30 * 60 * 1000,
      vehiclePlate: "DIFFERENT",
    }),
  ]);
  assert.equal(sameDriverConflict.status, "conflict");
  assert.equal(sameDriverConflict.matchedResource, "driver");
  assert.equal(sameDriverConflict.conflictCount, 1);

  const sameVehicleConflict = evaluateCodexCalendarConflict(candidate, [
    booking({
      driverName: "Driver Two",
      identity: "BOOKING-3",
      pickupTimeMs: candidate.pickupTimeMs + 60 * 60 * 1000,
      vehiclePlate: " sla 1234 a ",
    }),
  ]);
  assert.equal(sameVehicleConflict.status, "conflict");
  assert.equal(sameVehicleConflict.matchedResource, "vehicle");

  const differentResources = evaluateCodexCalendarConflict(candidate, [
    booking({
      driverName: "Driver Two",
      identity: "BOOKING-4",
      pickupTimeMs: candidate.pickupTimeMs + 15 * 60 * 1000,
      vehiclePlate: "SLA9999Z",
    }),
  ]);
  assert.equal(differentResources.status, "no-conflict");

  const boundaryDoesNotOverlap = evaluateCodexCalendarConflict(candidate, [
    booking({
      identity: "BOOKING-5",
      pickupTimeMs: candidate.pickupTimeMs + 90 * 60 * 1000,
    }),
  ]);
  assert.equal(boundaryDoesNotOverlap.status, "no-conflict");

  const inactiveAndSelfAreExcluded = evaluateCodexCalendarConflict(candidate, [
    candidate,
    booking({
      active: false,
      identity: "BOOKING-6",
      pickupTimeMs: candidate.pickupTimeMs + 30 * 60 * 1000,
    }),
  ]);
  assert.equal(inactiveAndSelfAreExcluded.status, "no-conflict");

  assert.equal(
    evaluateCodexCalendarConflict(
      booking({ driverName: "Driver TBC", vehiclePlate: "TBC" }),
      [],
    ).status,
    "assignment-incomplete",
  );
  assert.equal(
    evaluateCodexCalendarConflict(booking({ pickupTimeMs: null }), []).status,
    "timing-incomplete",
  );
} finally {
  await harness.cleanup();
}

assert.match(appSource, /evaluateCodexCalendarConflict/);
assert.match(appSource, /bookingRecordCalendarConflictPickupDateTimeMs/);
assert.match(
  appSource,
  /clean\(bookingRecord\.pickup_at\) \|\| clean\(bookingRecord\.pickup_datetime\)/,
);
const conflictPickupFunctionStart = appSource.indexOf(
  "function bookingRecordCalendarConflictPickupDateTimeMs",
);
const conflictPickupFunctionEnd = appSource.indexOf("\n}\n", conflictPickupFunctionStart) + 3;
const conflictPickupFunction = appSource.slice(
  conflictPickupFunctionStart,
  conflictPickupFunctionEnd,
);
assert.doesNotMatch(conflictPickupFunction, /getBookingDateKey|job_card|created_at/);
assert.match(appSource, /data-codex-calendar-conflict-status/);
assert.match(appSource, /adminAutomationRuntimeEnabled/);
assert.match(appSource, /operationalBookings\.map/);
assert.match(appSource, /Loaded Prestige saved jobs only/);
assert.match(browser, /Codex calendar conflict browser state/);
assert.match(browser, /data-codex-calendar-conflict-state/);
assert.match(browser, /Expected Automation OFF to remove every per-card conflict result/);
assert.match(ledger, /Codex Prepared Job-Card Calendar Conflict Check/);
assert.match(ledger, /Codex Calendar Conflict Production Runtime Evidence/);
for (const fragment of [
  "use controlled test data in the established Dashboard",
  "make no Google Calendar write",
  "Connected Chrome confirmed exact Production build `d7f6aff9`",
  "Automation already ON, Push alerts OFF, `Conflict check ON`, and zero prepared cards",
  "Automation was not toggled during the test",
  "every original 11:00 assignment field plus its original `updated_at` timestamp was restored",
  "one minimal database-only test booking `CODEX-CONFLICT-20260715-01`",
  "no customer, company, PA/booker, traveler, phone, email, route child, notification, invoice, payment, calendar, or provider link",
  "inside the established 90-minute window",
  "exact result `Calendar conflict (1)`",
  "1 overlapping loaded Prestige saved job uses the same driver or vehicle.",
  "No review, approval, decline, Return to Codex, calendar, map, message, invoice, payment, payout, or provider action was pressed.",
  "zero matching booking, workflow, route-point, and notification rows",
  "Final visible refresh returned to 68 saved bookings, zero prepared cards, `Conflict check ON`, Automation ON, Push alerts OFF, and zero Chrome errors.",
  "unverified Automation column `setting_key`",
  "Neither query contained a write.",
  "no duplicate lane or guard was added",
]) {
  assert.equal(
    ledger.includes(fragment),
    true,
    `Calendar conflict Production evidence missing ${fragment}.`,
  );
}
assert.equal(suite.includes(guardPath), true);

console.log("Codex calendar conflict detection guard passed.");
