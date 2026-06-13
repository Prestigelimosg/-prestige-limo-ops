import { buildWhatsAppCustomerDriverDetailsSetup } from "../../../lib/whatsapp-customer-driver-details-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type WhatsAppCustomerDriverDetails = ReturnType<typeof buildWhatsAppCustomerDriverDetailsSetup>;

function fallbackSetup() {
  return buildWhatsAppCustomerDriverDetailsSetup({});
}

function readinessFor(setup: WhatsAppCustomerDriverDetails) {
  return {
    channel: setup.channel,
    customerMessageReady: setup.customerMessageReady,
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: setup.missing_requirements,
    providerConfigured: false,
    sendingEnabled: false,
    status: "blocked",
  };
}

function previewFor(setup: WhatsAppCustomerDriverDetails) {
  return {
    adminReviewRequired: setup.adminReviewRequired,
    channel: setup.channel,
    customerMessageReady: setup.customerMessageReady,
    delivery_surface: setup.delivery_surface,
    disabled_message: setup.disabled_message,
    external_send: false,
    liveSendingEnabled: false,
    message: setup.message,
    payload: setup.payload,
    providerConfigured: false,
    sendingEnabled: false,
    status: setup.status,
    version: setup.version,
  };
}

function disabledSendFor(setup: WhatsAppCustomerDriverDetails) {
  return {
    booking_reference: setup.payload.booking_reference,
    channel: setup.channel,
    delivery_surface: setup.disabled_message.delivery_surface,
    disabled_message: setup.disabled_message,
    event_key: setup.disabled_message.event_key,
    external_send: false,
    liveSendingEnabled: false,
    message_key: setup.message.message_key,
    no_op: true,
    notification_type: setup.disabled_message.notification_type,
    preview: setup.disabled_message.preview,
    providerConfigured: false,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    sendingEnabled: false,
    status: "blocked",
    version: setup.disabled_message.version,
  } as const;
}

function blockedResponse(error: string) {
  const setup = fallbackSetup();
  const send = disabledSendFor(setup);

  return Response.json(
    {
      channel: setup.channel,
      delivery_surface: send.delivery_surface,
      error,
      external_send: false,
      liveSendingEnabled: false,
      ok: false,
      preview: previewFor(setup),
      providerConfigured: false,
      readiness: readinessFor(setup),
      reason: send.reason,
      result: send,
      send,
      sendingEnabled: false,
      setup,
      status: "blocked",
      version: send.version,
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

function safeFailureResponse() {
  const setup = fallbackSetup();
  const send = disabledSendFor(setup);

  return Response.json(
    {
      channel: setup.channel,
      delivery_surface: send.delivery_surface,
      error: "WhatsApp customer driver details disabled send setup request failed safely.",
      external_send: false,
      liveSendingEnabled: false,
      ok: false,
      preview: previewFor(setup),
      providerConfigured: false,
      readiness: readinessFor(setup),
      reason: send.reason,
      result: send,
      send,
      sendingEnabled: false,
      setup,
      status: "blocked",
      version: send.version,
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
    const setup = buildWhatsAppCustomerDriverDetailsSetup({
      booking_reference:
        searchParams.get("booking_reference") || searchParams.get("bookingReference"),
      driver_name: searchParams.get("driver_name") || searchParams.get("driverName"),
      driver_phone: searchParams.get("driver_phone") || searchParams.get("driverPhone"),
      pickup_time: searchParams.get("pickup_time") || searchParams.get("pickupTime"),
      route: searchParams.get("route"),
      vehicle_plate: searchParams.get("vehicle_plate") || searchParams.get("vehiclePlate"),
      vehicle_type: searchParams.get("vehicle_type") || searchParams.get("vehicleType"),
    });
    const send = disabledSendFor(setup);

    return Response.json({
      channel: setup.channel,
      delivery_surface: send.delivery_surface,
      external_send: false,
      liveSendingEnabled: false,
      ok: true,
      preview: previewFor(setup),
      providerConfigured: false,
      readiness: readinessFor(setup),
      reason: send.reason,
      result: send,
      send,
      sendingEnabled: false,
      setup,
      status: "blocked",
      version: send.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
