import { resolveAdminCustomerInvoiceBoundary } from "../../../lib/admin-customer-invoice-boundary";
import {
  ensureAdminCustomerPortalAccessAccount,
  revokeAdminCustomerPortalAccessAccount,
} from "../../../lib/customer-portal-access-account";
import {
  issueCustomerPrincipalInvitation,
  revokeCustomerPrincipalAccess,
} from "../../../lib/customer-principal-access";

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
        agencyCustomerAccount: body.agencyCustomerAccount,
        bookerId: body.bookerId,
        companyId: body.companyId,
        customerAccountReference: body.customerAccountReference,
        safeDisplayLabel: body.safeDisplayLabel,
      },
      boundary.actor,
    );

    if (!account.ok) {
      return safeErrorResponse(account);
    }

    const rawMemberships = Array.isArray(body.memberships) ? body.memberships : [];
    const result = await issueCustomerPrincipalInvitation(
      {
        email: body.email,
        memberships: rawMemberships.map((membership) => ({
          ...(membership !== null && typeof membership === "object" ? membership : {}),
          customerAccountReference: account.data.customer_account_reference,
        })),
        principalRole: body.principalRole,
      },
      boundary.actor,
    );

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    const url = result.data.invitation_url_path
      ? new URL(result.data.invitation_url_path, request.url).toString()
      : null;

    return Response.json({
      accessStatus: result.data.access_status,
      accessAction: "Manage Access",
      accountStatus: account.data.account_status,
      customerAccountReference: account.data.customer_account_reference,
      expiresAt: result.data.expires_at,
      ok: true,
      principalId: result.data.principal_id,
      url,
      version: "customer-principal-invitation-v1",
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

    if (action !== "revoke" && action !== "revoke_legacy") {
      return safeErrorResponse({
        error: "Customer portal access account action is invalid.",
        status: 400,
      });
    }

    if (action === "revoke") {
      const result = await revokeCustomerPrincipalAccess(
        { principalId: body.principalId },
        boundary.actor,
      );
      if (!result.ok) return safeErrorResponse(result);
      return Response.json({ ok: true, principalId: result.data.principal_id, revoked: true });
    }

    const result = await revokeAdminCustomerPortalAccessAccount(
      { customerAccountReference: body.customerAccountReference },
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
