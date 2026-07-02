import { NextResponse } from "next/server";

import { assertActiveCustomerPortalAccessAccount } from "../../../../lib/customer-portal-access-account";
import {
  customerPortalAccessCookieHeader,
  resolveCustomerPortalAccessSession,
} from "../../../../lib/customer-portal-access-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function blockedResponse() {
  return Response.json(
    {
      error: "Customer portal access is not available.",
      ok: false,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 403,
    },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const session = resolveCustomerPortalAccessSession(token);

    if (!session.ok) {
      return blockedResponse();
    }

    const activeAccount = await assertActiveCustomerPortalAccessAccount(
      session.data.customer_account_reference,
    );

    if (!activeAccount.ok) {
      return blockedResponse();
    }

    const cookie = customerPortalAccessCookieHeader(token);

    if (!cookie.ok) {
      return blockedResponse();
    }

    const response = NextResponse.redirect(new URL("/my-bookings", request.url), {
      status: 303,
    });

    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Set-Cookie", cookie.data);

    return response;
  } catch {
    return blockedResponse();
  }
}

export async function POST() {
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
