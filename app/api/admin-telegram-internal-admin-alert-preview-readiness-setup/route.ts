import {
  adminTelegramInternalAdminAlertEventTypes,
  buildAdminTelegramInternalAdminAlertSetup,
} from "../../../lib/admin-telegram-internal-admin-alert-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function fallbackAlert() {
  return buildAdminTelegramInternalAdminAlertSetup({});
}

function readinessFor(alert: ReturnType<typeof buildAdminTelegramInternalAdminAlertSetup>) {
  return {
    alertReadyForFutureSetup: alert.missing_requirements.length === 0,
    channel: alert.channel,
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: alert.missing_requirements,
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
  };
}

function blockedResponse(error: string) {
  const alert = fallbackAlert();

  return Response.json(
    {
      alert,
      channel: alert.channel,
      error,
      eventTypes: adminTelegramInternalAdminAlertEventTypes,
      external_send: false,
      liveSendingEnabled: false,
      ok: false,
      preview: alert.alert_payload,
      providerConfigured: false,
      readiness: readinessFor(alert),
      sendingEnabled: false,
      status: "blocked",
      version: alert.version,
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
  const alert = fallbackAlert();

  return Response.json(
    {
      alert,
      channel: alert.channel,
      error: "Telegram internal admin alert preview readiness setup request failed safely.",
      eventTypes: adminTelegramInternalAdminAlertEventTypes,
      external_send: false,
      liveSendingEnabled: false,
      ok: false,
      preview: alert.alert_payload,
      providerConfigured: false,
      readiness: readinessFor(alert),
      sendingEnabled: false,
      status: "blocked",
      version: alert.version,
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
    const alert = buildAdminTelegramInternalAdminAlertSetup({
      action_source: searchParams.get("action_source") || searchParams.get("actionSource"),
      booking_reference:
        searchParams.get("booking_reference") || searchParams.get("bookingReference"),
      event_type: searchParams.get("event_type") || searchParams.get("eventType"),
      safe_message: searchParams.get("safe_message") || searchParams.get("safeMessage"),
      safe_title: searchParams.get("safe_title") || searchParams.get("safeTitle"),
    });

    return Response.json({
      alert,
      channel: alert.channel,
      event_type: alert.event_type,
      eventTypes: adminTelegramInternalAdminAlertEventTypes,
      external_send: false,
      liveSendingEnabled: false,
      ok: true,
      preview: alert.alert_payload,
      providerConfigured: false,
      readiness: readinessFor(alert),
      sendingEnabled: false,
      status: alert.status,
      version: alert.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
