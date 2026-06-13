import { buildSmsCustomerDriverDetailsSetup } from "../../../lib/sms-customer-driver-details-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type SmsCustomerDriverDetails = ReturnType<typeof buildSmsCustomerDriverDetailsSetup>;

function fallbackPreview() {
  return buildSmsCustomerDriverDetailsSetup({});
}

function readinessFor(setup: SmsCustomerDriverDetails) {
  return {
    channel: setup.channel,
    customerMessageReady: setup.customerMessageReady,
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: setup.missing_requirements,
    providerConfigured: false,
    sendingEnabled: false,
    smsMessageReady: setup.smsMessageReady,
    status: setup.status,
  };
}

function previewFor(setup: SmsCustomerDriverDetails) {
  return {
    channel: setup.channel,
    customerMessageReady: setup.customerMessageReady,
    delivery_surface: setup.delivery_surface,
    external_send: false,
    liveSendingEnabled: false,
    message: setup.message,
    payload: setup.payload,
    providerConfigured: false,
    sendingEnabled: false,
    smsMessageReady: setup.smsMessageReady,
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
      error: "SMS customer driver details preview readiness setup request failed safely.",
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
    const setup = buildSmsCustomerDriverDetailsSetup({
      booking_reference:
        searchParams.get("booking_reference") || searchParams.get("bookingReference"),
      details_link: searchParams.get("details_link") || searchParams.get("detailsLink"),
      driver_name: searchParams.get("driver_name") || searchParams.get("driverName"),
      driver_phone: searchParams.get("driver_phone") || searchParams.get("driverPhone"),
      pickup_time: searchParams.get("pickup_time") || searchParams.get("pickupTime"),
      secure_details_link:
        searchParams.get("secure_details_link") || searchParams.get("secureDetailsLink"),
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
