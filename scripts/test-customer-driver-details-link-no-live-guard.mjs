import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-customer-driver-details-link-preview-readiness-setup/route.ts",
  "app/api/customer-driver-details-link-access-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/customer-driver-details-link-setup-foundation.ts",
  "lib/customer-driver-details-link-access-audit-payload-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const allowedSetupOnlyStrings = [
  "customer-safe-placeholder",
  "customer_safe_token_placeholder",
  "placeholder_token_reference",
  "customer_driver_details_secure_link",
  "customer_driver_details_link_setup_only",
  "customer_driver_details_link_access_disabled_setup_only",
  "customer_driver_details_link_access_audit_payload_setup_only",
];
const disallowedPackageNames = new Set([
  "@auth/core",
  "@aws-sdk/client-ses",
  "@aws-sdk/client-sns",
  "@sendgrid/client",
  "@sendgrid/mail",
  "@supabase/auth-ui-react",
  "@twilio/conversations",
  "@vonage/server-sdk",
  "aws-sdk",
  "jose",
  "jsonwebtoken",
  "mailgun-js",
  "mailgun.js",
  "mapbox-gl",
  "messagebird",
  "next-auth",
  "nodemailer",
  "plivo",
  "postmark",
  "resend",
  "stripe",
  "telnyx",
  "twilio",
  "vonage",
  "whatsapp-cloud-api",
]);
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:resend|@aws-sdk\/client-ses|@aws-sdk\/client-sns|aws-sdk|@sendgrid\/mail|@sendgrid\/client|mailgun|mailgun-js|mailgun\.js|nodemailer|postmark|stripe|twilio|@twilio\/conversations|vonage|@vonage\/server-sdk|messagebird|plivo|telnyx|whatsapp-cloud-api|mapbox-gl|next-auth|@auth\/core|jsonwebtoken|jose)["']|require\(\s*["'](?:resend|@aws-sdk\/client-ses|@aws-sdk\/client-sns|aws-sdk|@sendgrid\/mail|@sendgrid\/client|mailgun|mailgun-js|mailgun\.js|nodemailer|postmark|stripe|twilio|@twilio\/conversations|vonage|@vonage\/server-sdk|messagebird|plivo|telnyx|whatsapp-cloud-api|mapbox-gl|next-auth|@auth\/core|jsonwebtoken|jose)["']\s*\)/i;
const providerClassPattern =
  /\b(?:Auth0|JWT|Mailgun|MessageBird|NextAuth|Plivo|Resend|SESClient|SNSClient|SendEmailCommand|Stripe|Telnyx|Twilio|Vonage)\b/;
const envReadPattern =
  /\bprocess\.env\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b|\bSENDGRID_[A-Z_]*\b|\bMAILGUN_[A-Z_]*\b|\bRESEND_[A-Z_]*\b|\bSMS_[A-Z_]*\b|\bTWILIO_[A-Z_]*\b|\bVONAGE_[A-Z_]*\b|\bSNS_[A-Z_]*\b|\bWHATSAPP_[A-Z_]*\b|\bAUTH_[A-Z_]*\b|\bJWT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/;
const dbWritePattern = /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i;
const liveAccessPattern =
  /linkEnabled\s*[:=]\s*true|tokenIssued\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const realTokenIssuePattern =
  /\b(?:issueToken|issue_token|createToken|create_token|generateToken|generate_token|signToken|sign_token|jwt\.sign|randomBytes|randomUUID|crypto\.randomUUID|crypto\.subtle|createHash)\b/i;
const liveLocationPattern =
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|mapbox|maps\.google|google\.maps|gps|latitude|longitude/i;
const externalSendOrFetchPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|client\.messages|publish\s*\(|request\s*\(/i;
const authActivationPattern =
  /\bcookies\s*\(|\bheaders\s*\(|getServerSession|signIn\s*\(|signOut\s*\(|NextAuth|auth\.api|validateSession|sessionToken|bearer\s+/i;
const paymentOrShimPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["']stripe["']|require\(\s*["']stripe["']\s*\)|paymentLink|payment_link\s*[:=]|payNowUrl|paynowUrl|checkoutSession|createCheckout|invoice_payment\s*[:=]|legacy_shim|shim\s*\(/i;
const unsafeOutputPattern =
  /Tan Driver|Lim Driver|\+65 8888 0000|\+65 8777 0000|SLA1234X|SLA4321Z|Mercedes V-Class|Toyota Alphard|Changi Airport|Raffles Hotel|client@example\.com|real-token-do-not-use|server_secret|driver_payout|customer_price|paynow|payment|billing|invoice|payout|internal_admin|internal_finance|service_role|secret|stripe|smtp/i;
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

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(pathname, params = {}) {
  const url = new URL(`http://localhost${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertLinkFlags(value, label) {
  assert.equal(value?.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value?.linkEnabled, false, `${label} must keep linkEnabled false.`);
  assert.equal(value?.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
  assert.equal(value?.tokenIssued, false, `${label} must keep tokenIssued false.`);

  if (Object.hasOwn(value || {}, "auditWriteEnabled")) {
    assert.equal(value.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  }

  if (Object.hasOwn(value || {}, "providerConfigured")) {
    assert.equal(value.providerConfigured, false, `${label} must keep providerConfigured false.`);
  }
}

function assertBlockedNoOp(value, label) {
  assertLinkFlags(value, label);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must expose blocked/no-op.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
}

function assertNoDetailLeak(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not reveal real driver/customer details, live tokens, payment, or internal fields.`,
  );
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

async function writeHarnessFile(tempDir, relativePath) {
  const source = await readFile(relativePath, "utf8");
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, relativePath));
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-details-link-no-live-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of harnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    auditPayload: requireFromHarness(
      path.join(
        tempDir,
        "lib/customer-driver-details-link-access-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    routes: {
      disabledAccess: requireFromHarness(
        path.join(
          tempDir,
          "app/api/customer-driver-details-link-access-disabled-setup/route.js",
        ),
      ),
      previewReadiness: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-customer-driver-details-link-preview-readiness-setup/route.js",
        ),
      ),
    },
    setup: requireFromHarness(
      path.join(tempDir, "lib/customer-driver-details-link-setup-foundation.js"),
    ),
  };
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const installedPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];

for (const packageName of installedPackages) {
  assert.equal(
    disallowedPackageNames.has(packageName),
    false,
    `Secure link setup must not add live auth/provider/location/payment package: ${packageName}`,
  );
}

const appApiFiles = await listFiles("app/api");
const linkRouteFiles = appApiFiles
  .filter((file) => file.endsWith("route.ts") && file.includes("customer-driver-details-link"))
  .sort();

assert.deepEqual(
  linkRouteFiles,
  [...routeFiles].sort(),
  "Secure customer driver-details link chain must not add extra live/link routes.",
);

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(source),
    false,
    `${routeFile} must not expose write/live access verbs.`,
  );
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(providerImportPattern.test(source), false, `${file} must not import auth/provider/payment/location SDKs.`);
  assert.equal(providerClassPattern.test(source), false, `${file} must not use auth/provider/payment SDK classes.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read provider/env/auth secrets.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB writes.`);
  assert.equal(liveAccessPattern.test(source), false, `${file} must not enable link/live access flags.`);
  assert.equal(realTokenIssuePattern.test(source), false, `${file} must not issue or generate real tokens.`);
  assert.equal(liveLocationPattern.test(source), false, `${file} must not use live location APIs.`);
  assert.equal(externalSendOrFetchPattern.test(source), false, `${file} must not call external live APIs.`);
  assert.equal(authActivationPattern.test(source), false, `${file} must not activate auth/session access.`);
  assert.equal(paymentOrShimPattern.test(source), false, `${file} must not introduce payment or shim paths.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only secure-link string must remain allowed: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildCustomerDriverDetailsLinkAccessAuditPayloadSetup } = harness.auditPayload;
  const { buildCustomerDriverDetailsLinkSetup } = harness.setup;
  const setup = buildCustomerDriverDetailsLinkSetup({
    booking_reference: "PLO-LINK-NO-LIVE-001",
    customer_safe_token_placeholder: "customer-safe-placeholder",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    expiry_label: "Expires 15 minutes after issue",
    pickup_time: "12 Jun 2026, 10:00",
    route: "Changi Airport T3 to Raffles Hotel",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });

  assertLinkFlags(setup, "Secure customer driver-details link setup helper");
  assertLinkFlags(setup.payload, "Secure customer driver-details link setup payload");
  assert.equal(setup.linkPayloadReady, true);
  assert.equal(setup.payload.customer_safe_token_placeholder, "customer-safe-placeholder");
  assert.deepEqual(setup.missing_requirements, []);
  assertNoDetailLeak(setup, "Secure customer driver-details link setup helper");

  const previewResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl("/api/admin-customer-driver-details-link-preview-readiness-setup", {
        booking_reference: "PLO-LINK-NO-LIVE-001",
        customer_safe_token_placeholder: "customer-safe-placeholder",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        expiry_label: "Expires 15 minutes after issue",
        pickup_time: "12 Jun 2026, 10:00",
        route: "Changi Airport T3 to Raffles Hotel",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const preview = await previewResponse.json();

  assert.equal(previewResponse.status, 200);
  assertLinkFlags(preview, "Secure link preview/readiness API");
  assertLinkFlags(preview.preview, "Secure link preview/readiness API preview");
  assertLinkFlags(preview.preview.payload, "Secure link preview/readiness API payload");
  assertLinkFlags(preview.readiness, "Secure link preview/readiness API readiness");
  assert.equal(preview.status, "setup_only");
  assert.equal(preview.preview.linkPayloadReady, true);
  assert.equal(preview.readiness.linkPayloadReady, true);
  assert.deepEqual(preview.readiness.missing_requirements, []);
  assert.equal(preview.preview.payload.booking_reference, "PLO-LINK-NO-LIVE-001");
  assert.equal(preview.preview.payload.customer_safe_token_placeholder, "customer-safe-placeholder");
  assertNoDetailLeak(preview, "Secure link preview/readiness API");

  const disabledAccessResponse = await harness.routes.disabledAccess.GET(
    new Request(
      apiUrl("/api/customer-driver-details-link-access-disabled-setup", {
        booking_reference: "PLO-LINK-NO-LIVE-002",
        customer_email: "client@example.com",
        customer_price: "200",
        driver_name: "Lim Driver",
        driver_phone: "+65 8777 0000",
        internal_admin_notes: "Do not leak",
        pickup_time: "13 Jun 2026, 09:00",
        route: "Changi Airport T3 to Raffles Hotel",
        token: "real-token-do-not-use",
        vehicle_plate: "SLA4321Z",
        vehicle_type: "Toyota Alphard",
      }),
    ),
  );
  const disabledAccess = await disabledAccessResponse.json();

  assert.equal(disabledAccessResponse.status, 200);
  assertLinkFlags(disabledAccess, "Disabled secure link access API");
  assertLinkFlags(disabledAccess.preview, "Disabled secure link access preview");
  assertLinkFlags(disabledAccess.preview.payload, "Disabled secure link access payload");
  assertLinkFlags(disabledAccess.readiness, "Disabled secure link access readiness");
  assertBlockedNoOp(disabledAccess.access, "Disabled secure link access result");
  assertBlockedNoOp(disabledAccess.result, "Disabled secure link access nested result");
  assert.equal(disabledAccess.status, "blocked");
  assert.equal(disabledAccess.access.customer_safe_token_placeholder, "customer-safe-placeholder");
  assert.equal(disabledAccess.access.booking_reference, null);
  assert.equal(disabledAccess.access.customer_details, null);
  assert.equal(disabledAccess.access.driver_details, null);
  assertNoDetailLeak(disabledAccess, "Disabled secure link access API");

  const auditPayload = buildCustomerDriverDetailsLinkAccessAuditPayloadSetup({
    actionSource: "disabled_access_api",
    disabledAccess: disabledAccess.access,
    setup,
  });

  assertLinkFlags(auditPayload, "Secure link access audit payload");
  assertLinkFlags(auditPayload.audit_payload, "Secure link access nested audit payload");
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "Secure link access audit blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "Secure link access nested audit result");
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.audit_write_enabled, false);
  assert.equal(auditPayload.audit_payload.auditWriteEnabled, false);
  assert.equal(auditPayload.bookingReference, "PLO-LINK-NO-LIVE-001");
  assert.equal(auditPayload.placeholderTokenReference, "customer-safe-placeholder");
  assert.equal(auditPayload.disabledAccessStatus, "blocked");
  assert.deepEqual(auditPayload.missing_requirements, []);
  assertNoDetailLeak(auditPayload, "Secure link access audit payload");

  const unsafeAuditPayload = buildCustomerDriverDetailsLinkAccessAuditPayloadSetup({
    actionSource: "server_secret",
    booking_reference: "payment-token",
    customerSafeTokenPlaceholder: "server_secret placeholder",
    disabledAccess: {
      delivery_surface: "customer_driver_details_link_access_disabled_setup_only",
      external_send: true,
      linkEnabled: true,
      liveAccessEnabled: true,
      no_op: false,
      reason: "sent",
      result_label: "sent",
      status: "sent",
      tokenIssued: true,
    },
    driver_name: "driver_payout",
    driver_phone: "billing_amount",
    expiryLabel: "invoice payment secret",
    pickup_time: "10:00",
    route: "internal_admin_note",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes",
  });

  assertLinkFlags(unsafeAuditPayload, "Unsafe secure link access audit payload");
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe secure link audit blocked result");
  assert.equal(unsafeAuditPayload.auditWriteEnabled, false);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.bookingReference, null);
  assert.equal(unsafeAuditPayload.placeholderTokenReference, "customer-safe-placeholder");
  assert.equal(unsafeAuditPayload.disabledAccessStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_source",
    "booking_reference",
    "disabled_access_result",
  ]);
  assertNoDetailLeak(unsafeAuditPayload, "Unsafe secure link access audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("Customer driver-details link no-live guard passed");
