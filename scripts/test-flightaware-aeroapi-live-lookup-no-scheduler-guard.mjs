import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = "app/api/admin-flightaware-aeroapi-live-lookup-action/route.ts";
const helperPath = "lib/admin-flightaware-aeroapi-live-lookup-action.ts";
const publicDriverFlightEtaSetupPath = "app/api/driver-job/[token]/flight-eta-setup/route.ts";
const publicDriverFlightEtaAcknowledgementPath =
  "app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts";
const driverPagePath = "app/driver-job/[token]/page.tsx";
const appPagePath = "app/page.tsx";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const saveBookingRoutePath = "app/api/admin-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";
const routePathFragment = "/api/admin-flightaware-aeroapi-live-lookup-action";
const helperName = "executeAdminFlightAwareAeroApiLiveLookupAction";
const guardScript = "scripts/test-flightaware-aeroapi-live-lookup-no-scheduler-guard.mjs";

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

const [
  routeSource,
  helperSource,
  publicDriverFlightEtaSetup,
  publicDriverFlightEtaAcknowledgement,
  driverPage,
  appPage,
  adminSavedBookingsRoute,
  saveBookingRoute,
  aiParseRoute,
  preactivationSuite,
  ledger,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(publicDriverFlightEtaSetupPath, "utf8"),
  readFile(publicDriverFlightEtaAcknowledgementPath, "utf8"),
  readFile(driverPagePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(saveBookingRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);
const combined = `${routeSource}\n${helperSource}`;

for (const fragment of [
  "database_persistence_enabled: false",
  "customer_update_enabled: false",
  "scheduler_enabled: false",
  "retry_enabled: false",
  "provider_request_count: 0",
  "provider_request_count: 1",
  "AbortSignal.timeout",
  "providerFetch",
  "customerVisible: false",
]) {
  assertIncludes(helperSource, fragment, `FlightAware no-scheduler helper ${fragment}`);
}

for (const fragment of [
  "setInterval",
  "setTimeout",
  "cron",
  "schedule(",
  "scheduler.schedule",
  "queueMicrotask",
  "Worker(",
  "new Worker",
  "while (",
  "for await",
  "Promise.all",
  "Promise.race",
  "sendMessage",
  "send_message",
  "createClient",
  "@supabase/supabase-js",
  ".from(",
  ".insert(",
  ".upsert(",
  ".update(",
  ".delete(",
  "/api/admin-saved-bookings",
  "/api/admin-bookings",
  "/api/ai-parse",
  "adminLegacyDataClient",
  "adminLegacyTables",
  "/api/admin-legacy-data",
]) {
  assertExcludes(combined, fragment, `FlightAware live lookup route/helper boundary`);
}

assertExcludes(combined, /export\s+async\s+function\s+(GET|PUT|PATCH|DELETE)\b/, "FlightAware live lookup route method surface");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "FlightAware live lookup admin boundary");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "FlightAware live lookup admin purpose boundary");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "FlightAware live lookup actor conversion");

for (const [label, source] of [
  ["public driver flight ETA setup route", publicDriverFlightEtaSetup],
  ["public driver flight ETA acknowledgement route", publicDriverFlightEtaAcknowledgement],
  ["public driver job page", driverPage],
  ["admin app page", appPage],
  ["admin saved bookings route", adminSavedBookingsRoute],
  ["Save Booking route", saveBookingRoute],
  ["AI parser route", aiParseRoute],
]) {
  assertExcludes(source, routePathFragment, `${label} must not call FlightAware live lookup route`);
  assertExcludes(source, helperName, `${label} must not import FlightAware live lookup helper`);
}

for (const fragment of [
  "FlightAware/AeroAPI Gated Live Lookup Contract Lock",
  "no scheduler, cron, queue, polling loop, server retry, provider send, notification send, DB persistence",
  "separate owner-approved staging evidence pass",
]) {
  assertIncludes(ledger, fragment, `FlightAware live lookup ledger lock ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "Preactivation suite FlightAware no-scheduler guard");

console.log("FlightAware AeroAPI live lookup no-scheduler guard passed");
