import "server-only";

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import {
  checkAdminBookingPersistenceStagingConfigReadiness,
  type AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";
import {
  defaultDriverJobLinkTtlHours,
  generateDriverJobLinkToken,
  getDriverJobLinkExpiresAt,
  hashDriverJobLinkToken,
} from "./driver-job-link";
import { sendDriverDevicePushAlertForNewJobLink } from "./driver-device-push-notification";

export const adminDriverJobLinkPersistenceVersion =
  "admin-driver-job-link-api-v1";

export type AdminDriverJobLinkStatus = "active" | "expired" | "revoked";
export type AdminDriverJobCardKind = "amendment" | "new" | "reissued";

export type AdminDriverJobLinkSafePayload = {
  assigned_driver_contact?: string;
  assigned_driver_name?: string;
  assigned_driver_plate?: string;
  assigned_driver_vehicle_model?: string;
  booking_type?: string;
  dropoff_location?: string;
  flight_no?: string;
  passenger_name?: string;
  pickup_date?: string;
  pickup_datetime?: string;
  pickup_location?: string;
  pickup_time?: string;
  route?: string;
  status?: string;
  waypoints?: string[];
};

export type AdminDriverJobLinkRecord = {
  actor_label: string | null;
  actor_role: "admin" | "dispatcher" | "system";
  booking_reference: string;
  created_at: string | null;
  expires_at: string | null;
  id: string;
  issued_at: string | null;
  link_status: AdminDriverJobLinkStatus;
  revoked_at: string | null;
  safe_summary: {
    acknowledged: boolean;
    acknowledged_at: string | null;
    assigned_driver: string | null;
    assigned_driver_contact: string | null;
    assigned_driver_plate: string | null;
    job_card_kind: AdminDriverJobCardKind | null;
    pickup_datetime: string | null;
    route: string | null;
    vehicle: string | null;
  };
  source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
  updated_at: string | null;
};

export type AdminDriverJobLinkCreateInput = {
  booking_reference: string;
  driver_job_payload: AdminDriverJobLinkSafePayload;
  ttl_hours: number;
};

export type AdminDriverJobLinkCreateResult = {
  driver_job_token: string;
  link: AdminDriverJobLinkRecord;
};

export type AdminDriverJobLinkReadParams = {
  booking_reference: string | null;
  limit: number;
  link_status: AdminDriverJobLinkStatus | null;
  page: number;
};

export type AdminDriverJobLinkReadResult = {
  links: AdminDriverJobLinkRecord[];
  pagination: {
    has_next_page: boolean;
    has_previous_page: boolean;
    page: number;
    page_count: number;
    page_size: number;
    total_link_count: number;
  };
  version: typeof adminDriverJobLinkPersistenceVersion;
};

export type AdminDriverJobLinkRevokeInput = {
  driver_job_link_id: string;
};

type UnknownRecord = Record<string, unknown>;

const maxBookingReferenceLength = 120;
const maxSafeTextLength = 220;
const maxSafeRouteLength = 1000;
const maxSafeJsonLength = 3000;
const maxReadRows = 500;
const defaultReadLimit = 25;
const maxReadLimit = 100;
const maxReadPage = 1000;
const maxTtlHours = defaultDriverJobLinkTtlHours;
const driverJobLinkSelect =
  "id, booking_reference, driver_id, link_status, issued_at, expires_at, revoked_at, source_surface, actor_role, actor_label, safe_link_context, created_at, updated_at";
const disabledDriverJobLinkError =
  "Admin driver job link persistence is not enabled on this server.";
const safeDriverJobLinkConfigError =
  "Admin driver job link persistence configuration is not ready.";
const safeDriverJobLinkActorError =
  "Admin driver job link persistence requires a verified internal boundary.";
const safeDriverJobLinkServerSessionActorError =
  "Admin driver job link persistence requires a verified admin or dispatcher server session.";
const safeDriverJobLinkLoadError = "Admin driver job link load failed safely.";
const safeDriverJobLinkCreateError = "Admin driver job link create failed safely.";
const safeDriverJobLinkRevokeError = "Admin driver job link revoke failed safely.";
const allowedLinkStatuses = new Set(["active", "expired", "revoked"]);
const allowedJobCardKinds = new Set(["amendment", "new", "reissued"]);
const allowedReadParams = new Set(["booking_reference", "limit", "link_status", "page"]);
const allowedCreateFields = new Set(["booking_reference", "driver_job_payload", "ttl_hours"]);
const allowedSafePayloadFields = new Set([
  "assigned_driver_contact",
  "assigned_driver_name",
  "assigned_driver_plate",
  "assigned_driver_vehicle_model",
  "booking_type",
  "dropoff_location",
  "flight_no",
  "passenger_name",
  "pickup_date",
  "pickup_datetime",
  "pickup_location",
  "pickup_time",
  "route",
  "status",
  "waypoints",
]);
const allowedRevokeFields = new Set(["driver_job_link_id"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const forbiddenDriverJobLinkFragments = [
  "amount_due",
  "auth_link",
  "bank_account",
  "billing",
  "customer_auth",
  "customer_charge",
  "customer_email",
  "customer_phone",
  "customer_price",
  "debug",
  "dev_workbench",
  "driver_auth",
  "driver_payout",
  "email_send",
  "fare_amount",
  "finance",
  "finance_note",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "live_location",
  "mock_archive",
  "mock_qa",
  "notification",
  "paid_amount",
  "payment",
  "payment_link",
  "paynow",
  "pay_now",
  "pdf",
  "payout",
  "proof",
  "photo",
  "qa_archive",
  "quoted_price",
  "rate_amount",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "raw_token",
  "secret",
  "send_log",
  "send_state",
  "server_secret",
  "service_role",
  "sms_send",
  "stripe",
  "telegram",
  "token_hash",
  "token_value",
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

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenDriverJobLinkFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenDriverJobLinkFragments.some((fragment) => normalized.includes(fragment));
}

function forbiddenDriverJobLinkResult<T>(): AdminBookingResult<T> {
  return {
    error: "Admin driver job link details include unsupported or unsafe fields.",
    ok: false,
    status: 400,
  };
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function findForbiddenFieldNames(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenFieldNames(item, `${path}[${index}]`));
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as UnknownRecord).flatMap(([key, nestedValue]) => {
    const currentPath = path ? `${path}.${key}` : key;
    const keyLeaks = includesForbiddenDriverJobLinkFragment(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function findForbiddenTextValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(findForbiddenTextValues);
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value as UnknownRecord).flatMap(findForbiddenTextValues);
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return [];
  }

  const text = String(value);

  return includesForbiddenDriverJobLinkFragment(text) ? [text] : [];
}

function safeText(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > maxLength || includesForbiddenDriverJobLinkFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function optionalSafeText(value: unknown, maxLength = maxSafeTextLength) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return safeText(value, maxLength);
}

function validUuid(value: unknown) {
  const cleaned = safeText(value, 80);

  return cleaned && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : null;
}

function validBookingReference(value: unknown) {
  const cleaned = safeText(value, maxBookingReferenceLength);

  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function validReadBookingReference(value: unknown) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (
    !cleaned ||
    cleaned.length > maxBookingReferenceLength ||
    includesForbiddenDriverJobLinkFragment(cleaned) ||
    /\.\.|\/{2,}|https?:|[\\<>{}\[\]|`$?&]/i.test(cleaned)
  ) {
    return null;
  }

  return /^[A-Za-z0-9][A-Za-z0-9 ._:#/()-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function validDateText(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > 80) {
    return null;
  }

  const date = new Date(cleaned);

  return Number.isFinite(date.getTime()) ? cleaned : null;
}

function validLinkStatus(value: unknown): AdminDriverJobLinkStatus | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedLinkStatuses.has(cleaned) ? (cleaned as AdminDriverJobLinkStatus) : null;
}

function positiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxValue ? parsed : null;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function unknownSearchParams(params: URLSearchParams) {
  return Array.from(params.keys()).filter((key) => !allowedReadParams.has(key));
}

function safeWaypointList(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const waypoints = value.map((item) => safeText(item)).filter(Boolean) as string[];

  return waypoints.length === value.length ? waypoints.slice(0, 8) : null;
}

function safeDriverJobPayload(value: unknown): AdminDriverJobLinkSafePayload | null {
  const record = asRecord(value);

  if (
    Object.keys(record).length === 0 ||
    unknownKeys(record, allowedSafePayloadFields, "driver_job_payload").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return null;
  }

  const payload: AdminDriverJobLinkSafePayload = {};
  const textFields: Array<keyof AdminDriverJobLinkSafePayload> = [
    "assigned_driver_contact",
    "assigned_driver_name",
    "assigned_driver_plate",
    "assigned_driver_vehicle_model",
    "booking_type",
    "dropoff_location",
    "flight_no",
    "passenger_name",
    "pickup_date",
    "pickup_datetime",
    "pickup_location",
    "pickup_time",
    "route",
    "status",
  ];

  for (const field of textFields) {
    const valueForField = field === "route"
      ? optionalSafeText(record[field], maxSafeRouteLength)
      : optionalSafeText(record[field]);

    if (record[field] !== undefined && record[field] !== null && record[field] !== "" && !valueForField) {
      return null;
    }

    if (valueForField) {
      payload[field] = valueForField as never;
    }
  }

  const waypoints = safeWaypointList(record.waypoints);

  if (waypoints === null) {
    return null;
  }

  if (waypoints.length > 0) {
    payload.waypoints = waypoints;
  }

  const payloadText = JSON.stringify(payload);

  if (
    payloadText.length > maxSafeJsonLength ||
    !payload.pickup_location ||
    !payload.dropoff_location ||
    !payload.pickup_datetime
  ) {
    return null;
  }

  return payload;
}

function safeDriverJobPayloadRevision(payload: AdminDriverJobLinkSafePayload) {
  const canonicalPayload = Object.fromEntries(
    Object.entries(payload).sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey)),
  );

  return createHash("sha256").update(JSON.stringify(canonicalPayload)).digest("hex");
}

export function classifyAdminDriverJobCardKind(
  previousSafeLinkContext: unknown,
  nextPayload: AdminDriverJobLinkSafePayload,
): AdminDriverJobCardKind | null {
  const previousContext = asRecord(previousSafeLinkContext);

  if (Object.keys(previousContext).length === 0) {
    return "new";
  }

  const previousPayload = safeDriverJobPayload(previousContext.driver_job_payload);

  if (!previousPayload) {
    return null;
  }

  return safeDriverJobPayloadRevision(previousPayload) === safeDriverJobPayloadRevision(nextPayload)
    ? "reissued"
    : "amendment";
}

export function parseAdminDriverJobLinkCreatePayload(
  value: unknown,
): AdminBookingResult<AdminDriverJobLinkCreateInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedCreateFields, "driver_job_link").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenDriverJobLinkResult();
  }

  const bookingReference = validBookingReference(record.booking_reference);
  const driverJobPayload = safeDriverJobPayload(record.driver_job_payload);
  const ttlHours = positiveInteger(record.ttl_hours, defaultDriverJobLinkTtlHours, maxTtlHours);

  if (!bookingReference || !driverJobPayload || !ttlHours) {
    return {
      error: "Admin driver job link create payload is malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      driver_job_payload: driverJobPayload,
      ttl_hours: ttlHours,
    },
    ok: true,
  };
}

export function parseAdminDriverJobLinkReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminDriverJobLinkReadParams> {
  if (params instanceof URLSearchParams && unknownSearchParams(params).length > 0) {
    return forbiddenDriverJobLinkResult();
  }

  if (
    !(params instanceof URLSearchParams) &&
    unknownKeys(params, allowedReadParams, "driver_job_link_read").length > 0
  ) {
    return forbiddenDriverJobLinkResult();
  }

  const bookingReferenceValue = readParamsValue(params, "booking_reference");
  const bookingReference =
    bookingReferenceValue === undefined ||
    bookingReferenceValue === null ||
    bookingReferenceValue === ""
      ? null
      : validReadBookingReference(bookingReferenceValue);

  if (bookingReferenceValue && !bookingReference) {
    return {
      error: "Malformed driver job link booking reference rejected.",
      ok: false,
      status: 400,
    };
  }

  const linkStatusValue = readParamsValue(params, "link_status");
  const linkStatus =
    linkStatusValue === undefined || linkStatusValue === null || linkStatusValue === ""
      ? null
      : validLinkStatus(linkStatusValue);

  if (linkStatusValue && !linkStatus) {
    return {
      error: "Malformed driver job link status rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(readParamsValue(params, "limit"), defaultReadLimit, maxReadLimit);

  if (!limit) {
    return {
      error: "Malformed driver job link limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxReadPage);

  if (!page) {
    return {
      error: "Malformed driver job link page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      limit,
      link_status: linkStatus,
      page,
    },
    ok: true,
  };
}

export function parseAdminDriverJobLinkRevokePayload(
  value: unknown,
): AdminBookingResult<AdminDriverJobLinkRevokeInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedRevokeFields, "driver_job_link_revoke").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenDriverJobLinkResult();
  }

  const driverJobLinkId = validUuid(record.driver_job_link_id);

  if (!driverJobLinkId) {
    return {
      error: "Admin driver job link revoke payload is malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      driver_job_link_id: driverJobLinkId,
    },
    ok: true,
  };
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function classifyAdapterDatabaseFailure(
  error: unknown,
): AdminBookingPersistenceSafeErrorCategory {
  const record = asRecord(error);
  const haystack = Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).toLowerCase())
    .join(" ");
  const code = textOrNull(record.code)?.toLowerCase() || "";
  const statusValue = Number(record.status);
  const status = Number.isFinite(statusValue) ? statusValue : null;

  if (
    status === 401 ||
    code === "401" ||
    haystack.includes("invalid api") ||
    haystack.includes("invalid jwt") ||
    haystack.includes("jwt")
  ) {
    return "auth_or_key_rejected";
  }

  if (
    status === 403 ||
    code === "42501" ||
    haystack.includes("permission denied") ||
    haystack.includes("row level security") ||
    haystack.includes("row-level security") ||
    haystack.includes("rls")
  ) {
    return "permission_or_rls_denied";
  }

  if (
    code === "42p01" ||
    haystack.includes("could not find the table") ||
    (haystack.includes("relation") && haystack.includes("does not exist"))
  ) {
    return "table_unreachable";
  }

  if (
    code === "42703" ||
    code === "pgrst204" ||
    code === "pgrst200" ||
    (haystack.includes("column") &&
      (haystack.includes("does not exist") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  ) {
    return "column_missing";
  }

  return "unknown_adapter_failure";
}

function safeAdapterFailure<T>(
  error: string,
  status: number,
  databaseError: unknown,
): AdminBookingResult<T> {
  return {
    category: classifyAdapterDatabaseFailure(databaseError),
    error,
    ok: false,
    status,
  };
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedActorRoles.has(actor.actor_role) ||
    !textOrNull(actor.actor_label) ||
    actor.source_surface !== "admin_api"
  ) {
    return {
      error: safeDriverJobLinkActorError,
      ok: false,
      status: 403,
    };
  }

  if (
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true" &&
    (actor.boundary_mode !== "server-session-role-surface" ||
      !["admin", "dispatcher"].includes(actor.actor_role))
  ) {
    return {
      error: safeDriverJobLinkServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyAdminDriverJobLinkSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledDriverJobLinkError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeDriverJobLinkConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeDriverJobLinkConfigError,
      ok: false,
      status: 503,
    };
  }

  try {
    return {
      data: createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
        },
      }),
      ok: true,
    };
  } catch {
    return {
      category: "client_init_failed",
      error: safeDriverJobLinkConfigError,
      ok: false,
      status: 503,
    };
  }
}

function safeSummaryFromContext(context: UnknownRecord): AdminDriverJobLinkRecord["safe_summary"] {
  const payload = asRecord(context.driver_job_payload);
  const acknowledgedAt = validDateText(context.driver_acknowledged_at);
  const jobCardKind = textOrNull(context.job_card_kind);

  return {
    acknowledged: Boolean(acknowledgedAt),
    acknowledged_at: acknowledgedAt,
    assigned_driver: safeText(payload.assigned_driver_name) || null,
    assigned_driver_contact: safeText(payload.assigned_driver_contact) || null,
    assigned_driver_plate: safeText(payload.assigned_driver_plate) || null,
    job_card_kind:
      jobCardKind && allowedJobCardKinds.has(jobCardKind)
        ? (jobCardKind as AdminDriverJobCardKind)
        : null,
    pickup_datetime: safeText(payload.pickup_datetime) || null,
    route: safeText(payload.route, maxSafeRouteLength) || null,
    vehicle: safeText(payload.assigned_driver_vehicle_model) || null,
  };
}

function normalizeDriverJobLinkRecord(row: UnknownRecord): AdminDriverJobLinkRecord | null {
  const id = validUuid(row.id);
  const bookingReference = validReadBookingReference(row.booking_reference);
  const linkStatus = validLinkStatus(row.link_status);
  const sourceSurface = textOrNull(row.source_surface);
  const actorRole = textOrNull(row.actor_role);

  if (
    !id ||
    !bookingReference ||
    !linkStatus ||
    !sourceSurface ||
    !actorRole ||
    !allowedSourceSurfaces.has(sourceSurface) ||
    !allowedActorRoles.has(actorRole)
  ) {
    return null;
  }

  return {
    actor_label: safeText(row.actor_label, 160),
    actor_role: actorRole as AdminDriverJobLinkRecord["actor_role"],
    booking_reference: bookingReference,
    created_at: validDateText(row.created_at),
    expires_at: validDateText(row.expires_at),
    id,
    issued_at: validDateText(row.issued_at),
    link_status: linkStatus,
    revoked_at: validDateText(row.revoked_at),
    safe_summary: safeSummaryFromContext(asRecord(row.safe_link_context)),
    source_surface: sourceSurface as AdminDriverJobLinkRecord["source_surface"],
    updated_at: validDateText(row.updated_at),
  };
}

function filterLinks(links: AdminDriverJobLinkRecord[], params: AdminDriverJobLinkReadParams) {
  return links.filter((link) => {
    if (params.booking_reference && link.booking_reference !== params.booking_reference) {
      return false;
    }

    return !params.link_status || link.link_status === params.link_status;
  });
}

function paginateLinks(links: AdminDriverJobLinkRecord[], params: AdminDriverJobLinkReadParams) {
  const startIndex = (params.page - 1) * params.limit;

  return links.slice(startIndex, startIndex + params.limit);
}

function buildPagination(links: AdminDriverJobLinkRecord[], params: AdminDriverJobLinkReadParams) {
  const pageCount = links.length > 0 ? Math.ceil(links.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_link_count: links.length,
  };
}

export async function loadAdminDriverJobLinks(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverJobLinkReadResult>> {
  const parsed = parseAdminDriverJobLinkReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyAdminDriverJobLinkSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("driver_job_links")
    .select(driverJobLinkSelect)
    .order("created_at", { ascending: false })
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safeDriverJobLinkLoadError, 500, error);
  }

  const links = asArray(data)
    .map(asRecord)
    .map(normalizeDriverJobLinkRecord)
    .filter((link): link is AdminDriverJobLinkRecord => Boolean(link));
  const filteredLinks = filterLinks(links, parsed.data);

  return {
    data: {
      links: paginateLinks(filteredLinks, parsed.data),
      pagination: buildPagination(filteredLinks, parsed.data),
      version: adminDriverJobLinkPersistenceVersion,
    },
    ok: true,
  };
}

export async function createAdminDriverJobLink(
  input: AdminDriverJobLinkCreateInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverJobLinkCreateResult>> {
  const clientResult = getServerOnlyAdminDriverJobLinkSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const token = generateDriverJobLinkToken();
  const tokenHash = hashDriverJobLinkToken(token);
  const now = new Date();
  const expiresAt = getDriverJobLinkExpiresAt(now, input.ttl_hours);
  const { data: bookingData, error: bookingError } = await clientResult.data
    .from("bookings")
    .select("driver_id")
    .eq("booking_reference", input.booking_reference)
    .maybeSingle();
  const bookingRecord = asRecord(bookingData);
  const verifiedDriverId = Number(bookingRecord.driver_id);

  if (bookingError) {
    return safeAdapterFailure(safeDriverJobLinkCreateError, 500, bookingError);
  }

  const { data: previousLinkData, error: previousLinkError } = await clientResult.data
    .from("driver_job_links")
    .select("safe_link_context")
    .eq("booking_reference", input.booking_reference)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousLinkError) {
    return safeAdapterFailure(safeDriverJobLinkCreateError, 500, previousLinkError);
  }

  const previousLinkRecord = asRecord(previousLinkData);
  const jobCardKind = classifyAdminDriverJobCardKind(
    Object.keys(previousLinkRecord).length > 0 ? previousLinkRecord.safe_link_context : null,
    input.driver_job_payload,
  );

  const payload = {
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    booking_reference: input.booking_reference,
    driver_id:
      Number.isSafeInteger(verifiedDriverId) && verifiedDriverId > 0
        ? verifiedDriverId
        : null,
    expires_at: expiresAt.toISOString(),
    issued_at: now.toISOString(),
    link_status: "active",
    revoked_at: null,
    safe_link_context: {
      driver_job_payload: input.driver_job_payload,
      job_card_kind: jobCardKind,
      job_card_revision: safeDriverJobPayloadRevision(input.driver_job_payload),
      link_purpose: "manual_driver_assignment_job_card",
    },
    source_surface: actor.source_surface,
    token_hash: tokenHash,
    updated_at: now.toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("driver_job_links")
    .insert(payload)
    .select(driverJobLinkSelect)
    .single();
  const link = normalizeDriverJobLinkRecord(asRecord(data));

  if (error || !link) {
    return safeAdapterFailure(safeDriverJobLinkCreateError, 500, error);
  }

  await sendDriverDevicePushAlertForNewJobLink(
    clientResult.data,
    {
      driver_job_link_id: link.id,
      driver_job_token: token,
    },
  ).catch(() => null);

  return {
    data: {
      driver_job_token: token,
      link,
    },
    ok: true,
  };
}

export async function revokeAdminDriverJobLink(
  input: AdminDriverJobLinkRevokeInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverJobLinkRecord>> {
  const clientResult = getServerOnlyAdminDriverJobLinkSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const now = new Date().toISOString();
  const { data, error } = await clientResult.data
    .from("driver_job_links")
    .update({
      link_status: "revoked",
      revoked_at: now,
      updated_at: now,
    })
    .eq("id", input.driver_job_link_id)
    .select(driverJobLinkSelect)
    .single();
  const link = normalizeDriverJobLinkRecord(asRecord(data));

  if (error || !link || link.link_status !== "revoked") {
    return safeAdapterFailure(safeDriverJobLinkRevokeError, 500, error);
  }

  return {
    data: link,
    ok: true,
  };
}
