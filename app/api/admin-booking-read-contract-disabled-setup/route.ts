import {
  adminBookingReadContractDisabledSetupVersion,
  buildAdminBookingReadContractDisabledSetup,
  fallbackAdminBookingReadContractDisabledSetup,
} from "../../../lib/admin-booking-read-contract-disabled-setup";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function disabledReadFields() {
  return {
    dbReadEnabled: false,
    db_read_enabled: false,
    detailReadEnabled: false,
    detail_read_enabled: false,
    external_send: false,
    listReadEnabled: false,
    list_read_enabled: false,
    liveReadEnabled: false,
    live_read_enabled: false,
    no_live_read: true,
    no_op: true,
    readEnabled: false,
    read_enabled: false,
    writeEnabled: false,
    write_enabled: false,
  } as const;
}

function requestInput(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

function blockedResponse(error: string) {
  const result = fallbackAdminBookingReadContractDisabledSetup();

  return Response.json(
    {
      ...disabledReadFields(),
      delivery_surface: result.delivery_surface,
      error,
      ok: false,
      reason: "setup_only_disabled",
      result,
      status: "blocked",
      version: adminBookingReadContractDisabledSetupVersion,
    },
    { status: 403 },
  );
}

function safeFailureResponse() {
  const result = fallbackAdminBookingReadContractDisabledSetup();

  return Response.json(
    {
      ...disabledReadFields(),
      delivery_surface: result.delivery_surface,
      error: "Admin booking read contract disabled setup request failed safely.",
      ok: false,
      reason: "setup_only_disabled",
      result,
      status: "blocked",
      version: adminBookingReadContractDisabledSetupVersion,
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

    const result = buildAdminBookingReadContractDisabledSetup(requestInput(request));

    return Response.json(
      {
        ...disabledReadFields(),
        delivery_surface: result.delivery_surface,
        ok: result.ok,
        reason: result.reason,
        result,
        status: result.status,
        version: result.version,
      },
      { status: result.ok ? 200 : 400 },
    );
  } catch {
    return safeFailureResponse();
  }
}
