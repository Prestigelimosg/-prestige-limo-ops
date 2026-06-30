import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const appPagePath = "app/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-operational-snapshot-apply-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end);
}

function clean(value) {
  return String(value ?? "").trim();
}

function loadTimestampHelpers(appPage) {
  const helperSource = [
    sectionBetween(
      appPage,
      "function singaporePickupDateTimePartsFromTimestamp",
      "function formatPickupTimeFromTimestamp",
    ),
    sectionBetween(
      appPage,
      "function formatPickupTimeFromTimestamp",
      "function formatPickupTimeFromRecord",
    ),
    sectionBetween(
      appPage,
      "function adminSnapshotPickupDateTimeParts",
      "function adminSnapshotSortedRoutePoints",
    ),
    "return { adminSnapshotPickupDateTimeParts, formatPickupTimeFromTimestamp, singaporePickupDateTimePartsFromTimestamp };",
  ].join("\n\n");
  const compiled = ts.transpileModule(helperSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return new Function("clean", compiled)(clean);
}

const [appPage, preactivationSuite] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const timestampHelperBlock = sectionBetween(
  appPage,
  "function singaporePickupDateTimePartsFromTimestamp",
  "function formatPickupTimeFromTimestamp",
);
const snapshotPartsBlock = sectionBetween(
  appPage,
  "function adminSnapshotPickupDateTimeParts",
  "function adminSnapshotSortedRoutePoints",
);
const applySnapshotBlock = sectionBetween(
  appPage,
  "function adminOperationalSnapshotToBookingForm",
  "function customerLiveLocationState",
);

for (const fragment of [
  "timeZone: \"Asia/Singapore\"",
  "localDateTimeMatch",
  "new Date(rawValue)",
]) {
  assertIncludes(timestampHelperBlock, fragment, `timestamp helper fragment ${fragment}`);
}

assertIncludes(
  snapshotPartsBlock,
  "return singaporePickupDateTimePartsFromTimestamp(value);",
  "snapshot apply pickup time parser must reuse Singapore timestamp helper",
);

for (const fragment of [
  "booker: clean(record.contact_display_name) || customerDisplayName,",
  "flight: clean(record.flight_no) || adminSnapshotFlightReference(record),",
  "driverContact: clean(record.driver_contact),",
  "driverName: clean(record.driver_name),",
  "driverPlate: clean(record.driver_plate_number),",
]) {
  assertIncludes(applySnapshotBlock, fragment, `operational snapshot apply fragment ${fragment}`);
}

const {
  adminSnapshotPickupDateTimeParts,
  formatPickupTimeFromTimestamp,
  singaporePickupDateTimePartsFromTimestamp,
} = loadTimestampHelpers(appPage);

for (const [input, expected] of [
  ["2026-07-03T03:00:00+00:00", { date: "2026-07-03", time: "1100" }],
  ["2026-07-03T11:00:00+08:00", { date: "2026-07-03", time: "1100" }],
  ["2026-07-03T11:00:00", { date: "2026-07-03", time: "1100" }],
]) {
  assert.deepEqual(
    singaporePickupDateTimePartsFromTimestamp(input),
    expected,
    `${input} must apply back as Singapore local pickup time`,
  );
  assert.deepEqual(
    adminSnapshotPickupDateTimeParts(input),
    expected,
    `${input} must apply through the operational snapshot helper as Singapore local pickup time`,
  );
}

assert.equal(
  formatPickupTimeFromTimestamp("2026-07-03T03:00:00+00:00"),
  "1100hrs",
  "loaded UTC DB timestamps must display as Singapore local pickup time",
);

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation suite must run operational snapshot apply guard",
);

console.log("Admin operational snapshot apply guard passed");
