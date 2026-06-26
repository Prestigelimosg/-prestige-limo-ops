import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractPath = "docs/driver-reporting-status-contract.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-reporting-status-contract.mjs";

const docsIndexPath = "docs/test-and-safety-docs-index.md";
const driverPagePath = "app/driver-job/[token]/page.tsx";
const driverWorkflowPlanPath = "docs/driver-job-link-workflow-plan.md";
const driverIssueChoicesPath = "lib/driver-job-issue-alert.ts";
const driverStatusWorkflowPath = "lib/driver-job-status-workflow.ts";
const driverLinkPath = "lib/driver-job-link.ts";
const driverStatusRoutePath = "app/api/driver-job/[token]/status/route.ts";
const driverStatusPersistencePath = "lib/driver-job-status-persistence.ts";

const allowedStatusActions = [
  { displayLabel: "On the way", label: "OTW", value: "OTW" },
  { displayLabel: "Arrived", label: "OTS", value: "OTS" },
  { displayLabel: "On-boarded", label: "POB", value: "POB" },
  { displayLabel: "Completed", label: "Job Completed", value: "Job Completed" },
];

const allowedWorkflowStatuses = ["driver_otw", "ots", "pob", "completed"];

const allowedIssueChoices = [
  { label: "Cannot find passenger", value: "cannot_find_passenger" },
  { label: "Passenger no-show", value: "passenger_no_show" },
  { label: "Passenger late", value: "passenger_late" },
  { label: "Flight or pickup timing changed", value: "flight_or_pickup_timing_changed" },
  { label: "Route or itinerary changed", value: "route_or_itinerary_changed" },
  { label: "Vehicle issue", value: "vehicle_issue" },
  { label: "Traffic delay", value: "traffic_delay" },
  { label: "Accident / safety concern", value: "accident_or_safety_concern" },
  { label: "Other issue", value: "other_issue" },
];

const requiredContractFragments = [
  "# Driver Reporting Status Contract",
  "Driver reporting must stay a narrow operational workflow for one assigned job.",
  "Driver opens the private `/driver-job/[token]` link for one assigned job.",
  "Driver enters or confirms driver and vehicle details locally, then uses Save & Acknowledge Job.",
  "Acknowledgement is required before any status update can be accepted.",
  "driver_otw -> ots -> pob -> completed",
  "OTW -> OTS -> POB -> Job Completed",
  "`completed` is the JC terminal state.",
  "invalid status: reject as `invalid_status`.",
  "not acknowledged: reject as `acknowledgement_required`.",
  "skipped or repeated step: reject as `out_of_order`.",
  "status after JC: reject as `already_completed`.",
  "Driver issue reporting must stay enum-only and operational/safety-only",
  "Issue reports must create internal app/admin handling only.",
  "Older driver-job planning docs remain useful historical planning context",
  "Do not broaden the driver status list to represent every real-world exception.",
  "Future admin-only handling states may be planned separately",
];

const requiredPrivacyFragments = [
  "Customers must never see driver payout",
  "PayNow payout",
  "internal admin notes",
  "parser/debug internals",
  "admin finance",
  "mock QA/dev archive",
  "Drivers must never see customer price",
  "billing",
  "invoice/payment",
  "payout comparisons",
  "PayNow payout details",
  "internal finance notes",
];

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must not match ${pattern}.`);
}

function assertInOrder(source, fragments, label) {
  let index = -1;

  for (const fragment of fragments) {
    const nextIndex = source.indexOf(fragment, index + 1);
    assert.notEqual(nextIndex, -1, `${label} missing or out of order: ${fragment}`);
    index = nextIndex;
  }
}

function extractObjectList(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const|;)`));
  assert.ok(match, `Expected ${constName} object list.`);

  return [
    ...match[1].matchAll(/\{\s*(?:displayLabel:\s*"([^"]+)",\s*)?label:\s*"([^"]+)",\s*value:\s*"([^"]+)"\s*\}/g),
  ].map(([, displayLabel, label, value]) =>
    displayLabel ? { displayLabel, label, value } : { label, value },
  );
}

function extractTypeUnionValues(source, typeName) {
  const match = source.match(new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*([^;]+);`));
  assert.ok(match, `Expected type union ${typeName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing source block start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing source block end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end + endFragment.length);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const fileEntries = await Promise.all(
  [
    contractPath,
    docsIndexPath,
    ledgerPath,
    preactivationSuitePath,
    driverWorkflowPlanPath,
    driverPagePath,
    driverIssueChoicesPath,
    driverStatusWorkflowPath,
    driverLinkPath,
    driverStatusRoutePath,
    driverStatusPersistencePath,
  ].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const contract = files[contractPath];
const docsIndex = files[docsIndexPath];
const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const driverWorkflowPlan = files[driverWorkflowPlanPath];
const driverPage = files[driverPagePath];
const issueChoices = files[driverIssueChoicesPath];
const statusWorkflow = files[driverStatusWorkflowPath];
const driverLink = files[driverLinkPath];
const statusRoute = files[driverStatusRoutePath];
const statusPersistence = files[driverStatusPersistencePath];
const ledgerSection = sectionBetween(ledger, "### Driver Reporting Status Contract Lock");

for (const fragment of requiredContractFragments) {
  assertIncludes(contract, fragment, `driver reporting contract phrase: ${fragment}`);
}

for (const fragment of requiredPrivacyFragments) {
  assertIncludes(contract, fragment, `driver reporting privacy phrase: ${fragment}`);
}

for (const fragment of [
  "The current guarded driver public reporting/status boundary is `docs/driver-reporting-status-contract.md`.",
  "Any older PayNow-number, live-location, OTS-photo, reminder, exception, or expanded workflow wording in this plan remains planning-only and must defer to that current contract before implementation.",
]) {
  assertIncludes(driverWorkflowPlan, fragment, `driver workflow plan current-contract note ${fragment}`);
}

for (const fragment of [
  "[Driver Reporting Status Contract](driver-reporting-status-contract.md) owns the current source-of-truth driver public reporting/status boundary",
  "[Driver Job Link Workflow Plan](driver-job-link-workflow-plan.md) owns older broad planning context",
  "current public reporting/status boundaries defer to the Driver Reporting Status Contract",
]) {
  assertIncludes(docsIndex, fragment, `test and safety docs index driver reporting cross-link ${fragment}`);
}

for (const status of allowedWorkflowStatuses) {
  assertIncludes(contract, `\`${status}\``, `driver reporting contract status ${status}`);
}

assertInOrder(
  contract,
  ["driver_otw -> ots -> pob -> completed", "OTW -> OTS -> POB -> Job Completed"],
  "driver reporting workflow sequence",
);

assert.deepEqual(
  extractTypeUnionValues(statusWorkflow, "DriverJobStatusUpdate"),
  allowedWorkflowStatuses,
  "driver workflow status values",
);
assert.deepEqual(
  extractObjectList(driverPage, "statusActions"),
  allowedStatusActions,
  "driver page status actions",
);
assert.deepEqual(
  extractObjectList(issueChoices, "driverJobIssueChoices"),
  allowedIssueChoices,
  "driver issue choices",
);

for (const issue of allowedIssueChoices) {
  assertIncludes(contract, `\`${issue.value}\``, `driver reporting issue value ${issue.value}`);
}

for (const fragment of [
  "guardDriverJobStatusTransition({",
  "acknowledged,",
  "currentStatus,",
  "nextStatus,",
  'reason: "acknowledgement_required"',
  'reason: "already_completed"',
  'reason: "invalid_status"',
  'reason: "out_of_order"',
  "currentStatusIndex + 1",
]) {
  assertIncludes(statusWorkflow, fragment, `driver status workflow guard fragment ${fragment}`);
}

for (const fragment of [
  "setSavedDriverDetails(nextDetails)",
  "setAcknowledged(true)",
  'text: "Driver details saved and job acknowledged."',
  "guardDriverJobStatusTransition({",
  "currentStatus: workflowStatus,",
  "status: transitionGuard.status",
  "addActivity(`${displayLabel} marked`, `Driver status updated to ${nextStatusText}.`)",
]) {
  assertIncludes(driverPage, fragment, `driver page reporting flow fragment ${fragment}`);
}

for (const fragment of [
  "export async function PATCH(request: Request, context: DriverJobStatusRouteContext)",
  "const status = typeof body.status === \"string\" ? body.status : \"\";",
  "const safeStatusContext = body.safe_status_context;",
  "const safeStatusNote = body.safe_status_note;",
  "applyProductionDriverJobStatusUpdate",
  "applyDriverJobStatusUpdateContract",
]) {
  assertIncludes(statusRoute, fragment, `driver status route fragment ${fragment}`);
}
assertExcludes(statusRoute, /export async function (?:GET|POST|PUT|DELETE)/, "driver status route unsupported methods");

for (const fragment of [
  '.from("driver_job_status_events")',
  'actor_label: "verified_driver_job_link"',
  'actor_role: "driver"',
  "booking_reference: resolvedLink.link.booking_reference",
  "driver_job_link_id: resolvedLink.link.id",
  "safe_status_context: safeStatusDetails.safeStatusContext",
  "safe_status_note: safeStatusDetails.safeStatusNote",
  'source_surface: "driver_job_api"',
  'status_source: "driver_job_api"',
  "status_value: nextStatus",
]) {
  assertIncludes(statusPersistence, fragment, `driver status persistence fragment ${fragment}`);
}

const safePayloadBlock = blockBetween(
  driverLink,
  "export type SafeDriverJobPayload = {",
  "};\n\nexport type SafeDriverJobStatusHistoryItem",
);
for (const fragment of [
  "reference: string;",
  "pickupDateTime: string;",
  "bookingTypeLabel: string;",
  "pickupLocation: string;",
  "dropoffLocation: string;",
  "route: string;",
  "waypoints: string[];",
  "flightNumber: string;",
  "passengerName: string;",
  "statusHistory: SafeDriverJobStatusHistoryItem[];",
  "statusLabel: string;",
  "assignedDriver:",
]) {
  assertIncludes(safePayloadBlock, fragment, `safe driver payload fragment ${fragment}`);
}

for (const forbiddenPayloadPattern of [
  /price/i,
  /billing/i,
  /invoice/i,
  /payment/i,
  /paynow/i,
  /payout/i,
  /finance/i,
  /\btoken\b/i,
  /internal/i,
  /debug/i,
  /mock/i,
]) {
  assertExcludes(safePayloadBlock, forbiddenPayloadPattern, "SafeDriverJobPayload public shape");
}

for (const fragment of [
  "Driver Reporting Status Contract Lock",
  "`docs/driver-reporting-status-contract.md`",
  "`scripts/test-driver-reporting-status-contract.mjs`",
  "driver_otw -> ots -> pob -> completed",
  "OTW -> OTS -> POB -> Job Completed",
  "No runtime implementation, UI/API behavior change, env change, deployment, DB read/write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, parser change, Save Booking change, `/api/admin-saved-bookings` change, UI sector/button/card addition, or new shim is approved by this lock.",
]) {
  assertIncludes(ledgerSection, fragment, `driver reporting ledger fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation driver reporting contract guard registration");

console.log("Driver reporting status contract guard passed");
