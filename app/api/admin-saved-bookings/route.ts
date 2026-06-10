import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import { createAdminSavedBooking } from "../../../lib/admin-saved-booking-create";
import { deleteAdminCompletedSavedBooking } from "../../../lib/admin-saved-booking-delete";
import {
  loadAdminSavedBookingById,
  loadAdminSavedBookingList,
} from "../../../lib/admin-saved-booking-read";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  if (!boundary.ok) {
    return {
      ok: false,
      response: blockedResponse(boundary.error),
    };
  }

  if (boundary.context.mode === "local-dev-admin-surface" && isProductionRuntime()) {
    return {
      ok: false,
      response: blockedResponse("Admin booking persistence is available only from the internal admin dashboard."),
    };
  }

  return {
    context: boundary.context,
    ok: true,
  };
}

function safeFailureResponse(error = "Admin saved booking read request failed safely.") {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const searchParams = new URL(request.url).searchParams;
    const isSingleBookingRead = Boolean(searchParams.get("id") || searchParams.get("booking_id"));

    if (isSingleBookingRead) {
      const result = await loadAdminSavedBookingById(searchParams, actor);

      if (!result.ok) {
        return Response.json(
          {
            error: result.error,
            ok: false,
          },
          { status: result.status },
        );
      }

      return Response.json({
        booking: result.data.booking,
        ok: true,
        version: result.data.version,
      });
    }

    const result = await loadAdminSavedBookingList(searchParams, actor);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      bookings: result.data.bookings,
      ok: true,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await createAdminSavedBooking(await readJsonBody(request), actor);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      booking: result.data.booking,
      ok: true,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse("Admin saved booking create request failed safely.");
  }
}

export async function DELETE(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await deleteAdminCompletedSavedBooking(await readJsonBody(request), actor);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      booking: result.data.booking,
      ok: true,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse("Admin saved booking delete request failed safely.");
  }
}
