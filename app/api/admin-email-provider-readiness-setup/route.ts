import { prepareDisabledAdminEmailSend } from "../../../lib/admin-email-send-disabled-adapter";
import { buildAdminEmailNotificationSetupPayload } from "../../../lib/admin-email-notification-setup-foundation";
import { buildAdminEmailProviderReadinessSetup } from "../../../lib/admin-email-provider-readiness-setup-foundation";
import { buildAdminEmailRecipientSafetySetup } from "../../../lib/admin-email-recipient-safety-setup-foundation";
import { buildAdminEmailSenderSelectionSetup } from "../../../lib/admin-email-sender-selection-setup-foundation";
import { buildAdminEmailSendPolicySetup } from "../../../lib/admin-email-send-policy-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

const providerMissingRequirements = ["provider", "env", "approval"] as const;

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      external_send: false,
      liveSendingEnabled: false,
      missing_requirements: providerMissingRequirements,
      ok: false,
      providerConfigured: false,
      sendingEnabled: false,
      status: "blocked",
    },
    { status: 403 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? { context: boundary.context, ok: true }
    : { ok: false, response: blockedResponse(boundary.error) };
}

function buildProviderReadinessSetup() {
  const notification = buildAdminEmailNotificationSetupPayload({
    body_lines: ["Email provider readiness setup only.", "Live sending remains disabled."],
    booking_reference: "EMAIL-PROVIDER-SETUP",
    event_key: "email-provider-readiness-setup",
    notification_type: "email_provider_readiness",
    preview_text: "Email provider setup is pending approval.",
    recipient_role: "admin",
    subject: "Email provider readiness setup",
  });
  const recipient = buildAdminEmailRecipientSafetySetup({
    booking_reference: notification.payload.booking_reference,
    customer_account_label: "Prestige Admin",
    recipient_email: "ops@example.com",
  });
  const sender = buildAdminEmailSenderSelectionSetup({
    customer_key: "prestige-admin",
    profiles: [
      {
        customer_keys: ["prestige-admin"],
        is_default: true,
        sender_key: "prestige-admin-email-setup",
        sender_label: "Prestige Admin Email Setup",
        sender_role: "admin_ops",
      },
    ],
  });
  const policy = buildAdminEmailSendPolicySetup({
    notification,
    recipient,
    sender,
  });
  const disabledSend = prepareDisabledAdminEmailSend({
    body_lines: notification.payload.body_lines,
    booking_reference: notification.payload.booking_reference,
    recipient_email: recipient.recipient.recipient_email,
    sender_key: sender.selected_sender.sender_key,
    subject: notification.payload.subject,
    template_key: "admin_email_provider_readiness",
  });

  return buildAdminEmailProviderReadinessSetup({
    disabledSend,
    policy,
  });
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Email provider readiness setup request failed safely.",
      external_send: false,
      liveSendingEnabled: false,
      missing_requirements: providerMissingRequirements,
      ok: false,
      providerConfigured: false,
      sendingEnabled: false,
      status: "blocked",
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const readiness = buildProviderReadinessSetup();

    return Response.json({
      disabled_send_status: readiness.disabled_send_status,
      external_send: readiness.external_send,
      liveSendingEnabled: readiness.liveSendingEnabled,
      missing_requirements: readiness.missing_requirements,
      ok: true,
      policy_decision: readiness.policy_decision,
      provider: readiness.provider,
      providerConfigured: readiness.providerConfigured,
      readiness,
      sendingEnabled: readiness.sendingEnabled,
      status: readiness.status,
      version: readiness.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
