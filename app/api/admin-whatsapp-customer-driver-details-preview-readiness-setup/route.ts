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

function fallbackPreview() {
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
    status: setup.status,
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

function blockedResponse(error: string) {
  const setup = fallbackPreview();

  return Response.json(
    {
      channel: setup.channel,
      error,
      external_send: false,
      liveSendingEnabled: false,
      ok: false,
      preview: previewFor(setup),
      providerConfigured: false,
      readiness: readinessFor(setup),
      sendingEnabled: false,
      setup,
      status: "blocked",
      version: setup.version,
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
  const setup = fallbackPreview();

  return Response.json(
    {
      channel: setup.channel,
      error: "WhatsApp customer driver details preview readiness setup request failed safely.",
      external_send: false,
      liveSendingEnabled: false,
      ok: false,
      preview: previewFor(setup),
      providerConfigured: false,
      readiness: readinessFor(setup),
      sendingEnabled: false,
      setup,
      status: "blocked",
      version: setup.version,
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

    return Response.json({
      channel: setup.channel,
      external_send: false,
      liveSendingEnabled: false,
      ok: true,
      preview: previewFor(setup),
      providerConfigured: false,
      readiness: readinessFor(setup),
      sendingEnabled: false,
      setup,
      status: setup.status,
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
