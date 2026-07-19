import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-driver-flight-eta-setup-surface-guard.mjs";

const driverPagePath = "app/driver-job/[token]/page.tsx";
const flightEtaSetupRoutePath = "app/api/driver-job/[token]/flight-eta-setup/route.ts";
const flightEtaAcknowledgementRoutePath =
  "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts";
const flightEtaSetupHelperPath = "lib/admin-flight-api-setup-foundation.ts";
const flightEtaAcknowledgementHelperPath =
  "lib/driver-flight-eta-acknowledgement-setup-foundation.ts";

const contractChecks = [
  {
    label: "driver flight ETA setup API contract",
    script: "scripts/test-driver-flight-eta-setup-api-contract.mjs",
    requiredFragments: [
      "token_scoped",
      "driver_eta_notification_status",
      "driver_eta_acknowledgement_status",
      "driver flight ETA setup API contract passed",
    ],
  },
  {
    label: "driver flight ETA acknowledgement setup API contract",
    script: "scripts/test-driver-flight-eta-acknowledgement-setup-api-contract.mjs",
    requiredFragments: [
      "acknowledgement_status",
      "future_resend_attempts_before_admin_escalation: 2",
      "driver flight ETA acknowledgement setup API contract passed",
    ],
  },
  {
    label: "public API method surface boundary guard",
    script: "scripts/test-public-api-method-surface-boundary-guard.mjs",
    requiredFragments: [
      "driver flight ETA setup method contract",
      "driver flight ETA acknowledgement setup method contract",
      "Public customer/driver API method surfaces are guarded",
    ],
  },
  {
    label: "public API response privacy boundary guard",
    script: "scripts/test-public-api-response-privacy-boundary-guard.mjs",
    requiredFragments: [
      "driver flight ETA setup response contract",
      "driver flight ETA acknowledgement setup response contract",
      "Public customer/driver API response privacy is guarded",
    ],
  },
  {
    label: "public API request input boundary guard",
    script: "scripts/test-public-api-request-input-boundary-guard.mjs",
    requiredFragments: [
      "driver flight ETA setup",
      "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts",
      "Public customer/driver API request input boundaries are guarded",
    ],
  },
  {
    label: "public API runtime gate boundary guard",
    script: "scripts/test-public-api-runtime-gate-boundary-guard.mjs",
    requiredFragments: [
      "driver flight ETA setup",
      "driver flight ETA acknowledgement setup",
      "Public customer/driver API runtime gate and dependency boundaries are guarded",
    ],
  },
  {
    label: "public API logging/error boundary guard",
    script: "scripts/test-public-api-logging-error-boundary-guard.mjs",
    requiredFragments: [
      "driver flight ETA setup",
      "driver flight ETA acknowledgement setup",
      "Public customer/driver API logging and error-detail boundaries are guarded",
    ],
  },
  {
    label: "public API session cookie/cache boundary guard",
    script: "scripts/test-public-api-session-cookie-cache-boundary-guard.mjs",
    requiredFragments: [
      "driver flight ETA setup",
      "Driver public APIs must remain cookie-free",
      "Public API session cookie/cache boundary guard passed",
    ],
  },
];

const unsafePublicOutputPattern =
  /customer[_ -]?price|quoted[_ -]?price|billing|invoice|paynow|pay\s+now|payment|driver[_ -]?payout|payout|payout comparison|finance|internal[_ -]?(?:admin|finance)|admin[_ -]?note|mock[_ -]?(?:qa|archive)|parser[_ -]?debug|raw_ai|token_hash|server_secret|service_role/i;

const forbiddenRuntimeFragments = [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "createClient",
  "supabase",
  ".from(",
  ".insert(",
  ".upsert(",
  ".update(",
  ".delete(",
  "process.env",
  "sendMessage",
  "telegram",
  "whatsapp",
  "sms",
  "email",
  "geolocation",
  "getCurrentPosition",
  "mediaDevices",
  "FormData",
  "createObjectURL",
];

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.toLowerCase().includes(String(fragmentOrPattern).toLowerCase());

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

function runContractCheck({ label, script, requiredFragments }) {
  const scriptSource = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(scriptSource, fragment, `${label} contract fragment`);
  }

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
  driverPagePath,
  flightEtaSetupRoutePath,
  flightEtaAcknowledgementRoutePath,
  flightEtaSetupHelperPath,
  flightEtaAcknowledgementHelperPath,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const driverPage = files[driverPagePath];
const flightEtaSetupRoute = files[flightEtaSetupRoutePath];
const flightEtaAcknowledgementRoute = files[flightEtaAcknowledgementRoutePath];
const flightEtaSetupHelper = files[flightEtaSetupHelperPath];
const flightEtaAcknowledgementHelper = files[flightEtaAcknowledgementHelperPath];
const ledgerSection = sectionBetween(ledger, "### Public Driver Flight ETA Setup Surface Guard Lock");

for (const phrase of [
  "Public driver Flight ETA setup surfaces are guarded across `/api/driver-job/[token]/flight-eta-setup`, `/api/driver-job/[token]/flight-eta-acknowledgement-setup`, `lib/admin-flight-api-setup-foundation.ts`, `lib/driver-flight-eta-acknowledgement-setup-foundation.ts`, and the public driver job page.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, auth activation, live location/photo activation, FlightAware live lookup, or new shims.",
  "`/api/driver-job/[token]/flight-eta-setup` must remain token-scoped, GET-only, setup-only, and limited to safe setup statuses: customer update status, driver ETA notification status, driver ETA acknowledgement status, future MNG/Arrival eligibility, future driver notification minutes, and future admin-and-driver-only scope.",
  "`/api/driver-job/[token]/flight-eta-acknowledgement-setup` must remain token-scoped, GET-only, setup-only, and limited to disabled acknowledgement/action/resend/admin-escalation statuses, MNG/Arrival-only eligibility, future before-OTW acknowledgement, 2-attempt escalation rule, and replacement-driver admin action wording.",
  "Both routes must not call external flight providers, send notifications, create Supabase clients, read env, set cookies, parse request bodies, submit forms, call geolocation/media/file APIs, or execute DB reads/writes.",
  "The public driver job page must not call the Flight ETA setup or acknowledgement setup routes until separate Flight ETA activation/UI approval exists.",
  "Driver Flight ETA setup surfaces must exclude customer price, billing, invoice/payment/PDF, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.",
  "This guard coordinates the driver flight ETA setup API contract, driver flight ETA acknowledgement setup API contract, public API method guard, request input guard, response privacy guard, runtime gate guard, logging/error guard, and session cookie/cache guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-driver-flight-eta-setup-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public driver Flight ETA setup ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation public driver Flight ETA setup guard registration");

for (const check of contractChecks) {
  runContractCheck(check);
}

assert.deepEqual(exportedMethods(flightEtaSetupRoute), ["GET"], "Flight ETA setup route exported methods");
assert.deepEqual(
  exportedMethods(flightEtaAcknowledgementRoute),
  ["GET"],
  "Flight ETA acknowledgement setup route exported methods",
);

for (const fragment of [
  "const { token } = await context.params;",
  "if (!hasText(token))",
  "buildAdminFlightApiSetupFoundation({",
  "driver_job_scope: \"token_scoped\"",
  "flight_eta_status: setup.live_eta_status",
  "future_driver_eta_notification_scope: setup.future_driver_eta_notification_scope",
]) {
  assertIncludes(flightEtaSetupRoute, fragment, `Flight ETA setup route ${fragment}`);
}

for (const fragment of [
  "const { token } = await context.params;",
  "if (!hasText(token))",
  "buildDriverFlightEtaAcknowledgementSetupFoundation({",
  "driver_job_token: token",
  "return Response.json({",
  "setup,",
]) {
  assertIncludes(flightEtaAcknowledgementRoute, fragment, `Flight ETA acknowledgement route ${fragment}`);
}

for (const fragment of [
  "status: \"setup_only\"",
  "flight_api_status: \"disabled\"",
  "provider_lookup_status: \"disabled\"",
  "live_eta_status: \"disabled\"",
  "driver_eta_notification_status: \"disabled\"",
  "driver_eta_acknowledgement_status: \"disabled\"",
  "customer_update_status: \"disabled\"",
  "future_driver_eta_notification_minutes_before_pickup: 60",
  "future_driver_eta_notification_scope: \"admin_and_driver_only\"",
  "No external request is performed.",
]) {
  assertIncludes(flightEtaSetupHelper, fragment, `Flight ETA setup helper ${fragment}`);
}

for (const fragment of [
  "status: \"setup_only\"",
  "acknowledgement_status: \"disabled\"",
  "driver_action_status: \"disabled\"",
  "resend_status: \"disabled\"",
  "admin_escalation_status: \"disabled\"",
  "service_eligibility: \"mng_arrival_only\"",
  "future_required_before_otw: true",
  "future_resend_attempts_before_admin_escalation: 2",
  "future_admin_action: \"get_replacement_driver\"",
  "customer_update_status: \"disabled\"",
]) {
  assertIncludes(flightEtaAcknowledgementHelper, fragment, `Flight ETA acknowledgement helper ${fragment}`);
}

const combinedRoutes = `${flightEtaSetupRoute}\n${flightEtaAcknowledgementRoute}`;
const combinedRoutesAndHelpers = `${combinedRoutes}\n${flightEtaSetupHelper}\n${flightEtaAcknowledgementHelper}`;

for (const fragment of forbiddenRuntimeFragments) {
  assertExcludes(combinedRoutes, fragment, `Flight ETA setup public routes runtime fragment`);
}

assertExcludes(combinedRoutesAndHelpers, unsafePublicOutputPattern, "Flight ETA setup public surface unsafe output");
assertExcludes(flightEtaSetupRoute, "admin_eta_monitoring_status", "Flight ETA setup public route admin-only status");

for (const fragment of [
  "/flight-eta-setup",
  "/flight-eta-acknowledgement-setup",
  "FlightAware",
  "mediaDevices",
]) {
  assertExcludes(driverPage, fragment, `public driver page Flight ETA setup caller fragment`);
}
assertIncludes(
  driverPage,
  'openDriverCalendarImport(`/api/driver-job/${encodeURIComponent(token)}/calendar`)',
  "public driver page approved same-origin calendar import handoff",
);

console.log("Public driver Flight ETA setup surface guard passed");
