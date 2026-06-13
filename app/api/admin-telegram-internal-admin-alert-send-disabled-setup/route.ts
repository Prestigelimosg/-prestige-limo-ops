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

type TelegramInternalAdminAlert = ReturnType<typeof buildAdminTelegramInternalAdminAlertSetup>;

function fallbackAlert() {
  return buildAdminTelegramInternalAdminAlertSetup({});
}

function readinessFor(alert: TelegramInternalAdminAlert) {
  return {
    alertReadyForFutureSetup: alert.missing_requirements.length === 0,
    channel: alert.channel,
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: alert.missing_requirements,
    providerConfigured: false,
    sendingEnabled: false,
    status: "blocked",
  };
}

function disabledSendFor(alert: TelegramInternalAdminAlert) {
  return {
    action_source: alert.action_source,
    booking_reference: alert.booking_reference,
    channel: alert.channel,
    delivery_surface: alert.disabled_adapter.delivery_surface,
    disabled_adapter: alert.disabled_adapter,
    event_key: alert.disabled_adapter.event_key,
    event_type: alert.event_type,
    external_send: false,
    liveSendingEnabled: false,
    no_op: true,
    notification_type: alert.disabled_adapter.notification_type,
    preview: alert.disabled_adapter.preview,
    providerConfigured: false,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    sendingEnabled: false,
    status: "blocked",
    version: alert.disabled_adapter.version,
  } as const;
}

function blockedResponse(error: string) {
  const alert = fallbackAlert();
  const send = disabledSendFor(alert);

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
      reason: send.reason,
      result: send,
      send,
      sendingEnabled: false,
      status: "blocked",
      version: send.version,
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
  const send = disabledSendFor(alert);

  return Response.json(
    {
      alert,
      channel: alert.channel,
      error: "Telegram internal admin alert disabled send setup request failed safely.",
      eventTypes: adminTelegramInternalAdminAlertEventTypes,
      external_send: false,
      liveSendingEnabled: false,
      ok: false,
      preview: alert.alert_payload,
      providerConfigured: false,
      readiness: readinessFor(alert),
      reason: send.reason,
      result: send,
      send,
      sendingEnabled: false,
      status: "blocked",
      version: send.version,
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
    const send = disabledSendFor(alert);

    return Response.json({
      alert,
      channel: alert.channel,
      delivery_surface: send.delivery_surface,
      event_type: alert.event_type,
      eventTypes: adminTelegramInternalAdminAlertEventTypes,
      external_send: false,
      liveSendingEnabled: false,
      ok: true,
      preview: alert.alert_payload,
      providerConfigured: false,
      readiness: readinessFor(alert),
      reason: send.reason,
      result: send,
      send,
      sendingEnabled: false,
      status: "blocked",
      version: send.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
