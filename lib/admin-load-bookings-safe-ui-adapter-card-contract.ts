import "server-only";

export const adminLoadBookingsSafeUiAdapterCardContractVersion =
  "admin-load-bookings-safe-ui-adapter-card-contract-v1";

export type AdminLoadBookingsSafeUiAdapterCardContractInput = Record<string, unknown>;

export type AdminLoadBookingsSafeOperationalCardFields = {
  assigned_driver_display_name: string | null;
  assigned_driver_phone: string | null;
  assigned_driver_plate: string | null;
  assigned_driver_status: string | null;
  assigned_driver_vehicle_type: string | null;
  audit_summary: string | null;
  booking_id: string | null;
  booking_reference: string | null;
  booking_status: string | null;
  booking_type: string | null;
  booker_display_name: string | null;
  booker_email: string | null;
  booker_phone: string | null;
  child_seat_display: string | null;
  company_display_name: string | null;
  created_at: string | null;
  customer_display_name: string | null;
  dropoff_address: string | null;
  dropoff_datetime: string | null;
  extra_stop_display: string | null;
  job_card_display: string | null;
  pax_display: string | null;
  pickup_address: string | null;
  pickup_datetime: string | null;
  route_points_summary: string | null;
  route_summary: string | null;
  service_display: string | null;
  traveler_display_name: string | null;
  updated_at: string | null;
  vehicle_display: string | null;
};

export type AdminLoadBookingsSafeUiAdapterCardContractResult = {
  actionName: "load_bookings_safe_ui_adapter_card_contract";
  actionType: "load_bookings_safe_ui_adapter_card_contract";
  action_name: "load_bookings_safe_ui_adapter_card_contract";
  action_type: "load_bookings_safe_ui_adapter_card_contract";
  adapterReady: boolean;
  adapter_ready: boolean;
  allowed_field_names: readonly string[];
  appPageRuntimeWiringEnabled: false;
  app_page_runtime_wiring_enabled: false;
  cardReady: boolean;
  card_ready: boolean;
  dbReadEnabled: false;
  db_read_enabled: false;
  delivery_surface: "load_bookings_safe_ui_adapter_card_contract_setup_only";
  forbidden_fields_present: string[];
  invalid_fields: string[];
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
  readEnabled: false;
  read_enabled: false;
  reason: "setup_only_disabled" | "unsafe_or_unknown_fields";
  realUiCardRenderingEnabled: false;
  real_ui_card_rendering_enabled: false;
  rejected_fields: string[];
  result_label: "blocked/no-op" | "rejected/no-op";
  safe_card: AdminLoadBookingsSafeOperationalCardFields;
  safe_card_field_names: string[];
  savedBookingsEndpointChanged: false;
  saved_bookings_endpoint_changed: false;
  status: "blocked" | "rejected";
  uiAdapterRuntimeWiringEnabled: false;
  uiRenderingEnabled: false;
  ui_adapter_runtime_wiring_enabled: false;
  ui_rendering_enabled: false;
  unknown_fields: string[];
  version: typeof adminLoadBookingsSafeUiAdapterCardContractVersion;
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
  "mode",
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
    dbReadEnabled: false,
    db_read_enabled: false,
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
    readEnabled: false,
    read_enabled: false,
    realUiCardRenderingEnabled: false,
    real_ui_card_rendering_enabled: false,
    savedBookingsEndpointChanged: false,
    saved_bookings_endpoint_changed: false,
    uiAdapterRuntimeWiringEnabled: false,
    uiRenderingEnabled: false,
    ui_adapter_runtime_wiring_enabled: false,
    ui_rendering_enabled: false,
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
    unknownFields: unique(unknownFields),
  };
}

function fieldInvalid(
  normalizedFields: Record<string, unknown>,
  field: keyof AdminLoadBookingsSafeOperationalCardFields,
  value: unknown,
) {
  return normalizedFields[field] !== undefined && value === null;
}

export function buildAdminLoadBookingsSafeUiAdapterCardContract(
  input: AdminLoadBookingsSafeUiAdapterCardContractInput = {},
): AdminLoadBookingsSafeUiAdapterCardContractResult {
  const { forbiddenFields, normalized, unknownFields } = normalizeInput(input);
  const safeCard: AdminLoadBookingsSafeOperationalCardFields = {
    assigned_driver_display_name: safeText(normalized.assigned_driver_display_name, 220),
    assigned_driver_phone: safeText(normalized.assigned_driver_phone, 120),
    assigned_driver_plate: safeText(normalized.assigned_driver_plate, 120),
    assigned_driver_status: safeText(normalized.assigned_driver_status, 120),
    assigned_driver_vehicle_type: safeText(normalized.assigned_driver_vehicle_type, 120),
    audit_summary: safeText(normalized.audit_summary, 500),
    booking_id: safeText(normalized.booking_id, 160),
    booking_reference: safeText(normalized.booking_reference, 160),
    booking_status: safeText(normalized.booking_status, 120),
    booking_type: safeText(normalized.booking_type, 120),
    booker_display_name: safeText(normalized.booker_display_name, 220),
    booker_email: safeText(normalized.booker_email, 220),
    booker_phone: safeText(normalized.booker_phone, 120),
    child_seat_display: safeText(normalized.child_seat_display, 220),
    company_display_name: safeText(normalized.company_display_name, 220),
    created_at: safeText(normalized.created_at, 120),
    customer_display_name: safeText(normalized.customer_display_name, 220),
    dropoff_address: safeText(normalized.dropoff_address, 500),
    dropoff_datetime: safeText(normalized.dropoff_datetime, 120),
    extra_stop_display: safeText(normalized.extra_stop_display, 220),
    job_card_display: safeText(normalized.job_card_display, 500),
    pax_display: safeText(normalized.pax_display, 120),
    pickup_address: safeText(normalized.pickup_address, 500),
    pickup_datetime: safeText(normalized.pickup_datetime, 120),
    route_points_summary: safeText(normalized.route_points_summary, 1000),
    route_summary: safeText(normalized.route_summary, 1000),
    service_display: safeText(normalized.service_display, 220),
    traveler_display_name: safeText(normalized.traveler_display_name, 220),
    updated_at: safeText(normalized.updated_at, 120),
    vehicle_display: safeText(normalized.vehicle_display, 220),
  };
  const invalidFields = unique(
    allowedCanonicalFields
      .map((field) => (fieldInvalid(normalized, field, safeCard[field]) ? field : ""))
      .filter(Boolean),
  );
  const safeCardFieldNames = Object.entries(safeCard)
    .filter(([, value]) => value !== null)
    .map(([field]) => field)
    .sort();
  const rejectedFields = unique([...forbiddenFields, ...unknownFields, ...invalidFields]);
  const ok = rejectedFields.length === 0;
  const status = ok ? "blocked" : "rejected";

  return {
    ...disabledFields(),
    actionName: "load_bookings_safe_ui_adapter_card_contract",
    actionType: "load_bookings_safe_ui_adapter_card_contract",
    action_name: "load_bookings_safe_ui_adapter_card_contract",
    action_type: "load_bookings_safe_ui_adapter_card_contract",
    adapterReady: ok,
    adapter_ready: ok,
    allowed_field_names: allowedCanonicalFields,
    cardReady: ok,
    card_ready: ok,
    delivery_surface: "load_bookings_safe_ui_adapter_card_contract_setup_only",
    forbidden_fields_present: forbiddenFields,
    invalid_fields: invalidFields,
    ok,
    reason: ok ? "setup_only_disabled" : "unsafe_or_unknown_fields",
    rejected_fields: rejectedFields,
    result_label: ok ? "blocked/no-op" : "rejected/no-op",
    safe_card: safeCard,
    safe_card_field_names: safeCardFieldNames,
    status,
    unknown_fields: unknownFields,
    version: adminLoadBookingsSafeUiAdapterCardContractVersion,
  };
}

export function fallbackAdminLoadBookingsSafeUiAdapterCardContract() {
  return buildAdminLoadBookingsSafeUiAdapterCardContract({});
}
