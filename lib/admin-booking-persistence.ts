import {
  createAdminBookingThroughSupabaseAdapter,
  listAdminBookingsThroughSupabaseAdapter,
  updateAdminBookingThroughSupabaseAdapter,
  type AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";

export type AdminBookingRecordInput = {
  booking_reference?: string | null;
  source_channel?: string | null;
  source_surface?: string | null;
  customer_id?: number | string | null;
  pickup_datetime?: string | null;
  pickup_at?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  route_type?: string | null;
  service_type?: string | null;
  route_summary?: string | null;
  customer_display_name?: string | null;
  contact_display_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  passenger_name?: string | null;
  passenger_phone?: string | null;
  pax_count?: number | null;
  luggage_count?: number | null;
  vehicle_type_or_category?: string | null;
  customer_facing_status?: string | null;
  admin_internal_status?: string | null;
  short_notice_review_status?: string | null;
  request_review_status?: string | null;
  change_review_status?: string | null;
  cancellation_review_status?: string | null;
  parser_source_reference?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AdminBookingRoutePointInput = {
  point_type?: "pickup" | "dropoff" | "stop" | "waypoint" | "extra_stop";
  sequence_number?: number | null;
  sequence?: number | null;
  location_text?: string | null;
  location?: string | null;
  timing_note?: string | null;
  notes?: string | null;
};

export type AdminBookingServiceItemInput = {
  service_item_type?: "child_seat" | "extra_stop" | "waiting_time" | "midnight_charge";
  item_type?: "child_seat" | "extra_stop" | "waiting_time" | "midnight" | "luggage" | "vehicle_request" | "other";
  quantity?: number | null;
  blocks_count?: number | null;
  notes?: string | null;
};

export type AdminBookingPersistenceInput = {
  booking: AdminBookingRecordInput;
  route_points: AdminBookingRoutePointInput[];
  service_items: AdminBookingServiceItemInput[];
};

export type AdminBookingPersistenceUpdateInput = AdminBookingPersistenceInput & {
  target_booking_reference: string;
};

export type CustomerBookingRequestInput = {
  companyName?: string | null;
  contactNo?: string | null;
  emailAddress?: string | null;
  passengerName?: string | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
  flightNumber?: string | null;
  pickupLocation?: string | null;
  dropoffLocation?: string | null;
  serviceType?: string | null;
  vehicleType?: string | null;
  passengerCount?: string | number | null;
  luggage?: string | number | null;
  extraStops?: string | null;
};

export type AdminBookingPersistenceRecord = Required<
  Pick<AdminBookingRecordInput, "booking_reference">
> &
  Omit<AdminBookingRecordInput, "booking_reference"> & {
    route_points: AdminBookingRoutePointInput[];
    service_items: AdminBookingServiceItemInput[];
  };

export type AdminBookingPersistenceSafeErrorCategory =
  | "auth_or_key_rejected"
  | "client_init_failed"
  | "column_missing"
  | "permission_or_rls_denied"
  | "table_unreachable"
  | "unknown_adapter_failure";

export type AdminBookingResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      category?: AdminBookingPersistenceSafeErrorCategory;
      error: string;
      status: number;
    };

export type AdminBookingAuditInput = {
  action: string;
  actor_label: string;
  change_summary: string;
  source_route: string;
};

type UnknownRecord = Record<string, unknown>;

const adminReviewRequiredStatus = "Admin Review Required";
const shortNoticeWindowMs = 24 * 60 * 60 * 1000;
const maxTextLength = 1000;
const maxRoutePoints = 20;
const maxServiceItems = 12;

export const adminBookingPersistenceContractVersion =
  "stage-4a-376-admin-only-safe-operational-adapter-v1";

const createPayloadTopLevelFields = new Set(["booking", "route_points", "service_items"]);
const updatePayloadTopLevelFields = new Set([
  "target_booking_reference",
  "booking",
  "route_points",
  "service_items",
]);
const customerBookingRequestFields = new Set([
  "companyName",
  "contactNo",
  "emailAddress",
  "passengerName",
  "pickupDate",
  "pickupTime",
  "flightNumber",
  "pickupLocation",
  "dropoffLocation",
  "serviceType",
  "vehicleType",
  "passengerCount",
  "luggage",
  "extraStops",
]);

const bookingFields = new Set([
  "booking_reference",
  "source_channel",
  "source_surface",
  "customer_id",
  "pickup_datetime",
  "pickup_at",
  "pickup_location",
  "dropoff_location",
  "route_type",
  "service_type",
  "route_summary",
  "customer_display_name",
  "contact_display_name",
  "contact_phone",
  "contact_email",
  "passenger_name",
  "passenger_phone",
  "pax_count",
  "luggage_count",
  "vehicle_type_or_category",
  "customer_facing_status",
  "admin_internal_status",
  "short_notice_review_status",
  "request_review_status",
  "change_review_status",
  "cancellation_review_status",
  "parser_source_reference",
  "created_at",
  "updated_at",
]);

const routePointFields = new Set([
  "point_type",
  "sequence_number",
  "sequence",
  "location_text",
  "location",
  "timing_note",
  "notes",
  "created_at",
  "updated_at",
]);

const serviceItemFields = new Set([
  "service_item_type",
  "item_type",
  "quantity",
  "blocks_count",
  "notes",
  "created_at",
  "updated_at",
]);

const requiredBookingTextFields: Array<keyof AdminBookingRecordInput> = [
  "booking_reference",
  "pickup_datetime",
  "pickup_location",
  "dropoff_location",
  "route_type",
  "customer_display_name",
  "contact_phone",
];

const allowedRoutePointTypes = new Set(["pickup", "dropoff", "stop", "waypoint", "extra_stop"]);
const allowedServiceItemTypes = new Set([
  "child_seat",
  "extra_stop",
  "waiting_time",
  "midnight_charge",
  "midnight",
]);

const forbiddenFieldFragments = [
  "customer_price",
  "customer_charge",
  "quoted_price",
  "rate_amount",
  "fare_amount",
  "amount_due",
  "billing",
  "billing_automation",
  "invoice",
  "invoice_number",
  "payment",
  "payment_link",
  "pdf",
  "pdf_link",
  "stripe",
  "paynow",
  "pay_now",
  "pay_now_payout",
  "driver_payout",
  "payout",
  "payout_comparison",
  "finance",
  "finance_note",
  "finance_notes",
  "internal_finance_note",
  "internal_finance_notes",
  "notification",
  "notification_delivery",
  "send_state",
  "send_log",
  "whatsapp_send",
  "sms_send",
  "email_send",
  "telegram",
  "proof",
  "photo",
  "live_location",
  "auth_link",
  "customer_auth",
  "driver_auth",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "ai_prompt",
  "parser_prompt",
  "parser_learning",
  "parser_debug",
  "debug",
  "mock_archive",
  "mock_qa",
  "qa_archive",
  "dev_workbench",
  "mock_workbench",
  "service_role",
  "server_only",
  "server_secret",
  "internal_admin_note",
  "admin_note",
  "internal_note",
  "manual_extra_charge",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeFieldName(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function isForbiddenFieldName(value: string) {
  const normalized = normalizeFieldName(value);

  return forbiddenFieldFragments.some((fragment) => normalized.includes(fragment));
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
    const keyLeaks = isForbiddenFieldName(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function findUnknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function forbiddenFieldResult<T>(scope: string): AdminBookingResult<T> {
  return {
    ok: false,
    status: 400,
    error: `Forbidden ${scope} fields rejected.`,
  };
}

function hasOwn(record: UnknownRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxTextLength) : null;
}

function validTargetBookingReference(value: string | null | undefined) {
  const cleaned = textOrNull(value);

  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) ? cleaned : null;
}

function integerOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function pickupIsUnderTwentyFourHours(value: string | null | undefined) {
  const pickupMs = value ? new Date(value).getTime() : Number.NaN;

  return Number.isFinite(pickupMs) && pickupMs - Date.now() < shortNoticeWindowMs;
}

function validDateTime(value: string | null | undefined) {
  const parsedTime = value ? new Date(value).getTime() : Number.NaN;

  return Number.isFinite(parsedTime);
}

function createCustomerBookingRequestReference() {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const randomSuffix = Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(2, 8).toUpperCase();

  return `CUST-${timestamp}-${randomSuffix || "REQ001"}`;
}

function validCustomerPickupDateTime(dateValue: string | null, timeValue: string | null) {
  const dateMatch = dateValue?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeValue?.match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  const pickupDateTime = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${String(hours).padStart(2, "0")}:${String(
    minutes,
  ).padStart(2, "0")}:00+08:00`;

  return validDateTime(pickupDateTime) ? pickupDateTime : null;
}

function splitCustomerExtraStops(value: string | null) {
  const cleanedValue = textOrNull(value);

  if (!cleanedValue) {
    return [];
  }

  return cleanedValue
    .split(/\s*(?:>|;|\n)\s*/g)
    .map((part) => textOrNull(part))
    .filter((part): part is string => Boolean(part));
}

function sanitizeBooking(record: UnknownRecord): AdminBookingRecordInput {
  const sourceChannel = textOrNull(record.source_channel);
  const sourceSurface = textOrNull(record.source_surface);
  const pickupDateTime = textOrNull(record.pickup_datetime) || textOrNull(record.pickup_at);
  const routeType = textOrNull(record.route_type) || textOrNull(record.service_type);
  const serviceType = textOrNull(record.service_type) || textOrNull(record.route_type);
  const pickupLocation = textOrNull(record.pickup_location);
  const dropoffLocation = textOrNull(record.dropoff_location);
  const sanitized = {
    booking_reference: textOrNull(record.booking_reference),
    source_channel: sourceChannel || sourceSurface,
    source_surface: sourceSurface || sourceChannel,
    customer_id: integerOrNull(record.customer_id),
    pickup_datetime: pickupDateTime,
    pickup_at: pickupDateTime,
    pickup_location: pickupLocation,
    dropoff_location: dropoffLocation,
    route_type: routeType,
    service_type: serviceType,
    route_summary:
      textOrNull(record.route_summary) ||
      [pickupLocation, dropoffLocation].filter(Boolean).join(" > ") ||
      null,
    customer_display_name: textOrNull(record.customer_display_name),
    contact_display_name: textOrNull(record.contact_display_name),
    contact_phone: textOrNull(record.contact_phone),
    contact_email: textOrNull(record.contact_email),
    passenger_name: textOrNull(record.passenger_name),
    passenger_phone: textOrNull(record.passenger_phone),
    pax_count: integerOrNull(record.pax_count),
    luggage_count: integerOrNull(record.luggage_count),
    vehicle_type_or_category: textOrNull(record.vehicle_type_or_category),
    customer_facing_status: textOrNull(record.customer_facing_status),
    admin_internal_status: textOrNull(record.admin_internal_status),
    short_notice_review_status: textOrNull(record.short_notice_review_status),
    request_review_status: textOrNull(record.request_review_status),
    change_review_status: textOrNull(record.change_review_status),
    cancellation_review_status: textOrNull(record.cancellation_review_status),
    parser_source_reference: textOrNull(record.parser_source_reference),
  } satisfies AdminBookingRecordInput;

  if (pickupIsUnderTwentyFourHours(sanitized.pickup_datetime)) {
    sanitized.admin_internal_status = adminReviewRequiredStatus;
    sanitized.short_notice_review_status = adminReviewRequiredStatus;
  }

  return sanitized;
}

function sanitizeRoutePoints(value: unknown[]): AdminBookingResult<AdminBookingRoutePointInput[]> {
  if (value.length > maxRoutePoints) {
    return {
      ok: false,
      status: 400,
      error: `Too many admin booking route points rejected. Maximum allowed: ${maxRoutePoints}.`,
    };
  }

  const routePoints: AdminBookingRoutePointInput[] = [];

  for (const [index, item] of value.entries()) {
    const record = asRecord(item);
    const pointType = textOrNull(record.point_type);
    const locationText = textOrNull(record.location_text) || textOrNull(record.location);
    const sequenceNumber = hasOwn(record, "sequence_number")
      ? integerOrNull(record.sequence_number)
      : hasOwn(record, "sequence")
        ? integerOrNull(record.sequence)
      : index + 1;

    if (!pointType || !allowedRoutePointTypes.has(pointType)) {
      return {
        ok: false,
        status: 400,
        error: `Malformed admin booking route point rejected at route_points[${index}].`,
      };
    }

    if (!locationText) {
      return {
        ok: false,
        status: 400,
        error: `Missing required route location at route_points[${index}].location_text.`,
      };
    }

    if (sequenceNumber === null || sequenceNumber < 1) {
      return {
        ok: false,
        status: 400,
        error: `Malformed route sequence rejected at route_points[${index}].sequence_number.`,
      };
    }

    routePoints.push({
      point_type: pointType as AdminBookingRoutePointInput["point_type"],
      sequence_number: sequenceNumber,
      sequence: sequenceNumber,
      location_text: locationText,
      location: locationText,
      timing_note: textOrNull(record.timing_note),
      notes: textOrNull(record.notes) || textOrNull(record.timing_note),
    });
  }

  return {
    ok: true,
    data: routePoints,
  };
}

function sanitizeServiceItems(value: unknown[]): AdminBookingResult<AdminBookingServiceItemInput[]> {
  if (value.length > maxServiceItems) {
    return {
      ok: false,
      status: 400,
      error: `Too many admin booking service items rejected. Maximum allowed: ${maxServiceItems}.`,
    };
  }

  const serviceItems: AdminBookingServiceItemInput[] = [];

  for (const [index, item] of value.entries()) {
    const record = asRecord(item);
    const requestedItemType = textOrNull(record.service_item_type) || textOrNull(record.item_type);
    const itemType = requestedItemType === "midnight" ? "midnight_charge" : requestedItemType;
    const canonicalItemType = requestedItemType === "midnight_charge" ? "midnight" : requestedItemType;
    const quantityProvided = hasOwn(record, "quantity") && record.quantity !== null && record.quantity !== "";
    const blocksProvided =
      hasOwn(record, "blocks_count") && record.blocks_count !== null && record.blocks_count !== "";
    const quantity = quantityProvided ? integerOrNull(record.quantity) : null;
    const blocksCount = blocksProvided ? integerOrNull(record.blocks_count) : null;

    if (!itemType || !allowedServiceItemTypes.has(itemType)) {
      return {
        ok: false,
        status: 400,
        error: `Malformed admin booking service item rejected at service_items[${index}].`,
      };
    }

    if ((quantityProvided && quantity === null) || (blocksProvided && blocksCount === null)) {
      return {
        ok: false,
        status: 400,
        error: `Malformed service item quantity rejected at service_items[${index}].`,
      };
    }

    if ((quantity ?? 0) < 1 && (blocksCount ?? 0) < 1) {
      return {
        ok: false,
        status: 400,
        error: `Missing required service item count at service_items[${index}].`,
      };
    }

    serviceItems.push({
      service_item_type: itemType as AdminBookingServiceItemInput["service_item_type"],
      item_type: canonicalItemType as AdminBookingServiceItemInput["item_type"],
      quantity,
      blocks_count: blocksCount,
      notes: textOrNull(record.notes),
    });
  }

  return {
    ok: true,
    data: serviceItems,
  };
}

function validateRequiredBookingFields(booking: AdminBookingRecordInput): AdminBookingResult<null> {
  const missingFields = requiredBookingTextFields.filter((field) => !textOrNull(booking[field]));

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Missing required operational booking fields: ${missingFields
        .map((field) => `booking.${String(field)}`)
        .join(", ")}`,
    };
  }

  if (!validDateTime(booking.pickup_datetime)) {
    return {
      ok: false,
      status: 400,
      error: "Malformed operational booking pickup_datetime rejected.",
    };
  }

  return {
    ok: true,
    data: null,
  };
}

function validateRequiredRoutePoints(
  routePoints: AdminBookingRoutePointInput[],
): AdminBookingResult<null> {
  const hasPickup = routePoints.some((routePoint) => routePoint.point_type === "pickup" && routePoint.location_text);
  const hasDropoff = routePoints.some((routePoint) => routePoint.point_type === "dropoff" && routePoint.location_text);

  if (!hasPickup || !hasDropoff) {
    return {
      ok: false,
      status: 400,
      error: "Missing required operational route data: pickup and dropoff route points are required.",
    };
  }

  return {
    ok: true,
    data: null,
  };
}

function parseAdminBookingOperationalPayload(
  value: unknown,
  allowedTopLevelFields: Set<string>,
): AdminBookingResult<AdminBookingPersistenceInput> {
  const body = asRecord(value);
  const forbiddenFields = findForbiddenFieldNames(body);

  if (forbiddenFields.length > 0) {
    return forbiddenFieldResult("admin booking");
  }

  const unknownTopLevelKeys = Object.keys(body).filter((key) => !allowedTopLevelFields.has(key));
  const bookingRecord = asRecord(body.booking);
  const routePointRecords = asArray(body.route_points).map(asRecord);
  const serviceItemRecords = asArray(body.service_items).map(asRecord);
  const unknownNestedKeys = [
    ...findUnknownKeys(bookingRecord, bookingFields, "booking"),
    ...routePointRecords.flatMap((record, index) =>
      findUnknownKeys(record, routePointFields, `route_points[${index}]`),
    ),
    ...serviceItemRecords.flatMap((record, index) =>
      findUnknownKeys(record, serviceItemFields, `service_items[${index}]`),
    ),
  ];
  const unknownKeys = [...unknownTopLevelKeys, ...unknownNestedKeys];

  if (unknownKeys.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Unknown admin booking fields rejected: ${unknownKeys.join(", ")}`,
    };
  }

  if (hasOwn(body, "route_points") && !Array.isArray(body.route_points)) {
    return {
      ok: false,
      status: 400,
      error: "Malformed admin booking route_points rejected.",
    };
  }

  if (hasOwn(body, "service_items") && !Array.isArray(body.service_items)) {
    return {
      ok: false,
      status: 400,
      error: "Malformed admin booking service_items rejected.",
    };
  }

  const booking = sanitizeBooking(bookingRecord);
  const requiredBookingResult = validateRequiredBookingFields(booking);

  if (!requiredBookingResult.ok) {
    return requiredBookingResult;
  }

  const routePointsResult = sanitizeRoutePoints(routePointRecords);

  if (!routePointsResult.ok) {
    return routePointsResult;
  }

  const requiredRoutePointResult = validateRequiredRoutePoints(routePointsResult.data);

  if (!requiredRoutePointResult.ok) {
    return requiredRoutePointResult;
  }

  const serviceItemsResult = sanitizeServiceItems(serviceItemRecords);

  if (!serviceItemsResult.ok) {
    return serviceItemsResult;
  }

  return {
    ok: true,
    data: {
      booking,
      route_points: routePointsResult.data,
      service_items: serviceItemsResult.data,
    },
  };
}

export function parseAdminBookingPersistencePayload(
  value: unknown,
): AdminBookingResult<AdminBookingPersistenceInput> {
  return parseAdminBookingOperationalPayload(value, createPayloadTopLevelFields);
}

export function parseAdminBookingUpdatePayload(
  value: unknown,
): AdminBookingResult<AdminBookingPersistenceUpdateInput> {
  const body = asRecord(value);
  const parsed = parseAdminBookingOperationalPayload(value, updatePayloadTopLevelFields);

  if (!parsed.ok) {
    return parsed;
  }

  const bookingRecord = asRecord(body.booking);
  const explicitAdminStatus = textOrNull(bookingRecord.admin_internal_status);
  const explicitCustomerStatus = textOrNull(bookingRecord.customer_facing_status);
  const explicitShortNoticeReviewStatus = textOrNull(bookingRecord.short_notice_review_status);
  const explicitRequestReviewStatus = textOrNull(bookingRecord.request_review_status);

  if (explicitAdminStatus) {
    parsed.data.booking.admin_internal_status = explicitAdminStatus;
  }

  if (explicitCustomerStatus) {
    parsed.data.booking.customer_facing_status = explicitCustomerStatus;
  }

  if (explicitShortNoticeReviewStatus) {
    parsed.data.booking.short_notice_review_status = explicitShortNoticeReviewStatus;
  }

  if (explicitRequestReviewStatus) {
    parsed.data.booking.request_review_status = explicitRequestReviewStatus;
  }

  const targetBookingReference = validTargetBookingReference(body.target_booking_reference as string | null);

  if (!targetBookingReference) {
    return {
      ok: false,
      status: 400,
      error: "Missing or malformed target admin booking reference.",
    };
  }

  if (parsed.data.booking.booking_reference !== targetBookingReference) {
    return {
      ok: false,
      status: 400,
      error: "Target admin booking reference must match booking.booking_reference.",
    };
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      target_booking_reference: targetBookingReference,
    },
  };
}

export function parseCustomerBookingRequestPayload(
  value: unknown,
): AdminBookingResult<AdminBookingPersistenceInput> {
  const body = asRecord(value);
  const forbiddenFields = findForbiddenFieldNames(body);

  if (forbiddenFields.length > 0) {
    return forbiddenFieldResult("customer booking request");
  }

  const unknownKeys = Object.keys(body).filter((key) => !customerBookingRequestFields.has(key));

  if (unknownKeys.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Unknown customer booking request fields rejected: ${unknownKeys.join(", ")}`,
    };
  }

  const companyName = textOrNull(body.companyName);
  const contactNo = textOrNull(body.contactNo);
  const emailAddress = textOrNull(body.emailAddress);
  const passengerName = textOrNull(body.passengerName);
  const pickupDate = textOrNull(body.pickupDate);
  const pickupTime = textOrNull(body.pickupTime);
  const pickupLocation = textOrNull(body.pickupLocation);
  const dropoffLocation = textOrNull(body.dropoffLocation);
  const pickupDateTime = validCustomerPickupDateTime(pickupDate, pickupTime);
  const missingFields = [
    !contactNo ? "contactNo" : "",
    !passengerName ? "passengerName" : "",
    !pickupDate ? "pickupDate" : "",
    !pickupTime ? "pickupTime" : "",
    !pickupLocation ? "pickupLocation" : "",
    !dropoffLocation ? "dropoffLocation" : "",
  ].filter(Boolean);

  if (missingFields.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Missing required customer booking request fields: ${missingFields.join(", ")}`,
    };
  }

  if (!pickupDateTime) {
    return {
      ok: false,
      status: 400,
      error: "Malformed customer booking request pickup date/time rejected.",
    };
  }

  const extraStopLocations = splitCustomerExtraStops(textOrNull(body.extraStops));
  const routePoints: AdminBookingRoutePointInput[] = [
    {
      point_type: "pickup",
      sequence_number: 1,
      location_text: pickupLocation,
      timing_note: null,
    },
    ...extraStopLocations.map((location, index) => ({
      point_type: "stop" as const,
      sequence_number: index + 2,
      location_text: location,
      timing_note: null,
    })),
    {
      point_type: "dropoff",
      sequence_number: extraStopLocations.length + 2,
      location_text: dropoffLocation,
      timing_note: null,
    },
  ];
  const serviceItems: AdminBookingServiceItemInput[] =
    extraStopLocations.length > 0
      ? [
          {
            service_item_type: "extra_stop",
            quantity: extraStopLocations.length,
            blocks_count: null,
          },
        ]
      : [];
  const flightNumber = textOrNull(body.flightNumber);
  const parserSourceReference = [
    "Customer request via /book",
    flightNumber ? `Flight ${flightNumber}` : "",
    passengerName ? `Passenger ${passengerName}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
  const operationalPayload = {
    booking: {
      booking_reference: createCustomerBookingRequestReference(),
      source_channel: "customer-booking-request",
      customer_id: null,
      pickup_datetime: pickupDateTime,
      pickup_location: pickupLocation,
      dropoff_location: dropoffLocation,
      route_type: textOrNull(body.serviceType) || "Other / To Confirm",
      customer_display_name: companyName || passengerName,
      contact_phone: contactNo,
      contact_email: emailAddress,
      passenger_name: passengerName,
      pax_count: integerOrNull(body.passengerCount),
      luggage_count: integerOrNull(body.luggage),
      vehicle_type_or_category: textOrNull(body.vehicleType),
      customer_facing_status: "Request Received",
      admin_internal_status: adminReviewRequiredStatus,
      short_notice_review_status: pickupIsUnderTwentyFourHours(pickupDateTime)
        ? adminReviewRequiredStatus
        : "Not Required",
      parser_source_reference: parserSourceReference,
    },
    route_points: routePoints,
    service_items: serviceItems,
  } satisfies AdminBookingPersistenceInput;

  return parseAdminBookingOperationalPayload(operationalPayload, createPayloadTopLevelFields);
}

export async function createAdminBooking(
  input: AdminBookingPersistenceInput,
  actor: AdminBookingPersistenceAdapterActor,
  auditInput: AdminBookingAuditInput = {
    action: "admin_booking_create",
    source_route: "/",
    actor_label: "Admin dashboard",
    change_summary: "Operational booking fields saved through admin booking persistence prototype.",
  },
): Promise<AdminBookingResult<AdminBookingPersistenceRecord>> {
  const parsed = parseAdminBookingPersistencePayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  return createAdminBookingThroughSupabaseAdapter(parsed.data, auditInput, actor);
}

export async function updateAdminBooking(
  input: AdminBookingPersistenceUpdateInput,
  actor: AdminBookingPersistenceAdapterActor,
  auditInput: AdminBookingAuditInput = {
    action: "admin_booking_update",
    source_route: "/",
    actor_label: "Admin dashboard",
    change_summary: "Operational booking fields updated through admin booking persistence prototype.",
  },
): Promise<AdminBookingResult<AdminBookingPersistenceRecord>> {
  const parsed = parseAdminBookingUpdatePayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  return updateAdminBookingThroughSupabaseAdapter(parsed.data, auditInput, actor);
}

export async function listAdminBookings(
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookingPersistenceRecord[]>> {
  return listAdminBookingsThroughSupabaseAdapter(actor);
}
