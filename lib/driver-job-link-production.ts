import {
  productionDriverJobLinksConfigured,
  productionDriverJobLinksDisabledResult,
  type DriverJobLinkDisabledResult,
} from "./driver-job-link-mode.ts";
import {
  getDriverJobStatusPersistenceClientForProduction,
  loadDriverJobPayloadThroughStatusPersistence,
  saveDriverJobStatusThroughStatusPersistence,
  type DriverJobProductionPayloadResult,
  type DriverJobProductionStatusUpdateResult,
  type DriverJobStatusPersistenceClient,
} from "./driver-job-status-persistence.ts";

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

// Status updates insert one event for the verified token/link only and may queue
// one fixed customer-app status update. No Driver Database access, pricing,
// payout, provider send, proof, or live-location path.
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
