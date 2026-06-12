import { buildAdminEmailNotificationSetupPayload } from "../../../lib/admin-email-notification-setup-foundation";
import { buildAdminEmailRecipientSafetySetup } from "../../../lib/admin-email-recipient-safety-setup-foundation";
import { buildAdminEmailSenderSelectionSetup } from "../../../lib/admin-email-sender-selection-setup-foundation";
import { buildAdminEmailSendPolicySetup } from "../../../lib/admin-email-send-policy-setup-foundation";
import {
  buildCustomerDriverDetailsEmailReadinessSetup,
  customerDriverDetailsEmailReadinessSetupFoundationVersion,
} from "../../../lib/customer-driver-details-email-readiness-setup-foundation";
import { buildCustomerDriverDetailsEmailSetup } from "../../../lib/customer-driver-details-email-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function blockedResponse(error: string) {
  return Response.json({ error, ok: false }, { status: 403 });
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? { context: boundary.context, ok: true }
    : { ok: false, response: blockedResponse(boundary.error) };
}

function senderProfiles(searchParams: URLSearchParams) {
  const senderKey = searchParams.get("sender_key");
  const senderLabel = searchParams.get("sender_label");

  if (!senderKey || !senderLabel) {
    return [];
  }

  const customerKey = searchParams.get("customer_key");

  return [
    {
      customer_keys: customerKey ? [customerKey] : [],
      is_default: true,
      sender_key: senderKey,
      sender_label: senderLabel,
      sender_role: searchParams.get("sender_role"),
    },
  ];
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Customer driver details email preview readiness setup request failed safely.",
      ok: false,
      version: customerDriverDetailsEmailReadinessSetupFoundationVersion,
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

    const searchParams = new URL(request.url).searchParams;
    const template = buildCustomerDriverDetailsEmailSetup({
      booking_reference: searchParams.get("booking_reference"),
      customer_email: searchParams.get("customer_email"),
      driver_name: searchParams.get("driver_name"),
      driver_phone: searchParams.get("driver_phone"),
      pickup_time: searchParams.get("pickup_time"),
      route: searchParams.get("route"),
      vehicle_plate: searchParams.get("vehicle_plate"),
      vehicle_type: searchParams.get("vehicle_type"),
    });
    const recipient = buildAdminEmailRecipientSafetySetup({
      booking_reference: template.payload.booking_reference,
      customer_account_label: searchParams.get("customer_account_label") || searchParams.get("customer_key"),
      recipient_email: template.payload.customer_email,
    });
    const sender = buildAdminEmailSenderSelectionSetup({
      customer_key: searchParams.get("customer_key"),
      profiles: senderProfiles(searchParams),
    });
    const notification = buildAdminEmailNotificationSetupPayload({
      body_lines: template.template.body_lines,
      booking_reference: template.payload.booking_reference,
      event_key: template.payload.booking_reference
        ? `customer-driver-details-${template.payload.booking_reference}`
        : "customer-driver-details",
      notification_type: "customer_driver_details",
      preview_text: template.template.preview_text,
      recipient_role: "customer",
      subject: template.template.subject,
    });
    const policy = buildAdminEmailSendPolicySetup({
      notification,
      recipient,
      sender,
    });
    const readiness = buildCustomerDriverDetailsEmailReadinessSetup({
      policy,
      recipient,
      sender,
      template,
    });

    return Response.json({
      ok: true,
      preview: {
        body_lines: template.template.body_lines,
        delivery_surface: template.delivery_surface,
        external_send: template.external_send,
        payload: template.payload,
        preview_text: template.template.preview_text,
        recipient_status: template.recipient_status,
        sendingEnabled: template.sendingEnabled,
        status: template.status,
        subject: template.template.subject,
        template_key: template.template.template_key,
        version: template.version,
      },
      readiness,
      version: readiness.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
