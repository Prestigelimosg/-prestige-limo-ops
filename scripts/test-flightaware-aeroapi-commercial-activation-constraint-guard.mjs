import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const routePath = "app/api/admin-flightaware-aeroapi-live-lookup-action/route.ts";
const helperPath = "lib/admin-flightaware-aeroapi-live-lookup-action.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const routePathFragment = "/api/admin-flightaware-aeroapi-live-lookup-action";
const gateEnvName = "PRESTIGE_FLIGHTAWARE_AEROAPI_LIVE_LOOKUP_ENABLED";
const guardScript =
  "scripts/test-flightaware-aeroapi-commercial-activation-constraint-guard.mjs";

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

const [ledger, routeSource, helperSource, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);
const combinedRouteHelper = `${routeSource}\n${helperSource}`;

for (const fragment of [
  "FlightAware/AeroAPI Commercial Activation Constraint Lock",
  "Owner has not approved the FlightAware company contract.",
  "Owner prefers usage/GET-style cost only and does not approve monthly/business service activation at this time.",
  "FlightAware AeroAPI business use may require Standard terms/monthly minimum, so the app must remain not-live until owner separately approves the company contract and cost model.",
  `Keep the internal app route as \`POST ${routePathFragment}\`, not GET, because it is an admin action with authorization and request payload.`,
  `The route must remain closed behind \`${gateEnvName}\`.`,
  "Future live evidence requires separate owner approval after company contract and cost approval.",
  "No live FlightAware/AeroAPI request, env change, token setup, provider credential read while the gate is closed, external request while the gate is closed, scheduler, polling, retry loop, customer-visible auto-refresh, monthly/business activation, deploy, DB write, provider send, Email/WhatsApp/SMS/Telegram, parser, Save Booking, `/api/admin-saved-bookings`, pricing/rates/payout/payment/PDF/billing, auth/location/photo/calendar/OTS, UI, or shim change is approved by this lock.",
]) {
  assertIncludes(ledger, fragment, `FlightAware commercial ledger lock ${fragment}`);
}

assertIncludes(routeSource, "export async function POST", "FlightAware route method");
assertExcludes(routeSource, /export\s+async\s+function\s+GET\b/, "FlightAware route GET method");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "FlightAware admin boundary");
assertIncludes(routeSource, "readJsonBody(request)", "FlightAware POST request payload");
assertIncludes(helperSource, gateEnvName, "FlightAware helper gate");

const gateCheckIndex = helperSource.indexOf("if (!lookupGateOpen())");
const tokenReadIndex = helperSource.indexOf("process.env.FLIGHTAWARE_AEROAPI_API_KEY");
const baseUrlReadIndex = helperSource.indexOf("process.env.FLIGHTAWARE_AEROAPI_BASE_URL");
const providerCallIndex = helperSource.indexOf("await fetchProvider");

assert.notEqual(gateCheckIndex, -1, "FlightAware helper must check the gate.");
assert.notEqual(tokenReadIndex, -1, "FlightAware helper must contain provider token read after gate.");
assert.notEqual(baseUrlReadIndex, -1, "FlightAware helper must contain provider base URL read after gate.");
assert.notEqual(providerCallIndex, -1, "FlightAware helper must contain provider fetch after gate/config.");
assert.ok(tokenReadIndex > gateCheckIndex, "Provider token read must stay after closed-gate check.");
assert.ok(baseUrlReadIndex > gateCheckIndex, "Provider base URL read must stay after closed-gate check.");
assert.ok(providerCallIndex > tokenReadIndex, "Provider fetch must stay after provider token validation.");

for (const fragment of [
  "monthly_plan",
  "business_plan",
  "billing_relationship",
  "company_contract_approved",
  "customerVisible: true",
  "setInterval",
  "setTimeout",
  "cron",
  "poll",
  "retry_enabled: true",
]) {
  assertExcludes(combinedRouteHelper, fragment, `FlightAware commercial runtime boundary`);
}

assertIncludes(preactivationSuite, guardScript, "Preactivation suite FlightAware commercial guard");

console.log("FlightAware AeroAPI commercial activation constraint guard passed");
