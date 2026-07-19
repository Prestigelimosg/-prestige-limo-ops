import {
  createAdminBooking,
  type AdminBookingPersistenceRecord,
  type AdminBookingPersistenceUpdateInput,
  loadAdminBookingByReference,
  listAdminBookings,
  parseAdminBookingPersistencePayload,
  parseAdminBookingUpdatePayload,
  updateAdminBooking,
} from "../../../lib/admin-booking-persistence";
import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  createCustomerDriverAppNotification,
  type CustomerDriverAppNotificationSafeRecord,
} from "../../../lib/customer-driver-app-notification-persistence";

export const dynamic = "force-dynamic";

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
      ok: false,
      error,
    },
    { status: 403 },
  );
}

type AdminBookingSafeFailureDetail = {
  category?: string;
  error: string;
  operation?: string;
  status: number;
};

function safeFailurePayload(detail: AdminBookingSafeFailureDetail) {
  return {
    ok: false,
    error: detail.error,
    ...(detail.category ? { safe_error_category: detail.category } : {}),
    ...(detail.operation ? { safe_error_operation: detail.operation } : {}),
  };
}

function adminBookingFailureResponse(detail: AdminBookingSafeFailureDetail) {
  return Response.json(safeFailurePayload(detail), { status: detail.status });
}

type AdminDispatcherBoundaryCheck =
  | {
      ok: true;
      context: AdminDispatcherBoundaryContext;
    }
  | {
      ok: false;
      response: Response;
    };

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const customerFolderExactEditMethod = request.method === "GET" || request.method === "PATCH";
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    additionalSameOriginRefererPathPrefixes: customerFolderExactEditMethod ? ["/customers/"] : [],
    additionalSameOriginRefererPathnames: customerFolderExactEditMethod ? ["/customers"] : [],
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST", "PATCH"],
  });

  return boundary.ok
    ? {
        ok: true,
        context: boundary.context,
      }
    : {
        ok: false,
        response: blockedResponse(boundary.error),
      };
}

function safeFailureResponse(operation: string) {
  return adminBookingFailureResponse({
    category: "unexpected_admin_booking_route_failure",
    error: "Admin booking persistence request failed safely.",
    operation,
    status: 500,
  });
}

type CustomerRequestDecisionNotificationResult =
  | {
      notification: CustomerDriverAppNotificationSafeRecord;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: number;
    };

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function adminBookingListLimitFromRequest(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("limit");

    if (!value) {
      return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function adminBookingReferenceFromRequest(request: Request) {
  try {
    return clean(new URL(request.url).searchParams.get("booking_reference"));
  } catch {
    return "";
  }
}

function normalizedToken(value: unknown) {
  return clean(value).replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function customerRequestDecisionNotificationCopy(requestReviewStatus: string) {
  if (requestReviewStatus === "approved") {
    return {
      priority: "normal" as const,
      safe_message: "Your booking request has been confirmed by Prestige Limo.",
      safe_title: "Booking request confirmed",
    };
  }

  if (requestReviewStatus === "declined") {
    return {
      priority: "normal" as const,
      safe_message:
        "Your booking request could not be confirmed. Prestige Limo can help review another option.",
      safe_title: "Booking request update",
    };
  }

  return {
    priority: "high" as const,
    safe_message:
      "Your booking request is still under review. Prestige Limo may contact you for more details.",
    safe_title: "Booking request needs review",
  };
}

async function maybeQueueCustomerRequestDecisionNotification(
  input: AdminBookingPersistenceUpdateInput,
  actor: ReturnType<typeof adminDispatcherBoundaryToPersistenceAdapterActor>,
  previousBooking: AdminBookingPersistenceRecord,
): Promise<CustomerRequestDecisionNotificationResult | null> {
  const bookingReference = clean(input.booking.booking_reference);
  const sourceChannel = normalizedToken(input.booking.source_channel);
  const requestReviewStatus = normalizedToken(input.booking.request_review_status);
  const previousRequestReviewStatus = normalizedToken(previousBooking.request_review_status);
  const customerFacingStatus = normalizedToken(input.booking.customer_facing_status);

  if (
    sourceChannel !== "customer_booking_request" ||
    !bookingReference ||
    requestReviewStatus === previousRequestReviewStatus ||
    !["approved", "declined", "needs_review"].includes(requestReviewStatus)
  ) {
    return null;
  }

  const copy = customerRequestDecisionNotificationCopy(requestReviewStatus);
  const result = await createCustomerDriverAppNotification(
    {
      booking_reference: bookingReference,
      delivery_surface: "customer_app",
      driver_job_link_id: null,
      event_key: `${bookingReference}:customer_request_review:${requestReviewStatus}`,
      notification_status: "queued",
      notification_type: "booking_status",
      priority: copy.priority,
      safe_context: {
        customer_facing_status: customerFacingStatus || "pending_review",
        request_review_status: requestReviewStatus,
        source: "customer_request_review",
      },
      safe_message: copy.safe_message,
      safe_title: copy.safe_title,
      workflow_area: "customer_request_review",
    },
    actor,
  );

  return result.ok
    ? {
        notification: result.data,
        ok: true,
      }
    : {
        error: result.error,
        ok: false,
        status: result.status,
      };
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const bookingReference = adminBookingReferenceFromRequest(request);

    if (bookingReference) {
      const result = await loadAdminBookingByReference(actor, bookingReference);

      if (!result.ok) {
        return adminBookingFailureResponse(result);
      }

      return Response.json({
        booking: result.data,
        ok: true,
      });
    }

    const result = await listAdminBookings(actor, {
      limit: adminBookingListLimitFromRequest(request),
    });

    if (!result.ok) {
      return adminBookingFailureResponse(result);
    }

    return Response.json({
      ok: true,
      bookings: result.data,
    });
  } catch {
    return safeFailureResponse("load_request");
  }
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const parsed = parseAdminBookingPersistencePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          ok: false,
          error: parsed.error,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await createAdminBooking(parsed.data, actor, {
      action: "admin_booking_create",
      source_route: "/api/admin-bookings",
      actor_label: boundary.context.actorLabel,
      change_summary: "Safe operational booking fields saved through the admin-only API contract.",
    });

    if (!result.ok) {
      return adminBookingFailureResponse(result);
    }

    return Response.json({
      ok: true,
      booking: result.data,
    });
  } catch {
    return safeFailureResponse("save_request");
  }
}

export async function PATCH(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const parsed = parseAdminBookingUpdatePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          ok: false,
          error: parsed.error,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const previousBooking = await loadAdminBookingByReference(
      actor,
      parsed.data.target_booking_reference,
    );

    if (!previousBooking.ok) {
      return adminBookingFailureResponse(previousBooking);
    }

    const result = await updateAdminBooking(parsed.data, actor, {
      action: "admin_booking_update",
      source_route: "/api/admin-bookings",
      actor_label: boundary.context.actorLabel,
      change_summary: "Safe operational booking fields updated through the admin-only API contract.",
    });

    if (!result.ok) {
      return adminBookingFailureResponse(result);
    }

    const customerNotification = await maybeQueueCustomerRequestDecisionNotification(
      parsed.data,
      actor,
      previousBooking.data,
    );

    return Response.json({
      ok: true,
      booking: result.data,
      customer_notification: customerNotification,
    });
  } catch {
    return safeFailureResponse("update_request");
  }
}
