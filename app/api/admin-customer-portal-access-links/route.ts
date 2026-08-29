import { resolveAdminCustomerInvoiceBoundary } from "../../../lib/admin-customer-invoice-boundary";
import { findAdminBooker } from "../../../lib/admin-bookers";
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
    const booker = await findAdminBooker(
      {
        company_id: body.companyId,
        id: body.bookerId,
      },
      boundary.actor,
    );
    if (
      !booker.ok ||
      !booker.data ||
      booker.data.customer_id !== Number(body.customerAccountReference) ||
      !booker.data.booker_name ||
      !booker.data.email
    ) {
      return safeErrorResponse({
        error: "Customer app link requires one exact verified Booker account with a saved email.",
        status: 409,
      });
    }

    const account = await ensureAdminCustomerPortalAccessAccount(
      {
        agencyCustomerAccount: false,
        bookerId: booker.data.id,
        companyId: booker.data.company_id,
        customerAccountReference: body.customerAccountReference,
        safeDisplayLabel: body.safeDisplayLabel,
      },
      boundary.actor,
    );

    if (!account.ok) {
      return safeErrorResponse(account);
    }

    const result = await issueCustomerPrincipalInvitation(
      {
        email: booker.data.email,
        memberships: [{
          bookerId: booker.data.id,
          companyId: booker.data.company_id,
          customerAccountReference: account.data.customer_account_reference,
          travelerId: null,
          verifiedBossName: booker.data.booker_name,
        }],
        principalRole: "pa",
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
      accessAction: "Copy + App Link",
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
