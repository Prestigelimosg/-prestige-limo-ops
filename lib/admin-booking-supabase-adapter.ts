import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingAuditInput,
  AdminBookingPersistenceInput,
  AdminBookingPersistenceRecord,
  AdminBookingPersistenceUpdateInput,
  AdminBookingRecordInput,
  AdminBookingResult,
  AdminBookingRoutePointInput,
  AdminBookingServiceItemInput,
} from "./admin-booking-persistence";
import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";

export const adminBookingSupabaseAdapterVersion =
  "stage-4a-376-server-only-supabase-adapter-v1";
export const adminBookingPersistenceStagingReadinessVersion =
  "stage-4a-379-admin-persistence-staging-config-readiness-v1";
export const adminBookingPersistenceEnableReadinessVersion =
  "stage-4a-381-controlled-persistence-enable-readiness-v1";

export type AdminBookingPersistenceAdapterActor = {
  actor_label: string;
  actor_role: "admin" | "dispatcher" | "system";
  boundary_mode:
    | AdminDispatcherBoundaryContext["mode"]
    | "customer-booking-request-surface";
  source_surface: "admin_api" | "customer_booking_request" | "system";
};

type UnknownRecord = Record<string, unknown>;
type DbIdentifier = string | number;
type AdminBookingPersistenceStagingRequirement =
  | "write_gate"
  | "database_url"
  | "server_credential"
  | "admin_mode"
  | "admin_access_check"
  | "admin_role";
type AdminBookingPersistenceStagingRequirementStatus = "ready" | "missing" | "invalid";
type AdminBookingPersistenceStagingRequirements = Record<
  AdminBookingPersistenceStagingRequirement,
  AdminBookingPersistenceStagingRequirementStatus
>;
type AdminBookingPersistenceStagingSideEffects = {
  databaseClient: "not_created";
  databaseWrites: "not_opened";
  adminDispatcherGate: "still_required";
};
type AdminBookingPersistenceStagingReadinessBase = {
  environment: "server";
  requirements: AdminBookingPersistenceStagingRequirements;
  sideEffects: AdminBookingPersistenceStagingSideEffects;
  status: 200 | 503;
  version: typeof adminBookingPersistenceStagingReadinessVersion;
};
export type AdminBookingPersistenceStagingReadinessResult =
  | (AdminBookingPersistenceStagingReadinessBase & {
      ok: true;
      ready: true;
      status: 200;
    })
  | (AdminBookingPersistenceStagingReadinessBase & {
      error: "Admin booking persistence staging configuration is not ready.";
      invalid: AdminBookingPersistenceStagingRequirement[];
      missing: AdminBookingPersistenceStagingRequirement[];
      ok: false;
      ready: false;
      status: 503;
    });
type AdminBookingPersistenceEnableRequirement =
  | "feature_flag"
  | "staging_config"
  | "admin_dispatcher_session"
  | "safe_payload"
  | "kill_switch";
type AdminBookingPersistenceEnableRequirementStatus = "ready" | "blocked";
type AdminBookingPersistenceEnableRequirements = Record<
  AdminBookingPersistenceEnableRequirement,
  AdminBookingPersistenceEnableRequirementStatus
>;
type AdminBookingPersistenceEnableSideEffects = {
  databaseClient: "not_created";
  databaseReads: "not_opened";
  databaseWrites: "not_opened";
};
type AdminBookingPersistenceEnableReadinessBase = {
  environment: "server";
  requirements: AdminBookingPersistenceEnableRequirements;
  sideEffects: AdminBookingPersistenceEnableSideEffects;
  status: 200 | 503;
  version: typeof adminBookingPersistenceEnableReadinessVersion;
};
export type AdminBookingPersistenceEnableReadinessResult =
  | (AdminBookingPersistenceEnableReadinessBase & {
      ok: true;
      readyToEnable: true;
      status: 200;
    })
  | (AdminBookingPersistenceEnableReadinessBase & {
      blocked: AdminBookingPersistenceEnableRequirement[];
      error: "Admin booking persistence enablement readiness gates are not ready.";
      ok: false;
      readyToEnable: false;
      status: 503;
    });

const maxTextLength = 1000;
const safeSaveError = "Admin booking persistence save failed safely.";
const safeLoadError = "Admin booking persistence load failed safely.";
const safeReloadError = "Saved booking could not be safely reloaded.";
const safeUpdateError = "Admin booking persistence update failed safely.";
const safeUpdateTargetMissingError = "Applied admin booking snapshot was not found.";
const disabledPersistenceError = "Admin booking persistence is not enabled on this server.";
const safeStagingReadinessError =
  "Admin booking persistence staging configuration is not ready.";
const safeEnableReadinessError =
  "Admin booking persistence enablement readiness gates are not ready.";

const allowedAdapterRoles = new Set(["admin", "dispatcher", "system"]);
const allowedAdapterSourceSurfaces = new Set(["admin_api", "customer_booking_request", "system"]);
const allowedStagingReadinessRoles = new Set(["admin", "dispatcher"]);
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxTextLength) : null;
}

function dbIdentifierOrNull(value: unknown): DbIdentifier | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }

  return textOrNull(value);
}

function dbIdentifierTextOrNull(value: unknown) {
  const identifier = dbIdentifierOrNull(value);

  return identifier === null ? null : String(identifier);
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

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

function readinessRequirementStatus(
  value: string | null,
  validator: (value: string) => boolean,
): AdminBookingPersistenceStagingRequirementStatus {
  if (!value) {
    return "missing";
  }

  return validator(value) ? "ready" : "invalid";
}

function readinessSideEffects(): AdminBookingPersistenceStagingSideEffects {
  return {
    adminDispatcherGate: "still_required",
    databaseClient: "not_created",
    databaseWrites: "not_opened",
  };
}

function enableReadinessSideEffects(): AdminBookingPersistenceEnableSideEffects {
  return {
    databaseClient: "not_created",
    databaseReads: "not_opened",
    databaseWrites: "not_opened",
  };
}

function enableRequirementStatus(
  ready: boolean,
): AdminBookingPersistenceEnableRequirementStatus {
  return ready ? "ready" : "blocked";
}

export function checkAdminBookingPersistenceStagingConfigReadiness(): AdminBookingPersistenceStagingReadinessResult {
  const requirements: AdminBookingPersistenceStagingRequirements = {
    admin_access_check: readinessRequirementStatus(
      configValueOrNull(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN),
      validServerCredential,
    ),
    admin_mode: readinessRequirementStatus(
      configValueOrNull(process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE),
      (value) => value === "server-session-token",
    ),
    admin_role: readinessRequirementStatus(
      configValueOrNull(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE),
      (value) => allowedStagingReadinessRoles.has(value),
    ),
    database_url: readinessRequirementStatus(configValueOrNull(process.env.SUPABASE_URL), validServerDatabaseUrl),
    server_credential: readinessRequirementStatus(
      configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY),
      validServerCredential,
    ),
    write_gate: readinessRequirementStatus(
      configValueOrNull(process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED),
      (value) => value === "true",
    ),
  };
  const missing = Object.entries(requirements)
    .filter(([, status]) => status === "missing")
    .map(([requirement]) => requirement as AdminBookingPersistenceStagingRequirement);
  const invalid = Object.entries(requirements)
    .filter(([, status]) => status === "invalid")
    .map(([requirement]) => requirement as AdminBookingPersistenceStagingRequirement);
  const base = {
    environment: "server",
    requirements,
    sideEffects: readinessSideEffects(),
    version: adminBookingPersistenceStagingReadinessVersion,
  } satisfies Omit<AdminBookingPersistenceStagingReadinessBase, "status">;

  if (missing.length > 0 || invalid.length > 0) {
    return {
      ...base,
      error: safeStagingReadinessError,
      invalid,
      missing,
      ok: false,
      ready: false,
      status: 503,
    };
  }

  return {
    ...base,
    ok: true,
    ready: true,
    status: 200,
  };
}

export function checkAdminBookingPersistenceEnableReadiness(
  payloadResult: AdminBookingResult<AdminBookingPersistenceInput> | null | undefined,
  actor: AdminBookingPersistenceAdapterActor | null | undefined,
): AdminBookingPersistenceEnableReadinessResult {
  const featureFlagOpen = process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true";
  const stagingConfigReady = checkAdminBookingPersistenceStagingConfigReadiness().ok;
  const actorResult = actor ? validateActor(actor) : null;
  const adminDispatcherSessionReady =
    !!actor &&
    !!actorResult?.ok &&
    actor.boundary_mode === "server-session-role-surface" &&
    (actor.actor_role === "admin" || actor.actor_role === "dispatcher") &&
    actor.source_surface === "admin_api";
  const safePayloadReady = !!payloadResult?.ok;
  const killSwitchOpen = featureFlagOpen;
  const requirements: AdminBookingPersistenceEnableRequirements = {
    admin_dispatcher_session: enableRequirementStatus(adminDispatcherSessionReady),
    feature_flag: enableRequirementStatus(featureFlagOpen),
    kill_switch: enableRequirementStatus(killSwitchOpen),
    safe_payload: enableRequirementStatus(safePayloadReady),
    staging_config: enableRequirementStatus(stagingConfigReady),
  };
  const blocked = Object.entries(requirements)
    .filter(([, status]) => status === "blocked")
    .map(([requirement]) => requirement as AdminBookingPersistenceEnableRequirement);
  const base = {
    environment: "server",
    requirements,
    sideEffects: enableReadinessSideEffects(),
    version: adminBookingPersistenceEnableReadinessVersion,
  } satisfies Omit<AdminBookingPersistenceEnableReadinessBase, "status">;

  if (blocked.length > 0) {
    return {
      ...base,
      blocked,
      error: safeEnableReadinessError,
      ok: false,
      readyToEnable: false,
      status: 503,
    };
  }

  return {
    ...base,
    ok: true,
    readyToEnable: true,
    status: 200,
  };
}

function integerOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveIntegerOrFallback(value: unknown, fallback = 1) {
  const parsed = integerOrNull(value);

  return parsed && parsed > 0 ? parsed : fallback;
}

function normalizeToken(value: string | null | undefined) {
  return textOrNull(value)?.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "";
}

function normalizeSourceSurface(value: string | null | undefined, fallback: AdminBookingPersistenceAdapterActor["source_surface"]) {
  const normalized = normalizeToken(value);

  if (normalized === "customer_booking_request" || normalized === "customer_request") {
    return "customer_booking_request";
  }

  if (normalized === "admin_dashboard" || normalized === "admin") {
    return "admin_dashboard";
  }

  if (normalized === "customer_portal" || normalized === "driver_job" || normalized === "migration" || normalized === "system") {
    return normalized;
  }

  return fallback;
}

function normalizeServiceType(value: string | null | undefined) {
  const rawValue = textOrNull(value);
  const normalized = normalizeToken(rawValue);

  if (!normalized) {
    return "other";
  }

  if (normalized.includes("mng") || normalized.includes("arrival")) {
    return rawValue === "MNG" ? "MNG" : normalized.includes("mng") ? "MNG" : "arrival";
  }

  if (normalized.includes("dep") || normalized.includes("departure")) {
    return rawValue === "DEP" ? "DEP" : normalized.includes("dep") ? "DEP" : "departure";
  }

  if (normalized.includes("trf") || normalized.includes("transfer")) {
    return rawValue === "TRF" ? "TRF" : normalized.includes("trf") ? "TRF" : "transfer";
  }

  if (normalized.includes("dsp") || normalized.includes("hourly")) {
    return rawValue === "DSP" ? "DSP" : normalized.includes("dsp") ? "DSP" : "hourly";
  }

  if (
    normalized === "standby" ||
    normalized === "event" ||
    normalized === "seaport_transfer" ||
    normalized === "point_to_point"
  ) {
    return normalized;
  }

  return "other";
}

function normalizeAdminInternalStatus(value: string | null | undefined) {
  const normalized = normalizeToken(value);

  if (normalized === "admin_review_required") {
    return "admin_review_required";
  }

  if (normalized === "needs_review") {
    return "needs_review";
  }

  if (normalized === "ready_for_confirmation" || normalized === "approved_internally" || normalized === "approved_internal") {
    return "approved_internal";
  }

  if (normalized === "declined_internally" || normalized === "declined_internal") {
    return "declined_internal";
  }

  if (
    normalized === "confirmed" ||
    normalized === "driver_pending" ||
    normalized === "driver_assigned" ||
    normalized === "in_progress" ||
    normalized === "completed" ||
    normalized === "cancelled" ||
    normalized === "archived"
  ) {
    return normalized;
  }

  return "draft";
}

function normalizeCustomerFacingStatus(value: string | null | undefined) {
  const normalized = normalizeToken(value);

  if (normalized === "request_received" || normalized === "received") {
    return "received";
  }

  if (normalized === "pending_review" || normalized === "needs_review") {
    return "pending_review";
  }

  if (normalized === "not_confirmed") {
    return "not_confirmed";
  }

  if (
    normalized === "confirmed" ||
    normalized === "driver_pending" ||
    normalized === "driver_assigned" ||
    normalized === "completed" ||
    normalized === "cancelled" ||
    normalized === "declined"
  ) {
    return normalized;
  }

  return "pending_review";
}

function normalizeShortNoticeReviewStatus(value: string | null | undefined) {
  const normalized = normalizeToken(value);

  if (normalized === "admin_review_required") {
    return "admin_review_required";
  }

  if (normalized === "needs_review" || normalized === "reviewed") {
    return normalized;
  }

  if (normalized === "not_required") {
    return "not_required";
  }

  return null;
}

function normalizeRequestReviewStatus(value: string | null | undefined) {
  const normalized = normalizeToken(value);

  if (
    normalized === "requested" ||
    normalized === "pending_review" ||
    normalized === "needs_review" ||
    normalized === "approved" ||
    normalized === "declined"
  ) {
    return normalized;
  }

  return null;
}

function normalizeChangeReviewStatus(value: string | null | undefined) {
  const normalized = normalizeToken(value);

  if (
    normalized === "requested" ||
    normalized === "pending_review" ||
    normalized === "needs_review" ||
    normalized === "approved" ||
    normalized === "declined" ||
    normalized === "completed"
  ) {
    return normalized;
  }

  return null;
}

function normalizeCancellationReviewStatus(value: string | null | undefined) {
  const normalized = normalizeToken(value);

  if (
    normalized === "requested" ||
    normalized === "pending_review" ||
    normalized === "needs_review" ||
    normalized === "approved" ||
    normalized === "declined" ||
    normalized === "cancelled"
  ) {
    return normalized;
  }

  return null;
}

function adminStatusToUi(value: unknown) {
  const normalized = normalizeToken(textOrNull(value));

  if (normalized === "admin_review_required") {
    return "Admin Review Required";
  }

  if (normalized === "needs_review") {
    return "Needs Review";
  }

  if (normalized === "approved_internal") {
    return "Ready for Confirmation";
  }

  if (normalized === "declined_internal") {
    return "Declined Internally";
  }

  if (normalized === "draft") {
    return "Draft";
  }

  return textOrNull(value);
}

function customerStatusToUi(value: unknown) {
  const normalized = normalizeToken(textOrNull(value));

  if (normalized === "received") {
    return "Request Received";
  }

  if (normalized === "pending_review") {
    return "Pending Review";
  }

  if (normalized === "not_confirmed") {
    return "Not Confirmed";
  }

  return textOrNull(value);
}

function reviewStatusToUi(value: unknown) {
  const normalized = normalizeToken(textOrNull(value));

  if (normalized === "admin_review_required") {
    return "Admin Review Required";
  }

  if (normalized === "not_required") {
    return "Not Required";
  }

  if (normalized === "needs_review") {
    return "Needs Review";
  }

  if (normalized === "pending_review") {
    return "Pending Review";
  }

  return textOrNull(value);
}

function sourceSurfaceToUi(value: unknown) {
  const normalized = normalizeToken(textOrNull(value));

  if (normalized === "customer_booking_request") {
    return "customer-booking-request";
  }

  if (normalized === "admin_dashboard") {
    return "admin-dashboard";
  }

  if (normalized === "admin_api") {
    return "admin-api";
  }

  return textOrNull(value);
}

function serviceItemTypeToDb(value: string | null | undefined) {
  const normalized = normalizeToken(value);

  return normalized === "midnight_charge" ? "midnight" : normalized || "other";
}

function serviceItemTypeToUi(value: unknown) {
  const normalized = normalizeToken(textOrNull(value));

  return normalized === "midnight"
    ? "midnight_charge"
    : (textOrNull(value) as AdminBookingServiceItemInput["service_item_type"]);
}

function auditActionToDb(value: string) {
  const normalized = normalizeToken(value);

  if (normalized === "admin_booking_create" || normalized === "customer_booking_request_create") {
    return "booking_created";
  }

  if (normalized === "admin_booking_update") {
    return "booking_updated";
  }

  if (normalized === "customer_amend_request_reviewed") {
    return "customer_amend_request_reviewed";
  }

  if (normalized === "customer_cancellation_request_reviewed") {
    return "customer_cancellation_request_reviewed";
  }

  if (normalized === "driver_assigned" || normalized === "driver_status_updated" || normalized === "rollback_reviewed") {
    return normalized;
  }

  return "admin_dispatcher_override";
}

function routePointToCurrentDbRow(routePoint: AdminBookingRoutePointInput, bookingId: DbIdentifier) {
  const pointType = routePoint.point_type === "extra_stop" ? "stop" : routePoint.point_type || "waypoint";
  const sequence = positiveIntegerOrFallback(routePoint.sequence_number ?? routePoint.sequence);
  const location = textOrNull(routePoint.location_text) || textOrNull(routePoint.location) || "Location To Confirm";
  const notes = textOrNull(routePoint.notes) || textOrNull(routePoint.timing_note);

  return {
    booking_id: bookingId,
    sequence,
    point_type: pointType,
    location,
    notes,
  };
}

function routePointToCumulativeDbRow(routePoint: AdminBookingRoutePointInput, bookingId: DbIdentifier) {
  const currentRow = routePointToCurrentDbRow(routePoint, bookingId);

  return {
    ...currentRow,
    sequence_number: currentRow.sequence,
    location_text: currentRow.location,
    timing_note: currentRow.notes,
  };
}

function legacyServiceItemTypeToDb(value: string) {
  return value === "midnight" ? "midnight_charge" : value;
}

function serviceItemToCurrentDbRow(serviceItem: AdminBookingServiceItemInput, bookingId: DbIdentifier) {
  const itemType = serviceItemTypeToDb(serviceItem.item_type || serviceItem.service_item_type);
  const quantity = positiveIntegerOrFallback(serviceItem.quantity ?? serviceItem.blocks_count);

  return {
    booking_id: bookingId,
    item_type: itemType,
    quantity,
    notes: textOrNull(serviceItem.notes),
  };
}

function serviceItemToCumulativeDbRow(serviceItem: AdminBookingServiceItemInput, bookingId: DbIdentifier) {
  const currentRow = serviceItemToCurrentDbRow(serviceItem, bookingId);

  return {
    ...currentRow,
    service_item_type: legacyServiceItemTypeToDb(currentRow.item_type),
    blocks_count: currentRow.quantity,
  };
}

function bookingToDbRow(
  booking: AdminBookingRecordInput,
  customerId: DbIdentifier | null,
  actor: AdminBookingPersistenceAdapterActor,
) {
  const pickupAt = textOrNull(booking.pickup_at) || textOrNull(booking.pickup_datetime) || new Date().toISOString();
  const pickupLocation = textOrNull(booking.pickup_location) || "Pickup To Confirm";
  const dropoffLocation = textOrNull(booking.dropoff_location) || "Drop-off To Confirm";

  return {
    booking_reference: textOrNull(booking.booking_reference) || "Booking Reference To Confirm",
    customer_id: customerId,
    customer_display_name: textOrNull(booking.customer_display_name) || "Customer To Confirm",
    contact_display_name: textOrNull(booking.contact_display_name),
    contact_phone: textOrNull(booking.contact_phone),
    contact_email: textOrNull(booking.contact_email),
    service_type: normalizeServiceType(textOrNull(booking.service_type) || textOrNull(booking.route_type)),
    pickup_at: pickupAt,
    pickup_location: pickupLocation,
    dropoff_location: dropoffLocation,
    route_summary:
      textOrNull(booking.route_summary) ||
      [pickupLocation, dropoffLocation].filter(Boolean).join(" > "),
    passenger_name: textOrNull(booking.passenger_name),
    passenger_phone: textOrNull(booking.passenger_phone),
    admin_internal_status: normalizeAdminInternalStatus(booking.admin_internal_status),
    customer_facing_status: normalizeCustomerFacingStatus(booking.customer_facing_status),
    short_notice_review_status: normalizeShortNoticeReviewStatus(booking.short_notice_review_status),
    request_review_status: normalizeRequestReviewStatus(booking.request_review_status),
    change_review_status: normalizeChangeReviewStatus(booking.change_review_status),
    cancellation_review_status: normalizeCancellationReviewStatus(booking.cancellation_review_status),
    source_surface: normalizeSourceSurface(
      textOrNull(booking.source_surface) || textOrNull(booking.source_channel),
      actor.source_surface,
    ),
  };
}

function toAdminBookingDto(row: UnknownRecord): AdminBookingPersistenceRecord {
  const routePoints = asArray(row.booking_route_points)
    .map(asRecord)
    .map((record) => ({
      point_type: textOrNull(record.point_type) as AdminBookingRoutePointInput["point_type"],
      sequence_number: integerOrNull(record.sequence),
      sequence: integerOrNull(record.sequence),
      location_text: textOrNull(record.location),
      location: textOrNull(record.location),
      timing_note: textOrNull(record.notes),
      notes: textOrNull(record.notes),
    }))
    .filter((record) => record.point_type && record.location_text)
    .sort((first, second) => (first.sequence_number ?? 0) - (second.sequence_number ?? 0));
  const serviceItems = asArray(row.booking_service_items)
    .map(asRecord)
    .map((record) => ({
      service_item_type: serviceItemTypeToUi(record.item_type),
      item_type: textOrNull(record.item_type) as AdminBookingServiceItemInput["item_type"],
      quantity: integerOrNull(record.quantity),
      blocks_count: null,
      notes: textOrNull(record.notes),
    }))
    .filter((record) => record.service_item_type);

  return {
    booking_reference: textOrNull(row.booking_reference) || "",
    source_channel: sourceSurfaceToUi(row.source_surface),
    source_surface: textOrNull(row.source_surface),
    customer_id: dbIdentifierTextOrNull(row.customer_id),
    pickup_datetime: textOrNull(row.pickup_at),
    pickup_at: textOrNull(row.pickup_at),
    pickup_location: textOrNull(row.pickup_location),
    dropoff_location: textOrNull(row.dropoff_location),
    route_type: textOrNull(row.service_type),
    service_type: textOrNull(row.service_type),
    route_summary: textOrNull(row.route_summary),
    customer_display_name: textOrNull(row.customer_display_name),
    contact_display_name: textOrNull(row.contact_display_name),
    contact_phone: textOrNull(row.contact_phone),
    contact_email: textOrNull(row.contact_email),
    passenger_name: textOrNull(row.passenger_name),
    passenger_phone: textOrNull(row.passenger_phone),
    pax_count: null,
    luggage_count: null,
    vehicle_type_or_category: null,
    customer_facing_status: customerStatusToUi(row.customer_facing_status),
    admin_internal_status: adminStatusToUi(row.admin_internal_status),
    short_notice_review_status: reviewStatusToUi(row.short_notice_review_status),
    request_review_status: reviewStatusToUi(row.request_review_status),
    change_review_status: reviewStatusToUi(row.change_review_status),
    cancellation_review_status: reviewStatusToUi(row.cancellation_review_status),
    parser_source_reference: null,
    created_at: textOrNull(row.created_at),
    updated_at: textOrNull(row.updated_at),
    route_points: routePoints,
    service_items: serviceItems,
  };
}

function safeAuditSnapshot(record: AdminBookingPersistenceRecord | AdminBookingPersistenceInput | null) {
  if (!record) {
    return null;
  }

  return JSON.parse(JSON.stringify(record));
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedAdapterRoles.has(actor.actor_role) ||
    !allowedAdapterSourceSurfaces.has(actor.source_surface) ||
    !textOrNull(actor.actor_label)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Admin booking persistence requires a verified internal write boundary.",
    };
  }

  if (
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true" &&
    (actor.boundary_mode !== "server-session-role-surface" ||
      !["admin", "dispatcher"].includes(actor.actor_role) ||
      actor.source_surface !== "admin_api")
  ) {
    return {
      ok: false,
      status: 403,
      error: "Admin booking persistence requires a verified admin or dispatcher server session.",
    };
  }

  return {
    ok: true,
    data: null,
  };
}

function getServerOnlySupabaseClient(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const enabled = process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true";

  if (!enabled) {
    return {
      ok: false,
      status: 503,
      error: disabledPersistenceError,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      ok: false,
      status: stagingReadiness.status,
      error: stagingReadiness.error,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      status: 503,
      error: safeStagingReadinessError,
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

async function insertRowAndSelectIdWithFallback(
  client: SupabaseClient,
  table: string,
  currentPayload: UnknownRecord,
  cumulativePayload: UnknownRecord,
) {
  const currentResult = await client.from(table).insert(currentPayload).select("id").single();

  if (!currentResult.error && dbIdentifierOrNull(asRecord(currentResult.data).id)) {
    return currentResult;
  }

  return client.from(table).insert(cumulativePayload).select("id").single();
}

async function insertRowsWithFallback(
  client: SupabaseClient,
  table: string,
  currentPayload: UnknownRecord | UnknownRecord[],
  cumulativePayload: UnknownRecord | UnknownRecord[],
) {
  const currentResult = await client.from(table).insert(currentPayload);

  if (!currentResult.error) {
    return currentResult;
  }

  return client.from(table).insert(cumulativePayload);
}

async function findOrCreateCustomerId(
  client: SupabaseClient,
  booking: AdminBookingRecordInput,
): Promise<AdminBookingResult<DbIdentifier>> {
  const displayName = textOrNull(booking.customer_display_name) || "Customer To Confirm";
  const { data: existingRows, error: existingError } = await client
    .from("customers")
    .select("id")
    .eq("display_name", displayName)
    .limit(1);

  if (existingError) {
    return {
      ok: false,
      status: 500,
      error: safeSaveError,
    };
  }

  const existingId = dbIdentifierOrNull(asRecord(asArray(existingRows)[0]).id);

  if (existingId) {
    return {
      ok: true,
      data: existingId,
    };
  }

  const { data: insertedRow, error: insertError } = await insertRowAndSelectIdWithFallback(
    client,
    "customers",
    {
      display_name: displayName,
      status: "active",
    },
    {
      account_status: "active",
      display_name: displayName,
    },
  );
  const insertedId = dbIdentifierOrNull(asRecord(insertedRow).id);

  if (insertError || !insertedId) {
    return {
      ok: false,
      status: 500,
      error: safeSaveError,
    };
  }

  return {
    ok: true,
    data: insertedId,
  };
}

async function ensureCustomerContact(
  client: SupabaseClient,
  customerId: DbIdentifier,
  booking: AdminBookingRecordInput,
): Promise<AdminBookingResult<null>> {
  const displayName = textOrNull(booking.contact_display_name) || textOrNull(booking.customer_display_name);
  const phone = textOrNull(booking.contact_phone);
  const email = textOrNull(booking.contact_email);
  const contactName = displayName || phone || email || "Contact To Confirm";

  if (!displayName && !phone && !email) {
    return {
      ok: true,
      data: null,
    };
  }

  let query = client.from("customer_contacts").select("id").eq("customer_id", customerId).limit(1);

  if (phone) {
    query = query.eq("phone", phone);
  } else if (email) {
    query = query.eq("email", email);
  } else {
    query = query.eq("display_name", displayName);
  }

  const { data: existingRows, error: existingError } = await query;

  if (existingError) {
    return {
      ok: false,
      status: 500,
      error: safeSaveError,
    };
  }

  if (dbIdentifierOrNull(asRecord(asArray(existingRows)[0]).id)) {
    return {
      ok: true,
      data: null,
    };
  }

  const { error } = await insertRowsWithFallback(
    client,
    "customer_contacts",
    {
      customer_id: customerId,
      display_name: displayName,
      phone,
      email,
      role_label: "booking_contact",
      is_primary: true,
    },
    {
      contact_name: contactName,
      contact_type: "booking_contact",
      customer_id: customerId,
      email,
      phone,
    },
  );

  if (error) {
    return {
      ok: false,
      status: 500,
      error: safeSaveError,
    };
  }

  return {
    ok: true,
    data: null,
  };
}

async function fetchAdminBookingById(
  client: SupabaseClient,
  bookingId: DbIdentifier,
): Promise<AdminBookingResult<AdminBookingPersistenceRecord>> {
  const { data, error } = await client
    .from("bookings")
    .select(
      "id, booking_reference, customer_id, customer_display_name, contact_display_name, contact_phone, contact_email, service_type, pickup_at, pickup_location, dropoff_location, route_summary, passenger_name, passenger_phone, admin_internal_status, customer_facing_status, short_notice_review_status, request_review_status, change_review_status, cancellation_review_status, source_surface, created_at, updated_at, booking_route_points(point_type, sequence, location, notes), booking_service_items(item_type, quantity, notes)",
    )
    .eq("id", bookingId)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      status: 500,
      error: safeReloadError,
    };
  }

  return {
    ok: true,
    data: toAdminBookingDto(asRecord(data)),
  };
}

async function fetchAdminBookingByReference(
  client: SupabaseClient,
  bookingReference: string,
): Promise<AdminBookingResult<AdminBookingPersistenceRecord & { id: DbIdentifier }>> {
  const { data, error } = await client
    .from("bookings")
    .select(
      "id, booking_reference, customer_id, customer_display_name, contact_display_name, contact_phone, contact_email, service_type, pickup_at, pickup_location, dropoff_location, route_summary, passenger_name, passenger_phone, admin_internal_status, customer_facing_status, short_notice_review_status, request_review_status, change_review_status, cancellation_review_status, source_surface, created_at, updated_at, booking_route_points(point_type, sequence, location, notes), booking_service_items(item_type, quantity, notes)",
    )
    .eq("booking_reference", bookingReference)
    .limit(1)
    .maybeSingle();
  const bookingId = dbIdentifierOrNull(asRecord(data).id);

  if (error) {
    return {
      ok: false,
      status: 500,
      error: safeUpdateError,
    };
  }

  if (!bookingId || !data) {
    return {
      ok: false,
      status: 404,
      error: safeUpdateTargetMissingError,
    };
  }

  return {
    ok: true,
    data: {
      id: bookingId,
      ...toAdminBookingDto(asRecord(data)),
    },
  };
}

async function createAuditLog(
  client: SupabaseClient,
  bookingId: DbIdentifier,
  customerId: DbIdentifier | null,
  bookingReference: string,
  auditInput: AdminBookingAuditInput,
  actor: AdminBookingPersistenceAdapterActor,
  safeBefore: AdminBookingPersistenceRecord | null,
  safeAfter: AdminBookingPersistenceRecord | AdminBookingPersistenceInput | null,
): Promise<AdminBookingResult<null>> {
  const actionType = auditActionToDb(auditInput.action);
  const reason = textOrNull(
    [auditInput.change_summary, `Source: ${auditInput.source_route}`, `Actor: ${actor.actor_label}`].join(" "),
  );
  const sourceSurface = actor.actor_role === "system" ? "system" : "admin_api";
  const { error } = await insertRowsWithFallback(
    client,
    "audit_logs",
    {
      booking_id: bookingId,
      customer_id: customerId,
      actor_role: actor.actor_role,
      action_type: actionType,
      booking_reference: bookingReference,
      source_surface: sourceSurface,
      reason,
      safe_before: safeAuditSnapshot(safeBefore),
      safe_after: safeAuditSnapshot(safeAfter),
    },
    {
      action: actionType,
      action_type: actionType,
      actor_label: textOrNull(auditInput.actor_label) || actor.actor_label,
      actor_role: actor.actor_role,
      booking_id: bookingId,
      booking_reference: bookingReference,
      change_summary: textOrNull(auditInput.change_summary),
      customer_id: customerId,
      entity_id: bookingId,
      entity_type: "booking",
      reason,
      safe_after: safeAuditSnapshot(safeAfter),
      safe_before: safeAuditSnapshot(safeBefore),
      source_route: textOrNull(auditInput.source_route),
      source_surface: sourceSurface,
    },
  );

  if (error) {
    return {
      ok: false,
      status: 500,
      error: safeSaveError,
    };
  }

  return {
    ok: true,
    data: null,
  };
}

export function adminDispatcherBoundaryToPersistenceAdapterActor(
  context: AdminDispatcherBoundaryContext,
): AdminBookingPersistenceAdapterActor {
  return {
    actor_label: context.actorLabel,
    actor_role: context.role === "dispatcher" ? "dispatcher" : "admin",
    boundary_mode: context.mode,
    source_surface: "admin_api",
  };
}

export const customerBookingRequestPersistenceAdapterActor: AdminBookingPersistenceAdapterActor = {
  actor_label: "Customer booking request",
  actor_role: "system",
  boundary_mode: "customer-booking-request-surface",
  source_surface: "customer_booking_request",
};

export async function createAdminBookingThroughSupabaseAdapter(
  input: AdminBookingPersistenceInput,
  auditInput: AdminBookingAuditInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookingPersistenceRecord>> {
  const clientResult = getServerOnlySupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const client = clientResult.data;
  const customerIdResult = await findOrCreateCustomerId(client, input.booking);

  if (!customerIdResult.ok) {
    return customerIdResult;
  }

  const customerId = customerIdResult.data;
  const contactResult = await ensureCustomerContact(client, customerId, input.booking);

  if (!contactResult.ok) {
    return contactResult;
  }

  const bookingRow = bookingToDbRow(input.booking, customerId, actor);
  const { data: insertedBooking, error: bookingError } = await client
    .from("bookings")
    .insert(bookingRow)
    .select("id")
    .single();
  const bookingId = dbIdentifierOrNull(asRecord(insertedBooking).id);

  if (bookingError || !bookingId) {
    return {
      ok: false,
      status: 500,
      error: safeSaveError,
    };
  }

  if (input.route_points.length > 0) {
    const { error } = await insertRowsWithFallback(
      client,
      "booking_route_points",
      input.route_points.map((routePoint) => routePointToCurrentDbRow(routePoint, bookingId)),
      input.route_points.map((routePoint) => routePointToCumulativeDbRow(routePoint, bookingId)),
    );

    if (error) {
      return {
        ok: false,
        status: 500,
        error: safeSaveError,
      };
    }
  }

  if (input.service_items.length > 0) {
    const { error } = await insertRowsWithFallback(
      client,
      "booking_service_items",
      input.service_items.map((serviceItem) => serviceItemToCurrentDbRow(serviceItem, bookingId)),
      input.service_items.map((serviceItem) => serviceItemToCumulativeDbRow(serviceItem, bookingId)),
    );

    if (error) {
      return {
        ok: false,
        status: 500,
        error: safeSaveError,
      };
    }
  }

  const reloadedResult = await fetchAdminBookingById(client, bookingId);

  if (!reloadedResult.ok) {
    return reloadedResult;
  }

  const auditResult = await createAuditLog(
    client,
    bookingId,
    customerId,
    bookingRow.booking_reference,
    auditInput,
    actor,
    null,
    reloadedResult.data,
  );

  if (!auditResult.ok) {
    return auditResult;
  }

  return reloadedResult;
}

export async function updateAdminBookingThroughSupabaseAdapter(
  input: AdminBookingPersistenceUpdateInput,
  auditInput: AdminBookingAuditInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookingPersistenceRecord>> {
  const clientResult = getServerOnlySupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const client = clientResult.data;
  const existingResult = await fetchAdminBookingByReference(client, input.target_booking_reference);

  if (!existingResult.ok) {
    return existingResult;
  }

  const existing = existingResult.data;
  const customerIdResult = await findOrCreateCustomerId(client, input.booking);

  if (!customerIdResult.ok) {
    return customerIdResult;
  }

  const customerId = customerIdResult.data;
  const contactResult = await ensureCustomerContact(client, customerId, input.booking);

  if (!contactResult.ok) {
    return contactResult;
  }

  const bookingRow = bookingToDbRow(input.booking, customerId, actor);
  const { error: bookingError } = await client
    .from("bookings")
    .update({
      ...bookingRow,
      booking_reference: input.target_booking_reference,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (bookingError) {
    return {
      ok: false,
      status: 500,
      error: safeUpdateError,
    };
  }

  const { error: routeDeleteError } = await client
    .from("booking_route_points")
    .delete()
    .eq("booking_id", existing.id);

  if (routeDeleteError) {
    return {
      ok: false,
      status: 500,
      error: safeUpdateError,
    };
  }

  if (input.route_points.length > 0) {
    const { error } = await insertRowsWithFallback(
      client,
      "booking_route_points",
      input.route_points.map((routePoint) => routePointToCurrentDbRow(routePoint, existing.id)),
      input.route_points.map((routePoint) => routePointToCumulativeDbRow(routePoint, existing.id)),
    );

    if (error) {
      return {
        ok: false,
        status: 500,
        error: safeUpdateError,
      };
    }
  }

  const { error: serviceDeleteError } = await client
    .from("booking_service_items")
    .delete()
    .eq("booking_id", existing.id);

  if (serviceDeleteError) {
    return {
      ok: false,
      status: 500,
      error: safeUpdateError,
    };
  }

  if (input.service_items.length > 0) {
    const { error } = await insertRowsWithFallback(
      client,
      "booking_service_items",
      input.service_items.map((serviceItem) => serviceItemToCurrentDbRow(serviceItem, existing.id)),
      input.service_items.map((serviceItem) => serviceItemToCumulativeDbRow(serviceItem, existing.id)),
    );

    if (error) {
      return {
        ok: false,
        status: 500,
        error: safeUpdateError,
      };
    }
  }

  const reloadedResult = await fetchAdminBookingById(client, existing.id);

  if (!reloadedResult.ok) {
    return reloadedResult;
  }

  const auditResult = await createAuditLog(
    client,
    existing.id,
    customerId,
    input.target_booking_reference,
    auditInput,
    actor,
    existing,
    reloadedResult.data,
  );

  if (!auditResult.ok) {
    return auditResult;
  }

  return reloadedResult;
}

export async function listAdminBookingsThroughSupabaseAdapter(
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookingPersistenceRecord[]>> {
  const clientResult = getServerOnlySupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("bookings")
    .select(
      "id, booking_reference, customer_id, customer_display_name, contact_display_name, contact_phone, contact_email, service_type, pickup_at, pickup_location, dropoff_location, route_summary, passenger_name, passenger_phone, admin_internal_status, customer_facing_status, short_notice_review_status, request_review_status, change_review_status, cancellation_review_status, source_surface, created_at, updated_at, booking_route_points(point_type, sequence, location, notes), booking_service_items(item_type, quantity, notes)",
    )
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return {
      ok: false,
      status: 500,
      error: safeLoadError,
    };
  }

  return {
    ok: true,
    data: asArray(data).map(asRecord).map(toAdminBookingDto),
  };
}
