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

const previewReadinessSetupApi = "admin-company-traveler-crm-write-readiness-preview-setup" as const;

function fallbackSetup() {
  return buildAdminCompanyTravelerCrmWriteReadinessSetup({});
}

function disabledCrmWriteActionFields() {
  return {
    actionEnabled: false,
    action_enabled: false,
    adminReviewRequired: true,
    admin_review_required: true,
    companyCreateEnabled: false,
    companyUpdateEnabled: false,
    company_create_enabled: false,
    company_update_enabled: false,
    external_send: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
    nameMemoryWriteEnabled: false,
    name_memory_write_enabled: false,
    travelerCreateEnabled: false,
    travelerUpdateEnabled: false,
    traveler_create_enabled: false,
    traveler_update_enabled: false,
    writeEnabled: false,
    write_enabled: false,
  };
}

function readinessFor(setup: CompanyTravelerCrmWriteReadinessSetup) {
  return {
    ...disabledCrmWriteActionFields(),
    delivery_surface: "company_traveler_crm_write_action_disabled_setup_only",
    missing_requirements: setup.missing_requirements,
    preview_readiness_source: previewReadinessSetupApi,
    readiness_status: setup.readiness_status,
    status: "blocked",
  };
}

function previewFor(setup: CompanyTravelerCrmWriteReadinessSetup) {
  return {
    ...disabledCrmWriteActionFields(),
    actionLabel: setup.actionLabel,
    actionScope: setup.actionScope,
    actionType: setup.actionType,
    action_label: setup.action_label,
    action_scope: setup.action_scope,
    action_type: setup.action_type,
    company_fields: setup.company_fields,
    delivery_surface: "company_traveler_crm_write_action_disabled_setup_only",
    planned_actions: setup.planned_actions,
    preview_readiness_source: previewReadinessSetupApi,
    readiness_status: setup.readiness_status,
    status: "blocked",
    traveler_fields: setup.traveler_fields,
    version: setup.version,
  };
}

function disabledActionFor(setup: CompanyTravelerCrmWriteReadinessSetup) {
  return {
    ...disabledCrmWriteActionFields(),
    actionLabel: setup.actionLabel,
    actionScope: setup.actionScope,
    actionType: setup.actionType,
    action_label: setup.action_label,
    action_scope: setup.action_scope,
    action_type: setup.action_type,
    company: {
      companyCreateEnabled: false,
      companyUpdateEnabled: false,
      nameMemoryWriteEnabled: false,
      status: "blocked",
    },
    company_fields: setup.company_fields,
    delivery_surface: "company_traveler_crm_write_action_disabled_setup_only",
    no_op: true,
    preview_readiness_source: previewReadinessSetupApi,
    readiness_status: setup.readiness_status,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
    traveler: {
      nameMemoryWriteEnabled: false,
      status: "blocked",
      travelerCreateEnabled: false,
      travelerUpdateEnabled: false,
    },
    traveler_fields: setup.traveler_fields,
    version: setup.version,
  } as const;
}

function blockedResponse(error: string) {
  const setup = fallbackSetup();
  const result = disabledActionFor(setup);

  return Response.json(
    {
      ...disabledCrmWriteActionFields(),
      delivery_surface: result.delivery_surface,
      error,
      ok: false,
      preview: previewFor(setup),
      preview_readiness_source: previewReadinessSetupApi,
      readiness: readinessFor(setup),
      reason: result.reason,
      result,
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
  const result = disabledActionFor(setup);

  return Response.json(
    {
      ...disabledCrmWriteActionFields(),
      delivery_surface: result.delivery_surface,
      error: "Company/traveler CRM write action disabled setup request failed safely.",
      ok: false,
      preview: previewFor(setup),
      preview_readiness_source: previewReadinessSetupApi,
      readiness: readinessFor(setup),
      reason: result.reason,
      result,
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
      action_type: firstParam(searchParams, "action_type", "actionType", "action", "type"),
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
    const result = disabledActionFor(setup);

    return Response.json({
      ...disabledCrmWriteActionFields(),
      delivery_surface: result.delivery_surface,
      ok: true,
      preview: previewFor(setup),
      preview_readiness_source: previewReadinessSetupApi,
      readiness: readinessFor(setup),
      reason: result.reason,
      result,
      setup,
      status: "blocked",
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
