import {
  buildAdminActiveJobsMapScaffoldResponse,
  driverLiveLocationScaffoldVersion,
  readDriverLiveLocationScaffoldGateState,
} from "../../../lib/driver-live-location-scaffold";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

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
      version: driverLiveLocationScaffoldVersion,
    },
    { status: 403 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["DELETE"],
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

export async function DELETE(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    if (!runtimeGateOpen()) {
      return Response.json({ error: "Admin active-jobs map is closed.", ok: false }, { status: 503 });
    }

    const body = await request.json().catch(() => null) as {
      booking_reference?: unknown;
      updated_at?: unknown;
    } | null;
    const { handleAdminRemoveStaleLiveLocationPinRuntimeRequest } = await import(
      "../../../lib/driver-live-location-runtime"
    );
    const result = await handleAdminRemoveStaleLiveLocationPinRuntimeRequest({
      actorRole: boundary.context.role,
      bookingReference: body?.booking_reference,
      updatedAt: body?.updated_at,
    });

    return Response.json(result.body, { status: result.status });
  } catch {
    return safeFailureResponse();
  }
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin active-jobs map scaffold request failed safely.",
      ok: false,
      version: driverLiveLocationScaffoldVersion,
    },
    { status: 500 },
  );
}

function runtimeGateOpen() {
  const gateState = readDriverLiveLocationScaffoldGateState();

  return (
    gateState.active_jobs_map_gate_configured &&
    (gateState.mode === "runtime" || gateState.mode === "evidence")
  );
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    if (runtimeGateOpen()) {
      const { handleAdminActiveJobsMapRuntimeRequest } = await import(
        "../../../lib/driver-live-location-runtime"
      );
      const result = await handleAdminActiveJobsMapRuntimeRequest({
        actorRole: boundary.context.role,
      });

      return Response.json(result.body, { status: result.status });
    }

    return Response.json(
      {
        ok: false,
        result: buildAdminActiveJobsMapScaffoldResponse(),
      },
      { status: 503 },
    );
  } catch {
    return safeFailureResponse();
  }
}
