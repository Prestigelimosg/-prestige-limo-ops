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

function fallbackHandoff() {
  return buildCustomerAmendmentReviewHandoffSetup({});
}

function previewFor(handoff: CustomerAmendmentReviewHandoffSetup) {
  return {
    adminApprovalRequiredBeforeCalendarUpdate: true,
    adminApprovalRequiredBeforeCrmBookingUpdate: true,
    adminReviewRequired: handoff.adminReviewRequired,
    bookingUpdateEnabled: false,
    booking_update_enabled: false,
    calendarActionPreview: handoff.calendarActionPreview,
    calendarUpdateEnabled: false,
    calendar_action_preview: handoff.calendar_action_preview,
    calendar_update_enabled: false,
    changeType: handoff.changeType,
    change_type: handoff.change_type,
    crmBookingUpdateEnabled: false,
    crm_booking_update_enabled: false,
    external_send: false,
    jobCardDraftReady: handoff.jobCardDraftReady,
    job_card_draft_preview: handoff.job_card_draft_preview,
    job_card_draft_ready: handoff.job_card_draft_ready,
    liveWriteEnabled: false,
    live_write_enabled: false,
    missing_requirements: handoff.missing_requirements,
    originalBookingRef: handoff.originalBookingRef,
    original_booking_ref: handoff.original_booking_ref,
    requestedFields: handoff.requestedFields,
    requested_fields: handoff.requested_fields,
    review_status: handoff.review_status,
    status: handoff.status,
  };
}

function blockedResponse(error: string) {
  const handoff = fallbackHandoff();

  return Response.json(
    {
      adminApprovalRequiredBeforeCalendarUpdate: true,
      adminApprovalRequiredBeforeCrmBookingUpdate: true,
      adminReviewRequired: true,
      bookingUpdateEnabled: false,
      booking_update_enabled: false,
      calendarActionPreview: "none",
      calendarUpdateEnabled: false,
      calendar_action_preview: "none",
      calendar_update_enabled: false,
      changeType: handoff.changeType,
      change_type: handoff.change_type,
      crmBookingUpdateEnabled: false,
      crm_booking_update_enabled: false,
      error,
      external_send: false,
      handoff,
      jobCardDraftReady: false,
      job_card_draft_ready: false,
      liveWriteEnabled: false,
      live_write_enabled: false,
      ok: false,
      originalBookingRef: handoff.originalBookingRef,
      original_booking_ref: handoff.original_booking_ref,
      preview: previewFor(handoff),
      requestedFields: handoff.requestedFields,
      requested_fields: handoff.requested_fields,
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

  return Response.json(
    {
      adminApprovalRequiredBeforeCalendarUpdate: true,
      adminApprovalRequiredBeforeCrmBookingUpdate: true,
      adminReviewRequired: true,
      bookingUpdateEnabled: false,
      booking_update_enabled: false,
      calendarActionPreview: "none",
      calendarUpdateEnabled: false,
      calendar_action_preview: "none",
      calendar_update_enabled: false,
      changeType: handoff.changeType,
      change_type: handoff.change_type,
      crmBookingUpdateEnabled: false,
      crm_booking_update_enabled: false,
      error: "Customer amendment review preview setup request failed safely.",
      external_send: false,
      handoff,
      jobCardDraftReady: false,
      job_card_draft_ready: false,
      liveWriteEnabled: false,
      live_write_enabled: false,
      ok: false,
      originalBookingRef: handoff.originalBookingRef,
      original_booking_ref: handoff.original_booking_ref,
      preview: previewFor(handoff),
      requestedFields: handoff.requestedFields,
      requested_fields: handoff.requested_fields,
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

    return Response.json({
      adminApprovalRequiredBeforeCalendarUpdate: true,
      adminApprovalRequiredBeforeCrmBookingUpdate: true,
      adminReviewRequired: handoff.adminReviewRequired,
      bookingUpdateEnabled: false,
      booking_update_enabled: false,
      calendarActionPreview: handoff.calendarActionPreview,
      calendarUpdateEnabled: false,
      calendar_action_preview: handoff.calendar_action_preview,
      calendar_update_enabled: false,
      changeType: handoff.changeType,
      change_type: handoff.change_type,
      crmBookingUpdateEnabled: false,
      crm_booking_update_enabled: false,
      external_send: false,
      handoff,
      jobCardDraftReady: handoff.jobCardDraftReady,
      job_card_draft_ready: handoff.job_card_draft_ready,
      liveWriteEnabled: false,
      live_write_enabled: false,
      ok: true,
      originalBookingRef: handoff.originalBookingRef,
      original_booking_ref: handoff.original_booking_ref,
      preview: previewFor(handoff),
      requestedFields: handoff.requestedFields,
      requested_fields: handoff.requested_fields,
      status: handoff.status,
      version: handoff.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
