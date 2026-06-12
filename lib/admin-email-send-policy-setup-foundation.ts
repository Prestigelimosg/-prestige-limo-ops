import "server-only";

import type { AdminEmailNotificationSetupResult } from "./admin-email-notification-setup-foundation";
import type { AdminEmailRecipientSafetySetupResult } from "./admin-email-recipient-safety-setup-foundation";
import type { AdminEmailSenderSelectionSetupResult } from "./admin-email-sender-selection-setup-foundation";

export const adminEmailSendPolicySetupFoundationVersion =
  "admin-email-send-policy-setup-foundation-v1";

export type AdminEmailSendPolicyMissingRequirement =
  | "notification_template"
  | "recipient_valid"
  | "sender_selected";

export type AdminEmailSendPolicySetupInput = {
  notification: AdminEmailNotificationSetupResult | null;
  recipient: AdminEmailRecipientSafetySetupResult | null;
  sender: AdminEmailSenderSelectionSetupResult | null;
};

export type AdminEmailSendPolicySetupResult = {
  decision: "allowed_for_future_setup" | "blocked";
  delivery_surface: "email_send_policy_setup_only";
  external_send: false;
  missing_requirements: AdminEmailSendPolicyMissingRequirement[];
  sendingEnabled: false;
  status: "setup_only";
  version: typeof adminEmailSendPolicySetupFoundationVersion;
};

function hasNotificationTemplate(notification: AdminEmailNotificationSetupResult | null) {
  return Boolean(
    notification &&
      notification.status === "setup_only" &&
      notification.external_send === false &&
      notification.sendingEnabled === false &&
      notification.payload.subject &&
      notification.payload.body_lines.length > 0,
  );
}

function hasValidRecipient(recipient: AdminEmailRecipientSafetySetupResult | null) {
  return Boolean(
    recipient &&
      recipient.status === "setup_only" &&
      recipient.external_send === false &&
      recipient.sendingEnabled === false &&
      recipient.recipient.recipient_status === "valid" &&
      recipient.recipient.recipient_email,
  );
}

function hasSelectedSender(sender: AdminEmailSenderSelectionSetupResult | null) {
  return Boolean(
    sender &&
      sender.status === "setup_only" &&
      sender.external_send === false &&
      sender.sendingEnabled === false &&
      sender.selected_sender.match_reason !== "none" &&
      sender.selected_sender.sender_key,
  );
}

export function buildAdminEmailSendPolicySetup(
  input: AdminEmailSendPolicySetupInput,
): AdminEmailSendPolicySetupResult {
  const missingRequirements: AdminEmailSendPolicyMissingRequirement[] = [];

  if (!hasNotificationTemplate(input.notification)) {
    missingRequirements.push("notification_template");
  }

  if (!hasValidRecipient(input.recipient)) {
    missingRequirements.push("recipient_valid");
  }

  if (!hasSelectedSender(input.sender)) {
    missingRequirements.push("sender_selected");
  }

  return {
    decision: missingRequirements.length === 0 ? "allowed_for_future_setup" : "blocked",
    delivery_surface: "email_send_policy_setup_only",
    external_send: false,
    missing_requirements: missingRequirements,
    sendingEnabled: false,
    status: "setup_only",
    version: adminEmailSendPolicySetupFoundationVersion,
  };
}
