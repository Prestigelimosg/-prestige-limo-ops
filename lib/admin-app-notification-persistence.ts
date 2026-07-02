import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import {
  checkAdminBookingPersistenceStagingConfigReadiness,
  type AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";

export const adminAppNotificationPersistenceVersion =
  "stage-admin-app-notification-outbox-api-v1";

export const adminAppNotificationTypes = [
  "booking_workflow",
  "driver_status",
  "completed_closeout",
  "monthly_billing",
  "system_notice",
] as const;

export const adminAppNotificationStatuses = [
  "queued",
  "read",
  "dismissed",
  "archived",
  "blocked",
] as const;

export const adminAppNotificationPriorities = ["low", "normal", "high", "urgent"] as const;

export type AdminAppNotificationType = (typeof adminAppNotificationTypes)[number];
export type AdminAppNotificationStatus = (typeof adminAppNotificationStatuses)[number];
export type AdminAppNotificationPriority = (typeof adminAppNotificationPriorities)[number];

export type AdminAppNotificationInput = {
  booking_reference: string | null;
  event_key: string | null;
  notification_status: AdminAppNotificationStatus;
  notification_type: AdminAppNotificationType;
  priority: AdminAppNotificationPriority;
  safe_context: Record<string, unknown>;
  safe_message: string;
  safe_title: string;
  workflow_area: string | null;
};

export type AdminAppNotificationLoadParams = {
  booking_reference: string | null;
  limit: number;
  notification_status: AdminAppNotificationStatus | null;
  notification_type: AdminAppNotificationType | null;
  page: number;
  priority: AdminAppNotificationPriority | null;
};

export type AdminAppNotificationUpdateStatus = Extract<
  AdminAppNotificationStatus,
  "archived" | "dismissed" | "read"
>;

export type AdminAppNotificationUpdateInput = {
  notification_id: string;
  notification_status: AdminAppNotificationUpdateStatus;
};

export type AdminAppNotificationRecord = AdminAppNotificationInput & {
  actor_label: string | null;
  actor_role: "admin" | "dispatcher" | "system";
  created_at: string | null;
  delivery_surface: "admin_app";
  id: string | null;
  source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
  updated_at: string | null;
};

export type DriverJobIssueAdminAppNotificationInput = {
  booking_reference: string | null;
  driver_status: string | null;
  issue_label: string;
  issue_type: string;
};

export type CustomerBookingRequestAdminAppNotificationInput = {
  booking_reference: string | null;
};

export type CustomerBookingChangeRequestAdminAppNotificationInput = {
  booking_reference: string | null;
  current_dropoff_location: string | null;
  current_pickup_at: string | null;
  current_pickup_location: string | null;
  current_service_type: string | null;
  passenger_name: string | null;
  request_kind: "amendment" | "cancellation";
  request_note: string | null;
  requested_dropoff_location: string | null;
  requested_pickup_date: string | null;
  requested_pickup_location: string | null;
  requested_pickup_time: string | null;
};

export type AdminAppNotificationPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_notification_count: number;
};

export type AdminAppNotificationLoadResult = {
  notifications: AdminAppNotificationRecord[];
  pagination: AdminAppNotificationPagination;
  version: typeof adminAppNotificationPersistenceVersion;
};

type UnknownRecord = Record<string, unknown>;

const defaultNotificationLimit = 25;
const maxNotificationLimit = 100;
const maxNotificationPage = 1000;
const maxReadRows = 500;
const maxBookingReferenceLength = 120;
const maxEventKeyLength = 160;
const maxNotificationIdLength = 120;
const maxSafeContextJsonLength = 2000;
const maxSafeMessageLength = 1000;
const maxSafeTitleLength = 160;
const maxWorkflowAreaLength = 80;
const notificationSelect =
  "id, notification_type, notification_status, priority, delivery_surface, event_key, booking_reference, workflow_area, safe_title, safe_message, safe_context, source_surface, actor_role, actor_label, created_at, updated_at";
const disabledNotificationPersistenceError =
  "Admin app notification persistence is not enabled on this server.";
const safeNotificationConfigError =
  "Admin app notification persistence configuration is not ready.";
const safeNotificationActorError =
  "Admin app notification persistence requires a verified internal boundary.";
const safeNotificationServerSessionActorError =
  "Admin app notification persistence requires a verified admin or dispatcher server session.";
const safeNotificationCreateError = "Admin app notification create failed safely.";
const safeNotificationLoadError = "Admin app notification load failed safely.";
const safeNotificationUpdateError = "Admin app notification status update failed safely.";
const allowedNotificationTypes = new Set<string>(adminAppNotificationTypes);
const allowedNotificationStatuses = new Set<string>(adminAppNotificationStatuses);
const allowedNotificationUpdateStatuses = new Set<string>([
  "archived",
  "dismissed",
  "read",
]);
const allowedNotificationPriorities = new Set<string>(adminAppNotificationPriorities);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedTopLevelFields = new Set([
  "booking_reference",
  "event_key",
  "notification_status",
  "notification_type",
  "priority",
  "safe_context",
  "safe_message",
  "safe_title",
  "workflow_area",
]);
const allowedUpdateTopLevelFields = new Set([
  "notification_id",
  "notification_status",
]);
const forbiddenNotificationFragments = [
  "amount_due",
  "auth_link",
  "billing_amount",
  "billing_rate",
  "contact_email",
  "contact_phone",
  "customer_auth",
  "customer_charge",
  "customer_email",
  "customer_phone",
  "customer_price",
  "debug",
  "delivery_payload",
  "driver_auth",
  "driver_payout",
  "external_delivery",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "live_location",
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
  "send_log",
  "send_state",
  "server_secret",
  "service_role",
  "sms",
  "stripe",
  "telegram",
  "token",
  "whatsapp",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasOwn(record: UnknownRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenNotificationFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenNotificationFragments.some((fragment) => normalized.includes(fragment));
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
    const keyLeaks = includesForbiddenNotificationFragment(key) ? [currentPath] : [];

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

  return includesForbiddenNotificationFragment(text) ? [text] : [];
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenNotificationFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function optionalSafeText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return safeText(value, maxLength);
}

function validNotificationType(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedNotificationTypes.has(cleaned)
    ? (cleaned as AdminAppNotificationType)
    : null;
}

function validNotificationStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedNotificationStatuses.has(cleaned)
    ? (cleaned as AdminAppNotificationStatus)
    : null;
}

function validNotificationUpdateStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedNotificationUpdateStatuses.has(cleaned)
    ? (cleaned as AdminAppNotificationUpdateStatus)
    : null;
}

function validNotificationPriority(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedNotificationPriorities.has(cleaned)
    ? (cleaned as AdminAppNotificationPriority)
    : null;
}

function positiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxValue ? parsed : null;
}

function safeObject(value: unknown, maxLength: number) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const text = JSON.stringify(value);

  if (
    text.length > maxLength ||
    findForbiddenFieldNames(value).length > 0 ||
    findForbiddenTextValues(value).length > 0
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function unsafeNotificationResult<T>(): AdminBookingResult<T> {
  return {
    error: "Admin app notification details include unsupported or unsafe fields.",
    ok: false,
    status: 400,
  };
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
    !["admin_api", "system"].includes(actor.source_surface)
  ) {
    return {
      error: safeNotificationActorError,
      ok: false,
      status: 403,
    };
  }

  if (
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true" &&
    (actor.boundary_mode !== "server-session-role-surface" ||
      !["admin", "dispatcher"].includes(actor.actor_role) ||
      actor.source_surface !== "admin_api")
  ) {
    return {
      error: safeNotificationServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyNotificationSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledNotificationPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeNotificationConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeNotificationConfigError,
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
      error: safeNotificationConfigError,
      ok: false,
      status: 503,
    };
  }
}

function getServerOnlySystemNotificationSupabaseClient(): AdminBookingResult<SupabaseClient> {
  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledNotificationPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeNotificationConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeNotificationConfigError,
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
      error: safeNotificationConfigError,
      ok: false,
      status: 503,
    };
  }
}

function getServerOnlyDriverIssueNotificationSupabaseClient(): AdminBookingResult<SupabaseClient> {
  return getServerOnlySystemNotificationSupabaseClient();
}

function normalizeNotificationRecord(row: UnknownRecord): AdminAppNotificationRecord {
  return {
    actor_label: textOrNull(row.actor_label),
    actor_role: allowedActorRoles.has(String(row.actor_role))
      ? (String(row.actor_role) as "admin" | "dispatcher" | "system")
      : "system",
    booking_reference: textOrNull(row.booking_reference),
    created_at: textOrNull(row.created_at),
    delivery_surface: "admin_app",
    event_key: textOrNull(row.event_key),
    id: textOrNull(row.id),
    notification_status: validNotificationStatus(row.notification_status) || "blocked",
    notification_type: validNotificationType(row.notification_type) || "system_notice",
    priority: validNotificationPriority(row.priority) || "normal",
    safe_context: asRecord(row.safe_context),
    safe_message: safeText(row.safe_message, maxSafeMessageLength) || "",
    safe_title: safeText(row.safe_title, maxSafeTitleLength) || "",
    source_surface: allowedSourceSurfaces.has(String(row.source_surface))
      ? (String(row.source_surface) as "admin_api" | "admin_dashboard" | "migration" | "system")
      : "system",
    updated_at: textOrNull(row.updated_at),
    workflow_area: textOrNull(row.workflow_area),
  };
}

function filterNotifications(
  notifications: AdminAppNotificationRecord[],
  params: AdminAppNotificationLoadParams,
) {
  return notifications.filter((notification) => {
    if (
      params.booking_reference &&
      notification.booking_reference !== params.booking_reference
    ) {
      return false;
    }

    if (
      params.notification_status &&
      notification.notification_status !== params.notification_status
    ) {
      return false;
    }

    if (
      params.notification_type &&
      notification.notification_type !== params.notification_type
    ) {
      return false;
    }

    return !params.priority || notification.priority === params.priority;
  });
}

function paginateNotifications(
  notifications: AdminAppNotificationRecord[],
  params: AdminAppNotificationLoadParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return notifications.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  notifications: AdminAppNotificationRecord[],
  params: AdminAppNotificationLoadParams,
): AdminAppNotificationPagination {
  const pageCount =
    notifications.length > 0 ? Math.ceil(notifications.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_notification_count: notifications.length,
  };
}

export function parseAdminAppNotificationLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminAppNotificationLoadParams> {
  const bookingReferenceValue = readParamsValue(params, "booking_reference");
  const bookingReference =
    bookingReferenceValue === undefined ||
    bookingReferenceValue === null ||
    bookingReferenceValue === ""
      ? null
      : safeText(bookingReferenceValue, maxBookingReferenceLength);

  if (bookingReferenceValue && !bookingReference) {
    return {
      error: "Malformed admin app notification booking_reference rejected.",
      ok: false,
      status: 400,
    };
  }

  const notificationStatusValue = readParamsValue(params, "notification_status");
  const notificationStatus =
    notificationStatusValue === undefined ||
    notificationStatusValue === null ||
    notificationStatusValue === ""
      ? null
      : validNotificationStatus(notificationStatusValue);

  if (notificationStatusValue && !notificationStatus) {
    return {
      error: "Malformed admin app notification status rejected.",
      ok: false,
      status: 400,
    };
  }

  const notificationTypeValue = readParamsValue(params, "notification_type");
  const notificationType =
    notificationTypeValue === undefined ||
    notificationTypeValue === null ||
    notificationTypeValue === ""
      ? null
      : validNotificationType(notificationTypeValue);

  if (notificationTypeValue && !notificationType) {
    return {
      error: "Malformed admin app notification type rejected.",
      ok: false,
      status: 400,
    };
  }

  const priorityValue = readParamsValue(params, "priority");
  const priority =
    priorityValue === undefined || priorityValue === null || priorityValue === ""
      ? null
      : validNotificationPriority(priorityValue);

  if (priorityValue && !priority) {
    return {
      error: "Malformed admin app notification priority rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(
    readParamsValue(params, "limit"),
    defaultNotificationLimit,
    maxNotificationLimit,
  );

  if (!limit) {
    return {
      error: "Malformed admin app notification limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxNotificationPage);

  if (!page) {
    return {
      error: "Malformed admin app notification page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      limit,
      notification_status: notificationStatus,
      notification_type: notificationType,
      page,
      priority,
    },
    ok: true,
  };
}

export function parseAdminAppNotificationCreatePayload(
  value: unknown,
): AdminBookingResult<AdminAppNotificationInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedTopLevelFields, "notification").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return unsafeNotificationResult();
  }

  const bookingReference = optionalSafeText(
    record.booking_reference,
    maxBookingReferenceLength,
  );
  const eventKey = optionalSafeText(record.event_key, maxEventKeyLength);
  const notificationStatus = validNotificationStatus(record.notification_status);
  const notificationType = validNotificationType(record.notification_type);
  const priority = validNotificationPriority(record.priority);
  const safeContext = safeObject(record.safe_context, maxSafeContextJsonLength);
  const safeMessage = safeText(record.safe_message, maxSafeMessageLength);
  const safeTitle = safeText(record.safe_title, maxSafeTitleLength);
  const workflowArea = optionalSafeText(record.workflow_area, maxWorkflowAreaLength);

  if (
    (hasOwn(record, "booking_reference") && record.booking_reference && !bookingReference) ||
    (hasOwn(record, "event_key") && record.event_key && !eventKey) ||
    !notificationStatus ||
    !notificationType ||
    !priority ||
    !safeContext ||
    !safeMessage ||
    !safeTitle ||
    (hasOwn(record, "workflow_area") && record.workflow_area && !workflowArea)
  ) {
    return {
      error: "Admin app notification details are malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      event_key: eventKey,
      notification_status: notificationStatus,
      notification_type: notificationType,
      priority,
      safe_context: safeContext,
      safe_message: safeMessage,
      safe_title: safeTitle,
      workflow_area: workflowArea,
    },
    ok: true,
  };
}

export function parseAdminAppNotificationUpdatePayload(
  value: unknown,
): AdminBookingResult<AdminAppNotificationUpdateInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedUpdateTopLevelFields, "notification").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return unsafeNotificationResult();
  }

  const notificationId = safeText(record.notification_id, maxNotificationIdLength);
  const notificationStatus = validNotificationUpdateStatus(record.notification_status);

  if (!notificationId || !notificationStatus) {
    return {
      error: "Admin app notification status update details are malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      notification_id: notificationId,
      notification_status: notificationStatus,
    },
    ok: true,
  };
}

export async function loadAdminAppNotifications(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminAppNotificationLoadResult>> {
  const parsed = parseAdminAppNotificationLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyNotificationSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("admin_app_notification_outbox")
    .select(notificationSelect)
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safeNotificationLoadError, 500, error);
  }

  const notifications = asArray(data)
    .map(asRecord)
    .map(normalizeNotificationRecord)
    .filter((notification) => notification.safe_title && notification.safe_message)
    .sort((first, second) =>
      String(second.created_at || "").localeCompare(String(first.created_at || "")),
    );
  const filteredNotifications = filterNotifications(notifications, parsed.data);

  return {
    data: {
      notifications: paginateNotifications(filteredNotifications, parsed.data),
      pagination: buildPagination(filteredNotifications, parsed.data),
      version: adminAppNotificationPersistenceVersion,
    },
    ok: true,
  };
}

export async function createAdminAppNotification(
  input: AdminAppNotificationInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminAppNotificationRecord>> {
  const clientResult = getServerOnlyNotificationSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    ...input,
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    delivery_surface: "admin_app",
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("admin_app_notification_outbox")
    .insert(payload)
    .select(notificationSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeNotificationCreateError, 500, error);
  }

  return {
    data: normalizeNotificationRecord(asRecord(data)),
    ok: true,
  };
}

export async function createDriverJobIssueAdminAppNotification(
  input: DriverJobIssueAdminAppNotificationInput,
): Promise<AdminBookingResult<AdminAppNotificationRecord>> {
  const parsed = parseAdminAppNotificationCreatePayload({
    booking_reference: input.booking_reference,
    event_key: [
      "driver-issue-alert",
      String(input.booking_reference || "unassigned").replace(/[^A-Za-z0-9._:-]+/g, "-"),
      input.issue_type,
      Date.now(),
    ].join("-"),
    notification_status: "queued",
    notification_type: "driver_status",
    priority: input.issue_type === "accident_or_safety_concern" ? "urgent" : "high",
    safe_context: {
      driver_status: input.driver_status || "not_provided",
      issue_label: input.issue_label,
      issue_type: input.issue_type,
      workflow_area: "driver_issue_alert",
    },
    safe_message: `Driver reported: ${input.issue_label}.`,
    safe_title: "Driver issue alert",
    workflow_area: "driver_issue_alert",
  });

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyDriverIssueNotificationSupabaseClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    ...parsed.data,
    actor_label: "driver-job-issue-alert",
    actor_role: "system",
    delivery_surface: "admin_app",
    source_surface: "system",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("admin_app_notification_outbox")
    .insert(payload)
    .select(notificationSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeNotificationCreateError, 500, error);
  }

  return {
    data: normalizeNotificationRecord(asRecord(data)),
    ok: true,
  };
}

export async function createCustomerBookingRequestAdminAppNotification(
  input: CustomerBookingRequestAdminAppNotificationInput,
): Promise<AdminBookingResult<AdminAppNotificationRecord>> {
  const bookingReference = optionalSafeText(input.booking_reference, maxBookingReferenceLength);
  const parsed = parseAdminAppNotificationCreatePayload({
    booking_reference: bookingReference,
    event_key: [
      "new-booking-request",
      String(bookingReference || "unassigned").replace(/[^A-Za-z0-9._:-]+/g, "-"),
      Date.now(),
    ].join("-"),
    notification_status: "queued",
    notification_type: "booking_workflow",
    priority: "high",
    safe_context: {
      surface: "customer_booking_request",
      workflow_area: "new_booking_request",
    },
    safe_message: "New booking request received. Open Bookings to review.",
    safe_title: "New booking request",
    workflow_area: "new_booking_request",
  });

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlySystemNotificationSupabaseClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    ...parsed.data,
    actor_label: "customer-booking-request",
    actor_role: "system",
    delivery_surface: "admin_app",
    source_surface: "system",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("admin_app_notification_outbox")
    .insert(payload)
    .select(notificationSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeNotificationCreateError, 500, error);
  }

  return {
    data: normalizeNotificationRecord(asRecord(data)),
    ok: true,
  };
}

export async function createCustomerBookingChangeRequestAdminAppNotification(
  input: CustomerBookingChangeRequestAdminAppNotificationInput,
): Promise<AdminBookingResult<AdminAppNotificationRecord>> {
  const bookingReference = optionalSafeText(input.booking_reference, maxBookingReferenceLength);
  const requestKind = input.request_kind === "cancellation" ? "cancellation" : "amendment";
  const requestLabel = requestKind === "cancellation" ? "Cancellation" : "Amendment";
  const parsed = parseAdminAppNotificationCreatePayload({
    booking_reference: bookingReference,
    event_key: [
      "booking-change-request",
      requestKind,
      String(bookingReference || "unassigned").replace(/[^A-Za-z0-9._:-]+/g, "-"),
      Date.now(),
    ].join("-"),
    notification_status: "queued",
    notification_type: "booking_workflow",
    priority: "high",
    safe_context: {
      current_dropoff_location: input.current_dropoff_location || "not_provided",
      current_pickup_at: input.current_pickup_at || "not_provided",
      current_pickup_location: input.current_pickup_location || "not_provided",
      current_service_type: input.current_service_type || "not_provided",
      passenger_name: input.passenger_name || "not_provided",
      request_kind: requestKind,
      request_note: input.request_note || "not_provided",
      requested_dropoff_location: input.requested_dropoff_location || "not_requested",
      requested_pickup_date: input.requested_pickup_date || "not_requested",
      requested_pickup_location: input.requested_pickup_location || "not_requested",
      requested_pickup_time: input.requested_pickup_time || "not_requested",
      surface: "customer_booking_change_request",
      workflow_area: "customer_booking_change_request",
    },
    safe_message:
      `${requestLabel} request received. Load the booking, review the requested values, then use Update + Cal only after approval.`,
    safe_title: "Customer booking change request",
    workflow_area: "customer_booking_change_request",
  });

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlySystemNotificationSupabaseClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    ...parsed.data,
    actor_label: "customer-booking-change-request",
    actor_role: "system",
    delivery_surface: "admin_app",
    source_surface: "system",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("admin_app_notification_outbox")
    .insert(payload)
    .select(notificationSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeNotificationCreateError, 500, error);
  }

  return {
    data: normalizeNotificationRecord(asRecord(data)),
    ok: true,
  };
}

export async function updateAdminAppNotificationStatus(
  input: AdminAppNotificationUpdateInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminAppNotificationRecord>> {
  const clientResult = getServerOnlyNotificationSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    notification_status: input.notification_status,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("admin_app_notification_outbox")
    .update(payload)
    .eq("id", input.notification_id)
    .eq("notification_status", "queued")
    .select(notificationSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeNotificationUpdateError, 500, error);
  }

  const notification = normalizeNotificationRecord(asRecord(data));

  if (!notification.id) {
    return {
      error: safeNotificationUpdateError,
      ok: false,
      status: 404,
    };
  }

  return {
    data: notification,
    ok: true,
  };
}
