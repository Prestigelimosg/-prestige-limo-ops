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

export const driverPortalBiddingPersistenceVersion = "driver-portal-bidding-api-v1";

export const driverJobBidOfferStatuses = [
  "draft",
  "open",
  "closed",
  "assigned",
  "cancelled",
  "expired",
] as const;

export const driverJobBidStatuses = [
  "pending",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
] as const;

export type DriverJobBidOfferStatus = (typeof driverJobBidOfferStatuses)[number];
export type DriverJobBidStatus = (typeof driverJobBidStatuses)[number];

export type AdminDriverJobBidOfferSafeContext = {
  next_action?: string;
  offer_summary?: string;
};

export type AdminDriverJobBidOfferInput = {
  bid_offer_id: string | null;
  booking_reference: string;
  closes_at: string | null;
  offer_status: DriverJobBidOfferStatus;
  pickup_at: string;
  safe_dropoff_area: string;
  safe_offer_context: AdminDriverJobBidOfferSafeContext;
  safe_pickup_area: string;
  safe_trip_summary: string | null;
  safe_vehicle_label: string | null;
};

export type AdminDriverJobBidOfferStatusUpdateInput = {
  bid_offer_id: string;
  offer_status: Extract<
    DriverJobBidOfferStatus,
    "assigned" | "cancelled" | "closed" | "expired" | "open"
  >;
};

export type AdminDriverJobBidOfferLoadParams = {
  bid_offer_id: string | null;
  bid_status: DriverJobBidStatus | null;
  booking_reference: string | null;
  driver_reference: string | null;
  limit: number;
  offer_status: DriverJobBidOfferStatus | null;
  page: number;
};

export type AdminDriverJobBidRecord = {
  bid_source: "driver_portal_api" | "admin_api" | "migration" | "system";
  bid_status: DriverJobBidStatus;
  booking_reference: string;
  created_at: string | null;
  decided_at: string | null;
  decision_actor_label: string | null;
  decision_actor_role: "admin" | "dispatcher" | "system" | null;
  driver_job_bid_offer_id: string;
  driver_reference: string;
  id: string | null;
  safe_bid_context: Record<string, unknown>;
  safe_bid_note: string | null;
  safe_driver_label: string | null;
  submitted_at: string | null;
  updated_at: string | null;
  withdrawn_at: string | null;
};

export type AdminDriverJobBidOfferRecord = {
  actor_label: string | null;
  actor_role: "admin" | "dispatcher" | "system";
  bids: AdminDriverJobBidRecord[];
  booking_reference: string;
  closed_at: string | null;
  closes_at: string | null;
  created_at: string | null;
  id: string | null;
  offer_status: DriverJobBidOfferStatus;
  opened_at: string | null;
  pickup_at: string | null;
  safe_dropoff_area: string;
  safe_offer_context: AdminDriverJobBidOfferSafeContext;
  safe_pickup_area: string;
  safe_trip_summary: string | null;
  safe_vehicle_label: string | null;
  source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
  updated_at: string | null;
};

export type AdminDriverJobBidOfferPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_bid_offer_count: number;
};

export type AdminDriverJobBidOfferLoadResult = {
  bid_offers: AdminDriverJobBidOfferRecord[];
  pagination: AdminDriverJobBidOfferPagination;
  version: typeof driverPortalBiddingPersistenceVersion;
};

type UnknownRecord = Record<string, unknown>;

const maxBookingReferenceLength = 120;
const maxSafeAreaLength = 160;
const maxSafeDriverReferenceLength = 120;
const maxSafeVehicleLabelLength = 120;
const maxSafeContextTextLength = 500;
const maxSafeTripSummaryLength = 1000;
const maxSafeJsonLength = 3000;
const maxBidOfferLimit = 250;
const defaultBidOfferLimit = 25;
const maxBidOfferPage = 1000;
const maxReadRows = 500;
const disabledBiddingPersistenceError =
  "Driver portal bidding persistence is not enabled on this server.";
const safeBiddingConfigError =
  "Driver portal bidding persistence configuration is not ready.";
const safeBiddingActorError =
  "Driver portal bidding persistence requires a verified internal boundary.";
const safeBiddingServerSessionActorError =
  "Driver portal bidding persistence requires a verified admin or dispatcher server session.";
const safeBiddingLoadError = "Driver portal bidding load failed safely.";
const safeBiddingSaveError = "Driver portal bidding save failed safely.";
const safeBiddingUpdateError = "Driver portal bidding status update failed safely.";
export const driverPortalBidBlockedError =
  "Driver bidding requires approved driver auth before runtime access.";
const bidOfferSelect =
  "id, booking_reference, offer_status, pickup_at, safe_pickup_area, safe_dropoff_area, safe_vehicle_label, safe_trip_summary, safe_offer_context, source_surface, actor_role, actor_label, opened_at, closes_at, closed_at, created_at, updated_at";
const bidSelect =
  "id, driver_job_bid_offer_id, booking_reference, driver_reference, bid_status, bid_source, safe_driver_label, safe_bid_note, safe_bid_context, submitted_at, withdrawn_at, decided_at, decision_actor_role, decision_actor_label, created_at, updated_at";
const allowedOfferStatuses = new Set<string>(driverJobBidOfferStatuses);
const allowedBidStatuses = new Set<string>(driverJobBidStatuses);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedBidSources = new Set(["driver_portal_api", "admin_api", "migration", "system"]);
const allowedReadParams = new Set([
  "bid_offer_id",
  "bid_status",
  "booking_reference",
  "driver_reference",
  "limit",
  "offer_status",
  "page",
]);
const allowedSaveFields = new Set([
  "bid_offer_id",
  "booking_reference",
  "closes_at",
  "next_action",
  "offer_status",
  "offer_summary",
  "pickup_at",
  "safe_dropoff_area",
  "safe_offer_context",
  "safe_pickup_area",
  "safe_trip_summary",
  "safe_vehicle_label",
]);
const allowedStatusUpdateFields = new Set(["bid_offer_id", "offer_status"]);
const allowedSafeContextFields = new Set(["next_action", "offer_summary"]);
const allowedStatusUpdateStatuses = new Set(["assigned", "cancelled", "closed", "expired", "open"]);
const forbiddenBiddingFragments = [
  "amount_due",
  "auth_link",
  "bank_account",
  "billing",
  "card_number",
  "contact_email",
  "contact_phone",
  "customer_auth",
  "customer_charge",
  "customer_email",
  "customer_phone",
  "customer_price",
  "dev_workbench",
  "driver_auth",
  "driver_job_link",
  "driver_payout",
  "email_send",
  "fare_amount",
  "finance",
  "finance_note",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "invoice_number",
  "live_location",
  "mock_archive",
  "mock_qa",
  "notification",
  "notification_delivery",
  "paid_amount",
  "passenger_email",
  "passenger_phone",
  "payment",
  "payment_link",
  "payment_status",
  "paynow",
  "pay_now",
  "pdf",
  "pdf_link",
  "payout",
  "payout_comparison",
  "proof",
  "photo",
  "qa_archive",
  "quoted_price",
  "rate_amount",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "service_role",
  "send_log",
  "send_state",
  "server_only",
  "server_secret",
  "sms_send",
  "stripe",
  "telegram",
  "token",
  "whatsapp_send",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasOwn(record: UnknownRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenBiddingFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenBiddingFragments.some((fragment) => normalized.includes(fragment));
}

function forbiddenBiddingResult<T>(): AdminBookingResult<T> {
  return {
    error: "Driver portal bidding details include unsupported or unsafe fields.",
    ok: false,
    status: 400,
  };
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
    const keyLeaks = includesForbiddenBiddingFragment(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function findForbiddenTextValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(findForbiddenTextValues);
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value as UnknownRecord).flatMap(findForbiddenTextValues);
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return [];
  }

  const text = String(value);

  return includesForbiddenBiddingFragment(text) ? [text] : [];
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function unknownSearchParams(params: URLSearchParams) {
  return Array.from(params.keys()).filter((key) => !allowedReadParams.has(key));
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenBiddingFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function optionalSafeText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return safeText(value, maxLength);
}

function validUuid(value: unknown) {
  const cleaned = safeText(value, 80);

  return cleaned && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : null;
}

function validDateTime(value: unknown) {
  const cleaned = safeText(value, 80);

  if (!cleaned) {
    return null;
  }

  const date = new Date(cleaned);

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function validOfferStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedOfferStatuses.has(cleaned) ? (cleaned as DriverJobBidOfferStatus) : null;
}

function validBidStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedBidStatuses.has(cleaned) ? (cleaned as DriverJobBidStatus) : null;
}

function validStatusUpdateOfferStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedStatusUpdateStatuses.has(cleaned)
    ? (cleaned as AdminDriverJobBidOfferStatusUpdateInput["offer_status"])
    : null;
}

function positiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxValue ? parsed : null;
}

function safeObject(value: unknown, maxLength: number) {
  if (value === undefined || value === null) {
    return {};
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const text = JSON.stringify(value);

  if (
    text.length > maxLength ||
    findForbiddenFieldNames(value).length > 0 ||
    findForbiddenTextValues(value).length > 0
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseSafeOfferContext(record: UnknownRecord) {
  const contextRecord = asRecord(record.safe_offer_context);
  const unknownContextFields = unknownKeys(
    contextRecord,
    allowedSafeContextFields,
    "safe_offer_context",
  );

  if (
    unknownContextFields.length > 0 ||
    findForbiddenFieldNames(contextRecord).length > 0 ||
    findForbiddenTextValues(contextRecord).length > 0
  ) {
    return null;
  }

  const nextAction = optionalSafeText(
    contextRecord.next_action ?? record.next_action,
    maxSafeContextTextLength,
  );
  const offerSummary = optionalSafeText(
    contextRecord.offer_summary ?? record.offer_summary,
    maxSafeContextTextLength,
  );

  if (
    ((contextRecord.next_action ?? record.next_action) && !nextAction) ||
    ((contextRecord.offer_summary ?? record.offer_summary) && !offerSummary)
  ) {
    return null;
  }

  return {
    ...(nextAction ? { next_action: nextAction } : {}),
    ...(offerSummary ? { offer_summary: offerSummary } : {}),
  };
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function classifyAdapterDatabaseFailure(
  error: unknown,
): AdminBookingPersistenceSafeErrorCategory {
  const record = asRecord(error);
  const haystack = Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).toLowerCase())
    .join(" ");
  const code = textOrNull(record.code)?.toLowerCase() || "";
  const statusValue = Number(record.status);
  const status = Number.isFinite(statusValue) ? statusValue : null;

  if (
    status === 401 ||
    code === "401" ||
    haystack.includes("invalid api") ||
    haystack.includes("invalid jwt") ||
    haystack.includes("jwt")
  ) {
    return "auth_or_key_rejected";
  }

  if (
    status === 403 ||
    code === "42501" ||
    haystack.includes("permission denied") ||
    haystack.includes("row level security") ||
    haystack.includes("row-level security") ||
    haystack.includes("rls")
  ) {
    return "permission_or_rls_denied";
  }

  if (
    code === "42p01" ||
    haystack.includes("could not find the table") ||
    (haystack.includes("relation") && haystack.includes("does not exist"))
  ) {
    return "table_unreachable";
  }

  if (
    code === "42703" ||
    code === "pgrst204" ||
    code === "pgrst200" ||
    (haystack.includes("column") &&
      (haystack.includes("does not exist") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  ) {
    return "column_missing";
  }

  return "unknown_adapter_failure";
}

function safeAdapterFailure<T>(
  error: string,
  status: number,
  databaseError: unknown,
): AdminBookingResult<T> {
  return {
    category: classifyAdapterDatabaseFailure(databaseError),
    error,
    ok: false,
    status,
  };
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedActorRoles.has(actor.actor_role) ||
    !textOrNull(actor.actor_label) ||
    actor.source_surface !== "admin_api"
  ) {
    return {
      error: safeBiddingActorError,
      ok: false,
      status: 403,
    };
  }

  if (
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true" &&
    (actor.boundary_mode !== "server-session-role-surface" ||
      !["admin", "dispatcher"].includes(actor.actor_role))
  ) {
    return {
      error: safeBiddingServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyBiddingSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledBiddingPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeBiddingConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeBiddingConfigError,
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
      category: "client_init_failed",
      error: safeBiddingConfigError,
      ok: false,
      status: 503,
    };
  }
}

function normalizeBidRecord(row: UnknownRecord): AdminDriverJobBidRecord {
  return {
    bid_source: allowedBidSources.has(String(row.bid_source))
      ? (String(row.bid_source) as AdminDriverJobBidRecord["bid_source"])
      : "system",
    bid_status: validBidStatus(row.bid_status) || "pending",
    booking_reference: textOrNull(row.booking_reference) || "",
    created_at: textOrNull(row.created_at),
    decided_at: textOrNull(row.decided_at),
    decision_actor_label: textOrNull(row.decision_actor_label),
    decision_actor_role: allowedActorRoles.has(String(row.decision_actor_role))
      ? (String(row.decision_actor_role) as "admin" | "dispatcher" | "system")
      : null,
    driver_job_bid_offer_id: textOrNull(row.driver_job_bid_offer_id) || "",
    driver_reference: textOrNull(row.driver_reference) || "",
    id: textOrNull(row.id),
    safe_bid_context: asRecord(row.safe_bid_context),
    safe_bid_note: textOrNull(row.safe_bid_note),
    safe_driver_label: textOrNull(row.safe_driver_label),
    submitted_at: textOrNull(row.submitted_at),
    updated_at: textOrNull(row.updated_at),
    withdrawn_at: textOrNull(row.withdrawn_at),
  };
}

function normalizeBidOfferRecord(
  row: UnknownRecord,
  bidsByOfferId: Map<string, AdminDriverJobBidRecord[]>,
): AdminDriverJobBidOfferRecord {
  const id = textOrNull(row.id);

  return {
    actor_label: textOrNull(row.actor_label),
    actor_role: allowedActorRoles.has(String(row.actor_role))
      ? (String(row.actor_role) as "admin" | "dispatcher" | "system")
      : "system",
    bids: id ? bidsByOfferId.get(id) || [] : [],
    booking_reference: textOrNull(row.booking_reference) || "",
    closed_at: textOrNull(row.closed_at),
    closes_at: textOrNull(row.closes_at),
    created_at: textOrNull(row.created_at),
    id,
    offer_status: validOfferStatus(row.offer_status) || "draft",
    opened_at: textOrNull(row.opened_at),
    pickup_at: textOrNull(row.pickup_at),
    safe_dropoff_area: textOrNull(row.safe_dropoff_area) || "",
    safe_offer_context: asRecord(row.safe_offer_context) as AdminDriverJobBidOfferSafeContext,
    safe_pickup_area: textOrNull(row.safe_pickup_area) || "",
    safe_trip_summary: textOrNull(row.safe_trip_summary),
    safe_vehicle_label: textOrNull(row.safe_vehicle_label),
    source_surface: allowedSourceSurfaces.has(String(row.source_surface))
      ? (String(row.source_surface) as AdminDriverJobBidOfferRecord["source_surface"])
      : "system",
    updated_at: textOrNull(row.updated_at),
  };
}

function filterBidOffers(
  offers: AdminDriverJobBidOfferRecord[],
  params: AdminDriverJobBidOfferLoadParams,
) {
  return offers.filter((offer) => {
    if (params.bid_offer_id && offer.id !== params.bid_offer_id) {
      return false;
    }

    if (params.booking_reference && offer.booking_reference !== params.booking_reference) {
      return false;
    }

    if (params.offer_status && offer.offer_status !== params.offer_status) {
      return false;
    }

    if (
      params.driver_reference &&
      !offer.bids.some((bid) => bid.driver_reference === params.driver_reference)
    ) {
      return false;
    }

    return !params.bid_status || offer.bids.some((bid) => bid.bid_status === params.bid_status);
  });
}

function paginateBidOffers(
  offers: AdminDriverJobBidOfferRecord[],
  params: AdminDriverJobBidOfferLoadParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return offers.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  offers: AdminDriverJobBidOfferRecord[],
  params: AdminDriverJobBidOfferLoadParams,
): AdminDriverJobBidOfferPagination {
  const pageCount = offers.length > 0 ? Math.ceil(offers.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_bid_offer_count: offers.length,
  };
}

export function parseAdminDriverJobBidOfferLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminDriverJobBidOfferLoadParams> {
  if (params instanceof URLSearchParams && unknownSearchParams(params).length > 0) {
    return forbiddenBiddingResult();
  }

  if (
    !(params instanceof URLSearchParams) &&
    unknownKeys(params, allowedReadParams, "driver_bid_offer_read").length > 0
  ) {
    return forbiddenBiddingResult();
  }

  const bidOfferIdValue = readParamsValue(params, "bid_offer_id");
  const bidOfferId =
    bidOfferIdValue === undefined || bidOfferIdValue === null || bidOfferIdValue === ""
      ? null
      : validUuid(bidOfferIdValue);

  if (bidOfferIdValue && !bidOfferId) {
    return {
      error: "Malformed driver bid offer id rejected.",
      ok: false,
      status: 400,
    };
  }

  const bookingReferenceValue = readParamsValue(params, "booking_reference");
  const bookingReference =
    bookingReferenceValue === undefined ||
    bookingReferenceValue === null ||
    bookingReferenceValue === ""
      ? null
      : safeText(bookingReferenceValue, maxBookingReferenceLength);

  if (bookingReferenceValue && !bookingReference) {
    return {
      error: "Malformed driver bid offer booking reference rejected.",
      ok: false,
      status: 400,
    };
  }

  const driverReferenceValue = readParamsValue(params, "driver_reference");
  const driverReference =
    driverReferenceValue === undefined || driverReferenceValue === null || driverReferenceValue === ""
      ? null
      : safeText(driverReferenceValue, maxSafeDriverReferenceLength);

  if (driverReferenceValue && !driverReference) {
    return {
      error: "Malformed driver bid driver reference rejected.",
      ok: false,
      status: 400,
    };
  }

  const offerStatusValue = readParamsValue(params, "offer_status");
  const offerStatus =
    offerStatusValue === undefined || offerStatusValue === null || offerStatusValue === ""
      ? null
      : validOfferStatus(offerStatusValue);

  if (offerStatusValue && !offerStatus) {
    return {
      error: "Malformed driver bid offer status rejected.",
      ok: false,
      status: 400,
    };
  }

  const bidStatusValue = readParamsValue(params, "bid_status");
  const bidStatus =
    bidStatusValue === undefined || bidStatusValue === null || bidStatusValue === ""
      ? null
      : validBidStatus(bidStatusValue);

  if (bidStatusValue && !bidStatus) {
    return {
      error: "Malformed driver bid status rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(
    readParamsValue(params, "limit"),
    defaultBidOfferLimit,
    maxBidOfferLimit,
  );

  if (!limit) {
    return {
      error: "Malformed driver bid offer limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxBidOfferPage);

  if (!page) {
    return {
      error: "Malformed driver bid offer page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      bid_offer_id: bidOfferId,
      bid_status: bidStatus,
      booking_reference: bookingReference,
      driver_reference: driverReference,
      limit,
      offer_status: offerStatus,
      page,
    },
    ok: true,
  };
}

export function parseAdminDriverJobBidOfferSavePayload(
  value: unknown,
): AdminBookingResult<AdminDriverJobBidOfferInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedSaveFields, "driver_bid_offer").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenBiddingResult();
  }

  const bidOfferId =
    record.bid_offer_id === undefined || record.bid_offer_id === null || record.bid_offer_id === ""
      ? null
      : validUuid(record.bid_offer_id);
  const bookingReference = safeText(record.booking_reference, maxBookingReferenceLength);
  const offerStatus = validOfferStatus(record.offer_status) || "open";
  const pickupAt = validDateTime(record.pickup_at);
  const closesAt =
    record.closes_at === undefined || record.closes_at === null || record.closes_at === ""
      ? null
      : validDateTime(record.closes_at);
  const safePickupArea = safeText(record.safe_pickup_area, maxSafeAreaLength);
  const safeDropoffArea = safeText(record.safe_dropoff_area, maxSafeAreaLength);
  const safeVehicleLabel = optionalSafeText(record.safe_vehicle_label, maxSafeVehicleLabelLength);
  const safeTripSummary = optionalSafeText(record.safe_trip_summary, maxSafeTripSummaryLength);
  const safeOfferContext = parseSafeOfferContext(record);
  const safeOfferContextObject = safeObject(record.safe_offer_context, maxSafeJsonLength);

  if ((record.bid_offer_id && !bidOfferId) || !bookingReference) {
    return {
      error: "Driver bid offer identifiers are malformed.",
      ok: false,
      status: 400,
    };
  }

  if (!pickupAt || (record.closes_at && !closesAt)) {
    return {
      error: "Driver bid offer schedule is malformed.",
      ok: false,
      status: 400,
    };
  }

  if (!safePickupArea || !safeDropoffArea) {
    return {
      error: "Driver bid offer route summary is malformed.",
      ok: false,
      status: 400,
    };
  }

  if (
    (record.safe_vehicle_label && !safeVehicleLabel) ||
    (record.safe_trip_summary && !safeTripSummary) ||
    !safeOfferContext ||
    !safeOfferContextObject
  ) {
    return {
      error: "Driver bid offer safe context is malformed.",
      ok: false,
      status: 400,
    };
  }

  if (offerStatus === "assigned") {
    return {
      error: "Driver bid offer assignment must use the explicit status update path.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      bid_offer_id: bidOfferId,
      booking_reference: bookingReference,
      closes_at: closesAt,
      offer_status: offerStatus,
      pickup_at: pickupAt,
      safe_dropoff_area: safeDropoffArea,
      safe_offer_context: safeOfferContext,
      safe_pickup_area: safePickupArea,
      safe_trip_summary: hasOwn(record, "safe_trip_summary") ? safeTripSummary : null,
      safe_vehicle_label: hasOwn(record, "safe_vehicle_label") ? safeVehicleLabel : null,
    },
    ok: true,
  };
}

export function parseAdminDriverJobBidOfferStatusUpdatePayload(
  value: unknown,
): AdminBookingResult<AdminDriverJobBidOfferStatusUpdateInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedStatusUpdateFields, "driver_bid_offer_status").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenBiddingResult();
  }

  const bidOfferId = validUuid(record.bid_offer_id);
  const offerStatus = validStatusUpdateOfferStatus(record.offer_status);

  if (!bidOfferId || !offerStatus) {
    return {
      error: "Driver bid offer status update payload is malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      bid_offer_id: bidOfferId,
      offer_status: offerStatus,
    },
    ok: true,
  };
}

export function driverBidRuntimeAccessBlocked<T>(): AdminBookingResult<T> {
  return {
    error: driverPortalBidBlockedError,
    ok: false,
    status: 403,
  };
}

export async function loadAdminDriverJobBidOffers(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverJobBidOfferLoadResult>> {
  const parsed = parseAdminDriverJobBidOfferLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyBiddingSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const [offersResult, bidsResult] = await Promise.all([
    clientResult.data.from("driver_job_bid_offers").select(bidOfferSelect).limit(maxReadRows),
    clientResult.data.from("driver_job_bids").select(bidSelect).limit(maxReadRows),
  ]);

  if (offersResult.error) {
    return safeAdapterFailure(safeBiddingLoadError, 500, offersResult.error);
  }

  if (bidsResult.error) {
    return safeAdapterFailure(safeBiddingLoadError, 500, bidsResult.error);
  }

  const bids = asArray(bidsResult.data).map(asRecord).map(normalizeBidRecord);
  const bidsByOfferId = bids.reduce((grouped, bid) => {
    const existing = grouped.get(bid.driver_job_bid_offer_id) || [];

    existing.push(bid);
    grouped.set(bid.driver_job_bid_offer_id, existing);

    return grouped;
  }, new Map<string, AdminDriverJobBidRecord[]>());
  const offers = asArray(offersResult.data)
    .map(asRecord)
    .map((row) => normalizeBidOfferRecord(row, bidsByOfferId))
    .sort(
      (first, second) =>
        String(first.pickup_at || "").localeCompare(String(second.pickup_at || "")) ||
        first.booking_reference.localeCompare(second.booking_reference),
    );
  const filteredOffers = filterBidOffers(offers, parsed.data);

  return {
    data: {
      bid_offers: paginateBidOffers(filteredOffers, parsed.data),
      pagination: buildPagination(filteredOffers, parsed.data),
      version: driverPortalBiddingPersistenceVersion,
    },
    ok: true,
  };
}

export async function saveAdminDriverJobBidOffer(
  input: AdminDriverJobBidOfferInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverJobBidOfferRecord>> {
  const clientResult = getServerOnlyBiddingSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    booking_reference: input.booking_reference,
    closes_at: input.closes_at,
    offer_status: input.offer_status,
    pickup_at: input.pickup_at,
    safe_dropoff_area: input.safe_dropoff_area,
    safe_offer_context: input.safe_offer_context,
    safe_pickup_area: input.safe_pickup_area,
    safe_trip_summary: input.safe_trip_summary,
    safe_vehicle_label: input.safe_vehicle_label,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
  const writeQuery = input.bid_offer_id
    ? clientResult.data
        .from("driver_job_bid_offers")
        .update(payload)
        .eq("id", input.bid_offer_id)
    : clientResult.data.from("driver_job_bid_offers").insert(payload);
  const { data, error } = await writeQuery.select(bidOfferSelect).single();

  if (error) {
    return safeAdapterFailure(safeBiddingSaveError, 500, error);
  }

  return {
    data: normalizeBidOfferRecord(asRecord(data), new Map()),
    ok: true,
  };
}

export async function updateAdminDriverJobBidOfferStatus(
  input: AdminDriverJobBidOfferStatusUpdateInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverJobBidOfferRecord>> {
  const clientResult = getServerOnlyBiddingSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const closingStatus = ["assigned", "cancelled", "closed", "expired"].includes(
    input.offer_status,
  );
  const payload = {
    closed_at: closingStatus ? new Date().toISOString() : null,
    offer_status: input.offer_status,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("driver_job_bid_offers")
    .update(payload)
    .eq("id", input.bid_offer_id)
    .select(bidOfferSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeBiddingUpdateError, 500, error);
  }

  return {
    data: normalizeBidOfferRecord(asRecord(data), new Map()),
    ok: true,
  };
}
