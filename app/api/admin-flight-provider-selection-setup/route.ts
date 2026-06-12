import {
  adminFlightProviderSelectionSetupFoundationVersion,
  buildAdminFlightProviderSelectionSetupFoundation,
} from "../../../lib/admin-flight-provider-selection-setup-foundation";
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

export async function GET(request: Request) {
  const boundary = requireAdminDispatcherBoundary(request);
  if (!boundary.ok) return boundary.response;

  const setup = buildAdminFlightProviderSelectionSetupFoundation();

  return Response.json({
    ok: true,
    setup,
    version: setup.version,
  });
}
