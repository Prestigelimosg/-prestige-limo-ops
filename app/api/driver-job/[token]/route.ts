import {
  applyDriverJobDetailsUpdateContract,
  getDriverJobPayloadForTokenContract,
} from "../../../../lib/driver-job-link-contract.ts";
import {
  applyProductionDriverJobDetailsUpdate,
  getProductionDriverJobPayloadForToken,
} from "../../../../lib/driver-job-link-production.ts";
import {
  isProductionDriverJobLinkMode,
} from "../../../../lib/driver-job-link-mode.ts";
import {
  mockDriverJobBookingsById,
  mockDriverJobLinks,
  resetMockDriverJobLinkDataForTests,
} from "../../../../lib/driver-job-link-mock-store.ts";
import {
  getDriverDevicePushReadiness,
} from "../../../../lib/driver-device-push-notification.ts";

type DriverJobRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const blockedStatusByReason = {
  already_completed: 409,
  expired: 410,
  invalid_details: 400,
  invalid_status: 400,
  not_configured: 503,
  out_of_order: 409,
  revoked: 403,
  unauthorized: 401,
} as const;

function publicDriverDeviceAlertReadiness() {
  const readiness = getDriverDevicePushReadiness();

  return {
    enabled: readiness.enabled,
    public_key: readiness.public_key,
    ready: readiness.ready,
  };
}

function publicDriverDeviceAlertRegistration(result: {
  link_key: string | null;
  subscription_registered: boolean;
}) {
  return {
    link_key: result.link_key,
    subscription_registered: result.subscription_registered,
  };
}

function readDriverDetailsBody(body: unknown) {
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};

  return {
    devicePushSubscription: record.device_push_subscription,
    driverContact: record.driver_contact ?? record.driverContact,
    driverName: record.driver_name ?? record.driverName,
    driverPlateNumber: record.driver_plate_number ?? record.driverPlateNumber ?? record.driverPlate,
    driverVehicleModel: record.driver_vehicle_model ?? record.driverVehicleModel,
  };
}

export async function GET(request: Request, context: DriverJobRouteContext) {
  const { token } = await context.params;

  if (isProductionDriverJobLinkMode()) {
    const result = await getProductionDriverJobPayloadForToken(token);

    if (result.ok) {
      return Response.json({
        device_alerts: publicDriverDeviceAlertReadiness(),
        ok: true,
        mode: "production",
        payload: result.payload,
      });
    }

    return Response.json(result, { status: blockedStatusByReason[result.reason] });
  }

  if (request.headers.get("x-prestige-driver-job-mock-reset") === "1") {
    // Test-only reset for mock-backed browser guards. Production mode returns before this branch.
    resetMockDriverJobLinkDataForTests();
  }

  const result = getDriverJobPayloadForTokenContract({
    token,
    links: mockDriverJobLinks,
    bookingsById: mockDriverJobBookingsById,
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        reason: result.reason,
        payload: null,
      },
      { status: blockedStatusByReason[result.reason] },
    );
  }

  // Mock-backed route skeleton only. No Supabase reads, no Driver Database reads, no production token table yet.
  return Response.json({
    device_alerts: publicDriverDeviceAlertReadiness(),
    ok: true,
    mode: "mock",
    payload: result.payload,
  });
}

export async function PATCH(request: Request, context: DriverJobRouteContext) {
  const { token } = await context.params;
  const details = readDriverDetailsBody(await request.json().catch(() => null));

  if (isProductionDriverJobLinkMode()) {
    const result = await applyProductionDriverJobDetailsUpdate({
      token,
      ...details,
    });

    if (result.ok) {
      return Response.json({
        device_alerts: publicDriverDeviceAlertRegistration(result.device_alerts),
        ok: true,
        mode: "production",
        payload: result.payload,
      });
    }

    return Response.json(result, { status: blockedStatusByReason[result.reason] });
  }

  const result = applyDriverJobDetailsUpdateContract({
    token,
    links: mockDriverJobLinks,
    bookingsById: mockDriverJobBookingsById,
    ...details,
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        reason: result.reason,
        payload: null,
      },
      { status: blockedStatusByReason[result.reason] },
    );
  }

  return Response.json({
    device_alerts: {
      link_key: null,
      subscription_registered: false,
    },
    ok: true,
    mode: "mock",
    payload: result.payload,
  });
}
