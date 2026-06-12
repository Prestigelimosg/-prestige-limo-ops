import { buildDriverFlightEtaNotificationPayloadSetup } from "../../../lib/driver-flight-eta-notification-payload-setup";
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

  const searchParams = new URL(request.url).searchParams;

  const payload = buildDriverFlightEtaNotificationPayloadSetup({
    booking_reference: searchParams.get("booking_reference"),
    driver_job_link_id: searchParams.get("driver_job_link_id"),
    flight_no: searchParams.get("flight_no"),
    service_code: searchParams.get("service_code"),
  });

  return Response.json({ ok: true, payload, version: payload.version });
}
