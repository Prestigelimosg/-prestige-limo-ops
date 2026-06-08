import assert from "node:assert/strict";

import {
  customerDriverAuthActivationBlockedResult,
  customerDriverAuthFoundationVersion,
  parseCustomerAccessAccountFoundationPayload,
  parseCustomerDriverAccessAuditEventFoundationPayload,
  parseDriverAccessAccountFoundationPayload,
} from "../lib/customer-driver-auth-foundation.ts";

const validCustomerAuthUserId = "11111111-1111-4111-8111-111111111111";
const validDriverAuthUserId = "22222222-2222-4222-8222-222222222222";
const unsafeLeakPattern =
  /raw_token|session_token|refresh_token|jwt|password|magic|otp|cookie|claim|service_role|server_secret|secret|customer_price|driver_payout|paynow|billing|invoice|payment|pdf|payout|finance|internal_admin_note|parser_debug|mock_archive|telegram|whatsapp|sms/i;

function assertSafeError(result, message) {
  assert.equal(result.ok, false, message);
  assert.equal(unsafeLeakPattern.test(JSON.stringify(result)), false, `${message}: safe error leaked unsafe text`);
}

assert.equal(customerDriverAuthFoundationVersion, "customer-driver-auth-foundation-v1");

const customerResult = parseCustomerAccessAccountFoundationPayload({
  auth_user_id: validCustomerAuthUserId,
  customer_account_reference: "CUSTOMER-ACCOUNT-001",
  safe_display_label: "Safe customer account",
});

assert.equal(customerResult.ok, true, "Expected safe customer access account payload to parse");
assert.deepEqual(customerResult.data, {
  account_status: "pending_setup",
  auth_provider: "supabase_auth",
  auth_user_id: validCustomerAuthUserId,
  customer_account_reference: "CUSTOMER-ACCOUNT-001",
  safe_display_label: "Safe customer account",
  source_surface: "admin_api",
});

const driverResult = parseDriverAccessAccountFoundationPayload({
  account_status: "active",
  auth_user_id: validDriverAuthUserId,
  driver_reference: "DRIVER-OPS-001",
  safe_display_label: "Safe driver account",
  source_surface: "system",
});

assert.equal(driverResult.ok, true, "Expected safe driver access account payload to parse");
assert.deepEqual(driverResult.data, {
  account_status: "active",
  auth_provider: "supabase_auth",
  auth_user_id: validDriverAuthUserId,
  driver_reference: "DRIVER-OPS-001",
  safe_display_label: "Safe driver account",
  source_surface: "system",
});

const auditResult = parseCustomerDriverAccessAuditEventFoundationPayload({
  account_reference: "DRIVER-OPS-001",
  account_surface: "driver",
  actor_label: "Dispatcher access review",
  actor_role: "dispatcher",
  auth_user_id: validDriverAuthUserId,
  event_type: "account_reviewed",
  safe_event_context: {
    review_status: "ready_for_future_activation",
  },
  source_surface: "admin_api",
});

assert.equal(auditResult.ok, true, "Expected safe access audit payload to parse");
assert.deepEqual(auditResult.data, {
  account_reference: "DRIVER-OPS-001",
  account_surface: "driver",
  actor_label: "Dispatcher access review",
  actor_role: "dispatcher",
  auth_user_id: validDriverAuthUserId,
  event_type: "account_reviewed",
  safe_event_context: {
    review_status: "ready_for_future_activation",
  },
  source_surface: "admin_api",
});

for (const [label, parser, payload] of [
  [
    "customer unknown field",
    parseCustomerAccessAccountFoundationPayload,
    {
      auth_user_id: validCustomerAuthUserId,
      customer_account_reference: "CUSTOMER-ACCOUNT-001",
      safe_display_label: "Safe customer account",
      session_token: "do-not-accept",
    },
  ],
  [
    "customer forbidden text",
    parseCustomerAccessAccountFoundationPayload,
    {
      auth_user_id: validCustomerAuthUserId,
      customer_account_reference: "CUSTOMER-ACCOUNT-001",
      safe_display_label: "Customer invoice payment portal",
    },
  ],
  [
    "driver payout leak",
    parseDriverAccessAccountFoundationPayload,
    {
      auth_user_id: validDriverAuthUserId,
      driver_reference: "DRIVER-OPS-001",
      safe_display_label: "Driver payout account",
    },
  ],
  [
    "audit unsafe context",
    parseCustomerDriverAccessAuditEventFoundationPayload,
    {
      account_reference: "DRIVER-OPS-001",
      account_surface: "driver",
      actor_role: "admin",
      event_type: "session_started",
      safe_event_context: {
        raw_token: "do-not-store",
      },
      source_surface: "admin_api",
    },
  ],
]) {
  assertSafeError(parser(payload), `Expected ${label} to be rejected safely`);
}

for (const [label, parser, payload] of [
  [
    "customer malformed uuid",
    parseCustomerAccessAccountFoundationPayload,
    {
      auth_user_id: "not-a-uuid",
      customer_account_reference: "CUSTOMER-ACCOUNT-001",
      safe_display_label: "Safe customer account",
    },
  ],
  [
    "driver malformed status",
    parseDriverAccessAccountFoundationPayload,
    {
      account_status: "enabled",
      auth_user_id: validDriverAuthUserId,
      driver_reference: "DRIVER-OPS-001",
      safe_display_label: "Safe driver account",
    },
  ],
  [
    "audit malformed actor role",
    parseCustomerDriverAccessAuditEventFoundationPayload,
    {
      account_reference: "DRIVER-OPS-001",
      account_surface: "driver",
      actor_role: "owner",
      event_type: "session_started",
      source_surface: "driver_api",
    },
  ],
]) {
  const result = parser(payload);
  assertSafeError(result, `Expected ${label} to be rejected safely`);
  assert.equal(
    String(result.error || ""),
    "Customer/driver auth foundation details are malformed.",
    `Expected ${label} to use the generic malformed message`,
  );
}

const activationBlocked = customerDriverAuthActivationBlockedResult();

assert.equal(activationBlocked.ok, false, "Expected auth activation to stay blocked");
assert.equal(activationBlocked.status, 403, "Expected auth activation blocked status");
assert.equal(
  activationBlocked.error,
  "Customer/driver auth activation is not enabled in this foundation stage.",
  "Expected stable auth activation blocked message",
);
assert.equal(
  unsafeLeakPattern.test(JSON.stringify(activationBlocked)),
  false,
  "Expected activation blocked result not to leak secrets or unsafe fields",
);

console.log("Customer/driver auth foundation API contract tests passed.");
