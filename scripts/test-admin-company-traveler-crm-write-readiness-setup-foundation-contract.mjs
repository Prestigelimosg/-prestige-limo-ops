import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-company-traveler-crm-write-readiness-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");
const unsafeOutputPattern =
  /customer_rates|driver_payout_rules|driver_payout|paynow|pay_now|internal_admin|internal finance|admin_finance|parser|debug|mock_qa|dev_archive|customer_price|billing|invoice|payment|payout|pricing|secret|service_role|smtp|stripe|token/i;

assert.equal(source.includes("server-only"), true, "CRM write-readiness helper must stay server-only.");
assert.equal(
  /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source),
  false,
  "CRM write-readiness helper must not define API route behavior.",
);
assert.equal(
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/i.test(source),
  false,
  "CRM write-readiness helper must not read env/provider secrets.",
);
assert.equal(
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@supabase\/supabase-js|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun)["']|require\(\s*["'](?:@supabase\/supabase-js|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun)["']\s*\)/i.test(source),
  false,
  "CRM write-readiness helper must not import DB, payment, PDF, browser, or sending SDKs.",
);
assert.equal(
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i.test(source),
  false,
  "CRM write-readiness helper must not use DB reads or writes.",
);
assert.equal(
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|request\s*\(/i.test(source),
  false,
  "CRM write-readiness helper must not use network APIs.",
);
assert.equal(
  /customer_rates|driver_payout_rules/i.test(source),
  false,
  "CRM write-readiness helper must not include parked rate/payout override fields.",
);
assert.equal(/legacy_shim|shim\s*\(/i.test(source), false, "CRM write-readiness helper must not introduce shims.");

for (const fragment of [
  "adminCompanyTravelerCrmWriteReadinessSetupFoundationVersion",
  "buildAdminCompanyTravelerCrmWriteReadinessSetup",
  "company_traveler_crm_write_readiness_setup_only",
  "company_create",
  "company_update",
  "company_name_memory",
  "traveler_create",
  "traveler_update",
  "traveler_name_memory",
  "actionEnabled: false",
  "writeEnabled: false",
  "liveWriteEnabled: false",
  "adminReviewRequired: true",
]) {
  assert.ok(source.includes(fragment), `Missing CRM write-readiness setup fragment: ${fragment}`);
}

function transpileTypescript(tsSource, filename) {
  return ts.transpileModule(tsSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-write-readiness-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, helperPath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(outputPath),
  };
}

function assertDisabledReadiness(value, label) {
  assert.equal(value.actionEnabled, false, `${label} must keep actionEnabled false.`);
  assert.equal(value.action_enabled, false, `${label} must keep action_enabled false.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.live_write_enabled, false, `${label} must keep live_write_enabled false.`);
  assert.equal(value.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value.admin_review_required, true, `${label} must require admin review.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.readiness_status, "blocked_pending_admin_review", `${label} must stay blocked.`);
  assert.equal(unsafeOutputPattern.test(JSON.stringify(value)), false, `${label} must not leak unsafe fields.`);
}

const harness = await loadHelper();

try {
  const { buildAdminCompanyTravelerCrmWriteReadinessSetup } = harness.helper;
  const companyCreate = buildAdminCompanyTravelerCrmWriteReadinessSetup({
    actionType: "company create",
    companyName: "ACME Holdings",
    domain: "Example.COM",
    id: 42,
  });

  assert.deepEqual(companyCreate, {
    actionEnabled: false,
    actionLabel: "Review company CRM create",
    actionScope: "company",
    actionType: "company_create",
    action_enabled: false,
    action_label: "Review company CRM create",
    action_scope: "company",
    action_type: "company_create",
    adminReviewRequired: true,
    admin_review_required: true,
    company_fields: {
      company_name: "ACME Holdings",
      domain: "example.com",
      id: 42,
    },
    delivery_surface: "company_traveler_crm_write_readiness_setup_only",
    external_send: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
    missing_requirements: ["admin_approval", "typed_write_api", "live_write_approval"],
    planned_actions: {
      company_create: "planned_only",
      company_name_memory: "planned_only",
      company_update: "planned_only",
      traveler_create: "planned_only",
      traveler_name_memory: "planned_only",
      traveler_update: "planned_only",
    },
    readiness_status: "blocked_pending_admin_review",
    status: "setup_only",
    traveler_fields: {
      booker_contact: null,
      booker_email: null,
      booker_name: null,
      company_id: null,
      default_address: null,
      default_dropoff_address: null,
      default_pickup_address: null,
      id: null,
      preferred_vehicle: null,
      traveler_name: null,
    },
    version: "admin-company-traveler-crm-write-readiness-setup-foundation-v1",
    writeEnabled: false,
    write_enabled: false,
  });
  assertDisabledReadiness(companyCreate, "company create readiness");

  const travelerMemory = buildAdminCompanyTravelerCrmWriteReadinessSetup({
    action_type: "remember traveler name memory",
    bookerContact: "+65 8123 4567",
    bookerEmail: "Booker@Example.com",
    bookerName: "Ops Booker",
    company_id: 88,
    defaultDropoffAddress: "Raffles Hotel Singapore",
    defaultPickupAddress: "Changi Airport Terminal 3",
    preferredVehicle: "Vellfire",
    travelerName: "Safe Traveler",
    traveler_id: 901,
  });

  assert.equal(travelerMemory.actionType, "traveler_name_memory");
  assert.equal(travelerMemory.actionScope, "traveler");
  assert.equal(travelerMemory.company_fields.id, 88);
  assert.equal(travelerMemory.traveler_fields.id, 901);
  assert.equal(travelerMemory.traveler_fields.company_id, 88);
  assert.equal(travelerMemory.traveler_fields.traveler_name, "Safe Traveler");
  assert.equal(travelerMemory.traveler_fields.booker_email, "booker@example.com");
  assert.equal(travelerMemory.traveler_fields.default_pickup_address, "Changi Airport Terminal 3");
  assert.equal(travelerMemory.traveler_fields.default_dropoff_address, "Raffles Hotel Singapore");
  assert.deepEqual(travelerMemory.missing_requirements, [
    "admin_approval",
    "typed_write_api",
    "live_write_approval",
  ]);
  assertDisabledReadiness(travelerMemory, "traveler name-memory readiness");

  const blocked = buildAdminCompanyTravelerCrmWriteReadinessSetup({
    actionType: "payment token update",
    bookerEmail: "not-an-email",
    companyName: "driver_payout secret account",
    defaultAddress: "internal_admin_note address",
    domain: "paynow.example.com",
    travelerName: "pricing debug traveler",
  });

  assert.equal(blocked.actionType, null);
  assert.equal(blocked.actionScope, null);
  assert.deepEqual(blocked.missing_requirements, [
    "action_type",
    "admin_approval",
    "typed_write_api",
    "live_write_approval",
  ]);
  assert.equal(blocked.company_fields.company_name, null);
  assert.equal(blocked.company_fields.domain, null);
  assert.equal(blocked.traveler_fields.default_address, null);
  assert.equal(blocked.traveler_fields.traveler_name, null);
  assertDisabledReadiness(blocked, "blocked unsafe readiness");
} finally {
  await harness.cleanup();
}

console.log("admin company/traveler CRM write-readiness setup foundation contract passed");
