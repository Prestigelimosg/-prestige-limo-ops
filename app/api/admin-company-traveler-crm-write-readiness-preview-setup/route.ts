import {
  buildAdminCompanyTravelerCrmWriteReadinessSetup,
  adminCompanyTravelerCrmWriteReadinessSetupFoundationVersion,
  type AdminCompanyTravelerCrmWriteReadinessSetupResult,
} from "../../../lib/admin-company-traveler-crm-write-readiness-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type CompanyTravelerCrmWriteReadinessSetup = AdminCompanyTravelerCrmWriteReadinessSetupResult;

function fallbackSetup() {
  return buildAdminCompanyTravelerCrmWriteReadinessSetup({});
}

function disabledCrmWriteFields() {
  return {
    actionEnabled: false,
    action_enabled: false,
    adminReviewRequired: true,
    admin_review_required: true,
    external_send: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
    writeEnabled: false,
    write_enabled: false,
  };
}

function readinessFor(setup: CompanyTravelerCrmWriteReadinessSetup) {
  return {
    ...disabledCrmWriteFields(),
    delivery_surface: setup.delivery_surface,
    missing_requirements: setup.missing_requirements,
    readiness_status: setup.readiness_status,
    status: setup.status,
  };
}

function previewFor(setup: CompanyTravelerCrmWriteReadinessSetup) {
  return {
    ...disabledCrmWriteFields(),
    actionLabel: setup.actionLabel,
    actionScope: setup.actionScope,
    actionType: setup.actionType,
    action_label: setup.action_label,
    action_scope: setup.action_scope,
    action_type: setup.action_type,
    company_fields: setup.company_fields,
    delivery_surface: setup.delivery_surface,
    planned_actions: setup.planned_actions,
    readiness_status: setup.readiness_status,
    status: setup.status,
    traveler_fields: setup.traveler_fields,
    version: setup.version,
  };
}

function blockedResponse(error: string) {
  const setup = fallbackSetup();

  return Response.json(
    {
      ...disabledCrmWriteFields(),
      error,
      ok: false,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
      setup,
      status: "blocked",
      version: adminCompanyTravelerCrmWriteReadinessSetupFoundationVersion,
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
  const setup = fallbackSetup();

  return Response.json(
    {
      ...disabledCrmWriteFields(),
      error: "Company/traveler CRM write-readiness preview setup request failed safely.",
      ok: false,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
      setup,
      status: "blocked",
      version: adminCompanyTravelerCrmWriteReadinessSetupFoundationVersion,
    },
    { status: 500 },
  );
}

function firstParam(searchParams: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const searchParams = new URL(request.url).searchParams;
    const setup = buildAdminCompanyTravelerCrmWriteReadinessSetup({
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
      ...disabledCrmWriteFields(),
      ok: true,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
      setup,
      status: setup.status,
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
