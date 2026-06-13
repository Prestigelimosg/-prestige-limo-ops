import "server-only";

import {
  buildCustomerAmendmentReviewHandoffSetup,
  type CustomerAmendmentReviewHandoffSetupInput,
  type CustomerAmendmentReviewHandoffSetupResult,
  type CustomerAmendmentReviewRequestedFields,
} from "./customer-amendment-review-handoff-setup-foundation";

export const customerAmendmentActionAuditPayloadSetupFoundationVersion =
  "customer-amendment-action-audit-payload-setup-foundation-v1";

export const customerAmendmentActionAuditActionTypes = [
  "approve_amendment",
  "approve_cancellation",
  "reject_request",
] as const;
export const customerAmendmentActionAuditActionSources = [
  "disabled_action_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type CustomerAmendmentActionAuditActionType =
  (typeof customerAmendmentActionAuditActionTypes)[number];
export type CustomerAmendmentActionAuditActionSource =
  (typeof customerAmendmentActionAuditActionSources)[number];

export type CustomerAmendmentActionAuditPayloadMissingRequirement =
  | "action_source"
  | "action_type"
  | "disabled_action_result"
  | "original_booking_ref";

export type CustomerAmendmentActionAuditPayloadSetupInput =
  CustomerAmendmentReviewHandoffSetupInput & {
    actionResult?: unknown;
    actionSource?: unknown;
    actionType?: unknown;
    action_result?: unknown;
    action_source?: unknown;
    action_type?: unknown;
    amendmentActionResult?: unknown;
    amendment_action_result?: unknown;
    booking_ref?: unknown;
    booking_reference?: unknown;
    cancellationReason?: unknown;
    cancellation_reason?: unknown;
    date?: unknown;
    disabledAction?: unknown;
    disabledActionResult?: unknown;
    disabled_action?: unknown;
    disabled_action_result?: unknown;
    drop_off?: unknown;
    dropoffAddress?: unknown;
    reason?: unknown;
    setup?: CustomerAmendmentReviewHandoffSetupResult | null;
    time?: unknown;
    pickupAddress?: unknown;
  };

export type CustomerAmendmentActionAuditBlockedNoOpResult = {
  adminReviewRequired: true;
  bookingUpdateEnabled: false;
  calendarCancelEnabled: false;
  calendarUpdateEnabled: false;
  crmUpdateEnabled: false;
  customerNotificationEnabled: false;
  driverNotificationEnabled: false;
  external_send: false;
  jobCardCreateEnabled: false;
  liveWriteEnabled: false;
  no_op: true;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  status: "blocked";
};

export type CustomerAmendmentActionAuditPayloadSetupResult = {
  actionSource: CustomerAmendmentActionAuditActionSource | null;
  actionType: CustomerAmendmentActionAuditActionType | null;
  action_source: CustomerAmendmentActionAuditActionSource | null;
  action_type: CustomerAmendmentActionAuditActionType | null;
  adminReviewRequired: true;
  auditWriteEnabled: false;
  audit_payload: {
    actionSource: CustomerAmendmentActionAuditActionSource | null;
    actionType: CustomerAmendmentActionAuditActionType | null;
    action_source: CustomerAmendmentActionAuditActionSource | null;
    action_type: CustomerAmendmentActionAuditActionType | null;
    adminReviewRequired: true;
    auditWriteEnabled: false;
    blocked_no_op_result: CustomerAmendmentActionAuditBlockedNoOpResult;
    bookingUpdateEnabled: false;
    calendarActionPreview: CustomerAmendmentReviewHandoffSetupResult["calendarActionPreview"];
    calendarCancelEnabled: false;
    calendarUpdateEnabled: false;
    calendar_action_preview: CustomerAmendmentReviewHandoffSetupResult["calendar_action_preview"];
    changeType: CustomerAmendmentReviewHandoffSetupResult["changeType"];
    change_type: CustomerAmendmentReviewHandoffSetupResult["change_type"];
    crmUpdateEnabled: false;
    customerNotificationEnabled: false;
    disabledActionStatus: "blocked" | "missing";
    disabled_action_source: "admin-customer-amendment-action-disabled-setup";
    disabled_action_status: "blocked" | "missing";
    driverNotificationEnabled: false;
    external_send: false;
    jobCardCreateEnabled: false;
    jobCardDraftReady: boolean;
    job_card_draft_ready: boolean;
    liveWriteEnabled: false;
    originalBookingRef: string | null;
    original_booking_ref: string | null;
    preview_readiness_source: "admin-customer-amendment-review-preview-setup";
    requestedFields: CustomerAmendmentReviewRequestedFields;
    requested_fields: CustomerAmendmentReviewRequestedFields;
    result: CustomerAmendmentActionAuditBlockedNoOpResult;
    review_status: CustomerAmendmentReviewHandoffSetupResult["review_status"];
  };
  audit_write_enabled: false;
  blocked_no_op_result: CustomerAmendmentActionAuditBlockedNoOpResult;
  bookingUpdateEnabled: false;
  calendarActionPreview: CustomerAmendmentReviewHandoffSetupResult["calendarActionPreview"];
  calendarCancelEnabled: false;
  calendarUpdateEnabled: false;
  calendar_action_preview: CustomerAmendmentReviewHandoffSetupResult["calendar_action_preview"];
  changeType: CustomerAmendmentReviewHandoffSetupResult["changeType"];
  change_type: CustomerAmendmentReviewHandoffSetupResult["change_type"];
  crmUpdateEnabled: false;
  customerNotificationEnabled: false;
  delivery_surface: "customer_amendment_action_audit_payload_setup_only";
  disabledActionStatus: "blocked" | "missing";
  disabled_action_status: "blocked" | "missing";
  driverNotificationEnabled: false;
  external_send: false;
  jobCardCreateEnabled: false;
  jobCardDraftReady: boolean;
  job_card_draft_ready: boolean;
  liveWriteEnabled: false;
  missing_requirements: CustomerAmendmentActionAuditPayloadMissingRequirement[];
  originalBookingRef: string | null;
  original_booking_ref: string | null;
  requestedFields: CustomerAmendmentReviewRequestedFields;
  requested_fields: CustomerAmendmentReviewRequestedFields;
  review_status: CustomerAmendmentReviewHandoffSetupResult["review_status"];
  status: "setup_only";
  version: typeof customerAmendmentActionAuditPayloadSetupFoundationVersion;
};

const disabledActionSource = "admin-customer-amendment-action-disabled-setup" as const;
const previewReadinessSource = "admin-customer-amendment-review-preview-setup" as const;

const blockedNoOpResult: CustomerAmendmentActionAuditBlockedNoOpResult = {
  adminReviewRequired: true,
  bookingUpdateEnabled: false,
  calendarCancelEnabled: false,
  calendarUpdateEnabled: false,
  crmUpdateEnabled: false,
  customerNotificationEnabled: false,
  driverNotificationEnabled: false,
  external_send: false,
  jobCardCreateEnabled: false,
  liveWriteEnabled: false,
  no_op: true,
  reason: "setup_only_disabled",
  result_label: "blocked/no-op",
  status: "blocked",
};

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function normalizeActionType(value: unknown): CustomerAmendmentActionAuditActionType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

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

  return customerAmendmentActionAuditActionTypes.includes(
    normalized as CustomerAmendmentActionAuditActionType,
  )
    ? (normalized as CustomerAmendmentActionAuditActionType)
    : null;
}

function normalizeActionSource(value: unknown): CustomerAmendmentActionAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return customerAmendmentActionAuditActionSources.includes(
    normalized as CustomerAmendmentActionAuditActionSource,
  )
    ? (normalized as CustomerAmendmentActionAuditActionSource)
    : null;
}

function setupFrom(
  input: CustomerAmendmentActionAuditPayloadSetupInput,
): CustomerAmendmentReviewHandoffSetupResult {
  return (
    input.setup ??
    buildCustomerAmendmentReviewHandoffSetup({
      ...input,
      dropoff_address: firstValue(input.dropoff_address, input.dropoffAddress, input.drop_off),
      original_booking_ref: firstValue(
        input.original_booking_ref,
        input.originalBookingRef,
        input.booking_reference,
        input.booking_ref,
      ),
      pickup_address: firstValue(input.pickup_address, input.pickupAddress),
      requested_cancellation_reason: firstValue(
        input.requested_cancellation_reason,
        input.cancellation_reason,
        input.cancellationReason,
        input.reason,
      ),
      requested_date: firstValue(input.requested_date, input.date),
      requested_time: firstValue(input.requested_time, input.time),
    })
  );
}

function disabledActionFrom(input: CustomerAmendmentActionAuditPayloadSetupInput) {
  return safeRecord(
    firstValue(
      input.disabledAction,
      input.disabled_action,
      input.disabledActionResult,
      input.disabled_action_result,
      input.amendmentActionResult,
      input.amendment_action_result,
      input.actionResult,
      input.action_result,
    ),
  );
}

function hasBlockedNoOpCustomerAmendmentActionResult(value: Record<string, unknown>) {
  return (
    value.delivery_surface === "customer_amendment_action_disabled_setup_only" &&
    value.status === "blocked" &&
    value.reason === "setup_only_disabled" &&
    value.result_label === "blocked/no-op" &&
    value.no_op === true &&
    value.adminReviewRequired === true &&
    value.bookingUpdateEnabled === false &&
    value.crmUpdateEnabled === false &&
    value.calendarUpdateEnabled === false &&
    value.calendarCancelEnabled === false &&
    value.jobCardCreateEnabled === false &&
    value.customerNotificationEnabled === false &&
    value.driverNotificationEnabled === false &&
    value.liveWriteEnabled === false &&
    value.external_send === false
  );
}

export function buildCustomerAmendmentActionAuditPayloadSetup(
  input: CustomerAmendmentActionAuditPayloadSetupInput,
): CustomerAmendmentActionAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actionType = normalizeActionType(firstValue(input.actionType, input.action_type));
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const disabledAction = disabledActionFrom(input);
  const disabledActionReady = hasBlockedNoOpCustomerAmendmentActionResult(disabledAction);
  const disabledActionStatus = disabledActionReady ? "blocked" : "missing";
  const missingRequirements: CustomerAmendmentActionAuditPayloadMissingRequirement[] = [];

  if (!setup.originalBookingRef) {
    missingRequirements.push("original_booking_ref");
  }

  if (!actionType) {
    missingRequirements.push("action_type");
  }

  if (!actionSource) {
    missingRequirements.push("action_source");
  }

  if (!disabledActionReady) {
    missingRequirements.push("disabled_action_result");
  }

  return {
    actionSource,
    actionType,
    action_source: actionSource,
    action_type: actionType,
    adminReviewRequired: true,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource,
      actionType,
      action_source: actionSource,
      action_type: actionType,
      adminReviewRequired: true,
      auditWriteEnabled: false,
      blocked_no_op_result: blockedNoOpResult,
      bookingUpdateEnabled: false,
      calendarActionPreview: setup.calendarActionPreview,
      calendarCancelEnabled: false,
      calendarUpdateEnabled: false,
      calendar_action_preview: setup.calendar_action_preview,
      changeType: setup.changeType,
      change_type: setup.change_type,
      crmUpdateEnabled: false,
      customerNotificationEnabled: false,
      disabledActionStatus,
      disabled_action_source: disabledActionSource,
      disabled_action_status: disabledActionStatus,
      driverNotificationEnabled: false,
      external_send: false,
      jobCardCreateEnabled: false,
      jobCardDraftReady: setup.jobCardDraftReady,
      job_card_draft_ready: setup.job_card_draft_ready,
      liveWriteEnabled: false,
      originalBookingRef: setup.originalBookingRef,
      original_booking_ref: setup.original_booking_ref,
      preview_readiness_source: previewReadinessSource,
      requestedFields: setup.requestedFields,
      requested_fields: setup.requested_fields,
      result: blockedNoOpResult,
      review_status: setup.review_status,
    },
    audit_write_enabled: false,
    blocked_no_op_result: blockedNoOpResult,
    bookingUpdateEnabled: false,
    calendarActionPreview: setup.calendarActionPreview,
    calendarCancelEnabled: false,
    calendarUpdateEnabled: false,
    calendar_action_preview: setup.calendar_action_preview,
    changeType: setup.changeType,
    change_type: setup.change_type,
    crmUpdateEnabled: false,
    customerNotificationEnabled: false,
    delivery_surface: "customer_amendment_action_audit_payload_setup_only",
    disabledActionStatus,
    disabled_action_status: disabledActionStatus,
    driverNotificationEnabled: false,
    external_send: false,
    jobCardCreateEnabled: false,
    jobCardDraftReady: setup.jobCardDraftReady,
    job_card_draft_ready: setup.job_card_draft_ready,
    liveWriteEnabled: false,
    missing_requirements: missingRequirements,
    originalBookingRef: setup.originalBookingRef,
    original_booking_ref: setup.original_booking_ref,
    requestedFields: setup.requestedFields,
    requested_fields: setup.requested_fields,
    review_status: setup.review_status,
    status: "setup_only",
    version: customerAmendmentActionAuditPayloadSetupFoundationVersion,
  };
}
