import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-api-method-surface-boundary-guard.mjs";

const methodSurfaceChecks = [
  {
    path: "app/api/customer-booking-requests/route.ts",
    allowedMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
    requiredFragments: [
      "export async function POST(request: Request)",
      "function blockedResponse()",
      "export async function GET() {\n  return blockedResponse();\n}",
      "export async function PUT() {\n  return blockedResponse();\n}",
      "export async function PATCH() {\n  return blockedResponse();\n}",
      "export async function DELETE() {\n  return blockedResponse();\n}",
      "export async function HEAD() {\n  return blockedResponse();\n}",
      "export async function OPTIONS() {\n  return blockedResponse();\n}",
      "isCustomerBookingRequest(request)",
    ],
  },
  {
    path: "app/api/customer-portal-sessions/route.ts",
    allowedMethods: ["DELETE", "GET", "PATCH", "POST", "PUT"],
    requiredFragments: [
      "export async function POST(request: Request)",
      "customerPortalSessionIssueAuthRequiredResult",
      "export async function GET()",
      "export async function PUT()",
      "export async function PATCH()",
      "export async function DELETE()",
      "return result.ok ? safeFailureResponse() : safeErrorResponse(result);",
    ],
  },
  {
    path: "app/api/customer-saved-bookings/route.ts",
    allowedMethods: ["DELETE", "GET", "PATCH", "POST", "PUT"],
    requiredFragments: [
      "export async function GET(request: Request)",
      "customerSavedBookingsAuthRequiredResult",
      "export async function POST()",
      "export async function PUT()",
      "export async function PATCH()",
      "export async function DELETE()",
      "return result.ok ? safeFailureResponse() : safeErrorResponse(result);",
    ],
  },
  {
    path: "app/api/customer-booking-memory/route.ts",
    allowedMethods: ["DELETE", "GET", "PATCH", "POST", "PUT"],
    requiredFragments: [
      "export async function GET(request: Request)",
      "customerBookingMemoryAuthRequiredResult",
      "export async function POST()",
      "export async function PUT()",
      "export async function PATCH()",
      "export async function DELETE()",
      "return result.ok ? safeFailureResponse() : safeErrorResponse(result);",
    ],
  },
  {
    path: "app/api/customer-booking-statuses/route.ts",
    allowedMethods: ["GET", "PATCH", "POST"],
    requiredFragments: [
      "export async function GET(request: Request)",
      "customerBookingStatusAuthRequiredResult",
      "export async function POST()",
      "export async function PATCH()",
      "return result.ok ? safeFailureResponse() : safeErrorResponse(result);",
    ],
  },
  {
    path: "app/api/customer-app-notifications/route.ts",
    allowedMethods: ["GET", "PATCH"],
    requiredFragments: [
      "function safeCustomerAuthRequiredResponse()",
      "customerAppNotificationsRequireAuthResult",
      "readCustomerAppNotificationsForStagingEvidence",
      "export async function GET(request: Request)",
      "export async function PATCH() {\n  return safeCustomerAuthRequiredResponse();\n}",
    ],
  },
  {
    path: "app/api/driver-job/[token]/route.ts",
    allowedMethods: ["GET", "PATCH"],
    requiredFragments: [
      "export async function GET(request: Request, context: DriverJobRouteContext)",
      "export async function PATCH(request: Request, context: DriverJobRouteContext)",
      "getDriverJobPayloadForTokenContract",
      "getProductionDriverJobPayloadForToken",
      "applyDriverJobDetailsUpdateContract",
      "applyProductionDriverJobDetailsUpdate",
      "readDriverDetailsBody",
      "invalid_details",
    ],
  },
  {
    path: "app/api/driver-job/[token]/status/route.ts",
    allowedMethods: ["PATCH"],
    requiredFragments: [
      "export async function PATCH(request: Request, context: DriverJobStatusRouteContext)",
      "applyDriverJobStatusUpdateContract",
      "applyProductionDriverJobStatusUpdate",
      "safeStatusContext",
      "safeStatusNote",
    ],
  },
  {
    path: "app/api/driver-job/[token]/notifications/route.ts",
    allowedMethods: ["GET", "PATCH"],
    requiredFragments: [
      "export async function GET(request: Request, context: DriverJobNotificationRouteContext)",
      "export async function PATCH(request: Request, context: DriverJobNotificationRouteContext)",
      "loadDriverAppNotificationsForToken",
      "updateDriverAppNotificationStatusForToken",
      'delivery_surface: "driver_app"',
    ],
  },
  {
    path: "app/api/driver-job/[token]/issue-alert/route.ts",
    allowedMethods: ["POST"],
    requiredFragments: [
      "export async function POST(request: Request, context: DriverJobIssueAlertRouteContext)",
      "getDriverJobIssueChoice",
      "external_send: false",
    ],
  },
  {
    path: "app/api/driver-job/[token]/flight-eta-setup/route.ts",
    allowedMethods: ["GET"],
    requiredFragments: [
      "export async function GET(request: Request, context: DriverFlightEtaSetupRouteContext)",
      "buildAdminFlightApiSetupFoundation",
      'driver_job_scope: "token_scoped"',
    ],
  },
  {
    path: "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts",
    allowedMethods: ["GET"],
    requiredFragments: [
      "export async function GET(request: Request, context: DriverFlightEtaAcknowledgementSetupRouteContext)",
      "buildDriverFlightEtaAcknowledgementSetupFoundation",
      "driver_job_token: token",
    ],
  },
  {
    path: "app/api/driver-job-bids/route.ts",
    allowedMethods: ["GET", "PATCH", "POST"],
    requiredFragments: [
      "function blockedDriverBidResponse()",
      "driverBidRuntimeAccessBlocked",
      "export async function GET() {\n  return blockedDriverBidResponse();\n}",
      "export async function POST() {\n  return blockedDriverBidResponse();\n}",
      "export async function PATCH() {\n  return blockedDriverBidResponse();\n}",
    ],
  },
];

const contractChecks = [
  {
    label: "customer booking request method contract",
    script: "scripts/test-customer-booking-request-api-contract.mjs",
    requiredFragments: ["blockedMethod", "GET\", \"PUT\", \"PATCH\", \"DELETE\", \"HEAD\", \"OPTIONS\""],
    stripTypes: true,
  },
  {
    label: "customer portal session method contract",
    script: "scripts/test-customer-portal-session-issue-api-contract.mjs",
    requiredFragments: ["blockedMethodResponse", "GET\", \"PUT\", \"PATCH\", \"DELETE\""],
    stripTypes: true,
  },
  {
    label: "customer booking status method contract",
    script: "scripts/test-customer-booking-status-api-contract.mjs",
    requiredFragments: ["postResponse", "patchResponse"],
    stripTypes: true,
  },
  {
    label: "customer/driver notification method contract",
    script: "scripts/test-customer-driver-app-notification-api-contract.mjs",
    requiredFragments: ["customerRoute.GET", "customerRoute.PATCH", "driverRoute.GET", "driverRoute.PATCH"],
    stripTypes: true,
  },
  {
    label: "driver job route method contract",
    script: "scripts/test-driver-job-link-api-routes.mjs",
    requiredFragments: ["GET(", "PATCH(", "POST_ISSUE_ALERT"],
    stripTypes: true,
  },
  {
    label: "driver bidding method contract",
    script: "scripts/test-driver-portal-bidding-api-contract.mjs",
    requiredFragments: ["harness.driverRoute.GET", "harness.driverRoute.POST", "harness.driverRoute.PATCH"],
    stripTypes: true,
  },
  {
    label: "driver flight ETA setup method contract",
    script: "scripts/test-driver-flight-eta-setup-api-contract.mjs",
    requiredFragments: ["export async function GET", "export async function POST"],
    stripTypes: false,
  },
  {
    label: "driver flight ETA acknowledgement setup method contract",
    script: "scripts/test-driver-flight-eta-acknowledgement-setup-api-contract.mjs",
    requiredFragments: ["export async function GET", "export async function POST"],
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

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function exportedMethods(source) {
  return [...source.matchAll(/\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
    .map((match) => match[1])
    .sort();
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

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  ...methodSurfaceChecks.map(({ path }) => path),
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const ledgerSection = sectionBetween(ledger, "### Public API Method Surface Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver API method surfaces are guarded across customer booking request, customer portal session, customer saved bookings, customer booking memory, customer booking status, customer app notifications, driver job link, driver job status, driver notifications, driver issue-alert, driver flight ETA setup, and driver bidding routes.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Customer booking requests may keep the existing guarded `POST` submission path while `GET`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS` fail closed through `blockedResponse`.",
  "Customer saved-booking, booking-memory, booking-status, portal-session, and app-notification methods must stay on their current safe read/auth-required or submit-only boundaries.",
  "Driver job methods must stay limited to safe job `GET`, safe token-scoped driver-details `PATCH`, status `PATCH`, notification `GET`/`PATCH`, issue-alert `POST`, setup-only flight ETA `GET`, setup-only acknowledgement `GET`, and blocked driver bidding `GET`/`POST`/`PATCH`.",
  "Public API method contracts must continue checking blocked or setup-only methods through mocked route harnesses; this guard coordinates those scripts in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-api-method-surface-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public API method surface ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public API method surface guard registration");

for (const { allowedMethods, path, requiredFragments } of methodSurfaceChecks) {
  const source = files[path];
  assert.deepEqual(exportedMethods(source), allowedMethods, `${path} exported method surface`);

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${path} method-surface fragment ${fragment}`);
  }

  assertExcludes(source, /\bexport\s+async\s+function\s+(?:TRACE|CONNECT)\b/, `${path} unsafe HTTP method exports`);
}

for (const { label, requiredFragments, script, stripTypes } of contractChecks) {
  const source = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(source, fragment, `${label} source fragment ${fragment}`);
  }

  runContractCheck({ label, script, stripTypes });
}

console.log("Public API method surface boundary guard passed");
