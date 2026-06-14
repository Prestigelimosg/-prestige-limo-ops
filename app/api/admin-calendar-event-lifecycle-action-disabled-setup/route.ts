import { buildAdminCalendarEventLifecycleReadinessSetup } from "../../../lib/admin-calendar-event-lifecycle-readiness-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type CalendarEventLifecycleReadinessSetup = ReturnType<
  typeof buildAdminCalendarEventLifecycleReadinessSetup
>;

const previewReadinessSetupApi =
  "admin-calendar-event-lifecycle-readiness-preview-setup" as const;

function fallbackReadiness() {
  return buildAdminCalendarEventLifecycleReadinessSetup({});
}

function disabledCalendarLifecycleFields() {
  return {
    adminApprovalRequired: true,
    admin_approval_required: true,
    calendarCancelEnabled: false,
    calendarCreateEnabled: false,
    calendarUpdateEnabled: false,
    calendar_cancel_enabled: false,
    calendar_create_enabled: false,
    calendar_update_enabled: false,
    customer_amendment_auto_calendar_update_allowed: false,
    external_calendar: false,
    liveCalendarSyncEnabled: false,
    live_calendar_sync_enabled: false,
  };
}

function readinessFor(setup: CalendarEventLifecycleReadinessSetup) {
  return {
    ...disabledCalendarLifecycleFields(),
    missing_requirements: setup.missing_requirements,
    policy_notes: setup.policy_notes,
    readiness_status: setup.readiness_status,
    status: "blocked",
  };
}

function previewFor(setup: CalendarEventLifecycleReadinessSetup) {
  return {
    ...disabledCalendarLifecycleFields(),
    booking_ref: setup.booking_ref,
    delivery_surface: setup.delivery_surface,
    lifecycleAction: setup.lifecycleAction,
    lifecycle_action: setup.lifecycle_action,
    planned_lifecycle: setup.planned_lifecycle,
    policy_notes: setup.policy_notes,
    status: setup.status,
    version: setup.version,
  };
}

function disabledActionFor(setup: CalendarEventLifecycleReadinessSetup) {
  return {
    ...disabledCalendarLifecycleFields(),
    action_groups: {
      cancel_existing_event_after_admin_approved_cancellation: {
        calendarCancelEnabled: false,
        status: "blocked",
      },
      create_event_for_confirmed_booking: {
        calendarCreateEnabled: false,
        status: "blocked",
      },
      update_existing_event_after_admin_approved_amendment: {
        calendarUpdateEnabled: false,
        status: "blocked",
      },
    },
    booking_ref: setup.booking_ref,
    delivery_surface: "admin_calendar_event_lifecycle_action_disabled_setup_only",
    lifecycleAction: setup.lifecycleAction,
    lifecycle_action: setup.lifecycle_action,
    no_op: true,
    preview_readiness_source: previewReadinessSetupApi,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
    version: setup.version,
  } as const;
}

function blockedResponse(error: string) {
  const setup = fallbackReadiness();
  const result = disabledActionFor(setup);

  return Response.json(
    {
      ...disabledCalendarLifecycleFields(),
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
      version: setup.version,
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
  const setup = fallbackReadiness();
  const result = disabledActionFor(setup);

  return Response.json(
    {
      ...disabledCalendarLifecycleFields(),
      delivery_surface: result.delivery_surface,
      error: "Calendar event lifecycle action disabled setup request failed safely.",
      ok: false,
      preview: previewFor(setup),
      preview_readiness_source: previewReadinessSetupApi,
      readiness: readinessFor(setup),
      reason: result.reason,
      result,
      setup,
      status: "blocked",
      version: setup.version,
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
    const setup = buildAdminCalendarEventLifecycleReadinessSetup({
      booking_ref: firstParam(searchParams, "booking_ref", "bookingRef", "booking_reference"),
      lifecycle_action: firstParam(
        searchParams,
        "lifecycle_action",
        "lifecycleAction",
        "action_type",
        "actionType",
        "action",
      ),
    });
    const result = disabledActionFor(setup);

    return Response.json({
      ...disabledCalendarLifecycleFields(),
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
