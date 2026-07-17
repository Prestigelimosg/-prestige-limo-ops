import {
  customerBookingMemoryAuthRequiredResult,
  loadCustomerBookingMemory,
  resolveCustomerBookingMemoryBoundary,
} from "../../../lib/customer-booking-memory-read";

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
      error: "Customer booking memory read failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = resolveCustomerBookingMemoryBoundary(request);

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const result = await loadCustomerBookingMemory(new URL(request.url).searchParams, boundary.data);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      booker_profile: result.data.booker_profile,
      memories: result.data.memories,
      ok: true,
      travelers: result.data.travelers,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST() {
  const result = customerBookingMemoryAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function PUT() {
  const result = customerBookingMemoryAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function PATCH() {
  const result = customerBookingMemoryAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}

export async function DELETE() {
  const result = customerBookingMemoryAuthRequiredResult();

  return result.ok ? safeFailureResponse() : safeErrorResponse(result);
}
