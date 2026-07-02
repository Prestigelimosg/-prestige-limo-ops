import { resolveAdminCustomerInvoiceBoundary } from "../../../lib/admin-customer-invoice-boundary";
import {
  ensureAdminCustomerPortalAccessAccount,
  revokeAdminCustomerPortalAccessAccount,
} from "../../../lib/customer-portal-access-account";
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
    const account = await ensureAdminCustomerPortalAccessAccount(
      {
        customerAccountReference: body.customerAccountReference,
        safeDisplayLabel: body.safeDisplayLabel,
      },
      boundary.actor,
    );

    if (!account.ok) {
      return safeErrorResponse(account);
    }

    const result = createCustomerPortalAccessLinkToken(account.data.customer_account_reference, {
      scope: "portal_account",
    });

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    const url = new URL(
      `/api/customer-portal-access/${encodeURIComponent(result.data.token)}`,
      request.url,
    );

    return Response.json({
      accountStatus: account.data.account_status,
      customerAccountReference: result.data.customer_account_reference,
      expiresAt: result.data.expires_at,
      historyWindowMonths: 12,
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

export async function PATCH(request: Request) {
  try {
    const boundary = resolveAdminCustomerInvoiceBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const body = await readJsonBody(request);
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

    if (action !== "revoke") {
      return safeErrorResponse({
        error: "Customer portal access account action is invalid.",
        status: 400,
      });
    }

    const result = await revokeAdminCustomerPortalAccessAccount(
      {
        customerAccountReference: body.customerAccountReference,
      },
      boundary.actor,
    );

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      accountStatus: result.data.account_status,
      customerAccountReference: result.data.customer_account_reference,
      ok: true,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function DELETE() {
  return safeErrorResponse({
    error: "Customer portal access links are available only from the internal admin dashboard.",
    status: 403,
  });
}
