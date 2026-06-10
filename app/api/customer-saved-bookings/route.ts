import {
  customerSavedBookingsAuthRequiredResult,
  loadCustomerSavedBookings,
  resolveCustomerSavedBookingsBoundary,
} from "../../../lib/customer-saved-bookings-read";

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
      error: "Customer saved bookings read failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = resolveCustomerSavedBookingsBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const result = await loadCustomerSavedBookings(new URL(request.url).searchParams, boundary.data);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      ok: true,
      pagination: result.data.pagination,
      saved_bookings: result.data.saved_bookings,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST() {
  const result = customerSavedBookingsAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function PUT() {
  const result = customerSavedBookingsAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function PATCH() {
  const result = customerSavedBookingsAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function DELETE() {
  const result = customerSavedBookingsAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}
