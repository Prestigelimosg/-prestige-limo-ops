import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-driver-job-action-surface-guard.mjs";

const driverPagePath = "app/driver-job/[token]/page.tsx";
const driverIssueChoicesPath = "lib/driver-job-issue-alert.ts";
const driverStatusWorkflowPath = "lib/driver-job-status-workflow.ts";
const driverLinkPath = "lib/driver-job-link.ts";
const driverStatusRoutePath = "app/api/driver-job/[token]/status/route.ts";
const driverIssueRoutePath = "app/api/driver-job/[token]/issue-alert/route.ts";
const driverNotificationsRoutePath = "app/api/driver-job/[token]/notifications/route.ts";

const allowedStatusActions = [
  { displayLabel: "I'm on the way", label: "OTW", value: "OTW" },
  { displayLabel: "I've arrived", label: "OTS", value: "OTS" },
  { displayLabel: "Passenger on board", label: "POB", value: "POB" },
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

const allowedDetailLabels = [
  "Reference",
  "Date/time",
  "Service",
  "Pickup",
  "Drop-off",
  "Route",
  "Waypoints",
  "Flight",
  "Passenger",
];

const allowedDriverAppUpdateFields = [
  "created_at",
  "id",
  "notification_status",
  "priority",
  "safe_message",
  "safe_title",
  "updated_at",
];

const allowedDriverPublicInformationLinks = ["/google-calendar", "/privacy", "/terms"];

const driverForbiddenVisiblePattern =
  /customer[_ -]?price|quoted[_ -]?price|billing|invoice|paynow|pay\s+now|payment|driver[_ -]?payout|payout|payout comparison|finance|internal[_ -]?(?:admin|finance)|admin[_ -]?note|mock[_ -]?(?:qa|archive)|parser[_ -]?debug|raw_ai|token_hash|server_secret/i;

const forbiddenClientAuthPattern =
  /Authorization|Bearer|Cookie|document\.cookie|x-prestige-admin-purpose|service_role|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE|session-token/i;

const contractChecks = [
  {
    label: "driver job route action contract",
    script: "scripts/test-driver-job-link-api-routes.mjs",
    requiredFragments: [
      "patchDriverJobStatus(token, status)",
      "postDriverJobIssueAlert(token, issueType)",
      "driver_payout_needed",
      "external_send, false",
      "Driver job link API route tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "driver status persistence safe input contract",
    script: "scripts/test-driver-job-status-persistence-api-contract.mjs",
    requiredFragments: [
      "safeStatusContext",
      "safeStatusNote",
      "Contains driver payout details and must be blocked.",
      "Driver job status persistence API contract tests passed.",
    ],
    stripTypes: true,
  },
  {
    label: "public API client caller boundary guard",
    script: "scripts/test-public-api-client-caller-boundary-guard.mjs",
    requiredFragments: [
      "driver page fetch call count",
      "driver page POST count",
      "driver page PATCH count",
      "Public API client caller boundary guard passed",
    ],
    stripTypes: false,
  },
  {
    label: "public route source privacy boundary guard",
    script: "scripts/test-public-route-source-privacy-boundary-guard.mjs",
    requiredFragments: [
      "Driver job source must not render customer price",
      "Driver app updates and status history must render only safe fields",
      "Public route source privacy boundary guard passed",
    ],
    stripTypes: false,
  },
  {
    label: "public API request input boundary guard",
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
    requiredFragments: [
      "driver job route input contract",
      "driver status persistence input contract",
      "Public API request input boundary guard passed",
    ],
    stripTypes: false,
  },
];

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function assertSameList(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing source block start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing source block end after ${startFragment}: ${endFragment}`);

  return source.slice(start, end + endFragment.length);
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

function extractTypeKeys(source, typeName) {
  const match = source.match(new RegExp(`type\\s+${typeName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `Expected type ${typeName}.`);

  return [...match[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\??:\s/gm)].map((item) => item[1]);
}

function runContractCheck({ label, script, stripTypes }) {
  const args = stripTypes ? ["--experimental-strip-types", script] : [script];
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(
    result.status,
    0,
    [
      `${label} failed while running ${script}.`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

function driverPageWithoutAllowedProtectiveFragments(source) {
  return source
    .replace(/const driverPaymentDetailLinePattern = [^\n]+\n/, "")
    .replace(/!driverPaymentDetailLinePattern\.test\(line\)/g, "")
    .replace(/Private account and internal compensation details are not shown here\./g, "")
    .replace(/Internal app alert only\. No external messages, live location, or photo upload\./g, "");
}

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  driverPagePath,
  driverIssueChoicesPath,
  driverStatusWorkflowPath,
  driverLinkPath,
  driverStatusRoutePath,
  driverIssueRoutePath,
  driverNotificationsRoutePath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const driverPage = files[driverPagePath];
const issueChoices = files[driverIssueChoicesPath];
const statusWorkflow = files[driverStatusWorkflowPath];
const driverLink = files[driverLinkPath];
const statusRoute = files[driverStatusRoutePath];
const issueRoute = files[driverIssueRoutePath];
const notificationsRoute = files[driverNotificationsRoutePath];
const ledgerSection = sectionBetween(ledger, "### Public Driver Job Action Surface Guard Lock");

for (const phrase of [
  "Public driver job display/action surfaces are guarded across `/driver-job/[token]`, the driver job status workflow, issue choices, and driver job action routes.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "The driver page action surface must stay limited to safe job GET, token-scoped driver-details PATCH, saved app-update GET, one acknowledged same-origin calendar-import navigation, three static same-tab public information links to `/google-calendar`, `/privacy`, and `/terms`, issue-alert POST with `issue_type`, fixed-template driver-to-customer quick-reply POST with `template_key`, driver-consented live-location calls, admin-only OTS photo proof POST, and status PATCH with the guarded status value.",
  "Driver status controls must stay limited to OTW, OTS, POB, and Job Completed, coordinated with `guardDriverJobStatusTransition`.",
  "Driver issue choices must stay limited to operational/safety issue values and must not include finance, billing, payment, PayNow, payout, invoice, PDF, parser/debug, internal admin, or mock QA/archive issue types.",
  "Driver app updates and status timing must render only safe fields: `safe_title`, `safe_message`, notification metadata, and status labels/times; visible activity-log and saved-status-history panels stay hidden from the driver page.",
  "Driver job detail display must stay limited to date/time, service, pickup, drop-off, route, waypoints, flight, and passenger display fields.",
  "Pasted driver details remain local-only and filtered so bank/account/PayNow/payment/payout lines are not parsed into driver-visible details.",
  "The driver page must not attach manual Cookie, Authorization, admin purpose, session-token, service-role, Supabase env, local/session storage, credential, media capture, or object URL plumbing; geolocation and file/FormData stay limited to existing driver-consented live location and admin-only OTS photo proof controls.",
  "The driver page must not submit forms, create downloads, expose outbound admin or dynamic links, open the approved public information links in a new tab, or call notification PATCH from the public driver UI.",
  "This guard coordinates the driver job route action contract, driver status persistence safe input contract, public route source privacy guard, public API client caller guard, and public API request input guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-driver-job-action-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public driver job action ledger phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation public driver job action surface guard registration",
);

assert.deepEqual(extractObjectList(driverPage, "statusActions"), allowedStatusActions, "driver page status actions");
assertSameList(
  extractTypeUnionValues(statusWorkflow, "DriverJobStatusUpdate"),
  allowedWorkflowStatuses,
  "driver workflow status values",
);
for (const fragment of [
  "guardDriverJobStatusTransition({",
  "acknowledged,",
  "currentStatus: workflowStatus,",
  "nextStatus,",
  "status: transitionGuard.status",
  "validateDriverJobStatusUpdate(nextStatus)",
]) {
  assertIncludes(driverPage + statusWorkflow, fragment, `driver status workflow fragment ${fragment}`);
}

assert.deepEqual(
  extractObjectList(issueChoices, "driverJobIssueChoices"),
  allowedIssueChoices,
  "driver issue choices",
);
for (const forbiddenIssuePattern of [
  /billing/i,
  /invoice/i,
  /payment/i,
  /paynow/i,
  /payout/i,
  /finance/i,
  /internal/i,
  /mock/i,
  /parser/i,
  /pdf/i,
]) {
  assertExcludes(issueChoices, forbiddenIssuePattern, "driver issue choices forbidden fields");
}

assert.equal(countOccurrences(driverPage, "fetch("), 12, "driver page fetch count");
assert.equal(countOccurrences(driverPage, 'cache: "no-store"'), 10, "driver page no-store count");
assert.equal(countOccurrences(driverPage, 'method: "POST"'), 5, "driver page POST count");
assert.equal(countOccurrences(driverPage, 'method: "DELETE"'), 1, "driver page DELETE count");
assert.equal(countOccurrences(driverPage, 'method: "PATCH"'), 2, "driver page PATCH count");
const driverPublicLinks = [...driverPage.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(
  driverPublicLinks,
  allowedDriverPublicInformationLinks,
  "driver page static public information links",
);
assert.equal(countOccurrences(driverPage, "<Link"), 3, "driver page public information Link count");
assert.equal(countOccurrences(driverPage, 'target="_blank"'), 0, "driver page new-tab public link count");
assert.equal(countOccurrences(driverPage, "anchor.download = filename"), 0, "driver page forced calendar attachment download count");
assert.equal(countOccurrences(driverPage, 'document.createElement("a")'), 0, "driver page must not create a calendar download/import anchor");
for (const fragment of [
  "fetch(`/api/driver-job/${encodeURIComponent(token)}`",
  "`/api/driver-job/${encodeURIComponent(token)}/notifications?limit=5&page=1`",
  "fetch(`/api/driver-job/${encodeURIComponent(token)}/issue-alert`",
  "body: JSON.stringify({ issue_type: issueChoice.value })",
  "`/api/driver-job/${encodeURIComponent(token)}/quick-replies`",
  "body: JSON.stringify({ template_key: templateKey })",
  "driver_contact: nextDetails.contact",
  "driver_name: nextDetails.name",
  "driver_plate_number: nextDetails.plate",
  "driver_vehicle_model: nextDetails.vehicleModel",
  "fetch(driverLiveLocationRoute()",
  "navigator.geolocation.watchPosition",
  "navigator.geolocation.clearWatch",
  "fetch(driverOtsPhotoProofRoute()",
  "const formData = new FormData();",
  'formData.append("photo", photoFile);',
  'type="file"',
  "result.proof?.customerVisible !== false",
  "result.proof?.external_send !== false",
  "customerVisible !== false",
  "external_send !== false",
  "fetch(`/api/driver-job/${encodeURIComponent(token)}/status`",
  "const requestBody: Record<string, unknown> = {\n        status: transitionGuard.status,\n      };",
  'headers: { "content-type": "application/json" }',
  'method: "POST"',
  'method: "DELETE"',
  'method: "PATCH"',
  'data-driver-job-calendar-action="true"',
  "async function openDriverJobCalendar()",
  'const response = await fetch(`/api/driver-job/${encodeURIComponent(token)}/calendar`',
  "safeGoogleConsentUrl",
  "window.location.assign(googleConsentUrl)",
  "onClick={openDriverJobCalendar}",
]) {
  assertIncludes(driverPage, fragment, `driver page action caller ${fragment}`);
}

for (const forbiddenPagePattern of [
  /credentials\s*:/,
  forbiddenClientAuthPattern,
  /localStorage|sessionStorage|navigator\.credentials/i,
  /navigator\.mediaDevices|getUserMedia/i,
  /type="submit"|formAction/,
  /\/api\/admin|\/api\/admin-saved-bookings|\/api\/ai-parse/i,
  /method:\s*"PATCH"[\s\S]{0,220}notifications/i,
  /JSON\.stringify\(\s*(driverDetails|driverDetailsRaw|savedDriverDetails)/,
]) {
  assertExcludes(driverPage, forbiddenPagePattern, "driver page forbidden public action surface");
}

assertExcludes(
  driverPageWithoutAllowedProtectiveFragments(driverPage),
  driverForbiddenVisiblePattern,
  "driver page forbidden visible/source fields outside protective redaction",
);

const driverAppUpdateRecordFields = extractTypeKeys(driverPage, "DriverAppUpdateRecord");
assertSameList(
  driverAppUpdateRecordFields,
  allowedDriverAppUpdateFields,
  "driver app update record fields",
);
for (const fragment of [
  'safeDisplayText(update.safe_title, "Dispatch update")',
  'safeDisplayText(update.safe_message, "Contact dispatch for the latest job update.")',
  "driverAppUpdateStatusLabel(update.notification_status)",
  "driverAppUpdateStatusLabel(update.priority || \"normal\")",
  "formatDriverAppUpdateTime(update.created_at || update.updated_at)",
]) {
  assertIncludes(driverPage, fragment, `driver app update safe render ${fragment}`);
}
for (const unsafeUpdateAccess of [
  /update\.message\b/,
  /update\.title\b/,
  /update\.body\b/,
  /update\.payload\b/,
  /update\.token\b/,
  /update\.driver_job_link_id\b/,
  /update\.customer_price\b/,
  /update\.driver_payout\b/,
]) {
  assertExcludes(driverPage, unsafeUpdateAccess, "driver app update unsafe access");
}

const detailRowsBlock = blockBetween(driverPage, "function detailRows(job: SafeDriverJobPayload)", "function activityTime()");
const actualDetailLabels = [...detailRowsBlock.matchAll(/\{\s*label:\s*"([^"]+)"/g)].map((item) => item[1]);
assertSameList(actualDetailLabels, allowedDetailLabels, "driver job detail labels");
for (const forbiddenDetailPattern of [
  /price/i,
  /billing/i,
  /invoice/i,
  /payment/i,
  /paynow/i,
  /payout/i,
  /finance/i,
  /internal/i,
  /debug/i,
  /mock/i,
]) {
  assertExcludes(detailRowsBlock, forbiddenDetailPattern, "driver detail row forbidden fields");
}

for (const fragment of [
  "const driverPaymentDetailLinePattern = /\\b(bank|account|acct|paynow|pay\\s+now|payment|payout)\\b/i;",
  "if (match?.[1] && !driverPaymentDetailLinePattern.test(line))",
  ".filter((line) => !driverPaymentDetailLinePattern.test(line));",
  "parseDriverDetailsText(driverDetailsRaw)",
  "setDriverDetails((currentDetails) => ({",
  "result.payload.assignedDriver",
  "setSavedDriverDetails(confirmedDetails)",
]) {
  assertIncludes(driverPage, fragment, `driver pasted details safe local fragment ${fragment}`);
}

for (const fragment of [
  "export async function PATCH(request: Request, context: DriverJobStatusRouteContext)",
  "applyDriverJobStatusUpdateContract",
  "applyProductionDriverJobStatusUpdate",
  "safeStatusContext",
  "safeStatusNote",
]) {
  assertIncludes(statusRoute, fragment, `driver status route fragment ${fragment}`);
}
assertExcludes(statusRoute, /export async function (?:GET|POST|PUT|DELETE)/, "driver status route unsupported methods");

for (const fragment of [
  "export async function POST(request: Request, context: DriverJobIssueAlertRouteContext)",
  "getDriverJobIssueChoice(body.issue_type)",
  "createDriverJobIssueAdminAppNotification",
  "external_send: false",
]) {
  assertIncludes(issueRoute, fragment, `driver issue route fragment ${fragment}`);
}
assertExcludes(issueRoute, /export async function (?:GET|PATCH|PUT|DELETE)/, "driver issue route unsupported methods");
assertExcludes(issueRoute, /telegram|whatsapp|sms|email|provider|external_send:\s*true/i, "driver issue route external send");

for (const fragment of [
  "export async function GET(request: Request, context: DriverJobNotificationRouteContext)",
  "export async function PATCH(request: Request, context: DriverJobNotificationRouteContext)",
  "loadDriverAppNotificationsForToken",
  "updateDriverAppNotificationStatusForToken",
  'delivery_surface: "driver_app"',
]) {
  assertIncludes(notificationsRoute, fragment, `driver notifications route fragment ${fragment}`);
}
assertExcludes(driverPage, /\/notifications[\s\S]{0,220}method:\s*"PATCH"/, "driver page notification PATCH caller");

const safeDriverJobPayloadBlock = blockBetween(
  driverLink,
  "export type SafeDriverJobPayload = {",
  "};\n\nexport type SafeDriverJobStatusHistoryItem",
);
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
  assertExcludes(safeDriverJobPayloadBlock, forbiddenPayloadPattern, "SafeDriverJobPayload public shape");
}
for (const fragment of [
  "data-driver-job-status-timing-evidence",
  "data-driver-job-status-timing-time",
  "data-driver-job-app-updates",
]) {
  assertIncludes(driverPage, fragment, `driver compact safe render ${fragment}`);
}
for (const fragment of [
  "data-driver-job-activity-log",
  "data-driver-job-saved-status-history",
  "Status History",
  "Driver Activity Log",
]) {
  assertExcludes(driverPage, fragment, `driver noisy history/activity render ${fragment}`);
}

for (const check of contractChecks) {
  for (const fragment of check.requiredFragments) {
    assertIncludes(files[check.script], fragment, `${check.label} source fragment ${fragment}`);
  }
  runContractCheck(check);
}

console.log("Public driver job action surface guard passed");
