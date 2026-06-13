import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-driver-details-link-access-audit-payload-setup-foundation.ts";
const disabledAccessRoutePath = "app/api/customer-driver-details-link-access-disabled-setup/route.ts";
const helperPaths = [
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/customer-driver-details-link-setup-foundation.ts",
  helperPath,
  disabledAccessRoutePath,
];
const unsafeOutputPattern =
  /Tan Driver|\+65 8888 0000|SLA1234X|Mercedes V-Class|Changi Airport|Raffles Hotel|client@example\.com|real-token-do-not-use|payment-token|driver_payout|customer_price|paynow|payment|billing|invoice|payout|internal_admin|internal_finance|service_role|server_secret|secret|stripe|smtp/i;
const helperSource = await readFile(helperPath, "utf8");

assert.equal(helperSource.includes("server-only"), true, "Link access audit payload helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(helperSource), false, "Link access audit helper must not use network APIs.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource), false, "Link access audit helper must not define API behavior.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/i.test(helperSource), false, "Link access audit helper must not read env/provider secrets.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(helperSource), false, "Link access audit helper must not use DB writes.");
assert.equal(/liveLocation|geolocation|getCurrentPosition|watchPosition|maps\.google|mapbox/i.test(helperSource), false, "Link access audit helper must not activate live location behavior.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram|stripe/i.test(helperSource), false, "Link access audit helper must not reference provider or payment SDKs.");

for (const fragment of [
  "buildCustomerDriverDetailsLinkSetup",
  "customer-driver-details-link-access-disabled-setup",
  "admin-customer-driver-details-link-preview-readiness-setup",
  "customer_driver_details_link_access_audit_payload_setup_only",
  "auditWriteEnabled: false",
  "audit_write_enabled",
  "blocked_no_op_result",
  "placeholder_token_reference",
  "linkEnabled: false",
  "tokenIssued: false",
  "liveAccessEnabled: false",
  "external_send: false",
]) {
  assert.ok(helperSource.includes(fragment), `Missing link access audit setup fragment: ${fragment}`);
}

function apiUrl(params = {}) {
  const url = new URL("http://localhost/api/customer-driver-details-link-access-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertBlockedNoOpResult(value, label) {
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.linkEnabled, false, `${label} must keep linkEnabled false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value.tokenIssued, false, `${label} must keep tokenIssued false.`);
}

function assertAuditDisabled(value, label) {
  assert.equal(value.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.linkEnabled, false, `${label} must keep linkEnabled false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
  assert.equal(value.tokenIssued, false, `${label} must keep tokenIssued false.`);
}

function assertNoRevealedDetails(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not reveal driver/customer details or sensitive operational fields.`,
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

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-details-link-access-audit-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const pathName of helperPaths) {
    const source = await readFile(pathName, "utf8");
    const outputPath = path.join(tempDir, pathName.replace(/\.ts$/, ".js"));

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transpileTypescript(source, pathName));
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    audit: requireFromHarness(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    disabledAccessRoute: requireFromHarness(
      path.join(tempDir, disabledAccessRoutePath.replace(/\.ts$/, ".js")),
    ),
    setup: requireFromHarness(
      path.join(tempDir, "lib/customer-driver-details-link-setup-foundation.js"),
    ),
  };
}

const harness = await loadHarness();

try {
  const { buildCustomerDriverDetailsLinkAccessAuditPayloadSetup } = harness.audit;
  const { buildCustomerDriverDetailsLinkSetup } = harness.setup;
  const disabledAccessResponse = await harness.disabledAccessRoute.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-LINK-AUDIT-001",
        customer_email: "client@example.com",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        pickup_time: "12 Jun 2026, 10:00",
        token: "real-token-do-not-use",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
    ),
  );
  const disabledAccessBody = await disabledAccessResponse.json();
  const setup = buildCustomerDriverDetailsLinkSetup({
    booking_reference: "PLO-LINK-AUDIT-001",
    customer_safe_token_placeholder: "customer-safe-placeholder",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    expiry_label: "Expires 15 minutes after issue",
    pickup_time: "12 Jun 2026, 10:00",
    route: "Changi Airport T3 to Raffles Hotel",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });
  const auditPayload = buildCustomerDriverDetailsLinkAccessAuditPayloadSetup({
    actionSource: "disabled-access-api",
    disabledAccess: disabledAccessBody.access,
    setup,
  });

  assert.deepEqual(auditPayload, {
    actionSource: "disabled_access_api",
    action_source: "disabled_access_api",
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: "disabled_access_api",
      action_source: "disabled_access_api",
      auditWriteEnabled: false,
      bookingReference: "PLO-LINK-AUDIT-001",
      booking_reference: "PLO-LINK-AUDIT-001",
      channel: "customer_driver_details_secure_link",
      disabledAccessStatus: "blocked",
      disabled_access_source: "customer-driver-details-link-access-disabled-setup",
      disabled_access_status: "blocked",
      external_send: false,
      linkEnabled: false,
      linkReadinessStatus: "ready_for_future_setup",
      link_readiness_status: "ready_for_future_setup",
      liveAccessEnabled: false,
      placeholderTokenReference: "customer-safe-placeholder",
      placeholder_token_reference: "customer-safe-placeholder",
      preview_readiness_source: "admin-customer-driver-details-link-preview-readiness-setup",
      result: {
        external_send: false,
        linkEnabled: false,
        liveAccessEnabled: false,
        no_op: true,
        reason: "setup_only_disabled",
        result_label: "blocked/no-op",
        status: "blocked",
        tokenIssued: false,
      },
      tokenIssued: false,
    },
    audit_write_enabled: false,
    blocked_no_op_result: {
      external_send: false,
      linkEnabled: false,
      liveAccessEnabled: false,
      no_op: true,
      reason: "setup_only_disabled",
      result_label: "blocked/no-op",
      status: "blocked",
      tokenIssued: false,
    },
    bookingReference: "PLO-LINK-AUDIT-001",
    booking_reference: "PLO-LINK-AUDIT-001",
    channel: "customer_driver_details_secure_link",
    delivery_surface: "customer_driver_details_link_access_audit_payload_setup_only",
    disabledAccessStatus: "blocked",
    disabled_access_status: "blocked",
    external_send: false,
    linkEnabled: false,
    liveAccessEnabled: false,
    missing_requirements: [],
    placeholderTokenReference: "customer-safe-placeholder",
    placeholder_token_reference: "customer-safe-placeholder",
    status: "setup_only",
    tokenIssued: false,
    version: "customer-driver-details-link-access-audit-payload-setup-foundation-v1",
  });
  assertAuditDisabled(auditPayload, "Ready link access audit payload");
  assertAuditDisabled(auditPayload.audit_payload, "Ready link access audit payload body");
  assertBlockedNoOpResult(auditPayload.blocked_no_op_result, "Ready link access audit blocked result");
  assertNoRevealedDetails(auditPayload, "Ready link access audit payload");

  const inlineAuditPayload = buildCustomerDriverDetailsLinkAccessAuditPayloadSetup({
    action_source: "preview_readiness_api",
    bookingReference: "PLO-LINK-AUDIT-002",
    customerSafeTokenPlaceholder: "approved-placeholder",
    disabled_access: disabledAccessBody.access,
  });

  assert.equal(inlineAuditPayload.actionSource, "preview_readiness_api");
  assert.equal(inlineAuditPayload.bookingReference, "PLO-LINK-AUDIT-002");
  assert.equal(inlineAuditPayload.placeholderTokenReference, "approved-placeholder");
  assert.deepEqual(inlineAuditPayload.missing_requirements, []);
  assertAuditDisabled(inlineAuditPayload, "Inline link access audit payload");
  assertNoRevealedDetails(inlineAuditPayload, "Inline link access audit payload");

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

  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.bookingReference, null);
  assert.equal(unsafeAuditPayload.placeholderTokenReference, "customer-safe-placeholder");
  assert.equal(unsafeAuditPayload.disabledAccessStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_source",
    "booking_reference",
    "disabled_access_result",
  ]);
  assertAuditDisabled(unsafeAuditPayload, "Unsafe link access audit payload");
  assertAuditDisabled(unsafeAuditPayload.audit_payload, "Unsafe link access audit payload body");
  assertBlockedNoOpResult(unsafeAuditPayload.blocked_no_op_result, "Unsafe link access audit blocked result");
  assertNoRevealedDetails(unsafeAuditPayload, "Unsafe link access audit payload");
} finally {
  await harness.cleanup();
}

console.log("customer driver details link access audit payload setup foundation contract passed");
