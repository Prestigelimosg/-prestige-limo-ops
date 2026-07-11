import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpiryOutsideAllowedWindow,
  isDriverJobLinkExpired,
  mapBookingToSafeDriverJobPayload,
  validateDriverJobStatusUpdate,
  type DriverJobStatusUpdate,
  type SafeDriverJobPayload,
} from "./driver-job-link.ts";
import { productionDriverJobLinksConfigured } from "./driver-job-link-mode.ts";
import {
  driverJobStatusDisplayLabels,
  guardDriverJobStatusTransition,
} from "./driver-job-status-workflow.ts";

export const driverJobStatusPersistenceVersion =
  "stage-driver-job-status-production-adapter-v1";

export type DriverJobPersistenceBlockedReason =
  | "already_completed"
  | "expired"
  | "invalid_details"
  | "invalid_status"
  | "not_configured"
  | "out_of_order"
  | "revoked"
  | "unauthorized";

export type DriverJobProductionPayloadResult =
  | {
      ok: true;
      payload: SafeDriverJobPayload;
      reason: "ok";
    }
  | {
      ok: false;
      payload: null;
      reason: Exclude<
        DriverJobPersistenceBlockedReason,
        "already_completed" | "invalid_details" | "invalid_status" | "out_of_order"
      >;
    };

export type DriverJobProductionStatusUpdateResult =
  | {
      customer_notification: DriverStatusCustomerInAppFanoutResult;
      ok: true;
      payload: SafeDriverJobPayload;
      reason: "updated";
      sharing_cleanup: DriverJobSharingCleanupResult;
      status: DriverJobStatusUpdate;
    }
  | {
      ok: false;
      payload: null;
      reason: DriverJobPersistenceBlockedReason;
    };

export type DriverJobProductionDetailsUpdateResult =
  | {
      ok: true;
      payload: SafeDriverJobPayload;
      reason: "updated";
    }
  | {
      ok: false;
      payload: null;
      reason: DriverJobPersistenceBlockedReason;
    };

export type DriverJobStatusPersistenceClient = Pick<SupabaseClient, "from">;

type UnknownRecord = Record<string, unknown>;

type DriverJobLinkPersistenceRow = {
  booking_reference: string;
  expires_at: string;
  id: string | null;
  link_status: "active" | "expired" | "revoked";
  revoked_at: string | null;
  safe_link_context: UnknownRecord;
};

type DriverJobStatusEventRow = {
  booking_reference: string;
  driver_job_link_id: string | null;
  occurred_at: string;
  safe_status_note: string | null;
  status_value: DriverJobStatusUpdate;
};

type DriverJobActualTimeEventType = "dsp_start" | "dsp_end";

type LoadDriverJobPersistenceInput = {
  client: DriverJobStatusPersistenceClient;
  now?: Date | string | number;
  token: string;
};

type SaveDriverJobStatusPersistenceInput = LoadDriverJobPersistenceInput & {
  completionNote?: unknown;
  exceptionReason?: unknown;
  safeStatusContext?: unknown;
  safeStatusNote?: unknown;
  status: string;
};

type SaveDriverJobDetailsPersistenceInput = LoadDriverJobPersistenceInput & {
  driverContact?: unknown;
  driverName?: unknown;
  driverPlateNumber?: unknown;
  driverVehicleModel?: unknown;
};

type LinkResolveResult =
  | {
      link: DriverJobLinkPersistenceRow;
      ok: true;
    }
  | {
      ok: false;
    reason: Exclude<
      DriverJobPersistenceBlockedReason,
      "already_completed" | "invalid_details" | "invalid_status" | "out_of_order"
    >;
  };

type StatusHistoryResult =
  | {
      ok: true;
      statuses: DriverJobStatusEventRow[];
    }
  | {
      ok: false;
      reason: "not_configured";
    };

type ClientResult =
  | {
      client: DriverJobStatusPersistenceClient;
      ok: true;
    }
  | {
      ok: false;
      reason: "not_configured";
    };

type DriverStatusCustomerInAppFanoutResult =
  | {
      data: Record<string, unknown>;
      ok: true;
    }
  | {
      error: string;
      external_send: false;
      no_op: true;
      ok: false;
      provider_send: false;
      status: number;
    };

type DriverJobSharingCleanupResult = {
  customerVisible: false;
  external_send: false;
  no_op: boolean;
  ok: boolean;
  reason:
    | "cleanup_unavailable"
    | "completed_marker_cleared"
    | "missing_driver_job_link"
    | "not_terminal_status";
};

const driverJobLinkSelect =
  "id, booking_reference, link_status, expires_at, revoked_at, safe_link_context";
const driverJobStatusEventSelect =
  "id, booking_reference, driver_job_link_id, status_value, status_source, safe_status_note, safe_status_context, occurred_at, source_surface, actor_role, actor_label, created_at";
const driverJobActualTimeEventSelect =
  "id, booking_reference, driver_job_link_id, event_type, occurred_at, safe_event_note, safe_event_context, source_surface, actor_role, actor_label, created_at";
const maxSafeTextLength = 500;
const maxSafeStatusNoteLength = 1000;
const customerInAppNotificationSkippedResult: DriverStatusCustomerInAppFanoutResult = {
  error: "Customer in-app driver status notification was not queued.",
  external_send: false,
  no_op: true,
  ok: false,
  provider_send: false,
  status: 503,
};
const safeOutputFragments = [
  "amount_due",
  "auth_link",
  "billing",
  "customer_auth",
  "customer_charge",
  "customer_price",
  "debug",
  "driver_auth",
  "driver_payout",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "parser_learning",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "proof",
  "quoted_price",
  "rate_amount",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "secret",
  "server_secret",
  "service_role",
  "stripe",
  "telegram",
  "token",
  "whatsapp_send",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesUnsafeFragment(value: string) {
  const normalized = normalizeToken(value);

  return safeOutputFragments.some((fragment) => normalized.includes(fragment));
}

function safeTextFromDb(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = cleanText(value);

  if (!cleaned || cleaned.length > maxLength || includesUnsafeFragment(cleaned)) {
    return "";
  }

  return cleaned;
}

function hasProvidedValue(value: unknown) {
  return value !== undefined && value !== null && cleanText(value).length > 0;
}

function safeStatusNoteFromInput(value: unknown) {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return {
      ok: true as const,
      value: null,
    };
  }

  if (cleaned.length > maxSafeStatusNoteLength || includesUnsafeFragment(cleaned)) {
    return {
      ok: false as const,
    };
  }

  return {
    ok: true as const,
    value: cleaned,
  };
}

function safeStatusContextFromInput(value: unknown) {
  if (value === undefined || value === null) {
    return {
      ok: true as const,
      value: {} as UnknownRecord,
    };
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false as const,
    };
  }

  const rawContext = value as UnknownRecord;
  const safeContext: UnknownRecord = {};

  for (const [key, rawValue] of Object.entries(rawContext)) {
    const safeKey = safeIdentifierFromDb(key);

    if (!safeKey || safeKey.length > 80 || safeKey.toLowerCase().includes("token")) {
      return {
        ok: false as const,
      };
    }

    if (typeof rawValue === "boolean") {
      safeContext[safeKey] = rawValue;
      continue;
    }

    if (typeof rawValue === "number") {
      return {
        ok: false as const,
      };
    }

    if (typeof rawValue !== "string") {
      return {
        ok: false as const,
      };
    }

    const cleaned = safeTextFromDb(rawValue, 220);

    if (hasProvidedValue(rawValue) && !cleaned) {
      return {
        ok: false as const,
      };
    }

    if (cleaned) {
      safeContext[safeKey] = cleaned;
    }
  }

  return {
    ok: true as const,
    value: safeContext,
  };
}

function safeStatusNoteAndContextFromInput(input: SaveDriverJobStatusPersistenceInput) {
  const primaryNote = hasProvidedValue(input.safeStatusNote)
    ? input.safeStatusNote
    : hasProvidedValue(input.completionNote)
      ? input.completionNote
      : input.exceptionReason;
  const note = safeStatusNoteFromInput(primaryNote);

  if (!note.ok) {
    return {
      ok: false as const,
    };
  }

  const context = safeStatusContextFromInput(input.safeStatusContext);

  if (!context.ok) {
    return {
      ok: false as const,
    };
  }

  const nextContext = { ...context.value };

  if (hasProvidedValue(input.completionNote)) {
    const completionNote = safeStatusNoteFromInput(input.completionNote);

    if (!completionNote.ok) {
      return {
        ok: false as const,
      };
    }

    if (completionNote.value) {
      nextContext.completion_note_status = "provided";
    }
  }

  if (hasProvidedValue(input.exceptionReason)) {
    const exceptionReason = safeStatusNoteFromInput(input.exceptionReason);

    if (!exceptionReason.ok) {
      return {
        ok: false as const,
      };
    }

    if (exceptionReason.value) {
      nextContext.exception_reason_status = "provided";
    }
  }

  return {
    ok: true as const,
    safeStatusContext: nextContext,
    safeStatusNote: note.value,
  };
}

function safeDriverDetailsFromInput(input: SaveDriverJobDetailsPersistenceInput) {
  return {
    contact: safeTextFromDb(input.driverContact, 120),
    name: safeTextFromDb(input.driverName, 120),
    plate: safeTextFromDb(input.driverPlateNumber, 80),
    vehicleModel: safeTextFromDb(input.driverVehicleModel, 120),
  };
}

function safeDateTextFromDb(value: unknown) {
  const cleaned = cleanText(value);

  if (!cleaned || cleaned.length > 80) {
    return "";
  }

  return cleaned;
}

function safeIdentifierFromDb(value: unknown) {
  const cleaned = cleanText(value);

  if (!cleaned || cleaned.length > 120 || includesUnsafeFragment(cleaned)) {
    return "";
  }

  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) ? cleaned : "";
}

function readFirstText(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = safeTextFromDb(record[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function safeWaypointList(value: unknown) {
  return asArray(value)
    .map((item) => safeTextFromDb(item, 220))
    .filter(Boolean)
    .slice(0, 8);
}

function linkBlockedResult(
  reason: Exclude<
    DriverJobPersistenceBlockedReason,
    "already_completed" | "invalid_details" | "invalid_status" | "out_of_order"
  >,
): DriverJobProductionPayloadResult {
  return {
    ok: false,
    payload: null,
    reason,
  };
}

function detailsBlockedResult(
  reason: DriverJobPersistenceBlockedReason,
): DriverJobProductionDetailsUpdateResult {
  return {
    ok: false,
    payload: null,
    reason,
  };
}

function statusBlockedResult(
  reason: DriverJobPersistenceBlockedReason,
): DriverJobProductionStatusUpdateResult {
  return {
    ok: false,
    payload: null,
    reason,
  };
}

function safeHashToken(token: string) {
  try {
    return hashDriverJobLinkToken(token);
  } catch {
    return "";
  }
}

function toLinkPersistenceRow(row: UnknownRecord): DriverJobLinkPersistenceRow | null {
  const bookingReference = safeIdentifierFromDb(row.booking_reference);
  const id = safeIdentifierFromDb(row.id) || null;
  const linkStatus = safeTextFromDb(row.link_status, 40);
  const expiresAt = safeDateTextFromDb(row.expires_at);
  const revokedAt = safeDateTextFromDb(row.revoked_at) || null;

  if (
    !bookingReference ||
    !expiresAt ||
    !["active", "expired", "revoked"].includes(linkStatus)
  ) {
    return null;
  }

  return {
    booking_reference: bookingReference,
    expires_at: expiresAt,
    id,
    link_status: linkStatus as DriverJobLinkPersistenceRow["link_status"],
    revoked_at: revokedAt,
    safe_link_context: asRecord(row.safe_link_context),
  };
}

function toStatusEventRow(row: UnknownRecord): DriverJobStatusEventRow | null {
  const bookingReference = safeIdentifierFromDb(row.booking_reference);
  const status = validateDriverJobStatusUpdate(safeTextFromDb(row.status_value, 40));

  if (!bookingReference || !status) {
    return null;
  }

  return {
    booking_reference: bookingReference,
    driver_job_link_id: safeIdentifierFromDb(row.driver_job_link_id) || null,
    occurred_at: safeDateTextFromDb(row.occurred_at),
    safe_status_note: safeTextFromDb(row.safe_status_note, maxSafeStatusNoteLength) || null,
    status_value: status,
  };
}

function safePayloadRecordFromLink(link: DriverJobLinkPersistenceRow) {
  const context = asRecord(link.safe_link_context);
  const nestedPayload = asRecord(context.driver_job_payload);
  const source = Object.keys(nestedPayload).length > 0 ? nestedPayload : context;
  const snakeAssignedDriver = asRecord(source.assigned_driver);
  const camelAssignedDriver = asRecord(source.assignedDriver);
  const assignedDriver =
    Object.keys(snakeAssignedDriver).length > 0 ? snakeAssignedDriver : camelAssignedDriver;

  return {
    booking_type: readFirstText(source, ["booking_type", "bookingType"]),
    driver_acknowledged_at: safeTextFromDb(context.driver_acknowledged_at, 80),
    driver_contact: readFirstText(source, [
      "driver_contact",
      "driverContact",
      "assigned_driver_contact",
    ]) || safeTextFromDb(assignedDriver.contact),
    driver_name: readFirstText(source, ["driver_name", "driverName", "assigned_driver_name"]) ||
      safeTextFromDb(assignedDriver.name),
    driver_plate_number: readFirstText(source, [
      "driver_plate_number",
      "driverPlate",
      "plate",
      "assigned_driver_plate",
    ]) || safeTextFromDb(assignedDriver.plate),
    driver_vehicle_model: readFirstText(source, [
      "driver_vehicle_model",
      "driverVehicleModel",
      "vehicle_model",
      "assigned_driver_vehicle_model",
    ]) || safeTextFromDb(assignedDriver.vehicleModel),
    dropoff_address: readFirstText(source, [
      "dropoff_address",
      "dropoff_location",
      "dropoffLocation",
      "dropoff",
    ]),
    flight_no: readFirstText(source, ["flight_no", "flightNumber", "flight"]),
    passenger_name: readFirstText(source, ["passenger_name", "passengerName"]),
    pickup_address: readFirstText(source, [
      "pickup_address",
      "pickup_location",
      "pickupLocation",
      "pickup",
    ]),
    pickup_date: readFirstText(source, ["pickup_date", "pickupDate"]),
    pickup_datetime: readFirstText(source, ["pickup_datetime", "pickupDateTime"]),
    pickup_time: readFirstText(source, ["pickup_time", "pickupTime"]),
    public_reference: link.booking_reference,
    route: readFirstText(source, ["route", "route_summary", "routeSummary"]),
    status: readFirstText(source, ["status", "status_value", "statusValue"]) || "assigned",
    waypoints: safeWaypointList(source.waypoints),
  };
}

function payloadForLink(
  link: DriverJobLinkPersistenceRow,
  statusOverride: DriverJobStatusUpdate | null,
  statusHistory: DriverJobStatusEventRow[] = [],
) {
  const safePayloadRecord = safePayloadRecordFromLink(link);

  return mapBookingToSafeDriverJobPayload({
    ...safePayloadRecord,
    status: statusOverride || safePayloadRecord.status,
    statusHistory: statusHistory.map((event) => ({
      occurredAt: event.occurred_at,
      safeNote: event.safe_status_note,
      status: event.status_value,
      statusLabel: driverJobStatusDisplayLabels[event.status_value],
    })),
  });
}

function normalizedActualTimeBookingType(link: DriverJobLinkPersistenceRow) {
  return safePayloadRecordFromLink(link)
    .booking_type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isHourlyActualTimeEligibleBooking(link: DriverJobLinkPersistenceRow) {
  const bookingType = normalizedActualTimeBookingType(link);

  return (
    bookingType === "dsp" ||
    bookingType === "hourly" ||
    bookingType === "disposal" ||
    bookingType.includes("hourly") ||
    bookingType.includes("disposal")
  );
}

function actualTimeEventTypeForDriverStatus(
  status: DriverJobStatusUpdate,
): DriverJobActualTimeEventType | null {
  if (status === "ots") {
    return "dsp_start";
  }

  if (status === "completed") {
    return "dsp_end";
  }

  return null;
}

async function saveHourlyActualTimeEvidenceForDriverStatus({
  client,
  link,
  statusEvent,
}: {
  client: DriverJobStatusPersistenceClient;
  link: DriverJobLinkPersistenceRow;
  statusEvent: DriverJobStatusEventRow;
}) {
  const eventType = actualTimeEventTypeForDriverStatus(statusEvent.status_value);

  if (!eventType || !isHourlyActualTimeEligibleBooking(link)) {
    return;
  }

  const bookingType = normalizedActualTimeBookingType(link) || "unknown";

  try {
    await client
      .from("driver_job_dsp_actual_time_events")
      .insert({
        actor_label: "verified_driver_job_link",
        actor_role: "driver",
        booking_reference: statusEvent.booking_reference,
        driver_job_link_id: statusEvent.driver_job_link_id,
        event_type: eventType,
        occurred_at: statusEvent.occurred_at,
        safe_event_context: {
          actual_time_policy: "hourly_start_ots_end_completed",
          booking_type: bookingType,
          driver_status_event: statusEvent.status_value,
        },
        safe_event_note: null,
        source_surface: "driver_job_api",
      })
      .select(driverJobActualTimeEventSelect)
      .single();
  } catch {
    // Driver status is the source of truth for the driver workflow. If the
    // separate admin billing evidence table is unavailable, do not break the
    // driver's status tap; admin review will still see missing timing evidence.
  }
}

async function clearDriverSharingMarkerForCompletedStatus({
  client,
  link,
  status,
}: {
  client: DriverJobStatusPersistenceClient;
  link: DriverJobLinkPersistenceRow;
  status: DriverJobStatusUpdate;
}): Promise<DriverJobSharingCleanupResult> {
  if (status !== "completed") {
    return {
      customerVisible: false,
      external_send: false,
      no_op: true,
      ok: true,
      reason: "not_terminal_status",
    };
  }

  if (!link.id) {
    return {
      customerVisible: false,
      external_send: false,
      no_op: true,
      ok: false,
      reason: "missing_driver_job_link",
    };
  }

  try {
    const { error } = await client
      .from("driver_live_location_latest_positions")
      .delete()
      .eq("driver_job_link_id", link.id);

    if (error) {
      return {
        customerVisible: false,
        external_send: false,
        no_op: false,
        ok: false,
        reason: "cleanup_unavailable",
      };
    }

    return {
      customerVisible: false,
      external_send: false,
      no_op: false,
      ok: true,
      reason: "completed_marker_cleared",
    };
  } catch {
    return {
      customerVisible: false,
      external_send: false,
      no_op: false,
      ok: false,
      reason: "cleanup_unavailable",
    };
  }
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function getServerOnlyDriverJobStatusSupabaseClient(): ClientResult {
  if (!productionDriverJobLinksConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      reason: "not_configured",
    };
  }

  try {
    return {
      client: createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
        },
      }),
      ok: true,
    };
  } catch {
    return {
      ok: false,
      reason: "not_configured",
    };
  }
}

export function getDriverJobStatusPersistenceClientForProduction(): ClientResult {
  return getServerOnlyDriverJobStatusSupabaseClient();
}

async function resolveLinkForToken({
  client,
  now,
  token,
}: LoadDriverJobPersistenceInput): Promise<LinkResolveResult> {
  const tokenHash = safeHashToken(token);

  if (!tokenHash) {
    return {
      ok: false,
      reason: "unauthorized",
    };
  }

  const { data, error } = await client
    .from("driver_job_links")
    .select(driverJobLinkSelect)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: "not_configured",
    };
  }

  const link = toLinkPersistenceRow(asRecord(data));

  if (!link) {
    return {
      ok: false,
      reason: "unauthorized",
    };
  }

  if (link.link_status === "revoked" || link.revoked_at) {
    return {
      ok: false,
      reason: "revoked",
    };
  }

  if (
    link.link_status === "expired" ||
    isDriverJobLinkExpired(link.expires_at, now) ||
    isDriverJobLinkExpiryOutsideAllowedWindow(link.expires_at, now)
  ) {
    return {
      ok: false,
      reason: "expired",
    };
  }

  return {
    link,
    ok: true,
  };
}

async function loadStatusHistoryForLink(
  client: DriverJobStatusPersistenceClient,
  link: DriverJobLinkPersistenceRow,
): Promise<StatusHistoryResult> {
  const query = client
    .from("driver_job_status_events")
    .select(driverJobStatusEventSelect)
    .order("occurred_at", { ascending: false })
    .limit(10);
  const scopedQuery = link.id
    ? query.eq("driver_job_link_id", link.id)
    : query.eq("booking_reference", link.booking_reference);
  const { data, error } = await scopedQuery;

  if (error) {
    return {
      ok: false,
      reason: "not_configured",
    };
  }

  const statusHistory = asArray(data)
    .map(asRecord)
    .map(toStatusEventRow)
    .filter((record): record is DriverJobStatusEventRow => Boolean(record))
    .slice(0, 10);

  return {
    ok: true,
    statuses: statusHistory,
  };
}

export async function loadDriverJobPayloadThroughStatusPersistence(
  input: LoadDriverJobPersistenceInput,
): Promise<DriverJobProductionPayloadResult> {
  const resolvedLink = await resolveLinkForToken(input);

  if (!resolvedLink.ok) {
    return linkBlockedResult(resolvedLink.reason);
  }

  const statusHistory = await loadStatusHistoryForLink(
    input.client,
    resolvedLink.link,
  );

  if (!statusHistory.ok) {
    return linkBlockedResult(statusHistory.reason);
  }

  return {
    ok: true,
    payload: payloadForLink(
      resolvedLink.link,
      statusHistory.statuses[0]?.status_value || null,
      statusHistory.statuses,
    ),
    reason: "ok",
  };
}

export async function saveDriverJobDetailsThroughStatusPersistence(
  input: SaveDriverJobDetailsPersistenceInput,
): Promise<DriverJobProductionDetailsUpdateResult> {
  const nextDetails = safeDriverDetailsFromInput(input);

  if (!nextDetails.name) {
    return detailsBlockedResult("invalid_details");
  }

  const resolvedLink = await resolveLinkForToken(input);

  if (!resolvedLink.ok) {
    return detailsBlockedResult(resolvedLink.reason);
  }

  const statusHistory = await loadStatusHistoryForLink(
    input.client,
    resolvedLink.link,
  );

  if (!statusHistory.ok) {
    return detailsBlockedResult(statusHistory.reason);
  }

  const safeContext = asRecord(resolvedLink.link.safe_link_context);
  const currentPayload = asRecord(safeContext.driver_job_payload);
  const nextDriverJobPayload = {
    ...currentPayload,
    assigned_driver_contact: nextDetails.contact,
    assigned_driver_name: nextDetails.name,
    assigned_driver_plate: nextDetails.plate,
    assigned_driver_vehicle_model: nextDetails.vehicleModel,
    driver_contact: nextDetails.contact,
    driver_name: nextDetails.name,
    driver_plate_number: nextDetails.plate,
    driver_vehicle_model: nextDetails.vehicleModel,
  };
  const nextSafeContext = {
    ...safeContext,
    driver_acknowledged_at: new Date().toISOString(),
    driver_job_payload: nextDriverJobPayload,
  };

  let updatedLink: DriverJobLinkPersistenceRow | null = null;

  if (resolvedLink.link.id) {
    const { data, error } = await input.client
      .from("driver_job_links")
      .update({ safe_link_context: nextSafeContext })
      .eq("id", resolvedLink.link.id)
      .select(driverJobLinkSelect)
      .single();

    if (error) {
      return detailsBlockedResult("not_configured");
    }

    updatedLink = toLinkPersistenceRow(asRecord(data));
  } else {
    const { data, error } = await input.client
      .from("driver_job_links")
      .update({ safe_link_context: nextSafeContext })
      .eq("booking_reference", resolvedLink.link.booking_reference)
      .select(driverJobLinkSelect)
      .single();

    if (error) {
      return detailsBlockedResult("not_configured");
    }

    updatedLink = toLinkPersistenceRow(asRecord(data));
  }

  if (!updatedLink) {
    return detailsBlockedResult("not_configured");
  }

  const bookingDriverDetailsUpdate: Record<string, string | null> = {
    driver_contact: nextDetails.contact || null,
    driver_name: nextDetails.name,
    driver_plate_number: nextDetails.plate || null,
  };

  if (nextDetails.vehicleModel) {
    bookingDriverDetailsUpdate.vehicle_type_or_category = nextDetails.vehicleModel;
  }

  const { error: bookingUpdateError } = await input.client
    .from("bookings")
    .update(bookingDriverDetailsUpdate)
    .eq("booking_reference", resolvedLink.link.booking_reference);

  if (bookingUpdateError) {
    return detailsBlockedResult("not_configured");
  }

  return {
    ok: true,
    payload: payloadForLink(
      updatedLink,
      statusHistory.statuses[0]?.status_value || null,
      statusHistory.statuses,
    ),
    reason: "updated",
  };
}

export async function saveDriverJobStatusThroughStatusPersistence(
  input: SaveDriverJobStatusPersistenceInput,
): Promise<DriverJobProductionStatusUpdateResult> {
  const nextStatus = validateDriverJobStatusUpdate(input.status);

  if (!nextStatus) {
    return statusBlockedResult("invalid_status");
  }

  const resolvedLink = await resolveLinkForToken(input);

  if (!resolvedLink.ok) {
    return statusBlockedResult(resolvedLink.reason);
  }

  const statusHistory = await loadStatusHistoryForLink(
    input.client,
    resolvedLink.link,
  );

  if (!statusHistory.ok) {
    return statusBlockedResult(statusHistory.reason);
  }

  const transitionGuard = guardDriverJobStatusTransition({
    acknowledged: true,
    currentStatus: statusHistory.statuses[0]?.status_value || "",
    nextStatus,
  });

  if (!transitionGuard.ok) {
    return statusBlockedResult(
      transitionGuard.reason === "already_completed" ||
        transitionGuard.reason === "out_of_order"
        ? transitionGuard.reason
        : "invalid_status",
    );
  }

  const safeStatusDetails = safeStatusNoteAndContextFromInput(input);

  if (!safeStatusDetails.ok) {
    return statusBlockedResult("invalid_status");
  }

  const eventRow = {
    actor_label: "verified_driver_job_link",
    actor_role: "driver",
    booking_reference: resolvedLink.link.booking_reference,
    driver_job_link_id: resolvedLink.link.id,
    safe_status_context: safeStatusDetails.safeStatusContext,
    safe_status_note: safeStatusDetails.safeStatusNote,
    source_surface: "driver_job_api",
    status_source: "driver_job_api",
    status_value: nextStatus,
  };
  const { data, error } = await input.client
    .from("driver_job_status_events")
    .insert(eventRow)
    .select(driverJobStatusEventSelect)
    .single();
  const persistedEvent = toStatusEventRow(asRecord(data));

  if (error || !persistedEvent || persistedEvent.status_value !== nextStatus) {
    return statusBlockedResult("not_configured");
  }

  await saveHourlyActualTimeEvidenceForDriverStatus({
    client: input.client,
    link: resolvedLink.link,
    statusEvent: persistedEvent,
  });
  const sharingCleanup = await clearDriverSharingMarkerForCompletedStatus({
    client: input.client,
    link: resolvedLink.link,
    status: nextStatus,
  });

  let customerNotification = customerInAppNotificationSkippedResult;

  try {
    const { queueDriverStatusCustomerInAppNotification } = await import(
      "./customer-driver-app-notification-persistence.ts"
    );

    customerNotification = await queueDriverStatusCustomerInAppNotification(input.client, {
      bookingReference: resolvedLink.link.booking_reference,
      driverJobLinkId: resolvedLink.link.id,
      status: nextStatus,
    });
  } catch {
    customerNotification = customerInAppNotificationSkippedResult;
  }

  return {
    customer_notification: customerNotification,
    ok: true,
    payload: payloadForLink(resolvedLink.link, nextStatus, [
      persistedEvent,
      ...statusHistory.statuses,
    ]),
    reason: "updated",
    sharing_cleanup: sharingCleanup,
    status: nextStatus,
  };
}
