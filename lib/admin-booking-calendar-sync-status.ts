import "server-only";

import {
  buildAdminBookingCalendarEvent,
  type AdminBookingCalendarEventData,
} from "./admin-booking-calendar-event";

export const adminBookingCalendarSyncStatusVersion =
  "admin-booking-calendar-sync-status-v1";

export type AdminBookingCalendarSyncStatusValue =
  | "calendar_file_current"
  | "calendar_file_not_created"
  | "calendar_file_outdated";

export type AdminBookingCalendarSyncStatusData = {
  app_updates_from_calendar: false;
  booking_reference: string;
  calendar_file_matches_saved_booking: boolean;
  calendar_updates_from_app: false;
  connection_mode: "ics_file_only";
  external_calendar_edits_detectable: false;
  live_calendar_provider: "none";
  live_calendar_write_performed: false;
  mismatched_fields: string[];
  next_admin_action: string;
  provider_connection: "not_connected";
  safe_message: string;
  source_of_truth: "prestige_saved_booking";
  status: AdminBookingCalendarSyncStatusValue;
  sync_method: "ics_file_download" | "status_check";
};

export type BuildAdminBookingCalendarSyncStatusResult =
  | {
      data: {
        sync_status: AdminBookingCalendarSyncStatusData;
        version: typeof adminBookingCalendarSyncStatusVersion;
      };
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 400;
    };

type BuildAdminBookingCalendarSyncStatusError = Extract<
  BuildAdminBookingCalendarSyncStatusResult,
  { ok: false }
>;
type UnknownRecord = Record<string, unknown>;

const genericPayloadError =
  "Calendar sync status payload must contain only supported saved booking and calendar fields.";
const savedBookingRequiredError =
  "Saved booking details are required before checking calendar sync status.";
const unsupportedSyncMethodError =
  "Calendar sync status method must be ics_file_download or status_check.";
const allowedRootFields = new Set(["calendar_event", "saved_booking", "sync_method"]);
const allowedSyncMethods = new Set(["ics_file_download", "status_check"]);
const allowedCalendarEventFields = new Set([
  "booking_reference",
  "description",
  "ends_at_local",
  "filename",
  "location",
  "starts_at_local",
  "timezone",
  "title",
]);
const comparedCalendarEventFields = [
  "booking_reference",
  "ends_at_local",
  "filename",
  "location",
  "starts_at_local",
  "timezone",
  "title",
] as const satisfies readonly (keyof AdminBookingCalendarEventData)[];
const forbiddenFieldFragments = [
  "admin_finance",
  "admin_note",
  "billing",
  "calendar_provider",
  "customer_price",
  "customer_rate",
  "debug",
  "dev_archive",
  "dev_workbench",
  "driver_note",
  "driver_payout",
  "email_payload",
  "finance",
  "internal",
  "invoice",
  "mock_archive",
  "mock_qa",
  "notification",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "price",
  "proof",
  "provider_event",
  "raw_ai",
  "raw_token",
  "secret",
  "server_secret",
  "surcharge",
  "token_hash",
];

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

function normalizeFieldKey(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function isForbiddenField(value: string) {
  const normalized = normalizeFieldKey(value);

  return forbiddenFieldFragments.some((fragment) => normalized.includes(fragment));
}

function findForbiddenFieldNames(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenFieldNames(item, `${path}[${index}]`));
  }

  const record = asRecord(value);

  if (!record) {
    return [];
  }

  return Object.entries(record).flatMap(([key, nestedValue]) => {
    const currentPath = path ? `${path}.${key}` : key;
    const keyLeaks = isForbiddenField(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function malformedCalendarSyncStatusResult(
  error = genericPayloadError,
): BuildAdminBookingCalendarSyncStatusError {
  return {
    error,
    ok: false,
    status: 400,
  };
}

function parseSyncMethod(value: unknown): "ics_file_download" | "status_check" | null {
  const cleaned = textOrNull(value) || "status_check";

  return allowedSyncMethods.has(cleaned) ? (cleaned as "ics_file_download" | "status_check") : null;
}

function parseCalendarEvent(
  value: unknown,
):
  | {
      calendarEvent: Partial<AdminBookingCalendarEventData> | null;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 400;
    } {
  if (value === null || value === undefined) {
    return {
      calendarEvent: null,
      ok: true,
    };
  }

  const record = asRecord(value);

  if (!record) {
    return malformedCalendarSyncStatusResult();
  }

  if (
    unknownKeys(record, allowedCalendarEventFields, "calendar_event").length > 0 ||
    findForbiddenFieldNames(record, "calendar_event").length > 0
  ) {
    return malformedCalendarSyncStatusResult();
  }

  const calendarEvent: Partial<AdminBookingCalendarEventData> = {};

  for (const key of allowedCalendarEventFields) {
    const value = textOrNull(record[key]);

    if (value) {
      (calendarEvent as Record<string, string>)[key] = value;
    }
  }

  return {
    calendarEvent,
    ok: true,
  };
}

function syncStatusMessage(status: AdminBookingCalendarSyncStatusValue) {
  if (status === "calendar_file_current") {
    return "Calendar file matches the saved booking at download time. App remains source of truth; calendar edits will not update the app.";
  }

  if (status === "calendar_file_outdated") {
    return "Calendar file does not match the saved booking. Regenerate the file from the app; calendar edits are not read by the app.";
  }

  return "No calendar file is recorded for this status check. Create or download the file from the saved booking.";
}

function nextAdminAction(status: AdminBookingCalendarSyncStatusValue) {
  if (status === "calendar_file_current") {
    return "Update the saved booking in the app first, then regenerate the calendar file after app changes.";
  }

  if (status === "calendar_file_outdated") {
    return "Regenerate the calendar file from the saved booking before relying on the calendar copy.";
  }

  return "Create or download a calendar file from the saved booking.";
}

export function buildAdminBookingCalendarSyncStatus(
  input: unknown,
): BuildAdminBookingCalendarSyncStatusResult {
  const payload = asRecord(input);

  if (!payload) {
    return malformedCalendarSyncStatusResult();
  }

  if (
    unknownKeys(payload, allowedRootFields, "calendar_sync_status").length > 0 ||
    findForbiddenFieldNames(payload, "calendar_sync_status").length > 0
  ) {
    return malformedCalendarSyncStatusResult();
  }

  if (!payload.saved_booking) {
    return malformedCalendarSyncStatusResult(savedBookingRequiredError);
  }

  const syncMethod = parseSyncMethod(payload.sync_method);

  if (!syncMethod) {
    return malformedCalendarSyncStatusResult(unsupportedSyncMethodError);
  }

  const expectedCalendarEvent = buildAdminBookingCalendarEvent(payload.saved_booking);

  if (!expectedCalendarEvent.ok) {
    return expectedCalendarEvent;
  }

  const parsedCalendarEvent = parseCalendarEvent(payload.calendar_event);

  if (!parsedCalendarEvent.ok) {
    return parsedCalendarEvent;
  }

  const expected = expectedCalendarEvent.data.calendar_event;
  const provided = parsedCalendarEvent.calendarEvent;
  const mismatchedFields = provided
    ? comparedCalendarEventFields.filter((field) => (provided[field] || "") !== expected[field])
    : [];
  const status: AdminBookingCalendarSyncStatusValue = !provided
    ? "calendar_file_not_created"
    : mismatchedFields.length > 0
      ? "calendar_file_outdated"
      : "calendar_file_current";

  return {
    data: {
      sync_status: {
        app_updates_from_calendar: false,
        booking_reference: expected.booking_reference,
        calendar_file_matches_saved_booking: status === "calendar_file_current",
        calendar_updates_from_app: false,
        connection_mode: "ics_file_only",
        external_calendar_edits_detectable: false,
        live_calendar_provider: "none",
        live_calendar_write_performed: false,
        mismatched_fields: mismatchedFields,
        next_admin_action: nextAdminAction(status),
        provider_connection: "not_connected",
        safe_message: syncStatusMessage(status),
        source_of_truth: "prestige_saved_booking",
        status,
        sync_method: syncMethod,
      },
      version: adminBookingCalendarSyncStatusVersion,
    },
    ok: true,
  };
}
