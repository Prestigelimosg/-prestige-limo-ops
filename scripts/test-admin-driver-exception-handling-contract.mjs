import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractPath = "docs/admin-driver-exception-handling-contract.md";
const driverReportingContractPath = "docs/driver-reporting-status-contract.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-driver-exception-handling-contract.mjs";

const appPath = "app/page.tsx";
const driverIssueChoicesPath = "lib/driver-job-issue-alert.ts";
const driverStatusWorkflowPath = "lib/driver-job-status-workflow.ts";
const driverPagePath = "app/driver-job/[token]/page.tsx";
const workflowSchemaGuardPath = "scripts/test-admin-booking-workflow-status-schema-contract.mjs";
const driverJobPageBrowserGuardPath = "scripts/test-driver-job-page-browser.mjs";

const allowedWorkflowStatuses = ["driver_otw", "ots", "pob", "completed"];

const allowedIssueValues = [
  "cannot_find_passenger",
  "passenger_no_show",
  "passenger_late",
  "flight_or_pickup_timing_changed",
  "route_or_itinerary_changed",
  "vehicle_issue",
  "traffic_delay",
  "accident_or_safety_concern",
  "other_issue",
];

const adminOnlyExceptionCategories = [
  "driver_no_response",
  "driver_late_or_reminder_due",
  "cannot_find_passenger",
  "passenger_no_show_review",
  "passenger_late_review",
  "timing_or_route_changed",
  "vehicle_issue",
  "replacement_driver_needed",
  "replacement_vehicle_needed",
  "dispatcher_call_needed",
  "customer_update_review",
  "completed_with_exception_review",
  "closed_after_dispatcher_review",
];

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must not match ${pattern}.`);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function extractTypeUnionValues(source, typeName) {
  const match = source.match(new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*([^;]+);`));
  assert.ok(match, `Expected type union ${typeName}.`);

  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function extractIssueValues(source) {
  return [...source.matchAll(/\{\s*label:\s*"[^"]+",\s*value:\s*"([^"]+)"\s*\}/g)].map(
    (item) => item[1],
  );
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
    driverReportingContractPath,
    docsIndexPath,
    ledgerPath,
    preactivationSuitePath,
    appPath,
    driverIssueChoicesPath,
    driverStatusWorkflowPath,
    driverPagePath,
    workflowSchemaGuardPath,
    driverJobPageBrowserGuardPath,
  ].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const contract = files[contractPath];
const driverReportingContract = files[driverReportingContractPath];
const docsIndex = files[docsIndexPath];
const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const app = files[appPath];
const issueChoices = files[driverIssueChoicesPath];
const statusWorkflow = files[driverStatusWorkflowPath];
const driverPage = files[driverPagePath];
const workflowSchemaGuard = files[workflowSchemaGuardPath];
const driverJobPageBrowserGuard = files[driverJobPageBrowserGuardPath];
const ledgerSection = sectionBetween(ledger, "### Admin Driver Exception Handling Contract Lock");

for (const fragment of [
  "# Admin Driver Exception Handling Contract",
  "Driver public reporting stays simple and must not grow into a broad exception workflow.",
  "Do not add another admin UI sector or loose button for this contract.",
  "Future runtime work, if separately approved, must stay compact and colocated with the existing admin operational areas:",
  "Day-of-Trip Exception Escalation: `data-admin-day-of-trip-exception-escalation`.",
  "Dispatch Recovery / Replacement Readiness: `data-admin-dispatch-recovery-replacement-readiness`.",
  "Completed Trip Closeout Review for post-JC exception resolution review.",
  "These names are contract-level categories only. They do not approve new database values, runtime status values, API inputs, UI buttons, customer messages, or driver-visible states.",
  "Safe public driver issue reports may inform admin review, but they must not directly become public customer or driver workflow states.",
  "reuse the existing compact admin exception/recovery areas instead of adding a new UI sector;",
  "keep public driver statuses unchanged;",
  "keep driver issue input enum-only;",
]) {
  assertIncludes(contract, fragment, `admin driver exception contract phrase ${fragment}`);
}

for (const category of adminOnlyExceptionCategories) {
  assertIncludes(contract, `\`${category}\``, `admin-only exception category ${category}`);
}

for (const issueValue of allowedIssueValues) {
  assertIncludes(contract, `\`${issueValue}\``, `driver issue mapping ${issueValue}`);
}

for (const fragment of [
  "driver_otw -> ots -> pob -> completed",
  "OTW -> OTS -> POB -> Job Completed",
]) {
  assertIncludes(contract, fragment, `public status chain in admin exception contract ${fragment}`);
  assertIncludes(driverReportingContract, fragment, `public status chain in driver reporting contract ${fragment}`);
}

assert.deepEqual(
  extractTypeUnionValues(statusWorkflow, "DriverJobStatusUpdate"),
  allowedWorkflowStatuses,
  "driver workflow status values must stay narrow",
);
assert.deepEqual(extractIssueValues(issueChoices), allowedIssueValues, "driver issue values must stay enum-only");

for (const fragment of [
  'data-admin-day-of-trip-exception-escalation="true"',
  "dayOfTripExceptionEscalationOptions",
  '{ label: "No Response", value: "driver-no-response" }',
  '{ label: "Late Reminder", value: "late-reminder-due" }',
  '{ label: "Call Needed", value: "dispatcher-call" }',
  '{ label: "Replacement", value: "replacement-review" }',
  '{ label: "Customer Update", value: "customer-update" }',
  '{ label: "Closed", value: "closed-locally" }',
  'data-admin-dispatch-recovery-replacement-readiness="true"',
  "dispatchRecoveryReplacementOptions",
  '{ label: "Review Needed", value: "review-needed" }',
  '{ label: "Driver Reviewed", value: "driver-reviewed" }',
  '{ label: "Vehicle Reviewed", value: "vehicle-reviewed" }',
  '{ label: "Copy Ready", value: "copy-ready" }',
  '{ label: "Job Link Ready", value: "job-link-ready" }',
  '{ label: "Ready Locally", value: "ready-locally" }',
  "Completed Trip Closeout Review",
]) {
  assertIncludes(app, fragment, `existing admin exception/recovery placement ${fragment}`);
}

assert.equal(
  countOccurrences(app, 'data-admin-day-of-trip-exception-escalation="true"'),
  1,
  "admin exception contract must reuse the one existing day-of-trip exception section",
);
assert.equal(
  countOccurrences(app, 'data-admin-dispatch-recovery-replacement-readiness="true"'),
  1,
  "admin exception contract must reuse the one existing dispatch recovery replacement section",
);

for (const fragment of [
  "Local UI only. No Supabase write, live database access, notification sending, customer message,",
  "driver notification, billing, payment, PDF, payout, live location, or parser-learning behavior.",
]) {
  assertIncludes(app, fragment, `existing admin exception/recovery no-live boundary ${fragment}`);
}

for (const fragment of [
  "day_of_trip_exception",
  "dispatch_recovery",
  "trip_completion",
  "closeout_review",
  "exception_open",
  "recovery_review",
  "closed",
]) {
  assertIncludes(workflowSchemaGuard, fragment, `workflow schema guard fragment ${fragment}`);
}

for (const fragment of [
  "Driver pages must not add dispatcher exception APIs.",
  "Public driver job page must keep dispatcher cancel/replacement workflow absent and future/staff-controlled.",
  "Arrival public driver page must keep dispatcher exception workflow absent and future/staff-controlled.",
]) {
  assertIncludes(driverJobPageBrowserGuard, fragment, `public driver exception absence guard ${fragment}`);
}

for (const forbiddenPublicDriverFragment of [
  "data-admin-day-of-trip-exception-escalation",
  "data-admin-dispatch-recovery-replacement-readiness",
  "dispatcher exception",
  "replacement driver may be needed",
  "completed with exception",
]) {
  assert.equal(
    driverPage.toLowerCase().includes(forbiddenPublicDriverFragment.toLowerCase()),
    false,
    `Public driver page must not contain ${forbiddenPublicDriverFragment}.`,
  );
}

for (const fragment of [
  "does not approve runtime implementation",
  "They do not approve new database values",
  "endpoint migration",
  "new UI sectors, new buttons",
  "does not approve runtime implementation, UI/API behavior change, endpoint migration, new UI sectors, new buttons",
]) {
  assertIncludes(contract, fragment, `admin driver exception contract no-approval boundary ${fragment}`);
}
for (const forbiddenApprovalPattern of [
  /this contract approves/i,
  /approved by this contract/i,
  /new UI sector is approved/i,
  /new database values are approved/i,
]) {
  assertExcludes(contract, forbiddenApprovalPattern, "admin driver exception contract must not contain positive approval wording");
}

for (const fragment of [
  "[Admin Driver Exception Handling Contract](admin-driver-exception-handling-contract.md)",
  "current admin-only driver exception handling boundary",
  "without adding new UI sectors or public driver statuses",
]) {
  assertIncludes(docsIndex, fragment, `docs index admin driver exception link ${fragment}`);
}

for (const fragment of [
  "Admin Driver Exception Handling Contract Lock",
  "`docs/admin-driver-exception-handling-contract.md`",
  "`scripts/test-admin-driver-exception-handling-contract.mjs`",
  "No new admin UI sector, UI button, runtime behavior, endpoint migration, env change, deployment, DB read/write, migration, provider/send, payment/PDF/pricing/payout/auth/location/photo/calendar activation, parser change, Save Booking change, `/api/admin-saved-bookings` change, or new shim is approved by this lock.",
]) {
  assertIncludes(ledgerSection, fragment, `ledger admin driver exception fragment ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation admin driver exception guard registration");

console.log("Admin driver exception handling contract guard passed");
