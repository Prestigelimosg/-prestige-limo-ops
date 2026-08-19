import {
  applyDriverJobDetailsUpdateContract,
  getDriverJobPayloadForTokenContract,
} from "../../../../lib/driver-job-link-contract.ts";
import {
  applyProductionDriverNativeDeviceAlertUpdate,
  applyProductionDriverJobDetailsUpdate,
  getProductionDriverJobPayloadForToken,
  getProductionVerifiedDriverJobProfile,
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
  acknowledgement_required: 409,
  already_acknowledged: 409,
  already_completed: 409,
  expired: 410,
  invalid_details: 400,
  invalid_status: 400,
  not_configured: 503,
  out_of_order: 409,
  revoked: 403,
  unauthorized: 401,
} as const;

function readDriverNativeDeviceAlertBody(body: unknown) {
  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const action = record.native_device_alert_action;

  if (
    !["register", "unregister"].includes(String(action)) ||
    Object.keys(record).some((key) =>
      !["native_device_alert_action", "native_push_token"].includes(key)
    )
  ) {
    return null;
  }

  return {
    action: action as "register" | "unregister",
    expoPushToken: record.native_push_token,
  };
}

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

function publicDriverPortalEnrollment(result: {
  jobKey: string | null;
  ok: boolean;
}) {
  return {
    enrolled: result.ok,
    link_key: result.ok ? result.jobKey : null,
  };
}

function nativeDeviceAlertBlockedStatus(reason: string) {
  if (reason === "invalid_subscription") {
    return 400;
  }
  if (
    reason === "not_configured" ||
    reason === "provider_not_configured" ||
    reason === "push_gate_closed" ||
    reason === "subscription_write_failed"
  ) {
    return 503;
  }
  if (reason === "unverified_driver") {
    return 403;
  }
  return 401;
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
      const driverAccountProfile = await getProductionVerifiedDriverJobProfile({
        cookieHeader: request.headers.get("cookie"),
        driverInstallationId: request.headers.get("x-prestige-driver-installation-id"),
        token,
      });

      return Response.json({
        device_alerts: publicDriverDeviceAlertReadiness(),
        driver_portal: publicDriverPortalEnrollment({
          jobKey: result.jobKey,
          ok: true,
        }),
        ok: true,
        mode: "production",
        payload: result.payload,
        driver_account_profile: driverAccountProfile
          ? {
              contact: driverAccountProfile.contact,
              name: driverAccountProfile.name,
              plate: driverAccountProfile.plate,
              vehicle_model: driverAccountProfile.vehicleModel,
            }
          : null,
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
    driver_portal: {
      enrolled: false,
      link_key: null,
    },
    ok: true,
    mode: "mock",
    payload: result.payload,
  });
}

export async function PATCH(request: Request, context: DriverJobRouteContext) {
  const { token } = await context.params;
  const body = await request.json().catch(() => null);
  const nativeDeviceAlertUpdate = readDriverNativeDeviceAlertBody(body);
  const details = readDriverDetailsBody(body);

  if (isProductionDriverJobLinkMode()) {
    if (nativeDeviceAlertUpdate) {
      const result = await applyProductionDriverNativeDeviceAlertUpdate({
        ...nativeDeviceAlertUpdate,
        token,
      });

      if (result.ok) {
        return Response.json(
          {
            native_device_alerts: {
              job_key: result.job_key,
              registered: result.registered,
              unregistered: result.unregistered,
            },
            ok: true,
            mode: "production",
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      return Response.json(result, {
        status: nativeDeviceAlertBlockedStatus(result.reason),
      });
    }

    const result = await applyProductionDriverJobDetailsUpdate({
      driverInstallationId: request.headers.get("x-prestige-driver-installation-id"),
      driverPortalCookieHeader: request.headers.get("cookie"),
      token,
      ...details,
    });

    if (result.ok) {
      const headers = new Headers({
        "Cache-Control": "no-store",
      });
      if (result.driver_portal.ok) {
        headers.set("Set-Cookie", result.driver_portal.cookie);
      }
      return Response.json(
        {
          device_alerts: publicDriverDeviceAlertRegistration(result.device_alerts),
          driver_portal: publicDriverPortalEnrollment(result.driver_portal),
          ok: true,
          mode: "production",
          payload: result.payload,
        },
        { headers },
      );
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
    driver_portal: {
      enrolled: false,
      link_key: null,
    },
    ok: true,
    mode: "mock",
    payload: result.payload,
  });
}
