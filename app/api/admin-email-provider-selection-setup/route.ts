import { buildAdminEmailProviderSelectionSetup } from "../../../lib/admin-email-provider-selection-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function fallbackSelection() {
  return buildAdminEmailProviderSelectionSetup();
}

function blockedResponse(error: string) {
  const selection = fallbackSelection();

  return Response.json(
    {
      error,
      external_send: selection.external_send,
      liveSendingEnabled: selection.liveSendingEnabled,
      missing_requirements: selection.missing_requirements,
      ok: false,
      providerConfigured: selection.providerConfigured,
      providerSelected: selection.providerSelected,
      selectedProvider: selection.selectedProvider,
      sendingEnabled: selection.sendingEnabled,
      status: "blocked",
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
  const selection = fallbackSelection();

  return Response.json(
    {
      error: "Email provider selection setup request failed safely.",
      external_send: selection.external_send,
      liveSendingEnabled: selection.liveSendingEnabled,
      missing_requirements: selection.missing_requirements,
      ok: false,
      providerConfigured: selection.providerConfigured,
      providerSelected: selection.providerSelected,
      selectedProvider: selection.selectedProvider,
      sendingEnabled: selection.sendingEnabled,
      status: "blocked",
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
    const selection = buildAdminEmailProviderSelectionSetup({
      selectedProvider:
        searchParams.get("selected_provider") || searchParams.get("selectedProvider"),
    });

    return Response.json({
      external_send: selection.external_send,
      liveSendingEnabled: selection.liveSendingEnabled,
      missing_requirements: selection.missing_requirements,
      ok: true,
      providerConfigured: selection.providerConfigured,
      providerOptions: selection.providerOptions,
      providerSelected: selection.providerSelected,
      selectedProvider: selection.selectedProvider,
      selectedProviderStatus: selection.selectedProviderStatus,
      selection,
      sendingEnabled: selection.sendingEnabled,
      status: selection.status,
      version: selection.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
