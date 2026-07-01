import {
  loadAdminCompletedBookingCloseout,
  parseAdminCompletedBookingCloseoutLoadParams,
  parseAdminCompletedBookingCloseoutSavePayload,
  saveAdminCompletedBookingCloseout,
} from "../../../lib/admin-completed-booking-closeout-persistence";
import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST"],
  });

  return boundary.ok
    ? {
        context: boundary.context,
        ok: true,
      }
    : {
        ok: false,
        response: blockedResponse(boundary.error),
      };
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin completed booking closeout request failed safely.",
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

    const parsed = parseAdminCompletedBookingCloseoutLoadParams(
      new URL(request.url).searchParams,
    );

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await loadAdminCompletedBookingCloseout(parsed.data, actor);

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
      closeout: result.data,
      ok: true,
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

    const parsed = parseAdminCompletedBookingCloseoutSavePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await saveAdminCompletedBookingCloseout(parsed.data, actor);

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
      closeout: result.data,
      ok: true,
    });
  } catch {
    return safeFailureResponse();
  }
}
