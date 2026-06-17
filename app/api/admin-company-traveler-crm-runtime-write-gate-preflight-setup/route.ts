import {
  adminCompanyTravelerCrmRuntimeWriteGatePreflightSetupVersion,
  buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup,
  fallbackAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup,
} from "../../../lib/admin-company-traveler-crm-runtime-write-gate-preflight-setup";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function firstParam(searchParams: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function blockedResponse(error: string) {
  const setup = fallbackAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup();

  return Response.json(
    {
      error,
      ok: false,
      setup,
      status: "blocked",
      version: adminCompanyTravelerCrmRuntimeWriteGatePreflightSetupVersion,
    },
    { status: 403 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? { context: boundary.context, ok: true }
    : { ok: false, response: blockedResponse(boundary.error) };
}

function safeFailureResponse() {
  const setup = fallbackAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup();

  return Response.json(
    {
      error: "Company/traveler CRM runtime write gate preflight setup request failed safely.",
      ok: false,
      setup,
      status: "blocked",
      version: adminCompanyTravelerCrmRuntimeWriteGatePreflightSetupVersion,
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

    const searchParams = new URL(request.url).searchParams;
    const setup = buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup({
      action_type: firstParam(searchParams, "action_type", "actionType", "type"),
      booker_contact: firstParam(searchParams, "booker_contact", "bookerContact"),
      booker_email: firstParam(searchParams, "booker_email", "bookerEmail"),
      booker_name: firstParam(searchParams, "booker_name", "bookerName"),
      company_id: firstParam(searchParams, "company_id", "companyId"),
      company_name: firstParam(searchParams, "company_name", "companyName"),
      default_address: firstParam(searchParams, "default_address", "defaultAddress"),
      default_dropoff_address: firstParam(
        searchParams,
        "default_dropoff_address",
        "defaultDropoffAddress",
      ),
      default_pickup_address: firstParam(
        searchParams,
        "default_pickup_address",
        "defaultPickupAddress",
      ),
      domain: firstParam(searchParams, "domain"),
      id: firstParam(searchParams, "id"),
      preferred_vehicle: firstParam(searchParams, "preferred_vehicle", "preferredVehicle"),
      traveler_id: firstParam(searchParams, "traveler_id", "travelerId"),
      traveler_name: firstParam(searchParams, "traveler_name", "travelerName"),
    });

    return Response.json({
      ok: true,
      setup,
      status: setup.status,
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
