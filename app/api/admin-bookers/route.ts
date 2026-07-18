import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  adminBookersVersion,
  createAdminBooker,
  findAdminBooker,
  updateAdminBooker,
} from "../../../lib/admin-bookers";

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

function errorResponse(result: { error: string; status: number }) {
  return Response.json(
    {
      error: result.error,
      ok: false,
    },
    { status: result.status },
  );
}

function blockedResponse(error: string) {
  return errorResponse({ error, status: 403 });
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin booker request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

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

async function readJsonBody(request: Request) {
  try {
    const value = await request.json();

    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await findAdminBooker(new URL(request.url).searchParams, actor);

    if (!result.ok) {
      return errorResponse(result);
    }

    return Response.json({
      booker: result.data,
      ok: true,
      version: adminBookersVersion,
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
    const result = await createAdminBooker(await readJsonBody(request), actor);

    if (!result.ok) {
      return errorResponse(result);
    }

    return Response.json({
      booker: result.data,
      ok: true,
      version: adminBookersVersion,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function PATCH(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await updateAdminBooker(await readJsonBody(request), actor);

    if (!result.ok) {
      return errorResponse(result);
    }

    return Response.json({
      booker: result.data,
      ok: true,
      version: adminBookersVersion,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function PUT() {
  return blockedResponse("Admin booker request is outside the allowed contract.");
}

export async function DELETE() {
  return blockedResponse("Admin booker request is outside the allowed contract.");
}
