export const customerDriverAuthFoundationVersion = "customer-driver-auth-foundation-v1";

export const customerDriverAuthAccountStatuses = [
  "pending_setup",
  "active",
  "suspended",
  "revoked",
] as const;
export const customerDriverAuthSourceSurfaces = [
  "admin_api",
  "customer_api",
  "driver_api",
  "migration",
  "system",
] as const;
export const customerDriverAuthActorRoles = [
  "admin",
  "customer",
  "dispatcher",
  "driver",
  "system",
] as const;
export const customerDriverAuthAccountSurfaces = ["customer", "driver"] as const;
export const customerDriverAuthAuditEventTypes = [
  "account_provisioned",
  "account_reviewed",
  "account_activated",
  "account_suspended",
  "account_revoked",
  "session_started",
  "session_blocked",
  "session_ended",
] as const;

export type CustomerDriverAuthAccountStatus =
  (typeof customerDriverAuthAccountStatuses)[number];
export type CustomerDriverAuthSourceSurface =
  (typeof customerDriverAuthSourceSurfaces)[number];
export type CustomerDriverAuthActorRole =
  (typeof customerDriverAuthActorRoles)[number];
export type CustomerDriverAuthAccountSurface =
  (typeof customerDriverAuthAccountSurfaces)[number];
export type CustomerDriverAuthAuditEventType =
  (typeof customerDriverAuthAuditEventTypes)[number];

export type CustomerAccessAccountInput = {
  account_status: CustomerDriverAuthAccountStatus;
  auth_provider: "supabase_auth";
  auth_user_id: string;
  customer_account_reference: string;
  safe_display_label: string;
  source_surface: Extract<CustomerDriverAuthSourceSurface, "admin_api" | "migration" | "system">;
};

export type DriverAccessAccountInput = {
  account_status: CustomerDriverAuthAccountStatus;
  auth_provider: "supabase_auth";
  auth_user_id: string;
  driver_reference: string;
  safe_display_label: string;
  source_surface: Extract<CustomerDriverAuthSourceSurface, "admin_api" | "migration" | "system">;
};

export type CustomerDriverAccessAuditEventInput = {
  account_reference: string;
  account_surface: CustomerDriverAuthAccountSurface;
  actor_label: string | null;
  actor_role: CustomerDriverAuthActorRole;
  auth_user_id: string | null;
  event_type: CustomerDriverAuthAuditEventType;
  safe_event_context: Record<string, unknown>;
  source_surface: CustomerDriverAuthSourceSurface;
};

export type CustomerDriverAuthFoundationResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 400 | 403;
    };

type UnknownRecord = Record<string, unknown>;

const allowedAccountStatuses = new Set<string>(customerDriverAuthAccountStatuses);
const allowedAccountSourceSurfaces = new Set<string>(["admin_api", "migration", "system"]);
const allowedAuditSourceSurfaces = new Set<string>(customerDriverAuthSourceSurfaces);
const allowedActorRoles = new Set<string>(customerDriverAuthActorRoles);
const allowedAccountSurfaces = new Set<string>(customerDriverAuthAccountSurfaces);
const allowedAuditEventTypes = new Set<string>(customerDriverAuthAuditEventTypes);
const allowedCustomerAccountFields = new Set([
  "account_status",
  "auth_provider",
  "auth_user_id",
  "customer_account_reference",
  "safe_display_label",
  "source_surface",
]);
const allowedDriverAccountFields = new Set([
  "account_status",
  "auth_provider",
  "auth_user_id",
  "driver_reference",
  "safe_display_label",
  "source_surface",
]);
const allowedAuditFields = new Set([
  "account_reference",
  "account_surface",
  "actor_label",
  "actor_role",
  "auth_user_id",
  "event_type",
  "safe_event_context",
  "source_surface",
]);
const forbiddenAuthFoundationFragments = [
  "admin_finance",
  "admin_note",
  "amount_due",
  "billing",
  "billing_rate",
  "contact_email",
  "contact_phone",
  "cookie",
  "customer_price",
  "debug",
  "driver_payout",
  "email_payload",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "jwt",
  "live_location",
  "magic_link",
  "mock_archive",
  "mock_qa",
  "otp",
  "parser_debug",
  "parser_learning",
  "password",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "phone",
  "proof",
  "raw_claim",
  "raw_token",
  "refresh_token",
  "secret",
  "send_log",
  "service_role",
  "session_secret",
  "session_token",
  "sms",
  "telegram",
  "whatsapp",
];
const malformedAuthFoundationError =
  "Customer/driver auth foundation details are malformed.";
const unsafeAuthFoundationError =
  "Customer/driver auth foundation payload includes fields outside the approved access scope.";
const authActivationBlockedError =
  "Customer/driver auth activation is not enabled in this foundation stage.";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxReferenceLength = 120;
const maxSafeDisplayLabelLength = 160;
const maxActorLabelLength = 160;
const maxSafeContextJsonLength = 2000;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
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

  return forbiddenAuthFoundationFragments.some((fragment) => normalized.includes(fragment));
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

function safeReference(value: unknown) {
  const cleaned = safeText(value, maxReferenceLength);

  if (!cleaned) {
    return null;
  }

  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) ? cleaned : null;
}

function safeUuid(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && uuidPattern.test(cleaned) ? cleaned.toLowerCase() : null;
}

function safeOptionalUuid(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return safeUuid(value);
}

function safeJsonObject(value: unknown) {
  const record = asRecord(value);
  const json = JSON.stringify(record);

  if (
    !json ||
    json.length > maxSafeContextJsonLength ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return {};
  }

  return record;
}

function validAccountStatus(value: unknown) {
  const cleaned = textOrNull(value) || "pending_setup";

  return allowedAccountStatuses.has(cleaned)
    ? (cleaned as CustomerDriverAuthAccountStatus)
    : null;
}

function validAccountSourceSurface(value: unknown) {
  const cleaned = textOrNull(value) || "admin_api";

  return allowedAccountSourceSurfaces.has(cleaned)
    ? (cleaned as Extract<CustomerDriverAuthSourceSurface, "admin_api" | "migration" | "system">)
    : null;
}

function validAuditSourceSurface(value: unknown) {
  const cleaned = textOrNull(value) || "admin_api";

  return allowedAuditSourceSurfaces.has(cleaned)
    ? (cleaned as CustomerDriverAuthSourceSurface)
    : null;
}

function validActorRole(value: unknown) {
  const cleaned = textOrNull(value) || "admin";

  return allowedActorRoles.has(cleaned) ? (cleaned as CustomerDriverAuthActorRole) : null;
}

function validAccountSurface(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedAccountSurfaces.has(cleaned)
    ? (cleaned as CustomerDriverAuthAccountSurface)
    : null;
}

function validAuditEventType(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedAuditEventTypes.has(cleaned)
    ? (cleaned as CustomerDriverAuthAuditEventType)
    : null;
}

function unsafeResult(): CustomerDriverAuthFoundationResult<never> {
  return {
    error: unsafeAuthFoundationError,
    ok: false,
    status: 400,
  };
}

function malformedResult(): CustomerDriverAuthFoundationResult<never> {
  return {
    error: malformedAuthFoundationError,
    ok: false,
    status: 400,
  };
}

export function customerDriverAuthActivationBlockedResult(): CustomerDriverAuthFoundationResult<never> {
  return {
    error: authActivationBlockedError,
    ok: false,
    status: 403,
  };
}

export function parseCustomerAccessAccountFoundationPayload(
  value: unknown,
): CustomerDriverAuthFoundationResult<CustomerAccessAccountInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedCustomerAccountFields).length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return unsafeResult();
  }

  const authUserId = safeUuid(record.auth_user_id);
  const customerAccountReference = safeReference(record.customer_account_reference);
  const safeDisplayLabel = safeText(record.safe_display_label, maxSafeDisplayLabelLength);
  const accountStatus = validAccountStatus(record.account_status);
  const sourceSurface = validAccountSourceSurface(record.source_surface);
  const authProvider = textOrNull(record.auth_provider) || "supabase_auth";

  if (
    !authUserId ||
    !customerAccountReference ||
    !safeDisplayLabel ||
    !accountStatus ||
    !sourceSurface ||
    authProvider !== "supabase_auth"
  ) {
    return malformedResult();
  }

  return {
    data: {
      account_status: accountStatus,
      auth_provider: "supabase_auth",
      auth_user_id: authUserId,
      customer_account_reference: customerAccountReference,
      safe_display_label: safeDisplayLabel,
      source_surface: sourceSurface,
    },
    ok: true,
  };
}

export function parseDriverAccessAccountFoundationPayload(
  value: unknown,
): CustomerDriverAuthFoundationResult<DriverAccessAccountInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedDriverAccountFields).length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return unsafeResult();
  }

  const authUserId = safeUuid(record.auth_user_id);
  const driverReference = safeReference(record.driver_reference);
  const safeDisplayLabel = safeText(record.safe_display_label, maxSafeDisplayLabelLength);
  const accountStatus = validAccountStatus(record.account_status);
  const sourceSurface = validAccountSourceSurface(record.source_surface);
  const authProvider = textOrNull(record.auth_provider) || "supabase_auth";

  if (
    !authUserId ||
    !driverReference ||
    !safeDisplayLabel ||
    !accountStatus ||
    !sourceSurface ||
    authProvider !== "supabase_auth"
  ) {
    return malformedResult();
  }

  return {
    data: {
      account_status: accountStatus,
      auth_provider: "supabase_auth",
      auth_user_id: authUserId,
      driver_reference: driverReference,
      safe_display_label: safeDisplayLabel,
      source_surface: sourceSurface,
    },
    ok: true,
  };
}

export function parseCustomerDriverAccessAuditEventFoundationPayload(
  value: unknown,
): CustomerDriverAuthFoundationResult<CustomerDriverAccessAuditEventInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedAuditFields).length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return unsafeResult();
  }

  const accountSurface = validAccountSurface(record.account_surface);
  const accountReference = safeReference(record.account_reference);
  const authUserId = safeOptionalUuid(record.auth_user_id);
  const eventType = validAuditEventType(record.event_type);
  const sourceSurface = validAuditSourceSurface(record.source_surface);
  const actorRole = validActorRole(record.actor_role);
  const actorLabel = safeText(record.actor_label, maxActorLabelLength);
  const safeEventContext = safeJsonObject(record.safe_event_context);

  if (!accountSurface || !accountReference || !eventType || !sourceSurface || !actorRole) {
    return malformedResult();
  }

  if (record.auth_user_id && !authUserId) {
    return malformedResult();
  }

  return {
    data: {
      account_reference: accountReference,
      account_surface: accountSurface,
      actor_label: actorLabel,
      actor_role: actorRole,
      auth_user_id: authUserId,
      event_type: eventType,
      safe_event_context: safeEventContext,
      source_surface: sourceSurface,
    },
    ok: true,
  };
}
