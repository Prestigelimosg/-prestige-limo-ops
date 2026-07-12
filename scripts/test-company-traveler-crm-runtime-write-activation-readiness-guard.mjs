import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const routePath = "app/api/admin-company-traveler-crm-runtime-write-action/route.ts";
const helperPath = "lib/admin-company-traveler-crm-runtime-write-action.ts";
const preflightRoutePath =
  "app/api/admin-company-traveler-crm-runtime-write-gate-preflight-setup/route.ts";
const preflightHelperPath = "lib/admin-company-traveler-crm-runtime-write-gate-preflight-setup.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript =
  "scripts/test-company-traveler-crm-runtime-write-activation-readiness-guard.mjs";
const routePathFragment = "/api/admin-company-traveler-crm-runtime-write-action";
const gateEnvName = "PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED";
const allowedCompanyFields = [
  "accounts_email",
  "billing_address",
  "billing_email",
  "company_name",
  "domain",
  "id",
  "main_phone",
  "mobile_phone",
  "operations_email",
  "primary_contact_name",
  "website",
];
const allowedTravelerFields = [
  "booker_contact",
  "booker_email",
  "booker_name",
  "company_id",
  "default_address",
  "default_dropoff_address",
  "default_pickup_address",
  "id",
  "preferred_vehicle",
  "traveler_name",
];
const forbiddenActivationFields = [
  "customer_rates",
  "driver_payout_rules",
  "customer_price",
  "driver_payout",
  "rate_override",
  "pricing",
  "price",
  "payout",
  "paynow",
  "pay_now",
  "payment",
  "billing_amount",
  "billing_status",
  "invoice",
  "pdf",
  "finance",
  "provider",
  "send_state",
  "send_log",
  "auth_session",
  "live_location",
  "location_url",
  "photo",
  "calendar",
  "internal_admin",
  "admin_notes",
  "parser_debug",
  "debug_payload",
  "mock_archive",
  "mock_qa",
  "service_role",
  "server_secret",
  "secret",
  "api_key",
  "access_token",
  "raw_token",
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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

function sliceFrom(source, startMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);

  return source.slice(start);
}

function assertBefore(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  assert.notEqual(firstIndex, -1, `${label} missing first marker: ${first}`);
  assert.notEqual(secondIndex, -1, `${label} missing second marker: ${second}`);
  assert.ok(firstIndex < secondIndex, `${label} expected ${first} before ${second}.`);
}

const [
  ledger,
  routeSource,
  helperSource,
  preflightRoute,
  preflightHelper,
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(preflightRoutePath, "utf8"),
  readFile(preflightHelperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Company/Traveler CRM Runtime Write Activation Readiness Guard Lock",
);

for (const phrase of [
  "Approval status: pending future owner approval; this lock does not approve opening `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`.",
  "This is a docs/test-only activation-readiness guard for `POST /api/admin-company-traveler-crm-runtime-write-action`.",
  "The company/traveler CRM identity/contact runtime boundary is already wired but remains closed by default through `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`.",
  "Allowed company activation scope remains limited to existing company `id`, action types `company_create` and `company_update`, and safe CRM identity fields only: `company_name` and `domain`.",
  "Allowed traveler activation scope remains limited to existing traveler `id`, action types `traveler_create` and `traveler_update`, and safe CRM identity/contact/default-address fields only: `company_id`, `traveler_name`, `preferred_vehicle`, `default_address`, `default_pickup_address`, `default_dropoff_address`, `booker_name`, `booker_contact`, and `booker_email`.",
  "Future gate opening requires separate owner approval naming the exact staging target, exact env gate name, no env values or secrets, `public.companies` and `public.travelers` table/policy proof for the safe CRM columns only, server-session admin/dispatcher proof, rollback/kill-switch proof, customer/driver finance visibility proof, and one bounded evidence window.",
  "Future staging target proof must confirm the project, URL, and commit hash before the gate is opened.",
  "Future table/policy proof must verify access for `public.companies` and `public.travelers` safe CRM identity/contact columns only and must not include rate overrides, `customer_rates`, `driver_payout_rules`, customer pricing, driver payout, PayNow payout details, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, parser/debug, secrets, tokens, or mock QA/dev archive fields.",
  "Future rollback/kill-switch proof must close `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED`, confirm the blocked/no-op response, and keep the legacy rate override fallback/manual recovery plan intact.",
  "Any future write attempt, if separately approved, must be one bounded company/traveler CRM identity/contact create or update through the existing route only.",
  "Required tests before any future activation:",
  "No env change, deployment, DB read/write execution, migration, provider/send, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/button/card, new shim, rate override activation, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, auth, location/photo/calendar activation, internal/admin notes, debug, secrets, PayNow, or mock QA/dev archive change is approved by this lock.",
  "This lock adds `scripts/test-company-traveler-crm-runtime-write-activation-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `CRM activation readiness phrase: ${phrase}`);
}

for (const command of [
  "node scripts/test-company-traveler-crm-runtime-write-activation-readiness-guard.mjs",
  "node scripts/test-company-traveler-crm-runtime-write-action-api-contract.mjs",
  "node scripts/test-company-traveler-crm-runtime-write-approval-packet.mjs",
  "node scripts/test-company-traveler-crm-runtime-write-env-table-policy-guard.mjs",
  "node scripts/test-company-traveler-crm-runtime-write-gate-preflight-setup-api-contract.mjs",
  "node scripts/test-company-traveler-crm-write-split-plan.mjs",
  "node scripts/test-company-traveler-crm-write-foundation-lock.mjs",
  "node scripts/test-admin-company-traveler-crm-identity-contact-write-contract.mjs",
  "node scripts/test-admin-company-traveler-crm-identity-contact-write-action-disabled-setup-api-contract.mjs",
  "node scripts/test-admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup-api-contract.mjs",
  "node scripts/test-crm-identity-rate-override-payload-split.mjs",
  "node scripts/test-rate-override-split-gating-plan.mjs",
  "node scripts/test-remaining-shim-parked-state-lock.mjs",
  "node scripts/test-shim-cleanup-no-new-shim-guard.mjs",
  "node scripts/test-preactivation-verification-suite.mjs",
  "npm run lint",
  "git diff --check",
  "git diff --cached --check",
  "git status --short",
]) {
  assertIncludes(ledgerSection, command, `Required CRM activation readiness test ${command}`);
}

for (const forbiddenApprovalPhrase of [
  "activation approved",
  "approved to open",
  "safe to open",
  "gate opened",
  "write gate opened",
  "write enabled now",
  "DB write approved",
  "live write approved",
  "production approved",
  "deployment approved",
  "migration approved",
  "rate override approved",
  "customer_rates approved",
  "driver_payout_rules approved",
  "pricing approved",
  "payout approved",
  "payment approved",
  "billing approved",
  "PayNow approved",
]) {
  assertExcludes(
    ledgerSection,
    forbiddenApprovalPhrase,
    `Forbidden CRM activation approval phrase ${forbiddenApprovalPhrase}`,
  );
}

assertIncludes(routeSource, "export const dynamic = \"force-dynamic\";", "CRM runtime route dynamic mode");
assertIncludes(routeSource, "export async function POST", "CRM runtime route POST");
for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(routeSource, `export async function ${method}`, `CRM runtime route ${method}`);
}
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "CRM runtime route admin boundary");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "CRM runtime route actor adapter");
assertIncludes(routeSource, "executeAdminCompanyTravelerCrmRuntimeWriteAction", "CRM runtime route helper");
const routePostBlock = sliceFrom(routeSource, "export async function POST");
assertBefore(
  routePostBlock,
  "const boundary = requireAdminDispatcherBoundary(request);",
  "executeAdminCompanyTravelerCrmRuntimeWriteAction",
  "CRM runtime route must validate admin/dispatcher boundary before helper execution",
);

assertIncludes(preflightRoute, "export async function GET", "CRM runtime preflight GET route");
assertExcludes(preflightRoute, "export async function POST", "CRM runtime preflight POST route");
assertIncludes(preflightHelper, "server-only", "CRM runtime preflight server-only helper");
assertIncludes(preflightHelper, gateEnvName, "CRM runtime preflight gate env name");
assertIncludes(preflightHelper, '"SUPABASE_URL"', "CRM runtime preflight Supabase URL env name");
assertIncludes(preflightHelper, '"SUPABASE_SERVICE_ROLE_KEY"', "CRM runtime preflight service role env name");
assertIncludes(preflightHelper, "env_values_visible: false", "CRM runtime preflight hides env values");
assertIncludes(preflightHelper, "database_client_enabled: false", "CRM runtime preflight DB client disabled");
assertExcludes(preflightHelper, "createClient", "CRM runtime preflight DB client");
assertExcludes(preflightHelper, "process.env", "CRM runtime preflight env value reads");

assertIncludes(helperSource, "server-only", "CRM runtime helper server-only boundary");
assertIncludes(helperSource, gateEnvName, "CRM runtime env gate name");
assertIncludes(helperSource, "const allowedActorRoles = new Set([\"admin\", \"dispatcher\"]);", "CRM runtime allowed actor roles");
assertIncludes(
  helperSource,
  '"id, company_name, domain, billing_address, main_phone, mobile_phone, website, primary_contact_name, billing_email, accounts_email, operations_email";',
  "CRM runtime company safe select",
);
assertIncludes(
  helperSource,
  "const travelerWriteSelect =\n  \"id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_name, booker_contact, booker_email\";",
  "CRM runtime traveler safe select",
);
assertIncludes(helperSource, "writeGateOpen()", "CRM runtime gate helper");
assertIncludes(helperSource, "actorCanWrite(actor)", "CRM runtime actor guard");
assertIncludes(helperSource, "boundary_mode === \"server-session-role-surface\"", "CRM runtime server-session boundary");
assertIncludes(helperSource, "allowedActorRoles.has(actor.actor_role)", "CRM runtime admin/dispatcher roles");
assertIncludes(helperSource, "source_surface === \"admin_api\"", "CRM runtime admin API surface");
assertIncludes(helperSource, "database_client_enabled: false", "CRM runtime default no DB client");
assertIncludes(helperSource, "reason: \"write_gate_closed\"", "CRM runtime closed gate default reason");
assertIncludes(helperSource, "no_op: true", "CRM runtime no-op default");
assertIncludes(helperSource, ".from(\"companies\")", "CRM runtime companies table access");
assertIncludes(helperSource, ".from(\"travelers\")", "CRM runtime travelers table access");
assertIncludes(helperSource, ".insert(payload)", "CRM runtime insert path");
assertIncludes(helperSource, ".update(payload)", "CRM runtime update path");
assertIncludes(helperSource, ".select(companyWriteSelect)", "CRM runtime company safe select call");
assertIncludes(helperSource, ".select(travelerWriteSelect)", "CRM runtime traveler safe select call");
assertExcludes(helperSource, "adminLegacyDataClient", "CRM runtime helper legacy data client");
assertExcludes(helperSource, "adminLegacyTables", "CRM runtime helper legacy table shim");
assertExcludes(helperSource, "/api/admin-legacy-data", "CRM runtime helper legacy route");
assertExcludes(helperSource, ".delete()", "CRM runtime helper delete path");
assertExcludes(helperSource, ".upsert(", "CRM runtime helper upsert path");
assertExcludes(helperSource, ".rpc(", "CRM runtime helper RPC path");

const executeBlock = sliceFrom(
  helperSource,
  "export async function executeAdminCompanyTravelerCrmRuntimeWriteAction",
);
assertBefore(executeBlock, "if (!writeGateOpen())", "if (!actorCanWrite(actor))", "CRM runtime gate before actor check");
assertBefore(executeBlock, "if (!actorCanWrite(actor))", "client = getRuntimeWriteClient(options)", "CRM runtime actor before DB client");
assertBefore(executeBlock, "client = getRuntimeWriteClient(options)", "await writeCompany", "CRM runtime DB client before company write");
assertBefore(executeBlock, "client = getRuntimeWriteClient(options)", "await writeTraveler", "CRM runtime DB client before traveler write");

const companyPayload = sliceBetween(helperSource, "function companyPayload", "function travelerPayload");
for (const field of allowedCompanyFields.filter((field) => field !== "id")) {
  assertIncludes(companyPayload, `company_fields.${field}`, `CRM company payload field ${field}`);
}
for (const forbiddenField of forbiddenActivationFields) {
  assertExcludes(companyPayload, forbiddenField, `CRM company payload forbidden field ${forbiddenField}`);
}

const travelerPayload = sliceBetween(helperSource, "function travelerPayload", "function toCompanyRecord");
for (const field of [
  "booker_contact",
  "booker_email",
  "booker_name",
  "company_id",
  "default_address",
  "default_dropoff_address",
  "default_pickup_address",
  "preferred_vehicle",
  "traveler_name",
]) {
  assertIncludes(travelerPayload, `traveler_fields.${field}`, `CRM traveler payload field ${field}`);
}
for (const forbiddenField of forbiddenActivationFields) {
  assertExcludes(travelerPayload, forbiddenField, `CRM traveler payload forbidden field ${forbiddenField}`);
}

const companySelectLine = helperSource.match(/const companyWriteSelect\s*=\s*\n?\s*"([^"]+)";/)?.[1] || "";
const travelerSelectLine = helperSource.match(/const travelerWriteSelect =\n\s+"([^"]+)";/)?.[1] || "";
for (const field of allowedCompanyFields) {
  assertIncludes(companySelectLine, field, `CRM company select field ${field}`);
}
for (const field of allowedTravelerFields) {
  assertIncludes(travelerSelectLine, field, `CRM traveler select field ${field}`);
}
for (const forbiddenField of forbiddenActivationFields) {
  assertExcludes(companySelectLine, forbiddenField, `CRM company select forbidden field ${forbiddenField}`);
  assertExcludes(travelerSelectLine, forbiddenField, `CRM traveler select forbidden field ${forbiddenField}`);
}

const crmRuntimeClientHelper = sliceBetween(
  appPage,
  "async function saveCompanyTravelerCrmIdentityContactRuntime",
  "function customerRatesRuntimeRejectedFields",
);
assertIncludes(appPage, `const adminCompanyTravelerCrmRuntimeWriteActionApiPath =\n  "${routePathFragment}";`, "app route path constant");
assertIncludes(crmRuntimeClientHelper, "fetch(adminCompanyTravelerCrmRuntimeWriteActionApiPath", "app CRM runtime fetch");
assertIncludes(crmRuntimeClientHelper, "payload: CompanyTravelerCrmIdentityContactRuntimePayload", "app CRM runtime payload type");
assertIncludes(crmRuntimeClientHelper, 'method: "POST"', "app CRM runtime POST");
assertIncludes(crmRuntimeClientHelper, '"x-prestige-admin-purpose": adminLegacyDataPurpose', "app CRM runtime admin purpose");
assertIncludes(crmRuntimeClientHelper, "isCrmRuntimeWriteBlockedNoOp", "app CRM closed-gate no-op");
assertExcludes(
  crmRuntimeClientHelper,
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|payment|billing|invoice|pdf|provider|auth_session|live_location|photo|calendar|internal_admin|admin_notes|debug_payload|secret|api_key|access_token/i,
  "app CRM runtime forbidden payload/API fields",
);

const saveRateOverride = sliceBetween(appPage, "async function saveRateOverride", "async function removeCompanyRateOverride");
assertIncludes(saveRateOverride, "saveCompanyTravelerCrmIdentityContactRuntime", "rate override flow CRM identity split");
assertIncludes(saveRateOverride, "buildCompanyCrmIdentityContactPayload", "rate override flow company CRM payload");
assertIncludes(saveRateOverride, "buildTravelerCrmIdentityContactPayload", "rate override flow traveler CRM payload");
assertIncludes(saveRateOverride, "buildCompanyRateOverridePayload", "rate override lane remains separate");
assertIncludes(saveRateOverride, "buildTravelerRateOverridePayload", "traveler rate override lane remains separate");
assertIncludes(saveRateOverride, "buildLegacyCompanyRateOverrideInsertPayload", "closed-gate company legacy fallback");
assertIncludes(saveRateOverride, "buildLegacyTravelerRateOverrideInsertPayload", "closed-gate traveler legacy fallback");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint remains unchanged");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM CRM runtime route separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, routePathFragment, "Parser route CRM runtime separation");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings CRM runtime separation");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings CRM runtime separation");
assertIncludes(preactivationSuite, guardScript, "Preactivation suite activation readiness guard registration");

console.log("company/traveler CRM runtime write activation readiness guard passed");
