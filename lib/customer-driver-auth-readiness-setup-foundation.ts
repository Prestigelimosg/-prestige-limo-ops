import "server-only";

export const customerDriverAuthReadinessSetupFoundationVersion =
  "customer-driver-auth-readiness-setup-foundation-v1";

export type CustomerDriverAuthReadinessSetupInput = {
  bookingReference?: unknown;
  booking_reference?: unknown;
  customerAccountReference?: unknown;
  customer_account_reference?: unknown;
  driverReference?: unknown;
  driver_reference?: unknown;
};

export type CustomerDriverAuthReadinessMissingRequirement =
  | "access_policy_approval"
  | "auth_provider"
  | "customer_auth_approval"
  | "driver_auth_approval"
  | "live_session_approval";

export type CustomerDriverAuthReadinessSetupResult = {
  accessPolicyEnabled: false;
  authProviderConfigured: false;
  blocked_activation: {
    access_policy: "blocked";
    auth_provider: "missing";
    customer_auth: "blocked";
    driver_auth: "blocked";
    live_customer_access: "blocked";
    live_driver_access: "blocked";
    live_session: "blocked";
    session_creation: "blocked";
  };
  booking_reference: string | null;
  customer_account_reference: string | null;
  customer_auth_activation_planned: true;
  customer_saved_booking_session_planned: true;
  customerAuthEnabled: false;
  driver_auth_activation_planned: true;
  driver_only_job_visibility_beyond_token_flow_planned: true;
  driver_reference: string | null;
  driverAuthEnabled: false;
  liveSessionEnabled: false;
  missing_requirements: CustomerDriverAuthReadinessMissingRequirement[];
  planned_access: {
    customer_auth_activation: "planned_only";
    customer_saved_booking_session: "planned_only";
    driver_auth_activation: "planned_only";
    driver_only_job_visibility_beyond_token_flow: "planned_only";
  };
  policyReady: true;
  policy_surface: "customer_driver_auth_readiness_setup_only";
  status: "setup_only";
  version: typeof customerDriverAuthReadinessSetupFoundationVersion;
};

const forbiddenReferenceFragments = [
  "access_token",
  "admin_finance",
  "admin_note",
  "billing",
  "cookie",
  "customer_price",
  "debug",
  "driver_payout",
  "finance",
  "internal_admin",
  "internal_note",
  "invoice",
  "jwt",
  "magic_link",
  "mock_archive",
  "mock_qa",
  "otp",
  "parser",
  "password",
  "payment",
  "paynow",
  "payout",
  "raw_token",
  "refresh_token",
  "secret",
  "service_role",
  "session_token",
];

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenReferenceFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenReferenceFragments.some((fragment) => normalized.includes(fragment));
}

function safeReference(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (
    !cleaned ||
    cleaned.length > 120 ||
    includesForbiddenReferenceFragment(cleaned) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

export function buildCustomerDriverAuthReadinessSetup(
  input: CustomerDriverAuthReadinessSetupInput = {},
): CustomerDriverAuthReadinessSetupResult {
  return {
    accessPolicyEnabled: false,
    authProviderConfigured: false,
    blocked_activation: {
      access_policy: "blocked",
      auth_provider: "missing",
      customer_auth: "blocked",
      driver_auth: "blocked",
      live_customer_access: "blocked",
      live_driver_access: "blocked",
      live_session: "blocked",
      session_creation: "blocked",
    },
    booking_reference: safeReference(firstValue(input.booking_reference, input.bookingReference)),
    customer_account_reference: safeReference(
      firstValue(input.customer_account_reference, input.customerAccountReference),
    ),
    customer_auth_activation_planned: true,
    customer_saved_booking_session_planned: true,
    customerAuthEnabled: false,
    driver_auth_activation_planned: true,
    driver_only_job_visibility_beyond_token_flow_planned: true,
    driver_reference: safeReference(firstValue(input.driver_reference, input.driverReference)),
    driverAuthEnabled: false,
    liveSessionEnabled: false,
    missing_requirements: [
      "customer_auth_approval",
      "driver_auth_approval",
      "auth_provider",
      "live_session_approval",
      "access_policy_approval",
    ],
    planned_access: {
      customer_auth_activation: "planned_only",
      customer_saved_booking_session: "planned_only",
      driver_auth_activation: "planned_only",
      driver_only_job_visibility_beyond_token_flow: "planned_only",
    },
    policyReady: true,
    policy_surface: "customer_driver_auth_readiness_setup_only",
    status: "setup_only",
    version: customerDriverAuthReadinessSetupFoundationVersion,
  };
}
