import {
  customerPortalSessionIssueAuthRequiredResult,
  resolveCustomerPortalSessionIssue,
} from "../../../lib/customer-portal-session-issue";

export const dynamic = "force-dynamic";

function safeErrorResponse(result: { error: string; status: number }) {
  return Response.json(
    {
      error: result.error,
      ok: false,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: result.status,
    },
  );
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Customer portal session issue failed safely.",
      ok: false,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 500,
    },
  );
}

export async function POST(request: Request) {
  try {
    const result = resolveCustomerPortalSessionIssue(request);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json(
      {
        ok: true,
        version: result.data.version,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": result.data.cookie,
        },
      },
    );
  } catch {
    return safeFailureResponse();
  }
}

export async function GET() {
  const result = customerPortalSessionIssueAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function PUT() {
  const result = customerPortalSessionIssueAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function PATCH() {
  const result = customerPortalSessionIssueAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function DELETE() {
  const result = customerPortalSessionIssueAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}
