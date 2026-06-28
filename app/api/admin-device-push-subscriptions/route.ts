import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  getAdminDevicePushReadiness,
  registerAdminDevicePushSubscription,
  revokeAdminDevicePushSubscription,
} from "../../../lib/admin-device-push-notification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin device push request failed safely.",
      ok: false,
    },
    { status: 500 },
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
  const boundary = resolveAdminDispatcherBoundary(
    request,
    adminBookingPersistencePurpose,
    {
      allowServerSessionRoleMethodsWithoutRequestToken: ["POST", "PATCH"],
    },
  );

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

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    return Response.json({
      ok: true,
      readiness: getAdminDevicePushReadiness(),
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
    const result = await registerAdminDevicePushSubscription(await readJsonBody(request), actor);

    return Response.json(
      {
        error: result.error,
        ok: result.ok,
        reason: result.reason,
        subscription: result.subscription,
      },
      { status: result.status },
    );
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
    const result = await revokeAdminDevicePushSubscription(await readJsonBody(request), actor);

    return Response.json(
      {
        error: result.error,
        ok: result.ok,
        reason: result.reason,
        subscription: result.subscription,
      },
      { status: result.status },
    );
  } catch {
    return safeFailureResponse();
  }
}
