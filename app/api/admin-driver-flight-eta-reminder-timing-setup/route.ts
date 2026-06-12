import {
  buildDriverFlightEtaReminderTimingSetupFoundation,
  driverFlightEtaReminderTimingSetupFoundationVersion,
} from "../../../lib/driver-flight-eta-reminder-timing-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function blockedResponse(error: string) {
  return Response.json({ error, ok: false }, { status: 403 });
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);
  return boundary.ok ? { context: boundary.context, ok: true } : { ok: false, response: blockedResponse(boundary.error) };
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin driver flight ETA reminder timing setup request failed safely.",
      ok: false,
      version: driverFlightEtaReminderTimingSetupFoundationVersion,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);
    if (!boundary.ok) return boundary.response;

    const setup = buildDriverFlightEtaReminderTimingSetupFoundation();

    return Response.json({ ok: true, setup, version: setup.version });
  } catch {
    return safeFailureResponse();
  }
}
