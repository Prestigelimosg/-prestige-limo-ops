import { resolveAdminCustomerInvoiceBoundary } from "../../../lib/admin-customer-invoice-boundary";
import {
  archiveAdminCustomerTestInvoiceArtifact,
  createCustomerInvoiceRecord,
  customerInvoiceTestArtifactArchiveAction,
  loadAdminCustomerInvoiceRecords,
  updateAdminCustomerInvoiceStatus,
} from "../../../lib/customer-invoice-record-persistence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeErrorResponse(result: { error: string; status: number }) {
  return Response.json(
    {
      error: result.error,
      ok: false,
    },
    { status: result.status },
  );
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Customer invoice record request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();

    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  try {
    const boundary = resolveAdminCustomerInvoiceBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const result = await loadAdminCustomerInvoiceRecords(boundary.actor);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      invoices: result.data,
      ok: true,
      version: result.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST(request: Request) {
  try {
    const boundary = resolveAdminCustomerInvoiceBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const result = await createCustomerInvoiceRecord(await readJsonBody(request), boundary.actor);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      invoice: result.data,
      ok: true,
      version: result.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function PATCH(request: Request) {
  try {
    const boundary = resolveAdminCustomerInvoiceBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const body = await readJsonBody(request);
    const isArchiveTestArtifactAction = body?.action === customerInvoiceTestArtifactArchiveAction;
    const result = isArchiveTestArtifactAction
      ? await archiveAdminCustomerTestInvoiceArtifact(body, boundary.actor)
      : await updateAdminCustomerInvoiceStatus(
          body?.invoiceNumber,
          body?.status,
          boundary.actor,
        );

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      archived: isArchiveTestArtifactAction,
      invoice: result.data,
      ok: true,
      version: result.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
