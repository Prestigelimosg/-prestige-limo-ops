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
    status: setup.status,
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

function blockedResponse(error: string) {
  const setup = fallbackReadiness();

  return Response.json(
    {
      ...disabledCalendarLifecycleFields(),
      error,
      ok: false,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
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

  return Response.json(
    {
      ...disabledCalendarLifecycleFields(),
      error: "Calendar event lifecycle readiness preview setup request failed safely.",
      ok: false,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
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
        "action",
      ),
    });

    return Response.json({
      ...disabledCalendarLifecycleFields(),
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
