import "server-only";

import {
  buildAdminLoadBookingsSafeDtoContract,
  type AdminLoadBookingsSafeDtoFields,
} from "./admin-load-bookings-safe-dto-contract";
import {
  buildAdminLoadBookingsSafeUiAdapterCardContract,
  type AdminLoadBookingsSafeOperationalCardFields,
} from "./admin-load-bookings-safe-ui-adapter-card-contract";

export const adminLoadBookingsOperationalRecordMapperVersion =
  "admin-load-bookings-operational-record-mapper-v1";

export type AdminLoadBookingsOperationalRecordMapperInput = Record<string, unknown>;

export type AdminLoadBookingsOperationalRecordMapperResult = {
  actionName: "load_bookings_operational_record_mapper";
  actionType: "load_bookings_operational_record_mapper";
  action_name: "load_bookings_operational_record_mapper";
  action_type: "load_bookings_operational_record_mapper";
  appPageRuntimeWiringEnabled: false;
  app_page_runtime_wiring_enabled: false;
  dbReadEnabled: false;
  db_read_enabled: false;
  delivery_surface: "load_bookings_operational_record_mapper_setup_only";
  endpointChanged: false;
  endpoint_changed: false;
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
  mapperReady: boolean;
  mapper_ready: boolean;
  no_live_read: true;
  no_op: true;
  ok: boolean;
  parserChanged: false;
  parser_changed: false;
  quarantined_field_names: string[];
  readEnabled: false;
  read_enabled: false;
  rejected_fields: string[];
  result_label: "mapped/no-live" | "rejected/no-live";
  safe_card: AdminLoadBookingsSafeOperationalCardFields;
  safe_dto: AdminLoadBookingsSafeDtoFields;
  safe_field_names: string[];
  saveBookingChanged: false;
  save_booking_changed: false;
  savedBookingsEndpointChanged: false;
  saved_bookings_endpoint_changed: false;
  status: "mapped" | "rejected";
  version: typeof adminLoadBookingsOperationalRecordMapperVersion;
  writeEnabled: false;
  write_enabled: false;
};

const safeOperationalFieldNames = [
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

function disabledFields() {
  return {
    appPageRuntimeWiringEnabled: false,
    app_page_runtime_wiring_enabled: false,
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

function hasForbiddenFieldFragment(key: string) {
  const normalized = normalizeToken(key);

  return forbiddenFieldFragments.some((fragment) => normalized.includes(fragment));
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function nestedText(source: Record<string, unknown>, objectKey: string, fieldKey: string) {
  return cleanText(asRecord(source[objectKey])[fieldKey]);
}

function collectQuarantinedFieldNames(source: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const fieldName = prefix ? `${prefix}.${key}` : key;
    const current = hasForbiddenFieldFragment(key) ? [fieldName] : [];

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return [...current, ...collectQuarantinedFieldNames(value as Record<string, unknown>, fieldName)];
    }

    return current;
  });
}

function routePoints(source: Record<string, unknown>) {
  const route = cleanText(source.route);

  if (route) {
    const points = route
      .split(/\s*>\s*/)
      .map((point) => cleanText(point))
      .filter((point): point is string => Boolean(point));

    if (points.length >= 2) {
      return points;
    }
  }

  return [cleanText(source.pickup_address), cleanText(source.dropoff_address)].filter(
    (point): point is string => Boolean(point),
  );
}

function childSeatDisplay(source: Record<string, unknown>) {
  if (source.child_seat_required !== true) {
    return null;
  }

  const count = cleanText(source.child_seat_count) || "1";
  const type = cleanText(source.child_seat_type);

  return type ? `Child seat x${count}: ${type}` : `Child seat x${count}`;
}

function extraStopDisplay(source: Record<string, unknown>, points: string[]) {
  const rawCount = Number(source.extra_stop_count);
  const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.trunc(rawCount) : Math.max(points.length - 2, 0);

  return count > 0 ? `Extra stops: ${count}` : null;
}

function auditSummary(source: Record<string, unknown>) {
  const updatedAt = cleanText(source.updated_at);
  const createdAt = cleanText(source.created_at);

  if (updatedAt) {
    return `Updated ${updatedAt}`;
  }

  return createdAt ? `Created ${createdAt}` : null;
}

function sourceToSafeFields(input: unknown): Record<(typeof safeOperationalFieldNames)[number], unknown> {
  const source = asRecord(input);
  const points = routePoints(source);
  const bookingReference = cleanText(source.booking_reference) || cleanText(source.reference) || cleanText(source.id);
  const pickupAddress = cleanText(source.pickup_address) || points[0] || null;
  const dropoffAddress = cleanText(source.dropoff_address) || points[points.length - 1] || null;
  const routePointsSummary =
    points.length >= 2
      ? points.join(" > ")
      : [pickupAddress, dropoffAddress].filter(Boolean).join(" > ");

  return {
    assigned_driver_display_name: cleanText(source.driver_name),
    assigned_driver_phone: cleanText(source.driver_contact),
    assigned_driver_plate: cleanText(source.driver_plate_number),
    assigned_driver_status: null,
    assigned_driver_vehicle_type: null,
    audit_summary: auditSummary(source),
    booking_id: cleanText(source.id),
    booking_reference: bookingReference,
    booking_status: cleanText(source.status),
    booking_type: cleanText(source.booking_type),
    booker_display_name: nestedText(source, "bookers", "booker_name"),
    booker_email: nestedText(source, "bookers", "email"),
    booker_phone: nestedText(source, "bookers", "phone"),
    child_seat_display: childSeatDisplay(source),
    company_display_name: nestedText(source, "companies", "company_name"),
    created_at: cleanText(source.created_at),
    customer_display_name: nestedText(source, "travelers", "traveler_name") || nestedText(source, "bookers", "booker_name"),
    dropoff_address: dropoffAddress,
    dropoff_datetime: null,
    extra_stop_display: extraStopDisplay(source, points),
    job_card_display: cleanText(source.flight_no) ? `Flight ${cleanText(source.flight_no)}` : null,
    pax_display: cleanText(source.pax) || "1",
    pickup_address: pickupAddress,
    pickup_datetime: cleanText(source.pickup_time),
    route_points_summary: routePointsSummary || null,
    route_summary: routePointsSummary || null,
    service_display: cleanText(source.booking_type),
    traveler_display_name: nestedText(source, "travelers", "traveler_name") || nestedText(source, "bookers", "booker_name"),
    updated_at: cleanText(source.updated_at),
    vehicle_display: cleanText(source.vehicle),
  };
}

function compactDefinedFields(fields: Record<(typeof safeOperationalFieldNames)[number], unknown>) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined),
  );
}

export function buildAdminLoadBookingsOperationalRecordMapper(
  input: AdminLoadBookingsOperationalRecordMapperInput = {},
): AdminLoadBookingsOperationalRecordMapperResult {
  const source = asRecord(input);
  const safeFields = sourceToSafeFields(source);
  const safeContractInput = compactDefinedFields(safeFields);
  const safeDtoContract = buildAdminLoadBookingsSafeDtoContract(safeContractInput);
  const safeCardContract = buildAdminLoadBookingsSafeUiAdapterCardContract(safeContractInput);
  const rejectedFields = unique([...safeDtoContract.rejected_fields, ...safeCardContract.rejected_fields]);
  const invalidFields = unique([...safeDtoContract.invalid_fields, ...safeCardContract.invalid_fields]);
  const ok = rejectedFields.length === 0;

  return {
    ...disabledFields(),
    actionName: "load_bookings_operational_record_mapper",
    actionType: "load_bookings_operational_record_mapper",
    action_name: "load_bookings_operational_record_mapper",
    action_type: "load_bookings_operational_record_mapper",
    delivery_surface: "load_bookings_operational_record_mapper_setup_only",
    invalid_fields: invalidFields,
    mapperReady: ok,
    mapper_ready: ok,
    ok,
    quarantined_field_names: collectQuarantinedFieldNames(source),
    rejected_fields: rejectedFields,
    result_label: ok ? "mapped/no-live" : "rejected/no-live",
    safe_card: safeCardContract.safe_card,
    safe_dto: safeDtoContract.safe_dto,
    safe_field_names: [...safeOperationalFieldNames],
    status: ok ? "mapped" : "rejected",
    version: adminLoadBookingsOperationalRecordMapperVersion,
  };
}

export function fallbackAdminLoadBookingsOperationalRecordMapper() {
  return buildAdminLoadBookingsOperationalRecordMapper({});
}
