import {
  adminCompanyTravelerCrmIdentityContactWriteContractSetupFoundationVersion,
  buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup,
} from "../../../lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function disabledContractFields() {
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

function requestInput(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  return Object.fromEntries(searchParams.entries());
}

function fallbackContract() {
  return buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup({});
}

function blockedResponse(error: string) {
  const contract = fallbackContract();

  return Response.json(
    {
      ...disabledContractFields(),
      contract,
      delivery_surface: contract.delivery_surface,
      error,
      ok: false,
      reason: "setup_only_no_write",
      status: "blocked",
      version: adminCompanyTravelerCrmIdentityContactWriteContractSetupFoundationVersion,
    },
    { status: 403 },
  );
}

function safeFailureResponse() {
  const contract = fallbackContract();

  return Response.json(
    {
      ...disabledContractFields(),
      contract,
      delivery_surface: contract.delivery_surface,
      error: "Company/traveler CRM identity/contact write contract setup request failed safely.",
      ok: false,
      reason: "setup_only_no_write",
      status: "blocked",
      version: adminCompanyTravelerCrmIdentityContactWriteContractSetupFoundationVersion,
    },
    { status: 500 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? { context: boundary.context, ok: true }
    : { ok: false, response: blockedResponse(boundary.error) };
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const contract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup(requestInput(request));

    return Response.json(
      {
        ...disabledContractFields(),
        contract,
        contractReady: contract.contractReady,
        contract_ready: contract.contract_ready,
        delivery_surface: contract.delivery_surface,
        ok: contract.ok,
        reason: contract.reason,
        status: contract.status,
        version: contract.version,
      },
      { status: contract.ok ? 200 : 400 },
    );
  } catch {
    return safeFailureResponse();
  }
}
