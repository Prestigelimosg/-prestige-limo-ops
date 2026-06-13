import "server-only";

import type { AdminEmailSendDisabledAdapterResult } from "./admin-email-send-disabled-adapter";
import type { AdminEmailSendPolicySetupResult } from "./admin-email-send-policy-setup-foundation";

export const adminEmailProviderReadinessSetupFoundationVersion =
  "admin-email-provider-readiness-setup-foundation-v1";

export type AdminEmailProviderReadinessMissingRequirement =
  | "approval"
  | "disabled_send_adapter"
  | "env"
  | "provider"
  | "send_policy";

export type AdminEmailProviderReadinessSetupInput = {
  disabledSend: AdminEmailSendDisabledAdapterResult | null;
  policy: AdminEmailSendPolicySetupResult | null;
};

export type AdminEmailProviderReadinessSetupResult = {
  delivery_surface: "email_provider_readiness_setup_only";
  disabled_send_status: "blocked" | "missing";
  external_send: false;
  liveSendingEnabled: false;
  missing_requirements: AdminEmailProviderReadinessMissingRequirement[];
  policy_decision: "allowed_for_future_setup" | "blocked";
  provider: {
    approval_status: "missing";
    env_status: "missing";
    provider_status: "missing";
  };
  providerConfigured: false;
  readyForFutureProviderSetup: false;
  sendingEnabled: false;
  status: "setup_only";
  version: typeof adminEmailProviderReadinessSetupFoundationVersion;
};

function hasPolicy(policy: AdminEmailSendPolicySetupResult | null) {
  return Boolean(
    policy &&
      policy.status === "setup_only" &&
      policy.external_send === false &&
      policy.sendingEnabled === false &&
      policy.decision === "allowed_for_future_setup" &&
      policy.missing_requirements.length === 0,
  );
}

function hasDisabledSendAdapter(disabledSend: AdminEmailSendDisabledAdapterResult | null) {
  return Boolean(
    disabledSend &&
      disabledSend.status === "blocked" &&
      disabledSend.reason === "setup_only_disabled" &&
      disabledSend.external_send === false &&
      disabledSend.sendingEnabled === false,
  );
}

export function buildAdminEmailProviderReadinessSetup(
  input: AdminEmailProviderReadinessSetupInput,
): AdminEmailProviderReadinessSetupResult {
  const missingRequirements: AdminEmailProviderReadinessMissingRequirement[] = [
    "provider",
    "env",
    "approval",
  ];

  if (!hasPolicy(input.policy)) {
    missingRequirements.push("send_policy");
  }

  if (!hasDisabledSendAdapter(input.disabledSend)) {
    missingRequirements.push("disabled_send_adapter");
  }

  return {
    delivery_surface: "email_provider_readiness_setup_only",
    disabled_send_status: hasDisabledSendAdapter(input.disabledSend) ? "blocked" : "missing",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: missingRequirements,
    policy_decision:
      input.policy?.decision === "allowed_for_future_setup" ? "allowed_for_future_setup" : "blocked",
    provider: {
      approval_status: "missing",
      env_status: "missing",
      provider_status: "missing",
    },
    providerConfigured: false,
    readyForFutureProviderSetup: false,
    sendingEnabled: false,
    status: "setup_only",
    version: adminEmailProviderReadinessSetupFoundationVersion,
  };
}
