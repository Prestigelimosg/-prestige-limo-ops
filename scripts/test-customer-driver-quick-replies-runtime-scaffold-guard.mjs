import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const helperPath = "lib/customer-driver-app-notification-persistence.ts";
const readinessGuardPath =
  "scripts/test-customer-driver-quick-replies-readiness-contract-guard.mjs";
const guardScript =
  "scripts/test-customer-driver-quick-replies-runtime-scaffold-guard.mjs";
const customerRoutePath = "app/api/customer-driver-quick-replies/route.ts";
const driverRoutePath = "app/api/driver-job/[token]/quick-replies/route.ts";

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

function assertBefore(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  assert.notEqual(firstIndex, -1, `${label} missing first marker ${first}.`);
  assert.notEqual(secondIndex, -1, `${label} missing second marker ${second}.`);
  assert.equal(firstIndex < secondIndex, true, `${label} must check ${first} before ${second}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [
  ledger,
  preactivationSuite,
  helper,
  readinessGuard,
  customerRoute,
  driverRoute,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(readinessGuardPath, "utf8"),
  readFile(customerRoutePath, "utf8"),
  readFile(driverRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Customer/Driver Quick Replies Disabled Runtime Scaffold Lock",
);
const activationSection = sectionBetween(
  ledger,
  "### Single-Booking Customer/Driver Quick-Reply Production Activation",
);

for (const phrase of [
  "ADM-20260712015729",
  "verified saved customer account reference `128`",
  "Broad/all-customer activation remains forbidden.",
  "I am at the lobby.",
  "I have arrived.",
  "did not expose the customer’s driver-directed row or any private Admin → Driver row",
  "Rollback is to disable `PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED`",
]) {
  assertIncludes(activationSection, phrase, `quick reply production activation evidence ${phrase}`);
}

for (const phrase of [
  "disabled-by-default runtime scaffold",
  "This lane does not run quick-reply evidence, open env gates, change env values, deploy, activate runtime, add UI, write DB rows",
  "`PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED=true`",
  "`PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE=controlled-runtime`",
  "Closed quick-reply gate returns a safe no-op response with `external_send: false`, `provider_send: false`, no provider send, no notification row write, and no Supabase client access.",
  "Customer -> Driver route scaffold: `POST /api/customer-driver-quick-replies`.",
  "Customer -> Driver requires same-origin `/my-bookings`, `x-prestige-customer-purpose: customer-driver-quick-reply`",
  "Customer -> Driver can later write only one `driver_app` outbox notification",
  "Driver -> Customer route scaffold: `POST /api/driver-job/[token]/quick-replies`.",
  "Driver -> Customer requires the existing driver job token boundary",
  "Driver -> Customer can later write only one `customer_app` outbox notification",
  "Both directions must check the latest persisted `driver_job_status_events` status and block when the job has reached `pob` or `completed`.",
  "No free-form message composer, textarea, customer-driver chat box, phone number exposure",
  "Future quick-reply evidence remains separate",
  "This scaffold is guarded by `scripts/test-customer-driver-quick-replies-runtime-scaffold-guard.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `quick reply runtime ledger phrase: ${phrase}`);
}

for (const phrase of [
  "I am at the lobby.",
  "I am running 5 minutes late.",
  "Please wait at pickup point.",
  "I cannot find the car.",
  "I am on the way.",
  "I have arrived.",
  "Please meet me at pickup point.",
  "I am waiting nearby.",
]) {
  assertIncludes(ledgerSection, phrase, `quick reply ledger fixed template ${phrase}`);
  assertIncludes(helper, phrase, `quick reply helper fixed template ${phrase}`);
}

for (const fragment of [
  guardScript,
  readinessGuardPath,
]) {
  assertIncludes(preactivationSuite, fragment, `preactivation guard ${fragment}`);
}

for (const fragment of [
  "customerDriverQuickRepliesRuntimeVersion",
  "stage-customer-driver-quick-replies-runtime-v1",
  "PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED",
  "PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE",
  "controlled-runtime",
  "sendCustomerQuickReplyToDriver",
  "sendDriverQuickReplyToCustomer",
  "resolveCustomerDriverQuickRepliesRuntimeGate",
  "resolveCustomerQuickReplyRuntimeBoundary",
  "isCustomerPortalAccessToken(providedToken.token)",
  "resolveCustomerPortalAccessSession",
  "customer-driver-quick-reply",
  "resolveExactTwoCustomerRuntimeSessionMap",
  "verifyControlledCustomerBookingReference",
  "loadCustomerAccountReferenceForBooking",
  "resolveDriverLinkScope",
  "driver_job_status_events",
  "driverJobStatusEventQuickReplySelect",
  'latestStatus === "pob" || latestStatus === "completed"',
  "customer_driver_app_notification_outbox",
  'delivery_surface: direction === "customer_to_driver" ? "driver_app" : "customer_app"',
  'safe_title: direction === "customer_to_driver" ? "Passenger reply" : "Driver reply"',
  'workflow_area: "customer_driver_quick_replies"',
  "findForbiddenFieldNames(payload)",
  "findForbiddenTextValues(payload)",
  "external_send: false",
  "provider_send: false",
]) {
  assertIncludes(helper, fragment, `quick reply helper fragment ${fragment}`);
}

const customerSendSection = helper.slice(
  helper.indexOf("export async function sendCustomerQuickReplyToDriver"),
  helper.indexOf("export async function sendDriverQuickReplyToCustomer"),
);
const driverSendSection = helper.slice(
  helper.indexOf("export async function sendDriverQuickReplyToCustomer"),
  helper.indexOf("export function parseCustomerDriverAppNotificationCreatePayload"),
);

assertBefore(
  customerSendSection,
  "resolveCustomerDriverQuickRepliesRuntimeGate()",
  "getCustomerInAppNotificationReadClient()",
  "customer quick reply route",
);
assertBefore(
  driverSendSection,
  "resolveCustomerDriverQuickRepliesRuntimeGate()",
  "getDriverNotificationClient()",
  "driver quick reply route",
);

for (const fragment of [
  "sendCustomerQuickReplyToDriver",
  "export async function POST",
  "readJsonBody",
]) {
  assertIncludes(customerRoute, fragment, `customer quick reply route fragment ${fragment}`);
}

for (const fragment of [
  "sendDriverQuickReplyToCustomer",
  "type DriverJobQuickReplyRouteContext",
  "params: Promise",
  "export async function POST",
]) {
  assertIncludes(driverRoute, fragment, `driver quick reply route fragment ${fragment}`);
}

for (const routeSource of [customerRoute, driverRoute]) {
  for (const forbiddenExport of [
    "export async function GET",
    "export async function PATCH",
    "export async function PUT",
    "export async function DELETE",
  ]) {
    assertExcludes(routeSource, forbiddenExport, "quick reply routes are POST-only");
  }
}

for (const forbidden of [
  "runtime quick replies are live now",
  "all customers can message all drivers",
  "free-form customer-driver chat is approved",
  "phone numbers may be exposed",
  "WhatsApp quick replies are approved",
  "Telegram quick replies are approved",
  "SMS quick replies are approved",
  "Email quick replies are approved",
]) {
  assertExcludes(ledgerSection, forbidden, "forbidden quick reply runtime ledger phrase");
}

const runtimeSource = `${helper}\n${customerRoute}\n${driverRoute}`;

for (const forbiddenPattern of [
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']|require\(\s*["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']\s*\)|new\s+Resend|sendMail\s*\(|messages\.send|client\.messages\.create|fetch\s*\(\s*["']https?:\/\/(?:api\.telegram\.org|[^"']*twilio|[^"']*whatsapp)/i,
  /textarea|freeform|free-form|chat_box|chatBox|messageComposer/i,
]) {
  assertExcludes(runtimeSource, forbiddenPattern, "quick reply runtime source");
}

assertIncludes(
  readinessGuard,
  "Customer/Driver Quick Replies readiness contract guard passed",
  "existing readiness guard remains present",
);

console.log("Customer/Driver Quick Replies runtime scaffold guard passed");
