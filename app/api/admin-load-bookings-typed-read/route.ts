import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  buildAdminLoadBookingsTypedReadGateState,
  mapAdminLoadBookingsTypedReadDetail,
  mapAdminLoadBookingsTypedReadList,
} from "../../../lib/admin-load-bookings-typed-read-gated";
import {
  loadAdminSavedBookingById,
  loadAdminSavedBookingList,
} from "../../../lib/admin-saved-booking-read";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function blockedResponse(error: string, status = 403) {
  const gate = buildAdminLoadBookingsTypedReadGateState();

  return Response.json(
    {
      ...gate,
      error,
      ok: false,
      status: "blocked",
    },
    { status },
  );
}

function safeFailureResponse() {
  const gate = buildAdminLoadBookingsTypedReadGateState();

  return Response.json(
    {
      ...gate,
      error: "Load Bookings typed read request failed safely.",
      ok: false,
      status: "failed",
    },
    { status: 500 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? { context: boundary.context, ok: true }
    : { ok: false, response: blockedResponse(boundary.error) };
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const gate = buildAdminLoadBookingsTypedReadGateState();

    if (!gate.read_gate_open) {
      return blockedResponse("Load Bookings typed read is not enabled on this server.", 503);
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const searchParams = new URL(request.url).searchParams;
    const isDetailRead = Boolean(searchParams.get("id") || searchParams.get("booking_id"));

    if (isDetailRead) {
      const result = await loadAdminSavedBookingById(searchParams, actor);

      if (!result.ok) {
        return Response.json(
          {
            ...gate,
            error: result.error,
            ok: false,
            status: "failed",
          },
          { status: result.status },
        );
      }

      const mapped = mapAdminLoadBookingsTypedReadDetail(result.data.booking);

      if (!mapped.ok) {
        return Response.json(
          {
            ...gate,
            error: "Load Bookings typed read rejected unsafe record fields.",
            ok: false,
            rejected_fields: mapped.rejected_fields,
            status: "rejected",
          },
          { status: 422 },
        );
      }

      return Response.json({
        ...gate,
        booking: mapped.booking,
        mode: mapped.mode,
        ok: true,
        status: "ready",
      });
    }

    const result = await loadAdminSavedBookingList(searchParams, actor);

    if (!result.ok) {
      return Response.json(
        {
          ...gate,
          error: result.error,
          ok: false,
          status: "failed",
        },
        { status: result.status },
      );
    }

    const mapped = mapAdminLoadBookingsTypedReadList(result.data.bookings);

    if (!mapped.ok) {
      return Response.json(
        {
          ...gate,
          error: "Load Bookings typed read rejected unsafe record fields.",
          ok: false,
          rejected_fields: mapped.rejected_fields,
          status: "rejected",
        },
        { status: 422 },
      );
    }

    return Response.json({
      ...gate,
      bookings: mapped.bookings,
      mode: mapped.mode,
      ok: true,
      status: "ready",
    });
  } catch {
    return safeFailureResponse();
  }
}
