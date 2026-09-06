export const customerPortalTripUpdatesApiPath = "/api/customer-app-notifications";

export type CustomerPortalTripUpdate = {
  createdAt: string;
  id: string;
  message: string;
  status: string;
  title: string;
  type: string;
  workflowArea: string;
};

export type CustomerPortalTripUpdatesResult = {
  message: string;
  status: "blocked" | "empty" | "ready";
  updates: CustomerPortalTripUpdate[];
};

export type CustomerNotificationCentreAlert = {
  createdAt: string;
  latestMessage: string;
  latestTitle: string;
  notificationCount: number;
  notificationType: string;
  priority: "high" | "low" | "normal" | "urgent";
  publicBookingReference: string;
  workflowArea: string;
};

export type CustomerNotificationCentreResult = {
  alertCount: number;
  alerts: CustomerNotificationCentreAlert[];
  status: "blocked" | "ready";
};

export type CustomerNotificationCentreDismissResult = {
  dismissedCount: number;
  status: "blocked" | "ready";
};

const allowedCustomerNotificationCentreDismissResponseFields = new Set([
  "delivery_surface",
  "dismissed_count",
  "external_send",
  "ok",
  "provider_send",
  "version",
]);

type UnknownRecord = Record<string, unknown>;
type CustomerPortalTripUpdatesFetch = typeof fetch;

const maxSafeTextLength = 500;
const allowedPayloadFields = new Set([
  "delivery_surface",
  "external_send",
  "notification_count",
  "notifications",
  "ok",
  "provider_send",
  "version",
]);
const allowedNotificationCentrePayloadFields = new Set([
  "alert_count",
  "alerts",
  "delivery_surface",
  "external_send",
  "notification_count",
  "ok",
  "provider_send",
  "version",
]);
const allowedNotificationCentreAlertFields = new Set([
  "created_at",
  "latest_message",
  "latest_title",
  "notification_count",
  "notification_type",
  "priority",
  "public_booking_reference",
  "workflow_area",
]);
const allowedUpdateFields = new Set([
  "booking_reference",
  "created_at",
  "delivery_surface",
  "notification_status",
  "notification_type",
  "priority",
  "safe_context",
  "safe_message",
  "safe_title",
  "updated_at",
  "workflow_area",
]);
const forbiddenTripUpdateFragments = [
  "admin_finance",
  "admin_internal_status",
  "admin_note",
  "amount_due",
  "auth_link",
  "billing",
  "contact_email",
  "contact_phone",
  "customer_price",
  "debug",
  "driver_job_link_id",
  "driver_note",
  "driver_payout",
  "driver_token",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "jwt",
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
  "raw_ai",
  "raw_token",
  "refresh_token",
  "secret",
  "server_secret",
  `service_${"role"}`,
  "session_secret",
  "sms",
  "telegram",
  "token_hash",
  "whatsapp",
];
const driverTripUpdatesPendingMessage =
  "Trip updates appear here after the driver starts reporting from the job link.";

function formatSingaporeDateTime(value: string) {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return `${new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).format(new Date(timestamp))} SGT`;
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenTripUpdateFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = maxSafeTextLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned && cleaned.length <= maxLength && !includesForbiddenFragment(cleaned) ? cleaned : "";
}

function safeBookingReference(value: string) {
  const cleaned = safeText(value, 120);

  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) ? cleaned : "";
}

function hasUnsafeKeys(record: UnknownRecord, allowedFields: Set<string>) {
  return Object.keys(record).some((key) => !allowedFields.has(key) || includesForbiddenFragment(key));
}

function safeStatusLabel(value: unknown) {
  const normalized = normalizeToken(safeText(value, 80));

  if (normalized === "read") {
    return "Read";
  }

  if (normalized === "dismissed") {
    return "Dismissed";
  }

  if (normalized === "archived") {
    return "Archived";
  }

  return "New";
}

function mapTripUpdate(value: unknown): CustomerPortalTripUpdate | null {
  const record = asRecord(value);

  if (
    hasUnsafeKeys(record, allowedUpdateFields) ||
    record.delivery_surface !== "customer_app" ||
    !["driver_status", "trip_update", "booking_status", "system_notice"].includes(
      safeText(record.notification_type, 80),
    )
  ) {
    return null;
  }

  const title = safeText(record.safe_title, 160);
  const message = safeText(record.safe_message, 500);

  if (!title && !message) {
    return null;
  }

  const createdAt = safeText(record.created_at, 80) || safeText(record.updated_at, 80);

  return {
    createdAt: createdAt ? formatSingaporeDateTime(createdAt) : "",
    id:
      safeText(record.created_at, 80) ||
      `${safeText(record.notification_type, 80)}:${title}:${message}`.slice(0, 180),
    message: message || "Trip update is ready.",
    status: safeStatusLabel(record.notification_status),
    title: title || "Trip update",
    type: safeText(record.notification_type, 80) || "trip_update",
    workflowArea: safeText(record.workflow_area, 80),
  };
}

export function mapCustomerPortalTripUpdatesPayload(
  payload: unknown,
): CustomerPortalTripUpdatesResult {
  const record = asRecord(payload);

  if (
    record.ok !== true ||
    record.delivery_surface !== "customer_app" ||
    record.external_send !== false ||
    record.provider_send !== false ||
    hasUnsafeKeys(record, allowedPayloadFields)
  ) {
    return {
      message: driverTripUpdatesPendingMessage,
      status: "blocked",
      updates: [],
    };
  }

  const updates = asArray(record.notifications)
    .map(mapTripUpdate)
    .filter((update): update is CustomerPortalTripUpdate => Boolean(update));

  if (updates.length === 0) {
    return {
      message: "No driver trip updates yet.",
      status: "empty",
      updates: [],
    };
  }

  return {
    message: "",
    status: "ready",
    updates,
  };
}

export async function loadCustomerPortalTripUpdates({
  bookingReference,
  fetcher = fetch,
  signal,
}: {
  bookingReference: string;
  fetcher?: CustomerPortalTripUpdatesFetch;
  signal?: AbortSignal;
}): Promise<CustomerPortalTripUpdatesResult> {
  const safeReference = safeBookingReference(bookingReference);

  if (!safeReference) {
    return {
      message: "Trip updates are not available for this booking.",
      status: "blocked",
      updates: [],
    };
  }

  try {
    const response = await fetcher(
      `${customerPortalTripUpdatesApiPath}?booking_reference=${encodeURIComponent(safeReference)}&limit=10&page=1`,
      {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-prestige-customer-purpose": "customer-in-app-notification-read",
        },
        signal,
      },
    );

    if (!response.ok) {
      return {
        message: driverTripUpdatesPendingMessage,
        status: "blocked",
        updates: [],
      };
    }

    return mapCustomerPortalTripUpdatesPayload(await response.json());
  } catch {
    return {
      message: "Trip updates are not ready yet.",
      status: "empty",
      updates: [],
    };
  }
}

function mapCustomerNotificationCentreAlert(
  value: unknown,
): CustomerNotificationCentreAlert | null {
  const record = asRecord(value);
  if (hasUnsafeKeys(record, allowedNotificationCentreAlertFields)) {
    return null;
  }
  const publicBookingReference = safeBookingReference(
    safeText(record.public_booking_reference, 120),
  );
  const latestTitle = safeText(record.latest_title, 160);
  const persistedLatestMessage = safeText(record.latest_message, 1000);
  const latestMessage =
    persistedLatestMessage && persistedLatestMessage.length > 500
      ? `${persistedLatestMessage.slice(0, 497)}...`
      : persistedLatestMessage;
  const notificationCount = Number(record.notification_count);
  const priority = safeText(record.priority, 40);
  if (
    !publicBookingReference ||
    !latestTitle ||
    !latestMessage ||
    !Number.isSafeInteger(notificationCount) ||
    notificationCount < 1 ||
    !["high", "low", "normal", "urgent"].includes(priority)
  ) {
    return null;
  }
  return {
    createdAt: safeText(record.created_at, 80),
    latestMessage,
    latestTitle,
    notificationCount,
    notificationType: safeText(record.notification_type, 80),
    priority: priority as CustomerNotificationCentreAlert["priority"],
    publicBookingReference,
    workflowArea: safeText(record.workflow_area, 80),
  };
}

export function mapCustomerNotificationCentrePayload(
  payload: unknown,
): CustomerNotificationCentreResult {
  const record = asRecord(payload);
  const alertCount = Number(record.alert_count);
  if (
    record.ok !== true ||
    record.delivery_surface !== "customer_app" ||
    record.external_send !== false ||
    record.provider_send !== false ||
    hasUnsafeKeys(record, allowedNotificationCentrePayloadFields) ||
    !Array.isArray(record.alerts) ||
    !Number.isSafeInteger(alertCount) ||
    alertCount < 0
  ) {
    return { alertCount: 0, alerts: [], status: "blocked" };
  }
  const alerts = record.alerts
    .map(mapCustomerNotificationCentreAlert)
    .filter((alert): alert is CustomerNotificationCentreAlert => Boolean(alert));
  if (alerts.length !== record.alerts.length) {
    return { alertCount: 0, alerts: [], status: "blocked" };
  }
  return { alertCount, alerts, status: "ready" };
}

export async function loadCustomerNotificationCentre({
  fetcher = fetch,
  signal,
}: {
  fetcher?: CustomerPortalTripUpdatesFetch;
  signal?: AbortSignal;
} = {}): Promise<CustomerNotificationCentreResult> {
  try {
    const params = new URLSearchParams();
    params.set("view", "centre");
    const response = await fetcher(
      `${customerPortalTripUpdatesApiPath}?${params.toString()}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "x-prestige-customer-purpose": "customer-in-app-notification-read",
        },
        signal,
      },
    );
    if (!response.ok) {
      return { alertCount: 0, alerts: [], status: "blocked" };
    }
    return mapCustomerNotificationCentrePayload(await response.json());
  } catch {
    return { alertCount: 0, alerts: [], status: "blocked" };
  }
}

export async function dismissCustomerNotificationCentre({
  fetcher = fetch,
}: {
  fetcher?: CustomerPortalTripUpdatesFetch;
} = {}): Promise<CustomerNotificationCentreDismissResult> {
  try {
    const params = new URLSearchParams();
    params.set("view", "centre");
    const response = await fetcher(
      `${customerPortalTripUpdatesApiPath}?${params.toString()}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-prestige-customer-purpose": "customer-in-app-notification-dismiss",
        },
        method: "PATCH",
        body: JSON.stringify({ action: "dismiss_current" }),
      },
    );
    const payload = asRecord(await response.json().catch(() => null));
    const dismissedCount = Number(payload.dismissed_count);
    if (
      !response.ok ||
      hasUnsafeKeys(payload, allowedCustomerNotificationCentreDismissResponseFields) ||
      payload.ok !== true ||
      payload.delivery_surface !== "customer_app" ||
      payload.external_send !== false ||
      payload.provider_send !== false ||
      !Number.isSafeInteger(dismissedCount) ||
      dismissedCount < 0
    ) {
      return { dismissedCount: 0, status: "blocked" };
    }
    return { dismissedCount, status: "ready" };
  } catch {
    return { dismissedCount: 0, status: "blocked" };
  }
}
