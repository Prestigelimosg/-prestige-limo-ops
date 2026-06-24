import {
  buildCustomerLiveLocationMapScaffoldResponse,
  customerLiveLocationMapScaffoldVersion,
  isCustomerLiveLocationMapRequestBoundaryPresent,
  isCustomerLiveLocationMapRuntimeGateOpen,
} from "../../../lib/customer-live-location-map-scaffold";

export const dynamic = "force-dynamic";

function blockedResponse(
  error: string,
  boundary: ReturnType<typeof isCustomerLiveLocationMapRequestBoundaryPresent>,
) {
  return Response.json(
    {
      error,
      ok: false,
      result: buildCustomerLiveLocationMapScaffoldResponse({
        bookingReferencePresent: boundary.bookingReferencePresent,
        sessionPresent: boundary.sessionPresent,
      }),
      version: customerLiveLocationMapScaffoldVersion,
    },
    { status: 403 },
  );
}

function closedResponse(
  boundary: ReturnType<typeof isCustomerLiveLocationMapRequestBoundaryPresent>,
) {
  return Response.json(
    {
      ok: false,
      result: buildCustomerLiveLocationMapScaffoldResponse({
        bookingReferencePresent: boundary.bookingReferencePresent,
        sessionPresent: boundary.sessionPresent,
      }),
      version: customerLiveLocationMapScaffoldVersion,
    },
    { status: 503 },
  );
}

function methodBlockedResponse() {
  return Response.json(
    {
      error: "customer_live_location_map_method_blocked",
      ok: false,
      version: customerLiveLocationMapScaffoldVersion,
    },
    { status: 403 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = isCustomerLiveLocationMapRequestBoundaryPresent(request);

    if (!boundary.ok) {
      return blockedResponse("customer_live_location_map_boundary_blocked", boundary);
    }

    if (isCustomerLiveLocationMapRuntimeGateOpen()) {
      const { handleCustomerLiveLocationMapRuntimeRequest } = await import(
        "../../../lib/customer-live-location-map-runtime"
      );
      const result = await handleCustomerLiveLocationMapRuntimeRequest({
        boundary,
        request,
      });

      return Response.json(result.body, { status: result.status });
    }

    return closedResponse(boundary);
  } catch {
    return Response.json(
      {
        error: "customer_live_location_map_scaffold_failed_safely",
        ok: false,
        version: customerLiveLocationMapScaffoldVersion,
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  return methodBlockedResponse();
}

export async function PUT() {
  return methodBlockedResponse();
}

export async function PATCH() {
  return methodBlockedResponse();
}

export async function DELETE() {
  return methodBlockedResponse();
}
