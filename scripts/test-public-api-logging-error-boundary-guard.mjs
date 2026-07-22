import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-api-logging-error-boundary-guard.mjs";

const publicApiRoutePaths = [
  "app/api/customer-booking-requests/route.ts",
  "app/api/customer-portal-sessions/route.ts",
  "app/api/customer-saved-bookings/route.ts",
  "app/api/customer-booking-memory/route.ts",
  "app/api/customer-booking-statuses/route.ts",
  "app/api/customer-app-notifications/route.ts",
  "app/api/driver-job/[token]/route.ts",
  "app/api/driver-job/[token]/status/route.ts",
  "app/api/driver-job/[token]/notifications/route.ts",
  "app/api/driver-job/[token]/issue-alert/route.ts",
  "app/api/driver-job/[token]/flight-eta-setup/route.ts",
  "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts",
  "app/api/driver-job-bids/route.ts",
  "app/api/driver-portal/jobs/route.ts",
];

const publicApiHelperPaths = [
  "lib/customer-booking-request-adapter.ts",
  "lib/customer-booking-status-read.ts",
  "lib/customer-portal-session-issue.ts",
  "lib/customer-saved-bookings-read.ts",
  "lib/customer-booking-memory-read.ts",
  "lib/customer-driver-app-notification-persistence.ts",
  "lib/driver-job-link.ts",
  "lib/driver-job-link-contract.ts",
  "lib/driver-job-status-persistence.ts",
  "lib/driver-portal-jobs.ts",
  "lib/driver-portal-session.ts",
  "lib/driver-portal-bidding-persistence.ts",
];

const contractChecks = [
  {
    label: "public API source privacy guard",
    script: "scripts/test-public-api-source-privacy-boundary-guard.mjs",
  },
  {
    label: "public API response privacy guard",
    script: "scripts/test-public-api-response-privacy-boundary-guard.mjs",
  },
  {
    label: "public API request input guard",
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
  },
  {
    label: "public API session cookie/cache guard",
    script: "scripts/test-public-api-session-cookie-cache-boundary-guard.mjs",
  },
];

const loggingPatterns = [
  {
    label: "console logging",
    pattern: /\bconsole\.(?:log|info|warn|error|debug|trace|table|dir)\s*\(/,
  },
  {
    label: "process stream logging",
    pattern: /\bprocess\.(?:stdout|stderr)\.write\s*\(/,
  },
  {
    label: "telemetry capture logging",
    pattern: /\b(?:logger|auditLogger|telemetry|captureException|captureMessage|Sentry)\s*\./i,
  },
  {
    label: "raw request serialization",
    pattern: /\bJSON\.stringify\s*\(\s*(?:request|headers|body|token|cookie|rawError|error|err)\b/i,
  },
];

const routeRawErrorPatterns = [
  {
    label: "caught error binding",
    pattern: /\bcatch\s*\(\s*(?:error|err|e)\s*\)/i,
  },
  {
    label: "error message exposure",
    pattern: /\b(?:error|err|e)\.message\b/i,
  },
  {
    label: "error stack exposure",
    pattern: /\b(?:error|err|e)\.stack\b/i,
  },
  {
    label: "raw error JSON response",
    pattern: /\bResponse\.json\s*\(\s*(?:error|err|e)\b/i,
  },
  {
    label: "debug/error-detail response key",
    pattern: /\b(?:debug|raw_error|error_detail|errorDetails|stack)\s*:/i,
  },
];

const routeSafeFragments = [
  {
    path: "app/api/customer-booking-requests/route.ts",
    fragments: [
      "function safeFailureResponse()",
      "Booking request failed safely.",
      "function customerSafeError(rawError: string)",
      "catch {\n    return safeFailureResponse();\n  }",
    ],
  },
  {
    path: "app/api/customer-portal-sessions/route.ts",
    fragments: [
      "function safeFailureResponse()",
      "Customer portal session issue failed safely.",
      "function safeErrorResponse(result: { error: string; status: number })",
      "catch {\n    return safeFailureResponse();\n  }",
    ],
  },
  {
    path: "app/api/customer-saved-bookings/route.ts",
    fragments: [
      "function safeFailureResponse()",
      "Customer saved bookings read failed safely.",
      "customerSavedBookingsAuthRequiredResult",
      "catch {\n    return safeFailureResponse();\n  }",
    ],
  },
  {
    path: "app/api/customer-booking-memory/route.ts",
    fragments: [
      "function safeFailureResponse()",
      "Customer booking memory read failed safely.",
      "customerBookingMemoryAuthRequiredResult",
      "catch {\n    return safeFailureResponse();\n  }",
    ],
  },
  {
    path: "app/api/customer-booking-statuses/route.ts",
    fragments: [
      "function safeFailureResponse()",
      "Customer booking status lookup failed safely.",
      "customerBookingStatusAuthRequiredResult",
      "catch {\n    return safeFailureResponse();\n  }",
    ],
  },
  {
    path: "app/api/customer-app-notifications/route.ts",
    fragments: [
      "safeCustomerAuthRequiredResponse",
      "Customer app notifications require secure customer account auth.",
      "customerAppNotificationsRequireAuthResult",
    ],
  },
  {
    path: "app/api/driver-job/[token]/route.ts",
    fragments: [
      "const blockedStatusByReason",
      "reason: result.reason",
      "payload: null",
      "getProductionDriverJobPayloadForToken(token)",
      "getDriverJobPayloadForTokenContract",
    ],
  },
  {
    path: "app/api/driver-job/[token]/status/route.ts",
    fragments: [
      "const blockedStatusByReason",
      "reason: result.reason",
      "payload: null",
      "applyProductionDriverJobStatusUpdate",
      "applyDriverJobStatusUpdateContract",
    ],
  },
  {
    path: "app/api/driver-job/[token]/notifications/route.ts",
    fragments: [
      "function safeFailureResponse()",
      "Driver app notification request failed safely.",
      "loadDriverAppNotificationsForToken",
      "updateDriverAppNotificationStatusForToken",
      "catch {\n    return safeFailureResponse();\n  }",
    ],
  },
  {
    path: "app/api/driver-job/[token]/issue-alert/route.ts",
    fragments: [
      "function malformedIssueResponse()",
      "Driver issue alert details are malformed.",
      "function safeFailureResponse(status = 500)",
      "Driver issue alert failed safely.",
      "external_send: false",
    ],
  },
  {
    path: "app/api/driver-job/[token]/flight-eta-setup/route.ts",
    fragments: [
      "function safeFailureResponse()",
      "Driver flight ETA setup request failed safely.",
      "driver_job_scope: \"token_scoped\"",
      "catch {\n    return safeFailureResponse();\n  }",
    ],
  },
  {
    path: "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts",
    fragments: [
      "function safeFailureResponse()",
      "Driver flight ETA acknowledgement setup request failed safely.",
      "buildDriverFlightEtaAcknowledgementSetupFoundation",
      "catch {\n    return safeFailureResponse();\n  }",
    ],
  },
  {
    path: "app/api/driver-job-bids/route.ts",
    fragments: [
      "blockedDriverBidResponse",
      "Driver bidding requires approved driver auth before runtime access.",
      "driverBidRuntimeAccessBlocked",
    ],
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

function matchingLines(source, pattern) {
  return source
    .split(/\r?\n/)
    .map((line, index) => ({ index: index + 1, line }))
    .filter(({ line }) => pattern.test(line));
}

function assertNoLineMatches(source, pattern, label) {
  assert.deepEqual(
    matchingLines(source, pattern),
    [],
    `${label} must not have matching lines for ${pattern}.`,
  );
}

function runContractCheck({ label, script }) {
  const result = spawnSync(process.execPath, [script], {
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
  ...publicApiRoutePaths,
  ...publicApiHelperPaths,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const ledgerSection = sectionBetween(ledger, "### Public API Logging Error Boundary Guard Lock");

for (const phrase of [
  "Public customer/driver API logging and error-detail boundaries are guarded across customer booking request, customer portal session, customer saved bookings, customer booking memory, customer booking status, customer app notifications, driver job, driver job status, driver notifications, driver issue-alert, driver flight ETA setup, driver flight ETA acknowledgement setup, and driver bidding routes.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, or new shims.",
  "Public API route/helper sources must not use console logging, process stdout/stderr writes, telemetry capture calls, or raw request/body/header/token/cookie serialization.",
  "Public API route catch blocks must stay generic and must not return caught error messages, stacks, raw request data, headers, cookies, or tokens.",
  "Customer-facing error responses must stay mapped through safe fixed messages such as `customerSafeError`, auth-required results, and failed-safely fallbacks.",
  "Driver-facing error responses must stay limited to safe reason enums, setup-only blocked messages, auth-required bidding errors, malformed issue alerts, and failed-safely fallbacks.",
  "Existing helper code may classify provider/adapter failures internally but must return safe error strings/categories without logging raw errors.",
  "Public API logging/error contracts must continue coordinating source privacy, response privacy, request input, and session/cache guards.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-api-logging-error-boundary-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public API logging/error ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public API logging/error guard registration");

for (const sourcePath of [...publicApiRoutePaths, ...publicApiHelperPaths]) {
  const source = files[sourcePath];

  for (const { label, pattern } of loggingPatterns) {
    assertNoLineMatches(source, pattern, `${sourcePath} ${label}`);
  }
}

for (const routePath of publicApiRoutePaths) {
  const source = files[routePath];

  for (const { label, pattern } of routeRawErrorPatterns) {
    assertNoLineMatches(source, pattern, `${routePath} ${label}`);
  }

  assertExcludes(source, "request.headers.entries", `${routePath} raw header iteration`);
  assertExcludes(source, "Object.fromEntries(request.headers", `${routePath} raw header serialization`);
}

for (const { path, fragments } of routeSafeFragments) {
  const source = files[path];

  for (const fragment of fragments) {
    assertIncludes(source, fragment, `${path} safe error/logging fragment ${fragment}`);
  }
}

const notificationHelper = files["lib/customer-driver-app-notification-persistence.ts"];
for (const fragment of [
  "function safeAdapterFailure(",
  "category = \"permission_or_rls_denied\"",
  "category = \"column_missing\"",
  "category = \"table_unreachable\"",
  "error,",
  "ok: false",
]) {
  assertIncludes(notificationHelper, fragment, `notification helper safe failure fragment ${fragment}`);
}

for (const contractCheck of contractChecks) {
  runContractCheck(contractCheck);
}

console.log("Public API logging/error boundary guard passed");
