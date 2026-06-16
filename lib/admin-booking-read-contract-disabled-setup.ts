import "server-only";

export const adminBookingReadContractDisabledSetupVersion =
  "admin-booking-read-contract-disabled-setup-v1";

export type AdminBookingReadContractDisabledSetupInput = Record<string, unknown>;

export type AdminBookingReadContractDisabledSetupFields = {
  audit_summary: string | null;
  booking_reference: string | null;
  booking_status: string | null;
  contact_display_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string | null;
  customer_display_name: string | null;
  dropoff_location: string | null;
  pickup_datetime: string | null;
  pickup_location: string | null;
  route_points_summary: string | null;
  route_summary: string | null;
  service_item_summary: string | null;
  service_type: string | null;
  updated_at: string | null;
};

export type AdminBookingReadContractDisabledSetupResult = {
  actionEnabled: false;
  actionName: "admin_booking_read_list_detail";
  actionType: "admin_booking_read_list_detail";
  action_enabled: false;
  action_name: "admin_booking_read_list_detail";
  action_type: "admin_booking_read_list_detail";
  allowed_field_names: readonly string[];
  booking_read_field_names: string[];
  booking_read_fields: AdminBookingReadContractDisabledSetupFields;
  contractReady: boolean;
  contract_ready: boolean;
  dbReadEnabled: false;
  db_read_enabled: false;
  delivery_surface: "admin_booking_read_contract_disabled_setup_only";
  detailReadEnabled: false;
  detail_read_enabled: false;
  external_send: false;
  forbidden_fields_present: string[];
  invalid_fields: string[];
  listReadEnabled: false;
  list_read_enabled: false;
  liveReadEnabled: false;
  liveWriteEnabled: false;
  live_read_enabled: false;
  live_write_enabled: false;
  no_live_read: true;
  no_op: true;
  ok: boolean;
  readEnabled: false;
  readMode: "list" | "detail" | null;
  read_enabled: false;
  read_mode: "list" | "detail" | null;
  read_modes: readonly ["list", "detail"];
  reason: "setup_only_disabled" | "unsafe_or_unknown_fields";
  rejected_fields: string[];
  result_label: "blocked/no-op" | "rejected/no-op";
  status: "blocked" | "rejected";
  unknown_fields: string[];
  version: typeof adminBookingReadContractDisabledSetupVersion;
  writeEnabled: false;
  write_enabled: false;
};

const allowedCanonicalFields = [
  "audit_summary",
  "booking_reference",
  "booking_status",
  "contact_display_name",
  "contact_email",
  "contact_phone",
  "created_at",
  "customer_display_name",
  "dropoff_location",
  "pickup_datetime",
  "pickup_location",
  "route_points_summary",
  "route_summary",
  "service_item_summary",
  "service_type",
  "updated_at",
] as const;

const fieldAliases = new Map<string, (typeof allowedCanonicalFields)[number]>([
  ["audit_summary", "audit_summary"],
  ["auditsummary", "audit_summary"],
  ["booking_ref", "booking_reference"],
  ["booking_reference", "booking_reference"],
  ["booking_status", "booking_status"],
  ["bookingreference", "booking_reference"],
  ["bookingstatus", "booking_status"],
  ["contact_display_name", "contact_display_name"],
  ["contact_email", "contact_email"],
  ["contact_phone", "contact_phone"],
  ["contactdisplayname", "contact_display_name"],
  ["contactemail", "contact_email"],
  ["contactphone", "contact_phone"],
  ["created_at", "created_at"],
  ["createdat", "created_at"],
  ["customer_display_name", "customer_display_name"],
  ["customerdisplayname", "customer_display_name"],
  ["dropoff_location", "dropoff_location"],
  ["dropofflocation", "dropoff_location"],
  ["pickup_datetime", "pickup_datetime"],
  ["pickup_location", "pickup_location"],
  ["pickupdatetime", "pickup_datetime"],
  ["pickuplocation", "pickup_location"],
  ["route_points_summary", "route_points_summary"],
  ["route_summary", "route_summary"],
  ["routepointssummary", "route_points_summary"],
  ["routesummary", "route_summary"],
  ["service_item_summary", "service_item_summary"],
  ["service_type", "service_type"],
  ["serviceitemsummary", "service_item_summary"],
  ["servicetype", "service_type"],
  ["status", "booking_status"],
  ["updated_at", "updated_at"],
  ["updatedat", "updated_at"],
]);

const ignoredSetupFields = new Set([
  "action",
  "action_name",
  "action_type",
  "actionname",
  "actiontype",
  "mode",
  "read_mode",
  "readmode",
  "type",
]);

const forbiddenFieldFragments = [
  "admin_note",
  "admin_notes",
  "auth",
  "auth_session",
  "billing",
  "calendar",
  "calendar_event_id",
  "customer_price",
  "customer_rate",
  "customer_rates",
  "debug",
  "debug_payload",
  "driver_payout",
  "driver_payout_rules",
  "finance",
  "internal",
  "internal_admin_notes",
  "invoice",
  "live_location",
  "location_url",
  "mock",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "photo",
  "pricing",
  "provider",
  "provider_send",
  "rate_override",
  "send",
  "secret",
  "secret_token",
  "service_role",
  "token",
] as const;

const forbiddenValueFragments = [
  "admin note",
  "billing",
  "customer rate",
  "debug",
  "driver payout",
  "internal admin",
  "internal note",
  "invoice",
  "parser",
  "payment",
  "paynow",
  "payout",
  "pricing",
  "rate override",
  "secret",
  "service role",
  "token",
] as const;

function disabledFields() {
  return {
    actionEnabled: false,
    action_enabled: false,
    dbReadEnabled: false,
    db_read_enabled: false,
    detailReadEnabled: false,
    detail_read_enabled: false,
    external_send: false,
    listReadEnabled: false,
    list_read_enabled: false,
    liveReadEnabled: false,
    liveWriteEnabled: false,
    live_read_enabled: false,
    live_write_enabled: false,
    no_live_read: true,
    no_op: true,
    readEnabled: false,
    read_enabled: false,
    writeEnabled: false,
    write_enabled: false,
  } as const;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function canonicalFieldName(key: string) {
  return fieldAliases.get(normalizeToken(key)) || null;
}

function hasForbiddenFieldFragment(key: string) {
  const normalized = normalizeToken(key);

  return forbiddenFieldFragments.some((fragment) => normalized.includes(fragment));
}

function hasForbiddenValueFragment(value: string) {
  const normalized = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

  return forbiddenValueFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength: number) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength || hasForbiddenValueFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeReadMode(input: Record<string, unknown>) {
  const value = input.read_mode ?? input.readMode ?? input.mode ?? input.type;
  const cleaned = safeText(value, 40)?.toLowerCase() || null;

  return cleaned === "list" || cleaned === "detail" ? cleaned : null;
}

function normalizeInput(input: unknown) {
  const source = asRecord(input);
  const forbiddenFields: string[] = [];
  const normalized: Record<string, unknown> = {};
  const unknownFields: string[] = [];

  for (const key of Object.keys(source)) {
    const normalizedKey = normalizeToken(key);
    const canonical = canonicalFieldName(key);
    const rawValue = source[key];

    if (ignoredSetupFields.has(normalizedKey)) {
      continue;
    }

    if (canonical) {
      if (typeof rawValue === "string" && hasForbiddenValueFragment(rawValue)) {
        forbiddenFields.push(key);
        continue;
      }

      if (normalized[canonical] === undefined) {
        normalized[canonical] = rawValue;
      }
      continue;
    }

    if (hasForbiddenFieldFragment(key)) {
      forbiddenFields.push(key);
    } else {
      unknownFields.push(key);
    }
  }

  return {
    forbiddenFields: unique(forbiddenFields),
    normalized,
    readMode: safeReadMode(source),
    unknownFields: unique(unknownFields),
  };
}

function fieldInvalid(normalizedFields: Record<string, unknown>, field: string, value: unknown) {
  return normalizedFields[field] !== undefined && value === null;
}

export function buildAdminBookingReadContractDisabledSetup(
  input: AdminBookingReadContractDisabledSetupInput = {},
): AdminBookingReadContractDisabledSetupResult {
  const { forbiddenFields, normalized, readMode, unknownFields } = normalizeInput(input);
  const bookingReadFields = {
    audit_summary: safeText(normalized.audit_summary, 500),
    booking_reference: safeText(normalized.booking_reference, 160),
    booking_status: safeText(normalized.booking_status, 120),
    contact_display_name: safeText(normalized.contact_display_name, 220),
    contact_email: safeText(normalized.contact_email, 220),
    contact_phone: safeText(normalized.contact_phone, 120),
    created_at: safeText(normalized.created_at, 120),
    customer_display_name: safeText(normalized.customer_display_name, 220),
    dropoff_location: safeText(normalized.dropoff_location, 500),
    pickup_datetime: safeText(normalized.pickup_datetime, 120),
    pickup_location: safeText(normalized.pickup_location, 500),
    route_points_summary: safeText(normalized.route_points_summary, 1000),
    route_summary: safeText(normalized.route_summary, 1000),
    service_item_summary: safeText(normalized.service_item_summary, 500),
    service_type: safeText(normalized.service_type, 120),
    updated_at: safeText(normalized.updated_at, 120),
  };
  const invalidFields = unique(
    allowedCanonicalFields
      .map((field) => (fieldInvalid(normalized, field, bookingReadFields[field]) ? field : ""))
      .filter(Boolean),
  );
  const bookingReadFieldNames = Object.entries(bookingReadFields)
    .filter(([, value]) => value !== null)
    .map(([field]) => field)
    .sort();
  const rejectedFields = unique([...forbiddenFields, ...unknownFields, ...invalidFields]);
  const ok = rejectedFields.length === 0;
  const status = ok ? "blocked" : "rejected";
  const resultLabel = ok ? "blocked/no-op" : "rejected/no-op";

  return {
    ...disabledFields(),
    actionName: "admin_booking_read_list_detail",
    actionType: "admin_booking_read_list_detail",
    action_name: "admin_booking_read_list_detail",
    action_type: "admin_booking_read_list_detail",
    allowed_field_names: allowedCanonicalFields,
    booking_read_field_names: bookingReadFieldNames,
    booking_read_fields: bookingReadFields,
    contractReady: ok,
    contract_ready: ok,
    delivery_surface: "admin_booking_read_contract_disabled_setup_only",
    forbidden_fields_present: forbiddenFields,
    invalid_fields: invalidFields,
    ok,
    readMode: readMode,
    read_mode: readMode,
    read_modes: ["list", "detail"],
    reason: ok ? "setup_only_disabled" : "unsafe_or_unknown_fields",
    rejected_fields: rejectedFields,
    result_label: resultLabel,
    status,
    unknown_fields: unknownFields,
    version: adminBookingReadContractDisabledSetupVersion,
  };
}

export function fallbackAdminBookingReadContractDisabledSetup() {
  return buildAdminBookingReadContractDisabledSetup({});
}
