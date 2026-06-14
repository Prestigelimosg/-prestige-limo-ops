import "server-only";

export const adminCalendarEventLifecycleReadinessSetupFoundationVersion =
  "admin-calendar-event-lifecycle-readiness-setup-foundation-v1";

export const adminCalendarEventLifecycleActions = [
  "create_confirmed_booking_event",
  "update_after_admin_approved_amendment",
  "cancel_after_admin_approved_cancellation",
] as const;

export type AdminCalendarEventLifecycleAction =
  (typeof adminCalendarEventLifecycleActions)[number];

export type AdminCalendarEventLifecycleMissingRequirement =
  | "admin_approval"
  | "calendar_provider_approval"
  | "confirmed_booking"
  | "live_calendar_sync_approval";

export type AdminCalendarEventLifecycleReadinessSetupInput = {
  bookingRef?: unknown;
  booking_ref?: unknown;
  lifecycleAction?: unknown;
  lifecycle_action?: unknown;
};

export type AdminCalendarEventLifecycleReadinessSetupResult = {
  adminApprovalRequired: true;
  admin_approval_required: true;
  booking_ref: string | null;
  calendarCancelEnabled: false;
  calendarCreateEnabled: false;
  calendarUpdateEnabled: false;
  calendar_cancel_enabled: false;
  calendar_create_enabled: false;
  calendar_update_enabled: false;
  customer_amendment_auto_calendar_update_allowed: false;
  delivery_surface: "admin_calendar_event_lifecycle_readiness_setup_only";
  external_calendar: false;
  lifecycleAction: AdminCalendarEventLifecycleAction | null;
  lifecycle_action: AdminCalendarEventLifecycleAction | null;
  liveCalendarSyncEnabled: false;
  live_calendar_sync_enabled: false;
  missing_requirements: AdminCalendarEventLifecycleMissingRequirement[];
  planned_lifecycle: {
    cancel_existing_event_after_admin_approved_cancellation: "planned_only";
    create_event_for_confirmed_booking: "planned_only";
    update_existing_event_after_admin_approved_amendment: "planned_only";
  };
  policy_notes: {
    admin_approval_required_for_update_cancel: true;
    customer_amendment_cancellation_never_auto_updates_calendar: true;
    file_download_only_until_live_sync_approved: true;
  };
  readiness_status: "blocked_pending_admin_approval";
  status: "setup_only";
  version: typeof adminCalendarEventLifecycleReadinessSetupFoundationVersion;
};

const blockedReferenceFragments = [
  "access_token",
  "admin_finance",
  "api_key",
  "billing",
  "customer_price",
  "debug",
  "driver_payout",
  "internal_admin",
  "internal_note",
  "invoice",
  "mock_archive",
  "mock_qa",
  "password",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pricing",
  "private_key",
  "raw_token",
  "secret",
  "service_role",
  "token",
];

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesBlockedReferenceFragment(value: string) {
  const normalized = normalizeToken(value);

  return blockedReferenceFragments.some((fragment) => normalized.includes(fragment));
}

function safeReference(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (
    !cleaned ||
    cleaned.length > 120 ||
    includesBlockedReferenceFragment(cleaned) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function normalizeLifecycleAction(value: unknown): AdminCalendarEventLifecycleAction | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  if (normalized.includes("create")) {
    return "create_confirmed_booking_event";
  }

  if (normalized.includes("update") || normalized.includes("amendment")) {
    return "update_after_admin_approved_amendment";
  }

  if (normalized.includes("cancel")) {
    return "cancel_after_admin_approved_cancellation";
  }

  return adminCalendarEventLifecycleActions.includes(normalized as AdminCalendarEventLifecycleAction)
    ? (normalized as AdminCalendarEventLifecycleAction)
    : null;
}

export function buildAdminCalendarEventLifecycleReadinessSetup(
  input: AdminCalendarEventLifecycleReadinessSetupInput = {},
): AdminCalendarEventLifecycleReadinessSetupResult {
  const bookingRef = safeReference(firstValue(input.booking_ref, input.bookingRef));
  const lifecycleAction = normalizeLifecycleAction(
    firstValue(input.lifecycle_action, input.lifecycleAction),
  );

  return {
    adminApprovalRequired: true,
    admin_approval_required: true,
    booking_ref: bookingRef,
    calendarCancelEnabled: false,
    calendarCreateEnabled: false,
    calendarUpdateEnabled: false,
    calendar_cancel_enabled: false,
    calendar_create_enabled: false,
    calendar_update_enabled: false,
    customer_amendment_auto_calendar_update_allowed: false,
    delivery_surface: "admin_calendar_event_lifecycle_readiness_setup_only",
    external_calendar: false,
    lifecycleAction,
    lifecycle_action: lifecycleAction,
    liveCalendarSyncEnabled: false,
    live_calendar_sync_enabled: false,
    missing_requirements: [
      "confirmed_booking",
      "admin_approval",
      "calendar_provider_approval",
      "live_calendar_sync_approval",
    ],
    planned_lifecycle: {
      cancel_existing_event_after_admin_approved_cancellation: "planned_only",
      create_event_for_confirmed_booking: "planned_only",
      update_existing_event_after_admin_approved_amendment: "planned_only",
    },
    policy_notes: {
      admin_approval_required_for_update_cancel: true,
      customer_amendment_cancellation_never_auto_updates_calendar: true,
      file_download_only_until_live_sync_approved: true,
    },
    readiness_status: "blocked_pending_admin_approval",
    status: "setup_only",
    version: adminCalendarEventLifecycleReadinessSetupFoundationVersion,
  };
}
