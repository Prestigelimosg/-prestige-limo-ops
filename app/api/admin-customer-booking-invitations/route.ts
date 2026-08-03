import { resolveAdminCustomerInvoiceBoundary } from "../../../lib/admin-customer-invoice-boundary";
import { createCustomerBookingInvitationToken } from "../../../lib/customer-booking-invitation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function blockedResponse() {
  return Response.json(
    {
      error: "Customer booking invitations are available only from the internal admin dashboard.",
      ok: false,
    },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  try {
    const boundary = resolveAdminCustomerInvoiceBoundary(request);

    if (!boundary.ok) {
      return Response.json(
        {
          error: boundary.error,
          ok: false,
        },
        { status: boundary.status },
      );
    }

    const result = createCustomerBookingInvitationToken();

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    const url = new URL(
      `/book?invite=${encodeURIComponent(result.data.token)}`,
      request.url,
    );

    return Response.json({
      expiresAt: result.data.expires_at,
      ok: true,
      url: url.toString(),
      version: result.data.version,
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error: "Customer booking invitation request failed safely.",
        ok: false,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return blockedResponse();
}

export async function PUT() {
  return blockedResponse();
}

export async function PATCH() {
  return blockedResponse();
}

export async function DELETE() {
  return blockedResponse();
}
