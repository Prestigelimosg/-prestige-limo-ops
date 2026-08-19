import { prepareDisabledAdminEmailSend } from "../../../lib/admin-email-send-disabled-adapter";
import { buildAdminEmailNotificationSetupPayload } from "../../../lib/admin-email-notification-setup-foundation";
import { buildAdminEmailProviderReadinessSetup } from "../../../lib/admin-email-provider-readiness-setup-foundation";
import { buildAdminEmailProviderSelectionSetup } from "../../../lib/admin-email-provider-selection-setup-foundation";
import { buildAdminEmailRecipientSafetySetup } from "../../../lib/admin-email-recipient-safety-setup-foundation";
import { buildAdminEmailSenderSelectionSetup } from "../../../lib/admin-email-sender-selection-setup-foundation";
import { buildAdminEmailSendPolicySetup } from "../../../lib/admin-email-send-policy-setup-foundation";
import { adminCustomerDriverDetailsEmailConfigReadiness } from "../../../lib/admin-customer-driver-details-email-send-action";
import {
  adminAccountAuthIsEnabled,
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

const activationPreflightVersion = "admin-email-activation-preflight-setup-api-v1";
const activationBlockers = ["provider", "env", "approval", "live_sending"] as const;

function blockerList() {
  return [...activationBlockers];
}

function blockedPayload(error?: string) {
  return {
    ...(error ? { error } : {}),
    activationReady: false,
    activationStatus: "blocked",
    blockers: blockerList(),
    configurationReady: false,
    driverDetailsEmailSendGateOpen: false,
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: blockerList(),
    providerConfigured: false,
    providerCredentialConfigured: false,
    providerSelected: false,
    recipientAllowlistConfigured: false,
    replyToMatched: false,
    selectedProvider: null,
    senderMatched: false,
    sendingEnabled: false,
    status: "blocked",
    version: activationPreflightVersion,
  };
}

function blockedResponse(error: string) {
  return Response.json({ ok: false, ...blockedPayload(error) }, { status: 403 });
}

function hasSameOriginAdminDashboardReferer(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && origin !== requestUrl.origin) {
    return false;
  }

  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);

    return refererUrl.origin === requestUrl.origin && refererUrl.pathname === "/";
  } catch {
    return false;
  }
}

function hasSetupOnlyAdminDashboardBoundary(request: Request) {
  return (
    request.headers.get("x-prestige-admin-purpose") === adminBookingPersistencePurpose &&
    hasSameOriginAdminDashboardReferer(request)
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  if (boundary.ok) {
    return { context: boundary.context, ok: true };
  }

  if (adminAccountAuthIsEnabled()) {
    return { ok: false, response: blockedResponse(boundary.error) };
  }

  if (hasSetupOnlyAdminDashboardBoundary(request)) {
    return {
      context: {
        actorLabel: "Admin setup dashboard",
        mode: "local-dev-admin-surface",
        role: "admin",
      },
      ok: true,
    };
  }

  return { ok: false, response: blockedResponse(boundary.error) };
}

function buildActivationPreflight() {
  const configuration = adminCustomerDriverDetailsEmailConfigReadiness();
  const activationReady =
    configuration.configurationReady && configuration.driverDetailsEmailSendGateOpen;
  const blockers = [
    ...(!configuration.providerSelected ? (["provider"] as const) : []),
    ...(!configuration.configurationReady ? (["env"] as const) : []),
    ...(!configuration.driverDetailsEmailSendGateOpen ? (["approval"] as const) : []),
    ...(!activationReady ? (["live_sending"] as const) : []),
  ];
  const activationStatus = activationReady
    ? "ready"
    : configuration.configurationReady
      ? "ready_for_gate"
      : "blocked";
  const selectionSetup = buildAdminEmailProviderSelectionSetup({
    selectedProvider: configuration.selectedProvider,
  });
  const notification = buildAdminEmailNotificationSetupPayload({
    body_lines: ["Email activation preflight setup only.", "Live email sending remains disabled."],
    booking_reference: "EMAIL-ACTIVATION-PREFLIGHT",
    event_key: "email-activation-preflight-setup",
    notification_type: "email_activation_preflight",
    preview_text: "Email activation is blocked until provider setup is approved.",
    recipient_role: "admin",
    subject: "Email activation preflight setup",
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
    template_key: "admin_email_activation_preflight",
  });
  const readiness = buildAdminEmailProviderReadinessSetup({
    disabledSend,
    policy,
  });
  const selection = {
    ...selectionSetup,
    external_send: false,
    liveSendingEnabled: activationReady,
    missing_requirements: blockers,
    providerConfigured: configuration.providerConfigured,
    providerSelected: configuration.providerSelected,
    selectedProvider: configuration.selectedProvider,
    selectedProviderStatus: configuration.providerSelected ? "configured" : "not_selected",
  };
  const truthfulReadiness = {
    ...readiness,
    external_send: false,
    liveSendingEnabled: activationReady,
    missing_requirements: blockers,
    providerConfigured: configuration.providerConfigured,
    status: activationStatus,
  };

  return {
    activationReady,
    activationStatus,
    blockers,
    componentStatuses: {
      disabledSend: disabledSend.status,
      emailPolicy: policy.decision,
      providerReadiness: truthfulReadiness.status,
      providerSelection: selection.selectedProviderStatus,
    },
    configurationReady: configuration.configurationReady,
    disabled_send_status: truthfulReadiness.disabled_send_status,
    driverDetailsEmailSendGateOpen: configuration.driverDetailsEmailSendGateOpen,
    external_send: false,
    liveSendingEnabled: activationReady,
    missing_requirements: blockers,
    policy_decision: truthfulReadiness.policy_decision,
    providerConfigured: configuration.providerConfigured,
    providerCredentialConfigured: configuration.providerCredentialConfigured,
    providerSelected: configuration.providerSelected,
    readiness: truthfulReadiness,
    recipientAllowlistConfigured: configuration.recipientAllowlistConfigured,
    replyToMatched: configuration.replyToMatched,
    selectedProvider: configuration.selectedProvider,
    selection,
    senderMatched: configuration.senderMatched,
    sendingEnabled: activationReady,
    status: activationStatus,
    version: activationPreflightVersion,
  };
}

function safeFailureResponse() {
  return Response.json(
    {
      ok: false,
      ...blockedPayload("Email activation preflight setup request failed safely."),
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

    const preflight = buildActivationPreflight();

    return Response.json({
      ok: true,
      ...preflight,
    });
  } catch {
    return safeFailureResponse();
  }
}
