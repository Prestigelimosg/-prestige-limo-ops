import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  type AdminSavedBookingStatusRecord,
  updateAdminSavedBookingStatus,
} from "../../../lib/admin-saved-booking-status-persistence";
import { createCustomerDriverAppNotification } from "../../../lib/customer-driver-app-notification-persistence";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["PATCH"],
  });

  if (!boundary.ok) {
    return {
      ok: false,
      response: blockedResponse(boundary.error),
    };
  }

  if (boundary.context.mode === "local-dev-admin-surface" && isProductionRuntime()) {
    return {
      ok: false,
      response: blockedResponse("Admin booking persistence is available only from the internal admin dashboard."),
    };
  }

  return {
    context: boundary.context,
    ok: true,
  };
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin saved booking status update failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

const customerVisibleTerminalStatuses = new Set(["cancelled", "completed"]);

function customerBookingStatusNotificationCopy(status: string) {
  return status === "cancelled"
    ? {
        safe_message:
          "Your Prestige Limo booking has been cancelled. Open My Bookings to review.",
        safe_title: "Booking cancelled",
      }
    : {
        safe_message:
          "Your Prestige Limo booking has been completed. Open My Bookings to review.",
        safe_title: "Booking completed",
      };
}

async function maybeQueueAdminSavedBookingStatusCustomerNotification(
  booking: AdminSavedBookingStatusRecord,
  actor: ReturnType<typeof adminDispatcherBoundaryToPersistenceAdapterActor>,
) {
  if (
    !customerVisibleTerminalStatuses.has(booking.status) ||
    !booking.booking_reference
  ) {
    return null;
  }

  const copy = customerBookingStatusNotificationCopy(booking.status);
  const result = await createCustomerDriverAppNotification(
    {
      booking_reference: booking.booking_reference,
      delivery_surface: "customer_app",
      driver_job_link_id: null,
      event_key: `${booking.booking_reference}:customer_booking_status:${booking.status}:${booking.updated_at}`,
      notification_status: "queued",
      notification_type: "booking_status",
      priority: "normal",
      safe_context: {
        customer_facing_status: booking.status,
        external_send: false,
        provider_send: false,
        source: "admin_booking_status",
      },
      safe_message: copy.safe_message,
      safe_title: copy.safe_title,
      workflow_area: "customer_booking_status_updates",
    },
    actor,
  );

  return result.ok
    ? { notification: result.data, ok: true }
    : { error: result.error, ok: false, status: result.status };
}

export async function PATCH(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await updateAdminSavedBookingStatus(await readJsonBody(request), actor);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    const customerNotification =
      await maybeQueueAdminSavedBookingStatusCustomerNotification(
        result.data.booking,
        actor,
      );

    return Response.json({
      booking: result.data.booking,
      customer_notification: customerNotification,
      ok: true,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
