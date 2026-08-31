import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminDispatcherBoundaryContext } from "./admin-dispatcher-auth-boundary";
import {
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
} from "./driver-job-link";

export const adminAiBookingBriefIntent = "find_exact_booking_brief";

type UnknownRecord = Record<string, unknown>;
type AdminAiBookingBriefClient = Pick<SupabaseClient, "from">;
type ExactReferenceKind = "internal" | "public";

type ParsedBookingBrief = {
  kind: ExactReferenceKind;
  query: string;
  reference: string;
};

export type AdminAiBookingBriefEvidence = {
  job_completed_at: string | null;
  ots_at: string | null;
  otw_at: string | null;
  pob_at: string | null;
};

export type AdminAiBookingBriefLink = {
  acknowledgement_status: "acknowledged" | "pending";
  acknowledged_at: string | null;
  issued_at: string | null;
  state: "active" | "expired" | "revoked";
};

export type AdminAiBookingBriefRecord = {
  assigned_driver_name: string | null;
  assigned_driver_plate: string | null;
  booker_id: number;
  booker_name: string;
  booking_reference: string;
  company_id: number;
  company_name: string;
  customer_id: number;
  dropoff_location: string | null;
  evidence: AdminAiBookingBriefEvidence;
  latest_driver_job_link: AdminAiBookingBriefLink | null;
  open_customer_path: string;
  persisted_status: string;
  pickup_at: string | null;
  pickup_location: string | null;
  public_booking_reference: string;
  route: string | null;
  service_type: string;
  traveller_id: number | null;
  traveller_name: string | null;
};

export type AdminAiBookingBriefResult = {
  answer: string;
  booking: AdminAiBookingBriefRecord | null;
  intent: typeof adminAiBookingBriefIntent;
  query: string;
  read_at: string;
  status: "ambiguous" | "blocked" | "identity_review" | "not_found" | "results";
};

export type AdminAiBookingBriefExecution =
  | { matched: false }
  | { data: AdminAiBookingBriefResult; matched: true; ok: true }
  | { error: string; matched: true; ok: false; status: 403 | 500 | 503 };

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const safeConfigError = "Live booking brief is not configured on this server.";
const safeReadError = "Live booking brief failed safely. No booking was changed.";
const publicReferencePattern = /^\d{4,12}$/;
const internalReferencePattern = /^ADM-[A-Z0-9-]{6,80}$/;
const blockedBookingActionPattern =
  /\b(?:assign|cancel|charge|complete|create|delete|email|expire|issue|mark|modify|pay|refund|remove|revoke|save|send|set|update|write)\b/i;
const injectionPattern =
  /(?:ignore\s+(?:all\s+)?(?:previous|prior)|system\s+prompt|developer\s+message|service[_\s-]?role|api[_\s-]?key|database\s+credential|\b(?:drop|insert|select|update|delete)\s+(?:table|from|into|bookings|driver_job_links)\b)/i;
const directBookingPattern =
  /^(?:show|find|get)(?:\s+me)?\s+booking\s+([A-Z0-9-]+)[\s?.!]*$/i;
const happeningBookingPattern =
  /^what(?:'s|\s+is)\s+happening\s+with\s+booking\s+([A-Z0-9-]+)[\s?.!]*$/i;
const bookingSelect = [
  "id",
  "customer_id",
  "company_id",
  "booker_id",
  "traveler_id",
  "booking_reference",
  "public_booking_reference",
  "service_type",
  "booking_type",
  "pickup_at",
  "pickup_datetime",
  "pickup_time",
  "pickup_location",
  "pickup_address",
  "dropoff_location",
  "dropoff_address",
  "route_summary",
  "route",
  "status",
  "admin_internal_status",
  "customer_facing_status",
  "driver_name",
  "driver_plate_number",
].join(", ");
const linkSelect =
  "booking_reference, link_status, issued_at, expires_at, revoked_at, safe_link_context, created_at";
const statusSelect = "booking_reference, status_value, occurred_at, created_at";

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown, maximumLength = 180) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeDate(value: unknown) {
  const text = cleanText(value, 100);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function parseBookingBrief(messageValue: unknown): ParsedBookingBrief | "blocked" | null {
  const query = cleanText(messageValue, 500);

  if (!query || !/\bbookings?\b/i.test(query)) {
    return null;
  }

  if (blockedBookingActionPattern.test(query) || injectionPattern.test(query)) {
    return "blocked";
  }

  const match = query.match(directBookingPattern) || query.match(happeningBookingPattern);
  const rawReference = cleanText(match?.[1], 100).toUpperCase();

  if (!match || (!publicReferencePattern.test(rawReference) && !internalReferencePattern.test(rawReference))) {
    return "blocked";
  }

  return {
    kind: publicReferencePattern.test(rawReference) ? "public" : "internal",
    query,
    reference: rawReference,
  };
}

function validActor(context: AdminDispatcherBoundaryContext) {
  return (
    context.mode === "server-session-role-surface" &&
    allowedActorRoles.has(context.role) &&
    Boolean(cleanText(context.actorLabel, 160))
  );
}

function validConfig() {
  const url = cleanText(process.env.SUPABASE_URL, 500);
  const key = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY, 2_000);

  if (!url || !key || key.length < 24 || /(?:placeholder|change.?me|example)/i.test(`${url} ${key}`)) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !/(?:localhost|example)/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function createServerClient(): AdminAiBookingBriefClient {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  });
}

function result(
  query: string,
  input: Partial<AdminAiBookingBriefResult>,
): AdminAiBookingBriefResult {
  return {
    answer: input.answer || "No exact booking was found.",
    booking: input.booking || null,
    intent: adminAiBookingBriefIntent,
    query,
    read_at: new Date().toISOString(),
    status: input.status || "not_found",
  };
}

function blockedResult(query: string): AdminAiBookingBriefExecution {
  return {
    data: result(query, {
      answer:
        "Ask AI can read one exact saved booking here. Use “Show booking 10912” or an exact ADM reference. Booking changes must use the existing confirmed Dispatch controls.",
      status: "blocked",
    }),
    matched: true,
    ok: true,
  };
}

function linkState(row: UnknownRecord, now: Date): AdminAiBookingBriefLink["state"] {
  if (safeDate(row.revoked_at) || cleanText(row.link_status, 40).toLowerCase() === "revoked") {
    return "revoked";
  }

  const expiresAt = safeDate(row.expires_at);
  if (
    cleanText(row.link_status, 40).toLowerCase() === "expired" ||
    !expiresAt ||
    isDriverJobLinkExpired(expiresAt, now) ||
    isDriverJobLinkExpiryOutsideAllowedWindow(expiresAt, now)
  ) {
    return "expired";
  }

  return "active";
}

function safeLink(rowValue: unknown, now: Date): AdminAiBookingBriefLink | null {
  const row = asRecord(rowValue);
  const bookingReference = cleanText(row.booking_reference, 120);
  const issuedAt = safeDate(row.issued_at) || safeDate(row.created_at);

  if (!bookingReference || !issuedAt) {
    return null;
  }

  const acknowledgedAt = safeDate(asRecord(row.safe_link_context).driver_acknowledged_at);

  return {
    acknowledgement_status: acknowledgedAt ? "acknowledged" : "pending",
    acknowledged_at: acknowledgedAt,
    issued_at: issuedAt,
    state: linkState(row, now),
  };
}

function statusEvidence(rows: unknown[]): AdminAiBookingBriefEvidence {
  const evidence: AdminAiBookingBriefEvidence = {
    job_completed_at: null,
    ots_at: null,
    otw_at: null,
    pob_at: null,
  };

  for (const rowValue of rows) {
    const row = asRecord(rowValue);
    const status = cleanText(row.status_value, 40).toLowerCase().replace(/[\s-]+/g, "_");
    const occurredAt = safeDate(row.occurred_at) || safeDate(row.created_at);

    if (!occurredAt) continue;
    if (!evidence.otw_at && ["otw", "driver_otw", "on_the_way"].includes(status)) {
      evidence.otw_at = occurredAt;
    } else if (!evidence.ots_at && ["ots", "on_the_spot", "arrived"].includes(status)) {
      evidence.ots_at = occurredAt;
    } else if (!evidence.pob_at && ["pob", "passenger_on_board", "on_boarded"].includes(status)) {
      evidence.pob_at = occurredAt;
    } else if (!evidence.job_completed_at && ["completed", "job_completed", "job_done"].includes(status)) {
      evidence.job_completed_at = occurredAt;
    }
  }

  return evidence;
}

export async function executeAdminAiBookingBrief(
  messageValue: unknown,
  context: AdminDispatcherBoundaryContext,
  client?: AdminAiBookingBriefClient,
): Promise<AdminAiBookingBriefExecution> {
  const parsed = parseBookingBrief(messageValue);

  if (!parsed) {
    return { matched: false };
  }

  if (parsed === "blocked") {
    return blockedResult(cleanText(messageValue, 500));
  }

  if (!validActor(context)) {
    return {
      error: "Live booking brief requires a verified Admin or Dispatcher session.",
      matched: true,
      ok: false,
      status: 403,
    };
  }

  if (!client && !validConfig()) {
    return { error: safeConfigError, matched: true, ok: false, status: 503 };
  }

  const database = client || createServerClient();
  const referenceColumn = parsed.kind === "public" ? "public_booking_reference" : "booking_reference";
  const { data: bookingData, error: bookingError } = await database
    .from("bookings")
    .select(bookingSelect)
    .eq(referenceColumn, parsed.reference)
    .order("id", { ascending: true })
    .limit(2);

  if (bookingError) {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }

  const exactRows = asArray(bookingData).map(asRecord);
  if (exactRows.length !== 1) {
    return {
      data: result(parsed.query, {
        answer: exactRows.length > 1
          ? `More than one saved booking matched ${parsed.reference}. No booking details were returned; load it manually in Dispatch.`
          : `No exact saved booking ${parsed.reference} was found. No booking details were returned.`,
        status: exactRows.length > 1 ? "ambiguous" : "not_found",
      }),
      matched: true,
      ok: true,
    };
  }

  const booking = exactRows[0];
  const bookingId = positiveInteger(booking.id);
  const customerId = positiveInteger(booking.customer_id);
  const companyId = positiveInteger(booking.company_id);
  const bookerId = positiveInteger(booking.booker_id);
  const travellerId = positiveInteger(booking.traveler_id);
  const bookingReference = cleanText(booking.booking_reference, 120);
  const publicReference = cleanText(booking.public_booking_reference, 40);

  if (!bookingId || !customerId || !companyId || !bookerId || !bookingReference || !publicReference) {
    return {
      data: result(parsed.query, {
        answer:
          `Booking ${publicReference || parsed.reference} has missing Customer, Company, or Booker identity. Open it manually in Dispatch and verify the exact Company + Booker; no operational details were returned.`,
        status: "identity_review",
      }),
      matched: true,
      ok: true,
    };
  }

  const [companyRead, customerRead, bookerRead, travellerRead] = await Promise.all([
    database.from("companies").select("id, company_name").eq("id", companyId).limit(2),
    database.from("customers").select("id, account_status, status").eq("id", customerId).limit(2),
    database
      .from("bookers")
      .select("id, company_id, customer_id, booker_name")
      .eq("id", bookerId)
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .limit(2),
    travellerId
      ? database
          .from("travelers")
          .select("id, company_id, booker_id, traveler_name")
          .eq("id", travellerId)
          .eq("company_id", companyId)
          .eq("booker_id", bookerId)
          .limit(2)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (companyRead.error || customerRead.error || bookerRead.error || travellerRead.error) {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }

  const companyRows = asArray(companyRead.data).map(asRecord);
  const customerRows = asArray(customerRead.data).map(asRecord);
  const bookerRows = asArray(bookerRead.data).map(asRecord);
  const travellerRows = asArray(travellerRead.data).map(asRecord);
  const companyName = cleanText(companyRows[0]?.company_name, 160);
  const bookerName = cleanText(bookerRows[0]?.booker_name, 160);
  const customerStatus = cleanText(customerRows[0]?.status, 40).toLowerCase();
  const customerAccountStatus = cleanText(customerRows[0]?.account_status, 40).toLowerCase();
  const travellerName = travellerId ? cleanText(travellerRows[0]?.traveler_name, 160) : "";
  const exactIdentity =
    companyRows.length === 1 &&
    customerRows.length === 1 &&
    bookerRows.length === 1 &&
    companyName &&
    bookerName &&
    customerStatus === "active" &&
    customerAccountStatus === "active" &&
    (!travellerId || (travellerRows.length === 1 && travellerName));

  if (!exactIdentity) {
    return {
      data: result(parsed.query, {
        answer:
          `Booking ${publicReference} does not have one verified active Customer + Company + Booker pair${travellerId ? " and matching Traveller" : ""}. Open it manually in Dispatch; no operational details were returned.`,
        status: "identity_review",
      }),
      matched: true,
      ok: true,
    };
  }

  const [linkRead, statusRead] = await Promise.all([
    database
      .from("driver_job_links")
      .select(linkSelect)
      .eq("booking_reference", bookingReference)
      .order("created_at", { ascending: false })
      .limit(1),
    database
      .from("driver_job_status_events")
      .select(statusSelect)
      .eq("booking_reference", bookingReference)
      .order("occurred_at", { ascending: false })
      .limit(25),
  ]);

  if (linkRead.error || statusRead.error) {
    return { error: safeReadError, matched: true, ok: false, status: 500 };
  }

  const now = new Date();
  const linkRows = asArray(linkRead.data);
  const serviceType =
    cleanText(booking.service_type, 80) || cleanText(booking.booking_type, 80) || "Not recorded";
  const pickupAt = safeDate(booking.pickup_at) || safeDate(booking.pickup_datetime);
  const pickupLocation =
    cleanText(booking.pickup_location, 300) || cleanText(booking.pickup_address, 300) || null;
  const dropoffLocation =
    cleanText(booking.dropoff_location, 300) || cleanText(booking.dropoff_address, 300) || null;
  const route =
    cleanText(booking.route_summary, 500) ||
    cleanText(booking.route, 500) ||
    (pickupLocation && dropoffLocation ? `${pickupLocation} > ${dropoffLocation}` : null);
  const persistedStatus =
    cleanText(booking.admin_internal_status, 120) ||
    cleanText(booking.status, 120) ||
    cleanText(booking.customer_facing_status, 120) ||
    "Not recorded";

  const safeBooking: AdminAiBookingBriefRecord = {
    assigned_driver_name: cleanText(booking.driver_name, 160) || null,
    assigned_driver_plate: cleanText(booking.driver_plate_number, 80) || null,
    booker_id: bookerId,
    booker_name: bookerName,
    booking_reference: bookingReference,
    company_id: companyId,
    company_name: companyName,
    customer_id: customerId,
    dropoff_location: dropoffLocation,
    evidence: statusEvidence(asArray(statusRead.data)),
    latest_driver_job_link: linkRows.length > 0 ? safeLink(linkRows[0], now) : null,
    open_customer_path: `/customers/${customerId}?name=${encodeURIComponent(companyName)}`,
    persisted_status: persistedStatus,
    pickup_at: pickupAt || cleanText(booking.pickup_time, 100) || null,
    pickup_location: pickupLocation,
    public_booking_reference: publicReference,
    route,
    service_type: serviceType,
    traveller_id: travellerId,
    traveller_name: travellerName || null,
  };

  return {
    data: result(parsed.query, {
      answer: `Booking ${publicReference} loaded as a read-only operational brief.`,
      booking: safeBooking,
      status: "results",
    }),
    matched: true,
    ok: true,
  };
}
