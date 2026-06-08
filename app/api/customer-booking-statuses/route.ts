import {
  customerBookingStatusAuthRequiredResult,
  loadCustomerBookingStatuses,
  resolveCustomerBookingStatusBoundary,
} from "../../../lib/customer-booking-status-read";

export const dynamic = "force-dynamic";

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
      error: "Customer booking status lookup failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = resolveCustomerBookingStatusBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const result = await loadCustomerBookingStatuses(new URL(request.url).searchParams, boundary.data);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      ok: true,
      pagination: result.data.pagination,
      statuses: result.data.statuses,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST() {
  const result = customerBookingStatusAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function PATCH() {
  const result = customerBookingStatusAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}
