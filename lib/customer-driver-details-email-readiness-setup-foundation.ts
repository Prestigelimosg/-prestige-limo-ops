import "server-only";

import type { AdminEmailRecipientSafetySetupResult } from "./admin-email-recipient-safety-setup-foundation";
import type { AdminEmailSenderSelectionSetupResult } from "./admin-email-sender-selection-setup-foundation";
import type { AdminEmailSendPolicySetupResult } from "./admin-email-send-policy-setup-foundation";
import type { CustomerDriverDetailsEmailSetupResult } from "./customer-driver-details-email-setup-foundation";

export const customerDriverDetailsEmailReadinessSetupFoundationVersion =
  "customer-driver-details-email-readiness-setup-foundation-v1";

export type CustomerDriverDetailsEmailReadinessMissingRequirement =
  | "customer_driver_details_template"
  | "email_send_policy"
  | "recipient_safety"
  | "sender_selection";

export type CustomerDriverDetailsEmailReadinessSetupInput = {
  policy: AdminEmailSendPolicySetupResult | null;
  recipient: AdminEmailRecipientSafetySetupResult | null;
  sender: AdminEmailSenderSelectionSetupResult | null;
  template: CustomerDriverDetailsEmailSetupResult | null;
};

export type CustomerDriverDetailsEmailReadinessSetupResult = {
  delivery_surface: "customer_driver_details_email_readiness_setup_only";
  external_send: false;
  missing_requirements: CustomerDriverDetailsEmailReadinessMissingRequirement[];
  policy_decision: "allowed_for_future_setup" | "blocked";
  readyForFutureSetup: boolean;
  readyToSend: false;
  sendingEnabled: false;
  status: "setup_only";
  version: typeof customerDriverDetailsEmailReadinessSetupFoundationVersion;
};

function hasTemplate(template: CustomerDriverDetailsEmailSetupResult | null) {
  return Boolean(
    template &&
      template.status === "setup_only" &&
      template.external_send === false &&
      template.sendingEnabled === false &&
      template.recipient_status === "valid" &&
      template.payload.booking_reference &&
      template.payload.customer_email &&
      template.payload.driver_name &&
      template.payload.driver_phone &&
      template.payload.pickup_time &&
      template.payload.route &&
      template.payload.vehicle_plate &&
      template.payload.vehicle_type &&
      template.template.subject &&
      template.template.body_lines.length > 0,
  );
}

function hasRecipient(recipient: AdminEmailRecipientSafetySetupResult | null) {
  return Boolean(
    recipient &&
      recipient.status === "setup_only" &&
      recipient.external_send === false &&
      recipient.sendingEnabled === false &&
      recipient.recipient.recipient_status === "valid" &&
      recipient.recipient.recipient_email,
  );
}

function hasSender(sender: AdminEmailSenderSelectionSetupResult | null) {
  return Boolean(
    sender &&
      sender.status === "setup_only" &&
      sender.external_send === false &&
      sender.sendingEnabled === false &&
      sender.selected_sender.match_reason !== "none" &&
      sender.selected_sender.sender_key,
  );
}

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

export function buildCustomerDriverDetailsEmailReadinessSetup(
  input: CustomerDriverDetailsEmailReadinessSetupInput,
): CustomerDriverDetailsEmailReadinessSetupResult {
  const missingRequirements: CustomerDriverDetailsEmailReadinessMissingRequirement[] = [];

  if (!hasTemplate(input.template)) {
    missingRequirements.push("customer_driver_details_template");
  }

  if (!hasRecipient(input.recipient)) {
    missingRequirements.push("recipient_safety");
  }

  if (!hasSender(input.sender)) {
    missingRequirements.push("sender_selection");
  }

  if (!hasPolicy(input.policy)) {
    missingRequirements.push("email_send_policy");
  }

  return {
    delivery_surface: "customer_driver_details_email_readiness_setup_only",
    external_send: false,
    missing_requirements: missingRequirements,
    policy_decision: input.policy?.decision === "allowed_for_future_setup" ? "allowed_for_future_setup" : "blocked",
    readyForFutureSetup: missingRequirements.length === 0,
    readyToSend: false,
    sendingEnabled: false,
    status: "setup_only",
    version: customerDriverDetailsEmailReadinessSetupFoundationVersion,
  };
}
