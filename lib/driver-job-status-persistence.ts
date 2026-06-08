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

export const driverJobStatusPersistenceVersion =
  "stage-driver-job-status-production-adapter-v1";

export type DriverJobPersistenceBlockedReason =
  | "expired"
  | "invalid_status"
  | "not_configured"
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
      reason: Exclude<DriverJobPersistenceBlockedReason, "invalid_status">;
    };

export type DriverJobProductionStatusUpdateResult =
  | {
      ok: true;
      payload: SafeDriverJobPayload;
      reason: "updated";
      status: DriverJobStatusUpdate;
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
  status_value: DriverJobStatusUpdate;
};

type LoadDriverJobPersistenceInput = {
  client: DriverJobStatusPersistenceClient;
  now?: Date | string | number;
  token: string;
};

type SaveDriverJobStatusPersistenceInput = LoadDriverJobPersistenceInput & {
  status: string;
};

type LinkResolveResult =
  | {
      link: DriverJobLinkPersistenceRow;
      ok: true;
    }
  | {
      ok: false;
      reason: Exclude<DriverJobPersistenceBlockedReason, "invalid_status">;
    };

type LatestStatusResult =
  | {
      ok: true;
      status: DriverJobStatusUpdate | null;
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

const driverJobLinkSelect =
  "id, booking_reference, link_status, expires_at, revoked_at, safe_link_context";
const driverJobStatusEventSelect =
  "id, booking_reference, driver_job_link_id, status_value, status_source, safe_status_note, safe_status_context, occurred_at, source_surface, actor_role, actor_label, created_at";
const maxSafeTextLength = 500;
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
  reason: Exclude<DriverJobPersistenceBlockedReason, "invalid_status">,
): DriverJobProductionPayloadResult {
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
    ]) || safeTextFromDb(assignedDriver.plate),
    driver_vehicle_model: readFirstText(source, [
      "driver_vehicle_model",
      "driverVehicleModel",
      "vehicle_model",
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
) {
  const safePayloadRecord = safePayloadRecordFromLink(link);

  return mapBookingToSafeDriverJobPayload({
    ...safePayloadRecord,
    status: statusOverride || safePayloadRecord.status,
  });
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

async function loadLatestStatusForLink(
  client: DriverJobStatusPersistenceClient,
  bookingReference: string,
): Promise<LatestStatusResult> {
  const { data, error } = await client
    .from("driver_job_status_events")
    .select(driverJobStatusEventSelect)
    .eq("booking_reference", bookingReference)
    .order("occurred_at", { ascending: false })
    .limit(1);

  if (error) {
    return {
      ok: false,
      reason: "not_configured",
    };
  }

  const latestStatus = asArray(data)
    .map(asRecord)
    .map(toStatusEventRow)
    .find((record): record is DriverJobStatusEventRow => Boolean(record));

  return {
    ok: true,
    status: latestStatus?.status_value || null,
  };
}

export async function loadDriverJobPayloadThroughStatusPersistence(
  input: LoadDriverJobPersistenceInput,
): Promise<DriverJobProductionPayloadResult> {
  const resolvedLink = await resolveLinkForToken(input);

  if (!resolvedLink.ok) {
    return linkBlockedResult(resolvedLink.reason);
  }

  const latestStatus = await loadLatestStatusForLink(
    input.client,
    resolvedLink.link.booking_reference,
  );

  if (!latestStatus.ok) {
    return linkBlockedResult(latestStatus.reason);
  }

  return {
    ok: true,
    payload: payloadForLink(resolvedLink.link, latestStatus.status),
    reason: "ok",
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

  const eventRow = {
    actor_label: "verified_driver_job_link",
    actor_role: "driver",
    booking_reference: resolvedLink.link.booking_reference,
    driver_job_link_id: resolvedLink.link.id,
    safe_status_context: {},
    safe_status_note: null,
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

  return {
    ok: true,
    payload: payloadForLink(resolvedLink.link, nextStatus),
    reason: "updated",
    status: nextStatus,
  };
}
