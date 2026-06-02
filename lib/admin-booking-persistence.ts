import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AdminBookingRecordInput = {
  booking_reference?: string | null;
  source_channel?: string | null;
  customer_id?: number | null;
  pickup_datetime?: string | null;
  pickup_location?: string | null;
  dropoff_location?: string | null;
  route_type?: string | null;
  customer_display_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  pax_count?: number | null;
  luggage_count?: number | null;
  vehicle_type_or_category?: string | null;
  customer_facing_status?: string | null;
  admin_internal_status?: string | null;
  short_notice_review_status?: string | null;
  parser_source_reference?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AdminBookingRoutePointInput = {
  point_type?: "pickup" | "dropoff" | "stop" | "waypoint";
  sequence_number?: number | null;
  location_text?: string | null;
  timing_note?: string | null;
};

export type AdminBookingServiceItemInput = {
  service_item_type?: "child_seat" | "extra_stop" | "waiting_time" | "midnight_charge";
  quantity?: number | null;
  blocks_count?: number | null;
};

export type AdminBookingPersistenceInput = {
  booking: AdminBookingRecordInput;
  route_points: AdminBookingRoutePointInput[];
  service_items: AdminBookingServiceItemInput[];
};

export type AdminBookingPersistenceRecord = Required<
  Pick<AdminBookingRecordInput, "booking_reference">
> &
  Omit<AdminBookingRecordInput, "booking_reference"> & {
    route_points: AdminBookingRoutePointInput[];
    service_items: AdminBookingServiceItemInput[];
  };

type AdminBookingResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

type UnknownRecord = Record<string, unknown>;

const adminReviewRequiredStatus = "Admin Review Required";
const shortNoticeWindowMs = 24 * 60 * 60 * 1000;
const maxTextLength = 1000;
const maxRoutePoints = 20;
const maxServiceItems = 12;

const bookingFields = new Set([
  "booking_reference",
  "source_channel",
  "customer_id",
  "pickup_datetime",
  "pickup_location",
  "dropoff_location",
  "route_type",
  "customer_display_name",
  "contact_phone",
  "contact_email",
  "pax_count",
  "luggage_count",
  "vehicle_type_or_category",
  "customer_facing_status",
  "admin_internal_status",
  "short_notice_review_status",
  "parser_source_reference",
  "created_at",
  "updated_at",
]);

const routePointFields = new Set([
  "point_type",
  "sequence_number",
  "location_text",
  "timing_note",
  "created_at",
  "updated_at",
]);

const serviceItemFields = new Set([
  "service_item_type",
  "quantity",
  "blocks_count",
  "created_at",
  "updated_at",
]);

const forbiddenFieldFragments = [
  "customer_price",
  "quoted_price",
  "amount_due",
  "billing",
  "invoice",
  "payment",
  "payment_link",
  "pdf",
  "stripe",
  "paynow",
  "pay_now",
  "driver_payout",
  "payout",
  "payout_comparison",
  "finance",
  "finance_note",
  "notification",
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
  "parser_learning",
  "parser_debug",
  "debug",
  "qa_archive",
  "mock_workbench",
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

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxTextLength) : null;
}

function integerOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function pickupIsUnderTwentyFourHours(value: string | null | undefined) {
  const pickupMs = value ? new Date(value).getTime() : Number.NaN;

  return Number.isFinite(pickupMs) && pickupMs - Date.now() < shortNoticeWindowMs;
}

function sanitizeBooking(record: UnknownRecord): AdminBookingRecordInput {
  const sanitized = {
    booking_reference: textOrNull(record.booking_reference),
    source_channel: textOrNull(record.source_channel),
    customer_id: integerOrNull(record.customer_id),
    pickup_datetime: textOrNull(record.pickup_datetime),
    pickup_location: textOrNull(record.pickup_location),
    dropoff_location: textOrNull(record.dropoff_location),
    route_type: textOrNull(record.route_type),
    customer_display_name: textOrNull(record.customer_display_name),
    contact_phone: textOrNull(record.contact_phone),
    contact_email: textOrNull(record.contact_email),
    pax_count: integerOrNull(record.pax_count),
    luggage_count: integerOrNull(record.luggage_count),
    vehicle_type_or_category: textOrNull(record.vehicle_type_or_category),
    customer_facing_status: textOrNull(record.customer_facing_status),
    admin_internal_status: textOrNull(record.admin_internal_status),
    short_notice_review_status: textOrNull(record.short_notice_review_status),
    parser_source_reference: textOrNull(record.parser_source_reference),
  } satisfies AdminBookingRecordInput;

  if (pickupIsUnderTwentyFourHours(sanitized.pickup_datetime)) {
    sanitized.admin_internal_status = adminReviewRequiredStatus;
    sanitized.short_notice_review_status = adminReviewRequiredStatus;
  }

  return sanitized;
}

function sanitizeRoutePoints(value: unknown[]) {
  return value
    .slice(0, maxRoutePoints)
    .map((item, index): AdminBookingRoutePointInput | null => {
      const record = asRecord(item);
      const pointType = textOrNull(record.point_type);
      const locationText = textOrNull(record.location_text);

      if (
        !locationText ||
        (pointType !== "pickup" && pointType !== "dropoff" && pointType !== "stop" && pointType !== "waypoint")
      ) {
        return null;
      }

      return {
        point_type: pointType,
        sequence_number: integerOrNull(record.sequence_number) ?? index + 1,
        location_text: locationText,
        timing_note: textOrNull(record.timing_note),
      };
    })
    .filter((item): item is AdminBookingRoutePointInput => Boolean(item));
}

function sanitizeServiceItems(value: unknown[]) {
  return value
    .slice(0, maxServiceItems)
    .map((item): AdminBookingServiceItemInput | null => {
      const record = asRecord(item);
      const itemType = textOrNull(record.service_item_type);

      if (
        itemType !== "child_seat" &&
        itemType !== "extra_stop" &&
        itemType !== "waiting_time" &&
        itemType !== "midnight_charge"
      ) {
        return null;
      }

      return {
        service_item_type: itemType,
        quantity: integerOrNull(record.quantity),
        blocks_count: integerOrNull(record.blocks_count),
      };
    })
    .filter((item): item is AdminBookingServiceItemInput => Boolean(item));
}

export function parseAdminBookingPersistencePayload(
  value: unknown,
): AdminBookingResult<AdminBookingPersistenceInput> {
  const body = asRecord(value);
  const forbiddenFields = findForbiddenFieldNames(body);

  if (forbiddenFields.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Forbidden admin booking fields rejected: ${forbiddenFields.join(", ")}`,
    };
  }

  const unknownTopLevelKeys = Object.keys(body).filter(
    (key) => key !== "booking" && key !== "route_points" && key !== "service_items",
  );
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

  const booking = sanitizeBooking(bookingRecord);

  if (!booking.booking_reference) {
    return {
      ok: false,
      status: 400,
      error: "booking.booking_reference is required.",
    };
  }

  return {
    ok: true,
    data: {
      booking,
      route_points: sanitizeRoutePoints(routePointRecords),
      service_items: sanitizeServiceItems(serviceItemRecords),
    },
  };
}

function getAdminBookingClient(): AdminBookingResult<SupabaseClient> {
  const enabled = process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true";

  if (!enabled) {
    return {
      ok: false,
      status: 503,
      error: "Admin booking persistence is not enabled on this server.",
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      status: 503,
      error: "Admin booking persistence server configuration is incomplete.",
    };
  }

  return {
    ok: true,
    data: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    }),
  };
}

function toAdminBookingDto(row: UnknownRecord): AdminBookingPersistenceRecord {
  const routePoints = asArray(row.booking_route_points)
    .map(asRecord)
    .map((record) => ({
      point_type: textOrNull(record.point_type) as AdminBookingRoutePointInput["point_type"],
      sequence_number: integerOrNull(record.sequence_number),
      location_text: textOrNull(record.location_text),
      timing_note: textOrNull(record.timing_note),
    }))
    .filter((record) => record.point_type && record.location_text)
    .sort((first, second) => (first.sequence_number ?? 0) - (second.sequence_number ?? 0));
  const serviceItems = asArray(row.booking_service_items)
    .map(asRecord)
    .map((record) => ({
      service_item_type: textOrNull(record.service_item_type) as AdminBookingServiceItemInput["service_item_type"],
      quantity: integerOrNull(record.quantity),
      blocks_count: integerOrNull(record.blocks_count),
    }))
    .filter((record) => record.service_item_type);

  return {
    booking_reference: textOrNull(row.booking_reference) || "",
    source_channel: textOrNull(row.source_channel),
    customer_id: integerOrNull(row.customer_id),
    pickup_datetime: textOrNull(row.pickup_datetime),
    pickup_location: textOrNull(row.pickup_location),
    dropoff_location: textOrNull(row.dropoff_location),
    route_type: textOrNull(row.route_type),
    customer_display_name: textOrNull(row.customer_display_name),
    contact_phone: textOrNull(row.contact_phone),
    contact_email: textOrNull(row.contact_email),
    pax_count: integerOrNull(row.pax_count),
    luggage_count: integerOrNull(row.luggage_count),
    vehicle_type_or_category: textOrNull(row.vehicle_type_or_category),
    customer_facing_status: textOrNull(row.customer_facing_status),
    admin_internal_status: textOrNull(row.admin_internal_status),
    short_notice_review_status: textOrNull(row.short_notice_review_status),
    parser_source_reference: textOrNull(row.parser_source_reference),
    created_at: textOrNull(row.created_at),
    updated_at: textOrNull(row.updated_at),
    route_points: routePoints,
    service_items: serviceItems,
  };
}

async function fetchAdminBookingById(
  client: SupabaseClient,
  bookingId: number,
): Promise<AdminBookingResult<AdminBookingPersistenceRecord>> {
  const { data, error } = await client
    .from("bookings")
    .select(
      "booking_reference, source_channel, customer_id, pickup_datetime, pickup_location, dropoff_location, route_type, customer_display_name, contact_phone, contact_email, pax_count, luggage_count, vehicle_type_or_category, customer_facing_status, admin_internal_status, short_notice_review_status, parser_source_reference, created_at, updated_at, booking_route_points(point_type, sequence_number, location_text, timing_note), booking_service_items(service_item_type, quantity, blocks_count)",
    )
    .eq("id", bookingId)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      status: 500,
      error: error?.message || "Saved booking could not be reloaded.",
    };
  }

  return {
    ok: true,
    data: toAdminBookingDto(asRecord(data)),
  };
}

export async function createAdminBooking(
  input: AdminBookingPersistenceInput,
): Promise<AdminBookingResult<AdminBookingPersistenceRecord>> {
  const clientResult = getAdminBookingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const client = clientResult.data;
  const { data: bookingRow, error: bookingError } = await client
    .from("bookings")
    .insert(input.booking)
    .select("id")
    .single();
  const bookingId = integerOrNull(asRecord(bookingRow).id);

  if (bookingError || !bookingId) {
    return {
      ok: false,
      status: 500,
      error: bookingError?.message || "Booking row was not created.",
    };
  }

  if (input.route_points.length > 0) {
    const { error } = await client.from("booking_route_points").insert(
      input.route_points.map((routePoint) => ({
        ...routePoint,
        booking_id: bookingId,
      })),
    );

    if (error) {
      return {
        ok: false,
        status: 500,
        error: error.message,
      };
    }
  }

  if (input.service_items.length > 0) {
    const { error } = await client.from("booking_service_items").insert(
      input.service_items.map((serviceItem) => ({
        ...serviceItem,
        booking_id: bookingId,
      })),
    );

    if (error) {
      return {
        ok: false,
        status: 500,
        error: error.message,
      };
    }
  }

  await client.from("audit_logs").insert({
    entity_type: "booking",
    entity_id: bookingId,
    action: "admin_booking_create",
    source_route: "/",
    actor_label: "Admin dashboard",
    change_summary: "Operational booking fields saved through admin booking persistence prototype.",
  });

  return fetchAdminBookingById(client, bookingId);
}

export async function listAdminBookings(): Promise<AdminBookingResult<AdminBookingPersistenceRecord[]>> {
  const clientResult = getAdminBookingClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("bookings")
    .select(
      "booking_reference, source_channel, customer_id, pickup_datetime, pickup_location, dropoff_location, route_type, customer_display_name, contact_phone, contact_email, pax_count, luggage_count, vehicle_type_or_category, customer_facing_status, admin_internal_status, short_notice_review_status, parser_source_reference, created_at, updated_at, booking_route_points(point_type, sequence_number, location_text, timing_note), booking_service_items(service_item_type, quantity, blocks_count)",
    )
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return {
      ok: false,
      status: 500,
      error: error.message,
    };
  }

  return {
    ok: true,
    data: asArray(data).map(asRecord).map(toAdminBookingDto),
  };
}
