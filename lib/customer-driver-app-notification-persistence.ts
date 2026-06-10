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
import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpiryOutsideAllowedWindow,
  isDriverJobLinkExpired,
} from "./driver-job-link";
import {
  isProductionDriverJobLinkMode,
  productionDriverJobLinksConfigured,
} from "./driver-job-link-mode";

export const customerDriverAppNotificationPersistenceVersion =
  "stage-customer-driver-app-notification-api-v1";

export const customerDriverAppNotificationSurfaces = ["customer_app", "driver_app"] as const;
export const customerDriverAppNotificationTypes = [
  "booking_status",
  "driver_status",
  "trip_update",
  "system_notice",
] as const;
export const customerDriverAppNotificationStatuses = [
  "queued",
  "read",
  "dismissed",
  "archived",
  "blocked",
] as const;
export const customerDriverAppNotificationPriorities = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export type CustomerDriverAppNotificationSurface =
  (typeof customerDriverAppNotificationSurfaces)[number];
export type CustomerDriverAppNotificationType =
  (typeof customerDriverAppNotificationTypes)[number];
export type CustomerDriverAppNotificationStatus =
  (typeof customerDriverAppNotificationStatuses)[number];
export type CustomerDriverAppNotificationPriority =
  (typeof customerDriverAppNotificationPriorities)[number];
export type CustomerDriverAppNotificationUpdateStatus = Extract<
  CustomerDriverAppNotificationStatus,
  "archived" | "dismissed" | "read"
>;

export type CustomerDriverAppNotificationInput = {
  booking_reference: string | null;
  delivery_surface: CustomerDriverAppNotificationSurface;
  driver_job_link_id: string | null;
  event_key: string | null;
  notification_status: CustomerDriverAppNotificationStatus;
  notification_type: CustomerDriverAppNotificationType;
  priority: CustomerDriverAppNotificationPriority;
  safe_context: Record<string, unknown>;
  safe_message: string;
  safe_title: string;
  workflow_area: string | null;
};

export type CustomerDriverAppNotificationLoadParams = {
  booking_reference: string | null;
  delivery_surface: CustomerDriverAppNotificationSurface | null;
  limit: number;
  notification_status: CustomerDriverAppNotificationStatus | null;
  notification_type: CustomerDriverAppNotificationType | null;
  page: number;
  priority: CustomerDriverAppNotificationPriority | null;
};

export type CustomerDriverAppNotificationUpdateInput = {
  delivery_surface: CustomerDriverAppNotificationSurface | null;
  notification_id: string;
  notification_status: CustomerDriverAppNotificationUpdateStatus;
};

export type CustomerDriverAppNotificationRecord =
  CustomerDriverAppNotificationInput & {
    actor_label: string | null;
    actor_role: "admin" | "customer" | "dispatcher" | "driver" | "system";
    created_at: string | null;
    id: string | null;
    source_surface: "admin_api" | "customer_api" | "driver_api" | "migration" | "system";
    updated_at: string | null;
  };

export type CustomerDriverAppNotificationSafeRecord = Omit<
  CustomerDriverAppNotificationRecord,
  "actor_label" | "actor_role" | "driver_job_link_id" | "event_key" | "source_surface"
>;

export type CustomerDriverAppNotificationPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_notification_count: number;
};

export type CustomerDriverAppNotificationLoadResult = {
  notifications: CustomerDriverAppNotificationSafeRecord[];
  pagination: CustomerDriverAppNotificationPagination;
  version: typeof customerDriverAppNotificationPersistenceVersion;
};

type UnknownRecord = Record<string, unknown>;
type NotificationClient = Pick<SupabaseClient, "from">;

type DriverLinkScope = {
  booking_reference: string;
  id: string | null;
};

const notificationTable = "customer_driver_app_notification_outbox";
const driverJobLinkSelect = "id, booking_reference, link_status, expires_at, revoked_at";
const notificationSelect =
  "id, notification_type, notification_status, priority, delivery_surface, event_key, booking_reference, driver_job_link_id, workflow_area, safe_title, safe_message, safe_context, source_surface, actor_role, actor_label, created_at, updated_at";
const defaultNotificationLimit = 25;
const maxNotificationLimit = 100;
const maxNotificationPage = 1000;
const maxReadRows = 500;
const maxBookingReferenceLength = 120;
const maxDriverJobLinkIdLength = 120;
const maxEventKeyLength = 180;
const maxNotificationIdLength = 120;
const maxSafeContextJsonLength = 2000;
const maxSafeMessageLength = 1000;
const maxSafeTitleLength = 160;
const maxWorkflowAreaLength = 80;
const disabledNotificationPersistenceError =
  "Customer/driver app notification persistence is not enabled on this server.";
const disabledDriverNotificationPersistenceError =
  "Driver app notification persistence is not enabled on this server.";
const customerAuthRequiredError =
  "Customer app notifications require secure customer account auth before saved notifications can be read.";
const safeNotificationConfigError =
  "Customer/driver app notification persistence configuration is not ready.";
const safeNotificationActorError =
  "Customer/driver app notification persistence requires a verified internal boundary.";
const safeNotificationServerSessionActorError =
  "Customer/driver app notification persistence requires a verified admin or dispatcher server session.";
const safeNotificationCreateError = "Customer/driver app notification create failed safely.";
const safeNotificationLoadError = "Customer/driver app notification load failed safely.";
const safeNotificationUpdateError = "Customer/driver app notification status update failed safely.";
const allowedSurfaces = new Set<string>(customerDriverAppNotificationSurfaces);
const allowedTypes = new Set<string>(customerDriverAppNotificationTypes);
const allowedStatuses = new Set<string>(customerDriverAppNotificationStatuses);
const allowedUpdateStatuses = new Set<string>(["archived", "dismissed", "read"]);
const allowedPriorities = new Set<string>(customerDriverAppNotificationPriorities);
const allowedActorRoles = new Set(["admin", "customer", "dispatcher", "driver", "system"]);
const allowedSourceSurfaces = new Set([
  "admin_api",
  "customer_api",
  "driver_api",
  "migration",
  "system",
]);
const allowedCreateFields = new Set([
  "booking_reference",
  "delivery_surface",
  "driver_job_link_id",
  "event_key",
  "notification_status",
  "notification_type",
  "priority",
  "safe_context",
  "safe_message",
  "safe_title",
  "workflow_area",
]);
const allowedUpdateFields = new Set([
  "delivery_surface",
  "notification_id",
  "notification_status",
]);
const forbiddenNotificationFragments = [
  "amount_due",
  "auth_link",
  "billing",
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

function includesForbiddenFragment(value: string) {
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
    const keyLeaks = includesForbiddenFragment(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function findForbiddenTextValues(value: unknown, path = ""): string[] {
  if (typeof value === "string") {
    return includesForbiddenFragment(value) ? [path || "value"] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenTextValues(item, `${path}[${index}]`));
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as UnknownRecord).flatMap(([key, nestedValue]) =>
    findForbiddenTextValues(nestedValue, path ? `${path}.${key}` : key),
  );
}

function unknownKeys(record: UnknownRecord, allowed: Set<string>) {
  return Object.keys(record).filter((key) => !allowed.has(key));
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeIdentifier(value: unknown, maxLength: number) {
  const cleaned = safeText(value, maxLength);

  if (!cleaned) {
    return null;
  }

  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(cleaned) ? cleaned : null;
}

function safeUuidOrNull(value: unknown) {
  const cleaned = safeText(value, maxDriverJobLinkIdLength);

  if (!cleaned) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : null;
}

function safeJsonObject(value: unknown, allowedLength = maxSafeContextJsonLength) {
  const record = asRecord(value);
  const json = JSON.stringify(record);

  if (
    !json ||
    json.length > allowedLength ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return {};
  }

  return record;
}

function safeDateText(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && cleaned.length <= 80 ? cleaned : null;
}

function toInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return null;
}

function validSurface(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedSurfaces.has(cleaned)
    ? (cleaned as CustomerDriverAppNotificationSurface)
    : null;
}

function validType(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedTypes.has(cleaned)
    ? (cleaned as CustomerDriverAppNotificationType)
    : null;
}

function validStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedStatuses.has(cleaned)
    ? (cleaned as CustomerDriverAppNotificationStatus)
    : null;
}

function validUpdateStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedUpdateStatuses.has(cleaned)
    ? (cleaned as CustomerDriverAppNotificationUpdateStatus)
    : null;
}

function validPriority(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedPriorities.has(cleaned)
    ? (cleaned as CustomerDriverAppNotificationPriority)
    : null;
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !["admin", "dispatcher", "system"].includes(actor.actor_role) ||
    !allowedSourceSurfaces.has(actor.source_surface) ||
    !textOrNull(actor.actor_label)
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

function safeAdapterFailure(
  error: string,
  status: number,
  rawError?: unknown,
): AdminBookingResult<never> {
  const message = textOrNull(asRecord(rawError).message) || textOrNull(rawError);
  let category: AdminBookingPersistenceSafeErrorCategory = "unknown_adapter_failure";

  if (/permission|policy|rls|forbidden/i.test(message || "")) {
    category = "permission_or_rls_denied";
  } else if (/column|schema/i.test(message || "")) {
    category = "column_missing";
  } else if (/relation|table|not exist/i.test(message || "")) {
    category = "table_unreachable";
  }

  return {
    category,
    error,
    ok: false,
    status,
  };
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function getAdminNotificationClient(
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

  const readiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!readiness.ok) {
    return {
      error: safeNotificationConfigError,
      ok: false,
      status: readiness.status,
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
      error: safeNotificationConfigError,
      ok: false,
      status: 503,
    };
  }
}

function getDriverNotificationClient(): AdminBookingResult<SupabaseClient> {
  if (!isProductionDriverJobLinkMode() || !productionDriverJobLinksConfigured()) {
    return {
      error: disabledDriverNotificationPersistenceError,
      ok: false,
      status: 503,
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
      error: safeNotificationConfigError,
      ok: false,
      status: 503,
    };
  }
}

function unsafeNotificationResult(): AdminBookingResult<never> {
  return {
    error: "Customer/driver app notification includes fields outside the approved safe display scope.",
    ok: false,
    status: 400,
  };
}

export function customerAppNotificationsRequireAuthResult(): AdminBookingResult<never> {
  return {
    error: customerAuthRequiredError,
    ok: false,
    status: 403,
  };
}

export function parseCustomerDriverAppNotificationCreatePayload(
  value: unknown,
): AdminBookingResult<CustomerDriverAppNotificationInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedCreateFields).length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return unsafeNotificationResult();
  }

  const deliverySurface = validSurface(record.delivery_surface);
  const notificationType = validType(record.notification_type);
  const notificationStatus = validStatus(record.notification_status) || "queued";
  const priority = validPriority(record.priority) || "normal";
  const safeTitle = safeText(record.safe_title, maxSafeTitleLength);
  const safeMessage = safeText(record.safe_message, maxSafeMessageLength);
  const bookingReference = safeIdentifier(record.booking_reference, maxBookingReferenceLength);
  const driverJobLinkId = safeUuidOrNull(record.driver_job_link_id);
  const eventKey = safeIdentifier(record.event_key, maxEventKeyLength);
  const workflowArea = safeIdentifier(record.workflow_area, maxWorkflowAreaLength);
  const safeContext = safeJsonObject(record.safe_context);

  if (!deliverySurface || !notificationType || !safeTitle || !safeMessage) {
    return {
      error: "Customer/driver app notification create details are malformed.",
      ok: false,
      status: 400,
    };
  }

  if (deliverySurface === "driver_app" && !driverJobLinkId && !bookingReference) {
    return {
      error: "Driver app notification requires a safe booking reference or driver job link id.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      delivery_surface: deliverySurface,
      driver_job_link_id: driverJobLinkId,
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

export function parseCustomerDriverAppNotificationLoadParams(
  input: URLSearchParams | UnknownRecord,
): CustomerDriverAppNotificationLoadParams {
  const params = input instanceof URLSearchParams ? input : new URLSearchParams(input as Record<string, string>);
  const rawLimit = toInteger(params.get("limit"));
  const rawPage = toInteger(params.get("page"));
  const limit =
    rawLimit && rawLimit > 0 ? Math.min(rawLimit, maxNotificationLimit) : defaultNotificationLimit;
  const page = rawPage && rawPage > 0 ? Math.min(rawPage, maxNotificationPage) : 1;

  return {
    booking_reference: safeIdentifier(params.get("booking_reference"), maxBookingReferenceLength),
    delivery_surface: validSurface(params.get("delivery_surface")),
    limit,
    notification_status: validStatus(params.get("notification_status")),
    notification_type: validType(params.get("notification_type")),
    page,
    priority: validPriority(params.get("priority")),
  };
}

export function parseCustomerDriverAppNotificationUpdatePayload(
  value: unknown,
): AdminBookingResult<CustomerDriverAppNotificationUpdateInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedUpdateFields).length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return unsafeNotificationResult();
  }

  const notificationId = safeIdentifier(record.notification_id, maxNotificationIdLength);
  const notificationStatus = validUpdateStatus(record.notification_status);
  const deliverySurface = validSurface(record.delivery_surface);

  if (!notificationId || !notificationStatus) {
    return {
      error: "Customer/driver app notification status update details are malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      delivery_surface: deliverySurface,
      notification_id: notificationId,
      notification_status: notificationStatus,
    },
    ok: true,
  };
}

function normalizeRecord(value: unknown): CustomerDriverAppNotificationRecord {
  const record = asRecord(value);
  const notificationType = validType(record.notification_type) || "system_notice";
  const notificationStatus = validStatus(record.notification_status) || "queued";
  const priority = validPriority(record.priority) || "normal";
  const deliverySurface = validSurface(record.delivery_surface) || "customer_app";
  const actorRole = textOrNull(record.actor_role);
  const sourceSurface = textOrNull(record.source_surface);

  return {
    actor_label: safeText(record.actor_label, 120),
    actor_role: allowedActorRoles.has(actorRole || "")
      ? (actorRole as CustomerDriverAppNotificationRecord["actor_role"])
      : "system",
    booking_reference: safeIdentifier(record.booking_reference, maxBookingReferenceLength),
    created_at: safeDateText(record.created_at),
    delivery_surface: deliverySurface,
    driver_job_link_id: safeUuidOrNull(record.driver_job_link_id),
    event_key: safeIdentifier(record.event_key, maxEventKeyLength),
    id: safeIdentifier(record.id, maxNotificationIdLength),
    notification_status: notificationStatus,
    notification_type: notificationType,
    priority,
    safe_context: safeJsonObject(record.safe_context),
    safe_message: safeText(record.safe_message, maxSafeMessageLength) || "",
    safe_title: safeText(record.safe_title, maxSafeTitleLength) || "",
    source_surface: allowedSourceSurfaces.has(sourceSurface || "")
      ? (sourceSurface as CustomerDriverAppNotificationRecord["source_surface"])
      : "system",
    updated_at: safeDateText(record.updated_at),
    workflow_area: safeIdentifier(record.workflow_area, maxWorkflowAreaLength),
  };
}

function toSafeRecord(
  record: CustomerDriverAppNotificationRecord,
): CustomerDriverAppNotificationSafeRecord {
  return {
    booking_reference: record.booking_reference,
    created_at: record.created_at,
    delivery_surface: record.delivery_surface,
    id: record.id,
    notification_status: record.notification_status,
    notification_type: record.notification_type,
    priority: record.priority,
    safe_context: record.safe_context,
    safe_message: record.safe_message,
    safe_title: record.safe_title,
    updated_at: record.updated_at,
    workflow_area: record.workflow_area,
  };
}

function buildPagination(
  records: CustomerDriverAppNotificationSafeRecord[],
  limit: number,
  page: number,
): CustomerDriverAppNotificationPagination {
  const total = records.length;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  return {
    has_next_page: page < pageCount,
    has_previous_page: page > 1,
    page,
    page_count: pageCount,
    page_size: limit,
    total_notification_count: total,
  };
}

function pageRecords<T>(records: T[], limit: number, page: number) {
  const offset = (page - 1) * limit;

  return records.slice(offset, offset + limit);
}

export async function createCustomerDriverAppNotification(
  input: CustomerDriverAppNotificationInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<CustomerDriverAppNotificationSafeRecord>> {
  const clientResult = getAdminNotificationClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    booking_reference: input.booking_reference,
    delivery_surface: input.delivery_surface,
    driver_job_link_id: input.driver_job_link_id,
    event_key: input.event_key,
    notification_status: input.notification_status,
    notification_type: input.notification_type,
    priority: input.priority,
    safe_context: input.safe_context,
    safe_message: input.safe_message,
    safe_title: input.safe_title,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
    workflow_area: input.workflow_area,
  };
  const { data, error } = await clientResult.data
    .from(notificationTable)
    .insert(payload)
    .select(notificationSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeNotificationCreateError, 500, error);
  }

  const notification = normalizeRecord(data);

  if (!notification.id) {
    return {
      error: safeNotificationCreateError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: toSafeRecord(notification),
    ok: true,
  };
}

export async function loadCustomerDriverAppNotifications(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<CustomerDriverAppNotificationLoadResult>> {
  const params = parseCustomerDriverAppNotificationLoadParams(input);
  const clientResult = getAdminNotificationClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  let query = clientResult.data
    .from(notificationTable)
    .select(notificationSelect)
    .order("created_at", { ascending: false })
    .limit(maxReadRows);

  if (params.delivery_surface) {
    query = query.eq("delivery_surface", params.delivery_surface);
  }

  if (params.notification_status) {
    query = query.eq("notification_status", params.notification_status);
  }

  if (params.notification_type) {
    query = query.eq("notification_type", params.notification_type);
  }

  if (params.priority) {
    query = query.eq("priority", params.priority);
  }

  if (params.booking_reference) {
    query = query.eq("booking_reference", params.booking_reference);
  }

  const { data, error } = await query;

  if (error) {
    return safeAdapterFailure(safeNotificationLoadError, 500, error);
  }

  const allRecords = asArray(data)
    .map(normalizeRecord)
    .map(toSafeRecord);

  return {
    data: {
      notifications: pageRecords(allRecords, params.limit, params.page),
      pagination: buildPagination(allRecords, params.limit, params.page),
      version: customerDriverAppNotificationPersistenceVersion,
    },
    ok: true,
  };
}

export async function updateCustomerDriverAppNotificationStatus(
  input: CustomerDriverAppNotificationUpdateInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<CustomerDriverAppNotificationSafeRecord>> {
  const clientResult = getAdminNotificationClient(actor);

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
  let query = clientResult.data
    .from(notificationTable)
    .update(payload)
    .eq("id", input.notification_id)
    .eq("notification_status", "queued");

  if (input.delivery_surface) {
    query = query.eq("delivery_surface", input.delivery_surface);
  }

  const { data, error } = await query.select(notificationSelect).single();

  if (error) {
    return safeAdapterFailure(safeNotificationUpdateError, 500, error);
  }

  const notification = normalizeRecord(data);

  if (!notification.id) {
    return {
      error: safeNotificationUpdateError,
      ok: false,
      status: 404,
    };
  }

  return {
    data: toSafeRecord(notification),
    ok: true,
  };
}

function safeHashToken(token: string) {
  try {
    return hashDriverJobLinkToken(token);
  } catch {
    return null;
  }
}

async function resolveDriverLinkScope(
  client: NotificationClient,
  token: string,
): Promise<AdminBookingResult<DriverLinkScope>> {
  const tokenHash = safeHashToken(token);

  if (!tokenHash) {
    return {
      error: "Driver app notification token is unauthorized.",
      ok: false,
      status: 401,
    };
  }

  const { data, error } = await client
    .from("driver_job_links")
    .select(driverJobLinkSelect)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    return safeAdapterFailure(safeNotificationLoadError, 500, error);
  }

  const row = asRecord(data);
  const bookingReference = safeIdentifier(row.booking_reference, maxBookingReferenceLength);
  const linkStatus = textOrNull(row.link_status);

  if (!bookingReference) {
    return {
      error: "Driver app notification token is unauthorized.",
      ok: false,
      status: 401,
    };
  }

  if (linkStatus === "revoked" || row.revoked_at) {
    return {
      error: "Driver app notification link is revoked.",
      ok: false,
      status: 403,
    };
  }

  if (
    linkStatus === "expired" ||
    isDriverJobLinkExpired(String(row.expires_at || "")) ||
    isDriverJobLinkExpiryOutsideAllowedWindow(String(row.expires_at || ""))
  ) {
    return {
      error: "Driver app notification link has expired.",
      ok: false,
      status: 410,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      id: safeUuidOrNull(row.id),
    },
    ok: true,
  };
}

export async function loadDriverAppNotificationsForToken(
  token: string,
  input: URLSearchParams | UnknownRecord,
): Promise<AdminBookingResult<CustomerDriverAppNotificationLoadResult>> {
  const params = parseCustomerDriverAppNotificationLoadParams(input);
  const clientResult = getDriverNotificationClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const linkResult = await resolveDriverLinkScope(clientResult.data, token);

  if (!linkResult.ok) {
    return linkResult;
  }

  let query = clientResult.data
    .from(notificationTable)
    .select(notificationSelect)
    .eq("delivery_surface", "driver_app")
    .eq("booking_reference", linkResult.data.booking_reference)
    .order("created_at", { ascending: false })
    .limit(maxReadRows);

  if (params.notification_status) {
    query = query.eq("notification_status", params.notification_status);
  } else {
    query = query.eq("notification_status", "queued");
  }

  const { data, error } = await query;

  if (error) {
    return safeAdapterFailure(safeNotificationLoadError, 500, error);
  }

  const allRecords = asArray(data)
    .map(normalizeRecord)
    .filter((record) => record.delivery_surface === "driver_app")
    .filter((record) => record.booking_reference === linkResult.data.booking_reference)
    .filter((record) => !record.driver_job_link_id || record.driver_job_link_id === linkResult.data.id)
    .map(toSafeRecord);

  return {
    data: {
      notifications: pageRecords(allRecords, params.limit, params.page),
      pagination: buildPagination(allRecords, params.limit, params.page),
      version: customerDriverAppNotificationPersistenceVersion,
    },
    ok: true,
  };
}

export async function updateDriverAppNotificationStatusForToken(
  token: string,
  input: CustomerDriverAppNotificationUpdateInput,
): Promise<AdminBookingResult<CustomerDriverAppNotificationSafeRecord>> {
  const clientResult = getDriverNotificationClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const linkResult = await resolveDriverLinkScope(clientResult.data, token);

  if (!linkResult.ok) {
    return linkResult;
  }

  if (!linkResult.data.id) {
    return {
      error: safeNotificationUpdateError,
      ok: false,
      status: 404,
    };
  }

  const payload = {
    actor_label: "verified_driver_job_link",
    actor_role: "driver",
    notification_status: input.notification_status,
    source_surface: "driver_api",
    updated_at: new Date().toISOString(),
  };
  const driverLinkNotificationScope = `driver_job_link_id.is.null,driver_job_link_id.eq.${linkResult.data.id}`;
  const { data, error } = await clientResult.data
    .from(notificationTable)
    .update(payload)
    .eq("id", input.notification_id)
    .eq("delivery_surface", "driver_app")
    .eq("booking_reference", linkResult.data.booking_reference)
    .or(driverLinkNotificationScope)
    .eq("notification_status", "queued")
    .select(notificationSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeNotificationUpdateError, 500, error);
  }

  const notification = normalizeRecord(data);

  if (
    !notification.id ||
    notification.delivery_surface !== "driver_app" ||
    notification.booking_reference !== linkResult.data.booking_reference ||
    (notification.driver_job_link_id && notification.driver_job_link_id !== linkResult.data.id)
  ) {
    return {
      error: safeNotificationUpdateError,
      ok: false,
      status: 404,
    };
  }

  return {
    data: toSafeRecord(notification),
    ok: true,
  };
}
