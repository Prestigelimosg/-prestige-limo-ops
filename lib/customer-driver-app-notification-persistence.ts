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
import { resolveExactTwoCustomerRuntimeSessionMap } from "./customer-runtime-session-map";

export const customerDriverAppNotificationPersistenceVersion =
  "stage-customer-driver-app-notification-api-v1";
export const customerInAppNotificationReadEvidenceVersion =
  "stage-customer-in-app-notification-read-evidence-v1";
export const customerInAppNotificationRuntimeVersion =
  "stage-customer-in-app-notification-runtime-v1";
export const customerDriverQuickRepliesRuntimeVersion =
  "stage-customer-driver-quick-replies-runtime-v1";

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

export type CustomerDriverQuickReplyTemplateKey =
  | "customer_at_lobby"
  | "customer_running_late"
  | "customer_wait_pickup"
  | "customer_cannot_find_car"
  | "driver_on_the_way"
  | "driver_arrived"
  | "driver_meet_pickup"
  | "driver_waiting_nearby";

export type CustomerDriverQuickReplyResult = {
  body: Record<string, unknown>;
  status: number;
};

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

export type CustomerInAppNotificationReadEvidenceRecord = {
  booking_reference: string | null;
  created_at: string | null;
  delivery_surface: "customer_app";
  notification_status: CustomerDriverAppNotificationStatus;
  notification_type: CustomerDriverAppNotificationType;
  priority: CustomerDriverAppNotificationPriority;
  safe_context: Record<string, unknown>;
  safe_message: string;
  safe_title: string;
  updated_at: string | null;
  workflow_area: string | null;
};

export type CustomerInAppNotificationReadEvidenceResult = {
  handled: boolean;
  body?: Record<string, unknown>;
  status?: number;
};

type UnknownRecord = Record<string, unknown>;
type NotificationClient = Pick<SupabaseClient, "from">;
type CustomerSavedBookingsSessionTokenSource =
  | "ambiguous-cookie"
  | "missing"
  | "request-cookie"
  | "request-header";
type ControlledCustomerRuntimeMode = "one-customer" | "small-allowlist";
type CustomerDriverQuickReplyDirection = "customer_to_driver" | "driver_to_customer";

type ControlledCustomerRuntimeGate = {
  account_allowlist: Set<string>;
  mode: ControlledCustomerRuntimeMode;
};

type DriverLinkScope = {
  booking_reference: string;
  id: string | null;
};

const notificationTable = "customer_driver_app_notification_outbox";
const customerAccountSelect = "customer_account_reference, account_status";
const bookingCustomerScopeSelect = "booking_reference, customer_id";
const driverJobLinkSelect = "id, booking_reference, link_status, expires_at, revoked_at";
const driverJobStatusEventQuickReplySelect = "status_value, occurred_at";
const notificationSelect =
  "id, notification_type, notification_status, priority, delivery_surface, event_key, booking_reference, driver_job_link_id, workflow_area, safe_title, safe_message, safe_context, source_surface, actor_role, actor_label, created_at, updated_at";
const customerInAppNotificationReadSelect =
  "notification_type, notification_status, priority, delivery_surface, booking_reference, workflow_area, safe_title, safe_message, safe_context, created_at, updated_at";
const defaultNotificationLimit = 25;
const defaultCustomerInAppNotificationReadLimit = 5;
const maxCustomerInAppNotificationReadLimit = 10;
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
const safeCustomerInAppReadConfigError =
  "Customer app notification read evidence configuration is not ready.";
const safeCustomerInAppReadError =
  "Customer app notification read failed safely.";
const customerInAppRuntimeDisabledError =
  "Controlled customer in-app notification runtime is not enabled for this customer.";
const customerInAppRuntimeConfigError =
  "Controlled customer in-app notification runtime configuration is not ready.";
const customerInAppRuntimeWriteTemplateError =
  "Customer app notification write is limited to the approved driver details ready template.";
const quickReplyDisabledError =
  "Customer/driver quick replies are not enabled on this server.";
const quickReplyConfigError =
  "Customer/driver quick replies configuration is not ready.";
const quickReplyMalformedError =
  "Customer/driver quick reply details are malformed.";
const quickReplyPostPobDisabledError =
  "Customer/driver quick replies are disabled after POB.";
const quickReplyCreateError = "Customer/driver quick reply create failed safely.";
const safeNotificationUpdateError = "Customer/driver app notification status update failed safely.";
const customerSavedBookingsSessionCookieName =
  "prestige_customer_saved_bookings_session";
const customerSavedBookingsFallbackSessionCookieName =
  "prestige_customer_session";
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
const allowedCustomerInAppNotificationReadQueryParams = new Set([
  "booking_reference",
  "limit",
  "page",
]);
const controlledCustomerRuntimeModes = new Set<ControlledCustomerRuntimeMode>([
  "one-customer",
  "small-allowlist",
]);
const customerDriverQuickRepliesMode = "controlled-runtime";
const customerToDriverQuickReplyTemplates = {
  customer_at_lobby: "I am at the lobby.",
  customer_cannot_find_car: "I cannot find the car.",
  customer_running_late: "I am running 5 minutes late.",
  customer_wait_pickup: "Please wait at pickup point.",
} as const;
const driverToCustomerQuickReplyTemplates = {
  driver_arrived: "I have arrived.",
  driver_meet_pickup: "Please meet me at pickup point.",
  driver_on_the_way: "I am on the way.",
  driver_waiting_nearby: "I am waiting nearby.",
} as const;
const customerToDriverQuickReplyTemplateKeys = new Set<string>(
  Object.keys(customerToDriverQuickReplyTemplates),
);
const driverToCustomerQuickReplyTemplateKeys = new Set<string>(
  Object.keys(driverToCustomerQuickReplyTemplates),
);
const maxControlledCustomerRuntimeAllowlistEntries = 5;
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

function parseControlledCustomerRuntimeMode(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && controlledCustomerRuntimeModes.has(cleaned as ControlledCustomerRuntimeMode)
    ? (cleaned as ControlledCustomerRuntimeMode)
    : null;
}

function parseControlledCustomerAccountAllowlist(value: unknown) {
  const raw = textOrNull(value);

  if (!raw) {
    return null;
  }

  const entries = raw
    .split(/[\s,]+/)
    .map((entry) => safeIdentifier(entry, maxBookingReferenceLength))
    .filter((entry): entry is string => Boolean(entry));
  const uniqueEntries = [...new Set(entries)];

  if (
    uniqueEntries.length === 0 ||
    uniqueEntries.length > maxControlledCustomerRuntimeAllowlistEntries
  ) {
    return null;
  }

  return new Set(uniqueEntries);
}

function resolveControlledCustomerInAppNotificationRuntimeGate(): AdminBookingResult<ControlledCustomerRuntimeGate> {
  if (process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED !== "true") {
    return {
      error: customerInAppRuntimeDisabledError,
      ok: false,
      status: 403,
    };
  }

  const mode = parseControlledCustomerRuntimeMode(
    process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE,
  );
  const accountAllowlist = parseControlledCustomerAccountAllowlist(
    process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST,
  );

  if (!mode || !accountAllowlist) {
    return {
      error: customerInAppRuntimeConfigError,
      ok: false,
      status: 503,
    };
  }

  if (mode === "one-customer" && accountAllowlist.size !== 1) {
    return {
      error: customerInAppRuntimeConfigError,
      ok: false,
      status: 503,
    };
  }

  return {
    data: {
      account_allowlist: accountAllowlist,
      mode,
    },
    ok: true,
  };
}

function customerAccountAllowedByControlledRuntime(
  customerAccountReference: string,
  gate: ControlledCustomerRuntimeGate,
) {
  return gate.account_allowlist.has(customerAccountReference);
}

function resolveCustomerDriverQuickRepliesRuntimeGate(): AdminBookingResult<{
  mode: typeof customerDriverQuickRepliesMode;
}> {
  if (process.env.PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED !== "true") {
    return {
      error: quickReplyDisabledError,
      ok: false,
      status: 503,
    };
  }

  if (
    configValueOrNull(process.env.PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE) !==
    customerDriverQuickRepliesMode
  ) {
    return {
      error: quickReplyConfigError,
      ok: false,
      status: 503,
    };
  }

  return {
    data: {
      mode: customerDriverQuickRepliesMode,
    },
    ok: true,
  };
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

const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const safeCookieNamePattern = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,79}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlaceholderConfigValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    placeholderConfigPattern.test(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("change_me") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me") ||
    normalized.includes("your-") ||
    normalized.includes("your_") ||
    normalized.includes("<") ||
    normalized.includes(">")
  );
}

function validServerDatabaseUrl(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      hostname.length > 0 &&
      !hostname.includes("localhost") &&
      !hostname.includes("example") &&
      !hostname.includes("placeholder")
    );
  } catch {
    return false;
  }
}

function validServerCredential(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    value.trim().length >= 24 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public")
  );
}

function safeCookieName(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    safeCookieNamePattern.test(cleaned) &&
    !includesForbiddenFragment(cleaned)
    ? cleaned
    : null;
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieHeader(value: string | null) {
  const cookies = new Map<string, string[]>();

  if (!value) {
    return cookies;
  }

  for (const cookie of value.split(";")) {
    const trimmed = cookie.trim();

    if (!trimmed) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    const rawName = equalsIndex >= 0 ? trimmed.slice(0, equalsIndex).trim() : trimmed;
    const name = safeCookieName(rawName);

    if (!name) {
      continue;
    }

    const rawValue = equalsIndex >= 0 ? trimmed.slice(equalsIndex + 1) : "";
    const decodedValue = decodeCookieValue(rawValue).trim();

    if (!decodedValue) {
      continue;
    }

    cookies.set(name, [...(cookies.get(name) || []), decodedValue]);
  }

  return cookies;
}

function customerSavedBookingsSessionCookieNames() {
  const configuredValue = configValueOrNull(
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME,
  );
  const configuredName = safeCookieName(configuredValue);

  if (configuredValue && !configuredName) {
    return [];
  }

  if (configuredName) {
    return [configuredName];
  }

  return [
    customerSavedBookingsSessionCookieName,
    customerSavedBookingsFallbackSessionCookieName,
  ];
}

function readCustomerSavedBookingsSessionToken(request: Request): {
  source: CustomerSavedBookingsSessionTokenSource;
  token: string;
} {
  const headerToken = request.headers.get("x-prestige-customer-session-token")?.trim();

  if (headerToken) {
    return {
      source: "request-header",
      token: headerToken,
    };
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const cookieValues = customerSavedBookingsSessionCookieNames().flatMap(
    (cookieName) => cookies.get(cookieName) || [],
  );

  if (cookieValues.length === 1) {
    return {
      source: "request-cookie",
      token: cookieValues[0],
    };
  }

  if (cookieValues.length > 1) {
    return {
      source: "ambiguous-cookie",
      token: "",
    };
  }

  return {
    source: "missing",
    token: "",
  };
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

function customerInAppNotificationReadNotHandled(): CustomerInAppNotificationReadEvidenceResult {
  return {
    handled: false,
  };
}

function customerInAppNotificationReadHandled(
  status: number,
  body: Record<string, unknown>,
): Required<CustomerInAppNotificationReadEvidenceResult> {
  return {
    body,
    handled: true,
    status,
  };
}

function customerInAppNotificationReadError(
  error: string,
  status = 403,
): Required<CustomerInAppNotificationReadEvidenceResult> {
  return customerInAppNotificationReadHandled(status, {
    error,
    ok: false,
  });
}

function customerDriverQuickReplyResult(
  status: number,
  body: Record<string, unknown>,
): CustomerDriverQuickReplyResult {
  return {
    body,
    status,
  };
}

function customerDriverQuickReplyError(
  error: string,
  status: number,
): CustomerDriverQuickReplyResult {
  return customerDriverQuickReplyResult(status, {
    error,
    external_send: false,
    no_op: true,
    ok: false,
    provider_send: false,
  });
}

function resolveCustomerInAppNotificationReadEvidenceGate(): AdminBookingResult<{
  staging_reference: string;
}> {
  if (process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_ENABLED !== "true") {
    return customerAppNotificationsRequireAuthResult();
  }

  if (process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_READ_MODE !== "staging") {
    return customerAppNotificationsRequireAuthResult();
  }

  const stagingReference = safeIdentifier(
    process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_STAGING_REFERENCE,
    maxBookingReferenceLength,
  );

  if (!stagingReference) {
    return {
      error: safeCustomerInAppReadConfigError,
      ok: false,
      status: 503,
    };
  }

  return {
    data: {
      staging_reference: stagingReference,
    },
    ok: true,
  };
}

function resolveCustomerInAppNotificationReadBoundary(
  request: Request,
  stagingReference: string,
): AdminBookingResult<{
  auth_user_id: string;
  booking_reference: string;
  mode: "server-session-cookie" | "server-session-token";
}> {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-customer-purpose");

  if (purpose !== "customer-in-app-notification-read") {
    return customerAppNotificationsRequireAuthResult();
  }

  if (origin && origin !== requestUrl.origin) {
    return customerAppNotificationsRequireAuthResult();
  }

  if (!referer) {
    return customerAppNotificationsRequireAuthResult();
  }

  try {
    const refererUrl = new URL(referer);

    if (refererUrl.origin !== requestUrl.origin || refererUrl.pathname !== "/my-bookings") {
      return customerAppNotificationsRequireAuthResult();
    }
  } catch {
    return customerAppNotificationsRequireAuthResult();
  }

  const unsafeParams = [...requestUrl.searchParams.entries()].filter(
    ([key, value]) =>
      !allowedCustomerInAppNotificationReadQueryParams.has(key) ||
      includesForbiddenFragment(key) ||
      includesForbiddenFragment(value),
  );

  if (unsafeParams.length > 0) {
    return {
      error: "Customer app notification read includes fields outside the approved read scope.",
      ok: false,
      status: 400,
    };
  }

  const bookingReference = safeIdentifier(
    requestUrl.searchParams.get("booking_reference"),
    maxBookingReferenceLength,
  );

  if (!bookingReference || bookingReference !== stagingReference) {
    return customerAppNotificationsRequireAuthResult();
  }

  if (process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED !== "true") {
    return customerAppNotificationsRequireAuthResult();
  }

  const mode = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE);
  const expectedToken = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN);
  const providedToken = readCustomerSavedBookingsSessionToken(request);
  const authUserId = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID);

  if (
    mode !== "server-session-token" ||
    !validServerCredential(expectedToken) ||
    providedToken.token !== expectedToken ||
    !authUserId ||
    !uuidPattern.test(authUserId)
  ) {
    return customerAppNotificationsRequireAuthResult();
  }

  return {
    data: {
      auth_user_id: authUserId,
      booking_reference: bookingReference,
      mode: providedToken.source === "request-cookie" ? "server-session-cookie" : "server-session-token",
    },
    ok: true,
  };
}

function resolveCustomerInAppNotificationRuntimeBoundary(
  request: Request,
  runtimeGate: ControlledCustomerRuntimeGate,
): AdminBookingResult<{
  auth_user_id: string;
  booking_reference: string;
  customer_account_reference?: string | null;
  mode: "server-session-cookie" | "server-session-token";
  runtime_gate: ControlledCustomerRuntimeGate;
}> {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-customer-purpose");

  if (purpose !== "customer-in-app-notification-read") {
    return customerAppNotificationsRequireAuthResult();
  }

  if (origin && origin !== requestUrl.origin) {
    return customerAppNotificationsRequireAuthResult();
  }

  if (!referer) {
    return customerAppNotificationsRequireAuthResult();
  }

  try {
    const refererUrl = new URL(referer);

    if (refererUrl.origin !== requestUrl.origin || refererUrl.pathname !== "/my-bookings") {
      return customerAppNotificationsRequireAuthResult();
    }
  } catch {
    return customerAppNotificationsRequireAuthResult();
  }

  const unsafeParams = [...requestUrl.searchParams.entries()].filter(
    ([key, value]) =>
      !allowedCustomerInAppNotificationReadQueryParams.has(key) ||
      includesForbiddenFragment(key) ||
      includesForbiddenFragment(value),
  );

  if (unsafeParams.length > 0) {
    return {
      error: "Customer app notification read includes fields outside the approved read scope.",
      ok: false,
      status: 400,
    };
  }

  const bookingReference = safeIdentifier(
    requestUrl.searchParams.get("booking_reference"),
    maxBookingReferenceLength,
  );

  if (!bookingReference) {
    return customerAppNotificationsRequireAuthResult();
  }

  if (process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED !== "true") {
    return customerAppNotificationsRequireAuthResult();
  }

  const mode = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE);
  const expectedToken = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN);
  const providedToken = readCustomerSavedBookingsSessionToken(request);

  if (mode !== "server-session-token") {
    return customerAppNotificationsRequireAuthResult();
  }

  const mappedSession = resolveExactTwoCustomerRuntimeSessionMap({
    expectedEntryCount: runtimeGate.account_allowlist.size,
    mapValue: process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP,
    providedToken: providedToken.token,
  });

  let authUserId: string | null = null;
  let customerAccountReference: string | null = null;

  if (mappedSession.configured) {
    if (!mappedSession.ok) {
      return mappedSession.reason === "invalid_config"
        ? {
            error: customerInAppRuntimeConfigError,
            ok: false,
            status: 503,
          }
        : customerAppNotificationsRequireAuthResult();
    }

    authUserId = mappedSession.auth_user_id;
    customerAccountReference = mappedSession.customer_account_reference;
  } else {
    authUserId = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID);

    if (
      !validServerCredential(expectedToken) ||
      providedToken.token !== expectedToken ||
      !authUserId ||
      !uuidPattern.test(authUserId)
    ) {
      return customerAppNotificationsRequireAuthResult();
    }
  }

  if (
    customerAccountReference &&
    !customerAccountAllowedByControlledRuntime(customerAccountReference, runtimeGate)
  ) {
    return customerAppNotificationsRequireAuthResult();
  }

  return {
    data: {
      auth_user_id: authUserId,
      booking_reference: bookingReference,
      customer_account_reference: customerAccountReference,
      mode: providedToken.source === "request-cookie" ? "server-session-cookie" : "server-session-token",
      runtime_gate: runtimeGate,
    },
    ok: true,
  };
}

function parseCustomerInAppNotificationReadLimit(value: string | null) {
  const parsed = value === null || value === "" ? defaultCustomerInAppNotificationReadLimit : Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxCustomerInAppNotificationReadLimit
    ? parsed
    : null;
}

function getCustomerInAppNotificationReadClient(): AdminBookingResult<NotificationClient> {
  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledNotificationPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !validServerDatabaseUrl(supabaseUrl) ||
    !validServerCredential(serviceRoleKey)
  ) {
    return {
      error: safeCustomerInAppReadConfigError,
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
      error: safeCustomerInAppReadConfigError,
      ok: false,
      status: 503,
    };
  }
}

function toCustomerInAppNotificationReadEvidenceRecord(
  value: unknown,
): CustomerInAppNotificationReadEvidenceRecord | null {
  const record = normalizeRecord(value);

  if (record.delivery_surface !== "customer_app") {
    return null;
  }

  return {
    booking_reference: record.booking_reference,
    created_at: record.created_at,
    delivery_surface: "customer_app",
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

async function loadCustomerAppNotificationsForBookingReference(
  client: NotificationClient,
  request: Request,
  bookingReference: string,
): Promise<AdminBookingResult<{
  notifications: CustomerInAppNotificationReadEvidenceRecord[];
}>> {
  const requestUrl = new URL(request.url);
  const limit = parseCustomerInAppNotificationReadLimit(requestUrl.searchParams.get("limit"));

  if (!limit) {
    return {
      error: "Malformed customer app notification read limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const { data, error } = await client
    .from(notificationTable)
    .select(customerInAppNotificationReadSelect)
    .eq("delivery_surface", "customer_app")
    .eq("booking_reference", bookingReference)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return safeAdapterFailure(safeCustomerInAppReadError, 500, error);
  }

  return {
    data: {
      notifications: asArray(data)
        .map(toCustomerInAppNotificationReadEvidenceRecord)
        .filter(
          (record): record is CustomerInAppNotificationReadEvidenceRecord => Boolean(record),
        ),
    },
    ok: true,
  };
}

async function loadCustomerAppNotificationsForStagingReference(
  request: Request,
  stagingReference: string,
): Promise<AdminBookingResult<{
  notifications: CustomerInAppNotificationReadEvidenceRecord[];
}>> {
  const clientResult = getCustomerInAppNotificationReadClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  return loadCustomerAppNotificationsForBookingReference(
    clientResult.data,
    request,
    stagingReference,
  );
}

async function loadControlledCustomerAccountReference(
  client: NotificationClient,
  authUserId: string,
): Promise<AdminBookingResult<string | null>> {
  const { data, error } = await client
    .from("customer_access_accounts")
    .select(customerAccountSelect)
    .eq("auth_user_id", authUserId)
    .eq("account_status", "active")
    .limit(1);

  if (error) {
    return safeAdapterFailure(safeCustomerInAppReadError, 500, error);
  }

  const customerAccountReference = safeIdentifier(
    asRecord(asArray(data)[0]).customer_account_reference,
    maxBookingReferenceLength,
  );

  return {
    data: customerAccountReference,
    ok: true,
  };
}

async function verifyControlledCustomerBookingReference(
  client: NotificationClient,
  bookingReference: string,
  customerAccountReference: string,
): Promise<AdminBookingResult<null>> {
  const { data, error } = await client
    .from("bookings")
    .select(bookingCustomerScopeSelect)
    .eq("customer_id", customerAccountReference)
    .eq("booking_reference", bookingReference)
    .limit(1);

  if (error) {
    return safeAdapterFailure(safeCustomerInAppReadError, 500, error);
  }

  const matchedBookingReference = safeIdentifier(
    asRecord(asArray(data)[0]).booking_reference,
    maxBookingReferenceLength,
  );

  if (matchedBookingReference !== bookingReference) {
    return customerAppNotificationsRequireAuthResult();
  }

  return {
    data: null,
    ok: true,
  };
}

function customerAppNotificationUsesApprovedRuntimeTemplate(
  input: CustomerDriverAppNotificationInput,
) {
  const driverDetailsReadyTemplate =
    input.delivery_surface === "customer_app" &&
    input.notification_type === "trip_update" &&
    input.notification_status === "queued" &&
    input.priority === "normal" &&
    input.safe_title === "Driver details ready" &&
    input.safe_message === "Your Prestige Limo driver details are ready in your customer app." &&
    input.workflow_area === "customer_app_updates";
  const bookingRequestConfirmedTemplate =
    input.delivery_surface === "customer_app" &&
    input.notification_type === "booking_status" &&
    input.notification_status === "queued" &&
    input.priority === "normal" &&
    input.safe_title === "Booking request confirmed" &&
    input.safe_message === "Your booking request has been confirmed by Prestige Limo." &&
    input.workflow_area === "customer_request_review";

  return driverDetailsReadyTemplate || bookingRequestConfirmedTemplate;
}

async function assertControlledCustomerAppNotificationWriteAllowed(
  client: NotificationClient,
  input: CustomerDriverAppNotificationInput,
): Promise<AdminBookingResult<null>> {
  if (input.delivery_surface !== "customer_app") {
    return {
      data: null,
      ok: true,
    };
  }

  if (!customerAppNotificationUsesApprovedRuntimeTemplate(input)) {
    return {
      error: customerInAppRuntimeWriteTemplateError,
      ok: false,
      status: 400,
    };
  }

  const gate = resolveControlledCustomerInAppNotificationRuntimeGate();

  if (!gate.ok) {
    return gate;
  }

  if (!input.booking_reference) {
    return customerAppNotificationsRequireAuthResult();
  }

  const { data, error } = await client
    .from("bookings")
    .select(bookingCustomerScopeSelect)
    .eq("booking_reference", input.booking_reference)
    .limit(1);

  if (error) {
    return safeAdapterFailure(safeNotificationCreateError, 500, error);
  }

  const customerAccountReference = safeIdentifier(
    asRecord(asArray(data)[0]).customer_id,
    maxBookingReferenceLength,
  );

  if (
    !customerAccountReference ||
    !customerAccountAllowedByControlledRuntime(customerAccountReference, gate.data)
  ) {
    return customerAppNotificationsRequireAuthResult();
  }

  return {
    data: null,
    ok: true,
  };
}

async function loadCustomerAppNotificationsForControlledRuntime(
  request: Request,
  boundary: {
    auth_user_id: string;
    booking_reference: string;
    customer_account_reference?: string | null;
    runtime_gate: ControlledCustomerRuntimeGate;
  },
): Promise<AdminBookingResult<{
  notifications: CustomerInAppNotificationReadEvidenceRecord[];
}>> {
  const clientResult = getCustomerInAppNotificationReadClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const mappedAccountReference = safeIdentifier(
    boundary.customer_account_reference,
    maxBookingReferenceLength,
  );
  const accountReference = mappedAccountReference
    ? {
        data: mappedAccountReference,
        ok: true as const,
      }
    : await loadControlledCustomerAccountReference(
        clientResult.data,
        boundary.auth_user_id,
      );

  if (!accountReference.ok) {
    return accountReference;
  }

  if (
    !accountReference.data ||
    !customerAccountAllowedByControlledRuntime(accountReference.data, boundary.runtime_gate)
  ) {
    return customerAppNotificationsRequireAuthResult();
  }

  const bookingScope = await verifyControlledCustomerBookingReference(
    clientResult.data,
    boundary.booking_reference,
    accountReference.data,
  );

  if (!bookingScope.ok) {
    return bookingScope;
  }

  return loadCustomerAppNotificationsForBookingReference(
    clientResult.data,
    request,
    boundary.booking_reference,
  );
}

export async function readCustomerAppNotificationsForControlledRuntime(
  request: Request,
): Promise<CustomerInAppNotificationReadEvidenceResult> {
  const gate = resolveControlledCustomerInAppNotificationRuntimeGate();

  if (!gate.ok) {
    if (gate.error === customerInAppRuntimeDisabledError) {
      return customerInAppNotificationReadNotHandled();
    }

    return customerInAppNotificationReadError(gate.error, gate.status);
  }

  const boundary = resolveCustomerInAppNotificationRuntimeBoundary(request, gate.data);

  if (!boundary.ok) {
    return customerInAppNotificationReadError(boundary.error, boundary.status);
  }

  const result = await loadCustomerAppNotificationsForControlledRuntime(request, boundary.data);

  if (!result.ok) {
    return customerInAppNotificationReadError(result.error, result.status);
  }

  return customerInAppNotificationReadHandled(200, {
    delivery_surface: "customer_app",
    external_send: false,
    notification_count: result.data.notifications.length,
    notifications: result.data.notifications,
    ok: true,
    provider_send: false,
    version: customerInAppNotificationRuntimeVersion,
  });
}

export async function readCustomerAppNotificationsForStagingEvidence(
  request: Request,
): Promise<CustomerInAppNotificationReadEvidenceResult> {
  const gate = resolveCustomerInAppNotificationReadEvidenceGate();

  if (!gate.ok) {
    if (gate.status === 403) {
      return customerInAppNotificationReadNotHandled();
    }

    return customerInAppNotificationReadError(gate.error, gate.status);
  }

  const boundary = resolveCustomerInAppNotificationReadBoundary(
    request,
    gate.data.staging_reference,
  );

  if (!boundary.ok) {
    return customerInAppNotificationReadError(boundary.error, boundary.status);
  }

  const result = await loadCustomerAppNotificationsForStagingReference(
    request,
    boundary.data.booking_reference,
  );

  if (!result.ok) {
    return customerInAppNotificationReadError(result.error, result.status);
  }

  return customerInAppNotificationReadHandled(200, {
    delivery_surface: "customer_app",
    external_send: false,
    notification_count: result.data.notifications.length,
    notifications: result.data.notifications,
    ok: true,
    provider_send: false,
    version: customerInAppNotificationReadEvidenceVersion,
  });
}

function parseCustomerDriverQuickReplyPayload(
  value: unknown,
  direction: CustomerDriverQuickReplyDirection,
): AdminBookingResult<{
  booking_reference: string | null;
  safe_message: string;
  template_key: CustomerDriverQuickReplyTemplateKey;
}> {
  const record = asRecord(value);
  const allowedFields =
    direction === "customer_to_driver"
      ? new Set(["booking_reference", "template_key"])
      : new Set(["template_key"]);

  if (
    unknownKeys(record, allowedFields).length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return {
      error: quickReplyMalformedError,
      ok: false,
      status: 400,
    };
  }

  const templateKey = safeIdentifier(
    record.template_key,
    maxWorkflowAreaLength,
  ) as CustomerDriverQuickReplyTemplateKey | null;
  const bookingReference = safeIdentifier(
    record.booking_reference,
    maxBookingReferenceLength,
  );

  if (!templateKey) {
    return {
      error: quickReplyMalformedError,
      ok: false,
      status: 400,
    };
  }

  if (
    direction === "customer_to_driver" &&
    (!bookingReference || !customerToDriverQuickReplyTemplateKeys.has(templateKey))
  ) {
    return {
      error: quickReplyMalformedError,
      ok: false,
      status: 400,
    };
  }

  if (
    direction === "driver_to_customer" &&
    !driverToCustomerQuickReplyTemplateKeys.has(templateKey)
  ) {
    return {
      error: quickReplyMalformedError,
      ok: false,
      status: 400,
    };
  }

  const safeMessage =
    direction === "customer_to_driver"
      ? customerToDriverQuickReplyTemplates[
          templateKey as keyof typeof customerToDriverQuickReplyTemplates
        ]
      : driverToCustomerQuickReplyTemplates[
          templateKey as keyof typeof driverToCustomerQuickReplyTemplates
        ];

  return {
    data: {
      booking_reference: bookingReference,
      safe_message: safeMessage,
      template_key: templateKey,
    },
    ok: true,
  };
}

function resolveCustomerQuickReplyRuntimeBoundary(
  request: Request,
  runtimeGate: ControlledCustomerRuntimeGate,
  bookingReference: string,
): AdminBookingResult<{
  auth_user_id: string;
  booking_reference: string;
  customer_account_reference?: string | null;
  mode: "server-session-cookie" | "server-session-token";
  runtime_gate: ControlledCustomerRuntimeGate;
}> {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-customer-purpose");

  if (purpose !== "customer-driver-quick-reply") {
    return customerAppNotificationsRequireAuthResult();
  }

  if (origin && origin !== requestUrl.origin) {
    return customerAppNotificationsRequireAuthResult();
  }

  if (!referer) {
    return customerAppNotificationsRequireAuthResult();
  }

  try {
    const refererUrl = new URL(referer);

    if (refererUrl.origin !== requestUrl.origin || refererUrl.pathname !== "/my-bookings") {
      return customerAppNotificationsRequireAuthResult();
    }
  } catch {
    return customerAppNotificationsRequireAuthResult();
  }

  if ([...requestUrl.searchParams.entries()].length > 0) {
    return {
      error: quickReplyMalformedError,
      ok: false,
      status: 400,
    };
  }

  if (process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED !== "true") {
    return customerAppNotificationsRequireAuthResult();
  }

  const mode = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE);
  const expectedToken = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN);
  const providedToken = readCustomerSavedBookingsSessionToken(request);

  if (mode !== "server-session-token") {
    return customerAppNotificationsRequireAuthResult();
  }

  const mappedSession = resolveExactTwoCustomerRuntimeSessionMap({
    expectedEntryCount: runtimeGate.account_allowlist.size,
    mapValue: process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP,
    providedToken: providedToken.token,
  });

  let authUserId: string | null = null;
  let customerAccountReference: string | null = null;

  if (mappedSession.configured) {
    if (!mappedSession.ok) {
      return mappedSession.reason === "invalid_config"
        ? {
            error: customerInAppRuntimeConfigError,
            ok: false,
            status: 503,
          }
        : customerAppNotificationsRequireAuthResult();
    }

    authUserId = mappedSession.auth_user_id;
    customerAccountReference = mappedSession.customer_account_reference;
  } else {
    authUserId = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID);

    if (
      !validServerCredential(expectedToken) ||
      providedToken.token !== expectedToken ||
      !authUserId ||
      !uuidPattern.test(authUserId)
    ) {
      return customerAppNotificationsRequireAuthResult();
    }
  }

  if (
    customerAccountReference &&
    !customerAccountAllowedByControlledRuntime(customerAccountReference, runtimeGate)
  ) {
    return customerAppNotificationsRequireAuthResult();
  }

  return {
    data: {
      auth_user_id: authUserId,
      booking_reference: bookingReference,
      customer_account_reference: customerAccountReference,
      mode: providedToken.source === "request-cookie" ? "server-session-cookie" : "server-session-token",
      runtime_gate: runtimeGate,
    },
    ok: true,
  };
}

async function loadCustomerAccountReferenceForBooking(
  client: NotificationClient,
  bookingReference: string,
): Promise<AdminBookingResult<string>> {
  const { data, error } = await client
    .from("bookings")
    .select(bookingCustomerScopeSelect)
    .eq("booking_reference", bookingReference)
    .limit(1);

  if (error) {
    return safeAdapterFailure(quickReplyCreateError, 500, error);
  }

  const row = asRecord(asArray(data)[0]);
  const matchedBookingReference = safeIdentifier(
    row.booking_reference,
    maxBookingReferenceLength,
  );
  const customerAccountReference = safeIdentifier(
    row.customer_id,
    maxBookingReferenceLength,
  );

  if (matchedBookingReference !== bookingReference || !customerAccountReference) {
    return customerAppNotificationsRequireAuthResult();
  }

  return {
    data: customerAccountReference,
    ok: true,
  };
}

async function assertQuickReplyCustomerBookingScope(
  client: NotificationClient,
  boundary: {
    auth_user_id: string;
    booking_reference: string;
    customer_account_reference?: string | null;
    runtime_gate: ControlledCustomerRuntimeGate;
  },
): Promise<AdminBookingResult<string>> {
  const mappedAccountReference = safeIdentifier(
    boundary.customer_account_reference,
    maxBookingReferenceLength,
  );
  const accountReference = mappedAccountReference
    ? {
        data: mappedAccountReference,
        ok: true as const,
      }
    : await loadControlledCustomerAccountReference(
        client,
        boundary.auth_user_id,
      );

  if (!accountReference.ok) {
    return accountReference;
  }

  if (
    !accountReference.data ||
    !customerAccountAllowedByControlledRuntime(accountReference.data, boundary.runtime_gate)
  ) {
    return customerAppNotificationsRequireAuthResult();
  }

  const bookingScope = await verifyControlledCustomerBookingReference(
    client,
    boundary.booking_reference,
    accountReference.data,
  );

  if (!bookingScope.ok) {
    return bookingScope;
  }

  return {
    data: accountReference.data,
    ok: true,
  };
}

async function assertQuickReplyBeforePob(
  client: NotificationClient,
  bookingReference: string,
): Promise<AdminBookingResult<null>> {
  const { data, error } = await client
    .from("driver_job_status_events")
    .select(driverJobStatusEventQuickReplySelect)
    .eq("booking_reference", bookingReference)
    .order("occurred_at", { ascending: false })
    .limit(1);

  if (error) {
    return safeAdapterFailure(quickReplyCreateError, 500, error);
  }

  const latestStatus = textOrNull(asRecord(asArray(data)[0]).status_value);

  if (latestStatus === "pob" || latestStatus === "completed") {
    return {
      error: quickReplyPostPobDisabledError,
      ok: false,
      status: 409,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

async function insertQuickReplyNotification(
  client: NotificationClient,
  input: CustomerDriverAppNotificationInput,
  actor: {
    actor_label: string;
    actor_role: CustomerDriverAppNotificationRecord["actor_role"];
    source_surface: CustomerDriverAppNotificationRecord["source_surface"];
  },
): Promise<AdminBookingResult<CustomerDriverAppNotificationSafeRecord>> {
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

  if (
    findForbiddenFieldNames(payload).length > 0 ||
    findForbiddenTextValues(payload).length > 0
  ) {
    return unsafeNotificationResult();
  }

  const { data, error } = await client
    .from(notificationTable)
    .insert(payload)
    .select(notificationSelect)
    .single();

  if (error) {
    return safeAdapterFailure(quickReplyCreateError, 500, error);
  }

  const notification = normalizeRecord(data);

  if (!notification.id || notification.delivery_surface !== input.delivery_surface) {
    return {
      error: quickReplyCreateError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: toSafeRecord(notification),
    ok: true,
  };
}

function quickReplyInput(
  direction: CustomerDriverQuickReplyDirection,
  templateKey: CustomerDriverQuickReplyTemplateKey,
  safeMessage: string,
  bookingReference: string,
  driverJobLinkId: string | null,
): CustomerDriverAppNotificationInput {
  return {
    booking_reference: bookingReference,
    delivery_surface: direction === "customer_to_driver" ? "driver_app" : "customer_app",
    driver_job_link_id: driverJobLinkId,
    event_key: `customer_driver_quick_reply:${direction}:${templateKey}`,
    notification_status: "queued",
    notification_type: "trip_update",
    priority: "normal",
    safe_context: {
      direction,
      template_key: templateKey,
    },
    safe_message: safeMessage,
    safe_title: direction === "customer_to_driver" ? "Passenger reply" : "Driver reply",
    workflow_area: "customer_driver_quick_replies",
  };
}

export async function sendCustomerQuickReplyToDriver(
  request: Request,
  rawBody: unknown,
): Promise<CustomerDriverQuickReplyResult> {
  const quickReplyGate = resolveCustomerDriverQuickRepliesRuntimeGate();

  if (!quickReplyGate.ok) {
    return customerDriverQuickReplyError(quickReplyGate.error, quickReplyGate.status);
  }

  const parsed = parseCustomerDriverQuickReplyPayload(rawBody, "customer_to_driver");

  if (!parsed.ok || !parsed.data.booking_reference) {
    return customerDriverQuickReplyError(
      parsed.ok ? quickReplyMalformedError : parsed.error,
      parsed.ok ? 400 : parsed.status,
    );
  }

  const runtimeGate = resolveControlledCustomerInAppNotificationRuntimeGate();

  if (!runtimeGate.ok) {
    return customerDriverQuickReplyError(runtimeGate.error, runtimeGate.status);
  }

  const boundary = resolveCustomerQuickReplyRuntimeBoundary(
    request,
    runtimeGate.data,
    parsed.data.booking_reference,
  );

  if (!boundary.ok) {
    return customerDriverQuickReplyError(boundary.error, boundary.status);
  }

  const clientResult = getCustomerInAppNotificationReadClient();

  if (!clientResult.ok) {
    return customerDriverQuickReplyError(clientResult.error, clientResult.status);
  }

  const scope = await assertQuickReplyCustomerBookingScope(clientResult.data, boundary.data);

  if (!scope.ok) {
    return customerDriverQuickReplyError(scope.error, scope.status);
  }

  const statusGate = await assertQuickReplyBeforePob(
    clientResult.data,
    boundary.data.booking_reference,
  );

  if (!statusGate.ok) {
    return customerDriverQuickReplyError(statusGate.error, statusGate.status);
  }

  const created = await insertQuickReplyNotification(
    clientResult.data,
    quickReplyInput(
      "customer_to_driver",
      parsed.data.template_key,
      parsed.data.safe_message,
      boundary.data.booking_reference,
      null,
    ),
    {
      actor_label: "verified_customer_account",
      actor_role: "customer",
      source_surface: "customer_api",
    },
  );

  if (!created.ok) {
    return customerDriverQuickReplyError(created.error, created.status);
  }

  return customerDriverQuickReplyResult(200, {
    delivery_surface: "driver_app",
    direction: "customer_to_driver",
    external_send: false,
    no_provider_send: true,
    notification: created.data,
    ok: true,
    provider_send: false,
    version: customerDriverQuickRepliesRuntimeVersion,
  });
}

export async function sendDriverQuickReplyToCustomer(
  token: string,
  rawBody: unknown,
): Promise<CustomerDriverQuickReplyResult> {
  const quickReplyGate = resolveCustomerDriverQuickRepliesRuntimeGate();

  if (!quickReplyGate.ok) {
    return customerDriverQuickReplyError(quickReplyGate.error, quickReplyGate.status);
  }

  const parsed = parseCustomerDriverQuickReplyPayload(rawBody, "driver_to_customer");

  if (!parsed.ok) {
    return customerDriverQuickReplyError(parsed.error, parsed.status);
  }

  const runtimeGate = resolveControlledCustomerInAppNotificationRuntimeGate();

  if (!runtimeGate.ok) {
    return customerDriverQuickReplyError(runtimeGate.error, runtimeGate.status);
  }

  const clientResult = getDriverNotificationClient();

  if (!clientResult.ok) {
    return customerDriverQuickReplyError(clientResult.error, clientResult.status);
  }

  const linkResult = await resolveDriverLinkScope(clientResult.data, token);

  if (!linkResult.ok) {
    return customerDriverQuickReplyError(linkResult.error, linkResult.status);
  }

  const accountReference = await loadCustomerAccountReferenceForBooking(
    clientResult.data,
    linkResult.data.booking_reference,
  );

  if (!accountReference.ok) {
    return customerDriverQuickReplyError(accountReference.error, accountReference.status);
  }

  if (!customerAccountAllowedByControlledRuntime(accountReference.data, runtimeGate.data)) {
    return customerDriverQuickReplyError(customerAuthRequiredError, 403);
  }

  const statusGate = await assertQuickReplyBeforePob(
    clientResult.data,
    linkResult.data.booking_reference,
  );

  if (!statusGate.ok) {
    return customerDriverQuickReplyError(statusGate.error, statusGate.status);
  }

  const created = await insertQuickReplyNotification(
    clientResult.data,
    quickReplyInput(
      "driver_to_customer",
      parsed.data.template_key,
      parsed.data.safe_message,
      linkResult.data.booking_reference,
      linkResult.data.id,
    ),
    {
      actor_label: "verified_driver_job_link",
      actor_role: "driver",
      source_surface: "driver_api",
    },
  );

  if (!created.ok) {
    return customerDriverQuickReplyError(created.error, created.status);
  }

  return customerDriverQuickReplyResult(200, {
    delivery_surface: "customer_app",
    direction: "driver_to_customer",
    external_send: false,
    no_provider_send: true,
    notification: created.data,
    ok: true,
    provider_send: false,
    version: customerDriverQuickRepliesRuntimeVersion,
  });
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

  const customerAppWriteGate = await assertControlledCustomerAppNotificationWriteAllowed(
    clientResult.data,
    input,
  );

  if (!customerAppWriteGate.ok) {
    return customerAppWriteGate;
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
