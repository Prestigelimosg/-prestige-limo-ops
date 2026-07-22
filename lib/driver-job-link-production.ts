import {
  productionDriverJobLinksConfigured,
  productionDriverJobLinksDisabledResult,
  type DriverJobLinkDisabledResult,
} from "./driver-job-link-mode.ts";
import {
  getDriverJobStatusPersistenceClientForProduction,
  loadDriverJobPayloadThroughStatusPersistence,
  saveDriverJobDetailsThroughStatusPersistence,
  saveDriverJobStatusThroughStatusPersistence,
  type DriverJobProductionDetailsUpdateResult,
  type DriverJobProductionPayloadResult,
  type DriverJobProductionStatusUpdateResult,
  type DriverJobStatusPersistenceClient,
} from "./driver-job-status-persistence.ts";
import {
  registerDriverDevicePushSubscriptionForAcknowledgedLink,
  type DriverDevicePushRegistrationResult,
} from "./driver-device-push-notification.ts";
import {
  issueDriverPortalSessionForAcknowledgedToken,
  type DriverPortalEnrollmentResult,
} from "./driver-portal-session.ts";

export type ProductionDriverJobDetailsUpdateInput = {
  devicePushSubscription?: unknown;
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

  const detailsResult = await saveDriverJobDetailsThroughStatusPersistence({
    client: clientResult.client,
    driverContact,
    driverName,
    driverPlateNumber,
    driverVehicleModel,
    token,
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

  return saveDriverJobStatusThroughStatusPersistence({
    client: clientResult.client,
    completionNote,
    exceptionReason,
    safeStatusContext,
    safeStatusNote,
    status,
    token,
  });
}
