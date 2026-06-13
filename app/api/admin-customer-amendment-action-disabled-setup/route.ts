import {
  buildCustomerAmendmentReviewHandoffSetup,
  customerAmendmentReviewHandoffSetupFoundationVersion,
  type CustomerAmendmentReviewHandoffSetupResult,
} from "../../../lib/customer-amendment-review-handoff-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type CustomerAmendmentReviewHandoffSetup = CustomerAmendmentReviewHandoffSetupResult;
type CustomerAmendmentDisabledAction =
  | "approve_amendment"
  | "approve_cancellation"
  | "reject_request";

const previewReadinessSetupApi = "admin-customer-amendment-review-preview-setup" as const;

function fallbackHandoff() {
  return buildCustomerAmendmentReviewHandoffSetup({});
}

function disabledCustomerAmendmentActionFields() {
  return {
    adminReviewRequired: true,
    bookingUpdateEnabled: false,
    booking_update_enabled: false,
    calendarCancelEnabled: false,
    calendar_cancel_enabled: false,
    calendarUpdateEnabled: false,
    calendar_update_enabled: false,
    crmUpdateEnabled: false,
    crm_update_enabled: false,
    customerNotificationEnabled: false,
    customer_notification_enabled: false,
    driverNotificationEnabled: false,
    driver_notification_enabled: false,
    external_send: false,
    jobCardCreateEnabled: false,
    job_card_create_enabled: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
  };
}

function previewFor(handoff: CustomerAmendmentReviewHandoffSetup) {
  return {
    ...disabledCustomerAmendmentActionFields(),
    calendarActionPreview: handoff.calendarActionPreview,
    calendar_action_preview: handoff.calendar_action_preview,
    changeType: handoff.changeType,
    change_type: handoff.change_type,
    jobCardDraftReady: handoff.jobCardDraftReady,
    job_card_draft_ready: handoff.job_card_draft_ready,
    missing_requirements: handoff.missing_requirements,
    originalBookingRef: handoff.originalBookingRef,
    original_booking_ref: handoff.original_booking_ref,
    requestedFields: handoff.requestedFields,
    requested_fields: handoff.requested_fields,
    review_status: handoff.review_status,
    status: handoff.status,
  };
}

function normalizeDisabledAction(value: unknown): CustomerAmendmentDisabledAction | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

  if (!normalized) {
    return null;
  }

  if (normalized.includes("reject")) {
    return "reject_request";
  }

  if (normalized.includes("cancel")) {
    return "approve_cancellation";
  }

  if (
    normalized.includes("amend") ||
    normalized.includes("approve") ||
    normalized.includes("date") ||
    normalized.includes("location") ||
    normalized.includes("time")
  ) {
    return "approve_amendment";
  }

  return null;
}

function disabledActionFor(
  handoff: CustomerAmendmentReviewHandoffSetup,
  actionType: CustomerAmendmentDisabledAction | null,
) {
  return {
    ...disabledCustomerAmendmentActionFields(),
    actionType,
    action_type: actionType,
    booking_update: {
      bookingUpdateEnabled: false,
      crmUpdateEnabled: false,
      status: "blocked",
    },
    calendar_update: {
      calendarCancelEnabled: false,
      calendarUpdateEnabled: false,
      status: "blocked",
    },
    customer_notification: {
      customerNotificationEnabled: false,
      external_send: false,
      status: "blocked",
    },
    delivery_surface: "customer_amendment_action_disabled_setup_only",
    driver_notification: {
      driverNotificationEnabled: false,
      external_send: false,
      status: "blocked",
    },
    handoff_status: handoff.review_status,
    job_card: {
      jobCardCreateEnabled: false,
      status: "blocked",
    },
    no_op: true,
    preview_readiness_source: previewReadinessSetupApi,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
    version: handoff.version,
  } as const;
}

function blockedResponse(error: string) {
  const handoff = fallbackHandoff();
  const result = disabledActionFor(handoff, null);

  return Response.json(
    {
      ...disabledCustomerAmendmentActionFields(),
      delivery_surface: result.delivery_surface,
      error,
      handoff,
      ok: false,
      preview: previewFor(handoff),
      preview_readiness_source: previewReadinessSetupApi,
      reason: result.reason,
      result,
      status: "blocked",
      version: customerAmendmentReviewHandoffSetupFoundationVersion,
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
  const handoff = fallbackHandoff();
  const result = disabledActionFor(handoff, null);

  return Response.json(
    {
      ...disabledCustomerAmendmentActionFields(),
      delivery_surface: result.delivery_surface,
      error: "Customer amendment action disabled setup request failed safely.",
      handoff,
      ok: false,
      preview: previewFor(handoff),
      preview_readiness_source: previewReadinessSetupApi,
      reason: result.reason,
      result,
      status: "blocked",
      version: customerAmendmentReviewHandoffSetupFoundationVersion,
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
    const handoff = buildCustomerAmendmentReviewHandoffSetup({
      change_type: firstParam(searchParams, "change_type", "changeType", "type"),
      dropoff_address: firstParam(searchParams, "dropoff_address", "dropoffAddress", "drop_off"),
      location: firstParam(searchParams, "location", "address"),
      original_booking_ref: firstParam(
        searchParams,
        "original_booking_ref",
        "originalBookingRef",
        "booking_reference",
        "booking_ref",
      ),
      pickup_address: firstParam(searchParams, "pickup_address", "pickupAddress", "pickup"),
      requested_cancellation_reason: firstParam(
        searchParams,
        "requested_cancellation_reason",
        "cancellation_reason",
        "cancellationReason",
        "reason",
      ),
      requested_date: firstParam(searchParams, "requested_date", "date"),
      requested_time: firstParam(searchParams, "requested_time", "time"),
    });
    const actionType = normalizeDisabledAction(firstParam(searchParams, "action_type", "actionType", "action"));
    const result = disabledActionFor(handoff, actionType);

    return Response.json({
      ...disabledCustomerAmendmentActionFields(),
      actionType,
      action_type: actionType,
      delivery_surface: result.delivery_surface,
      handoff,
      ok: true,
      preview: previewFor(handoff),
      preview_readiness_source: previewReadinessSetupApi,
      reason: result.reason,
      result,
      status: "blocked",
      version: handoff.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
