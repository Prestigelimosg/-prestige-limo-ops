import {
  productionDriverJobLinksDisabledResult,
  type DriverJobLinkDisabledResult,
} from "./driver-job-link-mode.ts";

export type ProductionDriverJobStatusUpdateInput = {
  status: string;
  token: string;
};

// Production driver job links stay disabled until William approves the Supabase
// migration and the server-only token verification/API write path is implemented.
export async function getProductionDriverJobPayloadForToken(token: string): Promise<DriverJobLinkDisabledResult> {
  void token;

  return productionDriverJobLinksDisabledResult();
}

// Future implementation must verify the token against driver_job_links server-side
// before updating exactly one linked booking status. No Driver Database access here.
export async function applyProductionDriverJobStatusUpdate({
  status,
  token,
}: ProductionDriverJobStatusUpdateInput): Promise<DriverJobLinkDisabledResult> {
  void status;
  void token;

  return productionDriverJobLinksDisabledResult();
}
