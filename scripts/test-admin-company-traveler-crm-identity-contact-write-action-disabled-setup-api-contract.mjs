import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath =
  "app/api/admin-company-traveler-crm-identity-contact-write-action-disabled-setup/route.ts";
const helperPath =
  "lib/admin-company-traveler-crm-identity-contact-write-action-disabled-setup.ts";
const contractHelperPath =
  "lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts";
const readinessHelperPath = "lib/admin-company-traveler-crm-write-readiness-setup-foundation.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const setupApiPath =
  "/api/admin-company-traveler-crm-identity-contact-write-action-disabled-setup";
const setupApiName = "admin-company-traveler-crm-identity-contact-write-action-disabled-setup";
const helperExportName = "buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup";
const sourceFiles = [routePath, helperPath, contractHelperPath, readinessHelperPath, boundaryPath];
const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const forbiddenFields = [
  "customer_rates",
  "driver_payout_rules",
  "pricing_source",
  "driver_payout_amount",
  "surcharge_amount",
  "payment_link",
  "pdf_url",
  "billing_account",
  "provider_send",
  "auth_session",
  "live_location_url",
  "photo_proof",
  "calendar_event_id",
  "internal_admin_notes",
  "debug_payload",
];
const routeLivePattern =
  /export async function (POST|PUT|PATCH|DELETE)|@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const helperLivePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeSafeOutputPattern =
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|paynow|pay_now|payment|billing|invoice|pdf|finance|internal_admin|parser_debug|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyLocalAdminBoundary() {
  delete process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;
}

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

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(params = {}) {
  const url = new URL(`http://localhost${setupApiPath}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertDisabled(value, label) {
  assert.equal(value.actionEnabled, false, `${label} must keep actionEnabled false.`);
  assert.equal(value.action_enabled, false, `${label} must keep action_enabled false.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.live_write_enabled, false, `${label} must keep live_write_enabled false.`);
  assert.equal(value.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value.admin_review_required, true, `${label} must keep admin_review_required true.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
}

function assertBlockedNoOp(value, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, true, `${label} must be ok as a valid disabled action.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(value.no_op, true, `${label} must be no-op.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(
    value.delivery_surface,
    "company_traveler_crm_identity_contact_write_action_disabled_setup_only",
    `${label} must use the disabled action delivery surface.`,
  );
  assert.equal(
    value.contract_source,
    "admin-company-traveler-crm-identity-contact-write-contract-setup",
    `${label} must point to the typed contract source.`,
  );
  assert.equal(value.contract.ok, true, `${label} contract must be valid.`);
  assert.deepEqual(value.rejected_fields, [], `${label} must not reject safe fields.`);
}

function assertRejectedNoOp(value, expectedFields, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, false, `${label} must not be ok.`);
  assert.equal(value.status, "rejected", `${label} must be rejected.`);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.result_label, "rejected/no-op", `${label} must keep rejected/no-op label.`);
  assert.equal(value.contract.ok, false, `${label} contract must reject unsafe fields.`);

  for (const expectedField of expectedFields) {
    assert.ok(
      value.rejected_fields.includes(expectedField),
      `${label} must reject ${expectedField}.`,
    );
  }
}

function assertNoUnsafeSafeOutput(value, label) {
  assert.equal(
    unsafeSafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose rate override, payment, billing, payout, finance, parser, mock, token, or secret text.`,
  );
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText.replace(/require\("([^"]+)\.ts"\)/g, 'require("$1.js")');
}

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-identity-contact-action-disabled-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: require(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    route: require(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const [routeSource, helperSource, appPage, aiParseRoute, adminSavedBookingsRoute, preactivationSuite] =
  await Promise.all([
    readFile(routePath, "utf8"),
    readFile(helperPath, "utf8"),
    readFile(appPagePath, "utf8"),
    readFile(aiParseRoutePath, "utf8"),
    readFile(adminSavedBookingsRoutePath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);

assertIncludes(routeSource, "export async function GET", "Disabled CRM identity/contact action route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Disabled CRM identity/contact action route");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Disabled CRM identity/contact action route");
assertIncludes(routeSource, helperExportName, "Disabled CRM identity/contact action route");
assertExcludes(routeSource, routeLivePattern, "Disabled CRM identity/contact action route");

assertIncludes(helperSource, "server-only", "Disabled CRM identity/contact action helper");
assertIncludes(helperSource, helperExportName, "Disabled CRM identity/contact action helper");
assertIncludes(
  helperSource,
  "buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup",
  "Disabled CRM identity/contact action helper",
);
assertIncludes(helperSource, "writeEnabled: false", "Disabled CRM identity/contact action helper");
assertIncludes(helperSource, "liveWriteEnabled: false", "Disabled CRM identity/contact action helper");
assertIncludes(helperSource, "external_send: false", "Disabled CRM identity/contact action helper");
assertExcludes(helperSource, helperLivePattern, "Disabled CRM identity/contact action helper");

assertExcludes(appPage, setupApiName, "App page must not wire disabled CRM identity/contact action API");
assertExcludes(appPage, helperExportName, "App page must not import disabled CRM identity/contact action helper");
assertExcludes(aiParseRoute, setupApiName, "AI parse route");
assertExcludes(aiParseRoute, helperExportName, "AI parse route");
assertExcludes(adminSavedBookingsRoute, setupApiName, "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, helperExportName, "Admin saved bookings route");
assertIncludes(
  preactivationSuite,
  "scripts/test-admin-company-traveler-crm-identity-contact-write-action-disabled-setup-api-contract.mjs",
  "Preactivation suite disabled CRM identity/contact action entry",
);

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup } = harness.helper;
  const companyAction = buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup({
    action_type: "company_create",
    company_name: "ACME Holdings",
    domain: "example.com",
  });

  assertBlockedNoOp(companyAction, "Company helper action");
  assert.equal(companyAction.actionType, "company_create");
  assert.equal(companyAction.company_fields.company_name, "ACME Holdings");
  assertNoUnsafeSafeOutput(companyAction, "Company helper action");

  const forbiddenAction = buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup({
    action_type: "company_create",
    company_name: "Safe Company",
    customer_rates: "{}",
    driver_payout_rules: "{}",
    pricing_source: "manual",
    driver_payout_amount: "75",
    surcharge_amount: "20",
    payment_link: "https://pay.example.invalid",
    pdf_url: "https://pdf.example.invalid",
    billing_account: "finance",
    provider_send: "email",
    auth_session: "token",
    live_location_url: "https://map.example.invalid",
    photo_proof: "image",
    calendar_event_id: "calendar",
    internal_admin_notes: "hidden",
    debug_payload: "debug",
  });

  assertRejectedNoOp(forbiddenAction, forbiddenFields, "Forbidden helper action");

  const routeSuccess = await harness.route.GET(
    new Request(
      apiUrl({
        action_type: "traveler_update",
        booker_contact: "+65 8123 4567",
        booker_email: "Booker@Example.com",
        booker_name: "Ops Booker",
        company_id: "42",
        default_dropoff_address: "Raffles Hotel Singapore",
        default_pickup_address: "Changi Airport Terminal 3",
        preferred_vehicle: "Vellfire",
        traveler_id: "901",
        traveler_name: "Safe Traveler",
      }),
      { headers: adminHeaders() },
    ),
  );
  const routeSuccessBody = await routeSuccess.json();

  assert.equal(routeSuccess.status, 200);
  assert.equal(routeSuccessBody.ok, true);
  assertBlockedNoOp(routeSuccessBody.result, "Route traveler action");
  assert.equal(routeSuccessBody.result.actionType, "traveler_update");
  assert.equal(routeSuccessBody.result.traveler_fields.booker_email, "booker@example.com");
  assertNoUnsafeSafeOutput(routeSuccessBody, "Route traveler action");

  const routeForbidden = await harness.route.GET(
    new Request(
      apiUrl({
        action_type: "company_create",
        company_name: "Safe Company",
        customer_rates: "{}",
        driver_payout_rules: "{}",
        pricing_source: "manual",
      }),
      { headers: adminHeaders() },
    ),
  );
  const routeForbiddenBody = await routeForbidden.json();

  assert.equal(routeForbidden.status, 400);
  assert.equal(routeForbiddenBody.ok, false);
  assertRejectedNoOp(
    routeForbiddenBody.result,
    ["customer_rates", "driver_payout_rules", "pricing_source"],
    "Route forbidden action",
  );

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymousBody = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403);
  assert.equal(anonymousBody.ok, false);
  assert.equal(anonymousBody.status, "blocked");
  assert.equal(anonymousBody.error, routeBlockedMessage);
  assertDisabled(anonymousBody.result, "Anonymous route fallback result");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin company/traveler CRM identity/contact disabled write action API contract passed");
