import {
  adminRateSettingsWriteActionDisabledSetupVersion,
  buildAdminRateSettingsWriteActionDisabledSetup,
  fallbackAdminRateSettingsWriteActionDisabledSetup,
} from "../../../lib/admin-rate-settings-write-action-disabled-setup";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function disabledActionFields() {
  return {
    actionEnabled: false,
    action_enabled: false,
    adminReviewRequired: true,
    admin_review_required: true,
    external_send: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
    no_op: true,
    writeEnabled: false,
    write_enabled: false,
  } as const;
}

function requestInput(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

function blockedResponse(error: string) {
  const result = fallbackAdminRateSettingsWriteActionDisabledSetup();

  return Response.json(
    {
      ...disabledActionFields(),
      delivery_surface: result.delivery_surface,
      error,
      ok: false,
      reason: "setup_only_disabled",
      result,
      status: "blocked",
      version: adminRateSettingsWriteActionDisabledSetupVersion,
    },
    { status: 403 },
  );
}

function safeFailureResponse() {
  const result = fallbackAdminRateSettingsWriteActionDisabledSetup();

  return Response.json(
    {
      ...disabledActionFields(),
      delivery_surface: result.delivery_surface,
      error: "Rate settings write action disabled setup request failed safely.",
      ok: false,
      reason: "setup_only_disabled",
      result,
      status: "blocked",
      version: adminRateSettingsWriteActionDisabledSetupVersion,
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

    const result = buildAdminRateSettingsWriteActionDisabledSetup(requestInput(request));

    return Response.json(
      {
        ...disabledActionFields(),
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
