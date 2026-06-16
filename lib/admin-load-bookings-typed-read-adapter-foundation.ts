import "server-only";

import {
  buildAdminLoadBookingsSafeDtoContract,
  type AdminLoadBookingsSafeDtoFields,
} from "./admin-load-bookings-safe-dto-contract";

export const adminLoadBookingsTypedReadAdapterFoundationVersion =
  "admin-load-bookings-typed-read-adapter-foundation-v1";

export type AdminLoadBookingsTypedReadAdapterFoundationInput = Record<string, unknown>;

export type AdminLoadBookingsTypedReadAdapterFoundationResult = {
  actionName: "load_bookings_typed_read_adapter_foundation";
  actionType: "load_bookings_typed_read_adapter_foundation";
  action_name: "load_bookings_typed_read_adapter_foundation";
  action_type: "load_bookings_typed_read_adapter_foundation";
  adapterReady: boolean;
  adapter_ready: boolean;
  allowed_field_names: readonly string[];
  appPageRuntimeWiringEnabled: false;
  app_page_runtime_wiring_enabled: false;
  databaseClientEnabled: false;
  database_client_enabled: false;
  dbReadEnabled: false;
  db_read_enabled: false;
  delivery_surface: "load_bookings_typed_read_adapter_foundation_setup_only";
  dto_field_names: string[];
  endpointChanged: false;
  endpoint_changed: false;
  forbidden_fields_present: string[];
  foundationReady: boolean;
  foundation_ready: boolean;
  invalid_fields: string[];
  legacyClientEnabled: false;
  legacy_client_enabled: false;
  liveReadEnabled: false;
  liveWriteEnabled: false;
  live_read_enabled: false;
  live_write_enabled: false;
  loadBookingsEndpointChanged: false;
  loadBookingsRuntimeWiringEnabled: false;
  load_bookings_endpoint_changed: false;
  load_bookings_runtime_wiring_enabled: false;
  no_live_read: true;
  no_op: true;
  ok: boolean;
  parserChanged: false;
  parser_changed: false;
  readEnabled: false;
  readMode: "list" | "detail" | null;
  read_enabled: false;
  read_mode: "list" | "detail" | null;
  read_modes: readonly ["list", "detail"];
  rejected_fields: string[];
  requested_field_names: string[];
  result_label: "blocked/no-op" | "rejected/no-op";
  safe_dto: AdminLoadBookingsSafeDtoFields;
  safe_read_field_names: string[];
  saveBookingChanged: false;
  save_booking_changed: false;
  savedBookingsEndpointChanged: false;
  saved_bookings_endpoint_changed: false;
  status: "blocked" | "rejected";
  unknown_fields: string[];
  version: typeof adminLoadBookingsTypedReadAdapterFoundationVersion;
  writeEnabled: false;
  write_enabled: false;
};

const allowedCanonicalFields = [
  "assigned_driver_display_name",
  "assigned_driver_phone",
  "assigned_driver_plate",
  "assigned_driver_status",
  "assigned_driver_vehicle_type",
  "audit_summary",
  "booking_id",
  "booking_reference",
  "booking_status",
  "booking_type",
  "booker_display_name",
  "booker_email",
  "booker_phone",
  "child_seat_display",
  "company_display_name",
  "created_at",
  "customer_display_name",
  "dropoff_address",
  "dropoff_datetime",
  "extra_stop_display",
  "job_card_display",
  "pax_display",
  "pickup_address",
  "pickup_datetime",
  "route_points_summary",
  "route_summary",
  "service_display",
  "traveler_display_name",
  "updated_at",
  "vehicle_display",
] as const;

const fieldAliases = new Map<string, (typeof allowedCanonicalFields)[number]>([
  ["assigned_driver_contact", "assigned_driver_phone"],
  ["assigned_driver_display_name", "assigned_driver_display_name"],
  ["assigned_driver_name", "assigned_driver_display_name"],
  ["assigned_driver_phone", "assigned_driver_phone"],
  ["assigned_driver_plate", "assigned_driver_plate"],
  ["assigned_driver_status", "assigned_driver_status"],
  ["assigned_driver_vehicle", "assigned_driver_vehicle_type"],
  ["assigned_driver_vehicle_type", "assigned_driver_vehicle_type"],
  ["audit_summary", "audit_summary"],
  ["booking_id", "booking_id"],
  ["booking_ref", "booking_reference"],
  ["booking_reference", "booking_reference"],
  ["booking_status", "booking_status"],
  ["booking_type", "booking_type"],
  ["booker_display_name", "booker_display_name"],
  ["booker_email", "booker_email"],
  ["booker_phone", "booker_phone"],
  ["child_seat_display", "child_seat_display"],
  ["company_display_name", "company_display_name"],
  ["created_at", "created_at"],
  ["customer_display_name", "customer_display_name"],
  ["dropoff_address", "dropoff_address"],
  ["dropoff_datetime", "dropoff_datetime"],
  ["dropoff_location", "dropoff_address"],
  ["extra_stop_display", "extra_stop_display"],
  ["id", "booking_id"],
  ["job_card_display", "job_card_display"],
  ["pax", "pax_display"],
  ["pax_display", "pax_display"],
  ["pickup_address", "pickup_address"],
  ["pickup_datetime", "pickup_datetime"],
  ["pickup_location", "pickup_address"],
  ["ref", "booking_reference"],
  ["reference", "booking_reference"],
  ["route_points_summary", "route_points_summary"],
  ["route_summary", "route_summary"],
  ["service_display", "service_display"],
  ["service_type", "service_display"],
  ["status", "booking_status"],
  ["traveler_display_name", "traveler_display_name"],
  ["updated_at", "updated_at"],
  ["vehicle_display", "vehicle_display"],
  ["vehicle_type", "vehicle_display"],
]);

const ignoredSetupFields = new Set([
  "action",
  "action_name",
  "action_type",
  "actionname",
  "actiontype",
  "fields",
  "mode",
  "read_mode",
  "readmode",
  "requested_fields",
  "requestedfields",
  "safe_fields",
  "safefields",
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
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
  "customer_price_amount",
  "customer_price_override_reason",
  "customer_rate",
  "customer_rate_override",
  "customer_rates",
  "debug",
  "debug_payload",
  "driver_dispatch_include_payout",
  "driver_notes",
  "driver_payout",
  "driver_payout_amount",
  "driver_payout_max",
  "driver_payout_min",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_rules",
  "driver_payout_unit",
  "extra_stop_payout",
  "extra_stop_surcharge",
  "finance",
  "internal",
  "internal_admin_notes",
  "invoice",
  "live_location",
  "location_photo_calendar",
  "location_url",
  "midnight_payout",
  "midnight_surcharge",
  "mock",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "photo",
  "pricing",
  "pricing_source",
  "provider",
  "provider_send",
  "rate_override",
  "secret",
  "secret_token",
  "send",
  "service_role",
  "token",
] as const;

const forbiddenValueFragments = [
  "admin finance",
  "admin note",
  "billing",
  "customer price",
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
    appPageRuntimeWiringEnabled: false,
    app_page_runtime_wiring_enabled: false,
    databaseClientEnabled: false,
    database_client_enabled: false,
    dbReadEnabled: false,
    db_read_enabled: false,
    endpointChanged: false,
    endpoint_changed: false,
    legacyClientEnabled: false,
    legacy_client_enabled: false,
    liveReadEnabled: false,
    liveWriteEnabled: false,
    live_read_enabled: false,
    live_write_enabled: false,
    loadBookingsEndpointChanged: false,
    loadBookingsRuntimeWiringEnabled: false,
    load_bookings_endpoint_changed: false,
    load_bookings_runtime_wiring_enabled: false,
    no_live_read: true,
    no_op: true,
    parserChanged: false,
    parser_changed: false,
    readEnabled: false,
    read_enabled: false,
    saveBookingChanged: false,
    save_booking_changed: false,
    savedBookingsEndpointChanged: false,
    saved_bookings_endpoint_changed: false,
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

function safeReadMode(input: Record<string, unknown>): "list" | "detail" | null {
  const value = input.read_mode ?? input.readMode ?? input.mode ?? input.type;
  const cleaned = safeText(value, 40)?.toLowerCase() || null;

  return cleaned === "list" || cleaned === "detail" ? cleaned : null;
}

function requestedFieldValues(source: Record<string, unknown>) {
  const raw =
    source.requested_fields ??
    source.requestedFields ??
    source.safe_fields ??
    source.safeFields ??
    source.fields;

  if (Array.isArray(raw)) {
    return raw.map((field) => String(field));
  }

  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeInput(input: unknown) {
  const source = asRecord(input);
  const forbiddenFields: string[] = [];
  const normalized: Record<string, unknown> = {};
  const requestedFields: string[] = [];
  const unknownFields: string[] = [];

  for (const field of requestedFieldValues(source)) {
    const canonical = canonicalFieldName(field);

    if (canonical) {
      requestedFields.push(canonical);
    } else if (hasForbiddenFieldFragment(field) || hasForbiddenValueFragment(field)) {
      forbiddenFields.push(field);
    } else {
      unknownFields.push(field);
    }
  }

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
    requestedFields: unique(requestedFields),
    unknownFields: unique(unknownFields),
  };
}

function fieldInvalid(
  normalizedFields: Record<string, unknown>,
  field: keyof AdminLoadBookingsSafeDtoFields,
  value: unknown,
) {
  return normalizedFields[field] !== undefined && value === null;
}

export function buildAdminLoadBookingsTypedReadAdapterFoundation(
  input: AdminLoadBookingsTypedReadAdapterFoundationInput = {},
): AdminLoadBookingsTypedReadAdapterFoundationResult {
  const { forbiddenFields, normalized, readMode, requestedFields, unknownFields } = normalizeInput(input);
  const safeDtoContract = buildAdminLoadBookingsSafeDtoContract({
    ...normalized,
    ...(readMode ? { read_mode: readMode } : {}),
  });
  const invalidFields = unique(
    allowedCanonicalFields
      .map((field) => (fieldInvalid(normalized, field, safeDtoContract.safe_dto[field]) ? field : ""))
      .filter(Boolean),
  );
  const safeDtoFieldNames = Object.entries(safeDtoContract.safe_dto)
    .filter(([, value]) => value !== null)
    .map(([field]) => field)
    .sort();
  const safeReadFieldNames = requestedFields.length > 0 ? requestedFields : safeDtoFieldNames;
  const rejectedFields = unique([
    ...forbiddenFields,
    ...unknownFields,
    ...invalidFields,
    ...safeDtoContract.rejected_fields,
  ]);
  const ok = rejectedFields.length === 0;

  return {
    ...disabledFields(),
    actionName: "load_bookings_typed_read_adapter_foundation",
    actionType: "load_bookings_typed_read_adapter_foundation",
    action_name: "load_bookings_typed_read_adapter_foundation",
    action_type: "load_bookings_typed_read_adapter_foundation",
    adapterReady: ok,
    adapter_ready: ok,
    allowed_field_names: allowedCanonicalFields,
    delivery_surface: "load_bookings_typed_read_adapter_foundation_setup_only",
    dto_field_names: safeDtoFieldNames,
    forbidden_fields_present: unique([...forbiddenFields, ...safeDtoContract.forbidden_fields_present]),
    foundationReady: ok,
    foundation_ready: ok,
    invalid_fields: invalidFields,
    ok,
    readMode: readMode,
    read_mode: readMode,
    read_modes: ["list", "detail"],
    rejected_fields: rejectedFields,
    requested_field_names: requestedFields,
    result_label: ok ? "blocked/no-op" : "rejected/no-op",
    safe_dto: safeDtoContract.safe_dto,
    safe_read_field_names: safeReadFieldNames,
    status: ok ? "blocked" : "rejected",
    unknown_fields: unique([...unknownFields, ...safeDtoContract.unknown_fields]),
    version: adminLoadBookingsTypedReadAdapterFoundationVersion,
  };
}

export function fallbackAdminLoadBookingsTypedReadAdapterFoundation() {
  return buildAdminLoadBookingsTypedReadAdapterFoundation({});
}
