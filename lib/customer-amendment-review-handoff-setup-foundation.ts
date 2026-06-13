import "server-only";

export const customerAmendmentReviewHandoffSetupFoundationVersion =
  "customer-amendment-review-handoff-setup-foundation-v1";

export const customerAmendmentReviewChangeTypes = [
  "date_change",
  "time_change",
  "location_change",
  "cancellation_request",
] as const;

export type CustomerAmendmentReviewChangeType =
  (typeof customerAmendmentReviewChangeTypes)[number];

export type CustomerAmendmentReviewCalendarActionPreview = "cancel" | "none" | "update";

export type CustomerAmendmentReviewMissingRequirement =
  | "change_type"
  | "original_booking_ref"
  | "requested_cancellation_reason"
  | "requested_date"
  | "requested_location"
  | "requested_time";

export type CustomerAmendmentReviewRequestedFields = {
  cancellation_reason: string | null;
  date: string | null;
  dropoff_address: string | null;
  location: string | null;
  pickup_address: string | null;
  time: string | null;
};

export type CustomerAmendmentReviewHandoffSetupInput = {
  changeType?: unknown;
  change_type?: unknown;
  dropoff_address?: unknown;
  location?: unknown;
  originalBookingRef?: unknown;
  original_booking_ref?: unknown;
  pickup_address?: unknown;
  requestedFields?: unknown;
  requested_cancellation_reason?: unknown;
  requested_date?: unknown;
  requested_fields?: unknown;
  requested_time?: unknown;
};

export type CustomerAmendmentReviewHandoffSetupResult = {
  adminReviewRequired: true;
  bookingUpdateEnabled: false;
  booking_update_enabled: false;
  calendarActionPreview: CustomerAmendmentReviewCalendarActionPreview;
  calendarUpdateEnabled: false;
  calendar_action_preview: CustomerAmendmentReviewCalendarActionPreview;
  calendar_update_enabled: false;
  changeType: CustomerAmendmentReviewChangeType | null;
  change_type: CustomerAmendmentReviewChangeType | null;
  delivery_surface: "customer_amendment_review_handoff_setup_only";
  external_send: false;
  jobCardDraftReady: boolean;
  job_card_draft_preview: {
    action_label: string | null;
    draftCreated: false;
    draft_created: false;
    summary_lines: string[];
  };
  job_card_draft_ready: boolean;
  liveWriteEnabled: false;
  live_write_enabled: false;
  missing_requirements: CustomerAmendmentReviewMissingRequirement[];
  originalBookingRef: string | null;
  original_booking_ref: string | null;
  requestedFields: CustomerAmendmentReviewRequestedFields;
  requested_fields: CustomerAmendmentReviewRequestedFields;
  review_status: "blocked_for_admin_review" | "ready_for_admin_review";
  status: "setup_only";
  version: typeof customerAmendmentReviewHandoffSetupFoundationVersion;
};

const maxTextLength = 180;
const blockedFragments = [
  "admin_finance",
  "amount_due",
  "auth_link",
  "billing",
  "card_number",
  "customer_price",
  "debug",
  "driver_payout",
  "fare_amount",
  "finance",
  "internal_admin",
  "internal_admin_note",
  "internal_finance",
  "internal_note",
  "invoice",
  "mock_archive",
  "mock_qa",
  "parser",
  "password",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pricing",
  "private_key",
  "raw_parser",
  "secret",
  "server_secret",
  "service_role",
  "smtp",
  "stripe",
  "token",
];

function normalizedText(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function safeText(value: unknown, maxLength = maxTextLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength) {
    return null;
  }

  return blockedFragments.some((fragment) => normalizedText(cleaned).includes(fragment)) ? null : cleaned;
}

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeChangeType(value: unknown): CustomerAmendmentReviewChangeType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

  if (!normalized) {
    return null;
  }

  if (normalized.includes("cancel")) {
    return "cancellation_request";
  }

  if (normalized.includes("date")) {
    return "date_change";
  }

  if (normalized.includes("time")) {
    return "time_change";
  }

  if (
    normalized.includes("drop_off") ||
    normalized.includes("dropoff") ||
    normalized.includes("location") ||
    normalized.includes("pickup") ||
    normalized.includes("route")
  ) {
    return "location_change";
  }

  return customerAmendmentReviewChangeTypes.includes(normalized as CustomerAmendmentReviewChangeType)
    ? (normalized as CustomerAmendmentReviewChangeType)
    : null;
}

function buildRequestedFields(input: CustomerAmendmentReviewHandoffSetupInput) {
  const requestedFields = safeRecord(firstValue(input.requestedFields, input.requested_fields));

  return {
    cancellation_reason: safeText(
      firstValue(
        requestedFields.cancellation_reason,
        requestedFields.cancellationReason,
        requestedFields.reason,
        input.requested_cancellation_reason,
      ),
    ),
    date: safeText(firstValue(requestedFields.date, requestedFields.requested_date, input.requested_date), 80),
    dropoff_address: safeText(
      firstValue(
        requestedFields.dropoff_address,
        requestedFields.dropoffAddress,
        requestedFields.drop_off,
        requestedFields.dropoff,
        input.dropoff_address,
      ),
    ),
    location: safeText(firstValue(requestedFields.location, requestedFields.address, input.location)),
    pickup_address: safeText(
      firstValue(
        requestedFields.pickup_address,
        requestedFields.pickupAddress,
        requestedFields.pick_up,
        requestedFields.pickup,
        input.pickup_address,
      ),
    ),
    time: safeText(firstValue(requestedFields.time, requestedFields.requested_time, input.requested_time), 80),
  };
}

function requestedFieldsReady(
  changeType: CustomerAmendmentReviewChangeType | null,
  requestedFields: CustomerAmendmentReviewRequestedFields,
) {
  if (changeType === "date_change") {
    return Boolean(requestedFields.date);
  }

  if (changeType === "time_change") {
    return Boolean(requestedFields.time);
  }

  if (changeType === "location_change") {
    return Boolean(
      requestedFields.dropoff_address || requestedFields.location || requestedFields.pickup_address,
    );
  }

  if (changeType === "cancellation_request") {
    return Boolean(requestedFields.cancellation_reason);
  }

  return false;
}

function missingRequirements(
  originalBookingRef: string | null,
  changeType: CustomerAmendmentReviewChangeType | null,
  requestedFields: CustomerAmendmentReviewRequestedFields,
) {
  const missing: CustomerAmendmentReviewMissingRequirement[] = [];

  if (!originalBookingRef) {
    missing.push("original_booking_ref");
  }

  if (!changeType) {
    missing.push("change_type");
    return missing;
  }

  if (changeType === "date_change" && !requestedFields.date) {
    missing.push("requested_date");
  }

  if (changeType === "time_change" && !requestedFields.time) {
    missing.push("requested_time");
  }

  if (
    changeType === "location_change" &&
    !requestedFields.dropoff_address &&
    !requestedFields.location &&
    !requestedFields.pickup_address
  ) {
    missing.push("requested_location");
  }

  if (changeType === "cancellation_request" && !requestedFields.cancellation_reason) {
    missing.push("requested_cancellation_reason");
  }

  return missing;
}

function calendarActionPreview(
  originalBookingRef: string | null,
  changeType: CustomerAmendmentReviewChangeType | null,
  requestedFields: CustomerAmendmentReviewRequestedFields,
): CustomerAmendmentReviewCalendarActionPreview {
  if (!originalBookingRef || !requestedFieldsReady(changeType, requestedFields)) {
    return "none";
  }

  return changeType === "cancellation_request" ? "cancel" : "update";
}

function jobCardDraftSummary(
  originalBookingRef: string | null,
  changeType: CustomerAmendmentReviewChangeType | null,
  requestedFields: CustomerAmendmentReviewRequestedFields,
) {
  return [
    originalBookingRef ? `Original booking: ${originalBookingRef}` : null,
    changeType ? `Customer request: ${changeType.replace(/_/g, " ")}` : null,
    requestedFields.date ? `Requested date: ${requestedFields.date}` : null,
    requestedFields.time ? `Requested time: ${requestedFields.time}` : null,
    requestedFields.pickup_address ? `Requested pickup: ${requestedFields.pickup_address}` : null,
    requestedFields.dropoff_address ? `Requested drop-off: ${requestedFields.dropoff_address}` : null,
    requestedFields.location ? `Requested location: ${requestedFields.location}` : null,
    requestedFields.cancellation_reason ? `Cancellation reason: ${requestedFields.cancellation_reason}` : null,
  ].filter((line): line is string => Boolean(line));
}

function actionLabel(
  changeType: CustomerAmendmentReviewChangeType | null,
  preview: CustomerAmendmentReviewCalendarActionPreview,
) {
  if (changeType === "cancellation_request" && preview === "cancel") {
    return "Review cancellation request";
  }

  if (preview === "update") {
    return "Review booking amendment";
  }

  return null;
}

export function buildCustomerAmendmentReviewHandoffSetup(
  input: CustomerAmendmentReviewHandoffSetupInput,
): CustomerAmendmentReviewHandoffSetupResult {
  const originalBookingRef = safeText(
    firstValue(input.originalBookingRef, input.original_booking_ref),
    120,
  );
  const changeType = normalizeChangeType(firstValue(input.changeType, input.change_type));
  const requestedFields = buildRequestedFields(input);
  const missing = missingRequirements(originalBookingRef, changeType, requestedFields);
  const jobCardDraftReady = missing.length === 0;
  const calendarAction = calendarActionPreview(originalBookingRef, changeType, requestedFields);

  return {
    adminReviewRequired: true,
    bookingUpdateEnabled: false,
    booking_update_enabled: false,
    calendarActionPreview: calendarAction,
    calendarUpdateEnabled: false,
    calendar_action_preview: calendarAction,
    calendar_update_enabled: false,
    changeType,
    change_type: changeType,
    delivery_surface: "customer_amendment_review_handoff_setup_only",
    external_send: false,
    jobCardDraftReady,
    job_card_draft_preview: {
      action_label: actionLabel(changeType, calendarAction),
      draftCreated: false,
      draft_created: false,
      summary_lines: jobCardDraftSummary(originalBookingRef, changeType, requestedFields),
    },
    job_card_draft_ready: jobCardDraftReady,
    liveWriteEnabled: false,
    live_write_enabled: false,
    missing_requirements: missing,
    originalBookingRef,
    original_booking_ref: originalBookingRef,
    requestedFields,
    requested_fields: requestedFields,
    review_status: jobCardDraftReady ? "ready_for_admin_review" : "blocked_for_admin_review",
    status: "setup_only",
    version: customerAmendmentReviewHandoffSetupFoundationVersion,
  };
}
