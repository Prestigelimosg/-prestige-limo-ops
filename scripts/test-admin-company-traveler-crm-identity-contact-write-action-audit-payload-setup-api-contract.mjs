import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath =
  "app/api/admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup/route.ts";
const helperPath =
  "lib/admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup.ts";
const disabledActionHelperPath =
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
  "/api/admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup";
const setupApiName =
  "admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup";
const helperExportName =
  "buildAdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetup";
const sourceFiles = [
  routePath,
  helperPath,
  disabledActionHelperPath,
  contractHelperPath,
  readinessHelperPath,
  boundaryPath,
];
const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const routeLivePattern =
  /export async function (POST|PUT|PATCH|DELETE)|@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const helperLivePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeAuditOutputPattern =
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|paynow|pay_now|payment|billing_account|billing_amount|billing_status|invoice|pdf|finance|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
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

function assertDisabledAudit(value, label) {
  assert.equal(value.actionEnabled, false, `${label} must keep actionEnabled false.`);
  assert.equal(value.action_enabled, false, `${label} must keep action_enabled false.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.live_write_enabled, false, `${label} must keep live_write_enabled false.`);
  assert.equal(value.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value.admin_review_required, true, `${label} must keep admin_review_required true.`);
  assert.equal(value.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value.audit_write_enabled, false, `${label} must keep audit_write_enabled false.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
}

function assertAuditPayload(value, label) {
  assertDisabledAudit(value, label);
  assert.equal(
    value.delivery_surface,
    "company_traveler_crm_identity_contact_write_action_audit_payload_setup_only",
    `${label} must use the audit payload setup delivery surface.`,
  );
  assert.equal(
    value.contract_source,
    "admin-company-traveler-crm-identity-contact-write-contract-setup",
    `${label} must point to the typed contract source.`,
  );
  assert.ok(Array.isArray(value.safe_field_names), `${label} must expose safe field names.`);
  assert.ok(Array.isArray(value.company_field_names), `${label} must expose company field names.`);
  assert.ok(Array.isArray(value.traveler_field_names), `${label} must expose traveler field names.`);
  assert.equal(
    Object.hasOwn(value, "company_fields"),
    false,
    `${label} must not expose raw company field values.`,
  );
  assert.equal(
    Object.hasOwn(value, "traveler_fields"),
    false,
    `${label} must not expose raw traveler field values.`,
  );
  if (Object.hasOwn(value, "audit_payload")) {
    assert.deepEqual(
      Object.keys(value.audit_payload).filter((key) => key.endsWith("_fields")),
      [],
      `${label} nested audit payload must not expose raw field value maps.`,
    );
  }
  assertNoUnsafeAuditOutput(value, label);
}

function assertNoUnsafeAuditOutput(value, label) {
  assert.equal(
    unsafeAuditOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose forbidden field names, rate, payout, payment, billing, parser, mock, token, secret, or debug text.`,
  );
}

function assertBlockedAudit(value, label) {
  assertAuditPayload(value, label);
  assert.equal(value.ok, true, `${label} must be ok as a valid disabled audit setup.`);
  assert.equal(value.status, "blocked", `${label} must keep disabled action status blocked.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(value.disabledActionStatus, "blocked", `${label} must summarize blocked action status.`);
  assert.equal(
    value.rejectedForbiddenFieldCount,
    0,
    `${label} must not have forbidden-field rejections.`,
  );
  assert.deepEqual(value.safe_field_names, value.audit_payload.safe_field_names);
  assertAuditPayload(value.audit_payload, `${label} nested audit payload`);
}

function assertRejectedAudit(value, label) {
  assertAuditPayload(value, label);
  assert.equal(value.ok, false, `${label} must not be ok.`);
  assert.equal(value.status, "rejected", `${label} must reject unsafe input.`);
  assert.equal(value.result_label, "rejected/no-op", `${label} must keep rejected/no-op label.`);
  assert.equal(value.disabledActionStatus, "rejected", `${label} must summarize rejected action status.`);
  assert.ok(
    value.rejectedForbiddenFieldCount > 0,
    `${label} must count rejected forbidden fields without echoing names.`,
  );
  assert.equal(
    value.rejectedForbiddenFieldSummary,
    "forbidden_fields_rejected",
    `${label} must summarize forbidden-field rejection.`,
  );
  assertAuditPayload(value.audit_payload, `${label} nested audit payload`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-identity-contact-audit-payload-"));
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

const [
  routeSource,
  helperSource,
  appPage,
  aiParseRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(routeSource, "export async function GET", "CRM identity/contact audit payload route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "CRM identity/contact audit payload route");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "CRM identity/contact audit payload route");
assertIncludes(routeSource, helperExportName, "CRM identity/contact audit payload route");
assertExcludes(routeSource, routeLivePattern, "CRM identity/contact audit payload route");

assertIncludes(helperSource, "server-only", "CRM identity/contact audit payload helper");
assertIncludes(helperSource, helperExportName, "CRM identity/contact audit payload helper");
assertIncludes(
  helperSource,
  "buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup",
  "CRM identity/contact audit payload helper",
);
assertIncludes(helperSource, "auditWriteEnabled: false", "CRM identity/contact audit payload helper");
assertIncludes(helperSource, "liveWriteEnabled: false", "CRM identity/contact audit payload helper");
assertIncludes(helperSource, "external_send: false", "CRM identity/contact audit payload helper");
assertExcludes(helperSource, helperLivePattern, "CRM identity/contact audit payload helper");

assertExcludes(appPage, setupApiName, "App page must not wire CRM identity/contact audit payload API");
assertExcludes(appPage, helperExportName, "App page must not import CRM identity/contact audit payload helper");
assertExcludes(aiParseRoute, setupApiName, "AI parse route");
assertExcludes(aiParseRoute, helperExportName, "AI parse route");
assertExcludes(adminSavedBookingsRoute, setupApiName, "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, helperExportName, "Admin saved bookings route");
assertIncludes(
  preactivationSuite,
  "scripts/test-admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup-api-contract.mjs",
  "Preactivation suite CRM identity/contact audit payload entry",
);

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetup } = harness.helper;
  const companyAudit = buildAdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetup({
    action_type: "company_create",
    company_name: "ACME Holdings",
    domain: "example.com",
  });

  assertBlockedAudit(companyAudit, "Company helper audit payload");
  assert.deepEqual(companyAudit.company_field_names, ["company_name", "domain"]);
  assert.equal(companyAudit.actionName, "company_create");

  const forbiddenAudit = buildAdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetup({
    action_type: "company_create",
    company_name: "Safe Company",
    customer_rates: "{}",
    driver_payout_rules: "{}",
    pricing_source: "manual",
    internal_admin_notes: "hidden",
    debug_payload: "debug",
  });

  assertRejectedAudit(forbiddenAudit, "Forbidden helper audit payload");
  assert.equal(forbiddenAudit.rejectedForbiddenFieldCount, 5);

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
  assertBlockedAudit(routeSuccessBody.result, "Route traveler audit payload");
  assert.equal(routeSuccessBody.result.actionName, "traveler_update");
  assert.equal(routeSuccessBody.result.traveler_field_names.includes("booker_email"), true);
  assertNoUnsafeAuditOutput(routeSuccessBody, "Route traveler audit payload");

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
  assertRejectedAudit(routeForbiddenBody.result, "Route forbidden audit payload");
  assert.equal(routeForbiddenBody.result.rejectedForbiddenFieldCount, 3);
  assertNoUnsafeAuditOutput(routeForbiddenBody, "Route forbidden audit payload");

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymousBody = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403);
  assert.equal(anonymousBody.ok, false);
  assert.equal(anonymousBody.status, "blocked");
  assert.equal(anonymousBody.error, routeBlockedMessage);
  assertDisabledAudit(anonymousBody.result, "Anonymous route fallback result");
  assertNoUnsafeAuditOutput(anonymousBody, "Anonymous route fallback result");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin company/traveler CRM identity/contact audit payload setup API contract passed");
