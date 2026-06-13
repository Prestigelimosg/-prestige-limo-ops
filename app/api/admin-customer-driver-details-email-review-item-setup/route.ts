import {
  buildDriverAckCustomerMessageHandoffSetup,
  driverAckCustomerMessageHandoffSetupFoundationVersion,
} from "../../../lib/driver-ack-customer-message-handoff-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

function blockedResponse(error: string) {
  return Response.json(
    {
      adminReviewRequired: true,
      customerEmailReady: false,
      error,
      external_send: false,
      ok: false,
      reviewItem: {
        actionLabel: "Review email to customer",
        adminReviewRequired: true,
        customerEmailReady: false,
        external_send: false,
        item_key: "customer_driver_details_email",
        label: "Customer driver details ready",
        sendingEnabled: false,
        status: "blocked",
      },
      sendingEnabled: false,
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
  return Response.json(
    {
      adminReviewRequired: true,
      customerEmailReady: false,
      error: "Customer driver details email review item setup request failed safely.",
      external_send: false,
      ok: false,
      reviewItem: {
        actionLabel: "Review email to customer",
        adminReviewRequired: true,
        customerEmailReady: false,
        external_send: false,
        item_key: "customer_driver_details_email",
        label: "Customer driver details ready",
        sendingEnabled: false,
        status: "blocked",
      },
      sendingEnabled: false,
      status: "blocked",
      version: driverAckCustomerMessageHandoffSetupFoundationVersion,
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
    const handoff = buildDriverAckCustomerMessageHandoffSetup({
      booking_reference: searchParams.get("booking_reference"),
      customer_email: searchParams.get("customer_email"),
      driver: {
        name: searchParams.get("driver_name"),
        phone: searchParams.get("driver_phone"),
      },
      driver_ack_status: searchParams.get("driver_ack_status"),
      vehicle: {
        plate: searchParams.get("vehicle_plate"),
        type: searchParams.get("vehicle_type"),
      },
    });

    return Response.json({
      adminReviewRequired: handoff.adminReviewRequired,
      customerEmailReady: handoff.customerEmailReady,
      external_send: handoff.external_send,
      ok: true,
      reviewItem: {
        actionLabel: "Review email to customer",
        adminReviewRequired: handoff.adminReviewRequired,
        customerEmailReady: handoff.customerEmailReady,
        disabled_send_status: handoff.disabled_send.status,
        external_send: handoff.external_send,
        handoff_status: handoff.handoff_status,
        item_key: "customer_driver_details_email",
        label: "Customer driver details ready",
        missing_requirements: handoff.missing_requirements,
        preview: handoff.preview,
        readiness_status: handoff.customerEmailReady ? "ready" : "blocked",
        sendingEnabled: handoff.sendingEnabled,
        status: handoff.status,
      },
      sendingEnabled: handoff.sendingEnabled,
      status: handoff.status,
      version: handoff.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
