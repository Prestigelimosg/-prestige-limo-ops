import { buildCustomerDriverDetailsLinkSetup } from "../../../lib/customer-driver-details-link-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type CustomerDriverDetailsLinkSetup = ReturnType<typeof buildCustomerDriverDetailsLinkSetup>;

function fallbackPreview() {
  return buildCustomerDriverDetailsLinkSetup({});
}

function readinessFor(setup: CustomerDriverDetailsLinkSetup) {
  return {
    channel: setup.channel,
    channels: setup.channels,
    external_send: false,
    linkEnabled: false,
    linkPayloadReady: setup.linkPayloadReady,
    liveAccessEnabled: false,
    missing_requirements: setup.missing_requirements,
    providerConfigured: false,
    status: setup.status,
    tokenIssued: false,
  };
}

function previewFor(setup: CustomerDriverDetailsLinkSetup) {
  return {
    channel: setup.channel,
    channels: setup.channels,
    customer_safe_token_placeholder: setup.customer_safe_token_placeholder,
    delivery_surface: setup.delivery_surface,
    external_send: false,
    expiry_label: setup.expiry_label,
    linkEnabled: false,
    linkPayloadReady: setup.linkPayloadReady,
    liveAccessEnabled: false,
    payload: setup.payload,
    providerConfigured: false,
    status: setup.status,
    tokenIssued: false,
    version: setup.version,
  };
}

function blockedResponse(error: string) {
  const setup = fallbackPreview();

  return Response.json(
    {
      channel: setup.channel,
      channels: setup.channels,
      error,
      external_send: false,
      linkEnabled: false,
      liveAccessEnabled: false,
      ok: false,
      preview: previewFor(setup),
      providerConfigured: false,
      readiness: readinessFor(setup),
      setup,
      status: "blocked",
      tokenIssued: false,
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
      channels: setup.channels,
      error: "Customer driver details link preview readiness setup request failed safely.",
      external_send: false,
      linkEnabled: false,
      liveAccessEnabled: false,
      ok: false,
      preview: previewFor(setup),
      providerConfigured: false,
      readiness: readinessFor(setup),
      setup,
      status: "blocked",
      tokenIssued: false,
      version: setup.version,
    },
    { status: 500 },
  );
}

function firstParam(searchParams: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function channelsParam(searchParams: URLSearchParams) {
  const channels = searchParams.getAll("channels").flatMap((value) => value.split(","));
  const channel = searchParams.get("channel");

  return channels.length > 0 ? channels : channel;
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const searchParams = new URL(request.url).searchParams;
    const setup = buildCustomerDriverDetailsLinkSetup({
      booking_reference: firstParam(searchParams, "booking_reference", "bookingReference"),
      channel: channelsParam(searchParams),
      customer_safe_token_placeholder: firstParam(
        searchParams,
        "customer_safe_token_placeholder",
        "customerSafeTokenPlaceholder",
        "token_placeholder",
        "tokenPlaceholder",
      ),
      driver_name: firstParam(searchParams, "driver_name", "driverName"),
      driver_phone: firstParam(searchParams, "driver_phone", "driverPhone"),
      expiry_label: firstParam(searchParams, "expiry_label", "expiryLabel"),
      pickup_time: firstParam(searchParams, "pickup_time", "pickupTime"),
      route: searchParams.get("route"),
      vehicle_plate: firstParam(searchParams, "vehicle_plate", "vehiclePlate"),
      vehicle_type: firstParam(searchParams, "vehicle_type", "vehicleType"),
    });

    return Response.json({
      channel: setup.channel,
      channels: setup.channels,
      external_send: false,
      linkEnabled: false,
      liveAccessEnabled: false,
      ok: true,
      preview: previewFor(setup),
      providerConfigured: false,
      readiness: readinessFor(setup),
      setup,
      status: setup.status,
      tokenIssued: false,
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
