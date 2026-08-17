import {
  productionDriverJobLinksConfigured,
  productionDriverJobLinksDisabledResult,
  type DriverJobLinkDisabledResult,
} from "./driver-job-link-mode.ts";
import {
  getDriverJobStatusPersistenceClientForProduction,
  loadDriverJobPayloadThroughStatusPersistence,
  loadVerifiedDriverProfileForJobThroughStatusPersistence,
  saveDriverJobDetailsThroughStatusPersistence,
  saveDriverJobStatusThroughStatusPersistence,
  type DriverJobProductionDetailsUpdateResult,
  type DriverJobProductionPayloadResult,
  type DriverJobProductionStatusUpdateResult,
  type DriverJobStatusPersistenceClient,
  type VerifiedDriverJobAccountProfile,
} from "./driver-job-status-persistence.ts";
import { verifyDriverAccountSession } from "./driver-account-device-lock.ts";
import {
  registerDriverNativeDevicePushSubscriptionForAcknowledgedLink,
  registerDriverDevicePushSubscriptionForAcknowledgedLink,
  unregisterDriverNativeDevicePushSubscriptionForAcknowledgedLink,
  type DriverNativeDeviceAlertUpdateResult,
  type DriverDevicePushRegistrationResult,
} from "./driver-device-push-notification.ts";
import {
  issueDriverPortalSessionForAcknowledgedToken,
  resolveDriverPortalSession,
  type DriverPortalEnrollmentResult,
} from "./driver-portal-session.ts";

export type ProductionDriverJobDetailsUpdateInput = {
  devicePushSubscription?: unknown;
  driverInstallationId?: unknown;
  driverPortalCookieHeader?: string | null;
  driverContact?: unknown;
  driverName?: unknown;
  driverPlateNumber?: unknown;
  driverVehicleModel?: unknown;
  token: string;
};

export type ProductionDriverJobDetailsUpdateResult =
  | (Extract<DriverJobProductionDetailsUpdateResult, { ok: true }> & {
      device_alerts: DriverDevicePushRegistrationResult;
      driver_portal: DriverPortalEnrollmentResult;
    })
  | Exclude<DriverJobProductionDetailsUpdateResult, { ok: true }>
  | DriverJobLinkDisabledResult;

export type ProductionDriverJobStatusUpdateInput = {
  completionNote?: unknown;
  exceptionReason?: unknown;
  safeStatusContext?: unknown;
  safeStatusNote?: unknown;
  status: string;
  token: string;
};

export async function applyProductionDriverNativeDeviceAlertUpdate(input: {
  action: "register" | "unregister";
  expoPushToken: unknown;
  token: string;
}): Promise<DriverNativeDeviceAlertUpdateResult | DriverJobLinkDisabledResult> {
  const clientResult = resolveProductionClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  return input.action === "register"
    ? registerDriverNativeDevicePushSubscriptionForAcknowledgedLink({
        client: clientResult.client,
        expoPushToken: input.expoPushToken,
        token: input.token,
      })
    : unregisterDriverNativeDevicePushSubscriptionForAcknowledgedLink({
        client: clientResult.client,
        expoPushToken: input.expoPushToken,
        token: input.token,
      });
}

async function resolveVerifiedAccountDriverId({
  client,
  cookieHeader,
  driverInstallationId,
}: {
  client: DriverJobStatusPersistenceClient;
  cookieHeader: string | null;
  driverInstallationId: unknown;
}) {
  const session = resolveDriverPortalSession(cookieHeader);
  if (!session.ok || !session.claims.accountId || !session.claims.deviceIdHash) {
    return null;
  }

  const activeAccount = await verifyDriverAccountSession({
    accountId: session.claims.accountId,
    client,
    deviceIdHash: session.claims.deviceIdHash,
    driverId: session.claims.driverId,
    installationId: driverInstallationId,
  });

  return activeAccount ? session.claims.driverId : null;
}

export async function getProductionVerifiedDriverJobProfile({
  cookieHeader,
  driverInstallationId,
  token,
}: {
  cookieHeader: string | null;
  driverInstallationId: unknown;
  token: string;
}): Promise<VerifiedDriverJobAccountProfile | null> {
  const clientResult = resolveProductionClient();
  if (!clientResult.ok) {
    return null;
  }

  const verifiedAccountDriverId = await resolveVerifiedAccountDriverId({
    client: clientResult.client,
    cookieHeader,
    driverInstallationId,
  });
  if (!verifiedAccountDriverId) {
    return null;
  }

  return loadVerifiedDriverProfileForJobThroughStatusPersistence({
    client: clientResult.client,
    token,
    verifiedAccountDriverId,
  });
}

const adminDevicePushEventForDriverStatus = {
  driver_otw: "driver_otw",
  ots: "driver_ots",
  pob: "driver_pob",
  completed: "driver_completed",
} as const;

let driverJobProductionClientForTests: DriverJobStatusPersistenceClient | null = null;

export function setDriverJobProductionSupabaseClientForTests(
  client: DriverJobStatusPersistenceClient | null,
) {
  driverJobProductionClientForTests = client;
}

function resolveProductionClient():
  | {
      client: DriverJobStatusPersistenceClient;
      ok: true;
    }
  | DriverJobLinkDisabledResult {
  if (!productionDriverJobLinksConfigured()) {
    return productionDriverJobLinksDisabledResult();
  }

  if (driverJobProductionClientForTests) {
    return {
      client: driverJobProductionClientForTests,
      ok: true,
    };
  }

  const clientResult = getDriverJobStatusPersistenceClientForProduction();

  if (!clientResult.ok) {
    return productionDriverJobLinksDisabledResult();
  }

  return clientResult;
}

// Production driver job links remain default-off. When explicitly enabled, this
// verifies the hashed token server-side and returns only the driver-safe payload.
export async function getProductionDriverJobPayloadForToken(
  token: string,
): Promise<DriverJobProductionPayloadResult | DriverJobLinkDisabledResult> {
  const clientResult = resolveProductionClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  return loadDriverJobPayloadThroughStatusPersistence({
    client: clientResult.client,
    token,
  });
}

// Driver acknowledgement persists only safe assigned-driver fields for the
// verified job token. It does not expose pricing, payout, provider, GPS, or
// billing fields, and it does not send customer/provider messages.
export async function applyProductionDriverJobDetailsUpdate({
  devicePushSubscription,
  driverInstallationId,
  driverPortalCookieHeader,
  driverContact,
  driverName,
  driverPlateNumber,
  driverVehicleModel,
  token,
}: ProductionDriverJobDetailsUpdateInput): Promise<ProductionDriverJobDetailsUpdateResult> {
  const clientResult = resolveProductionClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const verifiedAccountDriverId = await resolveVerifiedAccountDriverId({
    client: clientResult.client,
    cookieHeader: driverPortalCookieHeader ?? null,
    driverInstallationId,
  });

  const detailsResult = await saveDriverJobDetailsThroughStatusPersistence({
    client: clientResult.client,
    driverContact,
    driverName,
    driverPlateNumber,
    driverVehicleModel,
    token,
    verifiedAccountDriverId,
  });

  if (!detailsResult.ok) {
    return detailsResult;
  }

  const deviceAlerts = await registerDriverDevicePushSubscriptionForAcknowledgedLink({
    client: clientResult.client,
    subscription: devicePushSubscription,
    token,
  });
  const driverPortal = await issueDriverPortalSessionForAcknowledgedToken({
    client: clientResult.client,
    cookieHeader: driverPortalCookieHeader ?? null,
    token,
  });

  try {
    const { syncAcknowledgedDriverDetailsToOperationsCalendar } = await import(
      "./driver-job-operations-calendar-sync.ts"
    );
    const operationsCalendarSynced =
      await syncAcknowledgedDriverDetailsToOperationsCalendar({
        bookingReference: detailsResult.booking_reference,
        client: clientResult.client,
        pickupAt: detailsResult.payload.pickupDateTime,
      });

    if (!operationsCalendarSynced) {
      console.warn("Driver acknowledgement Operations Calendar sync failed safely.");
    }
  } catch {
    // A saved acknowledgement must not fail because Operations Calendar is unavailable.
    console.warn("Driver acknowledgement Operations Calendar sync failed safely.");
  }

  try {
    const { sendAdminDevicePushAlert } = await import("./admin-device-push-notification.ts");
    await sendAdminDevicePushAlert("driver_acknowledged", {
      vehiclePlate: detailsResult.payload.assignedDriver.plate,
    });
  } catch {
    // A saved acknowledgement must not fail because Admin device push is unavailable.
  }

  return {
    ...detailsResult,
    device_alerts: deviceAlerts,
    driver_portal: driverPortal,
  };
}

// Status updates insert one event for the verified token/link only, may queue
// one fixed customer-app status update, and clear that link's active sharing
// marker after completion. No Driver Database access, pricing, payout,
// provider send, proof, or customer tracking path.
export async function applyProductionDriverJobStatusUpdate({
  completionNote,
  exceptionReason,
  safeStatusContext,
  safeStatusNote,
  status,
  token,
}: ProductionDriverJobStatusUpdateInput): Promise<
  DriverJobProductionStatusUpdateResult | DriverJobLinkDisabledResult
> {
  const clientResult = resolveProductionClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const result = await saveDriverJobStatusThroughStatusPersistence({
    client: clientResult.client,
    completionNote,
    exceptionReason,
    safeStatusContext,
    safeStatusNote,
    status,
    token,
  });

  if (result.ok) {
    try {
      const { sendAdminDevicePushAlert } = await import("./admin-device-push-notification.ts");
      await sendAdminDevicePushAlert(adminDevicePushEventForDriverStatus[result.status], {
        vehiclePlate: result.payload.assignedDriver.plate,
      });
    } catch {
      // A saved driver status must not fail because Admin device push is unavailable.
    }
  }

  return result;
}
