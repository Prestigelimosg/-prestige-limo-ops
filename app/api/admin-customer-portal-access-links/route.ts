import { resolveAdminCustomerInvoiceBoundary } from "../../../lib/admin-customer-invoice-boundary";
import { createCustomerPortalAccessLinkToken } from "../../../lib/customer-portal-access-link";

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
      error: "Customer portal access link request failed safely.",
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

export async function POST(request: Request) {
  try {
    const boundary = resolveAdminCustomerInvoiceBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const body = await readJsonBody(request);
    const result = createCustomerPortalAccessLinkToken(body.customerAccountReference);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    const url = new URL(
      `/api/customer-portal-access/${encodeURIComponent(result.data.token)}`,
      request.url,
    );

    return Response.json({
      customerAccountReference: result.data.customer_account_reference,
      expiresAt: result.data.expires_at,
      ok: true,
      url: url.toString(),
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function GET() {
  return safeErrorResponse({
    error: "Customer portal access links are available only from the internal admin dashboard.",
    status: 403,
  });
}

export async function PUT() {
  return safeErrorResponse({
    error: "Customer portal access links are available only from the internal admin dashboard.",
    status: 403,
  });
}

export async function PATCH() {
  return safeErrorResponse({
    error: "Customer portal access links are available only from the internal admin dashboard.",
    status: 403,
  });
}

export async function DELETE() {
  return safeErrorResponse({
    error: "Customer portal access links are available only from the internal admin dashboard.",
    status: 403,
  });
}
