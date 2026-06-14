import "server-only";

import {
  buildAdminCalendarEventLifecycleReadinessSetup,
  type AdminCalendarEventLifecycleAction,
  type AdminCalendarEventLifecycleReadinessSetupInput,
  type AdminCalendarEventLifecycleReadinessSetupResult,
} from "./admin-calendar-event-lifecycle-readiness-setup-foundation";

export const adminCalendarEventLifecycleActionAuditPayloadSetupFoundationVersion =
  "admin-calendar-event-lifecycle-action-audit-payload-setup-foundation-v1";

export const adminCalendarEventLifecycleActionAuditActionSources = [
  "disabled_action_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type AdminCalendarEventLifecycleActionAuditActionSource =
  (typeof adminCalendarEventLifecycleActionAuditActionSources)[number];

export type AdminCalendarEventLifecycleActionAuditPayloadMissingRequirement =
  | "action_source"
  | "action_type"
  | "booking_ref"
  | "disabled_action_result";

export type AdminCalendarEventLifecycleActionAuditPayloadSetupInput =
  AdminCalendarEventLifecycleReadinessSetupInput & {
    action?: unknown;
    actionResult?: unknown;
    actionSource?: unknown;
    actionType?: unknown;
    action_result?: unknown;
    action_source?: unknown;
    action_type?: unknown;
    disabledAction?: unknown;
    disabledActionResult?: unknown;
    disabled_action?: unknown;
    disabled_action_result?: unknown;
    disabledCalendarAction?: unknown;
    disabledCalendarActionResult?: unknown;
    disabled_calendar_action?: unknown;
    disabled_calendar_action_result?: unknown;
    setup?: AdminCalendarEventLifecycleReadinessSetupResult | null;
  };

export type AdminCalendarEventLifecycleActionAuditBlockedNoOpResult = {
  adminApprovalRequired: true;
  admin_approval_required: true;
  calendarCancelEnabled: false;
  calendarCreateEnabled: false;
  calendarUpdateEnabled: false;
  calendar_cancel_enabled: false;
  calendar_create_enabled: false;
  calendar_update_enabled: false;
  customer_amendment_auto_calendar_update_allowed: false;
  external_calendar: false;
  liveCalendarSyncEnabled: false;
  live_calendar_sync_enabled: false;
  no_op: true;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  status: "blocked";
};

export type AdminCalendarEventLifecycleActionAuditPayloadSetupResult = {
  actionSource: AdminCalendarEventLifecycleActionAuditActionSource | null;
  actionType: AdminCalendarEventLifecycleAction | null;
  action_source: AdminCalendarEventLifecycleActionAuditActionSource | null;
  action_type: AdminCalendarEventLifecycleAction | null;
  adminApprovalRequired: true;
  admin_approval_required: true;
  auditWriteEnabled: false;
  audit_payload: {
    actionSource: AdminCalendarEventLifecycleActionAuditActionSource | null;
    actionType: AdminCalendarEventLifecycleAction | null;
    action_source: AdminCalendarEventLifecycleActionAuditActionSource | null;
    action_type: AdminCalendarEventLifecycleAction | null;
    adminApprovalRequired: true;
    admin_approval_required: true;
    auditWriteEnabled: false;
    blocked_no_op_result: AdminCalendarEventLifecycleActionAuditBlockedNoOpResult;
    bookingRef: string | null;
    booking_ref: string | null;
    calendarCancelEnabled: false;
    calendarCreateEnabled: false;
    calendarUpdateEnabled: false;
    calendar_cancel_enabled: false;
    calendar_create_enabled: false;
    calendar_update_enabled: false;
    customer_amendment_auto_calendar_update_allowed: false;
    disabled_action_source: "admin-calendar-event-lifecycle-action-disabled-setup";
    disabled_action_status: "blocked" | "missing";
    disabledActionStatus: "blocked" | "missing";
    external_calendar: false;
    liveCalendarSyncEnabled: false;
    live_calendar_sync_enabled: false;
    planned_lifecycle: AdminCalendarEventLifecycleReadinessSetupResult["planned_lifecycle"];
    policy_notes: AdminCalendarEventLifecycleReadinessSetupResult["policy_notes"];
    preview_readiness_source: "admin-calendar-event-lifecycle-readiness-preview-setup";
    readiness_status: AdminCalendarEventLifecycleReadinessSetupResult["readiness_status"];
    result: AdminCalendarEventLifecycleActionAuditBlockedNoOpResult;
  };
  audit_write_enabled: false;
  blocked_no_op_result: AdminCalendarEventLifecycleActionAuditBlockedNoOpResult;
  bookingRef: string | null;
  booking_ref: string | null;
  calendarCancelEnabled: false;
  calendarCreateEnabled: false;
  calendarUpdateEnabled: false;
  calendar_cancel_enabled: false;
  calendar_create_enabled: false;
  calendar_update_enabled: false;
  customer_amendment_auto_calendar_update_allowed: false;
  delivery_surface: "admin_calendar_event_lifecycle_action_audit_payload_setup_only";
  disabled_action_status: "blocked" | "missing";
  disabledActionStatus: "blocked" | "missing";
  external_calendar: false;
  liveCalendarSyncEnabled: false;
  live_calendar_sync_enabled: false;
  missing_requirements: AdminCalendarEventLifecycleActionAuditPayloadMissingRequirement[];
  planned_lifecycle: AdminCalendarEventLifecycleReadinessSetupResult["planned_lifecycle"];
  policy_notes: AdminCalendarEventLifecycleReadinessSetupResult["policy_notes"];
  readiness_status: AdminCalendarEventLifecycleReadinessSetupResult["readiness_status"];
  status: "setup_only";
  version: typeof adminCalendarEventLifecycleActionAuditPayloadSetupFoundationVersion;
};

const disabledActionSource =
  "admin-calendar-event-lifecycle-action-disabled-setup" as const;
const previewReadinessSource =
  "admin-calendar-event-lifecycle-readiness-preview-setup" as const;

const blockedNoOpResult: AdminCalendarEventLifecycleActionAuditBlockedNoOpResult = {
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
  no_op: true,
  reason: "setup_only_disabled",
  result_label: "blocked/no-op",
  status: "blocked",
};

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
  } as const;
}

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function normalizeActionSource(
  value: unknown,
): AdminCalendarEventLifecycleActionAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return adminCalendarEventLifecycleActionAuditActionSources.includes(
    normalized as AdminCalendarEventLifecycleActionAuditActionSource,
  )
    ? (normalized as AdminCalendarEventLifecycleActionAuditActionSource)
    : null;
}

function setupFrom(
  input: AdminCalendarEventLifecycleActionAuditPayloadSetupInput,
): AdminCalendarEventLifecycleReadinessSetupResult {
  return (
    input.setup ??
    buildAdminCalendarEventLifecycleReadinessSetup({
      ...input,
      booking_ref: firstValue(input.booking_ref, input.bookingRef),
      lifecycle_action: firstValue(
        input.lifecycle_action,
        input.lifecycleAction,
        input.action_type,
        input.actionType,
        input.action,
      ),
    })
  );
}

function actionTypeFrom(input: AdminCalendarEventLifecycleActionAuditPayloadSetupInput) {
  const actionSetup = buildAdminCalendarEventLifecycleReadinessSetup({
    lifecycle_action: firstValue(
      input.action_type,
      input.actionType,
      input.lifecycle_action,
      input.lifecycleAction,
      input.action,
    ),
  });

  return actionSetup.lifecycleAction;
}

function disabledActionFrom(
  input: AdminCalendarEventLifecycleActionAuditPayloadSetupInput,
) {
  return safeRecord(
    firstValue(
      input.disabledAction,
      input.disabled_action,
      input.disabledActionResult,
      input.disabled_action_result,
      input.disabledCalendarAction,
      input.disabled_calendar_action,
      input.disabledCalendarActionResult,
      input.disabled_calendar_action_result,
      input.actionResult,
      input.action_result,
    ),
  );
}

function hasBlockedNoOpCalendarLifecycleActionResult(value: Record<string, unknown>) {
  return (
    value.delivery_surface === "admin_calendar_event_lifecycle_action_disabled_setup_only" &&
    value.status === "blocked" &&
    value.reason === "setup_only_disabled" &&
    value.result_label === "blocked/no-op" &&
    value.no_op === true &&
    value.calendarCreateEnabled === false &&
    value.calendarUpdateEnabled === false &&
    value.calendarCancelEnabled === false &&
    value.liveCalendarSyncEnabled === false &&
    value.external_calendar === false &&
    value.adminApprovalRequired === true
  );
}

export function buildAdminCalendarEventLifecycleActionAuditPayloadSetup(
  input: AdminCalendarEventLifecycleActionAuditPayloadSetupInput,
): AdminCalendarEventLifecycleActionAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actionType = actionTypeFrom(input) ?? setup.lifecycleAction;
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const disabledAction = disabledActionFrom(input);
  const disabledActionReady = hasBlockedNoOpCalendarLifecycleActionResult(disabledAction);
  const disabledActionStatus = disabledActionReady ? "blocked" : "missing";
  const missingRequirements: AdminCalendarEventLifecycleActionAuditPayloadMissingRequirement[] =
    [];

  if (!setup.booking_ref) {
    missingRequirements.push("booking_ref");
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
    ...disabledCalendarLifecycleFields(),
    auditWriteEnabled: false,
    audit_payload: {
      actionSource,
      actionType,
      action_source: actionSource,
      action_type: actionType,
      ...disabledCalendarLifecycleFields(),
      auditWriteEnabled: false,
      blocked_no_op_result: blockedNoOpResult,
      bookingRef: setup.booking_ref,
      booking_ref: setup.booking_ref,
      disabled_action_source: disabledActionSource,
      disabled_action_status: disabledActionStatus,
      disabledActionStatus,
      planned_lifecycle: setup.planned_lifecycle,
      policy_notes: setup.policy_notes,
      preview_readiness_source: previewReadinessSource,
      readiness_status: setup.readiness_status,
      result: blockedNoOpResult,
    },
    audit_write_enabled: false,
    blocked_no_op_result: blockedNoOpResult,
    bookingRef: setup.booking_ref,
    booking_ref: setup.booking_ref,
    delivery_surface: "admin_calendar_event_lifecycle_action_audit_payload_setup_only",
    disabled_action_status: disabledActionStatus,
    disabledActionStatus,
    missing_requirements: missingRequirements,
    planned_lifecycle: setup.planned_lifecycle,
    policy_notes: setup.policy_notes,
    readiness_status: setup.readiness_status,
    status: "setup_only",
    version: adminCalendarEventLifecycleActionAuditPayloadSetupFoundationVersion,
  };
}
